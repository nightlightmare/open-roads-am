export const PROBLEM_TYPES = [
  'pothole',
  'damaged_barrier',
  'missing_marking',
  'damaged_sign',
  'hazard',
  'broken_light',
  'missing_ramp',
  'other',
] as const

export type ProblemType = (typeof PROBLEM_TYPES)[number]

export const REPORT_STATUSES = [
  'pending_review',
  'under_review',
  'approved',
  'in_progress',
  'resolved',
  'rejected',
  'archived',
] as const

export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const ROLES = ['user', 'moderator', 'gov_agency', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const TIMELINE_STATUSES = new Set(['approved', 'in_progress', 'resolved'])
export const CLOSED_STATUSES = new Set(['resolved', 'rejected', 'archived'])

export const YEREVAN_LAT = 40.1872
export const YEREVAN_LNG = 44.5152
export const POLL_TIMEOUT_MS = 60_000
