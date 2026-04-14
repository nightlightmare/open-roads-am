# Spec 16 — Area Subscriptions

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Area subscriptions let users monitor specific geographic areas and receive notifications when new approved reports appear within those areas. This drives local engagement — residents who care about their neighborhood, commuters who want to know about hazards on their route, and community watchdogs tracking infrastructure decline in a specific marz.

The feature builds on the notification infrastructure defined in Spec 12 (Push Notifications) by introducing a new event type `area.new_report` and leveraging PostGIS spatial queries to match new reports against subscription areas.

**Goal:** Allow any authenticated user to subscribe to up to 10 geographic areas and receive batched notifications (at most 1 per area per hour) when new approved reports appear within those areas.

---

## Subscription Types

### Circle Subscription

The simplest and most common type. The user picks a center point and a radius.

| Parameter | Type | Constraints |
|---|---|---|
| `center_lat` | `float8` | Required. Armenia bounding box: `38.8–41.4` (with 50km buffer: `38.3–41.9`) |
| `center_lng` | `float8` | Required. Armenia bounding box: `43.4–46.7` (with 50km buffer: `42.9–47.2`) |
| `radius_km` | `float4` | Required. Range: `1.0–10.0` (step: 0.5) |

**UX:** The user clicks a point on the map (or uses "Subscribe to this area" from the current viewport center) and adjusts the radius with a slider. A dashed circle preview shows the subscription area before confirming.

**Spatial matching:** `ST_DWithin(report.location, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius_km * 1000)` — uses the geography cast for accurate meter-based distance on the Earth's surface.

### Region Subscription

Links to an existing entry in the `regions` table (Spec 01). Users subscribe to a marz, city, or district by selecting it from a dropdown or clicking a region on the map.

| Parameter | Type | Constraints |
|---|---|---|
| `region_id` | `uuid` | Required. FK → `regions.id`. Must be a valid, existing region. |

**Spatial matching:** `ST_Within(report.location, region.boundary)` — checks if the report's point falls inside the region's polygon boundary. Uses the existing GIST index on `regions.boundary`.

### Custom Polygon (v2 — Out of Scope)

User draws a freeform polygon on the map. Deferred to v2 because it requires a polygon drawing UI, polygon simplification (to prevent absurdly complex shapes), and storage of arbitrary geometry. The subscription table schema already accommodates this via an optional `polygon` column reserved for v2.

---

## Database

### Table: `area_subscriptions`

```sql
CREATE TABLE area_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,               -- 'circle' | 'region'
  center      geometry(Point, 4326),       -- required for circle, null for region
  radius_km   REAL,                        -- required for circle, null for region
  region_id   UUID REFERENCES regions(id) ON DELETE CASCADE,  -- required for region, null for circle
  label       TEXT NOT NULL DEFAULT '',    -- user-chosen name, max 100 chars
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- constraints
  CONSTRAINT valid_circle CHECK (
    type != 'circle' OR (center IS NOT NULL AND radius_km IS NOT NULL AND radius_km >= 1.0 AND radius_km <= 10.0)
  ),
  CONSTRAINT valid_region CHECK (
    type != 'region' OR region_id IS NOT NULL
  ),
  CONSTRAINT valid_type CHECK (type IN ('circle', 'region'))
);
```

### Indexes

```sql
-- Find subscriptions by user (settings page)
CREATE INDEX idx_area_subscriptions_user ON area_subscriptions(user_id) WHERE is_active = true;

-- Spatial: find circle subscriptions near a given point (new report matching)
CREATE INDEX idx_area_subscriptions_center ON area_subscriptions USING GIST (center) WHERE type = 'circle' AND is_active = true;

-- Region subscriptions for a given region
CREATE INDEX idx_area_subscriptions_region ON area_subscriptions(region_id) WHERE type = 'region' AND is_active = true;
```

### Prisma Schema

```prisma
model AreaSubscription {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  type      String    // circle | region
  center    Unsupported("geometry(Point, 4326)")?
  radiusKm  Float?    @map("radius_km") @db.Real
  regionId  String?   @map("region_id") @db.Uuid
  label     String    @default("")
  isActive  Boolean   @default(true) @map("is_active")
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  region Region? @relation(fields: [regionId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("area_subscriptions")
}
```

**Note on PostGIS geometry:** Prisma does not natively support PostGIS geometry types. The `center` column uses `Unsupported(...)` in the schema. All spatial queries (inserts with `ST_SetSRID(ST_MakePoint(...))`, reads with `ST_X/ST_Y`) are done via `$queryRaw` with explicit type casts, consistent with the approach in Spec 01 and Spec 04.

### Subscription Limit

