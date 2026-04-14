# Spec 13 — Analytics Dashboard

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Open-road.am collects structured data about road problems across Armenia — locations, types, statuses, resolution timelines. This data is valuable not only to the platform itself, but to citizens, journalists, government officials, and NGOs who want to understand the state of Armenian road infrastructure.

The Analytics Dashboard is a **public-facing page** that transforms raw report data into interactive visualizations. No authentication required. The goal is threefold:

1. **Transparency** — show citizens that their reports lead to measurable outcomes (or expose where they don't)
2. **Accountability** — give journalists and NGOs concrete numbers to hold government agencies responsible
3. **Data-driven decisions** — help municipal planners prioritize road repair budgets based on problem density, type, and geographic distribution

The dashboard reuses and extends the existing `GET /api/v1/public/stats` endpoint (Spec 04), adding dedicated analytics endpoints optimized for the visualizations described below.

---

## Dashboard Sections

The page is organized into five visual sections, laid out in a responsive grid that collapses to a single column on mobile.

### 1. Overview Cards

Four summary cards displayed in a horizontal row at the top of the page.

| Card | Value | Computation |
|---|---|---|
| Total Reports | integer | `COUNT(*)` of reports in selected period (excluding `rejected`, `pending_review`, `under_review`) |
| Resolved % | percentage | `COUNT(status = 'resolved' OR status = 'archived') / total * 100` |
| Avg Resolution Time | days | `AVG(resolved_at - created_at)` for resolved reports in period. `resolved_at` derived from `report_status_history` where `to_status = 'resolved'`. |
| Active Reports | integer | `COUNT(status IN ('approved', 'in_progress'))` — currently unresolved, visible on public map |

Each card includes a delta indicator comparing to the previous equivalent period (e.g., if "Last 30d" is selected, compare to the 30 days before that). Delta shown as "+12%" or "-5%" with green/red coloring.

### 2. Map Heatmap

A full-width MapLibre GL map showing problem density as a heatmap layer.

- **Data source:** `GET /api/v1/public/analytics/heatmap` returns grid cells with counts
- **Grid size:** 0.05 degrees (~5km cells), aggregated server-side via PostGIS `ST_SnapToGrid`
- **Color scale:** white (0) -> yellow (low) -> orange (medium) -> red (high)
- **Interaction:** clicking a grid cell shows a tooltip with count, top problem type, and resolution rate for that cell
- **Default viewport:** Armenia bounding box (38.0°N to 41.5°N, 43.3°E to 46.7°E)
- **No individual report markers** — this is aggregate visualization only. Users who want individual reports go to the main map page.

### 3. Charts

Four charts arranged in a 2x2 grid (stacked vertically on mobile).

#### 3a. Reports by Type (Vertical Bar Chart)

- X-axis: problem type (`pothole`, `damaged_barrier`, `missing_marking`, etc.)
- Y-axis: count
- Bars colored by problem type using the same color palette as the map markers
- Sorted descending by count
- Labels show Armenian names (localized via i18n) with count on top of each bar

#### 3b. Reports by Status (Donut Chart)

- Segments: `approved`, `in_progress`, `resolved`, `archived`
- Center text: total count
- Colors match the status badge colors used elsewhere in the UI
- Legend below the chart with count + percentage per segment
- Hover/tap shows exact count

#### 3c. Trend Over Time (Line Chart)

- X-axis: date (granularity depends on selected period — see below)
- Y-axis: count of new reports created
- Two lines: "New reports" and "Resolved reports"
- Granularity:
  - 7d period: daily points
  - 30d period: daily points
  - 90d period: weekly aggregates
  - 1y period: monthly aggregates
  - All time: monthly aggregates
- Tooltip shows exact date and count on hover

#### 3d. Reports by Region (Horizontal Bar Chart)

- Y-axis: region name (marz or city, depending on data density)
- X-axis: count
- Sorted descending by count
- Top 15 regions shown; remaining grouped as "Other"
- Bar color: single color with opacity gradient based on resolution rate (higher resolution = more saturated)

### 4. Top Problem Areas Table

A sortable table showing the regions with the most reports.

| Column | Description |
|---|---|
| Region | `regions.name_hy` / `name_en` / `name_ru` (locale-dependent) |
| Total Reports | count of reports in period |
| Most Common Type | problem type with highest count in that region |
| Resolution Rate | `resolved_count / total * 100` as percentage |
| Avg Resolution Time | average days from `created_at` to `resolved_at` |

- Default sort: by total reports descending
- Clickable column headers for re-sorting
- Pagination: show 10 rows, "Show more" button loads next 10
- Clicking a region name filters the entire dashboard to that region

### 5. Time Filters

A filter bar pinned below the page header, above all dashboard sections.

| Filter | Type | Options |
|---|---|---|
| Period | button group | Last 7d, Last 30d (default), Last 90d, Last 1y, All time |
| Region | dropdown | All regions (default), then list of marzes/cities from `regions` table |
| Problem type | dropdown | All types (default), then each `problem_type` enum value |

Changing any filter updates all sections simultaneously. Filter state is stored in URL query params (`?period=30d&region=...&type=pothole`) so dashboards can be shared via link.

---

## Data Sources

The existing `GET /api/v1/public/stats` endpoint (Spec 04) provides basic aggregate counts but is insufficient for the dashboard because:

- It returns a flat summary, not time-series data
- No heatmap grid data
- No per-region breakdown in a single call
- No resolution time metrics

The dashboard needs four new endpoints. The existing `/stats` endpoint remains unchanged for backward compatibility.

---

## New API Endpoints

Base path: `/api/v1/public/analytics/`

All endpoints are public (no auth), rate-limited by IP, and cached in Redis.

---

### `GET /api/v1/public/analytics/overview`

Returns the four summary card values plus deltas.

#### Query parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `period` | string | no | `30d` | One of: `7d`, `30d`, `90d`, `1y`, `all` |
| `region_id` | uuid | no | — | Filter by region |
| `problem_type` | string | no | — | Filter by problem type |

#### Response `200 OK`

```json
{
  "total_reports": 1842,
  "total_reports_delta_pct": 12.3,
  "resolved_pct": 21.3,
  "resolved_pct_delta": 3.1,
  "avg_resolution_days": 14.2,
  "avg_resolution_days_delta": -2.1,
  "active_reports": 1516,
  "active_reports_delta_pct": 8.7,
  "period": {
    "from": "2026-03-15",
    "to": "2026-04-14"
  },
  "comparison_period": {
    "from": "2026-02-13",
    "to": "2026-03-14"
  }
}
```

**Delta computation:** for each metric, the API computes the same metric for the previous equivalent period and returns the percentage change (or absolute change for `resolved_pct` and `avg_resolution_days`).

#### Caching

- Key: `cache:analytics:overview:<period>:<region_id>:<problem_type>`
- TTL: **15 minutes**

#### SQL sketch (total_reports)

```sql
SELECT COUNT(*)
FROM reports
WHERE status IN ('approved', 'in_progress', 'resolved', 'archived')
  AND deleted_at IS NULL
  AND created_at >= $from AND created_at <= $to
  AND ($region_id IS NULL OR region_id = $region_id)
  AND ($problem_type IS NULL OR COALESCE(problem_type_final, problem_type_user) = $problem_type);
```

Uses index: `idx_reports_created_at` + `idx_reports_region_id`.

---

### `GET /api/v1/public/analytics/heatmap`

Returns grid-aggregated report density for the heatmap layer.

#### Query parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `period` | string | no | `30d` | One of: `7d`, `30d`, `90d`, `1y`, `all` |
| `problem_type` | string | no | — | Filter by problem type |
| `grid_size` | number | no | `0.05` | Grid cell size in degrees. Min: `0.01`, Max: `0.5`. |

#### Response `200 OK`

```json
{
  "grid_size": 0.05,
  "cells": [
    {
      "lat": 40.175,
      "lng": 44.525,
      "count": 42,
      "top_type": "pothole",
      "resolved_pct": 18.5
    },
    {
      "lat": 40.225,
      "lng": 44.475,
      "count": 28,
      "top_type": "missing_marking",
      "resolved_pct": 32.1
    }
  ],
  "total_cells": 156,
  "period": {
    "from": "2026-03-15",
    "to": "2026-04-14"
  }
}
```

#### SQL sketch

```sql
SELECT
  ST_Y(ST_SnapToGrid(location, $grid_size)) AS lat,
  ST_X(ST_SnapToGrid(location, $grid_size)) AS lng,
  COUNT(*) AS count,
  MODE() WITHIN GROUP (ORDER BY COALESCE(problem_type_final, problem_type_user)) AS top_type,
  ROUND(COUNT(*) FILTER (WHERE status IN ('resolved', 'archived'))::numeric / COUNT(*) * 100, 1) AS resolved_pct
FROM reports
WHERE status IN ('approved', 'in_progress', 'resolved', 'archived')
  AND deleted_at IS NULL
  AND created_at >= $from AND created_at <= $to
  AND ($problem_type IS NULL OR COALESCE(problem_type_final, problem_type_user) = $problem_type)
GROUP BY ST_SnapToGrid(location, $grid_size)
HAVING COUNT(*) >= 1;
```

Uses spatial index: `idx_reports_location`.

#### Caching

- Key: `cache:analytics:heatmap:<period>:<problem_type>:<grid_size>`
- TTL: **15 minutes**

---

### `GET /api/v1/public/analytics/trend`

Returns time-series data for the trend chart.

#### Query parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `period` | string | no | `30d` | One of: `7d`, `30d`, `90d`, `1y`, `all` |
| `region_id` | uuid | no | — | Filter by region |
| `problem_type` | string | no | — | Filter by problem type |
| `granularity` | string | no | auto | `daily`, `weekly`, `monthly`. If omitted, auto-selected based on period (see chart spec above). |

#### Response `200 OK`

```json
{
  "granularity": "daily",
  "series": {
    "new_reports": [
      { "date": "2026-03-15", "count": 23 },
      { "date": "2026-03-16", "count": 31 },
      { "date": "2026-03-17", "count": 18 }
    ],
    "resolved_reports": [
      { "date": "2026-03-15", "count": 5 },
      { "date": "2026-03-16", "count": 8 },
      { "date": "2026-03-17", "count": 3 }
    ]
  },
  "period": {
    "from": "2026-03-15",
    "to": "2026-04-14"
  }
}
```

#### Auto-granularity rules

| Period | Default granularity | Max data points |
|---|---|---|
| `7d` | daily | 7 |
| `30d` | daily | 30 |
| `90d` | weekly | 13 |
| `1y` | monthly | 12 |
| `all` | monthly | unlimited (capped at max 60 months = 5 years) |

#### SQL sketch (new_reports, daily)

```sql
SELECT
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS count
FROM reports
WHERE status IN ('approved', 'in_progress', 'resolved', 'archived')
  AND deleted_at IS NULL
  AND created_at >= $from AND created_at <= $to
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date;
```

For resolved_reports, join `report_status_history` where `to_status = 'resolved'` and use `created_at` of the history row as the resolution date.

#### Caching

- Key: `cache:analytics:trend:<period>:<granularity>:<region_id>:<problem_type>`
- TTL: **15 minutes**

---

### `GET /api/v1/public/analytics/regions`

Returns per-region breakdown for the horizontal bar chart and the problem areas table.

#### Query parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `period` | string | no | `30d` | One of: `7d`, `30d`, `90d`, `1y`, `all` |
| `problem_type` | string | no | — | Filter by problem type |
| `limit` | integer | no | `20` | Max regions to return. Max: 50. |
| `offset` | integer | no | `0` | For pagination of the table |
| `sort` | string | no | `count_desc` | `count_desc`, `count_asc`, `resolution_rate_desc`, `resolution_rate_asc`, `avg_resolution_time_asc` |

#### Response `200 OK`

```json
{
  "regions": [
    {
      "region_id": "uuid",
      "name_hy": "Երdelays",
      "name_en": "Yerevan",
      "name_ru": "Ереvan",
      "type": "city",
      "total_reports": 892,
      "top_problem_type": "pothole",
      "resolved_count": 156,
      "resolution_rate_pct": 17.5,
      "avg_resolution_days": 18.3
    }
  ],
  "total_regions_with_reports": 34,
  "period": {
    "from": "2026-03-15",
    "to": "2026-04-14"
  }
}
```

#### SQL sketch

```sql
SELECT
  r.region_id,
  reg.name_hy, reg.name_en, reg.name_ru, reg.type,
  COUNT(*) AS total_reports,
  MODE() WITHIN GROUP (ORDER BY COALESCE(r.problem_type_final, r.problem_type_user)) AS top_problem_type,
  COUNT(*) FILTER (WHERE r.status IN ('resolved', 'archived')) AS resolved_count,
  ROUND(COUNT(*) FILTER (WHERE r.status IN ('resolved', 'archived'))::numeric / COUNT(*) * 100, 1) AS resolution_rate_pct,
  AVG(
    EXTRACT(EPOCH FROM (
      (SELECT MIN(h.created_at) FROM report_status_history h WHERE h.report_id = r.id AND h.to_status = 'resolved')
      - r.created_at
    )) / 86400
  ) FILTER (WHERE r.status IN ('resolved', 'archived')) AS avg_resolution_days
FROM reports r
JOIN regions reg ON r.region_id = reg.id
WHERE r.status IN ('approved', 'in_progress', 'resolved', 'archived')
  AND r.deleted_at IS NULL
  AND r.created_at >= $from AND r.created_at <= $to
  AND r.region_id IS NOT NULL
GROUP BY r.region_id, reg.name_hy, reg.name_en, reg.name_ru, reg.type
ORDER BY total_reports DESC
LIMIT $limit OFFSET $offset;
```

**Note:** The avg_resolution_days subquery is correlated and could be slow at scale. If needed, materialize resolution times into the `reports` table or a summary table as a future optimization.

#### Caching

- Key: `cache:analytics:regions:<period>:<problem_type>:<limit>:<offset>:<sort>`
- TTL: **15 minutes**

---

## Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| `GET /analytics/overview` | 30 req | per minute per IP |
| `GET /analytics/heatmap` | 20 req | per minute per IP |
| `GET /analytics/trend` | 30 req | per minute per IP |
| `GET /analytics/regions` | 30 req | per minute per IP |

On `429`: `Retry-After` header included.

---

## Frontend Implementation

### Route

`/[locale]/analytics` — public page, no auth required.

Locale-aware: `/hy/analytics`, `/en/analytics`, `/ru/analytics`.

### Page structure

```
<AnalyticsPage>
  <PageHeader title={t('analytics.title')} />
  <FilterBar>
    <PeriodSelector />      // button group
    <RegionDropdown />       // searchable select
    <ProblemTypeDropdown />  // select
  </FilterBar>
  <OverviewCards />          // 4 metric cards
  <HeatmapSection />        // MapLibre GL map
  <ChartsGrid>              // 2x2 grid
    <ReportsByTypeChart />   // vertical bar
    <ReportsByStatusChart /> // donut
    <TrendChart />           // line
    <ReportsByRegionChart /> // horizontal bar
  </ChartsGrid>
  <TopProblemsTable />       // sortable table
</AnalyticsPage>
```

### Chart library: recharts

- Lightweight (~40KB gzipped), React-native, actively maintained
- Used for: `BarChart`, `PieChart` (donut), `LineChart`
- Install: `pnpm add recharts`
- No D3 dependency overhead — recharts bundles only what it needs

### State management

- Filter state: URL search params (via `nuqs` or `next/navigation` `useSearchParams`)
- API data: React Server Components for initial load, `useSWR` for client-side filter changes
- No Zustand for this page — the filter state in URL is the single source of truth

### Server-side rendering

The page should be server-rendered for SEO:

- Fetch `overview` and `regions` data in the RSC layer
- Embed summary stats in `<meta>` tags for social sharing:
  - `og:title`: "Road Problems in Armenia — Analytics | open-road.am"
  - `og:description`: "1,842 road problems reported. 21% resolved. See the data."
  - `twitter:card`: `summary_large_image`
- Generate an OG image dynamically with key stats (optional v2 enhancement)

### Responsive behavior

| Breakpoint | Layout |
|---|---|
| Desktop (>1024px) | 4 cards in row, 2x2 chart grid, full-width heatmap |
| Tablet (768-1024px) | 2x2 cards, 1-column charts, full-width heatmap |
| Mobile (<768px) | 1-column everything, charts stack vertically, heatmap has reduced height (300px) |

---

## Performance

### Redis caching strategy

All four analytics endpoints are cached in Redis with a 15-minute TTL. Cache keys include all query parameters to ensure correct invalidation.

Cache warming is **not** needed — the first request after TTL expiry will be slower (cold hit), but subsequent requests serve from cache. 15 minutes is acceptable staleness for analytics data.

### Database indexes

The following indexes must exist (most already defined in Spec 01):

| Index | Table | Columns | Notes |
|---|---|---|---|
| `idx_reports_created_at` | `reports` | `created_at` | For time range filtering |
| `idx_reports_status` | `reports` | `status` | For status filtering |
| `idx_reports_region_id` | `reports` | `region_id` | For region breakdown |
| `idx_reports_location` | `reports` | `location` (GIST) | For heatmap grid aggregation |
| `idx_reports_problem_type_user` | `reports` | `problem_type_user` | For type filtering |
| `idx_report_status_history_report_id` | `report_status_history` | `report_id, to_status` | For resolution time computation |

**No full table scans.** All queries must use at least one index. The `EXPLAIN ANALYZE` output should show Index Scan or Bitmap Index Scan, never Seq Scan on `reports`.

### Query performance targets

| Endpoint | Target p95 | Strategy |
|---|---|---|
| `/overview` | <200ms | Simple aggregates with index coverage |
| `/heatmap` | <500ms | `ST_SnapToGrid` with spatial index |
| `/trend` | <300ms | `DATE_TRUNC` with `created_at` index |
| `/regions` | <500ms | GROUP BY with region index, LIMIT |

If queries exceed targets at scale (>100k reports), consider:
1. Materialized views refreshed every 15 minutes via cron
2. Pre-aggregated summary tables updated by BullMQ workers on report status change

---

## Accessibility

### Charts

- Every chart has a descriptive `aria-label` (e.g., "Bar chart showing reports by problem type, pothole is the most common with 890 reports")
- Charts have a visually hidden `<table>` equivalent that screen readers can navigate
- Color choices meet WCAG 2.1 AA contrast ratios
- Charts are not the sole means of conveying data — the Top Problem Areas table provides the same information in a screen-reader-friendly format

### Map

- The heatmap section has an `aria-label` describing its purpose
- A text summary below the map: "Highest report density: Yerevan (892 reports), Gyumri (234 reports), Vanadzor (156 reports)"
- Map is not keyboard-navigable (MapLibre limitation) — the table below provides equivalent information

### General

- All filter controls have proper `<label>` elements
- Focus management: changing a filter does not steal focus
- Loading states announced via `aria-live="polite"` regions
- Language: all text is localized (hy, en, ru)

---

## Zod Validation Schemas

```typescript
import { z } from 'zod';

const PeriodSchema = z.enum(['7d', '30d', '90d', '1y', 'all']).default('30d');

const AnalyticsOverviewQuery = z.object({
  period: PeriodSchema,
  region_id: z.string().uuid().optional(),
  problem_type: z.enum([
    'pothole', 'damaged_barrier', 'missing_marking',
    'damaged_sign', 'hazard', 'broken_light',
    'missing_ramp', 'other'
  ]).optional(),
});

const AnalyticsHeatmapQuery = z.object({
  period: PeriodSchema,
  problem_type: z.enum([
    'pothole', 'damaged_barrier', 'missing_marking',
    'damaged_sign', 'hazard', 'broken_light',
    'missing_ramp', 'other'
  ]).optional(),
  grid_size: z.coerce.number().min(0.01).max(0.5).default(0.05),
});

const AnalyticsTrendQuery = z.object({
  period: PeriodSchema,
  region_id: z.string().uuid().optional(),
  problem_type: z.enum([
    'pothole', 'damaged_barrier', 'missing_marking',
    'damaged_sign', 'hazard', 'broken_light',
    'missing_ramp', 'other'
  ]).optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

const AnalyticsRegionsQuery = z.object({
  period: PeriodSchema,
  problem_type: z.enum([
    'pothole', 'damaged_barrier', 'missing_marking',
    'damaged_sign', 'hazard', 'broken_light',
    'missing_ramp', 'other'
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum([
    'count_desc', 'count_asc',
    'resolution_rate_desc', 'resolution_rate_asc',
    'avg_resolution_time_asc'
  ]).default('count_desc'),
});
```

---

## Out of Scope (v1)

- **Downloadable reports** — CSV/GeoJSON export is covered in Spec 14, not in the dashboard itself (though the dashboard will link to it)
- **Real-time updates** — the dashboard refreshes on filter change, not via WebSocket
- **Custom date range picker** — v1 uses preset periods only. Custom from/to date selection is a v2 enhancement.
- **Comparison mode** — side-by-side comparison of two regions or two time periods
- **Embeddable widgets** — iframe-able chart components for third-party sites
- **OG image generation** — dynamic social sharing images with stats
- **Gov agency-specific dashboards** — filtered views for specific agencies (requires auth, different scope)
- **Report resolution funnel** — visualization of report flow through statuses (pending -> approved -> in_progress -> resolved)
