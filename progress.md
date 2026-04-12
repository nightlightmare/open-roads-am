# open-road.am — Development Progress

Legend: ✅ done · 🔄 in progress · ⬜ not started

---

## Infrastructure & Setup

- ✅ Turborepo monorepo (pnpm workspaces)
- ✅ Apps scaffolded: `web`, `api`, `mobile`, `mcp-server`
- ✅ Shared packages: `config` (tsconfig + oxlint), `types`, `ui`
- ✅ TypeScript strict mode across all packages
- ✅ oxlint configured with security rules
- ✅ Husky hooks: pre-commit (lint-staged), pre-push (typecheck + test)
- ✅ Vitest configured in all apps
- ✅ `.gitignore`, `.nvmrc` (Node 22), `.npmrc`

---

## Specs

### 🔄 Spec 01 — Data Model (v1.1)

- ✅ Schema designed (PostgreSQL + PostGIS)
- ✅ Prisma schema file (`apps/api/prisma/schema.prisma`)
- ✅ `prisma.config.ts` (Prisma v7 — datasource URL moved out of schema.prisma)
- ✅ Prisma client generated (`prisma generate`)
- ✅ Tables defined in schema:
  - ✅ `users`
  - ✅ `reports`
  - ✅ `report_status_history`
  - ✅ `report_confirmations`
  - ✅ `photo_classifications`
  - ✅ `regions`
  - ✅ `api_keys`
- ✅ Enums: `user_role`, `report_status`, `problem_type`, `region_type`, `photo_classification_status`
- ✅ Filtering indexes (`user_id`, `created_at`, `region_id`, `report_id`, `key_prefix`)
- ✅ PostGIS geometry fields declared as `Unsupported("geometry(...)")` — GIST indexes in migration SQL
- ✅ Repository implementations wired to Prisma:
  - ✅ `UserRepository` (`WebhookUserRepository` + `UserBanRepository`)
  - ✅ `PrismaApiKeyRepository` (`ApiKeyRepository` + `ApiKeyCreateRepository`)
  - ✅ `PrismaRoleRepository` (`UserRoleRepository`)
- ✅ `server.ts` wires all repositories to routes
- ⬜ Initial migration generated and applied (requires live DATABASE_URL — run `pnpm db:migrate:dev`)

---

### 🔄 Spec 06 — Auth & Roles (v1.1) — **implement first**

#### Backend (`apps/api`)

- ✅ Install: `@clerk/fastify`, `bcryptjs`, `bs58`
- ✅ Shared types: `Role`, `ProblemType`, `ReportStatus`, `AuthPayload` in `@open-road/types`
- ✅ `fastify.decorateRequest('auth', null)` declared at server startup (Fastify v5)
- ✅ `verifyAuth` preHandler hook:
  - ✅ Uses `clerkPlugin` + `getAuth(request)` from `@clerk/fastify`
  - ✅ Returns `401 UNAUTHORIZED` if not authenticated
  - ✅ Sets `request.auth = { clerkId, role }` from `sessionClaims`
  - ✅ Never manually decodes JWT
- ✅ `requireRole(...roles)` helper
- ✅ `verifyApiKey` preHandler hook:
  - ✅ Reads `X-Api-Key` header
  - ✅ Looks up `key_prefix` in DB (via `ApiKeyRepository` interface — connects to Prisma in Spec 01)
  - ✅ `bcrypt.compare(key, record.keyHash)`
  - ✅ Caches successful lookup in Redis (`cache:apikey:<prefix>`, TTL 5min)
  - ✅ Sets `request.auth = { clerkId, role, scopes }`
- ✅ Clerk Webhook: `POST /api/v1/internal/clerk-webhook`
  - ✅ `verifyWebhook(request)` from `@clerk/fastify/webhooks`
  - ✅ `user.created` → INSERT into `users` (via `WebhookUserRepository` interface)
  - ✅ `user.updated` → UPDATE `display_name`, `role`
  - ✅ `user.deleted` → soft-delete (`is_banned = true`)
- ✅ Role escalation: `POST /api/v1/admin/users/:clerk_id/role` (admin only)
  - ✅ Calls Clerk Admin API to update `publicMetadata`
  - ✅ Updates local `users.role` (via `UserRoleRepository` interface)
- ✅ API key creation: `POST /api/v1/admin/api-keys` (admin only)
  - ✅ Generates `oak_live_` + 32 random bytes base58
  - ✅ Stores `bcrypt.hash(key, 12)` in DB
  - ✅ Returns plaintext key once, never again
