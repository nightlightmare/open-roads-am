# Spec 12 — Push Notifications

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Timely notifications are critical to the core feedback loop of open-road.am. When a citizen reports a pothole, they need to know that something is happening — that a moderator reviewed their report, that the city marked it "in progress", that it was eventually resolved. Without notifications, users submit a report and never come back. Moderators, in turn, need to know immediately when new reports arrive so the moderation queue doesn't stall.

Armenia has specific messaging habits: Telegram is the dominant messenger (far ahead of email open rates), so Telegram is the primary notification channel. Email, web push, and mobile push serve as supplementary channels for users who prefer them or don't use Telegram.

**Goal:** deliver the right notification to the right person within 5 seconds of the triggering event, without ever blocking the API response that caused the event.

---

## Notification Channels

| Channel | Priority | Dependency | Status |
|---|---|---|---|
| Telegram bot | Primary | Bot token (`TELEGRAM_BOT_TOKEN`) | v1 |
| Email | Secondary | Resend API key (`RESEND_API_KEY`) | v1 |
| Web push | Tertiary | VAPID keys, service worker | v1 |
| Mobile push (Expo) | Future | Expo Push token | v2 (when mobile app ships) |

### Why Telegram first

- ~70% of Armenian internet users have Telegram installed
- Instant delivery, no spam folder
- Rich formatting (Markdown), inline buttons, map links
- Bot API is free, reliable, and well-documented
- No app installation required beyond what users already have

### Why not just email

- Email open rates in CIS/Armenia are notoriously low (~15-20%)
- Delivery to Gmail/Mail.ru can be delayed by minutes
- Email is still offered for formal notifications (status changes, account actions)

---

## Notification Events

### For Moderators (`role = moderator | admin`)

| Event ID | Trigger | Channels | Priority |
|---|---|---|---|
| `report.new` | New report created (status → `pending_review`) | Telegram, Web push | High |
| `lease.expiring` | Moderator's report lock expires in 2 min | Telegram | Medium |

**`report.new` message content:**
- Problem type (user-selected)
- Truncated description (first 100 chars)
- Human-readable address (`address_raw`)
- Link to moderation page: `https://open-road.am/mod/reports/{id}`
- Photo thumbnail (Telegram supports inline images)

### For Report Author

| Event ID | Trigger | Channels | Priority |
|---|---|---|---|
| `report.approved` | Moderator approved their report | Telegram, Email | High |
| `report.in_progress` | Gov agency marked report as `in_progress` | Telegram, Email | High |
| `report.resolved` | Report marked as `resolved` | Telegram, Email | High |
| `report.rejected` | Report rejected by moderator | Telegram, Email | High |
| `report.confirmed` | Report reached confirmation milestone (5, 10, 25) | Telegram | Medium |

**`report.approved` message content:**
- "Your report has been approved and is now visible on the map."
- Problem type (final)
- Human-readable address
- Link to public report page: `https://open-road.am/reports/{id}`

**`report.rejected` message content:**
- "Your report was not approved."
- Generic rejection category (e.g., "duplicate", "not a road problem", "unclear photo") — **never** the moderator's free-text rejection reason (see Security section)
- Link to submit a new report

**`report.confirmed` message content:**
- "Your report was confirmed by {count} other users!"
- Link to the report

### For Subscribed Users (see Spec 16 — Area Subscriptions)

| Event ID | Trigger | Channels | Priority |
|---|---|---|---|
| `area.new_report` | New approved report in subscribed area | Telegram, Email (digest) | Low |

**Decision:** Area notifications are batched — at most one notification per area per hour, summarizing new reports. This prevents notification fatigue in high-activity areas.

---

## User Preferences

### Database Table: `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,        -- 'telegram' | 'email' | 'web_push' | 'mobile_push'
  event_type  TEXT NOT NULL,        -- event IDs from the table above
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, channel, event_type)
);

CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);
```

### Prisma Schema

```prisma
model NotificationPreference {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  channel   String   // telegram | email | web_push | mobile_push
  eventType String   @map("event_type")
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, channel, eventType])
  @@index([userId])
  @@map("notification_preferences")
}
```

### Default Preferences

When a user first visits the notification settings page (or when a preference row doesn't exist), defaults are applied:

| Channel | Event | Default |
|---|---|---|
| Telegram (if linked) | All events applicable to user's role | Enabled |
| Email | `report.approved`, `report.in_progress`, `report.resolved`, `report.rejected` | Enabled |
| Email | `report.confirmed`, `area.new_report` | Disabled |
| Web push | All events | Disabled (user must opt in via browser prompt) |
| Mobile push | All events | Disabled (until mobile app ships) |

**Implementation note:** Defaults are resolved at notification dispatch time, not by pre-populating rows. If no preference row exists for a `(user_id, channel, event_type)` tuple, the default from the table above applies. Rows are only created when a user explicitly changes a setting.

---

## Telegram Bot Setup

### Bot Configuration

```
Bot username: @OpenRoadAmBot
Bot token: env var TELEGRAM_BOT_TOKEN
Webhook URL: https://api.open-road.am/api/v1/webhooks/telegram
Webhook secret: env var TELEGRAM_WEBHOOK_SECRET
```

### Linking Flow

```
User visits Settings → Notifications → Telegram
  ↓
Frontend calls POST /api/v1/me/notifications/telegram/link
  ↓
API generates a unique link token (UUID), stores in Redis with 10-min TTL
  key: telegram:link:{token}  value: {userId}
  ↓
API returns deep link: https://t.me/OpenRoadAmBot?start={token}
  ↓
User clicks link → opens Telegram → sends /start {token}
  ↓
Bot webhook receives the message
  ↓
API looks up token in Redis → gets userId
  ↓
API creates telegram_links row (user_id, chat_id)
  ↓
Bot sends confirmation: "Connected! You'll receive notifications here."
  ↓
Frontend polls GET /api/v1/me/notifications/telegram/status (or uses SSE)
  ↓
Shows "Telegram connected" with unlink option
```

### Bot Commands

| Command | Description |
|---|---|
| `/start {token}` | Link Telegram account to open-road.am |
| `/stop` | Unlink and stop all notifications |
| `/status` | Show current link status and notification stats |
| `/help` | Show available commands |

### Message Formatting

Messages use Telegram's MarkdownV2 format:

```
📍 *New report near you*

*Type:* Pothole
*Address:* Abovyan St, Yerevan
*Description:* Large pothole blocking right lane\.\.\.

[View on map](https://open-road.am/reports/abc123)
```

For moderator notifications, inline keyboard buttons are included:

```json
{
  "inline_keyboard": [
    [
      { "text": "Review now", "url": "https://open-road.am/mod/reports/abc123" }
    ]
  ]
}
```

**Decision:** All action buttons are URL buttons (open in browser), not callback buttons. This avoids the need for complex bot-side state management and keeps the moderation flow in the web app where it belongs.

---

## Delivery Architecture

### Queue Design

A single BullMQ queue `notifications` handles all channels. Job data carries the channel type, and workers route accordingly.

```typescript
// apps/api/src/lib/notification-queue.ts

import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

export const QUEUE_NOTIFICATIONS = 'notifications'

export interface NotificationJobData {
  /** Target user's internal DB id */
  userId: string
  /** Notification channel */
  channel: 'telegram' | 'email' | 'web_push' | 'mobile_push'
  /** Event type identifier */
  eventType: string
  /** Channel-specific payload */
  payload: TelegramPayload | EmailPayload | WebPushPayload
  /** ISO timestamp of the triggering event */
  triggeredAt: string
}

export interface TelegramPayload {
  chatId: string
  text: string
  parseMode: 'MarkdownV2'
  replyMarkup?: Record<string, unknown>
  photoUrl?: string
}

export interface EmailPayload {
  to: string
  subject: string
  htmlBody: string
}

export interface WebPushPayload {
  subscription: PushSubscription
  title: string
  body: string
  url: string
  icon?: string
}

let notificationQueue: Queue<NotificationJobData> | undefined

export function getNotificationQueue(redis: Redis): Queue<NotificationJobData> {
  if (!notificationQueue) {
    notificationQueue = new Queue<NotificationJobData>(QUEUE_NOTIFICATIONS, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: { age: 7 * 24 * 3600 }, // keep 7 days
        removeOnFail: { age: 30 * 24 * 3600 },     // keep 30 days for debugging
      },
    })
  }
  return notificationQueue
}
```

### Event-to-Notification Flow

```
Report created (POST /api/v1/reports)
  ↓
