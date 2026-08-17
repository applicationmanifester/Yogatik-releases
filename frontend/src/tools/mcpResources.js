/**
 * mcp_resource / mcp_prompt — let the agent USE what connected MCP servers
 * expose beyond tools: their resources (files/data the server publishes) and
 * their prompt templates. Previously these were discovered but unreachable from
 * chat. Both degrade to an honest note when no MCP server is connected.
 */
import {
  getMcpResources, readMcpResource, getMcpPrompts, getMcpPrompt,
} from '../mcp'

export const mcpResourceTool = {
  schema: {
    description:
      'Access data published by connected MCP servers as "resources" (documents, records, files the server exposes). ' +
      'action "list" enumerates available resources; action "read" fetches one by its URI. ' +
      'Use when the user refers to data an MCP server provides.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read'], description: 'list available resources, or read one by uri.' },
        server: { type: 'string', description: 'Optional server id to scope "list" to one server.' },
        uri: { type: 'string', description: 'Resource URI to read (required for action "read").' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'list', server, uri } = {}) {
    if (action === 'read') {
      if (!uri) return { success: false, error: 'uri is required to read a resource' }
      // Find which server owns this uri if not scoped.
      let sid = server
      if (!sid) {
        const match = getMcpResources().find(r => r.uri === uri)
        sid = match?._serverId
      }
      if (!sid) return { success: false, error: 'No connected MCP server has that resource. Call action "list" first.' }
      const r = await readMcpResource(sid, uri)
      if (!r.success) return r
      const text = (r.contents || []).map(c => c.text || c.blob || '').filter(Boolean).join('\n')
      return { success: true, tool: 'mcp_resource', uri, text, contents: r.contents }
    }
    const list = getMcpResources(server)
    if (!list.length) return { success: true, tool: 'mcp_resource', count: 0, resources: [], note: 'No MCP resources available. Connect an MCP server that publishes resources.' }
    return { success: true, tool: 'mcp_resource', count: list.length, resources: list }
  },
}

export const mcpPromptTool = {
  schema: {
    description:
      'Use prompt templates published by connected MCP servers. ' +
      'action "list" enumerates them; action "get" fetches one by name (with optional arguments), returning its messages so you can follow it. ' +
      'Use when a task matches an MCP server’s named workflow/prompt.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get'], description: 'list available prompts, or get one by name.' },
        server: { type: 'string', description: 'Optional server id to scope to one server.' },
        name: { type: 'string', description: 'Prompt name to fetch (required for action "get").' },
        args: { type: 'object', description: 'Arguments to fill the prompt template (action "get").' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'list', server, name, args = {} } = {}) {
    if (action === 'get') {
      if (!name) return { success: false, error: 'name is required to get a prompt' }
      let sid = server
      if (!sid) {
        const match = getMcpPrompts().find(p => p.name === name)
        sid = match?._serverId
      }
      if (!sid) return { success: false, error: 'No connected MCP server has that prompt. Call action "list" first.' }
      const r = await getMcpPrompt(sid, name, args)
      if (!r.success) return r
      const text = (r.messages || [])
        .map(m => `${m.role || 'user'}: ${typeof m.content === 'string' ? m.content : (m.content?.text || '')}`)
        .join('\n')
      return { success: true, tool: 'mcp_prompt', name, text, messages: r.messages }
    }
    const list = getMcpPrompts(server)
    if (!list.length) return { success: true, tool: 'mcp_prompt', count: 0, prompts: [], note: 'No MCP prompts available. Connect an MCP server that publishes prompts.' }
    return { success: true, tool: 'mcp_prompt', count: list.length, prompts: list }
  },
}
