import type { ReactNode } from 'react'

/**
 * SVG icon paths for each problem type.
 * Used in map legend, sidebar filters, and landing page.
 * Keys match PROBLEM_TYPES from constants.ts and report.problemType i18n namespace.
 */
export const PROBLEM_TYPE_ICON_PATHS: Record<string, ReactNode> = {
  pothole: (
    <>
      <ellipse cx="12" cy="14" rx="3" ry="1.5" />
      <path d="M3 17c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
    </>
  ),
  damaged_barrier: (
    <path d="M3 6h18v2H3zM3 16h18v2H3zM7 8l5 4-5 4M17 8l-5 4 5 4" />
  ),
  missing_marking: (
    <path d="M3 12h2M7 12h2M11 12h2M15 12h2M19 12h2" />
  ),
  damaged_sign: (
    <path d="M12 3 L20 9 L17 19 L7 19 L4 9 Z" />
  ),
  hazard: (
    <>
      <path d="M12 3 L21 20 L3 20 Z" />
      <path d="M12 10v5" />
    </>
  ),
  broken_light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  missing_ramp: (
    <path d="M3 21h18M3 21l9-14M3 21h9v-14" />
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h.01M15 9h.01M9 15c.8-.6 1.8-1 3-1s2.2.4 3 1" />
    </>
  ),
}

export function ProblemTypeIcon({ type, size = 12 }: { type: string; size?: number }) {
  const paths = PROBLEM_TYPE_ICON_PATHS[type] ?? PROBLEM_TYPE_ICON_PATHS.other
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  )
}
