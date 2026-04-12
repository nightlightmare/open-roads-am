import { describe, it, expect } from 'vitest'
import { parseClassificationResponse, applyConfidenceThreshold } from '../workers/classify.js'

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

  it('throws when problem_type is not a valid enum value', () => {
    const text = JSON.stringify({ problem_type: 'unknown_type', confidence: 0.8, reasoning: 'test' })
    expect(() => parseClassificationResponse(text)).toThrow()
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
