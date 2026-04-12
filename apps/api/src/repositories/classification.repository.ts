import type { PrismaClient } from '@prisma/client'
import { ProblemType } from '@prisma/client'

export interface ClassificationRecord {
  id: string
  userId: string
  photoTempKey: string
  status: 'pending' | 'completed' | 'failed'
  problemTypeAi: string | null
  aiConfidence: number | null
  aiRawResponse: unknown
}

export interface ExpiredClassification {
  id: string
  photoTempKey: string
}

export interface ClassificationUpdateData {
  status: 'completed' | 'failed'
  problemTypeAi?: string | null
  aiConfidence?: number | null
  aiRawResponse?: unknown
}

export interface ClassificationRepository {
  create(data: {
    userId: string
    photoTempKey: string
    expiresAt: Date
  }): Promise<{ id: string }>

  findById(id: string): Promise<ClassificationRecord | null>

  findByIdAndUser(id: string, userId: string): Promise<ClassificationRecord | null>

  update(id: string, data: ClassificationUpdateData): Promise<void>

  delete(id: string): Promise<void>

  findExpired(): Promise<ExpiredClassification[]>
}

export class PrismaClassificationRepository implements ClassificationRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: { userId: string; photoTempKey: string; expiresAt: Date }): Promise<{ id: string }> {
    const row = await this.db.photoClassification.create({
      data: {
        user_id: data.userId,
        photo_temp_key: data.photoTempKey,
        expires_at: data.expiresAt,
      },
      select: { id: true },
    })
    return { id: row.id }
  }

  async findByIdAndUser(id: string, userId: string): Promise<ClassificationRecord | null> {
    const row = await this.db.photoClassification.findFirst({
      where: { id, user_id: userId },
    })
    if (!row) return null

    return {
      id: row.id,
      userId: row.user_id,
      photoTempKey: row.photo_temp_key,
      status: row.status as ClassificationRecord['status'],
      problemTypeAi: row.problem_type_ai ?? null,
      aiConfidence: row.ai_confidence ?? null,
      aiRawResponse: row.ai_raw_response,
    }
  }

  async findById(id: string): Promise<ClassificationRecord | null> {
    const row = await this.db.photoClassification.findUnique({ where: { id } })
    if (!row) return null
    return {
      id: row.id,
      userId: row.user_id,
      photoTempKey: row.photo_temp_key,
      status: row.status as ClassificationRecord['status'],
      problemTypeAi: row.problem_type_ai ?? null,
      aiConfidence: row.ai_confidence ?? null,
      aiRawResponse: row.ai_raw_response,
    }
  }

  async update(id: string, data: ClassificationUpdateData): Promise<void> {
    await this.db.photoClassification.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.problemTypeAi !== undefined && {
          problem_type_ai: data.problemTypeAi as ProblemType | null,
        }),
        ...(data.aiConfidence !== undefined && { ai_confidence: data.aiConfidence }),
        ...(data.aiRawResponse !== undefined && { ai_raw_response: data.aiRawResponse as object }),
      },
    })
  }

  async delete(id: string): Promise<void> {
    await this.db.photoClassification.delete({ where: { id } })
  }

  async findExpired(): Promise<ExpiredClassification[]> {
    const rows = await this.db.photoClassification.findMany({
      where: { expires_at: { lt: new Date() } },
      select: { id: true, photo_temp_key: true },
    })
    return rows.map((r) => ({ id: r.id, photoTempKey: r.photo_temp_key }))
  }
}
