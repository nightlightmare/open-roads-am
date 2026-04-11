# Spec 05 — Moderation Flow

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Moderators manually review submitted reports before they appear on the public map. The moderation interface shows the photo, user-selected category, AI-suggested category, location, and description. The moderator can approve, reject, or override the problem type. All actions are logged in `report_status_history`.

---

## Roles

| Role | Can do |
|---|---|
| `moderator` | Review, approve, reject, override problem type |
| `admin` | All moderator actions + re-open rejected reports |
| `gov_agency` | Cannot moderate — can only update status to `in_progress` / `resolved` |
| `user` | Cannot moderate |

---

## Moderation Queue

### `GET /api/v1/moderation/queue`

**Auth:** Clerk JWT, role `moderator` or `admin`

Returns reports awaiting review, ordered by `created_at ASC` (oldest first).

#### Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | string | `pending_review` | `pending_review` or `under_review` |
| `problem_type` | string | all | Filter by AI/user-suggested type |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 20 | Max 100 |

#### Response `200 OK`

```json
{
  "reports": [
    {
      "id": "uuid",
      "status": "pending_review",
      "problem_type_user": "pothole",
      "problem_type_ai": "pothole",
      "ai_confidence": 0.91,
      "description": "Глубокая выбоина...",
      "latitude": 40.1872,
      "longitude": 44.5152,
      "address_raw": "ул. Абовяна, Ереван",
      "photo_url": "https://imagedelivery.net/...",
      "photo_thumbnail_url": "https://imagedelivery.net/...",
      "confirmation_count": 0,
      "created_at": "2026-04-10T08:00:00Z"
    }
  ],
  "cursor": "opaque-or-null",
  "total_pending": 38
}
```

**Note:** `ai_confidence` and `problem_type_ai` are shown here (internal API only — never on public endpoints).

---

## Opening a Report for Review

### `POST /api/v1/moderation/reports/:id/open`

**Auth:** Clerk JWT, role `moderator` or `admin`

Transitions report from `pending_review` → `under_review`. Signals to other moderators that this report is being handled.

- If report is already `under_review` by another moderator: returns `409 CONFLICT` with `{ "moderator_display_name": "..." }` so the current moderator can skip it.
- If report is in any other status: returns `400 INVALID_TRANSITION`.

Records entry in `report_status_history`.

#### Response `200 OK`

```json
{ "id": "uuid", "status": "under_review" }
```

---

## Approving a Report

### `POST /api/v1/moderation/reports/:id/approve`

**Auth:** Clerk JWT, role `moderator` or `admin`

**Required transition:** `under_review` → `approved`

#### Request body

```typescript
{
  problem_type_final?: ProblemTypeEnum  // optional override of user's choice
  note?: string                         // optional internal note, max 500 chars
}
```

#### Processing

