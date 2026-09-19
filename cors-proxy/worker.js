// cloudflare-worker/index.js
const ALLOWED_HOSTS = new Set([
  'api.openai.com',
  'api.groq.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.elevenlabs.io',
  'api.github.com',
  'raw.githubusercontent.com',
  'api.kite.trade',
  'kite.zerodha.com'
]);

// Hosts that are explicitly allowed to receive Authorization headers
const CREDENTIAL_ALLOWLIST = new Set([
  'api.openai.com',
  'api.groq.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.elevenlabs.io',
  'api.kite.trade',
  'kite.zerodha.com'
]);

// Rate limiting: per-origin requests per minute
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitMap = new Map(); // origin -> { count, windowStart, targets: Set }

const SENSITIVE_HEADERS = ['cookie', 'x-auth-token', 'x-access-token'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = url.searchParams.get('target') || request.headers.get('x-target-url');
    const origin = request.headers.get('origin') || 'unknown';
    
    if (!target) {
      return new Response('Missing target parameter', { status: 400 });
    }
    
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid target URL', { status: 400 });
    }
    
    const isAllowed = ALLOWED_HOSTS.has(targetUrl.hostname);
    const isPreflight = request.method === 'OPTIONS';
    
    // Rate limiting check
    const now = Date.now();
    const rateLimit = rateLimitMap.get(origin);
    if (rateLimit) {
      if (now - rateLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimit.count = 0;
        rateLimit.windowStart = now;
        rateLimit.targets.clear();
      }
      if (rateLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
        return new Response('Rate limit exceeded', { 
          status: 429,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Retry-After': String(Math.ceil((rateLimit.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000))
          }
        });
      }
      rateLimit.count++;
      rateLimit.targets.add(targetUrl.hostname);
    } else {
      rateLimitMap.set(origin, { count: 1, windowStart: now, targets: new Set([targetUrl.hostname]) });
    }
    
    // Log target for audit (in production, send to logging service)
    console.log(`[Proxy] origin=${origin} target=${targetUrl.hostname} allowed=${isAllowed}`);
    
    const headers = new Headers(request.headers);
    
    // Strip sensitive headers for non-allowlisted hosts OR preflight
    // CRITICAL: Only forward Authorization to explicitly credential-allowlisted hosts
    const canReceiveCredentials = CREDENTIAL_ALLOWLIST.has(targetUrl.hostname);
    if (!canReceiveCredentials || isPreflight) {
      for (const h of SENSITIVE_HEADERS) {
        headers.delete(h);
      }
      headers.delete('authorization');
      headers.delete('x-api-key');
    }
    
    // CORS headers for preflight
    if (isPreflight) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*, Content-Type, Authorization, X-API-Key, X-Target-URL, X-Kite-Version',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    
    // Forward request
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.blob();
    
    try {
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body,
        redirect: 'follow'
      });
      
      // Return with CORS headers
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Expose-Headers', '*');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (err) {
      console.error('Proxy error:', err);
      return new Response('Proxy error', { status: 502 });
    }
  }
};