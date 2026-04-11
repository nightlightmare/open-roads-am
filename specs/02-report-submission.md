# Spec 02 — Report Submission

**Status:** Draft
**Version:** 1.1 (updated: two-step flow with pre-submit AI classification)
**Date:** April 2026

---

## Overview

Report submission is a two-step flow. First, the user uploads a photo and waits while the AI classifies it — the result is shown as a pre-selected category that the user can confirm or change. Then the user fills in location and description and submits. This way the AI assists the user before the report is created, rather than running silently in the background.

---

## User Flow

```
Step 1 — Photo upload & AI classification
  User opens "Submit Report"
    ↓
  Takes or uploads a photo (required)
    ↓
  Photo uploaded to R2 (temp key) + BullMQ job enqueued
    ↓
  Client receives job_token, shows "Analyzing image…"
    ↓
  Client polls GET /api/v1/classify/:job_token every 2s
    ↓
  AI result ready → categories shown, AI-suggested type pre-selected
    ↓
  User confirms or changes the category selection

Step 2 — Report submission
  User confirms location on map (auto-filled from GPS, adjustable)
    ↓
  Optionally adds description
    ↓
  Submits
    ↓
  Report created (status: pending_review) ← immediate response
    ↓
  Moderator receives SSE notification
```

---

## Step 1: Photo Upload & Classification

### `POST /api/v1/classify`

**Auth:** Clerk JWT required

**Content-Type:** `multipart/form-data`

#### Request fields

| Field | Type | Required | Validation |
|---|---|---|---|
| `photo` | file | yes | JPEG or PNG. Max 10 MB. Validated by magic bytes. |

#### Processing

1. Validate file (size, magic bytes)
2. Strip EXIF data
3. Upload to R2 under temp prefix: `temp/<user_id>/<uuid>.<ext>`
4. Insert row into `photo_classifications` (`status: pending`, `expires_at: now + 30min`)
5. Enqueue BullMQ job `classify-report-photo` with `classificationId`
6. Return `job_token` immediately

#### Response `202 Accepted`

```json
{
  "job_token": "uuid"
}
```

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `400` | `INVALID_PHOTO` | Not JPEG/PNG, magic bytes mismatch, or corrupted |
| `400` | `PHOTO_TOO_LARGE` | File exceeds 10 MB |
| `401` | `UNAUTHORIZED` | Missing or invalid JWT |
| `403` | `USER_BANNED` | |
| `429` | `RATE_LIMIT_EXCEEDED` | |

---

### `GET /api/v1/classify/:job_token`

**Auth:** Clerk JWT required. User must own the classification (checked against `photo_classifications.user_id`).

**Polling interval:** client polls every 2 seconds, max 60 seconds total.

#### Response — pending

```json
{ "status": "pending" }
```

#### Response — completed

```json
{
  "status": "completed",
  "problem_type_ai": "pothole",
  "ai_confidence": 0.91
}
```

`problem_type_ai` is null if confidence < 0.6 — client shows all categories with none pre-selected.

#### Response — failed

```json
{ "status": "failed" }
```

Client shows all categories with none pre-selected, no error shown to user ("AI couldn't classify — please select manually").

#### Timeout handling

If polling exceeds 60 seconds with no `completed` response:
- Client treats it as `failed`
- Shows all categories with none pre-selected
- User selects manually

---

## Step 2: Report Submission

### `POST /api/v1/reports`

**Auth:** Clerk JWT required

**Content-Type:** `application/json`

#### Request body

```typescript
{
  job_token: string       // UUID from Step 1 — links to photo_classifications row
  latitude: number        // WGS84, validated against Armenia bounding box
  longitude: number       // WGS84, validated against Armenia bounding box
  problem_type_user: ProblemTypeEnum   // required — user's confirmed selection
  description?: string    // optional, max 1000 chars after trim
}
```

#### Processing

