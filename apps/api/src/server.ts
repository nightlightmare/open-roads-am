import Fastify from 'fastify'
import { clerkPlugin } from '@clerk/fastify'
import type { Env } from './env.js'

export async function buildServer(env: Env) {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'test',
  })

  // Fastify v5: must declare before route registration
  fastify.decorateRequest('auth', null)

  // Clerk plugin — reads CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY from env
  await fastify.register(clerkPlugin)

  return fastify
}
