import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getReportsInputSchema, getReportsHandler } from './tools/get-reports.js'
import { getReportInputSchema, getReportHandler } from './tools/get-report.js'
import { getStatsInputSchema, getStatsHandler } from './tools/get-stats.js'

export function createMcpServer(apiBaseUrl: string): McpServer {
  const server = new McpServer({
    name: 'open-road-mcp',
    version: '1.0.0',
  })

  server.registerTool(
    'get_reports',
    {
      description:
        'Get road problem reports from Armenia by bounding box or lat/lng radius. ' +
        'Returns individual reports at zoom≥15 (default). Requires either bbox or lat+lng.',
      inputSchema: getReportsInputSchema,
    },
    (input) => getReportsHandler(input, apiBaseUrl),
  )

  server.registerTool(
    'get_report',
    {
      description: 'Get full details for a single road problem report by its UUID.',
      inputSchema: getReportInputSchema,
    },
    (input) => getReportHandler(input, apiBaseUrl),
  )

  server.registerTool(
    'get_stats',
    {
      description:
        'Get aggregate road problem statistics. Defaults to the last 30 days. ' +
        'Can filter by region_id and problem_type.',
      inputSchema: getStatsInputSchema,
    },
    (input) => getStatsHandler(input, apiBaseUrl),
  )

  return server
}
