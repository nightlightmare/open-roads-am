# Migrations

Prisma generates migration SQL via `pnpm db:migrate:dev`. However, some indexes
require manual SQL additions after the initial migration is created because
Prisma does not support:

- **GIST indexes** (PostGIS spatial indexes)
- **Partial indexes** (`WHERE` clause)

## After running `pnpm db:migrate:dev --name init`

Open the generated `migration.sql` file and append:

```sql
-- PostGIS GIST indexes (spatial queries)
CREATE INDEX reports_location_idx ON reports USING GIST (location);
CREATE INDEX regions_boundary_idx ON regions USING GIST (boundary);

-- Partial indexes (filter by non-deleted, approved reports)
CREATE INDEX reports_status_idx ON reports (status) WHERE deleted_at IS NULL;
CREATE INDEX reports_status_location_idx ON reports USING GIST (location)
  WHERE status = 'approved' AND deleted_at IS NULL;
```

Then run `pnpm db:migrate deploy` (or let `migrate dev` apply it).

> These indexes are critical for map performance. Never skip them.
