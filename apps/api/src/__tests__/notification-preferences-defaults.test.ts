import { describe, it, expect } from 'vitest'
import {
  getDefaultPreference,
  resolvePreference,
} from '../workers/notification-dispatcher.js'

describe('getDefaultPreference', () => {
  it('returns true for telegram across all events', () => {
    expect(getDefaultPreference('telegram', 'report.approved')).toBe(true)
    expect(getDefaultPreference('telegram', 'report.confirmed')).toBe(true)
    expect(getDefaultPreference('telegram', 'area.new_report')).toBe(true)
  })

  it('returns true for email status-change events only', () => {
    expect(getDefaultPreference('email', 'report.approved')).toBe(true)
    expect(getDefaultPreference('email', 'report.in_progress')).toBe(true)
    expect(getDefaultPreference('email', 'report.resolved')).toBe(true)
    expect(getDefaultPreference('email', 'report.rejected')).toBe(true)
  })

  it('returns false for email confirmation and area events', () => {
    expect(getDefaultPreference('email', 'report.confirmed')).toBe(false)
    expect(getDefaultPreference('email', 'area.new_report')).toBe(false)
  })

  it('returns false for web_push and mobile_push across all events', () => {
    expect(getDefaultPreference('web_push', 'report.approved')).toBe(false)
    expect(getDefaultPreference('mobile_push', 'report.approved')).toBe(false)
  })
})

describe('resolvePreference', () => {
  it('returns stored value when set', () => {
    expect(resolvePreference(true, 'email', 'report.confirmed')).toBe(true)
    expect(resolvePreference(false, 'telegram', 'report.approved')).toBe(false)
  })

  it('falls back to default when stored is null', () => {
    expect(resolvePreference(null, 'telegram', 'report.approved')).toBe(true)
    expect(resolvePreference(null, 'email', 'area.new_report')).toBe(false)
    expect(resolvePreference(null, 'web_push', 'report.resolved')).toBe(false)
  })
})
