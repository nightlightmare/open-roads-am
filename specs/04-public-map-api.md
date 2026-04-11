# Spec 04 — Public Map API

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

The public map API provides read-only access to approved reports. No authentication required. All endpoints are rate limited by IP and cached in Redis. This is the API the web and mobile map views consume, and the same API exposed externally for journalists, developers, and government agencies.

Base path: `/api/v1/public/`

---

## Design Principles

- **No auth required** — fully open, but rate limited
- **Only approved reports** — `status IN ('approved', 'in_progress', 'resolved')`. Pending and rejected reports are never returned.
- **No PII** — `user_id` is never included. Author information is not exposed.
- **Resolved reports** — included in responses but only when client explicitly requests them via `include_resolved=true`. Default: excluded.
- **Pagination** — all list endpoints use cursor-based pagination, not offset (safe for large datasets)
- **Caching** — responses cached in Redis. TTL varies by endpoint.

---

## Endpoints

---

### `GET /api/v1/public/reports`

Returns reports within a map viewport or radius. The primary endpoint for the map view.

#### Query parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `bbox` | string | one of bbox/lat+lng | — | Bounding box: `west,south,east,north` (WGS84). Max area: 2° × 2°. |
| `lat` | number | one of bbox/lat+lng | — | Center latitude for radius query |
| `lng` | number | one of bbox/lat+lng | — | Center longitude for radius query |
| `radius_km` | number | with lat+lng | 5 | Radius in km. Max: 50. |
| `problem_type` | string | no | all | Comma-separated list of types: `pothole,hazard,...` |
| `include_resolved` | boolean | no | false | Include reports with `status = resolved` |
| `cursor` | string | no | — | Opaque pagination cursor from previous response |
| `limit` | number | no | 100 | Max results per page. Max: 500. |

**Either `bbox` or (`lat` + `lng`) is required.** If both are provided, `bbox` takes precedence.

**bbox max area enforcement:** if the requested bbox exceeds 2°×2°, return `400 BBOX_TOO_LARGE`. The client must zoom in.

#### PostGIS query (bbox mode)

```sql
SELECT
  id, status, problem_type_final, problem_type_user,
  ST_X(location) AS longitude,
  ST_Y(location) AS latitude,
  address_raw, region_id, confirmation_count, created_at
FROM reports
WHERE
  deleted_at IS NULL
  AND status IN ('approved', 'in_progress')  -- resolved added if include_resolved=true
  AND ST_Within(location, ST_MakeEnvelope($west, $south, $east, $north, 4326))
  AND ($problem_types IS NULL OR problem_type_user = ANY($problem_types))
ORDER BY created_at DESC
LIMIT $limit
```

Canonical `problem_type` returned to client = `COALESCE(problem_type_final, problem_type_user)`.

#### Response `200 OK`

```json
{
  "reports": [
    {
      "id": "uuid",
      "status": "approved",
      "problem_type": "pothole",
      "latitude": 40.1872,
      "longitude": 44.5152,
      "address_raw": "ул. Абовяна, Ереван",
      "confirmation_count": 3,
      "created_at": "2026-04-10T08:00:00Z",
      "photo_url": "https://...signed-url...",
      "region_id": "uuid"
    }
  ],
  "cursor": "opaque-string-or-null",
  "total_in_area": 142
}
```

**`photo_url`** — signed R2 URL (optimized variant if available, else original). TTL 1 hour. Generated per-request.

**`total_in_area`** — approximate count for the full area (ignores pagination). Computed via `COUNT(*)` with the same WHERE clause, cached in Redis 60s.

#### Caching

- Cache key: `map:reports:<hash(bbox|lat,lng,radius,types,include_resolved)>`
- TTL: **30 seconds** — short enough that new approved reports appear quickly
- Cache is invalidated immediately when a report transitions to `approved` status

---

### `GET /api/v1/public/reports/:id`

Returns full detail for a single report.

#### Response `200 OK`

```json
{
  "id": "uuid",
  "status": "in_progress",
  "problem_type": "pothole",
  "description": "Глубокая выбоина, опасна для велосипедистов",
  "latitude": 40.1872,
  "longitude": 44.5152,
  "address_raw": "ул. Абовяна, Ереван",
  "region_id": "uuid",
  "confirmation_count": 7,
  "photo_url": "https://...signed-url...",
  "photo_thumbnail_url": "https://...signed-url...",
  "status_history": [
    { "status": "approved", "changed_at": "2026-04-10T09:00:00Z" },
    { "status": "in_progress", "changed_at": "2026-04-11T14:00:00Z" }
  ],
  "created_at": "2026-04-10T08:00:00Z",
  "updated_at": "2026-04-11T14:00:00Z"
}
```

**Not included:** `user_id`, `moderated_by`, `ai_raw_response`, `ai_confidence`, `problem_type_ai`, `problem_type_user`, `problem_type_final` (raw fields), `photo_original_key`, `rejection_reason`.

