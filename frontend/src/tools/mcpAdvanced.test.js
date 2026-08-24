import { describe, it, expect } from 'vitest'
import {
  normalizeMcpCallResult,
  expandUriTemplate,
  compactToolSchema,
  searchMcpTools,
} from './mcpAdvanced'
import { mcpSearchTool } from './mcpSearchTool'
import { mcpResourceTool } from './mcpResources'

describe('mcpAdvanced Capability Suite', () => {
  describe('normalizeMcpCallResult', () => {
    it('normalizes simple text content correctly', () => {
      const result = {
        content: [
          { type: 'text', text: 'Hello from SQLite MCP' },
        ],
      }
      const out = normalizeMcpCallResult(result)
      expect(out.text).toBe('Hello from SQLite MCP')
      expect(out.images).toHaveLength(0)
    })

    it('extracts base64 image content alongside text', () => {
      const result = {
        content: [
          { type: 'text', text: 'Rendered Chart:' },
          { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
        ],
      }
      const out = normalizeMcpCallResult(result)
      expect(out.images).toHaveLength(1)
      expect(out.images[0].mimeType).toBe('image/png')
      expect(out.text).toContain('Rendered Chart:')
      expect(out.text).toContain('![MCP Image]')
    })

    it('normalizes embedded resources and structured content', () => {
      const result = {
        content: [
          { type: 'resource', resource: { uri: 'file:///log.txt', text: 'Log lines...' } },
        ],
        structuredContent: { status: 'healthy', rows: 42 },
      }
      const out = normalizeMcpCallResult(result)
      expect(out.resources).toHaveLength(1)
      expect(out.text).toContain('Log lines...')
      expect(out.structured).toEqual({ status: 'healthy', rows: 42 })
    })

    it('handles empty results gracefully', () => {
      expect(normalizeMcpCallResult(null).text).toBe('')
      expect(normalizeMcpCallResult({ isError: true }).text).toBe('Tool execution failed')
    })
  })

  describe('expandUriTemplate', () => {
    it('substitutes single variable in URI template', () => {
      const tmpl = 'db://tables/{name}/schema'
      expect(expandUriTemplate(tmpl, { name: 'users' })).toBe('db://tables/users/schema')
    })

    it('substitutes multiple variables and URL encodes values', () => {
      const tmpl = 'github://{owner}/{repo}/issues/{id}'
      expect(expandUriTemplate(tmpl, { owner: 'yogatik', repo: 'ai app', id: 101 }))
        .toBe('github://yogatik/ai%20app/issues/101')
    })

    it('preserves unsupplied variables', () => {
      const tmpl = 'db://{table}/{col}'
      expect(expandUriTemplate(tmpl, { table: 'items' })).toBe('db://items/{col}')
    })
  })

  describe('compactToolSchema', () => {
    it('strips redundant whitespace from descriptions', () => {
      const raw = {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '  Execute   an   SQL   query   against   sqlite.  ',
          },
        },
      }
      const compacted = compactToolSchema(raw)
      expect(compacted.properties.query.description).toBe('Execute an SQL query against sqlite.')
    })
  })

  describe('searchMcpTools', () => {
    const sampleTools = [
      { name: 'mcp__sqlite__query', description: 'Run SQL select queries on sqlite db', serverId: 'sqlite' },
      { name: 'mcp__sqlite__schema', description: 'Inspect tables and columns in database', serverId: 'sqlite' },
      { name: 'mcp__git__commit', description: 'Create a new git commit', serverId: 'git' },
      { name: 'mcp__stripe__charge', description: 'Create a payment charge', serverId: 'stripe' },
    ]

    it('finds tools matching keyword queries', () => {
      const res = searchMcpTools(sampleTools, 'sqlite query')
      expect(res.length).toBeGreaterThan(0)
      expect(res[0].name).toBe('mcp__sqlite__query')
    })

    it('finds tools matching server ID', () => {
      const res = searchMcpTools(sampleTools, 'stripe')
      expect(res).toHaveLength(1)
      expect(res[0].name).toBe('mcp__stripe__charge')
    })
  })

  describe('mcpSearchTool', () => {
    it('defines schema correctly with required query parameter', () => {
      expect(mcpSearchTool.schema.name).toBe('mcp_search_tools')
      expect(mcpSearchTool.schema.parameters.required).toContain('query')
    })
  })

  describe('mcpResourceTool', () => {
    it('supports templates action and read parameter substitution', async () => {
      const res = await mcpResourceTool.execute({ action: 'templates' })
      expect(res.success).toBe(true)
      expect(res.tool).toBe('mcp_resource')
    })
  })
})
