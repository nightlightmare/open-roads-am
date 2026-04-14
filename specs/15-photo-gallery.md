# Spec 15 — Multi-Photo Reports

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Currently, each report has exactly one photo — the original upload that goes through AI classification. This is often insufficient:

- A single photo of a pothole doesn't show its depth, extent, or surrounding context
- After a problem is reported as "resolved," there's no visual proof of the fix
- Government agencies want to attach "in progress" photos showing work underway
- Moderators sometimes need additional angles to verify a report's legitimacy

This spec extends the report model to support **up to 5 photos per report**, introduces a **before/after comparison** feature, and migrates the existing single-photo data to the new multi-photo schema.

### Goals

1. **Better reports** — users can submit multiple angles of a problem
2. **Accountability** — before/after comparison shows whether a problem was actually fixed
3. **Trust** — multiple photos from different angles are harder to fake
4. **Progress tracking** — photos can be added over time as a report progresses through statuses

---

## Changes to Report Creation

### Current flow (single photo)

```
User uploads 1 photo → AI classifies → User confirms type → Submits report
```

### New flow (multi-photo)

```
User uploads 1-5 photos → First photo sent to AI classification → User confirms type → Submits report
                          (other photos uploaded to R2 directly, no AI processing)
```

**Key design decisions:**

- **Only the first photo** (position 1) goes through AI classification via BullMQ. Sending all photos to the AI would multiply cost and latency for minimal benefit — the AI needs one clear photo to classify the problem type.
- **Additional photos** (positions 2-5) are uploaded directly to R2 during step 1, in parallel with the AI classification of the first photo. This means the upload UX is not bottlenecked by AI processing.
- **Photos can be added after creation** — the report owner can add more photos later (e.g., "the problem got worse"), and moderators/gov agencies can add resolution photos.
- **Photo order matters** — each photo has a `position` (1-5) that determines display order. Position 1 is always the primary/hero photo.

### Step 1 modifications

The multi-file dropzone replaces the single-file upload:

1. User selects 1-5 photos (drag-and-drop or file picker)
2. First photo is uploaded to R2 temp prefix and sent to AI classification (same as current flow)
3. Additional photos are uploaded to R2 temp prefix in parallel
4. All uploads complete → AI result shown → user confirms type
5. On report submission, all temp photos are moved to permanent prefix

If the user uploads multiple photos, the UI shows thumbnails with drag-to-reorder. The first photo in the list is the one sent to AI.

---

## Database Changes

### New table: `report_photos`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `report_id` | `uuid` | FK → `reports.id`, NOT NULL | |
| `position` | `smallint` | NOT NULL | 1-5. Unique per report (composite unique on `report_id, position`). |
| `photo_key` | `text` | NOT NULL | R2 object key for original upload |
| `photo_optimized_key` | `text` | nullable | R2 key after optimization (Cloudflare Images or Sharp) |
| `caption` | `text` | nullable, max 200 chars | Optional user-provided description of this photo |
| `tag` | `enum` | NOT NULL, default `evidence` | `evidence`, `before`, `after`, `progress` |
| `taken_at` | `timestamptz` | nullable | Extracted from EXIF `DateTimeOriginal` if available |
| `uploaded_by` | `uuid` | FK → `users.id`, NOT NULL | Who uploaded this photo (owner, moderator, or gov_agency) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraints:**
- `UNIQUE (report_id, position)` — no two photos at the same position for one report
- `CHECK (position >= 1 AND position <= 5)` — max 5 photos per report
- Composite index: `idx_report_photos_report_id_position` on `(report_id, position)`

### New enum: `photo_tag`

```
evidence    — standard problem documentation photo (default)
before      — photo of the problem before resolution
after       — photo showing the problem has been fixed
progress    — photo showing work in progress
```

**Who can set tags:**
- `evidence` — anyone (default for all user-uploaded photos)
- `before` — moderator or admin (retroactively tagging an existing photo)
- `after` — gov_agency, moderator, or admin
- `progress` — gov_agency, moderator, or admin

### Migration: existing photos to `report_photos`

