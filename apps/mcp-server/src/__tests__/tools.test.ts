import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getReportsHandler } from '../tools/get-reports.js'
import { getReportHandler } from '../tools/get-report.js'
import { getStatsHandler } from '../tools/get-stats.js'

const API_BASE = 'https://api.example.com'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(body: unknown) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  })
}

function mockError(status: number, code: string) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ code }),
    text: () => Promise.resolve(code),
  })
}

beforeEach(() => vi.clearAllMocks())

// ── get_reports ──────────────────────────────────────────────────────────────

describe('get_reports', () => {
  it('returns error if neither bbox nor lat/lng provided', async () => {
    const res = await getReportsHandler({} as never, API_BASE)
    expect(res.isError).toBe(true)
    expect(res.content[0]!.text).toContain('bbox or lat+lng')
  })

  it('returns error if bbox too large', async () => {
    const res = await getReportsHandler(
      { bbox: { west: 43, south: 38, east: 46, north: 42 } },
      API_BASE,
    )
    expect(res.isError).toBe(true)
    expect(res.content[0]!.text).toContain('too large')
  })

  it('returns formatted report list', async () => {
    mockOk({
      items: [
        {
          type: 'report', id: 'a0000000-0000-4000-8000-000000000001',
          status: 'approved', problem_type: 'pothole',
          address_raw: 'ул. Абовяна', confirmation_count: 4,
          photo_url: null, created_at: '2026-04-10T08:00:00Z',
        },
      ],
      total_in_area: 12,
    })
    const res = await getReportsHandler({ lat: 40.18, lng: 44.51 }, API_BASE)
    expect(res.isError).toBeUndefined()
    expect(res.content[0]!.text).toContain('pothole')
    expect(res.content[0]!.text).toContain('ул. Абовяна')
    expect(res.content[0]!.text).toContain('12 total')
  })

  it('returns "no reports" message when empty', async () => {
    mockOk({ items: [], total_in_area: 0 })
    const res = await getReportsHandler({ lat: 40.18, lng: 44.51 }, API_BASE)
    expect(res.isError).toBeUndefined()
    expect(res.content[0]!.text).toContain('No reports found')
  })

  it('returns mcp error on API failure', async () => {
    mockError(429, 'RATE_LIMIT_EXCEEDED')
    const res = await getReportsHandler({ lat: 40.18, lng: 44.51 }, API_BASE)
    expect(res.isError).toBe(true)
    expect(res.content[0]!.text).toContain('Rate limit')
  })

  it('passes bbox as comma-separated string to API', async () => {
    mockOk({ items: [], total_in_area: 0 })
    await getReportsHandler({ bbox: { west: 44.0, south: 40.0, east: 44.5, north: 40.5 } }, API_BASE)
    const url = mockFetch.mock.calls[0]![0]! as string
    expect(url).toContain('bbox=44%2C40%2C44.5%2C40.5')
  })
})

// ── get_report ───────────────────────────────────────────────────────────────

describe('get_report', () => {
  const REPORT_ID = 'a0000000-0000-4000-8000-000000000001'

  it('returns formatted report detail', async () => {
    mockOk({
      id: REPORT_ID, status: 'in_progress', problem_type: 'pothole',
      description: 'Deep hole', latitude: 40.18, longitude: 44.51,
      address_raw: 'ул. Абовяна', confirmation_count: 7,
      photo_url: 'https://img.example.com/abc/public',
      status_history: [
        { status: 'approved', changed_at: '2026-04-10T09:00:00Z', note: null },
        { status: 'in_progress', changed_at: '2026-04-11T14:00:00Z', note: 'Передано в MTAI' },
      ],
      created_at: '2026-04-10T08:00:00Z',
      updated_at: '2026-04-11T14:00:00Z',
    })
    const res = await getReportHandler({ id: REPORT_ID }, API_BASE)
    expect(res.isError).toBeUndefined()
    const text = res.content[0]!.text
    expect(text).toContain('pothole')
    expect(text).toContain('in progress')
    expect(text).toContain('Передано в MTAI')
    expect(text).toContain('7')
  })

  it('returns error on 404', async () => {
    mockError(404, 'NOT_FOUND')
    const res = await getReportHandler({ id: REPORT_ID }, API_BASE)
    expect(res.isError).toBe(true)
    expect(res.content[0]!.text).toContain('not found')
  })
})

// ── get_stats ────────────────────────────────────────────────────────────────

describe('get_stats', () => {
  it('returns formatted statistics', async () => {
    mockOk({
      by_status: { approved: 204, in_progress: 67, resolved: 41 },
      by_type: { pothole: 150, missing_marking: 68, hazard: 47, other: 47 },
      resolution_rate_pct: 13.1,
      avg_days_to_in_progress: 11.4,
    })
    const res = await getStatsHandler({}, API_BASE)
    expect(res.isError).toBeUndefined()
    const text = res.content[0]!.text
    expect(text).toContain('312')       // total
    expect(text).toContain('13.1%')     // resolution rate
    expect(text).toContain('11.4 days') // avg days
    expect(text).toContain('pothole')
  })

  it('handles null avg_days_to_in_progress', async () => {
    mockOk({
      by_status: { approved: 5 },
      by_type: {},
      resolution_rate_pct: 0,
      avg_days_to_in_progress: null,
    })
    const res = await getStatsHandler({}, API_BASE)
    expect(res.isError).toBeUndefined()
    expect(res.content[0]!.text).toContain('n/a')
  })

  it('passes date range to API', async () => {
    mockOk({ by_status: {}, by_type: {}, resolution_rate_pct: 0, avg_days_to_in_progress: null })
    await getStatsHandler({ from: '2026-01-01', to: '2026-04-01' }, API_BASE)
    const url = mockFetch.mock.calls[0]![0]! as string
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-04-01')
  })
})
