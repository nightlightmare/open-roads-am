import { Prisma, type PrismaClient } from '@prisma/client'

// Grid size in degrees by zoom level — drives ST_SnapToGrid clustering
export function getGridSize(zoom: number): number | null {
  if (zoom >= 15) return null  // individual mode
  if (zoom >= 13) return 0.01
  if (zoom >= 11) return 0.05
  if (zoom >= 9)  return 0.1
  if (zoom >= 7)  return 0.25
  return 0.5
}

export interface BboxFilter {
  west: number
  south: number
  east: number
  north: number
}

export interface PublicReportsQuery {
  bbox: BboxFilter
  zoom: number
  problemTypes: string[] | null
  includeResolved: boolean
}

export interface ClusterItem {
  type: 'cluster'
  latitude: number
  longitude: number
  count: number
}

export interface ReportItem {
  type: 'report'
  id: string
  status: string
  problem_type: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  region_id: string | null
  confirmation_count: number
  created_at: Date
  photo_optimized_key: string | null
}

export type MapItem = ClusterItem | ReportItem

export interface PublicReportDetail {
  id: string
  status: string
  problem_type: string | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  region_id: string | null
  confirmation_count: number
  photo_optimized_key: string | null
  status_history: Array<{ status: string; changed_at: Date }>
  created_at: Date
  updated_at: Date
}

export interface StatsQuery {
  regionId: string | null
  problemType: string | null
  from: Date
  to: Date
}

export interface PublicStats {
  total_reports: number
  by_status: Record<string, number>
  by_type: Record<string, number>
  resolution_rate_pct: number
  avg_days_to_in_progress: number
  period: { from: string; to: string }
}

export interface PublicReportRepository {
  findMapItems(query: PublicReportsQuery): Promise<{ items: MapItem[]; totalInArea: number }>
  findById(id: string): Promise<PublicReportDetail | null>
  getStats(query: StatsQuery): Promise<PublicStats>
}

// Public status transitions that are shown to end-users
const PUBLIC_STATUSES = ['approved', 'in_progress', 'resolved']

/** Build a conditional WHERE fragment for nullable problemTypes array filter */
function problemTypesFilter(problemTypes: string[] | null): Prisma.Sql {
  if (problemTypes === null) {
    return Prisma.sql`TRUE`
  }
  return Prisma.sql`COALESCE(problem_type_final, problem_type_user)::text = ANY(${problemTypes}::text[])`
}

/** Build a conditional WHERE fragment for nullable regionId */
function regionIdFilter(regionId: string | null, alias?: string): Prisma.Sql {
  if (regionId === null) {
    return Prisma.sql`TRUE`
  }
  const col = alias ? Prisma.sql`${Prisma.raw(alias)}.region_id` : Prisma.sql`region_id`
  return Prisma.sql`${col} = ${regionId}::uuid`
}

/** Build a conditional WHERE fragment for nullable problemType (single value) */
function problemTypeFilter(problemType: string | null): Prisma.Sql {
  if (problemType === null) {
    return Prisma.sql`TRUE`
  }
  return Prisma.sql`COALESCE(problem_type_final, problem_type_user)::text = ${problemType}::text`
}

export class PrismaPublicReportRepository implements PublicReportRepository {
  constructor(private readonly db: PrismaClient) {}

