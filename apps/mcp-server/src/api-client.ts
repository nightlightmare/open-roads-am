/**
 * Thin HTTP client for the open-road.am Fastify API.
 * All business logic lives in the API — this is a pure adapter.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function toMcpErrorMessage(err: ApiError): string {
  switch (err.code) {
    case 'UNAUTHORIZED':      return 'Invalid or missing API key.'
    case 'FORBIDDEN':         return 'This API key does not have permission for this action.'
    case 'RATE_LIMIT_EXCEEDED': return 'Rate limit exceeded. Please wait before retrying.'
    case 'NOT_FOUND':         return 'Report not found or not publicly visible.'
    case 'BBOX_TOO_LARGE':    return 'Area too large. Please specify a smaller bounding box (max 2°×2°).'
    default:
      if (err.status >= 500) return 'Service temporarily unavailable.'
      return `Request failed: ${err.code}`
  }
}

export function apiErrorToMcp(err: unknown): string {
  if (err instanceof ApiError) return toMcpErrorMessage(err)
  return 'Service temporarily unavailable.'
}

export async function apiFetch(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<unknown> {
  const url = new URL(path, baseUrl)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'open-road-mcp/1.0' },
  })

  if (!res.ok) {
    let code = 'INTERNAL_ERROR'
    try {
      const body = (await res.json()) as { code?: string }
      code = body.code ?? code
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, code, `API error ${res.status}: ${code}`)
  }

  return res.json()
}
