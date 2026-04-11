# Spec 01 — Data Model

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

This spec defines the core database schema for OpenRoad.am. All tables live in PostgreSQL with the PostGIS extension enabled. The schema is managed via Prisma migrations.

---

## Design Principles

- **Immutability of core facts** — report coordinates and original photo are never mutated after creation
- **Audit trail** — every status change is recorded with timestamp and actor
- **No hard deletes** — reports are soft-deleted (`deleted_at`) to preserve data integrity for gov/API consumers
- **User identity** — users are managed by Clerk; the DB stores only the Clerk `user_id` as a foreign key. No passwords, no email storage beyond what Clerk provides via webhook sync.

---

## Tables

### `users`

Synced from Clerk via webhook on `user.created` / `user.updated` / `user.deleted`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Internal DB ID |
| `clerk_id` | `text` | UNIQUE, NOT NULL | Clerk user ID (`user_xxxxxxxx`) |
| `role` | `enum` | NOT NULL, default `user` | `user`, `moderator`, `gov_agency`, `admin` |
| `display_name` | `text` | nullable | Pulled from Clerk profile |
| `reports_today` | `int` | NOT NULL, default `0` | Reset daily via cron — used for rate limiting |
| `is_banned` | `boolean` | NOT NULL, default `false` | Banned users cannot submit reports |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Critical:** `reports_today` is a soft counter — actual rate limiting enforcement is done in Redis, not here. This column is for analytics only.

---

### `reports`

Core entity. Represents a single road problem report submitted by a user.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | Author of the report |
| `status` | `enum` | NOT NULL, default `pending_review` | See Status Lifecycle below |
| `problem_type` | `enum` | nullable | Set by AI or manually by moderator. See Problem Types. |
| `problem_type_source` | `enum` | nullable | `ai`, `moderator` — who set the type |
| `description` | `text` | nullable, max 1000 chars | User-provided free text |
| `location` | `geometry(Point, 4326)` | NOT NULL | PostGIS point, WGS84 |
| `address_raw` | `text` | nullable | Reverse-geocoded human-readable address |
| `region_id` | `uuid` | FK → `regions.id`, nullable | Resolved from coordinates |
| `photo_original_key` | `text` | NOT NULL | Cloudflare R2 object key for original upload |
| `photo_optimized_key` | `text` | nullable | R2 key after Cloudflare Images processing |
| `ai_job_id` | `uuid` | nullable | BullMQ job ID for AI classification |
| `ai_raw_response` | `jsonb` | nullable | Raw Claude API response — kept for audit |
| `ai_confidence` | `float4` | nullable | 0.0–1.0 confidence score from AI |
| `moderated_by` | `uuid` | FK → `users.id`, nullable | Moderator who reviewed |
| `moderated_at` | `timestamptz` | nullable | |
| `rejection_reason` | `text` | nullable | Required if status = `rejected` |
| `deleted_at` | `timestamptz` | nullable | Soft delete |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

---

### `report_status_history`

Immutable audit log of every status transition.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `report_id` | `uuid` | FK → `reports.id`, NOT NULL | |
| `from_status` | `enum` | nullable | null on initial creation |
| `to_status` | `enum` | NOT NULL | |
| `changed_by` | `uuid` | FK → `users.id`, nullable | null = system/AI |
| `changed_by_role` | `enum` | nullable | Snapshot of actor's role at time of change |
| `note` | `text` | nullable | Optional moderator comment |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**No updates or deletes on this table — append only.**

---

### `regions`

Administrative regions of Armenia. Pre-seeded, not user-generated.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `name_hy` | `text` | NOT NULL | Armenian name |
| `name_ru` | `text` | NOT NULL | Russian name |
| `name_en` | `text` | NOT NULL | English name |
| `boundary` | `geometry(MultiPolygon, 4326)` | NOT NULL | PostGIS polygon |
| `type` | `enum` | NOT NULL | `marz`, `city`, `district` |
| `parent_id` | `uuid` | FK → `regions.id`, nullable | Hierarchical: district → city → marz |

---

### `api_keys`

For gov agencies and external integrations accessing write endpoints.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | Owner (must have `gov_agency` or `admin` role) |
| `key_hash` | `text` | UNIQUE, NOT NULL | Bcrypt hash of the actual key — never store plaintext |
| `key_prefix` | `text` | NOT NULL | First 8 chars of key for identification (e.g. `oak_live_`) |
| `label` | `text` | NOT NULL | Human label, e.g. "MTAI Production" |
| `scopes` | `text[]` | NOT NULL | e.g. `["reports:read", "status:update"]` |
| `last_used_at` | `timestamptz` | nullable | |
| `expires_at` | `timestamptz` | nullable | null = no expiry |
| `revoked_at` | `timestamptz` | nullable | null = active |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