The existing `photo_original_key` and `photo_optimized_key` columns on `reports` must be migrated to the new `report_photos` table.

**Migration strategy:**

```sql
-- Step 1: Populate report_photos from existing reports
INSERT INTO report_photos (id, report_id, position, photo_key, photo_optimized_key, tag, uploaded_by, created_at)
SELECT
  gen_random_uuid(),
  r.id,
  1,  -- position 1 (primary photo)
  r.photo_original_key,
  r.photo_optimized_key,
  'evidence',
  r.user_id,
  r.created_at
FROM reports r
WHERE r.photo_original_key IS NOT NULL
  AND r.deleted_at IS NULL;

-- Step 2: After verifying migration, mark old columns as deprecated
-- (do NOT drop columns immediately — keep for rollback safety)
-- Drop in a subsequent migration after 2 weeks of stable operation
```

**The `photo_original_key` and `photo_optimized_key` columns on `reports` are NOT removed in v1.** They are kept for backward compatibility and rollback safety. New code reads from `report_photos`; the old columns are no longer written to after migration.

---

## API Changes

### Modified: `POST /api/v1/reports`

The report creation endpoint now accepts multiple photo references.

**Current request body:**
```json
{
  "classification_id": "uuid",
  "problem_type_user": "pothole",
  "location": { "lat": 40.1792, "lng": 44.5134 },
  "description": "Large pothole on Teryan street"
}
```

**New request body:**
```json
{
  "classification_id": "uuid",
  "additional_photo_keys": ["temp/user_id/uuid2.jpg", "temp/user_id/uuid3.jpg"],
  "problem_type_user": "pothole",
  "location": { "lat": 40.1792, "lng": 44.5134 },
  "description": "Large pothole on Teryan street"
}
```

- `classification_id` remains required — it references the first photo (already uploaded via `POST /api/v1/classify`)
- `additional_photo_keys` is optional — array of R2 temp keys for photos 2-5 uploaded during step 1
- Server validates that each key exists in R2 and belongs to the authenticated user (key path includes `user_id`)
- On report creation, all photos (classification photo + additional) are moved from temp to permanent prefix and inserted into `report_photos`

---

### New: `POST /api/v1/reports/:id/photos`

Add a photo to an existing report.

**Auth:** Clerk JWT required

**Allowed roles:**
- Report owner (`user_id` matches) — only if report status is `pending_review`, `under_review`, or `approved`
- Moderator — any status except `archived`
- Gov agency — only if status is `in_progress` or `resolved` (adding resolution photos)
- Admin — always

**Content-Type:** `multipart/form-data`

#### Request fields

| Field | Type | Required | Validation |
|---|---|---|---|
| `photo` | file | yes | JPEG or PNG. Max 10 MB. Validated by magic bytes. |
| `caption` | string | no | Max 200 characters |
| `tag` | string | no | One of: `evidence`, `before`, `after`, `progress`. Default: `evidence`. |
| `position` | integer | no | 1-5. If omitted, auto-assigned to next available position. |

#### Processing

1. Validate file (size, magic bytes — same validation as `POST /api/v1/classify`)
2. Validate permissions (role + report status)
3. Check photo count: if report already has 5 photos, return `400 MAX_PHOTOS_REACHED`
4. Strip EXIF data (privacy) but first extract `DateTimeOriginal` for `taken_at`
5. Upload original to R2: `reports/<report_id>/photos/<position>-<uuid>.<ext>`
6. Enqueue BullMQ job `optimize-report-photo` for image optimization (resize, compress)
7. Insert row into `report_photos`
8. Return the new photo object

#### Response `201 Created`

```json
{
  "id": "uuid",
  "report_id": "uuid",
  "position": 2,
  "photo_url": "https://cdn.open-road.am/reports/.../photo.jpg",
  "photo_optimized_url": null,
  "caption": "Close-up showing depth",
  "tag": "evidence",
  "taken_at": "2026-04-10T14:30:00Z",
  "created_at": "2026-04-14T10:00:00Z"
}
```

