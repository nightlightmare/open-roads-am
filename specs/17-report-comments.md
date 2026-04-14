# Spec 17 — Report Comments

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Report comments add a community discussion layer to approved reports. Residents can provide additional context ("this pothole has been here since last winter"), share observations ("the city put up a warning cone but hasn't fixed it"), or simply signal agreement. Comments strengthen the evidentiary case for a report and increase civic engagement.

Comments are moderated — moderators can hide inappropriate content, and report authors can delete their own comments within a short grace period. Threading (replies) and reactions are deferred to v2 to keep the initial implementation simple and maintainable.

**Goal:** Enable flat, moderated comment threads on approved/in_progress/resolved reports, with a focus on simplicity, anti-abuse protections, and minimal moderator overhead.

---

## Who Can Comment

| User State | Can Comment? | Notes |
|---|---|---|
| Authenticated, not banned | Yes | On `approved`, `in_progress`, `resolved` reports |
| Moderator / Admin | Yes | On any status (can comment on `pending_review`, `under_review`, `rejected` for internal notes) |
| Banned user (`is_banned = true`) | No | Returns `403 FORBIDDEN` |
| Unauthenticated | No | Returns `401 UNAUTHORIZED` |

### Commentable Report Statuses

| Report Status | Regular Users | Moderators/Admins |
|---|---|---|
| `pending_review` | No | Yes |
| `under_review` | No | Yes |
| `approved` | Yes | Yes |
| `in_progress` | Yes | Yes |
| `resolved` | Yes | Yes |
| `rejected` | No | Yes |
| `archived` | No | No |

**Rationale:** Regular users should only interact with reports that are publicly visible (approved and beyond). Moderators may need to leave internal notes during the review process. Nobody comments on archived reports — they are historical records.

---

## Database

### Table: `report_comments`

```sql
CREATE TABLE report_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  is_hidden   BOOLEAN NOT NULL DEFAULT false,
  hidden_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  hidden_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- constraints
  CONSTRAINT body_min_length CHECK (char_length(body) >= 10),
  CONSTRAINT body_max_length CHECK (char_length(body) <= 500),
  CONSTRAINT hidden_fields_consistent CHECK (
    (is_hidden = false AND hidden_by IS NULL AND hidden_at IS NULL)
    OR (is_hidden = true AND hidden_by IS NOT NULL AND hidden_at IS NOT NULL)
  )
);
```

### Indexes

```sql
-- Fetch comments for a report (paginated, ordered by time)
CREATE INDEX idx_report_comments_report ON report_comments(report_id, created_at ASC)
  WHERE is_hidden = false;

-- Fetch all comments by a user (for user profile / admin review)
CREATE INDEX idx_report_comments_user ON report_comments(user_id, created_at DESC);

-- Moderation: find hidden comments
CREATE INDEX idx_report_comments_hidden ON report_comments(hidden_at DESC)
  WHERE is_hidden = true;
```

### Prisma Schema

```prisma
model ReportComment {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  reportId  String    @map("report_id") @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  body      String
  isHidden  Boolean   @default(false) @map("is_hidden")
  hiddenBy  String?   @map("hidden_by") @db.Uuid
  hiddenAt  DateTime? @map("hidden_at") @db.Timestamptz()
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  report     Report @relation(fields: [reportId], references: [id], onDelete: Cascade)
  user       User   @relation("comment_author", fields: [userId], references: [id], onDelete: Cascade)
  hiddenByUser User? @relation("comment_hider", fields: [hiddenBy], references: [id], onDelete: SetNull)

  @@index([reportId, createdAt])
  @@index([userId, createdAt(sort: Desc)])
  @@map("report_comments")
}
```

### Denormalized Comment Count

Add a `comment_count` column to the `reports` table:

```sql
ALTER TABLE reports ADD COLUMN comment_count INT NOT NULL DEFAULT 0;
```

Updated via application logic on comment creation/deletion/hiding. Used by the public map API and report list to show comment count badges without a JOIN.

