/**
 * Thin wrapper around the Telegram Bot API HTTP endpoints we use.
 *
 * No external SDK — Bot API is plain HTTPS + JSON.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org'

/**
 * Escape a string for Telegram MarkdownV2.
 *
 * Per docs (https://core.telegram.org/bots/api#markdownv2-style), every
 * occurrence of `_ * [ ] ( ) ~ \` > # + - = | { } . !` must be escaped with
 * a leading backslash when used outside formatting markers.
 *
 * Inline link bodies (`(...)`) and code blocks have stricter rules — those
 * are handled by `escapeMarkdownV2Link` and `escapeMarkdownV2Code` below.
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}

/** Escape ')' and '\' inside an inline-link URL body. */
export function escapeMarkdownV2LinkUrl(url: string): string {
  return url.replace(/[)\\]/g, '\\$&')
}

export interface InlineKeyboardButton {
  text: string
  url: string
}

export interface SendMessageParams {
  chatId: bigint | number | string
  text: string
  parseMode?: 'MarkdownV2' | 'HTML' | undefined
  replyMarkup?:
    | {
        inline_keyboard: InlineKeyboardButton[][]
      }
    | undefined
  disableWebPagePreview?: boolean | undefined
}

export interface SendPhotoParams {
  chatId: bigint | number | string
  photoUrl: string
  caption?: string | undefined
  parseMode?: 'MarkdownV2' | 'HTML' | undefined
  replyMarkup?:
    | {
        inline_keyboard: InlineKeyboardButton[][]
      }
    | undefined
}

export interface TelegramApiError extends Error {
  ok: false
  errorCode?: number | undefined
  description?: string | undefined
}

export interface TelegramClient {
  sendMessage(params: SendMessageParams): Promise<void>
  sendPhoto(params: SendPhotoParams): Promise<void>
  /** Always succeeds without contacting the API. Used when no bot token is configured. */
  isStub: boolean
}

export function createTelegramClient(botToken: string | null): TelegramClient {
  if (!botToken) {
    return {
      isStub: true,
      // No-op stubs — log so dev can see what would have been sent.
      async sendMessage(params) {
        console.log(
          JSON.stringify({
            telegram: 'stub:sendMessage',
            chatId: params.chatId.toString(),
            length: params.text.length,
          }),
        )
      },
      async sendPhoto(params) {
        console.log(
          JSON.stringify({
            telegram: 'stub:sendPhoto',
            chatId: params.chatId.toString(),
            captionLength: params.caption?.length ?? 0,
          }),
        )
      },
    }
  }

  const baseUrl = `${TELEGRAM_API_BASE}/bot${botToken}`

  async function call(method: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const err = new Error(`Telegram ${method} failed: ${response.status} ${text}`) as TelegramApiError
      err.ok = false
      err.errorCode = response.status
      err.description = text
      throw err
    }

    const json = (await response.json().catch(() => ({ ok: false }))) as {
      ok: boolean
      description?: string
      error_code?: number
    }
    if (!json.ok) {
      const err = new Error(
        `Telegram ${method} returned not-ok: ${json.description ?? 'unknown'}`,
      ) as TelegramApiError
      err.ok = false
      err.errorCode = json.error_code
      err.description = json.description
      throw err
    }
  }

  return {
    isStub: false,
    async sendMessage(params) {
      await call('sendMessage', {
        chat_id: params.chatId.toString(),
        text: params.text,
        parse_mode: params.parseMode,
        reply_markup: params.replyMarkup,
        disable_web_page_preview: params.disableWebPagePreview,
      })
    },
    async sendPhoto(params) {
      await call('sendPhoto', {
        chat_id: params.chatId.toString(),
        photo: params.photoUrl,
        caption: params.caption,
        parse_mode: params.parseMode,
        reply_markup: params.replyMarkup,
      })
    },
  }
}
