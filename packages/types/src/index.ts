export type Role = 'user' | 'moderator' | 'gov_agency' | 'admin'

// ProblemType is now dynamic — validated against the problem_types DB table at runtime
export type ProblemType = string

export type ReportStatus =
  | 'pending_review' | 'under_review' | 'approved'
  | 'in_progress' | 'resolved' | 'rejected' | 'archived'

export interface AuthPayload {
  clerkId: string
  role: Role
  scopes?: string[]
}
