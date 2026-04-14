import { Prisma, type PrismaClient } from '@prisma/client'

export interface UserProfileStats {
  reports_submitted: number
  reports_approved: number
  reports_resolved: number
  confirmations_given: number
}

export interface UserProfileResult {
  clerk_id: string
  display_name: string | null
  role: string
  member_since: Date
  stats: UserProfileStats
}

export interface MyReportItem {
  id: string
  status: string
  problem_type: string | null
  address_raw: string | null
  photo_optimized_key: string | null
  confirmation_count: number
  created_at: Date
  updated_at: Date
}

export interface MyReportDetail {
  id: string
  status: string
  problem_type: string | null
  problem_type_user: string | null
  problem_type_ai: string | null
  ai_confidence: number | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_optimized_key: string | null
  confirmation_count: number
  status_history: Array<{ status: string; changed_at: Date; note: string | null }>
  created_at: Date
  updated_at: Date
}

export interface MyConfirmationItem {
  report_id: string
  problem_type: string | null
  address_raw: string | null
  photo_optimized_key: string | null
  report_status: string
  confirmed_at: Date
}

export type AddConfirmationResult =
  | { ok: true; count: number }
  | { ok: false; code: 'NOT_FOUND' | 'OWN_REPORT' | 'ALREADY_CONFIRMED' | 'INVALID_STATUS' }

export type RemoveConfirmationResult =
  | { ok: true; count: number }
  | { ok: false; code: 'NOT_FOUND' }

export interface UserProfileRepository {
  getProfile(clerkId: string): Promise<UserProfileResult | null>
  getReports(
    clerkId: string,
    query: { status: string | null; cursor: string | null; limit: number },
  ): Promise<{ reports: MyReportItem[]; cursor: string | null }>
  getReportById(clerkId: string, reportId: string): Promise<MyReportDetail | null>
  getConfirmations(
    clerkId: string,
    query: { cursor: string | null; limit: number },
  ): Promise<{ confirmations: MyConfirmationItem[]; cursor: string | null }>
  addConfirmation(clerkId: string, reportId: string): Promise<AddConfirmationResult>
  removeConfirmation(clerkId: string, reportId: string): Promise<RemoveConfirmationResult>
}

export class PrismaUserProfileRepository implements UserProfileRepository {
  constructor(private readonly db: PrismaClient) {}

  async getProfile(clerkId: string): Promise<UserProfileResult | null> {
    const rows = await this.db.$queryRaw<
      Array<{
        clerk_id: string
        display_name: string | null
        role: string
        created_at: Date
        reports_submitted: bigint
        reports_approved: bigint
        reports_resolved: bigint
        confirmations_given: bigint
      }>
    >`
      SELECT
        u.clerk_id,
        u.display_name,
        u.role::text,
        u.created_at,
        COUNT(DISTINCT r.id) FILTER (WHERE r.deleted_at IS NULL) AS reports_submitted,
        COUNT(DISTINCT r.id) FILTER (WHERE r.deleted_at IS NULL AND r.status = 'approved'::"report_status") AS reports_approved,
        COUNT(DISTINCT r.id) FILTER (WHERE r.deleted_at IS NULL AND r.status = 'resolved'::"report_status") AS reports_resolved,
        COUNT(DISTINCT rc.id) AS confirmations_given
      FROM users u
      LEFT JOIN reports r ON r.user_id = u.id
      LEFT JOIN report_confirmations rc ON rc.user_id = u.id
      WHERE u.clerk_id = ${clerkId}
      GROUP BY u.id
    `
    const row = rows[0]
    if (!row) return null
    return {
      clerk_id: row.clerk_id,
      display_name: row.display_name,
      role: row.role,
      member_since: row.created_at,
      stats: {
        reports_submitted: Number(row.reports_submitted),
        reports_approved: Number(row.reports_approved),
        reports_resolved: Number(row.reports_resolved),
        confirmations_given: Number(row.confirmations_given),
      },
    }
  }

