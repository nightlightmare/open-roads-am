import { validateEnv } from './env.js'
import { buildServer } from './server.js'

const env = validateEnv()
const fastify = await buildServer(env)

try {
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
