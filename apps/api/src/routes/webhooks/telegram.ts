import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { z } from 'zod'
import type { TelegramClient } from '../../lib/telegram.js'
import { escapeMarkdownV2 } from '../../lib/telegram.js'
import type { TelegramLinkRepository } from '../../repositories/telegram-link.repository.js'

const SECRET_HEADER = 'x-telegram-bot-api-secret-token'

// Minimal subset of the Update object we care about — `/start`, `/stop`, etc.
const UpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number().optional(),
      chat: z.object({
        id: z.number(),
        type: z.string(),
      }),
      from: z
        .object({
          id: z.number().optional(),
          username: z.string().optional(),
        })
        .optional(),
      text: z.string().optional(),
    })
    .optional(),
})

function linkTokenKey(token: string): string {
  return `telegram:link:${token}`
}

function userLinkTokenKey(userId: string): string {
  return `telegram:link:user:${userId}`
}

function parseCommand(text: string): { command: string; arg: string } {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return { command: '', arg: '' }
  const [rawCmd, ...rest] = trimmed.split(/\s+/)
  // Telegram may suffix `@botusername` — strip it.
  const command = (rawCmd ?? '').split('@')[0]!.toLowerCase()
  return { command, arg: rest.join(' ') }
}

interface TelegramWebhookOptions {
  redis: Redis
  linkRepo: TelegramLinkRepository
  telegram: TelegramClient
  webhookSecret: string
}

/**
 * POST /api/v1/webhooks/telegram
 *
 * Public endpoint protected by the secret-token header. Handles `/start <token>`
 * (link account), `/stop` (unlink), `/status`, `/help`. Unknown commands /
 * non-command messages are ignored to avoid echoing user input back into logs.
 */
export async function telegramWebhookRoutes(
  fastify: FastifyInstance,
  options: TelegramWebhookOptions,
): Promise<void> {
  const { redis, linkRepo, telegram, webhookSecret } = options

  fastify.post('/api/v1/webhooks/telegram', async (request, reply) => {
    const provided = request.headers[SECRET_HEADER]
    if (typeof provided !== 'string' || provided !== webhookSecret) {
      // Spec: no body on invalid secret.
      return reply.code(403).send()
    }

    const parsed = UpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      // Acknowledge to prevent Telegram retries — body was unexpected.
      return reply.code(200).send({ ok: true })
    }

    const message = parsed.data.message
    if (!message || !message.text) return reply.code(200).send({ ok: true })

    const chatId = BigInt(message.chat.id)
    const { command, arg } = parseCommand(message.text)

    switch (command) {
      case '/start': {
        if (!arg) {
          await telegram.sendMessage({
            chatId,
            text: escapeMarkdownV2(
              'Welcome! Open open-road.am settings to link this Telegram account.',
            ),
            parseMode: 'MarkdownV2',
          })
          return reply.code(200).send({ ok: true })
        }

        const userId = await redis.get(linkTokenKey(arg))
        if (!userId) {
          await telegram.sendMessage({
            chatId,
            text: escapeMarkdownV2(
              'Link expired or invalid. Generate a new one in your settings.',
            ),
            parseMode: 'MarkdownV2',
          })
          return reply.code(200).send({ ok: true })
        }

        // Token is single-use — burn both keys regardless of outcome.
        await redis.del(linkTokenKey(arg))
        await redis.del(userLinkTokenKey(userId))

        // Honour `UNIQUE(user_id)` and `UNIQUE(chat_id)` by clearing any
        // prior links before creating the new one.
        await linkRepo.deleteByUserId(userId)
        const existing = await linkRepo.findByChatId(chatId)
        if (existing && existing.user_id !== userId) {
          await linkRepo.deleteByUserId(existing.user_id)
        }

        await linkRepo.create({
          userId,
          chatId,
          username: message.from?.username ?? null,
        })

        await telegram.sendMessage({
          chatId,
          text: escapeMarkdownV2(
            "Connected! You'll receive notifications about your reports here.",
          ),
          parseMode: 'MarkdownV2',
        })
        return reply.code(200).send({ ok: true })
      }

      case '/stop': {
        const link = await linkRepo.findByChatId(chatId)
        if (link) await linkRepo.deleteByUserId(link.user_id)

        await telegram.sendMessage({
          chatId,
          text: escapeMarkdownV2(
            'Notifications disabled. You can re-link anytime from open-road.am settings.',
          ),
          parseMode: 'MarkdownV2',
        })
        return reply.code(200).send({ ok: true })
      }

      case '/status': {
        const link = await linkRepo.findByChatId(chatId)
        const text = link
          ? `You are linked to open-road\\.am\\. Linked at ${escapeMarkdownV2(link.linked_at.toISOString())}\\.`
          : escapeMarkdownV2(
              'Not linked. Generate a link from open-road.am settings to receive notifications.',
            )
        await telegram.sendMessage({ chatId, text, parseMode: 'MarkdownV2' })
        return reply.code(200).send({ ok: true })
      }

      case '/help': {
        await telegram.sendMessage({
          chatId,
          text:
            `*Available commands*\n\n` +
            `/start \\<token\\> — link your account\n` +
            `/stop — unlink and disable notifications\n` +
            `/status — show current link status\n` +
            `/help — show this message`,
          parseMode: 'MarkdownV2',
        })
        return reply.code(200).send({ ok: true })
      }

      default:
        // Unknown command — acknowledge silently per Spec 12 anti-abuse.
        return reply.code(200).send({ ok: true })
    }
  })
}
