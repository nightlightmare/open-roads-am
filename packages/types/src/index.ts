export type Role = 'user' | 'moderator' | 'gov_agency' | 'admin'

export const PROBLEM_TYPES = [
  'pothole', 'damaged_barrier', 'missing_marking', 'damaged_sign',
  'hazard', 'broken_light', 'missing_ramp', 'other',
] as const

export type ProblemType = typeof PROBLEM_TYPES[number]

export type ReportStatus =
  | 'pending_review' | 'under_review' | 'approved'
  | 'in_progress' | 'resolved' | 'rejected' | 'archived'

export interface AuthPayload {
  clerkId: string
  role: Role
  scopes?: string[]
}
