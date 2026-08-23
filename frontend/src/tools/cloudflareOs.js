/**
 * Cloudflare OS: Edge Workspace, Gatekeeper Security & Gadget Sandbox Runtime
 * 
 * Inspired by cloudflare/cloudflare-os (github.com/cloudflare/cloudflare-os).
 * Provides capability-based Gatekeeper security tokens, isolated Gadget manifest
 * execution, Cloudflare AI Gateway telemetry/caching, and D1/KV Edge state bindings.
 */

// In-memory state for Gatekeeper capabilities, Gadgets registry, and Edge storage
const GATEKEEPER_TOKENS = new Map()
const REGISTERED_GADGETS = new Map()
const EDGE_KV = new Map()
const EDGE_D1 = new Map()
const AI_GATEWAY_CACHE = new Map()

/**
 * Issues a scoped capability token with TTL (Gatekeeper pattern)
 */
export function issueCapabilityToken({ agentId = 'default_agent', scopes = ['read:docs'], ttlMs = 3600000 }) {
  const tokenId = `cf_cap_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`
  const expiresAt = Date.now() + ttlMs

  const record = {
    tokenId,
    agentId,
    scopes: Array.isArray(scopes) ? scopes : [scopes],
    issuedAt: Date.now(),
    expiresAt,
    active: true,
  }

  GATEKEEPER_TOKENS.set(tokenId, record)
  return record
}

/**
 * Verifies if a capability token authorizes an action
 */
export function verifyGatekeeperToken(tokenId, requiredScope) {
  if (!tokenId || !GATEKEEPER_TOKENS.has(tokenId)) {
    return {
      allowed: false,
      reason: 'Missing or invalid Gatekeeper token.',
    }
  }

  const token = GATEKEEPER_TOKENS.get(tokenId)
  if (!token.active) {
    return {
      allowed: false,
      reason: 'Gatekeeper token has been revoked.',
    }
  }

  if (Date.now() > token.expiresAt) {
    return {
      allowed: false,
      reason: 'Gatekeeper token has expired.',
    }
  }

  const hasScope = token.scopes.includes('*') || token.scopes.includes(requiredScope)
  if (!hasScope) {
    return {
      allowed: false,
      reason: `Token lacks required scope: "${requiredScope}". Token scopes: [${token.scopes.join(', ')}].`,
    }
  }

  return {
    allowed: true,
    agentId: token.agentId,
    token,
  }
}

/**
 * Registers an isolated Gadget application
 */
export function registerGadget({ id, name, version = '1.0.0', requiredCapabilities = [], code = '', permissions = {} }) {
  if (!id || !name) {
    return { success: false, error: 'Gadget must specify an "id" and "name".' }
  }

  const gadget = {
    id,
    name,
    version,
    requiredCapabilities,
    code,
    permissions,
    registeredAt: Date.now(),
    status: 'ready',
  }

  REGISTERED_GADGETS.set(id, gadget)
  return { success: true, gadget }
}

/**
 * Runs a registered Gadget inside an isolated capability-checked sandbox
 */
export async function executeGadget(gadgetId, input = {}, capabilityToken = null) {
  if (!REGISTERED_GADGETS.has(gadgetId)) {
    return { success: false, error: `Gadget "${gadgetId}" not found.` }
  }

  const gadget = REGISTERED_GADGETS.get(gadgetId)

  // Verify all required capabilities against the token
  for (const reqCap of gadget.requiredCapabilities) {
    const check = verifyGatekeeperToken(capabilityToken, reqCap)
    if (!check.allowed) {
      return {
        success: false,
        error: `Gatekeeper blocked Gadget "${gadgetId}": ${check.reason}`,
        requiredCapability: reqCap,
      }
    }
  }

  // Simulated isolated Gadget execution
  return {
    success: true,
    gadgetId,
    gadgetName: gadget.name,
    version: gadget.version,
    output: {
      status: 'completed',
      processedAt: new Date().toISOString(),
      inputEcho: input,
      sandbox: 'cloudflare_worker_isolated_iframe',
    },
  }
}

/**
 * Simulates Cloudflare AI Gateway routing, cost monitoring, and response caching
 */
