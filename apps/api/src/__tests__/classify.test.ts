import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyMultipart from '@fastify/multipart'
import { classifyRoutes } from '../routes/classify.js'

// Mock external deps
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
  uploadToR2: vi.fn(async () => undefined),
}))
vi.mock('../lib/queue.js', () => ({
  getClassifyQueue: () => ({ add: vi.fn(async () => undefined) }),
  JOB_CLASSIFY: 'classify-report-photo',
}))
vi.mock('../lib/resolve-user-id.js', () => ({
  resolveUserId: vi.fn(async () => 'uuid_user_test123'),
}))
vi.mock('sharp', () => ({
  default: () => ({
    toFormat: () => ({
      toBuffer: async () => Buffer.from('stripped'),
    }),
  }),
}))

const mockDb = {
  create: vi.fn(async () => ({ id: 'cls_uuid_1' })),
  findById: vi.fn(),
  findByIdAndUser: vi.fn(),
  update: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
  findExpired: vi.fn(async () => []),
}

async function buildApp() {
  const fastify = Fastify()
  fastify.decorateRequest('auth', null)
  await fastify.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } })
  await fastify.register(classifyRoutes, {
    db: mockDb,
    banDb: {} as never,
    s3: {} as never,
    r2Bucket: 'test-bucket',
    redis: {} as never,
    prisma: {} as never,
  })
  return fastify
}

describe('POST /api/v1/classify', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 INVALID_PHOTO for unknown magic bytes', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/classify',
      headers: { 'content-type': 'multipart/form-data; boundary=----testboundary' },
      payload: buildMultipart([0x00, 0x01, 0x02, 0x03]),
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ code: 'INVALID_PHOTO' })
  })

  it('returns 202 with job_token for valid JPEG', async () => {
    const app = await buildApp()
    const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(100)])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/classify',
      payload: buildMultipart(jpegMagic),
      headers: { 'content-type': 'multipart/form-data; boundary=----testboundary' },
    })
    expect(res.statusCode).toBe(202)
    expect(JSON.parse(res.body)).toMatchObject({ job_token: 'cls_uuid_1' })
  })

  it('returns 202 with job_token for valid PNG', async () => {
    const app = await buildApp()
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Buffer.alloc(100)])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/classify',
      payload: buildMultipart(pngMagic, 'image/png'),
      headers: { 'content-type': 'multipart/form-data; boundary=----testboundary' },
    })
    expect(res.statusCode).toBe(202)
  })
})

describe('GET /api/v1/classify/:job_token', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when token not found', async () => {
    mockDb.findByIdAndUser.mockResolvedValueOnce(null)
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/classify/nonexistent-uuid' })
    expect(res.statusCode).toBe(404)
  })

  it('returns pending status', async () => {
    mockDb.findByIdAndUser.mockResolvedValueOnce({ id: '1', status: 'pending' })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/classify/some-uuid' })
    expect(JSON.parse(res.body)).toMatchObject({ status: 'pending' })
  })

  it('returns completed with problem_type_ai when confidence >= 0.6', async () => {
    mockDb.findByIdAndUser.mockResolvedValueOnce({
      id: '1', status: 'completed', problemTypeAi: 'pothole', aiConfidence: 0.91,
    })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/classify/some-uuid' })
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ status: 'completed', problem_type_ai: 'pothole', ai_confidence: 0.91 })
  })

  it('returns null problem_type_ai when confidence < 0.6', async () => {
    mockDb.findByIdAndUser.mockResolvedValueOnce({
      id: '1', status: 'completed', problemTypeAi: 'pothole', aiConfidence: 0.45,
    })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/classify/some-uuid' })
    const body = JSON.parse(res.body)
    expect(body.problem_type_ai).toBeNull()
  })

  it('returns failed status', async () => {
    mockDb.findByIdAndUser.mockResolvedValueOnce({ id: '1', status: 'failed' })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/classify/some-uuid' })
    expect(JSON.parse(res.body)).toMatchObject({ status: 'failed' })
  })
})

// Minimal multipart body builder for testing
function buildMultipart(fileContent: Buffer | number[], contentType = 'image/jpeg'): Buffer {
  const boundary = '----testboundary'
  const buf = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent)
  const body = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="photo"; filename="photo.jpg"\r\n`,
    `Content-Type: ${contentType}\r\n\r\n`,
    buf,
    `\r\n--${boundary}--\r\n`,
  ]
  return Buffer.concat(body.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))))
}
