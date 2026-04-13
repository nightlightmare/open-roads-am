import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function statusVariant(
  status: string,
): 'success' | 'info' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'approved') return 'success'
  if (status === 'in_progress') return 'info'
  if (status === 'resolved') return 'secondary'
  if (status === 'rejected' || status === 'archived') return 'destructive'
  return 'outline'
}

export function confidenceVariant(
  confidence: number | null,
): 'success' | 'warning' | 'destructive' {
  if (confidence === null) return 'warning'
  if (confidence >= 0.8) return 'success'
  if (confidence >= 0.5) return 'warning'
  return 'destructive'
}