Max **10 active subscriptions** per user. Enforced at the application level before INSERT:

```typescript
const activeCount = await prisma.areaSubscription.count({
  where: { userId, isActive: true },
})
if (activeCount >= 10) {
  throw new AppError(400, 'SUBSCRIPTION_LIMIT_REACHED', 'Maximum 10 active subscriptions allowed')
}
```

**Why 10?** Balances user freedom with notification fan-out cost. 10 subscriptions * ~3 new reports/area/day = ~30 notification checks per user per day, which is manageable.

---

## Notification Trigger

### When a Report is Approved

The notification matching happens **after** a report transitions to `approved` status (either via manual moderation per Spec 05, or auto-approve per Spec 18). This is the single trigger point — not on report creation (which would notify about unverified reports).

### Matching Algorithm

```
Report approved (status → approved)
  ↓
Redis publish: events:report-approved (already exists per Spec 05)
  ↓
Notification dispatcher receives event (Spec 12)
  ↓
Dispatcher calls matchAreaSubscriptions(reportId, latitude, longitude)
  ↓
Single SQL query finds all matching active subscriptions:
```

```sql
SELECT DISTINCT s.id, s.user_id, s.label
FROM area_subscriptions s
LEFT JOIN regions r ON s.region_id = r.id
WHERE s.is_active = true
  AND (
    -- Circle match: report within radius
    (s.type = 'circle' AND ST_DWithin(
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      s.center::geography,
      s.radius_km * 1000
    ))
    OR
    -- Region match: report within region boundary
    (s.type = 'region' AND ST_Within(
      ST_SetSRID(ST_MakePoint($1, $2), 4326),
      r.boundary
    ))
  )
```

Where `$1` = report longitude, `$2` = report latitude.

### Deduplication

