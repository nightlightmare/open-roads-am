import Fastify from 'fastify'
import { clerkPlugin } from '@clerk/fastify'
import type { Env } from './env.js'
import { getPrisma } from './lib/prisma.js'
import { getRedis } from './lib/redis.js'
import { UserRepository } from './repositories/user.repository.js'
import { PrismaApiKeyRepository } from './repositories/api-key.repository.js'
import { PrismaRoleRepository } from './repositories/role.repository.js'
import { clerkWebhookRoutes } from './routes/internal/clerk-webhook.js'
import { adminApiKeyRoutes } from './routes/admin/api-keys.js'
import { adminRoleRoutes } from './routes/admin/roles.js'

export async function buildServer(env: Env) {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'test',
  })

  const db = getPrisma(env.DATABASE_URL)
  const redis = getRedis(env.REDIS_URL)

  const userRepo = new UserRepository(db)
  const apiKeyRepo = new PrismaApiKeyRepository(db)
  const roleRepo = new PrismaRoleRepository(db)

  // Fastify v5: must declare before route registration
  fastify.decorateRequest('auth', null)

  // Clerk plugin — reads CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY from env
  await fastify.register(clerkPlugin)

  // Routes
  await fastify.register(clerkWebhookRoutes, { db: userRepo })
  await fastify.register(adminApiKeyRoutes, { db: apiKeyRepo })
  await fastify.register(adminRoleRoutes, { db: roleRepo })

  return { fastify, redis }
}
