import { z } from 'zod'
import { apiFetch, apiErrorToMcp } from '../api-client.js'

// Armenia bounding box + ~50 km buffer (matches API validation)
const LAT_MIN = 38.8, LAT_MAX = 41.4
const LNG_MIN = 43.4, LNG_MAX = 46.7

export const getReportsInputSchema = {
  bbox: z
    .object({
      west: z.number(),
      south: z.number(),
      east: z.number(),
      north: z.number(),
    })
    .optional()
    .describe('Bounding box (Armenia region)'),
  lat: z.number().min(LAT_MIN).max(LAT_MAX).optional().describe('Latitude (Armenia bounds)'),
  lng: z.number().min(LNG_MIN).max(LNG_MAX).optional().describe('Longitude (Armenia bounds)'),
  radius_km: z.number().min(0.1).max(50).optional().describe('Radius in km (default 5, max 50)'),
  problem_type: z
    .enum(['pothole', 'damaged_barrier', 'missing_marking', 'damaged_sign', 'hazard', 'broken_light', 'missing_ramp', 'other'])
    .optional()
    .describe('Filter by problem type'),
  include_resolved: z.boolean().optional().describe('Include resolved reports (default false)'),
}

interface ReportItem {
  type: 'report'
  id: string
  status: string
  problem_type: string | null
  address_raw: string | null
  confirmation_count: number
  photo_url: string | null
  created_at: string
}

interface ClusterItem {
  type: 'cluster'
  lat: number
  lng: number
  count: number
}

interface ApiResponse {
  items: Array<ReportItem | ClusterItem>
  total_in_area: number
}

function formatItem(item: ReportItem | ClusterItem, index: number): string {
  if (item.type === 'cluster') {
    return `${index}. [cluster] ${item.count} reports near ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`
  }
  const type = item.problem_type ?? 'unknown'
  const addr = item.address_raw ?? 'unknown address'
  const date = item.created_at.slice(0, 10)
  return [
    `${index}. [${type}] ${addr}`,
    `   Status: ${item.status} · ${item.confirmation_count} confirmation(s) · created ${date}`,
    `   ID: ${item.id}`,
  ].join('\n')
}

export async function getReportsHandler(
  input: z.infer<z.ZodObject<typeof getReportsInputSchema>>,
  apiBaseUrl: string,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  if (!input.bbox && (input.lat === undefined || input.lng === undefined)) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Error: provide either bbox or lat+lng.' }],
    }
  }

  if (input.bbox) {
    const { west, south, east, north } = input.bbox
    if (east - west > 2 || north - south > 2) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: bounding box too large. Maximum 2°×2°.' }],
      }
    }
  }

  try {
    const params: Record<string, string | number | boolean | undefined> = {}
    if (input.bbox) {
      const { west, south, east, north } = input.bbox
      params.bbox = `${west},${south},${east},${north}`
    } else {
      params.lat = input.lat
      params.lng = input.lng
      params.radius_km = input.radius_km
    }
    if (input.problem_type) params.problem_type = input.problem_type
    if (input.include_resolved !== undefined) params.include_resolved = input.include_resolved
    params.zoom = 15 // individual mode — get actual reports, not clusters

    const data = (await apiFetch(apiBaseUrl, '/api/v1/public/reports', params)) as ApiResponse

    if (!data.items || data.items.length === 0) {
      return {
        content: [{ type: 'text', text: `No reports found in the specified area (total in area: ${data.total_in_area ?? 0}).` }],
      }
    }

    const lines = [
      `Found ${data.items.length} report(s) in the area (${data.total_in_area} total):`,
      '',
      ...data.items.map((item, i) => formatItem(item, i + 1)),
    ]

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Error: ${apiErrorToMcp(err)}` }] }
  }
}
