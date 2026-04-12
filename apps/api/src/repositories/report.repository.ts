import type { PrismaClient } from '@prisma/client'

export interface CreateReportData {
  userId: string
  problemTypeUser: string
  problemTypeAi: string | null
  aiConfidence: number | null
  aiRawResponse: unknown
  latitude: number
  longitude: number
  photoOriginalKey: string
  description: string | null
}

export interface ReportRepository {
  create(data: CreateReportData): Promise<{ id: string; createdAt: Date }>
  updateRegionAndAddress(id: string, regionId: string | null, addressRaw: string | null): Promise<void>
}

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: CreateReportData): Promise<{ id: string; createdAt: Date }> {
    // location is geometry — must use raw SQL for insert.
    // Also inserts initial report_status_history row (spec: every status change is recorded).
    return this.db.$transaction(async (tx) => {
      const result = await tx.$queryRaw<Array<{ id: string; created_at: Date }>>`
        INSERT INTO reports (
          user_id, status, problem_type_user, problem_type_ai,
          ai_confidence, ai_raw_response, location,
          photo_original_key, description
        )
        VALUES (
          ${data.userId}::uuid,
          'pending_review'::"report_status",
          ${data.problemTypeUser}::"problem_type",
          ${data.problemTypeAi}::"problem_type",
          ${data.aiConfidence}::real,
          ${JSON.stringify(data.aiRawResponse)}::jsonb,
          ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326),
          ${data.photoOriginalKey},
          ${data.description}
        )
        RETURNING id, created_at
      `
      const row = result[0]!

      // Audit trail: initial status transition (from_status = null = system creation)
      await tx.$queryRaw`
        INSERT INTO report_status_history (report_id, from_status, to_status, changed_by)
        VALUES (
          ${row.id}::uuid,
          NULL,
          'pending_review'::"report_status",
          ${data.userId}::uuid
        )
      `

      return { id: row.id, createdAt: row.created_at }
    })
  }

  async updateRegionAndAddress(
    id: string,
    regionId: string | null,
    addressRaw: string | null,
  ): Promise<void> {
    await this.db.report.update({
      where: { id },
      data: {
        region_id: regionId,
        address_raw: addressRaw,
      },
    })
  }
}
