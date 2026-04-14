# Spec 14 — Open Data Export

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Open-road.am is a civic technology project. The data it collects — geolocated, categorized, timestamped road problem reports — is a public good. Making this data freely downloadable in standard formats serves three audiences:

1. **Journalists** — investigating road infrastructure neglect, comparing regions, tracking government responsiveness
2. **Researchers** — academic analysis of urban infrastructure, GIS studies, policy evaluation
3. **NGOs and civic tech developers** — building derivative tools, cross-referencing with other open datasets, creating advocacy materials

This spec defines a public export API that streams report data in CSV, GeoJSON, and JSON formats. The export is filterable by date range, problem type, and region. All exported data is strictly limited to public fields — no PII, no internal moderation details, no user identifiers.

### Principles

- **Open by default** — no authentication required, no registration wall
- **Privacy by design** — only fields that would appear on the public map are exportable
- **Streaming** — large exports are streamed, not buffered in memory
- **Standard formats** — CSV for spreadsheets, GeoJSON for GIS tools, JSON for developers
- **Licensed** — all exports carry a CC BY 4.0 license, requiring attribution but allowing any use

---

## Export Formats

### CSV

Flat table format, compatible with Excel, Google Sheets, R, pandas. UTF-8 with BOM for Excel compatibility.

```csv
id,status,problem_type,latitude,longitude,address,region_name,confirmation_count,created_at,resolved_at
a1b2c3d4-...,approved,pothole,40.1792,44.5134,"Teryan St 48, Yerevan",Yerevan,3,2026-03-15T10:23:00Z,
e5f6g7h8-...,resolved,damaged_sign,40.7934,43.8471,"Shirak Ave 12, Gyumri",Shirak,1,2026-02-01T08:15:00Z,2026-03-20T14:30:00Z
```

### GeoJSON

Standard GeoJSON `FeatureCollection` with `Point` geometries. Compatible with QGIS, MapLibre, Leaflet, ArcGIS, kepler.gl.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [44.5134, 40.1792]
      },
      "properties": {
        "id": "a1b2c3d4-...",
        "status": "approved",
        "problem_type": "pothole",
        "address": "Teryan St 48, Yerevan",
        "region_name": "Yerevan",
        "confirmation_count": 3,
        "created_at": "2026-03-15T10:23:00Z",
        "resolved_at": null
      }
    }
  ],
  "metadata": {
    "exported_at": "2026-04-14T12:00:00Z",
    "total_features": 1842,
    "license": "CC BY 4.0",
    "source": "open-road.am",
    "period": {
      "from": "2026-01-01",
      "to": "2026-04-14"
    }
  }
}
```

**Note:** GeoJSON `coordinates` are `[longitude, latitude]` per the RFC 7946 standard.

### JSON

Array of report objects, identical structure to `GET /api/v1/public/reports` individual report responses but as a bulk download. Wrapped in a metadata envelope.

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "status": "approved",
      "problem_type": "pothole",
      "latitude": 40.1792,
      "longitude": 44.5134,
      "address": "Teryan St 48, Yerevan",
      "region_name": "Yerevan",
      "confirmation_count": 3,
      "created_at": "2026-03-15T10:23:00Z",
      "resolved_at": null
    }
  ],
  "metadata": {
    "exported_at": "2026-04-14T12:00:00Z",
    "total_records": 1842,
    "license": "CC BY 4.0",
    "source": "open-road.am",
    "format_version": "1.0"
  }
}
```

---

## Data Fields

### Included (public only)

| Field | Source | Notes |
|---|---|---|
| `id` | `reports.id` | UUID |
| `status` | `reports.status` | Only: `approved`, `in_progress`, `resolved`, `archived` |
| `problem_type` | `COALESCE(problem_type_final, problem_type_user)` | Canonical type |
| `latitude` | `ST_Y(reports.location)` | WGS84 |
| `longitude` | `ST_X(reports.location)` | WGS84 |
| `address` | `reports.address_raw` | Reverse-geocoded address |
| `region_name` | `regions.name_en` (or locale-appropriate) | Marz/city name |
| `confirmation_count` | `COUNT(report_confirmations)` | Number of other users who confirmed |
| `created_at` | `reports.created_at` | ISO 8601 with timezone |
| `resolved_at` | From `report_status_history` | Timestamp when status changed to `resolved`. Null if unresolved. |

### Excluded (never exported)

