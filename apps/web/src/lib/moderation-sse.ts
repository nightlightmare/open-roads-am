interface ConnectSSEOptions {
  getToken: () => Promise<string | null>
  refetchPending: (token: string) => Promise<void>
  setPendingCount: (count: number) => void
  onReader: (reader: ReadableStreamDefaultReader<Uint8Array>) => void
  isCancelled: () => boolean
}

export async function connectSSE({
  getToken,
  refetchPending,
  setPendingCount,
  onReader,
  isCancelled,
}: ConnectSSEOptions): Promise<void> {
  const token = await getToken()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/moderation/feed`,
    { headers: { Authorization: `Bearer ${token ?? ''}` } },
  )
  if (!res.ok || !res.body) return
  if (isCancelled()) return

  const reader = res.body.getReader()
  onReader(reader)
  const decoder = new TextDecoder()
  let buffer = ''

  while (!isCancelled()) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as {
            event: string
            total_pending?: number
          }
          if (event.event === 'new_report') {
            const tk = await getToken()
            void refetchPending(tk ?? '')
          }
          if (event.event === 'queue_count' && event.total_pending !== undefined) {
            setPendingCount(event.total_pending)
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}
