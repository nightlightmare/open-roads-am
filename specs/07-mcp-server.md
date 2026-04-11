# Spec 07 — MCP Server

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

The MCP server exposes OpenRoad.am data to external AI agents (Claude, GPT, Cursor, etc.) via the Model Context Protocol. It is a separate app (`apps/mcp-server/`) that talks to the Fastify API — it does not connect to the database directly.

Read-only tools are public (no key). Write tools require an API key with the appropriate scope.

---

## Architecture

```
External AI agent (Claude / GPT / Cursor)
        ↓  MCP protocol (stdio or HTTP+SSE)
  apps/mcp-server/        ← this spec
        ↓  internal HTTP calls
  apps/api/               ← Fastify (Specs 02–06)
        ↓
  PostgreSQL + Redis
```

The MCP server is a thin adapter. All business logic and authorization lives in the API. The MCP server:
- Translates MCP tool calls into API requests
- Formats API responses into MCP-compatible output
- Handles its own input validation before forwarding to the API
- Never connects to DB or Redis directly

---

## Transport

- **Primary:** HTTP + SSE (for web-based AI agent integrations)
- **Secondary:** stdio (for local Claude Desktop / Cursor integration)

Both transports expose the same tools.

---

## Tools

### Public tools (no API key required)

---

#### `get_reports`

Returns a list of approved reports with filters.

**Input schema:**

```typescript
{
  bbox?: {
    west: number, south: number,
    east: number, north: number
  }
  lat?: number
  lng?: number
  radius_km?: number        // default 5, max 50
  problem_type?: Array<
    'pothole' | 'missing_marking' | 'damaged_sign' |
    'hazard' | 'broken_light' | 'other'
  >
  include_resolved?: boolean  // default false
  limit?: number              // default 20, max 100
  cursor?: string
}
```

Requires either `bbox` or `lat`+`lng`. Returns error if neither provided.

**Calls:** `GET /api/v1/public/reports`

**Output:** Array of reports with `id`, `status`, `problem_type`, `latitude`, `longitude`, `address_raw`, `confirmation_count`, `photo_url`, `created_at`. Formatted as a readable list with a summary line.

---

#### `get_report`

Returns full detail for a single report.

**Input schema:**

```typescript
{ id: string }   // UUID
```

**Calls:** `GET /api/v1/public/reports/:id`

**Output:** Full report detail including `status_history`.

---

#### `get_stats`

Returns aggregate statistics.

**Input schema:**

```typescript
{
  region_id?: string    // UUID
  problem_type?: string
  from?: string         // ISO date, default 30 days ago
  to?: string           // ISO date, default today
}
```

**Calls:** `GET /api/v1/public/stats`

**Output:** Structured stats with a human-readable summary. Example:

```
Road problem statistics for Yerevan (last 30 days):
• Total reports: 312
• Approved: 204 | In progress: 67 | Resolved: 41
• Most common: Potholes (48%), Missing marking (22%)
• Resolution rate: 13.1%
• Avg. days to acknowledgment: 11.4
```

---

#### `get_heatmap`

Returns density data for a bounding box.

**Input schema:**

```typescript
{
  bbox: { west: number, south: number, east: number, north: number }
  problem_type?: string
  include_resolved?: boolean
}
```

**Calls:** `GET /api/v1/public/heatmap`

**Output:** Grid cells with counts. Useful for AI agents answering "where are the most problems concentrated?"

---

### Authenticated tools (API key required)

API key passed as `X-Api-Key` header on the internal API call. The MCP server accepts the key as a tool input parameter and forwards it — it never stores or logs keys.

---

#### `create_report`

Creates a new road problem report programmatically.

**Required scope:** `reports:write`

**Input schema:**

```typescript
{
  api_key: string
  latitude: number
  longitude: number
  problem_type: 'pothole' | 'missing_marking' | 'damaged_sign' |
                'hazard' | 'broken_light' | 'other'
  description?: string    // max 1000 chars
  photo_url?: string      // publicly accessible URL — server will fetch and upload to R2
}
```

**Note on `photo_url`:** if provided, the API fetches the image, validates it (magic bytes, max 10 MB), strips EXIF, uploads to R2, and queues AI classification. If not provided, `problem_type_user` is set from the input and no AI classification runs.

**Calls:** `POST /api/v1/reports` (authenticated with API key)

**Output:**

```
Report created successfully.
ID: <uuid>
Status: pending_review
```

---

#### `update_status`

Updates the status of an approved report.

**Required scope:** `status:write`

**Input schema:**

```typescript
{
  api_key: string
  report_id: string
  status: 'in_progress' | 'resolved'
  note?: string    // optional public note, shown in status history
}
```

**Calls:** `POST /api/v1/reports/:id/status`

**Output:**

```
Status updated.
Report <id>: approved → in_progress
```

---

## Input Validation

The MCP server validates all inputs with Zod before forwarding to the API. This provides a clean error message to the AI agent without hitting the API with invalid requests.

Validation errors are returned as MCP `isError: true` responses with a descriptive message:

```
Error: Invalid coordinates. Latitude must be between 38.8 and 41.4 (Armenia bounds).
```

---

## Error Handling

MCP tool errors are returned as `{ isError: true, content: [{ type: 'text', text: '...' }] }`.

| API error | MCP error message |
|---|---|
| `401 UNAUTHORIZED` | "Invalid or missing API key." |
| `403 FORBIDDEN` | "This API key does not have permission for this action." |
| `429 RATE_LIMIT_EXCEEDED` | "Rate limit exceeded. Please wait before retrying." |
| `404 NOT_FOUND` | "Report not found or not publicly visible." |
| `400 BBOX_TOO_LARGE` | "Area too large. Please specify a smaller bounding box." |
| `500 INTERNAL_ERROR` | "Service temporarily unavailable." |

No internal error details forwarded to the AI agent.

---

## Security

- MCP server makes only HTTP calls to the internal API — no direct DB/Redis access
- API keys passed as tool input are forwarded in the `X-Api-Key` header and **never logged**
- MCP server does not store any state — fully stateless
- Rate limiting is enforced by the API, not the MCP server
- `api_key` field is marked as `sensitive: true` in the MCP tool schema — compliant MCP clients will not display it in logs
- The MCP server runs on a separate port and is not exposed via Cloudflare WAF directly — access goes through the same Fastify API server's trust boundary

---

## Tool Definitions Summary

| Tool | Auth | Scope |
|---|---|---|
| `get_reports` | none | — |
| `get_report` | none | — |
| `get_stats` | none | — |
| `get_heatmap` | none | — |
| `create_report` | API key | `reports:write` |
| `update_status` | API key | `status:write` |

---

## Out of Scope (v1)

- MCP Resources (e.g. streaming live report feed as a resource)
- Tool for moderators (approve/reject via MCP)
- Pagination cursor support in `get_reports` MCP output (v1 returns first page only)
- MCP server authentication (the server itself is public — auth is per tool via API key)