- ✅ Rate limiting middleware (`rateLimit` util — Redis incr + expire)
- ✅ Banned user check with Redis cache (TTL 5min) — via `createBannedCheck`
- ✅ `.env.example` with all required env vars
- ✅ Unit tests: `verifyAuth` (3), `requireRole` (4), `rateLimit` (5) — 12 tests passing
- ⬜ Rate limiting wired to actual endpoints (done per-route in Specs 02–08)
- ⬜ `Retry-After` header on 429 responses (done per-route)
- ⬜ Repository interfaces connected to Prisma (done in Spec 01)

---

### ✅ Spec 02 — Report Submission (v1.1)

#### Backend (`apps/api`)

- ✅ `POST /api/v1/classify` — photo upload
  - ✅ Multipart form parsing (`@fastify/multipart`)
  - ✅ File size validation (max 10 MB — at multipart plugin level)
  - ✅ Magic bytes validation (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`)
  - ✅ EXIF stripping via `sharp` before R2 upload
  - ✅ Upload to R2: `temp/<user_id>/<uuid>.<ext>`
  - ✅ INSERT `photo_classifications` (`status: pending`, `expires_at: now + 30min`)
  - ✅ Enqueue BullMQ job `classify-report-photo`
  - ✅ Return `202 { job_token }`
  - ✅ Rate limit: 20 uploads/hour, `Retry-After` header on 429
- ✅ `GET /api/v1/classify/:job_token` — poll classification result
  - ✅ Ownership check (user must own the classification)
  - ✅ Returns `pending` / `completed` / `failed`
  - ✅ On `completed`: returns `problem_type_ai` (null if confidence < 0.6)
- ✅ `POST /api/v1/reports` — create report
  - ✅ Zod validation (all fields + Armenia bounding box)
  - ✅ `job_token` lookup: must exist, not expired, owned by user
  - ✅ Rate limit: 10 reports/24h, `Retry-After` header on 429
  - ✅ Move photo from temp to permanent R2 key: `reports/<year>/<month>/<uuid>/original.<ext>`
  - ✅ Resolve `region_id` via PostGIS (async, non-blocking)
  - ✅ Reverse-geocode `address_raw` via Nominatim (async, non-blocking)
  - ✅ INSERT report via raw SQL (`ST_MakePoint` for PostGIS geometry)
  - ✅ DELETE `photo_classifications` row
  - ✅ Publish Redis event `events:moderation` → SSE notification to moderators
  - ✅ Return `201 { id, status, created_at }`
- ✅ Cron: cleanup expired `photo_classifications` every 10 min
  - ✅ Delete R2 temp objects
  - ✅ Delete DB rows
- ✅ Tests: 8 classify + 6 reports = 14 new tests (26 total passing)

---

### ⬜ Spec 03 — AI Classification (v1.1)

- ⬜ BullMQ worker: queue `report-photo-processing`, job `classify-report-photo`
  - ⬜ Job options: 3 attempts, exponential backoff (1min → 5min → 15min)
  - ⬜ Fetch signed R2 URL for photo (TTL 5min)
  - ⬜ Resize photo if > 5 MB (max 1600px)
  - ⬜ Call Claude API (`claude-sonnet-4-5`, vision, `temperature: 0`, `max_tokens: 256`)
  - ⬜ Parse and validate response with Zod (`ClassificationSchema`)
  - ⬜ Confidence threshold: if < 0.6 → `problem_type_ai = null`
  - ⬜ UPDATE `photo_classifications`: `status`, `problem_type_ai`, `ai_confidence`, `ai_raw_response`
- ⬜ Failure handling:
  - ⬜ After 3 failed attempts → `status = 'failed'`, internal alert to `internal:alerts` Redis channel
  - ⬜ Client receives `{ status: 'failed' }` on next poll
- ⬜ Observability:
  - ⬜ Structured JSON logs per job (no PII)
  - ⬜ Redis daily counters: `metrics:ai:total`, `metrics:ai:failed`, `metrics:ai:low_confidence`
- ⬜ Unit tests: response parsing, Zod validation, confidence threshold logic

---

### ⬜ Spec 04 — Public Map API (v1.0)

- ⬜ `GET /api/v1/public/reports`
  - ⬜ Zod validation of query params (bbox or lat+lng required)
  - ⬜ bbox max area: 2°×2° → `400 BBOX_TOO_LARGE`
  - ⬜ PostGIS query with spatial index (`ST_Within` / `ST_DWithin`)
  - ⬜ Canonical `problem_type` = `COALESCE(problem_type_final, problem_type_user)`
  - ⬜ `include_resolved` filter (default: false)
  - ⬜ Cursor-based pagination (max 500 per page)
  - ⬜ `total_in_area` count cached separately (TTL 60s)
  - ⬜ Redis cache (TTL 30s, invalidated on `approved` status change)
  - ⬜ `photo_url` — Cloudflare Images public URL (no R2 keys exposed)
  - ⬜ No `user_id` in response
- ⬜ `GET /api/v1/public/reports/:id`
  - ⬜ Returns full public detail
  - ⬜ `status_history` — public transitions only (`approved`, `in_progress`, `resolved`)
  - ⬜ `404` for non-public statuses
  - ⬜ Redis cache (TTL 5min, invalidated on status change)
- ⬜ `GET /api/v1/public/stats`
  - ⬜ `region_id`, `problem_type`, `from`, `to` filters
  - ⬜ Max date range 365 days
  - ⬜ Redis cache (TTL 5min)
- ⬜ Rate limiting: IP-based (60/1min, 120/1min, 30/1min per endpoint)
- ⬜ HTTP headers: `Cache-Control`, `X-RateLimit-*`, `Access-Control-Allow-Origin: *`
- ⬜ Integration tests for all three endpoints

---

### ⬜ Spec 05 — Moderation Flow (v1.0)

- ⬜ `GET /api/v1/moderation/queue` (moderator, admin)
  - ⬜ Filter by `status`, `problem_type`, cursor/limit
  - ⬜ Returns `problem_type_ai`, `ai_confidence` (internal only)
- ⬜ `POST /api/v1/moderation/reports/:id/open` (moderator, admin)
  - ⬜ Redis lease: `SET moderation:lock:<id> <clerk_id> EX 900 NX`
  - ⬜ Returns `409` if locked by another moderator (with display name + expiry)
  - ⬜ Refreshes TTL if same moderator reconnects
  - ⬜ Transition: `pending_review → under_review`
- ⬜ `POST /api/v1/moderation/reports/:id/approve` (moderator, admin)
  - ⬜ Requires caller holds Redis lease
  - ⬜ Optional `problem_type_final` override
  - ⬜ `moderated_by` set server-side from JWT
  - ⬜ DELETE Redis lease
  - ⬜ Invalidate Redis cache for report and map area
  - ⬜ Publish `events:report-approved`
  - ⬜ Transition: `under_review → approved`
- ⬜ `POST /api/v1/moderation/reports/:id/reject` (moderator, admin)
  - ⬜ `rejection_reason` required
  - ⬜ Stored in DB, never returned via public API
  - ⬜ Transition: `under_review → rejected`
- ⬜ `POST /api/v1/moderation/reports/:id/reopen` (admin only)
  - ⬜ `note` required
  - ⬜ Transition: `rejected → under_review`
- ⬜ `DELETE /api/v1/moderation/reports/:id/lock` (moderator, admin)
  - ⬜ Only lease holder (or admin) can release
  - ⬜ DELETE Redis key
  - ⬜ Revert: `under_review → pending_review`
- ⬜ `GET /api/v1/moderation/feed` — SSE
  - ⬜ Redis pub/sub → SSE fan-out
  - ⬜ Event: `new_report`
  - ⬜ Event: `queue_count` every 60s
  - ⬜ Keepalive comment every 30s
- ⬜ `POST /api/v1/reports/:id/status` (gov_agency, admin)
  - ⬜ Allowed transitions: `approved → in_progress`, `in_progress → resolved`
  - ⬜ Optional `note` (shown publicly in status history)
  - ⬜ Invalidate Redis cache
- ⬜ Cron: lease expiry every 2 min
  - ⬜ SCAN `moderation:lock:*` from Redis
  - ⬜ Revert `under_review` reports without active lease → `pending_review`
  - ⬜ INSERT `report_status_history` with `note = 'lease_expired'`
- ⬜ Cron: archive daily at 03:00 Yerevan time
  - ⬜ `resolved` + older than 90 days → `archived`
  - ⬜ `approved` + no gov action for 365 days → `archived`
- ⬜ Integration tests for all state transitions and lease logic

---

### ⬜ Spec 07 — MCP Server (v1.1)

- ⬜ `McpServer` setup (`@modelcontextprotocol/sdk`)
- ⬜ Stdio transport
- ⬜ HTTP + SSE transport
- ⬜ Tool: `get_reports`
  - ⬜ Zod input schema (bbox or lat+lng required)
  - ⬜ Calls `GET /api/v1/public/reports`
  - ⬜ Formatted list output
- ⬜ Tool: `get_report`
  - ⬜ Calls `GET /api/v1/public/reports/:id`
  - ⬜ Full detail output
- ⬜ Tool: `get_stats`
  - ⬜ Calls `GET /api/v1/public/stats`
  - ⬜ Human-readable summary output
- ⬜ Tool: `create_report` (API key required)
  - ⬜ Calls `POST /api/v1/reports`
  - ⬜ `api_key` forwarded as `X-Api-Key` header, never logged
  - ⬜ Handles `photo_url` (server fetches + uploads to R2)
- ⬜ Tool: `update_status` (API key required)
  - ⬜ Calls `POST /api/v1/reports/:id/status`
  - ⬜ `api_key` forwarded, never logged
- ⬜ Error mapping: API errors → MCP `isError: true` responses
- ⬜ Input validation with Zod before hitting API
- ⬜ Armenia bounds validation on coordinates

---

### ⬜ Spec 08 — User Profile (v1.0)

- ⬜ `GET /api/v1/me`
  - ⬜ Returns profile + stats (`reports_submitted`, `reports_approved`, `reports_resolved`, `confirmations_given`)
  - ⬜ Stats cached in Redis (`cache:profile:stats:<clerk_id>`, TTL 5min)
  - ⬜ No `is_banned`, `reports_today` in response
- ⬜ `GET /api/v1/me/reports`
  - ⬜ Cursor-based pagination, filter by status
  - ⬜ Rejected reports included (no `rejection_reason`)
  - ⬜ Canonical `problem_type` = `COALESCE(problem_type_final, problem_type_user)`
- ⬜ `GET /api/v1/me/reports/:id`
  - ⬜ Returns `problem_type_user`, `problem_type_ai`, `ai_confidence` (owner only)
  - ⬜ Returns `404` (not `403`) if report belongs to another user
  - ⬜ `ai_raw_response`, `moderated_by`, `rejection_reason` never returned
  - ⬜ `status_history` — public transitions only, gov agency notes shown
- ⬜ `GET /api/v1/me/confirmations`
  - ⬜ Cursor-based pagination
- ⬜ `POST /api/v1/reports/:id/confirm`
  - ⬜ Only on `approved` / `in_progress` reports
  - ⬜ Cannot confirm own report
  - ⬜ One confirmation per user per report (DB unique constraint)
  - ⬜ `confirmation_count + 1` in same DB transaction
  - ⬜ Rate limit: 50/hour
- ⬜ `DELETE /api/v1/reports/:id/confirm`
  - ⬜ `confirmation_count - 1` in same DB transaction
  - ⬜ `confirmation_count >= 0` enforced by DB constraint
- ⬜ Integration tests for all endpoints and edge cases

---

## Frontend — Web (`apps/web`)

- ⬜ Clerk Provider setup
- ⬜ Sign-in / sign-up page
- ⬜ Auth state management
- ⬜ Map view (MapLibre GL)
- ⬜ Report markers + client-side clustering (supercluster)
- ⬜ Report submission form (two-step flow)
- ⬜ User profile page
- ⬜ Moderator dashboard (queue + SSE)
- ⬜ i18n (Armenian / Russian / English) via `next-intl`

## Frontend — Mobile (`apps/mobile`)

- ⬜ Clerk Expo integration
- ⬜ Sign-in screen
- ⬜ Map view (React Native Maps)
- ⬜ Report submission (camera + location)
- ⬜ User profile screen

---

## Implementation Order

1. 🔄 **Spec 06** — Auth & Roles (backend) ← current
2. ⬜ **Spec 01** — Database schema (Prisma migrations)
3. ⬜ **Spec 04** — Public Map API (first public-facing feature)
4. ⬜ **Spec 02** — Report Submission
5. ⬜ **Spec 03** — AI Classification (BullMQ worker)
6. ⬜ **Spec 05** — Moderation Flow
7. ⬜ **Spec 08** — User Profile
8. ⬜ **Spec 07** — MCP Server
9. ⬜ **Web frontend**
10. ⬜ **Mobile frontend**
