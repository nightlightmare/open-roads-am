# Spec 02 — Report Submission

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

The report submission flow allows authenticated users to submit a road problem report with a photo, coordinates, and optional description. The flow is designed to be as fast as possible — the user gets confirmation immediately, while photo processing and AI classification happen asynchronously in the background.

---

## User Flow

```
User opens "Submit Report"
  ↓
Takes or uploads a photo (required)
  ↓
Confirms location on map (auto-filled from GPS, adjustable)
  ↓
Optionally adds description (free text)
  ↓
Submits
  ↓
Report created (status: pending_review) ← immediate response
  ↓
[async] Photo uploaded to R2, AI classification queued
  ↓
[async] Moderator receives notification
```

---

## API Endpoint

### `POST /api/v1/reports`

**Auth:** Clerk JWT required (`Authorization: Bearer <token>`)

**Content-Type:** `multipart/form-data`

#### Request fields

| Field | Type | Required | Validation |
|---|---|---|---|
| `photo` | file | yes | JPEG or PNG only. Max 10 MB. Validated by magic bytes (not extension). |
| `latitude` | number | yes | Float. Must be within `38.8–41.4` (Armenia + 50km buffer). |
| `longitude` | number | yes | Float. Must be within `43.4–46.7` (Armenia + 50km buffer). |
| `description` | string | no | Max 1000 characters after trim. Strip HTML tags. |

#### Response `201 Created`

```json
{
  "id": "uuid",
  "status": "pending_review",
  "created_at": "2026-04-11T10:00:00Z"
}
```

Minimal response — the client does not need AI results at submission time.

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing fields, invalid coordinates, description too long |
| `400` | `INVALID_PHOTO` | File is not JPEG/PNG, or magic bytes don't match, or file is corrupted |
| `400` | `PHOTO_TOO_LARGE` | File exceeds 10 MB |
| `401` | `UNAUTHORIZED` | Missing or invalid JWT |
| `403` | `USER_BANNED` | User has been banned |
| `429` | `RATE_LIMIT_EXCEEDED` | User has hit daily report limit (see Rate Limiting) |
| `500` | `INTERNAL_ERROR` | Generic server error — no internal details exposed |

---

## Rate Limiting

Two layers:

**1. Redis-based per-user limit**
- Max **10 reports per user per day** (rolling 24h window)
- Key: `rate:report:user:<clerk_id>`
- On `429`: response includes `Retry-After` header with seconds until reset

**2. Cloudflare WAF**
- IP-level rate limiting — handles burst abuse before it reaches the API
- Configured at infrastructure level, not in application code

---

## Photo Handling

### Upload flow

1. Client sends photo as `multipart/form-data` to the API
2. API validates:
   - File size ≤ 10 MB
   - Magic bytes: JPEG (`FF D8 FF`) or PNG (`89 50 4E 47`)
   - No EXIF GPS stripping needed — coordinates come from the form field, not EXIF. **Strip all EXIF data** from the photo before storage (privacy).
3. API uploads the original (EXIF-stripped) file to **Cloudflare R2**
   - Key format: `reports/<year>/<month>/<report_uuid>/original.<ext>`
4. Report is created in DB with `photo_original_key` set, `photo_optimized_key` null
5. BullMQ job is enqueued for async processing

### Async processing (BullMQ job: `process-report-photo`)

1. Trigger Cloudflare Images to generate optimized variants:
   - `thumbnail`: 200×200, cropped
   - `display`: max 1200px wide, quality 85
2. Store resulting keys in `photo_optimized_key` on the report
3. Send photo to Claude API for classification (see Spec 03 — AI Classification)
4. Update `problem_type`, `problem_type_source`, `ai_confidence`, `ai_raw_response` on the report

**If the job fails:** retry up to 3 times with exponential backoff (1min, 5min, 15min). After 3 failures, mark job as `failed` and alert via internal notification. Report remains in `pending_review` with `problem_type = null` — moderator classifies manually.

### Storage security

- R2 bucket is **private** — no public access
- Photos are served via **signed URLs** with a 1-hour expiry
- Signed URLs are generated server-side and never cached on the client beyond their TTL
- The R2 object key is never exposed to the public API consumer — only the signed URL is returned

---

## Geolocation

### Client-side (Web)

1. On page load, request `navigator.geolocation.getCurrentPosition()`
2. If granted — center map on user's position, drop a draggable pin
3. If denied — center map on Yerevan (40.1872° N, 44.5152° E), prompt user to place pin manually
4. Submitted coordinates = pin position at time of submit (not current GPS position)

### Client-side (Mobile — Expo)

1. Request `Location.requestForegroundPermissionsAsync()`
2. If granted — use `Location.getCurrentPositionAsync()` for high-accuracy fix
3. If denied — same fallback as web
4. Pin is draggable for manual correction

### Server-side validation

- Coordinates validated by Zod schema before any DB operation
- Out-of-bounds coordinates → `400 VALIDATION_ERROR`
- `region_id` resolved via PostGIS `ST_Within(location, boundary)` query after report is created (async, non-blocking)
- `address_raw` resolved via reverse geocoding (OpenStreetMap Nominatim or similar) — async, stored when available

**Critical:** coordinates submitted by the client are the source of truth. The server does not re-derive coordinates from EXIF.

---

## Moderation Notification

After a report is successfully created, a notification must be sent to all users with `role = moderator` or `role = admin`.

**Mechanism:** Redis pub/sub → SSE (Server-Sent Events) endpoint `/api/v1/moderation/feed`
- Moderators connected to the SSE feed receive the notification in real time
- If no moderators are connected, the notification is lost (acceptable — moderators check the queue on login)
- Notification payload:

```json
{
  "event": "new_report",
  "report_id": "uuid",
  "created_at": "2026-04-11T10:00:00Z",
  "has_photo": true
}
```

No user-identifiable data in the notification payload.

---

## Data Flow Summary

```
Client
  → POST /api/v1/reports (multipart)
  → Fastify validates (Zod + magic bytes)
  → Strip EXIF from photo
  → Upload original to R2
  → INSERT report (status: pending_review)
  → Enqueue BullMQ job
  → Publish Redis event → SSE to moderators
  → Return 201 { id, status, created_at }

[async — BullMQ worker]
  → Cloudflare Images optimization
  → Claude API classification
  → UPDATE report (problem_type, ai_confidence, photo_optimized_key)
```

---

## Security Checklist

- [ ] Magic bytes validation — not extension-based
- [ ] EXIF stripping before R2 upload (user privacy)
- [ ] Coordinates validated server-side against Armenia bounding box
- [ ] HTML stripped from description
- [ ] Description length enforced after trim (not before)
- [ ] Rate limiting enforced before any DB or storage operation
- [ ] R2 signed URLs — 1h TTL, generated server-side
- [ ] `photo_original_key` never returned to clients
- [ ] `ai_raw_response` never returned to clients
- [ ] No internal error details in error responses
- [ ] JWT validated on every request (Clerk SDK verification, not manual decode)

---

## Out of Scope (v1)

- Duplicate detection (same location, same problem type within X meters)
- Bulk submission (multiple photos per report)
- Video upload
- Offline-first submission queue (mobile)
- User notification when their report status changes (separate spec)
