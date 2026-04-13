import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { reportRoutes } from '../routes/reports.js'

vi.mock('../middleware/verify-auth.js', () => ({
  verifyAuth: vi.fn(async (req: { auth: unknown }) => {
    req.auth = { clerkId: 'user_test123', role: 'user' }
  }),
}))
vi.mock('../middleware/banned-check.js', () => ({
  createBannedCheck: () => vi.fn(async () => undefined),
}))
vi.mock('../middleware/rate-limit.js', () => ({
  rateLimit: vi.fn(async () => undefined),
  RateLimitError: class RateLimitError extends Error {},
}))
vi.mock('../lib/r2.js', () => ({
  copyInR2: vi.fn(async () => undefined),
  getSignedDownloadUrl: vi.fn(async () => 'https://r2.example.com/signed'),
}))
vi.mock('../lib/cf-images.js', () => ({
  uploadImageFromUrl: vi.fn(async () => 'cf-image-id-123'),
}))

const mockClassificationDb = {
  create: vi.fn(),
  findById: vi.fn(),
  findByIdAndUser: vi.fn(),
  update: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
  findExpired: vi.fn(async () => []),
}

const mockReportDb = {
  create: vi.fn(async () => ({ id: 'report_uuid_1', createdAt: new Date('2026-04-12T00:00:00Z') })),
  updateRegionAndAddress: vi.fn(async () => undefined),
  updatePhotoOptimizedKey: vi.fn(async () => undefined),
}

const mockRedis = { publish: vi.fn(async () => undefined) }

async function buildApp() {
  const fastify = Fastify()
  fastify.decorateRequest('auth', null)
  await fastify.register(reportRoutes, {
    classificationDb: mockClassificationDb,
    reportDb: mockReportDb,
    banDb: {} as never,
    s3: {} as never,
    r2Bucket: 'test-bucket',
    redis: mockRedis as never,
    cfAccountId: 'test-account-id',
    cfImagesApiToken: 'test-api-token',
  })
  return fastify
}

const validBody = {
  job_token: '550e8400-e29b-41d4-a716-446655440000',
  latitude: 40.1872,
  longitude: 44.5152,
  problem_type_user: 'pothole',
  description: 'Big hole in the road',
}

const mockClassification = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: 'user_test123',
  photoTempKey: 'temp/user_test123/abc.jpg',
  status: 'completed' as const,
  problemTypeAi: 'pothole',
  aiConfidence: 0.91,
  aiRawResponse: null,
}

describe('POST /api/v1/reports', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 201 with report id on success', async () => {
    mockClassificationDb.findByIdAndUser.mockResolvedValueOnce(mockClassification)
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'content-type': 'application/json' },
      payload: validBody,
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ id: 'report_uuid_1', status: 'pending_review' })
  })

  it('returns 400 INVALID_JOB_TOKEN when classification not found', async () => {
    mockClassificationDb.findByIdAndUser.mockResolvedValueOnce(null)
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'content-type': 'application/json' },
      payload: validBody,
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ code: 'INVALID_JOB_TOKEN' })
  })

  it('returns 400 VALIDATION_ERROR for coords outside Armenia bbox', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'content-type': 'application/json' },
      payload: { ...validBody, latitude: 55.0, longitude: 37.0 }, // Moscow
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('returns 400 VALIDATION_ERROR when description exceeds 1000 chars', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'content-type': 'application/json' },
      payload: { ...validBody, description: 'x'.repeat(1001) },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('publishes new_report event to Redis on success', async () => {
    mockClassificationDb.findByIdAndUser.mockResolvedValueOnce(mockClassification)
    const app = await buildApp()

    await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'content-type': 'application/json' },
      payload: validBody,
    })

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'events:moderation',
      expect.stringContaining('"event":"new_report"'),
    )
  })

  it('deletes classification row after successful report creation', async () => {
    mockClassificationDb.findByIdAndUser.mockResolvedValueOnce(mockClassification)
    const app = await buildApp()

    await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'content-type': 'application/json' },
      payload: validBody,
    })

    expect(mockClassificationDb.delete).toHaveBeenCalledWith(validBody.job_token)
  })
})
