# Spec 08 — User Profile

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

The user profile section gives authenticated users visibility into their own activity: submitted reports and confirmed reports. No social features — profiles are private, visible only to the owner.

---

## Design Principles

- **Private by default** — a user can only see their own data. No public user profiles.
- **Read-heavy** — all endpoints are GET. Profile data is cached per user.
- **Minimal data** — the profile surface is intentionally small in v1. The goal is to show the user their impact, not build a social feed.

---

## Endpoints

All endpoints require Clerk JWT. A user can only access their own profile — no `user_id` path param (always derived from the JWT).

---

### `GET /api/v1/me`

Returns the current user's profile and summary stats.

#### Response `200 OK`

```json
{
  "clerk_id": "user_xxxxxxxxxxxxxxxx",
  "display_name": "Anna M.",
  "role": "user",
  "stats": {
    "reports_submitted": 14,
    "reports_approved": 11,
    "reports_resolved": 3,
    "confirmations_given": 27
  },
  "member_since": "2026-03-01T00:00:00Z"
}
```

**Not included:** `is_banned`, `reports_today`, internal fields.

Stats are computed from the DB and cached in Redis:
- Key: `cache:profile:stats:<clerk_id>`
- TTL: 5 minutes

---

### `GET /api/v1/me/reports`

Returns the user's submitted reports, newest first.

#### Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | string | all | Filter: `pending_review`, `approved`, `in_progress`, `resolved`, `rejected` |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 20 | Max 100 |

#### Response `200 OK`

```json
{
  "reports": [
    {
      "id": "uuid",
      "status": "approved",
      "problem_type": "pothole",
      "address_raw": "ул. Абовяна, Ереван",
      "photo_thumbnail_url": "https://imagedelivery.net/...",
      "confirmation_count": 4,
      "created_at": "2026-04-10T08:00:00Z",
      "status_updated_at": "2026-04-11T10:00:00Z"
    }
  ],
  "cursor": "opaque-or-null"
}
```

**Rejected reports are included** — the user should know their report was rejected. `rejection_reason` is **not** included — users don't need the internal moderator note, it's enough to know the status.

`problem_type` = `COALESCE(problem_type_final, problem_type_user)` — canonical type.

---

### `GET /api/v1/me/reports/:id`

Returns full detail of one of the user's reports. Includes fields not shown on the public map.

**Auth check:** report must belong to the requesting user — return `404` (not `403`) if it belongs to someone else. Do not leak existence of other users' reports.

#### Response `200 OK`

```json
{
  "id": "uuid",
  "status": "in_progress",
  "problem_type": "pothole",
  "problem_type_user": "pothole",
  "problem_type_ai": "pothole",
  "ai_confidence": 0.91,
  "description": "Глубокая выбоина...",
  "latitude": 40.1872,
  "longitude": 44.5152,
  "address_raw": "ул. Абовяна, Ереван",
  "photo_url": "https://imagedelivery.net/...",
  "photo_thumbnail_url": "https://imagedelivery.net/...",
  "confirmation_count": 7,
  "status_history": [
    { "status": "approved", "changed_at": "2026-04-10T09:00:00Z", "note": null },
    { "status": "in_progress", "changed_at": "2026-04-11T14:00:00Z", "note": "Передано в MTAI" }
  ],
  "created_at": "2026-04-10T08:00:00Z",
  "updated_at": "2026-04-11T14:00:00Z"
}
```

**Shown to the report owner (not on public API):**
- `problem_type_user` — what they selected
- `problem_type_ai` + `ai_confidence` — what the AI suggested

**Never shown even to the owner:**
- `ai_raw_response`
- `moderated_by`
- `rejection_reason`
- `problem_type_final` (exposed implicitly via canonical `problem_type`)

`status_history` — all public-facing transitions only (`approved`, `in_progress`, `resolved`). Internal transitions (`pending_review`, `under_review`, `rejected`) excluded. Notes from gov agencies are shown; moderator-internal notes are not.

---

### `GET /api/v1/me/confirmations`

Returns reports the user has confirmed.

#### Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 20 | Max 100 |

#### Response `200 OK`

```json
{
  "confirmations": [
    {
      "report_id": "uuid",
      "problem_type": "hazard",
      "address_raw": "Трасса М1, км 34",
      "photo_thumbnail_url": "https://imagedelivery.net/...",
      "report_status": "in_progress",
      "confirmed_at": "2026-04-09T12:00:00Z"
    }
  ],
  "cursor": "opaque-or-null"
}
```

---

### `POST /api/v1/reports/:id/confirm`

Adds the current user's confirmation to a report.

**Allowed:** only on reports with `status IN ('approved', 'in_progress')`.

**Constraints (enforced server-side):**
- User cannot confirm their own report
- One confirmation per user per report (DB unique constraint + application check)

#### Response `200 OK`

```json
{
  "report_id": "uuid",
  "confirmation_count": 8
}
```

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `400` | `ALREADY_CONFIRMED` | User already confirmed this report |
| `400` | `OWN_REPORT` | User cannot confirm their own report |
| `400` | `INVALID_STATUS` | Report is not in a confirmable status |
| `404` | `NOT_FOUND` | Report doesn't exist or not publicly visible |
| `429` | `RATE_LIMIT_EXCEEDED` | 50 confirmations per hour |

---

### `DELETE /api/v1/reports/:id/confirm`

Removes the current user's confirmation from a report.

**Allowed:** only if the user has an active confirmation on this report.

#### Response `200 OK`

```json
{
  "report_id": "uuid",
  "confirmation_count": 7
}
```

`confirmation_count` on the `reports` table is updated synchronously (not via trigger) to keep it consistent.

---

## `confirmation_count` Consistency

The `reports.confirmation_count` column is a denormalized counter. It must stay in sync with the `report_confirmations` table.

Rules:
- `POST /confirm` → `UPDATE reports SET confirmation_count = confirmation_count + 1`
- `DELETE /confirm` → `UPDATE reports SET confirmation_count = confirmation_count - 1`
- Both updates run in the same DB transaction as the insert/delete on `report_confirmations`
- `confirmation_count` has a `CHECK (confirmation_count >= 0)` DB constraint

No eventual consistency here — count must be exact and immediate (it's shown to the user in real time after confirming).

---

## Caching

| Data | Cache key | TTL |
|---|---|---|
| Profile stats | `cache:profile:stats:<clerk_id>` | 5 min |
| Report list | not cached — paginated, changes on moderation | — |
| Report detail | not cached — changes on status update | — |

Report list and detail are not cached because they change during moderation and the user expects to see current status without stale data.

---

## Security

- All endpoints derive user identity from the verified JWT — never from URL params or request body
- `GET /api/v1/me/reports/:id` returns `404` for reports belonging to other users — no `403`, to avoid leaking existence
- `rejection_reason`, `moderated_by`, `ai_raw_response` never exposed — not even to the report owner
- `confirmation_count` updated in same transaction as confirmation insert/delete — no drift
- Rate limit on confirm: 50/hour to prevent abuse (mass-confirming to manipulate report priority)
- `is_banned` check on all write operations (`POST /confirm`)

---

## Out of Scope (v1)

- Push notifications when report status changes
- Email notifications
- Public user profiles or leaderboards
- Deleting own reports (reports are immutable once submitted — contact admin)
- Editing report description or location after submission
- Report sharing (deep link is in public map spec)
