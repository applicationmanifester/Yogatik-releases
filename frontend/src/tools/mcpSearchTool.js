/**
 * mcpSearchTool.js — Dynamic On-Demand MCP Tool Discovery & Inspection for Agents.
 *
 * Allows agents to search across all connected MCP server tools, inspect schemas,
 * and retrieve exact execution signatures on-demand without context window bloat.
 */
import { getMcpSchemas, getMcpServers } from '../mcp'
import { searchMcpTools } from './mcpAdvanced'

export const mcpSearchTool = {
  schema: {
    name: 'mcp_search_tools',
    description:
      'Search and inspect tools available across all connected Model Context Protocol (MCP) servers. ' +
      'Use this when you need specialized capabilities (database, git, cloud, APIs) or want to find matching MCP tools.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keywords or task intent (e.g., "sqlite query", "stripe customer", "git commit", "cloudflare").',
        },
        server: {
          type: 'string',
          description: 'Optional server ID filter to search tools on a specific MCP server.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tool definitions to return (default: 8).',
        },
      },
      required: ['query'],
    },
  },

  async execute({ query = '', server, limit = 8 } = {}) {
    const schemas = getMcpSchemas()
    if (!schemas.length) {
      const servers = await getMcpServers()
      return {
        success: true,
        tool: 'mcp_search_tools',
        count: 0,
        tools: [],
        connectedServers: servers.map(s => ({ id: s.id, name: s.name, transport: s.transport || 'http' })),
        note: servers.length === 0
          ? 'No MCP servers are configured. Add connectors in Settings -> MCP Connectors.'
          : 'MCP servers are configured but no tools are currently discovered. Connect/refresh them in MCP settings.',
      }
    }

    const flatList = schemas.map(s => {
      const fn = s.function || {}
      const parts = fn.name.split('__')
      const serverId = parts[1] || 'unknown'
      const originalToolName = parts.slice(2).join('__') || fn.name
      return {
        name: fn.name,
        originalName: originalToolName,
        serverId,
        description: fn.description || '',
        parameters: fn.parameters || {},
      }
    })

    const filtered = server
      ? flatList.filter(t => t.serverId.toLowerCase() === String(server).toLowerCase())
      : flatList

    const matched = searchMcpTools(filtered, query, limit)

    return {
      success: true,
      tool: 'mcp_search_tools',
      count: matched.length,
      tools: matched.map(t => ({
        tool_name: t.name,
        server: t.serverId,
        description: t.description,
        parameters: t.parameters,
      })),
      hint: matched.length > 0
        ? 'Call the discovered tool directly using its exact `tool_name`.'
        : 'No matching tools found for that query. Try broader keywords or inspect available MCP servers.',
    }
  },
}
