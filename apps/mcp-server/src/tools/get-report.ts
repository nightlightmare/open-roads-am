import { z } from 'zod'
import { apiFetch, apiErrorToMcp } from '../api-client.js'

export const getReportInputSchema = {
  id: z.string().uuid().describe('Report UUID'),
}

interface StatusHistoryEntry {
  status: string
  changed_at: string
  note: string | null
}

interface ReportDetail {
  id: string
  status: string
  problem_type: string | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  confirmation_count: number
  photo_url: string | null
  status_history: StatusHistoryEntry[]
  created_at: string
  updated_at: string
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ')
}

export async function getReportHandler(
  input: z.infer<z.ZodObject<typeof getReportInputSchema>>,
  apiBaseUrl: string,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    const report = (await apiFetch(apiBaseUrl, `/api/v1/public/reports/${input.id}`)) as ReportDetail

    const historyLines = report.status_history.length > 0
      ? report.status_history.map((h) => {
          const date = h.changed_at.slice(0, 16).replace('T', ' ')
          const note = h.note ? ` (${h.note})` : ''
          return `  • ${date} — ${formatStatus(h.status)}${note}`
        })
      : ['  (no public status history yet)']

    const lines = [
      `Report ${report.id.slice(0, 8)}… — ${report.problem_type ?? 'unknown type'} — ${formatStatus(report.status)}`,
      '',
      `Location:      ${report.latitude}, ${report.longitude}`,
      `Address:       ${report.address_raw ?? 'not resolved'}`,
      `Confirmations: ${report.confirmation_count}`,
      `Created:       ${report.created_at.slice(0, 10)}`,
      ...(report.description ? [`Description:   ${report.description}`] : []),
      ...(report.photo_url ? [`Photo:         ${report.photo_url}`] : []),
      '',
      'Status history:',
      ...historyLines,
    ]

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Error: ${apiErrorToMcp(err)}` }] }
  }
}
