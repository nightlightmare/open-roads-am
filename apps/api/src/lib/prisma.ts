import { PrismaPostgresAdapter } from '@prisma/adapter-ppg'
import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient | undefined

export function getPrisma(databaseUrl: string): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaPostgresAdapter({ connectionString: databaseUrl })
    prisma = new PrismaClient({ adapter })
  }
  return prisma
}