  async findMapItems(query: PublicReportsQuery): Promise<{ items: MapItem[]; totalInArea: number }> {
    const { bbox, zoom, problemTypes, includeResolved } = query
    const { west, south, east, north } = bbox

    const statuses = includeResolved
      ? ['approved', 'in_progress', 'resolved']
      : ['approved', 'in_progress']

    const ptFilter = problemTypesFilter(problemTypes)

    // Total count (same WHERE, no GROUP BY)
    const countResult = await this.db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM reports
      WHERE
        deleted_at IS NULL
        AND status = ANY(${statuses}::"report_status"[])
        AND ST_Within(location, ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326))
        AND ${ptFilter}
    `
    const totalInArea = Number(countResult[0]?.count ?? 0)

    const gridSize = getGridSize(zoom)

    if (gridSize !== null) {
      // Cluster mode
      const rows = await this.db.$queryRaw<
        Array<{ longitude: number; latitude: number; count: bigint }>
      >`
        SELECT
          ST_X(ST_Centroid(ST_Collect(location))) AS longitude,
          ST_Y(ST_Centroid(ST_Collect(location))) AS latitude,
          COUNT(*) AS count
        FROM reports
        WHERE
          deleted_at IS NULL
          AND status = ANY(${statuses}::"report_status"[])
          AND ST_Within(location, ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326))
          AND ${ptFilter}
        GROUP BY ST_SnapToGrid(location, ${gridSize}::float8)
        ORDER BY count DESC
      `

      const items: ClusterItem[] = rows.map((r) => ({
        type: 'cluster',
        latitude: r.latitude,
        longitude: r.longitude,
        count: Number(r.count),
      }))

      return { items, totalInArea }
    }

    // Individual mode (zoom >= 15)
    const rows = await this.db.$queryRaw<
      Array<{
        id: string
        status: string
        problem_type: string | null
        longitude: number
        latitude: number
        address_raw: string | null
        region_id: string | null
        confirmation_count: number
        created_at: Date
        photo_optimized_key: string | null
      }>
    >`
      SELECT
        id,
        status::text,
        COALESCE(problem_type_final, problem_type_user)::text AS problem_type,
        ST_X(location) AS longitude,
        ST_Y(location) AS latitude,
        address_raw,
        region_id::text,
        confirmation_count,
        created_at,
        photo_optimized_key
      FROM reports
      WHERE
        deleted_at IS NULL
        AND status = ANY(${statuses}::"report_status"[])
        AND ST_Within(location, ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326))
        AND ${ptFilter}
      ORDER BY created_at DESC
      LIMIT 500
    `

    const items: ReportItem[] = rows.map((r) => ({
      type: 'report',
      id: r.id,
      status: r.status,
      problem_type: r.problem_type,
      latitude: r.latitude,
      longitude: r.longitude,
      address_raw: r.address_raw,
      region_id: r.region_id,
      confirmation_count: r.confirmation_count,
      created_at: r.created_at,
      photo_optimized_key: r.photo_optimized_key,
    }))

    return { items, totalInArea }
  }

  async findById(id: string): Promise<PublicReportDetail | null> {
    const rows = await this.db.$queryRaw<
      Array<{
        id: string
        status: string
        problem_type: string | null
        description: string | null
        longitude: number
        latitude: number
        address_raw: string | null
        region_id: string | null
        confirmation_count: number
        photo_optimized_key: string | null
        created_at: Date
        updated_at: Date
      }>
    >`
      SELECT
        id,
        status::text,
        COALESCE(problem_type_final, problem_type_user)::text AS problem_type,
        description,
        ST_X(location) AS longitude,
        ST_Y(location) AS latitude,
        address_raw,
        region_id::text,
        confirmation_count,
        photo_optimized_key,
        created_at,
        updated_at
      FROM reports
      WHERE
        id = ${id}::uuid
        AND deleted_at IS NULL
        AND status = ANY(${PUBLIC_STATUSES}::"report_status"[])
      LIMIT 1
    `

    const row = rows[0]
    if (!row) return null

    // Only public-facing status transitions (exclude internal ones)
    const historyRows = await this.db.$queryRaw<
      Array<{ to_status: string; created_at: Date }>
    >`
      SELECT to_status::text, created_at
      FROM report_status_history
      WHERE
        report_id = ${id}::uuid
        AND to_status = ANY(${PUBLIC_STATUSES}::"report_status"[])
      ORDER BY created_at ASC
    `

    return {
      id: row.id,
      status: row.status,
      problem_type: row.problem_type,
      description: row.description,
      latitude: row.latitude,
      longitude: row.longitude,
      address_raw: row.address_raw,
      region_id: row.region_id,
      confirmation_count: row.confirmation_count,
      photo_optimized_key: row.photo_optimized_key,
      status_history: historyRows.map((h) => ({ status: h.to_status, changed_at: h.created_at })),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  async getStats(query: StatsQuery): Promise<PublicStats> {
    const { regionId, problemType, from, to } = query

    const rFilter = regionIdFilter(regionId)
    const rFilterAliased = regionIdFilter(regionId, 'r')
    const ptFilter = problemTypeFilter(problemType)

    // Counts by status
    const statusRows = await this.db.$queryRaw<
      Array<{ status: string; count: bigint }>
    >`
      SELECT status::text, COUNT(*) AS count
      FROM reports
      WHERE
        deleted_at IS NULL
        AND status = ANY(${PUBLIC_STATUSES}::"report_status"[])
        AND created_at >= ${from}
        AND created_at <= ${to}
        AND ${rFilter}
        AND ${ptFilter}
      GROUP BY status
    `

    // Counts by type
    const typeRows = await this.db.$queryRaw<
      Array<{ problem_type: string; count: bigint }>
    >`
      SELECT COALESCE(problem_type_final, problem_type_user)::text AS problem_type, COUNT(*) AS count
      FROM reports
      WHERE
        deleted_at IS NULL
        AND status = ANY(${PUBLIC_STATUSES}::"report_status"[])
        AND created_at >= ${from}
        AND created_at <= ${to}
        AND ${rFilter}
        AND COALESCE(problem_type_final, problem_type_user) IS NOT NULL
      GROUP BY COALESCE(problem_type_final, problem_type_user)
    `

    // Avg days to in_progress
    const avgRows = await this.db.$queryRaw<Array<{ avg_days: number | null }>>`
      SELECT
        AVG(
          EXTRACT(EPOCH FROM (h_prog.created_at - r.created_at)) / 86400.0
        ) AS avg_days
      FROM reports r
      JOIN report_status_history h_prog
        ON h_prog.report_id = r.id AND h_prog.to_status = 'in_progress'::"report_status"
      WHERE
        r.deleted_at IS NULL
        AND r.created_at >= ${from}
        AND r.created_at <= ${to}
        AND ${rFilterAliased}
    `

    const byStatus: Record<string, number> = {}
    for (const row of statusRows) {
      byStatus[row.status] = Number(row.count)
    }

    const byType: Record<string, number> = {}
    for (const row of typeRows) {
      if (row.problem_type) byType[row.problem_type] = Number(row.count)
    }

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
    const resolved = byStatus['resolved'] ?? 0
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0

    const avgDays = avgRows[0]?.avg_days ?? 0
    const avgDaysRounded = Math.round(avgDays * 10) / 10

    return {
      total_reports: total,
      by_status: byStatus,
      by_type: byType,
      resolution_rate_pct: resolutionRate,
      avg_days_to_in_progress: avgDaysRounded,
      period: {
        from: from.toISOString().split('T')[0]!,
        to: to.toISOString().split('T')[0]!,
      },
    }
  }
}
