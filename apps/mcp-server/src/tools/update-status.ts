import { z } from 'zod'
import { apiFetchAuth, apiErrorToMcp } from '../api-client.js'

export const updateStatusInputSchema = {
  report_id: z.string().uuid().describe('Report UUID'),
  status: z.enum(['in_progress', 'resolved']).describe('Target status (approved→in_progress or in_progress→resolved)'),
  note: z.string().optional().describe('Optional note visible in status history'),
}

export async function updateStatusHandler(
  input: z.infer<z.ZodObject<typeof updateStatusInputSchema>>,
  apiBaseUrl: string,
  apiKey: string | undefined,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  if (!apiKey) {
    return { isError: true, content: [{ type: 'text', text: 'Error: API_KEY is required for write operations.' }] }
  }

  try {
    await apiFetchAuth(apiBaseUrl, apiKey, 'POST', `/api/v1/reports/${input.report_id}/status`, {
      status: input.status,
      ...(input.note ? { note: input.note } : {}),
    })

    return {
      content: [{ type: 'text', text: `Report ${input.report_id.slice(0, 8)}… status updated to "${input.status.replace(/_/g, ' ')}".` }],
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Error: ${apiErrorToMcp(err)}` }] }
  }
}
