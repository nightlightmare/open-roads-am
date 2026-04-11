import type { PrismaClient } from '@prisma/client'
import type { ApiKeyRepository, ApiKeyRecord } from '../middleware/verify-api-key.js'
import type { ApiKeyCreateRepository } from '../routes/admin/api-keys.js'
import type { Role } from '@open-road/types'

export class PrismaApiKeyRepository implements ApiKeyRepository, ApiKeyCreateRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const row = await this.db.apiKey.findFirst({
      where: {
        key_prefix: prefix,
        revoked_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      include: { user: { select: { role: true } } },
    })

    if (!row) return null

    return {
      id: row.id,
      userId: row.user_id,
      keyHash: row.key_hash,
      scopes: row.scopes,
      role: row.user.role as Role,
    }
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.db.apiKey.update({
      where: { id },
      data: { last_used_at: new Date() },
    })
  }

  async create(data: {
    userId: string
    keyPrefix: string
    keyHash: string
    scopes: string[]
    expiresAt: Date | null
  }): Promise<{ id: string }> {
    const row = await this.db.apiKey.create({
      data: {
        user_id: data.userId,
        key_hash: data.keyHash,
        key_prefix: data.keyPrefix,
        label: data.keyPrefix, // prefix used as default label until route exposes label field
        scopes: data.scopes,
        expires_at: data.expiresAt,
      },
      select: { id: true },
    })
    return { id: row.id }
  }
}