---

## Moderation

### Hiding Comments (Soft Delete)

Moderators can hide any comment. Hidden comments remain in the database for audit purposes but are replaced with a placeholder in the public API.

**Who can hide:**
- Users with role `moderator` or `admin`
- The comment author cannot hide their own comment (they can delete within 5 minutes — see below)

**What happens on hide:**
1. `is_hidden = true`
2. `hidden_by = moderator's user_id`
3. `hidden_at = now()`
4. `reports.comment_count` decremented by 1
5. The `body` text is preserved in the database (for audit) but never returned via public API

**What the public sees:** Hidden comments are replaced with:
```json
{
  "id": "uuid",
  "isHidden": true,
  "body": null,
  "displayName": null,
  "createdAt": "2026-04-10T08:00:00Z"
}
```

The placeholder preserves the comment's position in the timeline (so subsequent comments don't look disjointed) but reveals no information about the author or content.

### Author Self-Deletion (Hard Delete)

The comment author can delete their own comment within **5 minutes** of posting. After 5 minutes, the comment is permanent (only moderators can hide it).

**Why 5 minutes?** Balances "oops, typo" corrections with discussion integrity. If comments could be deleted at any time, users could post inflammatory content and then delete the evidence.

**What happens on delete:**
1. Hard DELETE from `report_comments`
2. `reports.comment_count` decremented by 1
3. No audit trail (the comment never existed from the system's perspective)

### Moderator Override — Unhiding

Admins can unhide a previously hidden comment via the moderation dashboard. This resets `is_hidden = false`, `hidden_by = null`, `hidden_at = null`, and increments `comment_count`.

---

## API Endpoints

### GET /api/v1/public/reports/:id/comments

Public endpoint — no authentication required. Returns comments for an approved report, paginated.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor (comment `created_at` timestamp) |
| `limit` | number | 20 | Max 50 |
| `order` | string | `asc` | `asc` (oldest first) or `desc` (newest first) |

**Response `200 OK`:**

```json
{
  "comments": [
    {
      "id": "uuid",
      "body": "This pothole has been here since January.",
      "isHidden": false,
      "author": {
        "displayName": "Armen G.",
        "avatarUrl": "https://img.clerk.com/...",
        "isReportAuthor": true
      },
      "createdAt": "2026-04-10T08:30:00Z"
    },
    {
      "id": "uuid",
      "body": null,
      "isHidden": true,
      "author": null,
      "createdAt": "2026-04-10T09:15:00Z"
    },
    {
      "id": "uuid",
      "body": "City workers were seen inspecting this morning.",
      "isHidden": false,
      "author": {
        "displayName": "Marina K.",
        "avatarUrl": "https://img.clerk.com/...",
        "isReportAuthor": false
      },
      "createdAt": "2026-04-10T10:00:00Z"
    }
  ],
  "cursor": "2026-04-10T10:00:00Z",
  "hasMore": false,
  "total": 3
}
```

**Notes:**
- Hidden comments appear in the list as placeholders (to preserve timeline continuity) but with `body: null` and `author: null`
- `isReportAuthor` flag allows the frontend to show a badge like "Author" next to the report creator's comments
- `avatarUrl` is fetched from Clerk user data (cached in the `users` table or resolved at query time)
- Reports that are not in a publicly visible status (`approved`, `in_progress`, `resolved`) return `404` for this endpoint

**Rate limiting:** 30 requests/minute per IP (public endpoint)

---

### POST /api/v1/reports/:id/comments

Creates a new comment on a report. Requires Clerk JWT.

**Request body (Zod schema):**

```typescript
const CreateCommentSchema = z.object({
  body: z.string()
    .min(10, 'Comment must be at least 10 characters')
    .max(500, 'Comment must be at most 500 characters')
    .transform(s => s.trim()),
})
```

**Processing:**

1. Validate JWT, extract `userId`
2. Check user is not banned (`is_banned = false`)
3. Validate report exists and is in a commentable status (see table above)
4. Validate request body with Zod
5. **Duplicate check:** Compare `body` hash with the user's last comment on the same report. If identical, return `409 CONFLICT` with message "Duplicate comment"
6. **Rate limit check:** Redis sliding window — max 10 comments per user per hour
7. INSERT into `report_comments`
8. Increment `reports.comment_count`
9. Enqueue notification to report author (if commenter is not the author) — see Notifications section

**Response `201 Created`:**

```json
{
  "id": "uuid",
  "body": "This pothole has been here since January.",
  "createdAt": "2026-04-10T08:30:00Z",
  "canDelete": true,
  "deleteExpiresAt": "2026-04-10T08:35:00Z"
}
```

The `canDelete` flag and `deleteExpiresAt` tell the frontend when the delete button should disappear.

**Error responses:**

| Code | Condition |
|---|---|
| `400` | Body too short (<10 chars) or too long (>500 chars) |
| `401` | No JWT |
| `403` | User is banned |
| `404` | Report not found or not in commentable status |
| `409` | Duplicate comment (same body as user's last comment on this report) |
| `429` | Rate limit exceeded (10 comments/hour) |

---

### DELETE /api/v1/reports/:id/comments/:comment_id

Deletes a comment. Two cases:

1. **Author self-delete:** The comment author can delete within 5 minutes of `created_at`
2. **Moderator delete:** Moderators/admins can delete any comment at any time (this is a hard delete, distinct from hiding)

**Processing:**

1. Validate JWT, extract `userId` and `role`
2. Fetch the comment (return `404` if not found or belongs to a different report)
3. Authorization check:
   - If `userId == comment.userId` and `now() - comment.createdAt <= 5 minutes`: allowed (author self-delete)
   - If `role` is `moderator` or `admin`: allowed
   - Otherwise: `403 FORBIDDEN`
4. Hard DELETE from `report_comments`
5. Decrement `reports.comment_count` (only if the comment was not already hidden)

**Response `200 OK`:**

```json
{ "deleted": true }
```

**Error responses:**

| Code | Condition |
|---|---|
| `403` | Not the author (or past 5-min window) and not a moderator |
| `404` | Comment not found |

---

### POST /api/v1/moderation/comments/:comment_id/hide

Hides a comment. Requires moderator or admin role.

**Request body (Zod schema):**

```typescript
const HideCommentSchema = z.object({
  reason: z.string().max(200).optional(), // internal note, not shown to users
})
```

**Processing:**

1. Validate JWT, check role is `moderator` or `admin`
2. Fetch the comment (return `404` if not found)
3. If already hidden: return `200` (idempotent)
4. UPDATE: `is_hidden = true`, `hidden_by = userId`, `hidden_at = now()`
5. Decrement `reports.comment_count`

**Response `200 OK`:**

```json
{
  "id": "uuid",
  "isHidden": true,
  "hiddenAt": "2026-04-11T10:00:00Z"
}
```

---

### POST /api/v1/moderation/comments/:comment_id/unhide

Unhides a previously hidden comment. Requires admin role only (moderators cannot override other moderators' decisions).

**Processing:**

1. Validate JWT, check role is `admin`
2. Fetch the comment (return `404` if not found)
3. If not hidden: return `200` (idempotent)
4. UPDATE: `is_hidden = false`, `hidden_by = null`, `hidden_at = null`
5. Increment `reports.comment_count`

**Response `200 OK`:**

```json
{
  "id": "uuid",
  "isHidden": false
}
```

---

## Frontend

### Comment Section

Located below the report detail page (`/reports/:id`), visible when the report has status `approved`, `in_progress`, or `resolved`.

**Layout:**

```
┌──────────────────────────────────────────────┐
│  Comments (12)                               │
├──────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐ │
│  │ [Avatar] Armen G.  •  Author  •  2h ago │ │
│  │ This pothole has been here since        │ │
│  │ January. Very dangerous for cyclists.   │ │
│  │                              [🗑 Delete] │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ [Comment hidden by moderator]           │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ [Avatar] Marina K.  •  45m ago          │ │
│  │ City workers were seen inspecting this  │ │
│  │ morning.                                │ │
│  │                              [Hide] ← mod│ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ Write a comment...                      │ │
│  │                                         │ │
│  │                          230/500 [Post] │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  [Load more comments]                        │
└──────────────────────────────────────────────┘
```

### Comment Card

Each comment displays:

- **Avatar:** From Clerk user profile (via `avatarUrl`). Fallback: initials circle.
- **Display name:** From Clerk profile. If the user is the report author: show an "Author" badge.
- **Time:** Relative time ("2h ago", "yesterday"). Tooltip shows absolute timestamp.
- **Body:** Plain text, no markdown, no links (links are rendered as plain text to prevent spam).
- **Actions:**
  - Report author sees "Delete" button on their own comments (within 5 min). A countdown timer or "Delete (3:42 remaining)" text shows remaining time.
  - Moderators see a "Hide" button on all comments.
  - Admins see "Hide" and "Unhide" buttons as appropriate.

### Comment Textarea

- `<textarea>` with placeholder "Write a comment..."
- Character counter: "230/500" — turns red at 480+
- "Post" button disabled when: body < 10 chars, body > 500 chars, or request in-flight
- On successful post: optimistically insert the comment at the bottom of the list, clear the textarea
- On error: show inline error message below the textarea

### Unauthenticated State

If the user is not logged in, the textarea is replaced with:
```
Sign in to leave a comment
[Sign in with Clerk]
```

### Empty State

When a report has no comments:
```
No comments yet. Be the first to share your observation.
```

---

## Rate Limiting

### Comment Creation

```
Redis key: comments:rate:{userId}
Type: sorted set (timestamps as scores)
Rule: max 10 comments per user per rolling 60-minute window
```

This is stricter than normal API rate limits because comment creation has higher abuse potential. The limit is per-user, not per-report — a user spamming comments across multiple reports is still caught.

```typescript
async function checkCommentRateLimit(redis: Redis, userId: string): Promise<boolean> {
  const key = `comments:rate:${userId}`
  const now = Date.now()
  const windowStart = now - 3600_000 // 1 hour

  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, windowStart)
  pipe.zcard(key)
  pipe.zadd(key, now, `${now}`)
  pipe.expire(key, 7200) // 2 hour TTL on the key itself
  const results = await pipe.exec()

  const count = results?.[1]?.[1] as number
  return count < 10
}
```

### Public Endpoint Rate Limit

`GET /api/v1/public/reports/:id/comments` — 30 requests/minute per IP. Same rate limiting infrastructure as other public endpoints (Spec 04).

---

## Anti-Abuse Protections

### Banned Users

Users with `is_banned = true` cannot post comments. Checked at the application level before INSERT. Returns `403 FORBIDDEN` with generic message "You cannot perform this action."

### Minimum Comment Length

10 characters minimum, enforced both client-side (disabled "Post" button) and server-side (Zod validation + DB constraint). Prevents low-effort "+1" or emoji-only comments.

### Maximum Comment Length

500 characters maximum. Sufficient for a meaningful observation but prevents wall-of-text abuse. Enforced at all layers.

### Duplicate Prevention

Before inserting a new comment, compare the trimmed body with the user's most recent comment on the same report:

```typescript
const lastComment = await prisma.reportComment.findFirst({
  where: { reportId, userId },
  orderBy: { createdAt: 'desc' },
  select: { body: true },
})

if (lastComment && lastComment.body.trim() === body.trim()) {
  throw new AppError(409, 'DUPLICATE_COMMENT', 'You already posted this comment')
}
```

This prevents accidental double-submissions (network hiccup, user clicks "Post" twice) without being overly restrictive (the user can post the same text on different reports).

### No URL Rendering

Comment bodies are rendered as plain text. URLs in comments are displayed as-is (not clickable links). This discourages link spam without adding a URL detection/blocking system.

---

## Notifications

When a new comment is posted on a report, the report author is notified (unless the commenter IS the author).

### Event

| Event ID | Trigger | Channels | Priority |
|---|---|---|---|
| `report.commented` | New comment on user's report | Telegram, Email | Medium |

### Integration with Spec 12

Add `report.commented` to the notification events table in Spec 12.

**Default preferences:**
| Channel | Default |
|---|---|
| Telegram (if linked) | Enabled |
| Email | Disabled |
| Web push | Disabled |

**Notification content (Telegram):**

```
💬 New comment on your report

"{first 100 chars of comment body}..."

Report: Pothole — Abovyan St, Yerevan
View: https://open-road.am/reports/abc123#comments
```

**Batching:** If multiple comments arrive within 5 minutes for the same report, they are batched into a single notification:

```
💬 3 new comments on your report

Report: Pothole — Abovyan St, Yerevan
View: https://open-road.am/reports/abc123#comments
```

Implementation: Redis key `comment_notify:{reportId}:{authorId}` with 5-minute TTL. Same pattern as area subscription batching in Spec 16.

---

## Security

- Comment `body` is stored as plain text — no HTML, no markdown. The frontend must escape all output to prevent XSS.
- `hidden_by` is set server-side from the JWT, never from the request body
- Hidden comment bodies are never returned via the public API (even in the hidden placeholder response)
- The DELETE endpoint for author self-delete enforces the 5-minute window server-side (never trust client-provided timestamps)
- Moderator hide actions are logged in `report_comments` table (via `hidden_by`, `hidden_at`) for accountability
- No user PII (email, phone) is exposed in comment responses — only display name and avatar from Clerk

---

## Testing

### Unit Tests

- Zod schema validation: min length, max length, trim whitespace
- Commentable status check: verify each report status against user role
- Duplicate detection: same body → reject, different body → accept
- 5-minute deletion window: within window → allow, after window → deny
- Rate limit logic: 10th comment → allow, 11th → deny, after window expires → allow again

### Integration Tests

- Create comment on approved report → 201, comment appears in GET
- Create comment on rejected report (as regular user) → 404
- Create comment on rejected report (as moderator) → 201
- Banned user creates comment → 403
- Duplicate comment → 409
- Rate limit: 10 comments in quick succession → 11th returns 429
- Hide comment → GET shows placeholder
- Author delete within 5 min → 200, comment gone
- Author delete after 5 min → 403
- Moderator delete → 200 at any time
- Comment count denormalization: create → count +1, delete → count -1, hide → count -1

### E2E Tests

- Public comments endpoint: no auth required, returns comments for approved report
- Create + list flow: post comment → verify it appears in list
- Pagination: create 25 comments → verify cursor-based pagination works
- Hide/unhide flow (moderator): hide → placeholder shown → unhide → content restored

---

## Out of Scope for v1

- **Threading / replies** — flat comment list only. Reply support (with `parent_id` and indented display) is a v2 feature. The table schema does not include `parent_id` to keep v1 simple.
- **Reactions / upvotes** — no emoji reactions or upvote buttons on comments. Considered for v2 as a lightweight engagement signal.
- **Photos in comments** — users cannot attach photos to comments in v1. This would require additional R2 storage, moderation, and abuse handling. Deferred to v2.
- **Comment editing** — comments cannot be edited after posting. Users can delete (within 5 min) and repost. Editing introduces complexity (edit history, "edited" badge, moderation of edits). Deferred to v2.
- **Mentions / @tagging** — no user mentions in comments. Would require a user search API and notification routing. Deferred to v2.
- **Profanity filter** — no automated profanity detection in v1. Moderators handle inappropriate content manually via the hide action. Automated filtering (regex or ML-based) is a v2 enhancement.
- **Comment search** — no full-text search across comments. Not a priority for v1.