- **Report author exclusion:** The query adds `AND s.user_id != $3` (report's `user_id`). Users are not notified about their own reports appearing in their subscribed areas.
- **Batching (1 per area per hour):** Before enqueuing a notification for subscription `s.id`, check Redis:
  ```
  Redis key: area_notify:{subscription_id}
  Type: string with TTL
  TTL: 3600 seconds (1 hour)
  ```
  If the key exists, the notification is added to a pending batch (Redis list `area_batch:{subscription_id}`). When the TTL expires, a scheduled job sends a single batched notification summarizing all reports in that hour.

  If the key does not exist, the notification is sent immediately and the key is set with TTL 3600.

### Notification Job

For each matching subscription (after dedup), enqueue to the existing `notifications` queue (Spec 12):

```typescript
const job: NotificationJobData = {
  userId: subscription.userId,
  channel: resolvedChannel, // determined by user preferences
  eventType: 'area.new_report',
  payload: {
    // channel-specific, see Spec 12
    subscriptionLabel: subscription.label,
    reportCount: 1, // or N for batched
    reports: [{ id, problemType, addressRaw }],
  },
  triggeredAt: new Date().toISOString(),
}
```

### Notification Content

**Telegram (single report):**
```
📍 New report in "My Neighborhood"

Type: Pothole
Address: Abovyan St, Yerevan

View on map: https://open-road.am/reports/abc123
```

**Telegram (batched, 3 reports in 1 hour):**
```
📍 3 new reports in "My Neighborhood"

• Pothole — Abovyan St
• Damaged sign — Tumanyan St
• Missing marking — Mashtots Ave

View all: https://open-road.am/map?area=subscription_id
```

**Email:** Similar content, sent only if user has email enabled for `area.new_report` (default: disabled per Spec 12).

---

## API Endpoints

All endpoints require Clerk JWT authentication.

### GET /api/v1/me/subscriptions

Returns the current user's area subscriptions.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `active_only` | boolean | `true` | If `true`, only return active subscriptions |

**Response `200 OK`:**

```json
{
  "subscriptions": [
    {
      "id": "uuid",
      "type": "circle",
      "centerLat": 40.1872,
      "centerLng": 44.5152,
      "radiusKm": 3.0,
      "regionId": null,
      "regionName": null,
      "label": "My Neighborhood",
      "isActive": true,
      "createdAt": "2026-04-10T08:00:00Z"
    },
    {
      "id": "uuid",
      "type": "region",
      "centerLat": null,
      "centerLng": null,
      "radiusKm": null,
      "regionId": "uuid",
      "regionName": "Yerevan",
      "label": "Yerevan City",
      "isActive": true,
      "createdAt": "2026-04-11T09:00:00Z"
    }
  ],
  "total": 2,
  "limit": 10
}
```

The `limit` field tells the frontend how many more subscriptions can be created. `centerLat` and `centerLng` are extracted from the PostGIS `center` point via `ST_Y(center)` and `ST_X(center)`.

---

### POST /api/v1/me/subscriptions

Creates a new area subscription.

**Request body (Zod schema):**

```typescript
const CreateCircleSubscriptionSchema = z.object({
  type: z.literal('circle'),
  centerLat: z.number().min(38.3).max(41.9),
  centerLng: z.number().min(42.9).max(47.2),
  radiusKm: z.number().min(1.0).max(10.0).multipleOf(0.5),
  label: z.string().max(100).default(''),
})

const CreateRegionSubscriptionSchema = z.object({
  type: z.literal('region'),
  regionId: z.string().uuid(),
  label: z.string().max(100).default(''),
})

const CreateSubscriptionSchema = z.discriminatedUnion('type', [
  CreateCircleSubscriptionSchema,
  CreateRegionSubscriptionSchema,
])
```

**Processing:**

1. Validate request body with Zod
2. Check subscription count limit (max 10 active)
3. For region type: verify `regionId` exists in `regions` table (return `404` if not)
4. For circle type: validate coordinates are within Armenia bounds + buffer
5. INSERT into `area_subscriptions`
6. Return the created subscription

**Response `201 Created`:**

```json
{
  "id": "uuid",
  "type": "circle",
  "centerLat": 40.1872,
  "centerLng": 44.5152,
  "radiusKm": 3.0,
  "label": "My Neighborhood",
  "isActive": true,
  "createdAt": "2026-04-10T08:00:00Z"
}
```

**Error responses:**

| Code | Condition |
|---|---|
| `400` | Invalid body, coordinates out of bounds, invalid radius |
| `400` | `SUBSCRIPTION_LIMIT_REACHED` — already 10 active subscriptions |
| `404` | Region not found (for region type) |

---

### PATCH /api/v1/me/subscriptions/:id

Updates an existing subscription. Only `label` and `is_active` can be changed — the geometry/region cannot be modified (delete and recreate instead).

**Request body (Zod schema):**

```typescript
const UpdateSubscriptionSchema = z.object({
  label: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
}).refine(data => data.label !== undefined || data.isActive !== undefined, {
  message: 'At least one field must be provided',
})
```

**Processing:**

1. Validate request body
2. Verify subscription exists and belongs to current user (return `404` if not)
3. If activating (`isActive: true`): check subscription count limit (max 10 active)
4. UPDATE the subscription
5. Return updated subscription

**Response `200 OK`:**

```json
{
  "id": "uuid",
  "label": "Updated Label",
  "isActive": false,
  "updatedAt": "2026-04-12T10:00:00Z"
}
```

---

### DELETE /api/v1/me/subscriptions/:id

Permanently deletes a subscription. This is a hard delete — no soft delete needed for subscriptions since they carry no audit value.

**Processing:**

1. Verify subscription exists and belongs to current user (return `404` if not)
2. DELETE from `area_subscriptions`
3. Clean up Redis keys: `area_notify:{id}`, `area_batch:{id}`

**Response `200 OK`:**

```json
{ "deleted": true }
```

---

## Frontend

### Settings Page — Subscription List

Located at `/settings/subscriptions`. Shows a list of the user's subscriptions with:

- Subscription label (or auto-generated name like "3km around Abovyan St")
- Type badge: "Circle 3km" or "Yerevan (region)"
- Active/inactive toggle
- Delete button with confirmation dialog
- "Add subscription" button (disabled if at limit, with tooltip "Maximum 10 subscriptions")

### Map Integration — "Subscribe to This Area"

A button in the map controls panel. When clicked:

1. Takes the current map viewport center as the subscription center
2. Opens a bottom sheet / modal with:
   - Map preview showing the center point and a dashed circle
   - Radius slider (1–10 km, step 0.5)
   - Label input (optional, placeholder: "e.g. My commute route")
   - "Subscribe" button
3. On confirm: calls `POST /api/v1/me/subscriptions` and adds the subscription to the map

### Map Visualization

Active subscriptions are shown on the map as dashed circles (for circle type) or highlighted region boundaries (for region type):

- **Circle:** Dashed blue circle, 2px width, 20% fill opacity
- **Region:** Region boundary highlighted with dashed blue outline, 10% fill opacity
- Only shown when the user is logged in and has active subscriptions
- Toggle in map layer controls: "Show my subscription areas"
- Subscriptions are loaded once on map init and cached client-side

**MapLibre implementation:**

```typescript
// Add subscription areas as a GeoJSON source
map.addSource('subscriptions', {
  type: 'geojson',
  data: subscriptionsGeoJSON, // circles converted to polygon approximations (64 vertices)
})

map.addLayer({
  id: 'subscription-fill',
  type: 'fill',
  source: 'subscriptions',
  paint: {
    'fill-color': '#3B82F6',
    'fill-opacity': 0.1,
  },
})

map.addLayer({
  id: 'subscription-outline',
  type: 'line',
  source: 'subscriptions',
  paint: {
    'line-color': '#3B82F6',
    'line-width': 2,
    'line-dasharray': [4, 4],
  },
})
```

Circle subscriptions are converted to GeoJSON polygon approximations (64-vertex circles) client-side using `@turf/circle`.

---

## Integration with Spec 12 (Push Notifications)

### New Event Type

| Event ID | Trigger | Channels | Priority |
|---|---|---|---|
| `area.new_report` | New approved report in subscribed area | Telegram, Email (digest) | Low |

This event is already referenced in Spec 12's notification events table. The `area.new_report` event:

- Respects user notification preferences (Spec 12's `notification_preferences` table)
- Is subject to the global notification rate limit (max 10 notifications per user per 60s)
- Defaults: Telegram enabled (if linked), Email disabled
- Area notifications are batched: at most 1 notification per subscription per hour

### Dispatcher Integration

The notification dispatcher (Spec 12) is extended to listen for `events:report-approved` and, in addition to notifying the report author, run the area subscription matching query:

```typescript
// In notification-dispatcher.ts, extend the 'events:report-approved' handler:
case 'events:report-approved':
  await dispatchAuthorNotification(event, notificationQueue, db)
  await dispatchAreaSubscriptionNotifications(event, notificationQueue, db, redis)
  break
```

---

## Rate Limiting & Validation

### API Rate Limits

| Endpoint | Rate Limit | Window |
|---|---|---|
| `POST /api/v1/me/subscriptions` | 5 requests | per minute |
| `PATCH /api/v1/me/subscriptions/:id` | 10 requests | per minute |
| `DELETE /api/v1/me/subscriptions/:id` | 10 requests | per minute |
| `GET /api/v1/me/subscriptions` | 30 requests | per minute |

### Coordinate Validation

All coordinates are validated against the Armenia bounding box with a 50km buffer, consistent with Spec 01:

```typescript
const ArmeniaCoordinatesSchema = z.object({
  lat: z.number().min(38.3).max(41.9),
  lng: z.number().min(42.9).max(47.2),
})
```

Coordinates outside this range are rejected with `400 BAD_REQUEST` and a message: "Coordinates must be within Armenia."

### Region Validation

Region IDs are validated against the `regions` table. Subscribing to a non-existent region returns `404`. Subscribing to the same region twice is allowed (user might want different labels) but the matching query deduplicates notifications.

---

## Security

- Subscriptions are private — a user can only see and manage their own subscriptions
- No public API for subscriptions (all endpoints under `/api/v1/me/`)
- Subscription center coordinates are never exposed in public responses (they could reveal a user's home location)
- Notification messages for area subscriptions use the report's address, not the subscription center
- The matching SQL query uses parameterized queries to prevent injection

---

## Testing

### Unit Tests

- Zod schema validation: valid circle, valid region, invalid coordinates, missing fields
- Subscription limit enforcement: allow 10th, reject 11th
- Deduplication logic: report author not notified, batching within 1-hour window

### Integration Tests

- Full subscription CRUD: create circle → list → update label → deactivate → delete
- Region subscription: create with valid region → list shows region name
- Spatial matching: create subscription → approve report inside area → verify notification job enqueued
- Spatial matching negative: approve report outside subscription area → no notification
- Subscription limit: create 10 → attempt 11th → 400 error

### E2E Tests

- Subscriptions API: auth required (401 without JWT)
- Create circle subscription → GET returns it
- Create region subscription → GET returns it with region name
- Delete subscription → GET no longer returns it
- PATCH toggle isActive → verify response

---

## Out of Scope for v1

- **Custom polygon subscriptions** — user-drawn polygons on the map. Requires polygon drawing UI, simplification, and potentially large geometry storage. Deferred to v2.
- **Subscription sharing** — sharing a subscription area with another user or making it public. Not needed for initial launch.
- **Smart suggestions** — "Subscribe to your area?" prompt based on report submission location. Nice UX enhancement for v2.
- **Area subscription analytics** — showing the user stats about their subscribed areas (e.g., "3 new reports this week in your area"). Deferred to v2.
- **Road network intersection** — subscription areas that follow road segments rather than circles/regions. Requires road geometry data. Far future.
- **Notification frequency settings per subscription** — all subscriptions use the same 1-per-hour batching. Per-subscription frequency control is v2.