  async getReports(
    clerkId: string,
    query: { status: string | null; cursor: string | null; limit: number },
  ): Promise<{ reports: MyReportItem[]; cursor: string | null }> {
    const { status, cursor, limit } = query

    const statusFilter = status !== null
      ? Prisma.sql`r.status = ${status}::"report_status"`
      : Prisma.sql`TRUE`

    const cursorFilter = cursor !== null
      ? Prisma.sql`r.created_at < ${new Date(cursor)}`
      : Prisma.sql`TRUE`

    const rows = await this.db.$queryRaw<
      Array<{
        id: string
        status: string
        problem_type: string | null
        address_raw: string | null
        photo_optimized_key: string | null
        confirmation_count: number
        created_at: Date
        updated_at: Date
      }>
    >`
      SELECT
        r.id,
        r.status::text,
        COALESCE(r.problem_type_final, r.problem_type_user)::text AS problem_type,
        r.address_raw,
        r.photo_optimized_key,
        r.confirmation_count,
        r.created_at,
        r.updated_at
      FROM reports r
      JOIN users u ON u.id = r.user_id
      WHERE u.clerk_id = ${clerkId}
        AND r.deleted_at IS NULL
        AND ${statusFilter}
        AND ${cursorFilter}
      ORDER BY r.created_at DESC
      LIMIT ${limit + 1}
    `

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? items[items.length - 1]!.created_at.toISOString() : null

    return { reports: items, cursor: nextCursor }
  }

  async getReportById(clerkId: string, reportId: string): Promise<MyReportDetail | null> {
    const rows = await this.db.$queryRaw<
      Array<{
        id: string
        status: string
        problem_type: string | null
        problem_type_user: string | null
        problem_type_ai: string | null
        ai_confidence: number | null
        description: string | null
        longitude: number
        latitude: number
        address_raw: string | null
        photo_optimized_key: string | null
        confirmation_count: number
        created_at: Date
        updated_at: Date
      }>
    >`
      SELECT
        r.id,
        r.status::text,
        COALESCE(r.problem_type_final, r.problem_type_user)::text AS problem_type,
        r.problem_type_user::text,
        r.problem_type_ai::text,
        r.ai_confidence,
        r.description,
        ST_X(r.location) AS longitude,
        ST_Y(r.location) AS latitude,
        r.address_raw,
        r.photo_optimized_key,
        r.confirmation_count,
        r.created_at,
        r.updated_at
      FROM reports r
      JOIN users u ON u.id = r.user_id
      WHERE r.id = ${reportId}::uuid
        AND u.clerk_id = ${clerkId}
        AND r.deleted_at IS NULL
    `
    const row = rows[0]
    if (!row) return null

    const history = await this.db.$queryRaw<
      Array<{ status: string; changed_at: Date; note: string | null }>
    >`
      SELECT to_status::text AS status, created_at AS changed_at, note
      FROM report_status_history
      WHERE report_id = ${reportId}::uuid
        AND to_status = ANY(ARRAY['approved','in_progress','resolved']::"report_status"[])
      ORDER BY created_at ASC
    `

    return { ...row, status_history: history }
  }

  async getConfirmations(
    clerkId: string,
    query: { cursor: string | null; limit: number },
  ): Promise<{ confirmations: MyConfirmationItem[]; cursor: string | null }> {
    const { cursor, limit } = query

    const cursorFilter = cursor !== null
      ? Prisma.sql`rc.created_at < ${new Date(cursor)}`
      : Prisma.sql`TRUE`

    const rows = await this.db.$queryRaw<
      Array<{
        report_id: string
        problem_type: string | null
        address_raw: string | null
        photo_optimized_key: string | null
        report_status: string
        confirmed_at: Date
      }>
    >`
      SELECT
        rc.report_id,
        COALESCE(r.problem_type_final, r.problem_type_user)::text AS problem_type,
        r.address_raw,
        r.photo_optimized_key,
        r.status::text AS report_status,
        rc.created_at AS confirmed_at
      FROM report_confirmations rc
      JOIN reports r ON r.id = rc.report_id
      JOIN users u ON u.id = rc.user_id
      WHERE u.clerk_id = ${clerkId}
        AND r.deleted_at IS NULL
        AND ${cursorFilter}
      ORDER BY rc.created_at DESC
      LIMIT ${limit + 1}
    `

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? items[items.length - 1]!.confirmed_at.toISOString() : null

    return { confirmations: items, cursor: nextCursor }
  }

