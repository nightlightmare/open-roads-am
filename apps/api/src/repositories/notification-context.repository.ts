import type { PrismaClient } from '@prisma/client'

export interface NotificationReportContext {
  id: string
  user_id: string
  problem_type: string | null
  address_raw: string | null
  description: string | null
  photo_optimized_key: string | null
  confirmation_count: number
  status: string
  rejection_reason: string | null
}

export interface NotificationContextRepository {
  /** Returns recipient user IDs for moderator-level events (moderator + admin). */
  listModeratorUserIds(): Promise<string[]>
  /** Loads the fields needed to render a notification for a given report. */
  getReportContext(reportId: string): Promise<NotificationReportContext | null>
}

export class PrismaNotificationContextRepository
  implements NotificationContextRepository
{
  constructor(private readonly db: PrismaClient) {}

  async listModeratorUserIds(): Promise<string[]> {
    const rows = await this.db.user.findMany({
      where: { role: { in: ['moderator', 'admin'] }, is_banned: false },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }

  async getReportContext(reportId: string): Promise<NotificationReportContext | null> {
    const rows = await this.db.$queryRaw<
      Array<{
        id: string
        user_id: string
        problem_type: string | null
        address_raw: string | null
        description: string | null
        photo_optimized_key: string | null
        confirmation_count: number
        status: string
        rejection_reason: string | null
      }>
    >`
      SELECT
        r.id,
        r.user_id::text AS user_id,
        COALESCE(r.problem_type_final, r.problem_type_user)::text AS problem_type,
        r.address_raw,
        r.description,
        r.photo_optimized_key,
        r.confirmation_count,
        r.status::text,
        r.rejection_reason
      FROM reports r
      WHERE r.id = ${reportId}::uuid
        AND r.deleted_at IS NULL
      LIMIT 1
    `
    return rows[0] ?? null
  }
}