1. Validate all fields with Zod
2. Look up `photo_classifications` by `job_token` — must exist, not expired, owned by this user
3. Check rate limit: max 10 reports per user per 24h (Redis)
4. Move photo from temp R2 key to permanent key: `reports/<year>/<month>/<report_uuid>/original.<ext>`
5. Enqueue Cloudflare Images optimization job (async)
6. Resolve `region_id` via PostGIS (async, non-blocking)
7. Reverse-geocode `address_raw` via Nominatim (async, non-blocking)
8. INSERT report:
   - `status: pending_review`
   - `problem_type_user` = from request
   - `problem_type_ai` + `ai_confidence` + `ai_raw_response` = copied from `photo_classifications`
   - `photo_original_key` = permanent R2 key
9. DELETE `photo_classifications` row
10. Publish Redis event → SSE notification to moderators
11. Return `201`

#### Response `201 Created`

```json
{
  "id": "uuid",
  "status": "pending_review",
  "created_at": "2026-04-11T10:00:00Z"
}
```

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing fields, invalid coords, description too long |
| `400` | `INVALID_JOB_TOKEN` | Token not found, expired, or belongs to another user |
| `401` | `UNAUTHORIZED` | |
| `403` | `USER_BANNED` | |
| `429` | `RATE_LIMIT_EXCEEDED` | |
| `500` | `INTERNAL_ERROR` | |

---

## Rate Limiting

| Layer | Limit | Key |
|---|---|---|
| Redis (report creation) | 10 reports / 24h rolling | `rate:report:user:<clerk_id>` |
| Redis (photo upload) | 20 uploads / hour | `rate:classify:user:<clerk_id>` — higher limit to allow retries |
| Cloudflare WAF | IP-level burst protection | Configured at infra level |

On `429`: response includes `Retry-After` header.

---

## Photo Handling

### Validation
- File size ≤ 10 MB
- Magic bytes: JPEG (`FF D8 FF`) or PNG (`89 50 4E 47`)
- Strip all EXIF data before R2 upload (user privacy — GPS, device info, timestamps)

### R2 key scheme
- Temp (pre-submit): `temp/<user_id>/<uuid>.<ext>` — expires in 30 min via cron
- Permanent (post-submit): `reports/<year>/<month>/<report_uuid>/original.<ext>`

### Signed URLs
- All photo access via signed R2 URLs, TTL 1 hour
- Generated server-side, never cached on client beyond TTL
- R2 key never returned to clients

---

## Geolocation

### Client-side (Web)
1. Request `navigator.geolocation.getCurrentPosition()`
2. Granted → center map on user position, draggable pin
3. Denied → center on Yerevan (40.1872° N, 44.5152° E), prompt manual placement
4. Submitted coords = pin position at submit time

### Client-side (Mobile)
1. `Location.requestForegroundPermissionsAsync()`
2. Granted → `Location.getCurrentPositionAsync()` high accuracy
3. Denied → same fallback as web

### Server-side
- Zod validates lat/lng against Armenia bounding box before any DB operation
- `region_id` and `address_raw` resolved async — report is created immediately without waiting

---

## Moderator Notification

On successful report creation, publish to Redis channel `events:moderation`:

```json
{
  "event": "new_report",
  "report_id": "uuid",
  "problem_type_user": "pothole",
  "created_at": "2026-04-11T10:00:00Z"
}
```

SSE endpoint `/api/v1/moderation/feed` fans this out to connected moderators.
No PII in the payload.

---

## Expired Classification Cleanup

Cron job runs every 10 minutes:
1. SELECT `photo_classifications` WHERE `expires_at < now()`
2. For each: delete R2 object at `photo_temp_key`
3. DELETE rows from `photo_classifications`

This prevents orphaned photos in R2 if the user abandons the form after uploading.

---

## Security Checklist

- [ ] Magic bytes validation on upload (not extension)
- [ ] EXIF stripping before R2 upload
- [ ] `job_token` ownership check — user cannot use another user's token
- [ ] Coordinates validated server-side against Armenia bounding box
- [ ] HTML stripped from description; length enforced after trim
- [ ] Rate limiting enforced before DB/storage operations
- [ ] R2 signed URLs, 1h TTL, server-side only
- [ ] R2 key never returned to clients
- [ ] `ai_raw_response` never returned to clients
- [ ] No internal error details in error responses
- [ ] JWT validated on every request via Clerk SDK

---

## Out of Scope (v1)

- Offline-first submission queue (mobile)
- Multiple photos per report
- Video upload
- User notification on status change (separate spec)
- Duplicate detection