`photo_optimized_url` is null initially — it will be populated after the optimization job completes. The client should poll or use the optimized URL from the report detail response.

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `400` | `MAX_PHOTOS_REACHED` | Report already has 5 photos |
| `400` | `INVALID_FILE_TYPE` | Not JPEG or PNG (by magic bytes) |
| `400` | `FILE_TOO_LARGE` | Exceeds 10 MB |
| `400` | `INVALID_POSITION` | Position already occupied (and not specified as replace) |
| `400` | `INVALID_TAG` | User trying to set `before`/`after`/`progress` tag (only moderator/gov/admin) |
| `403` | `FORBIDDEN` | User doesn't own the report, or report is in a status that doesn't allow photo addition |
| `404` | `REPORT_NOT_FOUND` | Report doesn't exist or is deleted |

---

### New: `DELETE /api/v1/reports/:id/photos/:photo_id`

Remove a photo from a report.

**Auth:** Clerk JWT required

**Allowed roles:**
- Report owner — only if status is `pending_review` or `under_review`, and the photo is not position 1 (primary photo cannot be deleted)
- Moderator or admin — any photo, any status except `archived`

#### Processing

1. Validate permissions
2. If deleting a non-last-position photo, shift remaining photos down (e.g., deleting position 2 when 3 and 4 exist → 3 becomes 2, 4 becomes 3)
3. Delete R2 objects (original + optimized)
4. Delete `report_photos` row

**Position 1 (primary photo) cannot be deleted** unless it's being replaced by `POST .../photos` with `position: 1`. A report must always have at least one photo.

#### Response `204 No Content`

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `403` | `FORBIDDEN` | Not authorized |
| `403` | `CANNOT_DELETE_PRIMARY` | Attempting to delete position 1 photo |
| `404` | `PHOTO_NOT_FOUND` | Photo doesn't exist |

---

### Modified: `GET /api/v1/public/reports/:id`

The public report detail response now includes a `photos` array.

**Current response (single photo):**
```json
{
  "id": "uuid",
  "status": "approved",
  "photo_url": "https://cdn.open-road.am/...",
  ...
}
```

**New response (multi-photo):**
```json
{
  "id": "uuid",
  "status": "approved",
  "photo_url": "https://cdn.open-road.am/...",
  "photos": [
    {
      "id": "uuid",
      "position": 1,
      "url": "https://cdn.open-road.am/.../optimized.jpg",
      "caption": null,
      "tag": "before",
      "taken_at": "2026-04-10T14:30:00Z"
    },
    {
      "id": "uuid",
      "position": 2,
      "url": "https://cdn.open-road.am/.../optimized.jpg",
      "caption": "Close-up of the pothole",
      "tag": "evidence",
      "taken_at": "2026-04-10T14:31:00Z"
    },
    {
      "id": "uuid",
      "position": 3,
      "url": "https://cdn.open-road.am/.../optimized.jpg",
      "caption": "Fixed by Yerevan municipality",
      "tag": "after",
      "taken_at": "2026-04-20T09:00:00Z"
    }
  ],
  ...
}
```

**Backward compatibility:** the `photo_url` field continues to return the position-1 photo URL for clients that haven't been updated to use the `photos` array.

---

## Before/After Comparison

### Tagging workflow

1. A report is created with 1-3 "evidence" photos
2. The report progresses to `in_progress` or `resolved`
3. A gov agency user or moderator uploads a new photo with `tag: "after"`
4. Optionally, a moderator retroactively tags an existing photo as `tag: "before"` via `PATCH /api/v1/reports/:id/photos/:photo_id`

### New: `PATCH /api/v1/reports/:id/photos/:photo_id`

Update a photo's tag or caption.

**Auth:** Clerk JWT required

**Allowed roles:**
- Report owner — can update `caption` only
- Moderator, gov_agency, admin — can update `caption` and `tag`

#### Request body

```json
{
  "tag": "before",
  "caption": "Original state of the pothole"
}
```

Both fields are optional. Only provided fields are updated.

#### Response `200 OK`

Returns the updated photo object.

### Frontend: Before/After comparison view

When a report has at least one photo tagged `before` and one tagged `after`, the report detail page shows a comparison component.

