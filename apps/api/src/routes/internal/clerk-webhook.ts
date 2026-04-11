import type { FastifyInstance } from 'fastify'
import { verifyWebhook } from '@clerk/fastify/webhooks'

export interface WebhookUserRepository {
  createUser(data: { clerkId: string; displayName: string | null }): Promise<void>
  updateUser(data: { clerkId: string; displayName: string | null; role: string }): Promise<void>
  softDeleteUser(clerkId: string): Promise<void>
}

export async function clerkWebhookRoutes(
  fastify: FastifyInstance,
  options: { db: WebhookUserRepository },
): Promise<void> {
  fastify.post('/api/v1/internal/clerk-webhook', async (request, reply) => {
    let evt: Awaited<ReturnType<typeof verifyWebhook>>

    try {
      evt = await verifyWebhook(request)
    } catch {
      return reply.code(400).send('Webhook verification failed')
    }

    const type = evt.type
    const data = evt.data as unknown as Record<string, unknown>

    switch (type) {
      case 'user.created': {
        const first = data['first_name'] as string | null
        const last = data['last_name'] as string | null
        const displayName = [first, last].filter(Boolean).join(' ') || null
        await options.db.createUser({ clerkId: data['id'] as string, displayName })
        break
      }
      case 'user.updated': {
        const first = data['first_name'] as string | null
        const last = data['last_name'] as string | null
        const displayName = [first, last].filter(Boolean).join(' ') || null
        const meta = data['public_metadata'] as Record<string, unknown> | undefined
        await options.db.updateUser({
          clerkId: data['id'] as string,
          displayName,
          role: (meta?.['role'] as string) ?? 'user',
        })
        break
      }
      case 'user.deleted': {
        await options.db.softDeleteUser(data['id'] as string)
        break
      }
    }

    return reply.code(200).send({ received: true })
  })
}