  async addConfirmation(clerkId: string, reportId: string): Promise<AddConfirmationResult> {
    // Find report (public statuses only)
    const reports = await this.db.$queryRaw<
      Array<{ id: string; user_id: string; status: string; confirmation_count: number }>
    >`
      SELECT r.id, r.user_id, r.status::text, r.confirmation_count
      FROM reports r
      WHERE r.id = ${reportId}::uuid AND r.deleted_at IS NULL
    `
    const report = reports[0]
    if (!report) return { ok: false, code: 'NOT_FOUND' }

    if (report.status !== 'approved' && report.status !== 'in_progress') {
      return { ok: false, code: 'INVALID_STATUS' }
    }

    // Find user UUID
    const users = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE clerk_id = ${clerkId}
    `
    const user = users[0]
    if (!user) return { ok: false, code: 'NOT_FOUND' }

    if (report.user_id === user.id) {
      return { ok: false, code: 'OWN_REPORT' }
    }

    // Check for existing confirmation
    const existing = await this.db.reportConfirmation.findUnique({
      where: { report_id_user_id: { report_id: reportId, user_id: user.id } },
    })
    if (existing) return { ok: false, code: 'ALREADY_CONFIRMED' }

    // Atomic: insert confirmation + increment count (CTE for PgBouncer compatibility)
    try {
      const result = await this.db.$queryRaw<Array<{ confirmation_count: number }>>`
        WITH new_confirmation AS (
          INSERT INTO report_confirmations (report_id, user_id)
          VALUES (${reportId}::uuid, ${user.id}::uuid)
          RETURNING id
        ),
        updated AS (
          UPDATE reports
          SET confirmation_count = confirmation_count + 1, updated_at = now()
          WHERE id = ${reportId}::uuid
            AND EXISTS (SELECT 1 FROM new_confirmation)
          RETURNING confirmation_count
        )
        SELECT confirmation_count FROM updated
      `
      return { ok: true, count: result[0]!.confirmation_count }
    } catch (err) {
      // PostgreSQL unique constraint violation (concurrent duplicate confirm)
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === '23505') {
        return { ok: false, code: 'ALREADY_CONFIRMED' }
      }
      throw err
    }
  }

  async removeConfirmation(clerkId: string, reportId: string): Promise<RemoveConfirmationResult> {
    // Find user UUID
    const users = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE clerk_id = ${clerkId}
    `
    const user = users[0]
    if (!user) return { ok: false, code: 'NOT_FOUND' }

    // Atomic: delete confirmation + decrement count (CTE for PgBouncer compatibility)
    const result = await this.db.$queryRaw<Array<{ confirmation_count: number | null }>>`
      WITH deleted AS (
        DELETE FROM report_confirmations
        WHERE report_id = ${reportId}::uuid AND user_id = ${user.id}::uuid
        RETURNING id
      ),
      updated AS (
        UPDATE reports
        SET confirmation_count = GREATEST(confirmation_count - 1, 0), updated_at = now()
        WHERE id = ${reportId}::uuid
          AND EXISTS (SELECT 1 FROM deleted)
        RETURNING confirmation_count
      )
      SELECT confirmation_count FROM updated
    `

    if (result.length === 0) return { ok: false, code: 'NOT_FOUND' }
    return { ok: true, count: result[0]!.confirmation_count! }
  }
}
