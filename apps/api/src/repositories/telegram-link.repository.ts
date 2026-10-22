import type { PrismaClient } from '@prisma/client'

export interface TelegramLinkRecord {
  user_id: string
  chat_id: bigint
  username: string | null
  linked_at: Date
}

export interface TelegramLinkRepository {
  findByUserId(userId: string): Promise<TelegramLinkRecord | null>
  findByChatId(chatId: bigint): Promise<TelegramLinkRecord | null>
  create(data: {
    userId: string
    chatId: bigint
    username: string | null
  }): Promise<TelegramLinkRecord>
  deleteByUserId(userId: string): Promise<void>
  /**
   * For each candidate userId, return chatId if a Telegram link exists.
   * Used by the dispatcher when fanning out to many recipients.
   */
  findChatIdsForUsers(userIds: string[]): Promise<Map<string, bigint>>
}

export class PrismaTelegramLinkRepository implements TelegramLinkRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: string): Promise<TelegramLinkRecord | null> {
    return this.db.telegramLink.findUnique({ where: { user_id: userId } })
  }

  async findByChatId(chatId: bigint): Promise<TelegramLinkRecord | null> {
    return this.db.telegramLink.findUnique({ where: { chat_id: chatId } })
  }

  async create(data: {
    userId: string
    chatId: bigint
    username: string | null
  }): Promise<TelegramLinkRecord> {
    return this.db.telegramLink.create({
      data: {
        user_id: data.userId,
        chat_id: data.chatId,
        username: data.username,
      },
    })
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.telegramLink.deleteMany({ where: { user_id: userId } })
  }

  async findChatIdsForUsers(userIds: string[]): Promise<Map<string, bigint>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.db.telegramLink.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, chat_id: true },
    })
    const map = new Map<string, bigint>()
    for (const row of rows) map.set(row.user_id, row.chat_id)
    return map
  }
}
