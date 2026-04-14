import Fastify from 'fastify'
import fastifyHelmet from '@fastify/helmet'
import fastifyCors from '@fastify/cors'
import fastifyMultipart from '@fastify/multipart'
import { clerkPlugin } from '@clerk/fastify'
import type { Env } from './env.js'
import { getPrisma } from './lib/prisma.js'
import { getRedis, getBullMQRedis } from './lib/redis.js'
import { getR2 } from './lib/r2.js'
import { UserRepository } from './repositories/user.repository.js'
import { PrismaApiKeyRepository } from './repositories/api-key.repository.js'
import { PrismaRoleRepository } from './repositories/role.repository.js'
import { PrismaClassificationRepository } from './repositories/classification.repository.js'
import { PrismaReportRepository } from './repositories/report.repository.js'
import { PrismaPublicReportRepository } from './repositories/public-report.repository.js'
import { PrismaModerationRepository } from './repositories/moderation.repository.js'
import { PrismaUserProfileRepository } from './repositories/user-profile.repository.js'
import { clerkWebhookRoutes } from './routes/internal/clerk-webhook.js'
import { adminApiKeyRoutes } from './routes/admin/api-keys.js'
import { adminRoleRoutes } from './routes/admin/roles.js'
import { classifyRoutes } from './routes/classify.js'
import { reportRoutes } from './routes/reports.js'
import { publicReportRoutes } from './routes/public/reports.js'
import { publicStatsRoutes } from './routes/public/stats.js'
import { moderationQueueRoutes } from './routes/moderation/queue.js'
import { moderationActionsRoutes } from './routes/moderation/actions.js'
import { moderationFeedRoutes } from './routes/moderation/feed.js'
import { meRoutes } from './routes/me.js'
import { confirmationRoutes } from './routes/confirmations.js'
import { startCleanupCron, startArchiveCron } from './workers/cleanup.js'
import { startClassifyWorker } from './workers/classify.js'
import { startLeaseExpiryWorker } from './workers/lease-expiry.js'

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
  const publicReportRepo = new PrismaPublicReportRepository(db)
  const moderationRepo = new PrismaModerationRepository(db)
  const userProfileRepo = new PrismaUserProfileRepository(db)

  // Plugins
  await fastify.register(fastifyHelmet)
  await fastify.register(fastifyCors, {
    origin: env.NODE_ENV === 'production'
      ? [env.WEB_URL, 'http://localhost:3000', 'http://localhost:3001']
      : true,
    credentials: true,
  })
  await fastify.register(clerkPlugin)
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — hard backstop
    throwFileSizeLimit: false, // we return 400 ourselves; plugin just truncates the stream
  })

  // Routes
  await fastify.register(clerkWebhookRoutes, { db: userRepo })
  await fastify.register(adminApiKeyRoutes, { db: apiKeyRepo, redis })
  await fastify.register(adminRoleRoutes, { db: roleRepo, redis })
  await fastify.register(classifyRoutes, {
    db: classificationRepo,
    banDb: userRepo,
    s3,
    r2Bucket: env.R2_BUCKET,
    redis,
    prisma: db,
  })
  await fastify.register(reportRoutes, {
    classificationDb: classificationRepo,
    reportDb: reportRepo,
    banDb: userRepo,
    s3,
    r2Bucket: env.R2_BUCKET,
    redis,
    cfAccountId: env.CF_ACCOUNT_ID,
    cfImagesApiToken: env.CF_IMAGES_API_TOKEN,
    prisma: db,
  })
  await fastify.register(publicReportRoutes, {
    db: publicReportRepo,
    redis,
    cfImagesBaseUrl: env.CF_IMAGES_BASE_URL,
  })
  await fastify.register(publicStatsRoutes, {
    db: publicReportRepo,
    redis,
  })
  await fastify.register(moderationQueueRoutes, {
    db: moderationRepo,
    redis,
    cfImagesBaseUrl: env.CF_IMAGES_BASE_URL,
  })
  await fastify.register(moderationActionsRoutes, {
    db: moderationRepo,
    redis,
    prisma: db,
  })
  await fastify.register(moderationFeedRoutes, {
    db: moderationRepo,
    redis,
  })
  await fastify.register(meRoutes, {
    db: userProfileRepo,
    redis,
    cfImagesBaseUrl: env.CF_IMAGES_BASE_URL,
  })
  await fastify.register(confirmationRoutes, {
    db: userProfileRepo,
    banDb: userRepo,
    redis,
  })

  // Background workers (only in non-test envs)
  if (env.NODE_ENV !== 'test') {
    startCleanupCron(classificationRepo, s3, env.R2_BUCKET)
    startArchiveCron(moderationRepo)
    startLeaseExpiryWorker(redis, moderationRepo)
    startClassifyWorker({
      redis,
      workerRedis: getBullMQRedis(env.REDIS_URL),
      s3,
      r2Bucket: env.R2_BUCKET,
      claudeApiKey: env.CLAUDE_API_KEY,
      classificationRepo,
    })
  }

  return { fastify, redis }
}
