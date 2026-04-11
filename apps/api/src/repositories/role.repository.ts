import type { PrismaClient } from '@prisma/client'
import type { UserRoleRepository } from '../routes/admin/roles.js'
import type { Role } from '@open-road/types'

export class PrismaRoleRepository implements UserRoleRepository {
  constructor(private readonly db: PrismaClient) {}

  async updateRole(clerkId: string, role: Role): Promise<void> {
    await this.db.user.update({
      where: { clerk_id: clerkId },
      data: { role: role as never },
    })
  }
}
