import type { PrismaClient } from '@prisma/client'
import type { WebhookUserRepository } from '../routes/internal/clerk-webhook.js'
import type { UserBanRepository } from '../middleware/banned-check.js'

export class UserRepository implements WebhookUserRepository, UserBanRepository {
  constructor(private readonly db: PrismaClient) {}

  async createUser(data: { clerkId: string; displayName: string | null }): Promise<void> {
    await this.db.user.create({
      data: {
        clerk_id: data.clerkId,
        display_name: data.displayName,
      },
    })
  }

  async updateUser(data: {
    clerkId: string
    displayName: string | null
    role: string
  }): Promise<void> {
    await this.db.user.update({
      where: { clerk_id: data.clerkId },
      data: {
        display_name: data.displayName,
        role: data.role as never,
      },
    })
  }

  async softDeleteUser(clerkId: string): Promise<void> {
    // We don't hard-delete users — mark is_banned as a proxy for deleted state
    // until a proper deleted_at is added to the users table in a future spec.
    await this.db.user.update({
      where: { clerk_id: clerkId },
      data: { is_banned: true },
    })
  }

  async isBanned(clerkId: string): Promise<boolean> {
    const user = await this.db.user.findUnique({
      where: { clerk_id: clerkId },
      select: { is_banned: true },
    })
    return user?.is_banned ?? false
  }
}
