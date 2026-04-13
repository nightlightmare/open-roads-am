export const YEREVAN_LAT = 40.1872
export const YEREVAN_LNG = 44.5152
export const DEFAULT_LOCALE = 'hy'

// These IDs must match the seeded staging data (apps/api/scripts/seed-e2e.ts)
export const FIXTURES = {
  approvedReportWithPhoto: process.env.E2E_APPROVED_REPORT_ID ?? 'seed-approved-photo',
  approvedReportWithGovNote: process.env.E2E_GOV_NOTE_REPORT_ID ?? 'seed-gov-note',
  pendingReport: process.env.E2E_PENDING_REPORT_ID ?? 'seed-pending',
  lockedReport: process.env.E2E_LOCKED_REPORT_ID ?? 'seed-locked',
  userReport: process.env.E2E_USER_REPORT_ID ?? 'seed-user-report',
} as const
