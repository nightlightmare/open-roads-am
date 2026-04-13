import { createServer } from 'node:http'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './server.js'

const API_BASE_URL = process.env.API_BASE_URL
const TRANSPORT = process.env.TRANSPORT ?? 'stdio'
const PORT = Number(process.env.PORT ?? 3002)

if (!API_BASE_URL) {
  console.error('Error: API_BASE_URL environment variable is required')
  process.exit(1)
}

if (TRANSPORT === 'http') {
  // HTTP + Streamable HTTP transport — stateless, one McpServer per request
  const httpServer = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end('Method Not Allowed')
      return
    }

    let body = ''
    for await (const chunk of req) body += chunk

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(body)
    } catch {
      res.writeHead(400).end('Invalid JSON')
      return
    }

    // exactOptionalPropertyTypes conflicts with SDK types — double cast required
    const transport = new StreamableHTTPServerTransport(
      { sessionIdGenerator: undefined } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0],
    )
    const mcpServer = createMcpServer(API_BASE_URL)
    try {
      await mcpServer.connect(transport as Parameters<typeof mcpServer.connect>[0])
      await transport.handleRequest(req, res, parsedBody)
    } catch (err) {
      console.error(JSON.stringify({ event: 'mcp_request_error', error: String(err) }))
      if (!res.headersSent) res.writeHead(500).end('Internal Server Error')
    } finally {
      await mcpServer.close()
    }
  })

  httpServer.listen(PORT, () => {
    console.log(JSON.stringify({ event: 'mcp_server_started', transport: 'http', port: PORT }))
  })
} else {
  // Stdio transport — for Claude Desktop / Cursor integration
  const transport = new StdioServerTransport()
  const server = createMcpServer(API_BASE_URL)
  await server.connect(transport)
  // Structured log to stderr so it doesn't interfere with MCP stdio protocol
  console.error(JSON.stringify({ event: 'mcp_server_started', transport: 'stdio' }))
}
