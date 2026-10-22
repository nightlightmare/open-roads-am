import { describe, it, expect } from 'vitest'
import {
  parseClassificationResponse,
  applyConfidenceThreshold,
  buildClassifyRequest,
  extractResponseText,
} from '../workers/classify.js'

describe('parseClassificationResponse', () => {
  it('parses valid JSON response', () => {
    const text = JSON.stringify({
      problem_type: 'pothole',
      confidence: 0.92,
      reasoning: 'Large pothole visible in the center of the road.',
    })
    const result = parseClassificationResponse(text)
    expect(result.problem_type).toBe('pothole')
    expect(result.confidence).toBe(0.92)
    expect(result.reasoning).toBe('Large pothole visible in the center of the road.')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseClassificationResponse('not json')).toThrow()
  })

  it('accepts any non-empty string as problem_type (DB-validated at runtime)', () => {
    const text = JSON.stringify({ problem_type: 'unknown_type', confidence: 0.8, reasoning: 'test' })
    const result = parseClassificationResponse(text)
    expect(result.problem_type).toBe('unknown_type')
  })

  it('throws when confidence is out of range', () => {
    const text = JSON.stringify({ problem_type: 'pothole', confidence: 1.5, reasoning: 'test' })
    expect(() => parseClassificationResponse(text)).toThrow()
  })

  it('throws when required fields are missing', () => {
    const text = JSON.stringify({ problem_type: 'pothole' })
    expect(() => parseClassificationResponse(text)).toThrow()
  })

  it('accepts not_a_road_problem as valid type', () => {
    const text = JSON.stringify({ problem_type: 'not_a_road_problem', confidence: 0.95, reasoning: 'No road visible.' })
    const result = parseClassificationResponse(text)
    expect(result.problem_type).toBe('not_a_road_problem')
  })
})

describe('applyConfidenceThreshold', () => {
  it('returns problem_type when confidence >= 0.6', () => {
    const result = applyConfidenceThreshold({ problem_type: 'pothole', confidence: 0.6, reasoning: 'test' })
    expect(result).toBe('pothole')
  })

  it('returns problem_type when confidence is high', () => {
    const result = applyConfidenceThreshold({ problem_type: 'damaged_sign', confidence: 0.91, reasoning: 'test' })
    expect(result).toBe('damaged_sign')
  })

  it('returns null when confidence < 0.6', () => {
    const result = applyConfidenceThreshold({ problem_type: 'pothole', confidence: 0.59, reasoning: 'test' })
    expect(result).toBeNull()
  })

  it('returns null for not_a_road_problem regardless of confidence', () => {
    const result = applyConfidenceThreshold({ problem_type: 'not_a_road_problem', confidence: 0.95, reasoning: 'test' })
    expect(result).toBeNull()
  })

  it('returns null for not_a_road_problem with low confidence', () => {
    const result = applyConfidenceThreshold({ problem_type: 'not_a_road_problem', confidence: 0.3, reasoning: 'test' })
    expect(result).toBeNull()
  })
})

describe('buildClassifyRequest', () => {
  const image = { data: 'aGVsbG8=', mediaType: 'image/jpeg' as const }

  it('uses the configured model', () => {
    expect(buildClassifyRequest('claude-haiku-5-5', image).model).toBe('claude-haiku-5-5')
    expect(buildClassifyRequest('claude-sonnet-5-5', image).model).toBe('claude-sonnet-5-5')
  })

  it('sends no sampling parameters (rejected by current models)', () => {
    const request = buildClassifyRequest('claude-haiku-5-5', image)
    expect(request).not.toHaveProperty('temperature')
    expect(request).not.toHaveProperty('top_p')
    expect(request).not.toHaveProperty('top_k')
  })

  it('leaves room for adaptive thinking in max_tokens', () => {
    expect(buildClassifyRequest('claude-haiku-5-5', image).max_tokens).toBeGreaterThanOrEqual(1024)
  })

  it('sends the image before the text prompt', () => {
    const request = buildClassifyRequest('claude-haiku-5-5', image)
    const content = request.messages[0]?.content
    expect(Array.isArray(content)).toBe(true)
    if (!Array.isArray(content)) return
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' } })
    expect(content[1]?.type).toBe('text')
  })
})

describe('extractResponseText', () => {
  it('returns the text block when the response starts with a thinking block', () => {
    const text = extractResponseText([
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '{"problem_type":"pothole"}', citations: null },
    ] as Parameters<typeof extractResponseText>[0])
    expect(text).toBe('{"problem_type":"pothole"}')
  })

  it('returns an empty string when there is no text block', () => {
    expect(extractResponseText([])).toBe('')
  })
})
