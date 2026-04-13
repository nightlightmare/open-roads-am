import { describe, it, expect } from 'vitest'
import { getGridSize } from '../repositories/public-report.repository.js'

describe('getGridSize', () => {
  it('returns null for zoom >= 15 (individual mode)', () => {
    expect(getGridSize(15)).toBeNull()
    expect(getGridSize(16)).toBeNull()
    expect(getGridSize(22)).toBeNull()
  })

  it('returns 0.01 for zoom 13-14', () => {
    expect(getGridSize(13)).toBe(0.01)
    expect(getGridSize(14)).toBe(0.01)
  })

  it('returns 0.05 for zoom 11-12', () => {
    expect(getGridSize(11)).toBe(0.05)
    expect(getGridSize(12)).toBe(0.05)
  })

  it('returns 0.1 for zoom 9-10', () => {
    expect(getGridSize(9)).toBe(0.1)
    expect(getGridSize(10)).toBe(0.1)
  })

  it('returns 0.25 for zoom 7-8', () => {
    expect(getGridSize(7)).toBe(0.25)
    expect(getGridSize(8)).toBe(0.25)
  })

  it('returns 0.5 for zoom 0-6', () => {
    expect(getGridSize(0)).toBe(0.5)
    expect(getGridSize(6)).toBe(0.5)
  })
})