| Field | Reason |
|---|---|
| `user_id` | PII — author identity |
| `description` | May contain PII (names, phone numbers, personal details) |
| `rejection_reason` | Internal moderation detail |
| `moderated_by` | Internal — moderator identity |
| `moderated_at` | Internal moderation detail |
| `ai_confidence` | Internal classification detail |
| `ai_raw_response` | Internal, potentially large |
| `photo_original_key` | R2 internal path, not useful without signed URL |
| `photo_optimized_key` | Same |
| `deleted_at` | Soft-deleted reports are excluded entirely |

**Reports with `status IN ('pending_review', 'under_review', 'rejected')` are never exported.** Only publicly visible reports are included.

---

## API Endpoint

### `GET /api/v1/public/export`

Streams the export data in the requested format.

#### Query parameters

| Param | Type | Required | Default | Validation |
|---|---|---|---|---|
| `format` | string | yes | — | One of: `csv`, `geojson`, `json` |
| `from` | ISO date | no | 30 days ago | Start date (inclusive) |
| `to` | ISO date | no | today | End date (inclusive) |
| `problem_type` | string | no | all types | Comma-separated: `pothole,hazard` |
| `region_id` | uuid | no | all regions | Filter by region |
| `status` | string | no | all public statuses | Comma-separated: `approved,resolved`. Only public statuses allowed. |
| `locale` | string | no | `en` | `hy`, `en`, `ru` — affects `region_name` column |

#### Validation rules

- `format` is required — return `400 FORMAT_REQUIRED` if missing
- Max date range: **365 days**. Return `400 DATE_RANGE_TOO_LARGE` if exceeded.
- `from` must be before `to`. Return `400 INVALID_DATE_RANGE` if not.
- `from` cannot be in the future. Return `400 FUTURE_DATE` if so.
- All parameters validated via Zod (schema below).

#### Response headers

**CSV:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="openroad-export-2026-04-14.csv"
Transfer-Encoding: chunked
```

**GeoJSON:**
```
Content-Type: application/geo+json; charset=utf-8
Content-Disposition: attachment; filename="openroad-export-2026-04-14.geojson"
Transfer-Encoding: chunked
```

**JSON:**
```
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="openroad-export-2026-04-14.json"
Transfer-Encoding: chunked
```

#### Error responses

| Status | Code | Condition |
|---|---|---|
| `400` | `FORMAT_REQUIRED` | `format` param missing |
| `400` | `INVALID_FORMAT` | `format` not one of csv/geojson/json |
| `400` | `DATE_RANGE_TOO_LARGE` | Range exceeds 365 days |
| `400` | `INVALID_DATE_RANGE` | `from` > `to` |
| `400` | `FUTURE_DATE` | `from` is in the future |
| `429` | `RATE_LIMIT_EXCEEDED` | Too many exports |

---

## Implementation

### Streaming architecture

Exports must stream data to the client — never buffer the entire dataset in memory. This is critical for large exports (potentially tens of thousands of rows).

```
Client request
  → Fastify handler validates params
  → PostgreSQL cursor opened (DECLARE ... CURSOR)
  → Rows fetched in batches of 500
  → Each batch transformed to format (CSV rows / GeoJSON features / JSON objects)
  → Streamed to client via reply.raw (Node.js Writable stream)
  → Cursor closed on completion or client disconnect
```

### CSV implementation: PostgreSQL COPY TO

For CSV exports, use PostgreSQL's native `COPY TO STDOUT WITH CSV HEADER` for maximum performance. This bypasses ORM overhead entirely.

```sql
COPY (
  SELECT
    r.id,
    r.status,
    COALESCE(r.problem_type_final, r.problem_type_user) AS problem_type,
    ST_Y(r.location) AS latitude,
    ST_X(r.location) AS longitude,
    r.address_raw AS address,
    COALESCE(reg.name_en, '') AS region_name,
    COALESCE(rc.confirmation_count, 0) AS confirmation_count,
    r.created_at,
    rsh.resolved_at
  FROM reports r
  LEFT JOIN regions reg ON r.region_id = reg.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS confirmation_count
    FROM report_confirmations rc
    WHERE rc.report_id = r.id
  ) rc ON true
  LEFT JOIN LATERAL (
    SELECT MIN(h.created_at) AS resolved_at
    FROM report_status_history h
    WHERE h.report_id = r.id AND h.to_status = 'resolved'
  ) rsh ON true
  WHERE r.status IN ('approved', 'in_progress', 'resolved', 'archived')
    AND r.deleted_at IS NULL
    AND r.created_at >= $from AND r.created_at <= $to
  ORDER BY r.created_at DESC
) TO STDOUT WITH (FORMAT CSV, HEADER true, ENCODING 'UTF8');
```

**Note:** `COPY TO STDOUT` requires using the raw `pg` driver, not Prisma's query builder. Use `@prisma/adapter-ppg`'s underlying `pg.Client` directly for this query.

### GeoJSON implementation: ST_AsGeoJSON

```sql
SELECT
  json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(r.location)::json,
    'properties', json_build_object(
      'id', r.id,
      'status', r.status,
      'problem_type', COALESCE(r.problem_type_final, r.problem_type_user),
      'address', r.address_raw,
      'region_name', COALESCE(reg.name_en, ''),
      'confirmation_count', COALESCE(rc.confirmation_count, 0),
      'created_at', r.created_at,
      'resolved_at', rsh.resolved_at
    )
  ) AS feature