1. Validate transition is allowed
2. Validate `problem_type_final` is a valid enum value if provided
3. UPDATE `reports`:
   - `status = 'approved'`
   - `problem_type_final = problem_type_final` (null if not provided — user's choice stands)
   - `moderated_by = <current user id>`
   - `moderated_at = now()`
4. INSERT `report_status_history` row
5. Invalidate Redis cache for this report (`report:<id>`) and map area
6. Publish `events:report-approved` to Redis → triggers map cache invalidation

#### Response `200 OK`

```json
{ "id": "uuid", "status": "approved" }
```

---

## Rejecting a Report

### `POST /api/v1/moderation/reports/:id/reject`

**Auth:** Clerk JWT, role `moderator` or `admin`

**Required transition:** `under_review` → `rejected`

#### Request body

```typescript
{
  rejection_reason: string   // required, max 500 chars
}
```

Rejection reasons (free text, but UI should suggest):
- "Not a road problem"
- "Photo does not show the reported problem"
- "Duplicate report"
- "Outside service area"
- "Insufficient information"

#### Processing

1. Validate transition is allowed
2. Validate `rejection_reason` is present and non-empty
3. UPDATE `reports`: `status = 'rejected'`, `rejection_reason`, `moderated_by`, `moderated_at`
4. INSERT `report_status_history`
5. **Do not** expose `rejection_reason` publicly — internal only

#### Response `200 OK`

```json
{ "id": "uuid", "status": "rejected" }
```

---

## Overriding Problem Type

The moderator can set `problem_type_final` at approval time (see above). This is the only way to override the user's selection.

**Priority chain (canonical type):**

```
problem_type_final   ← moderator set this (highest priority)
  ↓ if null
problem_type_user    ← user's confirmed selection (default)
  ↓ if null (edge case: submission bug)
problem_type_ai      ← last resort
```

`problem_type_ai` is shown to the moderator for context but is never the canonical type on its own.

**What the moderator sees:**

```
Category selected by user:  [Pothole]
Category suggested by AI:   [Pothole]  (confidence: 91%)
Override category:          [dropdown, optional]
```

If user and AI agree → moderator can approve without touching the type.
If they disagree → moderator sees the discrepancy clearly and decides.

---

## Re-opening a Rejected Report

### `POST /api/v1/moderation/reports/:id/reopen`

**Auth:** Clerk JWT, role `admin` only

**Required transition:** `rejected` → `under_review`

#### Request body

```typescript
{
  note: string   // required — reason for re-opening
}
```

#### Response `200 OK`

```json
{ "id": "uuid", "status": "under_review" }
```

---

## Real-time Notifications (SSE)

### `GET /api/v1/moderation/feed`

**Auth:** Clerk JWT, role `moderator` or `admin`

Server-Sent Events stream. The client connects on moderator dashboard load and stays connected.

#### Events

**`new_report`** — emitted when a new report reaches `pending_review`:
```json
{
  "event": "new_report",
  "report_id": "uuid",
  "problem_type_user": "pothole",
  "created_at": "2026-04-11T10:00:00Z"
}
```

**`queue_count`** — emitted every 60 seconds with current queue size (keeps connection alive + updates badge):
```json
{
  "event": "queue_count",
  "pending": 12,
  "under_review": 3
}
```

#### Implementation

- Redis pub/sub → SSE fan-out
- No event persistence — if moderator is offline, they see the queue on next login
- Heartbeat comment (`: keepalive`) sent every 30 seconds to prevent proxy timeouts
- Max 10 simultaneous SSE connections per server instance (Fastify limit)

---

## Gov Agency Status Updates

Gov agency users (`role = gov_agency`) cannot moderate but can update status on approved reports.

### `POST /api/v1/reports/:id/status`

**Auth:** Clerk JWT, role `gov_agency` or `admin`

#### Request body

```typescript
{
  status: 'in_progress' | 'resolved'
  note?: string   // optional, shown in public status history
}
```

#### Allowed transitions

```
approved    → in_progress   (gov agency acknowledges)
in_progress → resolved      (gov agency marks fixed)
```

No other transitions allowed for this role.

#### Processing

1. Validate transition
2. UPDATE `reports`: `status`, `updated_at`
3. INSERT `report_status_history` (with `note` if provided — this note IS shown publicly)
4. Invalidate Redis cache

#### Response `200 OK`

```json
{ "id": "uuid", "status": "in_progress" }
```

---

## Automated Archiving (Cron)

Two archiving rules run daily at 03:00 AM Yerevan time:

| Condition | Action |
|---|---|
| `status = resolved` AND `resolved_at < now() - 90 days` | → `archived` |
| `status = approved` AND `updated_at < now() - 365 days` (no gov action) | → `archived` |

Archived reports are excluded from the moderation queue and map by default but remain in the DB and are accessible via `GET /api/v1/public/reports/:id`.

---

## Security

- All moderation endpoints require JWT + role check — both enforced, not just one
- `moderated_by` is set server-side from the JWT, never from the request body
- `rejection_reason` stored in DB but never returned via public API
- `problem_type_ai`, `ai_confidence`, `ai_raw_response` visible in moderation API only
- Moderator cannot approve/reject a report they didn't open (must be in `under_review` by them) — **soft check in v1**: warn if opened by another moderator, but don't hard-block (avoids deadlock if moderator closes browser without releasing)
- All state transitions validated server-side against the allowed state machine from Spec 01

---

## Out of Scope (v1)

- AI-assisted auto-approval (high confidence + matching types → skip queue)
- Moderator assignment / locking (report reserved for a specific moderator)
- Bulk moderation actions
- User notification when their report is approved or rejected
- Moderator performance metrics / dashboard
