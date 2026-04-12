import Fastify from 'fastify'
import fastifyMultipart from '@fastify/multipart'
import { clerkPlugin } from '@clerk/fastify'
import type { Env } from './env.js'
import { getPrisma } from './lib/prisma.js'
import { getRedis } from './lib/redis.js'
import { getR2 } from './lib/r2.js'
import { UserRepository } from './repositories/user.repository.js'
import { PrismaApiKeyRepository } from './repositories/api-key.repository.js'
import { PrismaRoleRepository } from './repositories/role.repository.js'
import { PrismaClassificationRepository } from './repositories/classification.repository.js'
import { PrismaReportRepository } from './repositories/report.repository.js'
import { clerkWebhookRoutes } from './routes/internal/clerk-webhook.js'
import { adminApiKeyRoutes } from './routes/admin/api-keys.js'
import { adminRoleRoutes } from './routes/admin/roles.js'
import { classifyRoutes } from './routes/classify.js'
import { reportRoutes } from './routes/reports.js'
import { startCleanupCron } from './workers/cleanup.js'

export async function buildServer(env: Env) {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'test',
  })

  const db = getPrisma(env.DATABASE_URL)
  const redis = getRedis(env.REDIS_URL)
  const s3 = getR2({
    endpoint: env.R2_ENDPOINT,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  })

  const userRepo = new UserRepository(db)
  const apiKeyRepo = new PrismaApiKeyRepository(db)
  const roleRepo = new PrismaRoleRepository(db)
  const classificationRepo = new PrismaClassificationRepository(db)
  const reportRepo = new PrismaReportRepository(db)

  // Fastify v5: must declare before route registration
  fastify.decorateRequest('auth', null)

  // Plugins
  await fastify.register(clerkPlugin)
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — hard limit at multipart level
  })

  // Routes
  await fastify.register(clerkWebhookRoutes, { db: userRepo })
  await fastify.register(adminApiKeyRoutes, { db: apiKeyRepo })
  await fastify.register(adminRoleRoutes, { db: roleRepo })
  await fastify.register(classifyRoutes, {
    db: classificationRepo,
    banDb: userRepo,
    s3,
    r2Bucket: env.R2_BUCKET,
    redis,
  })
  await fastify.register(reportRoutes, {
    classificationDb: classificationRepo,
    reportDb: reportRepo,
    banDb: userRepo,
    s3,
    r2Bucket: env.R2_BUCKET,
    redis,
  })

  // Background cron (only in non-test envs)
  if (env.NODE_ENV !== 'test') {
    startCleanupCron(classificationRepo, s3, env.R2_BUCKET)
  }

  return { fastify, redis }
}