---

## Enums

### `report_status`

```
pending_review    — submitted, awaiting moderator
under_review      — moderator has opened it
approved          — verified, visible on public map
rejected          — not a valid road problem (spam, duplicate, out of scope)
in_progress       — gov agency has acknowledged, work started
resolved          — problem fixed, confirmed
archived          — older resolved report, moved to archive
```

**Allowed transitions:**

```
pending_review  → under_review    (moderator opens)
under_review    → approved        (moderator approves)
under_review    → rejected        (moderator rejects — rejection_reason required)
approved        → in_progress     (gov_agency or admin)
in_progress     → resolved        (gov_agency or admin)
resolved        → archived        (system cron, 90 days after resolved)
approved        → archived        (system cron, 365 days with no gov action)
rejected        → under_review    (admin only — allows re-review)
```

No other transitions are valid. The API must enforce this state machine.

### `problem_type`

```
pothole           — выбоина / повреждение покрытия
missing_marking   — отсутствие / повреждение разметки
damaged_sign      — сломанный / отсутствующий знак
hazard            — опасный участок (обрыв, подтопление и т.п.)
broken_light      — неработающий светофор
other             — другое
```

### `user_role`

```
user
moderator
gov_agency
admin
```

---

### `report_confirmations`

Records when a user confirms they have seen the same problem as an existing approved report.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `report_id` | `uuid` | FK → `reports.id`, NOT NULL | |
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraints:**
- `UNIQUE (report_id, user_id)` — one confirmation per user per report
- A user cannot confirm their own report (`user_id != report.user_id` — enforced at application level)
- Confirmations only allowed on reports with `status = approved` or `in_progress`

`reports` table gets a denormalized `confirmation_count int NOT NULL DEFAULT 0` column, updated via trigger or application logic on insert/delete of confirmations.

---

## Indexes

```sql
-- Geo queries (critical for map performance)
CREATE INDEX reports_location_idx ON reports USING GIST (location);
CREATE INDEX regions_boundary_idx ON regions USING GIST (boundary);

-- Filtering
CREATE INDEX reports_status_idx ON reports (status) WHERE deleted_at IS NULL;
CREATE INDEX reports_user_id_idx ON reports (user_id);
CREATE INDEX reports_created_at_idx ON reports (created_at DESC);
CREATE INDEX reports_region_id_idx ON reports (region_id);

-- Composite: map viewport queries
CREATE INDEX reports_status_location_idx ON reports USING GIST (location)
  WHERE status = 'approved' AND deleted_at IS NULL;

-- Confirmations
CREATE INDEX confirmations_report_id_idx ON report_confirmations (report_id);
CREATE UNIQUE INDEX confirmations_unique_idx ON report_confirmations (report_id, user_id);

-- API key lookup
CREATE INDEX api_keys_key_prefix_idx ON api_keys (key_prefix);
```

---

## Constraints & Validation

- `description`: max 1000 characters, trimmed before storage
- `location`: coordinates must fall within Armenia's bounding box + 50km buffer
  (`lat: 38.8–41.4`, `lng: 43.4–46.7`) — enforced at API level via Zod, not DB constraint
- `photo_original_key`: validated as a valid R2 object key format before insert
- `rejection_reason`: required (NOT NULL) when `status = rejected` — enforced at application level
- `ai_confidence`: must be in range `[0.0, 1.0]` if present
- `scopes` on `api_keys`: validated against an allowlist of known scope strings

---

## Security Notes

- `ai_raw_response` (jsonb) is internal only — **never exposed via public API**
- `key_hash` — only the hash is stored; the plaintext key is shown to the user once on creation and never again
- `user_id` on `reports` is never exposed to anonymous API consumers — public API returns only anonymized data
- Soft deletes (`deleted_at`) ensure deleted reports are excluded from all queries by default — every query must include `WHERE deleted_at IS NULL`

---

## Decisions

- **Confirmations** — `report_confirmations` table added (see below). Other authenticated users can confirm an existing approved report ("я тоже вижу эту проблему"). One confirmation per user per report.
- **Resolved reports on map** — shown with a distinct marker ("fixed"). Visibility controlled by a client-side filter (default: hidden). Filter state persists in URL query params.
- **Regions / clustering** — no district-level hierarchy. `regions` table keeps marz + city only. Map clustering is handled at the query level via PostGIS `ST_ClusterDBSCAN` or client-side via MapLibre supercluster. `region_id` on reports is resolved from coordinates for filtering/stats only.

---

## Out of Scope (v1)

- Comments on reports
- User reputation / karma system
- Duplicate detection (merge two reports about the same pothole)
- Report expiry based on age without updates
