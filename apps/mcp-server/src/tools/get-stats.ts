import { z } from 'zod'
import { apiFetch, apiErrorToMcp } from '../api-client.js'

export const getStatsInputSchema = {
  region_id: z.string().uuid().optional().describe('Filter by region UUID'),
  problem_type: z
    .enum(['pothole', 'damaged_barrier', 'missing_marking', 'damaged_sign', 'hazard', 'broken_light', 'missing_ramp', 'other'])
    .optional()
    .describe('Filter by problem type'),
  from: z.string().optional().describe('Start date ISO (default: 30 days ago)'),
  to: z.string().optional().describe('End date ISO (default: today)'),
}

interface StatsResponse {
  by_status: Record<string, number>
  by_type: Record<string, number>
  resolution_rate_pct: number
  avg_days_to_in_progress: number | null
}

function topTypes(byType: Record<string, number>, total: number): string {
  return Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([type, count]) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0
      return `${type.replace(/_/g, ' ')} ${pct}%`
    })
    .join(', ')
}

export async function getStatsHandler(
  input: z.infer<z.ZodObject<typeof getStatsInputSchema>>,
  apiBaseUrl: string,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  // Default date range: last 30 days
  const to = input.to ?? new Date().toISOString().slice(0, 10)
  const from = input.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  try {
    const params: Record<string, string | undefined> = { from, to }
    if (input.region_id) params.region_id = input.region_id
    if (input.problem_type) params.problem_type = input.problem_type

    const stats = (await apiFetch(apiBaseUrl, '/api/v1/public/stats', params)) as StatsResponse

    const byStatus = stats.by_status ?? {}
    const total = Object.values(byStatus).reduce((s, n) => s + n, 0)
    const approved = byStatus.approved ?? 0
    const inProgress = byStatus.in_progress ?? 0
    const resolved = byStatus.resolved ?? 0
    const avgDays = stats.avg_days_to_in_progress != null
      ? `${stats.avg_days_to_in_progress.toFixed(1)} days`
      : 'n/a'

    const lines = [
      `Road problem statistics (${from} → ${to}):`,
      `• Total reports:           ${total}`,
      `• Approved: ${approved} | In progress: ${inProgress} | Resolved: ${resolved}`,
      `• Resolution rate:         ${stats.resolution_rate_pct.toFixed(1)}%`,
      `• Avg. days to acknowledgment: ${avgDays}`,
    ]

    if (stats.by_type && Object.keys(stats.by_type).length > 0) {
      lines.push(`• By type: ${topTypes(stats.by_type, total)}`)
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Error: ${apiErrorToMcp(err)}` }] }
  }
}
