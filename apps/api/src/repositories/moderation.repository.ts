import { Prisma, type PrismaClient } from '@prisma/client'

export interface ModerationQueueItem {
  id: string
  status: string
  problem_type_user: string | null
  problem_type_ai: string | null
  ai_confidence: number | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_optimized_key: string | null
  confirmation_count: number
  created_at: Date
}

export interface ModerationQueueResult {
  reports: ModerationQueueItem[]
  cursor: string | null
  total_pending: number
}

export interface ModerationQueueQuery {
  status: 'pending_review' | 'under_review'
  problemType: string | null
  cursor: string | null
  limit: number
}

export interface ModerationReportDetail {
  id: string
  status: string
  userId: string
}

export interface ApproveData {
  moderatedBy: string
  moderatedByRole: string
  problemTypeFinal: string | null
  note: string | null
}

export interface RejectData {
  moderatedBy: string
  moderatedByRole: string
  rejectionReason: string
}

export interface ModerationRepository {
  getQueue(query: ModerationQueueQuery): Promise<ModerationQueueResult>
  findById(id: string): Promise<ModerationReportDetail | null>
  transitionStatus(
    id: string,
    fromStatus: string,
    toStatus: string,
    changedBy: string | null,
    changedByRole: string | null,
    note: string | null,
  ): Promise<boolean>
  approve(id: string, data: ApproveData): Promise<void>
  reject(id: string, data: RejectData): Promise<void>
  updateStatus(
    id: string,
    toStatus: string,
    changedBy: string,
    changedByRole: string,
    note: string | null,
  ): Promise<boolean>
  findUnderReview(): Promise<string[]>
  revertToQueue(ids: string[]): Promise<void>
  archiveOldReports(): Promise<number>
}

export class PrismaModerationRepository implements ModerationRepository {
  constructor(private readonly db: PrismaClient) {}