**Two display modes** (user can toggle):

#### 1. Slider comparison

A single frame showing both images overlaid. A vertical slider divides the frame — dragging left reveals more of the "after" image, dragging right reveals more of the "before" image.

- Implementation: CSS `clip-path` with a draggable handle
- Touch-friendly: works on mobile with swipe
- Accessible: keyboard-controllable (left/right arrows)

#### 2. Side-by-side comparison

Two images displayed next to each other (stacked vertically on mobile) with "Before" and "After" labels.

- Default on mobile (slider is harder on small screens)
- Both images rendered at the same dimensions for visual alignment

### Automatic pairing

If a report has exactly one `before` and one `after` photo, they are automatically paired for comparison. If multiple `before` or `after` photos exist, the comparison uses the most recent `before` and most recent `after` (by `created_at`).

---

## Frontend Implementation

### Report creation: Multi-file dropzone

Replace the single-file upload in step 1 with a multi-file dropzone.

```
<PhotoUploadZone>
  <DropArea>                    // drag-and-drop or click to select
    "Drop up to 5 photos here"
  </DropArea>
  <PhotoPreviewList>            // horizontal scrollable list of thumbnails
    <PhotoPreview position={1}  // first photo, marked as "AI analyzed"
      status="classifying" />
    <PhotoPreview position={2}
      status="uploaded" />
    <PhotoPreview position={3}
      status="uploading" progress={65} />
  </PhotoPreviewList>
  <AddMoreButton />             // "+" button, shown if < 5 photos
</PhotoUploadZone>
```

**UX details:**
- Each thumbnail shows upload progress (progress bar overlay)
- The first photo has a badge: "AI will analyze this photo"
- Users can drag thumbnails to reorder (changing which photo goes to AI)
- Users can remove individual photos by clicking an "X" button on the thumbnail
- If the user removes the first photo while AI classification is in progress, the next photo becomes position 1 and is sent to AI classification (new classification job enqueued, old one abandoned)

### Report detail: Photo carousel

On the report detail page, photos are displayed in a carousel.

```
<PhotoCarousel>
  <MainImage />                 // large view of selected photo
  <ThumbnailStrip>              // horizontal row of clickable thumbnails
    <Thumbnail position={1} active />
    <Thumbnail position={2} />
    <Thumbnail position={3} tag="after" />
  </ThumbnailStrip>
  <PhotoCaption />              // caption text below main image
  <PhotoMeta />                 // "Taken Apr 10, 2026 · Uploaded by report author"
  <BeforeAfterToggle />         // shown only if before/after photos exist
</PhotoCarousel>
```

**Interaction:**
- Click thumbnail to view that photo in the main area
- Swipe left/right on main image to navigate (mobile)
- Keyboard: left/right arrows to navigate
- Lightbox mode: click main image to open full-screen overlay

### Before/After slider component

```
<BeforeAfterSlider>
  <SliderTrack>
    <BeforeImage />             // full width, clipped by slider position
    <AfterImage />              // full width, clipped inverse
    <SliderHandle />            // draggable vertical line
  </SliderTrack>
  <Labels>
    <span>Before</span>
    <span>After</span>
  </Labels>
  <ViewModeToggle />            // "Slider" | "Side by side"
</BeforeAfterSlider>
```

---

## R2 Storage

### Path pattern

```
reports/<report_id>/photos/<position>-<photo_uuid>.jpg       // original
reports/<report_id>/photos/<position>-<photo_uuid>-opt.jpg   // optimized
```

Example:
```
reports/a1b2c3d4/photos/1-e5f6g7h8.jpg
reports/a1b2c3d4/photos/1-e5f6g7h8-opt.jpg
reports/a1b2c3d4/photos/2-i9j0k1l2.jpg
reports/a1b2c3d4/photos/2-i9j0k1l2-opt.jpg
```

**Temp path** (before report submission):
```
temp/<user_id>/<uuid>.jpg
```

On report creation, all temp photos are moved (copy + delete) to the permanent path.

### Optimization job

The existing `optimize-report-photo` BullMQ job is reused for additional photos. The job:

