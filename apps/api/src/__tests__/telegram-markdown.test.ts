import { describe, it, expect } from 'vitest'
import { escapeMarkdownV2, escapeMarkdownV2LinkUrl } from '../lib/telegram.js'

describe('escapeMarkdownV2', () => {
  it('escapes all reserved punctuation', () => {
    const out = escapeMarkdownV2('Hello *world*! (test) _v1_ #tag.')
    expect(out).toBe('Hello \\*world\\*\\! \\(test\\) \\_v1\\_ \\#tag\\.')
  })

  it('escapes backslashes', () => {
    expect(escapeMarkdownV2('a\\b')).toBe('a\\\\b')
  })

  it('passes plain alphanumerics through unchanged', () => {
    expect(escapeMarkdownV2('abc123XYZ')).toBe('abc123XYZ')
  })

  it('handles Armenian and Russian text', () => {
    expect(escapeMarkdownV2('Փոս на улице.')).toBe('Փոս на улице\\.')
  })

  it('escapes characters used in MarkdownV2 grammar', () => {
    const tricky = '_*[]()~`>#+-=|{}.!'
    const expected = '\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!'
    expect(escapeMarkdownV2(tricky)).toBe(expected)
  })
})

describe('escapeMarkdownV2LinkUrl', () => {
  it('escapes ) and backslash inside the link body', () => {
    expect(escapeMarkdownV2LinkUrl('https://x.test/path)?a=1')).toBe(
      'https://x.test/path\\)?a=1',
    )
    expect(escapeMarkdownV2LinkUrl('a\\b')).toBe('a\\\\b')
  })

  it('leaves other characters intact', () => {
    expect(escapeMarkdownV2LinkUrl('https://open-road.am/reports/abc-123')).toBe(
      'https://open-road.am/reports/abc-123',
    )
  })
})
