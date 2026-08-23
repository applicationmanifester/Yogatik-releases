import { describe, it, expect } from 'vitest'
import {
  issueCapabilityToken,
  verifyGatekeeperToken,
  registerGadget,
  executeGadget,
  routeAIGateway,
  cloudflareOsTool,
} from './cloudflareOs'

describe('Cloudflare OS Workspace & Gatekeeper Engine', () => {
  it('issues and verifies capability tokens (Gatekeeper layer)', () => {
    const token = issueCapabilityToken({
      agentId: 'research_agent',
      scopes: ['read:docs', 'exec:gadget'],
      ttlMs: 5000,
    })

    expect(token.tokenId).toContain('cf_cap_')
    expect(token.active).toBe(true)

    // Allowed scope check
    const check1 = verifyGatekeeperToken(token.tokenId, 'read:docs')
    expect(check1.allowed).toBe(true)
    expect(check1.agentId).toBe('research_agent')

    // Disallowed scope check
    const check2 = verifyGatekeeperToken(token.tokenId, 'write:database')
    expect(check2.allowed).toBe(false)
    expect(check2.reason).toContain('lacks required scope')
  })

  it('registers and executes gadgets inside sandboxed capability boundary', async () => {
    const reg = registerGadget({
      id: 'csv_analyzer',
      name: 'CSV Analyzer Gadget',
      version: '1.2.0',
      requiredCapabilities: ['exec:gadget'],
      code: 'function run(data) { return data.length; }',
    })
    expect(reg.success).toBe(true)
    expect(reg.gadget.status).toBe('ready')

    // Execute with valid capability token
    const token = issueCapabilityToken({
      agentId: 'csv_agent',
      scopes: ['exec:gadget'],
    })

    const execRes = await executeGadget('csv_analyzer', { rows: 50 }, token.tokenId)
    expect(execRes.success).toBe(true)
    expect(execRes.gadgetId).toBe('csv_analyzer')
    expect(execRes.output.status).toBe('completed')

    // Execute without required capability token
    const emptyToken = issueCapabilityToken({
      agentId: 'unauthorized_agent',
      scopes: ['read:docs'],
    })
    const blockedRes = await executeGadget('csv_analyzer', { rows: 50 }, emptyToken.tokenId)
    expect(blockedRes.success).toBe(false)
    expect(blockedRes.error).toContain('Gatekeeper blocked')
  })

  it('routes prompts through AI Gateway with semantic caching and cost estimation', () => {
    const prompt = 'Summarize Cloudflare Workers edge architecture'
    const res1 = routeAIGateway({ prompt })
    expect(res1.cached).toBe(false)
    expect(res1.tokensUsed).toBeGreaterThan(0)

    const res2 = routeAIGateway({ prompt })
    expect(res2.cached).toBe(true)
    expect(res2.estimatedCostSaved).toBeDefined()
  })

  it('cloudflareOsTool executes issue_token, verify_token, register_gadget, and edge_kv', async () => {
    // Tool issue token
    const tokenRes = await cloudflareOsTool.execute({
      action: 'issue_token',
      agentId: 'test_agent',
      scopes: ['read:docs', 'write:kv'],
    })
    expect(tokenRes.success).toBe(true)
    expect(tokenRes.token.tokenId).toBeDefined()

    // Tool Edge KV read and write
    const writeRes = await cloudflareOsTool.execute({
      action: 'edge_kv',
      kvKey: 'app_config',
      kvValue: '{"mode":"production"}',
    })
    expect(writeRes.success).toBe(true)
    expect(writeRes.operation).toBe('write')

    const readRes = await cloudflareOsTool.execute({
      action: 'edge_kv',
      kvKey: 'app_config',
    })
    expect(readRes.success).toBe(true)
    expect(readRes.value).toBe('{"mode":"production"}')
  })
})
