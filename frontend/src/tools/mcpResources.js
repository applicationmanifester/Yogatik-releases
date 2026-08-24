/**
 * mcp_resource / mcp_prompt — let the agent USE what connected MCP servers
 * expose beyond tools: their resources (files/data the server publishes),
 * resource templates (dynamic URIs), and prompt templates.
 */
import {
  getMcpResources, getMcpResourceTemplates, readMcpResource, getMcpPrompts, getMcpPrompt,
} from '../mcp'
import { expandUriTemplate } from './mcpAdvanced'

export const mcpResourceTool = {
  schema: {
    description:
      'Access data published by connected MCP servers as "resources" (documents, records, files the server exposes) ' +
      'or "templates" (parameterized resource URIs). ' +
      'action "list" enumerates static resources; action "templates" enumerates dynamic URI templates; action "read" fetches one by its URI (or template + params). ' +
      'Use when the user refers to data an MCP server provides.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'templates', 'read'],
          description: 'list static resources, list dynamic URI templates, or read a resource by uri.',
        },
        server: { type: 'string', description: 'Optional server id to scope query to one server.' },
        uri: { type: 'string', description: 'Resource URI or URI template to read (required for action "read").' },
        params: { type: 'object', description: 'Optional variables to substitute into a URI template (e.g. { name: "users" }).' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'list', server, uri, params } = {}) {
    if (action === 'read') {
      if (!uri) return { success: false, error: 'uri is required to read a resource' }

      let targetUri = uri
      if (params && typeof params === 'object') {
        targetUri = expandUriTemplate(uri, params)
      }

      // Find which server owns this uri if not scoped.
      let sid = server
      if (!sid) {
        const match = getMcpResources().find(r => r.uri === targetUri || r.uri === uri)
        if (match) sid = match._serverId
        if (!sid) {
          const tmplMatch = getMcpResourceTemplates().find(t => t.uriTemplate === uri)
          if (tmplMatch) sid = tmplMatch._serverId
        }
      }
      if (!sid) {
        // Fallback: pick first connected server with resources or templates if only one exists
        const allRes = getMcpResources()
        if (allRes.length > 0 && new Set(allRes.map(r => r._serverId)).size === 1) {
          sid = allRes[0]._serverId
        }
      }

      if (!sid) return { success: false, error: 'No connected MCP server has that resource. Call action "list" or "templates" first.' }
      const r = await readMcpResource(sid, targetUri)
      if (!r.success) return r
      const text = (r.contents || []).map(c => c.text || c.blob || '').filter(Boolean).join('\n')
      return { success: true, tool: 'mcp_resource', uri: targetUri, text, contents: r.contents }
    }

    if (action === 'templates') {
      const templates = getMcpResourceTemplates(server)
      if (!templates.length) {
        return {
          success: true,
          tool: 'mcp_resource',
          count: 0,
          templates: [],
          note: 'No dynamic resource templates exposed by connected MCP servers.',
        }
      }
      return { success: true, tool: 'mcp_resource', count: templates.length, templates }
    }

    const list = getMcpResources(server)
    if (!list.length) {
      return {
        success: true,
        tool: 'mcp_resource',
        count: 0,
        resources: [],
        note: 'No static MCP resources available. Connect an MCP server that publishes resources, or try action "templates".',
      }
    }
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
