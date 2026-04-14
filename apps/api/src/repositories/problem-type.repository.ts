import type { PrismaClient } from '@prisma/client'

export interface ProblemTypeRecord {
  id: string
  name_hy: string
  name_ru: string
  name_en: string
  is_active: boolean
  sort_order: number
}

export interface ProblemTypeRepository {
  findAllActive(): Promise<ProblemTypeRecord[]>
  findById(id: string): Promise<ProblemTypeRecord | null>
  exists(id: string): Promise<boolean>
}

export class PrismaProblemTypeRepository implements ProblemTypeRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAllActive(): Promise<ProblemTypeRecord[]> {
    return this.db.problemType.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
    })
  }

  async findById(id: string): Promise<ProblemTypeRecord | null> {
    return this.db.problemType.findUnique({
      where: { id },
    })
  }

  async exists(id: string): Promise<boolean> {
    const row = await this.db.problemType.findUnique({
      where: { id },
      select: { id: true },
    })
    return row !== null
  }
}