redis.publish('events:moderation', { reportId, type: 'new' })    ← already exists
  ↓
Notification dispatcher listens on Redis pub/sub
  ↓
Dispatcher looks up: who needs to be notified? (moderators with role check)
  ↓
For each recipient × enabled channel:
  ↓
  enqueue job to BullMQ `notifications` queue
  ↓
Worker picks up job
  ↓
Worker calls channel-specific sender (Telegram API / Resend API / web-push lib)
  ↓
On success: log to notification_log
On failure: BullMQ retries with exponential backoff (3 attempts)
On permanent failure: log error, mark as failed in notification_log
```

### Notification Dispatcher

The dispatcher is a long-running process (or part of the existing worker) that subscribes to Redis events and fans out notifications:

```typescript
// apps/api/src/workers/notification-dispatcher.ts

import type { Redis } from 'ioredis'

export function startNotificationDispatcher(
  subscriber: Redis,
  notificationQueue: Queue<NotificationJobData>,
  db: NotificationRepository,
) {
  subscriber.subscribe(
    'events:moderation',
    'events:report-approved',
    'events:report-status-changed',
    'events:report-confirmed',
  )

  subscriber.on('message', async (channel, message) => {
    const event = JSON.parse(message)

    switch (channel) {
      case 'events:moderation':
        await dispatchModeratorNotifications(event, notificationQueue, db)
        break
      case 'events:report-status-changed':
        await dispatchAuthorNotification(event, notificationQueue, db)
        break
      case 'events:report-confirmed':
        await dispatchConfirmationMilestone(event, notificationQueue, db)
        break
    }
  })
}
```

### Rate Limiting

To prevent notification spam (e.g., a moderator approving 50 reports in a row for the same user):

```
Redis key: notifications:rate:{userId}
Type: sorted set (timestamps as scores)
Rule: max 10 notifications per user per rolling 60-second window
```

When the rate limit is hit, excess notifications are dropped (not queued). This is intentional — a user receiving 10 notifications in a minute already has plenty to look at.

**Implementation:**

```typescript
async function checkRateLimit(redis: Redis, userId: string): Promise<boolean> {
  const key = `notifications:rate:${userId}`
  const now = Date.now()
  const windowStart = now - 60_000

  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, windowStart)
  pipe.zcard(key)
  pipe.zadd(key, now, `${now}`)
  pipe.expire(key, 120)
  const results = await pipe.exec()

  const count = results?.[1]?.[1] as number
  return count < 10
}
```

---

## API Endpoints

All endpoints require Clerk JWT authentication.

### GET /api/v1/me/notifications/preferences

Returns the user's notification preferences, merged with defaults for any missing rows.

**Response `200 OK`:**

```json
{
  "preferences": [
    {
      "channel": "telegram",
      "eventType": "report.approved",
      "enabled": true,
      "isDefault": false
    },
    {
      "channel": "email",
      "eventType": "report.approved",
      "enabled": true,
      "isDefault": true
    },
    {
      "channel": "web_push",
      "eventType": "report.approved",
      "enabled": false,
      "isDefault": true
    }
  ],
  "channels": {
    "telegram": { "linked": true, "linkedAt": "2026-03-15T10:00:00Z" },
    "email": { "available": true },
    "web_push": { "subscribed": false },
    "mobile_push": { "available": false }
  }
}
```

The `isDefault` flag tells the frontend whether this value was explicitly set by the user or inferred from defaults. This matters for the UI — default values should show as "recommended" rather than "you chose this".

---

### PUT /api/v1/me/notifications/preferences

Updates one or more preference rows. Creates rows for previously-default values.

**Request body (Zod schema):**

```typescript
const UpdatePreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      channel: z.enum(['telegram', 'email', 'web_push', 'mobile_push']),
      eventType: z.string().min(1).max(100),
      enabled: z.boolean(),
    })
  ).min(1).max(50),
})
```

**Response `200 OK`:**

```json
{
  "updated": 3
}
```

**Validation rules:**
- Cannot enable Telegram notifications if Telegram is not linked (returns `400`)
- Cannot enable web push if no push subscription exists (returns `400`)
- Event types are validated against a known list (returns `400` for unknown events)
- Moderator-only events cannot be enabled by non-moderators (silently ignored)

---

### POST /api/v1/me/notifications/telegram/link

Generates a Telegram deep link for account linking.

**Response `200 OK`:**

```json
{
  "deepLink": "https://t.me/OpenRoadAmBot?start=a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "expiresIn": 600
}
```

The token is stored in Redis with a 10-minute TTL. Calling this endpoint again invalidates the previous token.

---

### DELETE /api/v1/me/notifications/telegram/unlink

Removes the Telegram link and disables all Telegram notifications.

**Response `200 OK`:**

```json
{
  "unlinked": true
}
```

Side effects:
- Deletes the `telegram_links` row
- Sets all `notification_preferences` rows with `channel = 'telegram'` to `enabled = false`
- Bot sends a farewell message to the chat: "Notifications disabled. You can re-link anytime from open-road.am settings."

---

### GET /api/v1/me/notifications/telegram/status

Returns whether Telegram is linked. Used by the frontend to poll after the user clicks the deep link.

**Response `200 OK`:**

```json
{
  "linked": true,
  "linkedAt": "2026-03-15T10:00:00Z"
}
```

---

### POST /api/v1/webhooks/telegram

Receives updates from Telegram Bot API. This is a public endpoint (no Clerk auth), but is protected by the webhook secret token.

**Verification:** The `X-Telegram-Bot-Api-Secret-Token` header must match `TELEGRAM_WEBHOOK_SECRET`.

**Not rate-limited by our middleware** — Telegram controls the request rate.

---

## Database Changes

### Table: `telegram_links`

```sql
CREATE TABLE telegram_links (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id   BIGINT NOT NULL,
  username  TEXT,             -- Telegram username, if available
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id),           -- one Telegram account per user
  UNIQUE(chat_id)            -- one user per Telegram account
);
```

### Prisma Schema

```prisma
model TelegramLink {
  id       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId   String   @unique @map("user_id") @db.Uuid
  chatId   BigInt   @unique @map("chat_id")
  username String?
  linkedAt DateTime @default(now()) @map("linked_at") @db.Timestamptz()

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("telegram_links")
}
```

### Table: `notification_log`

Tracks every notification delivery attempt for debugging, analytics, and rate limiting audits.

```sql
CREATE TABLE notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  status      TEXT NOT NULL,         -- 'delivered' | 'failed' | 'rate_limited' | 'skipped'
  error       TEXT,                  -- error message on failure (internal only, never exposed)
  report_id   UUID REFERENCES reports(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_log_user ON notification_log(user_id, created_at DESC);
CREATE INDEX idx_notification_log_status ON notification_log(status) WHERE status = 'failed';
```

### Prisma Schema

```prisma
model NotificationLog {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  channel   String
  eventType String   @map("event_type")
  status    String   // delivered | failed | rate_limited | skipped
  error     String?
  reportId  String?  @map("report_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  report Report? @relation(fields: [reportId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
  @@map("notification_log")
}
```

### Table: `web_push_subscriptions`

Stores Web Push API subscription objects for each user/browser.

```sql
CREATE TABLE web_push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  keys_p256dh  TEXT NOT NULL,
  keys_auth    TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_web_push_subscriptions_user ON web_push_subscriptions(user_id);
```

---

## Security

### Telegram Webhook Verification

Every incoming request to `/api/v1/webhooks/telegram` must include the `X-Telegram-Bot-Api-Secret-Token` header matching the `TELEGRAM_WEBHOOK_SECRET` environment variable. Requests without a valid token receive `403 Forbidden` with no body.

```typescript
fastify.addHook('preHandler', async (request, reply) => {
  const secret = request.headers['x-telegram-bot-api-secret-token']
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return reply.code(403).send()
  }
})
```

### No Sensitive Data in Notifications

Notification messages must **never** include:

- GPS coordinates (latitude/longitude) — use human-readable address only
- Moderator's free-text rejection reason — use a generic rejection category instead
- User email addresses or phone numbers
- Internal IDs in visible text (UUIDs in URLs are acceptable)
- AI confidence scores or raw AI responses

**Rationale:** Telegram messages can be forwarded, screenshotted, and shared. Treat every notification message as potentially public.

### Email Security

- Every email includes an unsubscribe link: `https://open-road.am/settings/notifications?unsubscribe={token}`
- The unsubscribe token is a signed JWT (HS256, 30-day expiry) containing `userId` and `eventType`
- One-click unsubscribe via `List-Unsubscribe` header (RFC 8058) for email clients that support it
- Emails are sent from `notifications@open-road.am` with proper SPF, DKIM, and DMARC records

### Link Token Security

- Telegram link tokens are single-use UUIDs stored in Redis with 10-minute TTL
- After successful linking, the token is immediately deleted
- Tokens cannot be reused — repeated `/start` with the same token returns "Link expired"

### Bot Abuse Prevention

- The webhook endpoint does not respond to messages from unlinked users (except `/start` with a valid token)
- Unknown commands receive a generic help message, no error details
- The bot does not echo back any user input (prevents injection into logs)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes (v1) | Bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes (v1) | Random secret for webhook verification |
| `RESEND_API_KEY` | Yes (v1) | API key for Resend email service |
| `RESEND_FROM_EMAIL` | Yes (v1) | Sender address, e.g. `notifications@open-road.am` |
| `VAPID_PUBLIC_KEY` | Yes (v1) | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | Yes (v1) | VAPID private key for Web Push |
| `VAPID_SUBJECT` | Yes (v1) | VAPID subject, e.g. `mailto:admin@open-road.am` |

---

## Testing

### Unit Tests

- Notification dispatcher: verify correct events produce correct job payloads
- Rate limiter: verify window logic, edge cases (exactly 10, burst of 20)
- Preference resolution: verify defaults are applied correctly when no row exists
- Telegram message formatting: verify MarkdownV2 escaping of special characters

### Integration Tests

- Full flow: create report → verify notification job enqueued for moderators
- Telegram link flow: generate token → simulate webhook → verify `telegram_links` row
- Preference update: change setting → verify next notification respects it
- Rate limiting: send 15 notifications in 1 minute → verify only 10 delivered

### E2E Tests

- Telegram webhook endpoint: valid secret → 200, invalid secret → 403
- Preferences API: GET returns defaults, PUT updates, GET reflects changes
- Telegram link/unlink lifecycle

---

## Out of Scope for v1

- **In-app notification center** — a list of past notifications within the web app. Planned for v2 alongside the notification log viewer.
- **Notification digests** — daily/weekly email summaries. Only area subscription batching (1/hour) is in v1.
- **SMS notifications** — not cost-effective for Armenia; Telegram covers the same use case better.
- **Moderator shift scheduling** — notifications go to all moderators; smart routing based on availability is v2.
- **Notification templates in DB** — message templates are hardcoded in v1. A template system (editable by admins) is a v2 enhancement.
- **Read receipts / delivery confirmation** — the `notification_log` tracks delivery status from our side, but not whether the user actually saw the message.
- **Expo Push Notifications** — will be implemented when the mobile app (Spec TBD) reaches beta. The `mobile_push` channel and `NotificationPreference` rows are already accounted for in the schema.
- **Rich email templates** — v1 emails use plain HTML. Branded templates with react-email are planned for v2.