FROM reports r
LEFT JOIN regions reg ON r.region_id = reg.id
LEFT JOIN LATERAL (...) rc ON true
LEFT JOIN LATERAL (...) rsh ON true
WHERE ...
ORDER BY r.created_at DESC;
```

The handler writes the `FeatureCollection` opening, streams each feature, and writes the closing bracket + metadata.

### Fastify streaming

```typescript
fastify.get('/api/v1/public/export', async (request, reply) => {
  const params = ExportQuerySchema.parse(request.query);

  reply.raw.writeHead(200, {
    'Content-Type': contentTypeForFormat(params.format),
    'Content-Disposition': `attachment; filename="openroad-export-${today()}.${params.format === 'geojson' ? 'geojson' : params.format}"`,
    'Transfer-Encoding': 'chunked',
  });

  const cursor = await openExportCursor(params);

  try {
    await streamExport(reply.raw, cursor, params.format);
  } finally {
    await cursor.close();
  }

  reply.hijack(); // Tell Fastify we've taken over the response
});
```

---

## Rate Limiting

| Limit | Value | Scope |
|---|---|---|
| Exports per hour | 5 | per IP address |
| Exports per hour | 20 | per IP with API key (gov_agency, admin) |

Rate limit is tracked in Redis:
- Key: `ratelimit:export:<ip>`
- TTL: 3600 seconds (1 hour)
- Increment on each successful export start (not on 4xx errors)

**Why strict?** Exports are expensive — they open database cursors, stream potentially large datasets, and tie up a connection. 5 per hour per IP is generous for legitimate use (a journalist running a few queries with different filters) while preventing automated scraping.

On `429`:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Maximum 5 exports per hour. Try again in 42 minutes.",
  "retry_after_seconds": 2520
}
```

---

## Frontend

### Export UI on Analytics Dashboard

The export functionality is accessed from the Analytics Dashboard page (Spec 13). An "Export Data" button is placed in the filter bar area.

#### Export flow

1. User clicks "Export Data" button on the analytics dashboard
2. A modal/drawer opens with:
   - **Format selector:** radio buttons for CSV, GeoJSON, JSON. Default: CSV.
   - **Date range picker:** two date inputs (`from`, `to`). Pre-filled from the dashboard's current period filter.
   - **Problem type filter:** multi-select dropdown. Pre-filled from the dashboard's current filter.
   - **Region filter:** dropdown. Pre-filled from the dashboard's current filter.
   - **Estimated row count:** shown after filters are set (fetched from a lightweight count endpoint or the analytics overview data already loaded)
3. User clicks "Download"
4. Browser initiates download via `<a href="..." download>` or `window.location.assign(...)`
5. Download starts streaming. The modal shows "Downloading..." state.
6. On completion, the modal closes.

#### Component structure

```
<ExportButton />
  → opens <ExportModal>
    <FormatSelector />      // radio: CSV, GeoJSON, JSON
    <DateRangePicker />     // from/to date inputs
    <ProblemTypeFilter />   // multi-select
    <RegionFilter />        // dropdown
    <EstimatedCount />      // "~1,842 reports"
    <DownloadButton />      // triggers download
    <LicenseNotice />       // "Data licensed under CC BY 4.0"
  </ExportModal>
```

#### License notice

The export modal displays:
> "This data is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt this data for any purpose, provided you give appropriate credit to open-road.am."

---

## Open Data Standards

### DCAT Metadata

The export includes a machine-readable metadata endpoint for catalog crawlers:

#### `GET /api/v1/public/export/metadata`

Returns DCAT-AP compatible metadata in JSON-LD format:

```json
{
  "@context": "https://www.w3.org/ns/dcat#",
  "@type": "Dataset",
  "title": "Open Road Armenia — Road Problem Reports",
  "description": "Geolocated road infrastructure problem reports submitted by citizens across Armenia, including problem type, status, and resolution data.",
  "publisher": {
    "@type": "Organization",
    "name": "open-road.am"
  },
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "spatial": {
    "@type": "Place",
    "name": "Armenia",
    "geo": {
      "@type": "GeoShape",
      "box": "38.0 43.3 41.5 46.7"
    }
  },
  "temporalCoverage": "2026-01-01/..",
  "distribution": [
    {
      "@type": "Distribution",
      "encodingFormat": "text/csv",
      "accessURL": "https://open-road.am/api/v1/public/export?format=csv"
    },
    {
      "@type": "Distribution",
      "encodingFormat": "application/geo+json",
      "accessURL": "https://open-road.am/api/v1/public/export?format=geojson"
    },
    {
      "@type": "Distribution",
      "encodingFormat": "application/json",
      "accessURL": "https://open-road.am/api/v1/public/export?format=json"
    }
  ],
  "keyword": ["roads", "infrastructure", "potholes", "Armenia", "civic-tech", "open-data"],
  "accrualPeriodicity": "continuous",
  "language": ["hy", "en", "ru"]
}
```

This endpoint is cached indefinitely (until deployment) and is not rate-limited.

### Schema documentation

A human-readable data dictionary is served at `/[locale]/open-data` — a static page describing each field, its type, and its meaning. This page is part of the Next.js frontend, not the API.

---

## Zod Validation Schema

```typescript
import { z } from 'zod';

const ExportQuerySchema = z.object({
  format: z.enum(['csv', 'geojson', 'json']),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  problem_type: z.string()
    .transform(v => v.split(','))
    .pipe(z.array(z.enum([
      'pothole', 'damaged_barrier', 'missing_marking',
      'damaged_sign', 'hazard', 'broken_light',
      'missing_ramp', 'other'
    ])))
    .optional(),
  region_id: z.string().uuid().optional(),
  status: z.string()
    .transform(v => v.split(','))
    .pipe(z.array(z.enum(['approved', 'in_progress', 'resolved', 'archived'])))
    .optional(),
  locale: z.enum(['hy', 'en', 'ru']).default('en'),
}).refine(data => {
  if (data.from && data.to) {
    const from = new Date(data.from);
    const to = new Date(data.to);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 365 && diffDays >= 0;
  }
  return true;
}, { message: 'Date range must be between 0 and 365 days' });
```

---

## Security

### No PII

The most important security property of this feature is that **no personally identifiable information is ever exported.** This is enforced at the SQL level — the export queries explicitly select only the allowed columns. There is no code path that could accidentally include `user_id`, `description`, or moderator details.

### Abuse prevention

- **Rate limiting:** 5 exports/hour/IP (see above)
- **Date range cap:** max 365 days prevents unbounded queries
- **Connection timeout:** export streams timeout after 60 seconds. If a client is too slow to consume the stream, the connection is closed.
- **Max rows:** if the result set exceeds 100,000 rows, the export is truncated and a `X-Truncated: true` header is set. The client should narrow their filters.
- **No authentication required** — but Cloudflare WAF bot protection applies. Automated scrapers hitting the endpoint repeatedly will be challenged.

### CSV injection prevention

CSV values containing `=`, `+`, `-`, `@`, `\t`, `\r` as the first character are prefixed with a single quote (`'`) to prevent formula injection in spreadsheet applications. This is a defense-in-depth measure — the exported data (UUIDs, enums, numbers, dates) is unlikely to contain these characters, but the protection is applied unconditionally.

---

## Database Indexes

No new indexes required — the export query uses the same indexes as the public API:

- `idx_reports_created_at` — for date range filtering
- `idx_reports_status` — for status filtering
- `idx_reports_region_id` — for region filtering
- `idx_reports_location` (GIST) — for `ST_X`/`ST_Y` extraction

The `ORDER BY created_at DESC` clause is covered by `idx_reports_created_at`.

---

## Out of Scope (v1)

- **Shapefile format** — complex to generate server-side, and GeoJSON covers the same use cases. Can be added in v2 if QGIS users request it.
- **Scheduled/automated exports** — recurring exports via email or webhook (e.g., "send me a CSV every Monday"). Useful for NGOs but adds complexity.
- **Photo URLs in export** — including signed R2 URLs for report photos. Requires generating temporary URLs that expire, complicates the export significantly.
- **Historical snapshots** — versioned dataset releases (e.g., "Q1 2026 dataset"). All exports are live queries against current data.
- **API key-based authentication** — all exports are public. Gov agencies with API keys get higher rate limits but no additional data.
- **Streaming progress indicator** — showing download progress in the UI. The `Transfer-Encoding: chunked` response does not include `Content-Length`, so the browser cannot show a percentage.
- **Pre-built datasets** — static, pre-generated export files updated daily. Would improve performance but adds storage and freshness concerns.
