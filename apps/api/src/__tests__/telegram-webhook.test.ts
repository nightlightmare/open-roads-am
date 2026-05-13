import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { telegramWebhookRoutes } from '../routes/webhooks/telegram.js'

const SECRET = 'webhook-secret-xyz'

interface MockRedis {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn>
}

interface MockLinkRepo {
  findByChatId: ReturnType<typeof vi.fn>
  findByUserId: ReturnType<typeof vi.fn>
  deleteByUserId: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
}

interface MockTelegram {
  isStub: boolean
  sendMessage: ReturnType<typeof vi.fn>
  sendPhoto: ReturnType<typeof vi.fn>
}

let redis: MockRedis
let linkRepo: MockLinkRepo
let telegram: MockTelegram

async function buildApp() {
  const app = Fastify()
  await app.register(telegramWebhookRoutes, {
    redis: redis as never,
    linkRepo: linkRepo as never,
    telegram: telegram as never,
    webhookSecret: SECRET,
  })
  return app
}

function makeUpdate(text: string, chatId = 1001, username?: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId, type: 'private' },
      from: username ? { id: chatId, username } : { id: chatId },
      text,
    },
  }
}

beforeEach(() => {
  redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  }
  linkRepo = {
    findByChatId: vi.fn().mockResolvedValue(null),
    findByUserId: vi.fn().mockResolvedValue(null),
    deleteByUserId: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
  }
  telegram = {
    isStub: false,
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendPhoto: vi.fn().mockResolvedValue(undefined),
  }
})

describe('POST /api/v1/webhooks/telegram', () => {
  it('returns 403 when secret header is missing', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      payload: makeUpdate('/help'),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 when secret header is wrong', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'nope' },
      payload: makeUpdate('/help'),
    })
    expect(res.statusCode).toBe(403)
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('responds to /help with a command list', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: makeUpdate('/help'),
    })
    expect(res.statusCode).toBe(200)
    expect(telegram.sendMessage).toHaveBeenCalledOnce()
  })

  it('links account on /start with a valid token', async () => {
    redis.get.mockResolvedValue('user-uuid-1')
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: makeUpdate('/start tok-1', 12345, 'alice'),
    })
    expect(res.statusCode).toBe(200)
    expect(linkRepo.deleteByUserId).toHaveBeenCalledWith('user-uuid-1')
    expect(linkRepo.create).toHaveBeenCalledWith({
      userId: 'user-uuid-1',
      chatId: 12345n,
      username: 'alice',
    })
    expect(redis.del).toHaveBeenCalledWith('telegram:link:tok-1')
  })

  it('refuses /start with an expired/invalid token', async () => {
    redis.get.mockResolvedValue(null)
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: makeUpdate('/start expired-tok'),
    })
    expect(res.statusCode).toBe(200)
    expect(linkRepo.create).not.toHaveBeenCalled()
    expect(telegram.sendMessage).toHaveBeenCalledOnce()
  })

  it('unlinks on /stop when chat is linked', async () => {
    linkRepo.findByChatId.mockResolvedValue({
      user_id: 'user-1',
      chat_id: 1001n,
      username: null,
      linked_at: new Date(),
    })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: makeUpdate('/stop'),
    })
    expect(res.statusCode).toBe(200)
    expect(linkRepo.deleteByUserId).toHaveBeenCalledWith('user-1')
  })

  it('silently acknowledges unknown commands', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: makeUpdate('/launch_missile'),
    })
    expect(res.statusCode).toBe(200)
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('acknowledges non-message updates without crashing', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: { update_id: 42 },
    })
    expect(res.statusCode).toBe(200)
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })
})