**`status_history`** — only public-facing transitions shown: `approved → in_progress → resolved`. Internal transitions (`pending_review`, `under_review`, `rejected`) are excluded.

#### Caching

- Cache key: `report:<id>`
- TTL: **5 minutes**
- Invalidated immediately on any status change

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `404` | `NOT_FOUND` | Report doesn't exist, is deleted, or has non-public status |

---

### `GET /api/v1/public/stats`

Aggregate statistics for a region or the whole country. Used for dashboards, media, and the MCP server.

#### Query parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `region_id` | uuid | no | Filter by region. If omitted, returns national stats. |
| `problem_type` | string | no | Filter by type |
| `from` | ISO date | no | Start date (inclusive). Default: 30 days ago. |
| `to` | ISO date | no | End date (inclusive). Default: today. |

Max date range: 365 days. If exceeded, return `400 DATE_RANGE_TOO_LARGE`.

#### Response `200 OK`

```json
{
  "total_reports": 1842,
  "by_status": {
    "approved": 1204,
    "in_progress": 312,
    "resolved": 326
  },
  "by_type": {
    "pothole": 890,
    "missing_marking": 310,
    "damaged_sign": 205,
    "hazard": 180,
    "broken_light": 155,
    "other": 102
  },
  "resolution_rate_pct": 21.3,
  "avg_days_to_in_progress": 14.2,
  "period": {
    "from": "2026-03-12",
    "to": "2026-04-11"
  }
}
```

#### Caching

- TTL: **5 minutes**
- Stats are eventually consistent — acceptable for this use case

---

### `GET /api/v1/public/heatmap`

Returns aggregated point density data for heatmap rendering. Returns grid cells with report counts, not individual report coordinates.

#### Query parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `bbox` | string | yes | `west,south,east,north`. Max 5°×5° for heatmap. |
| `problem_type` | string | no | Filter by type |
| `include_resolved` | boolean | no | false |

#### Implementation

Uses PostGIS `ST_SnapToGrid` to aggregate points into cells. Cell size varies by bbox area:
- bbox < 0.5°×0.5° → 0.005° cells (~500m)
- bbox < 2°×2° → 0.02° cells (~2km)
- bbox ≥ 2°×2° → 0.05° cells (~5km)

```sql
SELECT
  ST_X(ST_SnapToGrid(location, $cell_size)) AS cell_lng,
  ST_Y(ST_SnapToGrid(location, $cell_size)) AS cell_lat,
  COUNT(*) AS count
FROM reports
WHERE
  deleted_at IS NULL
  AND status IN ('approved', 'in_progress')
  AND ST_Within(location, ST_MakeEnvelope($west, $south, $east, $north, 4326))
GROUP BY cell_lng, cell_lat
```

#### Response `200 OK`

```json
{
  "cell_size_deg": 0.02,
  "cells": [
    { "lat": 40.18, "lng": 44.52, "count": 14 },
    { "lat": 40.20, "lng": 44.50, "count": 6 }
  ]
}
```

#### Caching

- TTL: **2 minutes**

---

## Clustering

Clustering is **client-side** using MapLibre GL with supercluster. The API returns individual report points (up to 500 per request); the client clusters them based on zoom level.

**Rationale:** server-side clustering via `ST_ClusterDBSCAN` was considered but rejected for v1 because:
- Client supercluster is fast enough for ≤500 points
- Server-side clustering complicates pagination and detail drill-down
- Cluster boundaries would need to be recomputed on every filter change

If the dataset grows beyond 500 visible points in a single viewport, revisit server-side clustering in v2.

---

## Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| `GET /reports` | 60 req | per minute per IP |
| `GET /reports/:id` | 120 req | per minute per IP |
| `GET /stats` | 30 req | per minute per IP |
| `GET /heatmap` | 30 req | per minute per IP |

On `429`: `Retry-After` header included.

Cloudflare WAF provides an additional IP-level layer before requests reach the API.

---

## Security

- No authentication required — these are fully public endpoints
- `user_id`, `moderated_by`, `ai_raw_response`, `rejection_reason` — never returned
- `photo_url` — signed R2 URL with 1h TTL. Never expose raw R2 keys.
- All query params validated with Zod before hitting DB
- bbox/radius limits enforced to prevent expensive full-table geo scans
- SQL parameters always via prepared statements — no string interpolation

---

## HTTP Headers

All public API responses include:

```
Cache-Control: public, max-age=30
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 47
X-RateLimit-Reset: <unix timestamp>
Access-Control-Allow-Origin: *
```

CORS is fully open for public endpoints (`*`) — these are meant to be consumed by any client.

---

## Out of Scope (v1)

- GeoJSON export endpoint (planned: `?format=geojson`)
- CSV/Excel export
- Webhooks for new approved reports
- Full-text search on description
- Time-series endpoint (reports per day over a period)
