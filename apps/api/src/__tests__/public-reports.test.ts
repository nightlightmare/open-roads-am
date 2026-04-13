import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { publicReportRoutes } from '../routes/public/reports.js'
import { publicStatsRoutes } from '../routes/public/stats.js'

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimit: vi.fn(async () => undefined),
  RateLimitError: class RateLimitError extends Error {},
}))

const mockClusterItems = [
  { type: 'cluster', latitude: 40.1, longitude: 44.5, count: 42 },
  { type: 'cluster', latitude: 40.2, longitude: 44.6, count: 7 },
]

const REPORT_ID = 'a0000000-0000-4000-8000-000000000001'
const REGION_ID = 'a0000000-0000-4000-8000-000000000010'

const mockReportItems = [
  {
    type: 'report',
    id: REPORT_ID,
    status: 'approved',
    problem_type: 'pothole',
    latitude: 40.1872,
    longitude: 44.5152,
    address_raw: 'ул. Абовяна',
    region_id: REGION_ID,
    confirmation_count: 3,
    created_at: new Date('2026-04-10T08:00:00Z'),
    photo_optimized_key: 'img/abc123',
  },
]

const mockDb = {
  findMapItems: vi.fn().mockResolvedValue({ items: mockClusterItems, totalInArea: 49 }),
  findById: vi.fn().mockResolvedValue(null),
  getStats: vi.fn().mockResolvedValue({
    total_reports: 100,
    by_status: { approved: 70, in_progress: 20, resolved: 10 },
    by_type: { pothole: 60, hazard: 40 },
    resolution_rate_pct: 10.0,
    avg_days_to_in_progress: 5.2,
    period: { from: '2026-03-12', to: '2026-04-11' },
  }),
}

const mockRedis = {
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn().mockResolvedValue('OK'),
}

async function buildApp() {
  const fastify = Fastify()
  await fastify.register(publicReportRoutes, {
    db: mockDb as never,
    redis: mockRedis as never,
    cfImagesBaseUrl: 'https://imagedelivery.net/test',
  })
  await fastify.register(publicStatsRoutes, {
    db: mockDb as never,
    redis: mockRedis as never,
  })
  return fastify
}

describe('GET /api/v1/public/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedis.get.mockResolvedValue(null)
  })

  it('returns 400 if no bbox/lat/lng provided', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/reports' })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('MISSING_LOCATION')
  })

  it('returns 400 for bbox too large', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=40,38,50,46',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('BBOX_TOO_LARGE')
  })

  it('returns 400 for invalid bbox format', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=notvalid',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('INVALID_BBOX')
  })

  it('returns clusters for default zoom (12)', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=44.0,39.8,45.0,40.8',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: unknown[]; total_in_area: number }>()
    expect(body.total_in_area).toBe(49)
    expect(body.items).toHaveLength(2)
    expect(mockDb.findMapItems).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 12 }),
    )
  })

  it('calls findMapItems with correct zoom', async () => {
    const app = await buildApp()
    await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=44.0,39.8,45.0,40.8&zoom=15',
    })
    expect(mockDb.findMapItems).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 15 }),
    )
  })

  it('filters problem types correctly', async () => {
    const app = await buildApp()
    await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=44.0,39.8,45.0,40.8&problem_type=pothole,hazard',
    })
    expect(mockDb.findMapItems).toHaveBeenCalledWith(
      expect.objectContaining({ problemTypes: ['pothole', 'hazard'] }),
    )
  })

  it('returns cached response if present', async () => {
    const cached = JSON.stringify({ items: [], total_in_area: 0 })
    mockRedis.get.mockResolvedValue(cached)
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=44.0,39.8,45.0,40.8',
    })
    expect(res.statusCode).toBe(200)
    expect(mockDb.findMapItems).not.toHaveBeenCalled()
  })

  it('injects photo_url for report items', async () => {
    mockDb.findMapItems.mockResolvedValue({ items: mockReportItems, totalInArea: 1 })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=44.0,39.8,45.0,40.8&zoom=16',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: Array<{ photo_url?: string }> }>()
    expect(body.items[0]?.photo_url).toBe('https://imagedelivery.net/test/img/abc123/public')
  })

  it('works with lat+lng radius', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?lat=40.18&lng=44.51&radius_km=5',
    })
    expect(res.statusCode).toBe(200)
    expect(mockDb.findMapItems).toHaveBeenCalled()
  })

  it('sets Cache-Control and CORS headers', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports?bbox=44.0,39.8,45.0,40.8',
    })
    expect(res.headers['cache-control']).toBe('public, max-age=30')
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })
})

describe('GET /api/v1/public/reports/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedis.get.mockResolvedValue(null)
  })

  it('returns 400 for invalid uuid', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/reports/not-a-uuid' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 if report not found or not public', async () => {
    mockDb.findById.mockResolvedValue(null)
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports/a0000000-0000-4000-8000-000000000001',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('NOT_FOUND')
  })

  it('returns report detail with photo urls', async () => {
    mockDb.findById.mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      status: 'in_progress',
      problem_type: 'pothole',
      description: 'Deep pothole',
      latitude: 40.1872,
      longitude: 44.5152,
      address_raw: 'ул. Абовяна',
      region_id: 'a0000000-0000-4000-8000-000000000010',
      confirmation_count: 7,
      photo_optimized_key: 'img/abc123',
      status_history: [
        { status: 'approved', changed_at: new Date('2026-04-10T09:00:00Z') },
        { status: 'in_progress', changed_at: new Date('2026-04-11T14:00:00Z') },
      ],
      created_at: new Date('2026-04-10T08:00:00Z'),
      updated_at: new Date('2026-04-11T14:00:00Z'),
    })

    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reports/a0000000-0000-4000-8000-000000000001',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{
      photo_url: string
      photo_thumbnail_url: string
      status_history: Array<{ status: string }>
    }>()
    expect(body.photo_url).toBe('https://imagedelivery.net/test/img/abc123/public')
    expect(body.photo_thumbnail_url).toBe('https://imagedelivery.net/test/img/abc123/thumbnail')
    expect(body.status_history).toHaveLength(2)
  })
})

describe('GET /api/v1/public/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedis.get.mockResolvedValue(null)
  })

  it('returns stats with default date range', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/stats' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ total_reports: number }>()
    expect(body.total_reports).toBe(100)
    expect(mockDb.getStats).toHaveBeenCalled()
  })

  it('returns 400 for date range exceeding 365 days', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/stats?from=2024-01-01&to=2026-04-11',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('DATE_RANGE_TOO_LARGE')
  })

  it('passes region_id and problem_type filters', async () => {
    const app = await buildApp()
    await app.inject({
      method: 'GET',
      url: '/api/v1/public/stats?region_id=a0000000-0000-4000-8000-000000000010&problem_type=pothole',
    })
    expect(mockDb.getStats).toHaveBeenCalledWith(
      expect.objectContaining({
        regionId: 'a0000000-0000-4000-8000-000000000010',
        problemType: 'pothole',
      }),
    )
  })

  it('returns cached response if present', async () => {
    const cached = JSON.stringify({ total_reports: 999 })
    mockRedis.get.mockResolvedValue(cached)
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ total_reports: number }>().total_reports).toBe(999)
    expect(mockDb.getStats).not.toHaveBeenCalled()
  })
})