  async getQueue(query: ModerationQueueQuery): Promise<ModerationQueueResult> {
    const { status, problemType, cursor, limit } = query

    const totalResult = await this.db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM reports
      WHERE deleted_at IS NULL
        AND status = ANY(ARRAY['pending_review','under_review']::"report_status"[])
    `
    const total_pending = Number(totalResult[0]?.count ?? 0)

    const ptFilter = problemType !== null
      ? Prisma.sql`(problem_type_user::text = ${problemType}::text OR problem_type_ai::text = ${problemType}::text)`
      : Prisma.sql`TRUE`

    const cursorFilter = cursor !== null
      ? Prisma.sql`created_at > ${new Date(cursor)}`
      : Prisma.sql`TRUE`

    const rows = await this.db.$queryRaw<
      Array<{
        id: string
        status: string
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
      }>
    >`
      SELECT
        id,
        status::text,
        problem_type_user::text,
        problem_type_ai::text,
        ai_confidence,
        description,
        ST_X(location) AS longitude,
        ST_Y(location) AS latitude,
        address_raw,
        photo_optimized_key,
        confirmation_count,
        created_at
      FROM reports
      WHERE
        deleted_at IS NULL
        AND status = ${status}::"report_status"
        AND ${ptFilter}
        AND ${cursorFilter}
      ORDER BY created_at ASC
      LIMIT ${limit + 1}
    `

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? items[items.length - 1]!.created_at.toISOString() : null

    return {
      reports: items.map((r) => ({
        id: r.id,
        status: r.status,
        problem_type_user: r.problem_type_user,
        problem_type_ai: r.problem_type_ai,
        ai_confidence: r.ai_confidence,
        description: r.description,
        latitude: r.latitude,
        longitude: r.longitude,
        address_raw: r.address_raw,
        photo_optimized_key: r.photo_optimized_key,
        confirmation_count: r.confirmation_count,
        created_at: r.created_at,
      })),
      cursor: nextCursor,
      total_pending,
    }
  }

  async findById(id: string): Promise<ModerationReportDetail | null> {
    const row = await this.db.report.findUnique({
      where: { id, deleted_at: null },
      select: { id: true, status: true, user_id: true },
    })
    if (!row) return null
    return { id: row.id, status: row.status as unknown as string, userId: row.user_id }
  }

  async transitionStatus(
    id: string,
    fromStatus: string,
    toStatus: string,
    changedBy: string | null,
    changedByRole: string | null,
    note: string | null,
  ): Promise<boolean> {
    const historyInsert = changedBy && changedByRole
      ? Prisma.sql`
          INSERT INTO report_status_history
            (report_id, from_status, to_status, changed_by, changed_by_role, note)
          SELECT
            ${id}::uuid,
            ${fromStatus}::"report_status",
            ${toStatus}::"report_status",
            ${changedBy}::uuid,
            ${changedByRole}::"user_role",
            ${note}::text
          FROM updated
          WHERE EXISTS (SELECT 1 FROM updated)
        `
      : Prisma.sql`
          INSERT INTO report_status_history
            (report_id, from_status, to_status, note)
          SELECT
            ${id}::uuid,
            ${fromStatus}::"report_status",
            ${toStatus}::"report_status",
            ${note}::text
          FROM updated
          WHERE EXISTS (SELECT 1 FROM updated)
        `

    const result = await this.db.$queryRaw<Array<{ success: boolean }>>`
      WITH updated AS (
        UPDATE reports
        SET status = ${toStatus}::"report_status", updated_at = now()
        WHERE id = ${id}::uuid
          AND status = ${fromStatus}::"report_status"
          AND deleted_at IS NULL
        RETURNING id
      ),
      history AS (
        ${historyInsert}
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM updated) AS success
    `
    return result[0]?.success ?? false
  }

  async approve(id: string, data: ApproveData): Promise<void> {
    const { moderatedBy, moderatedByRole, problemTypeFinal, note } = data
    await this.db.$queryRaw`
      WITH updated AS (
        UPDATE reports
        SET
          status = 'approved'::"report_status",
          problem_type_final = ${problemTypeFinal}::"problem_type",
          moderated_by = ${moderatedBy}::uuid,
          moderated_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid
          AND status = 'under_review'::"report_status"
          AND deleted_at IS NULL
        RETURNING id
      )
      INSERT INTO report_status_history
        (report_id, from_status, to_status, changed_by, changed_by_role, note)
      SELECT
        ${id}::uuid,
        'under_review'::"report_status",
        'approved'::"report_status",
        ${moderatedBy}::uuid,
        ${moderatedByRole}::"user_role",
        ${note}::text
      FROM updated
      WHERE EXISTS (SELECT 1 FROM updated)
    `
  }

  async reject(id: string, data: RejectData): Promise<void> {
    const { moderatedBy, moderatedByRole, rejectionReason } = data
    await this.db.$queryRaw`
      WITH updated AS (
        UPDATE reports
        SET
          status = 'rejected'::"report_status",
          rejection_reason = ${rejectionReason}::text,
          moderated_by = ${moderatedBy}::uuid,
          moderated_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid
          AND status = 'under_review'::"report_status"
          AND deleted_at IS NULL
        RETURNING id
      )
      INSERT INTO report_status_history
        (report_id, from_status, to_status, changed_by, changed_by_role, note)
      SELECT
        ${id}::uuid,
        'under_review'::"report_status",
        'rejected'::"report_status",
        ${moderatedBy}::uuid,
        ${moderatedByRole}::"user_role",
        NULL::text
      FROM updated
      WHERE EXISTS (SELECT 1 FROM updated)
    `
  }

  async updateStatus(
    id: string,
    toStatus: string,
    changedBy: string,
    changedByRole: string,
    note: string | null,
  ): Promise<boolean> {
    const ALLOWED: Record<string, string> = {
      approved: 'in_progress',
      in_progress: 'resolved',
    }
    const report = await this.db.report.findUnique({
      where: { id, deleted_at: null },
      select: { status: true },
    })
    if (!report) return false

    const fromStatus = report.status as unknown as string
    if (ALLOWED[fromStatus] !== toStatus) return false

    return this.transitionStatus(id, fromStatus, toStatus, changedBy, changedByRole, note)
  }

  // Returns IDs of all reports currently in under_review status
  async findUnderReview(): Promise<string[]> {
    const rows = await this.db.report.findMany({
      where: { status: 'under_review' as never, deleted_at: null },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }

  // Reverts given report IDs from under_review → pending_review (lease expired)
  async revertToQueue(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await Promise.all(
      ids.map((id) =>
        this.transitionStatus(id, 'under_review', 'pending_review', null, null, 'lease_expired'),
      ),
    )
  }

  async archiveOldReports(): Promise<number> {
    const result = await this.db.$queryRaw<Array<{ count: bigint }>>`
      WITH archived AS (
        UPDATE reports
        SET status = 'archived'::"report_status", updated_at = now()
        WHERE deleted_at IS NULL
          AND (
            (status = 'resolved'::"report_status"
              AND updated_at < now() - INTERVAL '90 days')
            OR
            (status = 'approved'::"report_status"
              AND updated_at < now() - INTERVAL '365 days')
          )
        RETURNING id
      )
      SELECT COUNT(*) AS count FROM archived
    `
    return Number(result[0]?.count ?? 0)
  }
}