1. Downloads original from R2
2. Resizes to max 1920px on longest edge (same as current)
3. Compresses to JPEG quality 80
4. Uploads optimized version to R2 with `-opt` suffix
5. Updates `photo_optimized_key` in `report_photos`

---

## Limits and Validation

| Constraint | Value | Enforcement |
|---|---|---|
| Max photos per report | 5 | DB CHECK constraint + API validation |
| Max file size per photo | 10 MB | API validation before R2 upload |
| Allowed file types | JPEG, PNG | Magic byte validation (not extension) |
| Max caption length | 200 chars | Zod validation |
| Position range | 1-5 | DB CHECK constraint + Zod validation |

### Magic byte validation

Same as current implementation (Spec 02):

| Format | Magic bytes |
|---|---|
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |

---

## Zod Validation Schemas

```typescript
import { z } from 'zod';

const PhotoTagSchema = z.enum(['evidence', 'before', 'after', 'progress']);

const AddPhotoSchema = z.object({
  caption: z.string().max(200).optional(),
  tag: PhotoTagSchema.default('evidence'),
  position: z.coerce.number().int().min(1).max(5).optional(),
});

const UpdatePhotoSchema = z.object({
  caption: z.string().max(200).optional(),
  tag: PhotoTagSchema.optional(),
}).refine(data => data.caption !== undefined || data.tag !== undefined, {
  message: 'At least one field (caption or tag) must be provided',
});

const CreateReportWithPhotosSchema = z.object({
  classification_id: z.string().uuid(),
  additional_photo_keys: z.array(z.string()).max(4).optional(), // max 4 additional = 5 total
  problem_type_user: z.enum([
    'pothole', 'damaged_barrier', 'missing_marking',
    'damaged_sign', 'hazard', 'broken_light',
    'missing_ramp', 'other'
  ]),
  location: z.object({
    lat: z.number().min(38.0).max(42.0),  // Armenia bounding box
    lng: z.number().min(43.0).max(47.0),
  }),
  description: z.string().max(1000).optional(),
});
```

---

## Prisma Schema Addition

```prisma
model ReportPhoto {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  reportId         String    @map("report_id") @db.Uuid
  position         Int       @db.SmallInt
  photoKey         String    @map("photo_key")
  photoOptimizedKey String?  @map("photo_optimized_key")
  caption          String?   @db.VarChar(200)
  tag              PhotoTag  @default(evidence)
  takenAt          DateTime? @map("taken_at") @db.Timestamptz
  uploadedBy       String    @map("uploaded_by") @db.Uuid
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz

  report    Report @relation(fields: [reportId], references: [id], onDelete: Cascade)
  uploader  User   @relation(fields: [uploadedBy], references: [id])

  @@unique([reportId, position])
  @@index([reportId, position])
  @@map("report_photos")
}

enum PhotoTag {
  evidence
  before
  after
  progress

  @@map("photo_tag")
}
```

---

## Out of Scope (v1)

- **Video uploads** — video would be useful for documenting hazards but adds significant storage, transcoding, and streaming complexity
- **Photo annotations** — drawing arrows or circles on photos to highlight specific damage. Useful for moderators but requires a canvas editor.
- **AI analysis of all photos** — only the first photo is classified. Running AI on all photos could detect inconsistencies or provide richer data, but the cost/benefit doesn't justify it in v1.
- **Photo compression on client** — resizing/compressing before upload to save bandwidth. Good optimization for mobile users but adds client-side complexity.
- **Photo geolocation validation** — checking that EXIF GPS coordinates match the report's location. Would catch fake reports but requires EXIF preservation (currently stripped for privacy).
- **Crowdsourced "after" photos** — allowing any authenticated user (not just the reporter, moderator, or gov agency) to upload resolution photos. Trust and moderation concerns.
- **Photo timeline view** — showing all photos for a report on a timeline sorted by `taken_at`. Nice for long-lived reports but unnecessary in v1.
- **Bulk photo upload via API** — the API accepts one photo at a time. Bulk upload (ZIP or multipart with multiple files) is a v2 optimization.
