# Spec 09 — Problem Types Table

**Status:** Draft
**Version:** 1.0
**Date:** April 2026

---

## Overview

Replace the `problem_type` PostgreSQL enum with a dedicated `problem_types` table. This allows adding, renaming, and deactivating problem categories without schema migrations that alter enum types.

---

## New Table

```sql
CREATE TABLE problem_types (
  id          TEXT PRIMARY KEY,       -- slug: 'pothole', 'damaged_barrier', etc.
  name_hy     TEXT NOT NULL,
  name_ru     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
```

### Seed data

| id | name_hy | name_ru | name_en | is_active | sort_order |
|---|---|---|---|---|---|
| `pothole` | Փոս | Яма | Pothole | true | 1 |
| `damaged_barrier` | Վնասված պատնեշ | Поврежд. ограждение | Damaged barrier | true | 2 |
| `missing_marking` | Բացակայ նշագծ | Отсутствие разметки | Missing marking | true | 3 |
| `damaged_sign` | Վնասված նշան | Повреждённый знак | Damaged sign | true | 4 |
| `hazard` | Վտանգ | Опасность | Hazard | true | 5 |
| `broken_light` | Խափանված լույս | Неработающий светофор | Broken light | true | 6 |
| `missing_ramp` | Բացակայ թեքություն | Отсутствие пандуса | Missing ramp | true | 7 |
| `other` | Այլ | Другое | Other | true | 8 |
| `not_a_road_problem` | — | — | Not a road problem | **false** | 99 |

`not_a_road_problem` is AI-only — stored with `is_active: false` so it never appears in user-facing category lists.

---

## Schema Changes

### Remove

- `problem_type` enum from PostgreSQL
- `problem_type_user` enum from `user_role` references (already separate)

### Modify

```sql
-- reports table
ALTER TABLE reports
  ALTER COLUMN problem_type_ai     TYPE TEXT,
  ALTER COLUMN problem_type_user   TYPE TEXT,
  ALTER COLUMN problem_type_final  TYPE TEXT,
  ADD CONSTRAINT reports_problem_type_ai_fkey
    FOREIGN KEY (problem_type_ai)    REFERENCES problem_types(id),
  ADD CONSTRAINT reports_problem_type_user_fkey
    FOREIGN KEY (problem_type_user)  REFERENCES problem_types(id),
  ADD CONSTRAINT reports_problem_type_final_fkey
    FOREIGN KEY (problem_type_final) REFERENCES problem_types(id);

-- photo_classifications table
ALTER TABLE photo_classifications
  ALTER COLUMN problem_type_ai TYPE TEXT,
  ADD CONSTRAINT photo_classifications_problem_type_ai_fkey
    FOREIGN KEY (problem_type_ai) REFERENCES problem_types(id);
```

---

## Prisma Schema Changes

- Remove `enum ProblemType` from `schema.prisma`
- Change all `problem_type_*` fields from `ProblemType?` to `String?`
- Add `ProblemType` model with relations

---

## Application Changes

### `@open-road/types`

```typescript
// Before
export type ProblemType = 'pothole' | 'damaged_barrier' | ...

// After
export type ProblemType = string  // validated against DB at API boundary
```

### Worker (`src/workers/classify.ts`)

```typescript
// ClassificationSchema — z.enum([...]) → z.string()
const ClassificationSchema = z.object({
  problem_type: z.string(),   // validated against known slugs in prompt
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
})
```

The Claude prompt remains unchanged — valid slugs are listed in the prompt text, not enforced by Zod (Claude output is trusted after JSON parse).

### Routes (`src/routes/reports.ts`)

```typescript
// Zod validator
problem_type_user: z.string().min(1)
// + runtime check: must exist in problem_types WHERE is_active = true
```

### New Repository

`PrismaProblemTypeRepository`:
- `findAll(): Promise<ProblemType[]>` — all active types, ordered by `sort_order`
- `findById(id: string): Promise<ProblemType | null>`

### New Endpoint

`GET /api/v1/public/problem-types` — returns active problem types for category pickers in web and mobile.

```json
[
  { "id": "pothole", "name_hy": "Փոս", "name_ru": "Яма", "name_en": "Pothole" },
  ...
]
```

Rate limit: 60/min by IP. Redis cache TTL 5min (invalidated on any problem_types change).

---

## Migration Strategy

1. Create `problem_types` table and seed data
2. Drop `problem_type` enum constraints on `reports` and `photo_classifications`
3. Convert columns to `TEXT`
4. Add FK constraints to `problem_types`
5. Drop `problem_type` enum type

Prisma cannot handle this automatically — manual migration SQL required (same approach as PostGIS in Spec 01).

---

## Out of Scope (v1)

- Admin UI to manage problem types
- Soft-delete / reactivation flow
- Per-region problem type availability
