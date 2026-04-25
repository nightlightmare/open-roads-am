# 22. API Documentation Page

## Summary

Interactive API documentation page at `/docs/api` — auto-generated reference for the public REST API (`/api/v1/public/*`). Serves as both developer onboarding and live playground.

## Goals

- Single source of truth for public API consumers (journalists, developers, gov integrators)
- No manual doc maintenance — generated from API route definitions and Zod schemas
- Matches the landing page design system (IBM Plex, warm palette, dark mode support)

## Route

`/[locale]/docs/api` — public, no auth required

## Sections

### Header
- Breadcrumb: OpenRoad.am > API Documentation
- Base URL display: `https://api.openroad.am/v1/public`
- Authentication note: "Public API — no authentication required. Rate limited by IP."

### Endpoints

Each endpoint block:
- **Method badge** + path (e.g., `GET /reports`)
- Description
- Parameters table (query params with types, defaults, constraints)
- Response schema (collapsible JSON tree from Zod schema)
- Example request (curl) + example response (formatted JSON)
- Rate limit info

#### Endpoints to document

1. **GET /reports** — list reports with filters (type, status, bbox, limit, cursor)
2. **GET /reports/:id** — single report detail
3. **GET /reports/geojson** — GeoJSON FeatureCollection for map consumption
4. **GET /stats** — aggregate stats (counts by type, status, district)
5. **GET /types** — problem type enum with labels

### Data Formats
- GeoJSON structure example
- Status enum values with descriptions
- Problem type enum
- Coordinate system (WGS84 / EPSG:4326)

### Rate Limits
- Table: endpoint, limit, window, scope
- Default: 100 req/min per IP

### Client Libraries
- Links to future Python/JS client packages
- Quick start code snippets (fetch, Python requests)

### Changelog
- Versioning approach (v1 prefix, breaking changes = new version)
- Current: v1 (MVP)

## Technical approach

### Option A: Static MDX page
- MDX file with custom components (`<Endpoint>`, `<ParamTable>`, `<ResponseSchema>`)
- Manually maintained but styled consistently
- Quick to ship, easy to edit

### Option B: Auto-generated from OpenAPI
- Generate OpenAPI spec from Zod schemas at build time
- Render with a custom React component (not Swagger UI — too heavy and off-brand)
- Always in sync with code

### Recommendation
Start with **Option A** (MDX) for MVP — faster to ship, full design control. Migrate to Option B when the API stabilizes and has more endpoints.

## Design constraints

- Must match landing page typography and color system
- Code blocks: `font-mono`, dark bg (`bg-foreground text-background`)
- Method badges: GET = muted, POST = primary accent
- Responsive — readable on mobile (code blocks scroll horizontally)
- Dark mode support via existing `.dark` CSS variables
- No third-party doc frameworks (no Swagger UI, Redoc, etc.)

## i18n

- Page structure and UI chrome: translated (hy/ru/en)
- Endpoint paths, parameter names, JSON keys: English only
- Descriptions: translated

## Out of scope

- Authentication/API key management (see spec 06)
- Internal API documentation (moderator/admin endpoints)
- SDK generation
- Interactive "try it" playground (future enhancement)

## Dependencies

- Spec 04 (Public Map API) — defines the endpoints
- Spec 09 (Problem Types) — enum values
- Landing page design tokens — visual consistency
