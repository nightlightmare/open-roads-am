import type { PrismaClient } from '@prisma/client'

const cache = new Map<string, string>()

/** Resolve a Clerk ID to the internal user UUID. Cached in-memory. */
export async function resolveUserId(db: PrismaClient, clerkId: string): Promise<string> {
  const cached = cache.get(clerkId)
  if (cached) return cached

  const user = await db.user.findUnique({
    where: { clerk_id: clerkId },
    select: { id: true },
  })
  if (!user) throw new Error(`User not found for clerk_id: ${clerkId}`)

  cache.set(clerkId, user.id)
  return user.id
}
