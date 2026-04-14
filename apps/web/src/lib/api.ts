const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { params?: Record<string, string | number | boolean | undefined> },
  token?: string,
): Promise<T> {
  const { params, ...fetchOptions } = options ?? {}

  let url = `${API_BASE}${path}`
  if (params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v))
    }
    const qsStr = qs.toString()
    if (qsStr) url += `?${qsStr}`
  }

  const headers: Record<string, string> = {
    ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
    ...(fetchOptions.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { ...fetchOptions, headers })

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR'
    try {
      const body = await res.json() as { code?: string }
      code = body.code ?? code
    } catch {
      // ignore
    }
    throw new ApiError(res.status, code, `API error ${res.status}: ${code}`)
  }

  return res.json() as Promise<T>
}