export function routeAIGateway({ prompt = '', model = '@cf/meta/llama-3.3-70b-instruct', provider = 'workers-ai' }) {
  const cacheKey = `${model}:${prompt.trim()}`
  
  if (AI_GATEWAY_CACHE.has(cacheKey)) {
    const cached = AI_GATEWAY_CACHE.get(cacheKey)
    return {
      cached: true,
      provider: cached.provider,
      model: cached.model,
      tokensUsed: 0,
      estimatedCostSaved: '$0.0004',
      latencyMs: 12,
      response: cached.response,
    }
  }

  const generatedResponse = `[Cloudflare AI Gateway | ${model}] Executed response for query: "${prompt.slice(0, 60)}..."`
  const result = {
    cached: false,
    provider,
    model,
    tokensUsed: Math.max(15, Math.ceil(prompt.length / 4)),
    estimatedCost: '$0.0003',
    latencyMs: 140,
    response: generatedResponse,
  }

  AI_GATEWAY_CACHE.set(cacheKey, result)
  return result
}

export const cloudflareOsTool = {
  schema: {
    name: 'cloudflare_os',
    description: 'Cloudflare OS workspace, Gatekeeper capability security, and sandboxed Gadget runtime (inspired by cloudflare/cloudflare-os). Issues scoped capability tokens, executes sandboxed gadgets, simulates AI Gateway caching/routing, and manages edge KV/D1 state.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['issue_token', 'verify_token', 'register_gadget', 'execute_gadget', 'ai_gateway', 'edge_kv', 'list_gadgets'],
          description: 'Action to perform.',
        },
        agentId: {
          type: 'string',
          description: 'Agent identifier for issue_token.',
        },
        scopes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed capability scopes (e.g. ["read:docs", "exec:gadget", "write:db", "api:external"]).',
        },
        tokenId: {
          type: 'string',
          description: 'Gatekeeper token to verify or authenticate with.',
        },
        requiredScope: {
          type: 'string',
          description: 'Required capability scope to verify against.',
        },
        gadget: {
          type: 'object',
          description: 'Gadget manifest object for register_gadget ({ id, name, version, requiredCapabilities, code }).',
        },
        gadgetId: {
          type: 'string',
          description: 'ID of registered gadget to execute.',
        },
        input: {
          type: 'object',
          description: 'Input arguments passed into the gadget.',
        },
        prompt: {
          type: 'string',
          description: 'Prompt payload for AI Gateway routing.',
        },
        model: {
          type: 'string',
          description: 'Model identifier for AI Gateway routing (default: @cf/meta/llama-3.3-70b-instruct).',
        },
        kvKey: {
          type: 'string',
          description: 'Key name for edge KV store.',
        },
        kvValue: {
          type: 'string',
          description: 'Value to write to edge KV store (omit to read).',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const {
      action,
      agentId = 'agent_worker',
      scopes = ['read:docs', 'exec:gadget'],
      tokenId = '',
      requiredScope = 'read:docs',
      gadget = null,
      gadgetId = '',
      input = {},
      prompt = '',
      model = '@cf/meta/llama-3.3-70b-instruct',
      kvKey = '',
      kvValue = undefined,
    } = args

    switch (action) {
      case 'issue_token': {
        const token = issueCapabilityToken({ agentId, scopes })
        return { success: true, action: 'issue_token', token }
      }

      case 'verify_token': {
        if (!tokenId) return { success: false, error: 'Please provide "tokenId".' }
        const res = verifyGatekeeperToken(tokenId, requiredScope)
        return { success: true, action: 'verify_token', ...res }
      }

      case 'register_gadget': {
        if (!gadget || !gadget.id || !gadget.name) {
          return { success: false, error: 'Please provide valid "gadget" manifest with "id" and "name".' }
        }
        const res = registerGadget(gadget)
        return { success: res.success, action: 'register_gadget', ...res }
      }

      case 'execute_gadget': {
        if (!gadgetId) return { success: false, error: 'Please provide "gadgetId".' }
        return await executeGadget(gadgetId, input, tokenId)
      }

      case 'ai_gateway': {
        if (!prompt) return { success: false, error: 'Please provide "prompt" for AI Gateway.' }
        const res = routeAIGateway({ prompt, model })
        return { success: true, action: 'ai_gateway', ...res }
      }

      case 'edge_kv': {
        if (!kvKey) return { success: false, error: 'Please provide "kvKey".' }
        if (kvValue !== undefined) {
          EDGE_KV.set(kvKey, kvValue)
          return { success: true, action: 'edge_kv', operation: 'write', key: kvKey, value: kvValue }
        }
        const val = EDGE_KV.get(kvKey) || null
        return { success: true, action: 'edge_kv', operation: 'read', key: kvKey, value: val }
      }

      case 'list_gadgets': {
        return {
          success: true,
          action: 'list_gadgets',
          total: REGISTERED_GADGETS.size,
          gadgets: Array.from(REGISTERED_GADGETS.values()),
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: issue_token, verify_token, register_gadget, execute_gadget, ai_gateway, edge_kv, list_gadgets.`,
        }
    }
  },
}
