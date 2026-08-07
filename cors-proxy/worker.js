/**
 * Yogatik CORS Proxy — Cloudflare Worker (Edge Function)
 * Forwards requests to non-CORS LLM APIs (like NVIDIA NIM)
 * with proper CORS headers for browser-based apps.
 *
 * Usage: POST https://<worker>.workers.dev/
 *   Header: X-Target-URL: https://integrate.api.nvidia.com/v1/chat/completions
 *   Header: Authorization: Bearer <api-key>
 *   Body: { ...request body... }
 */

const DEFAULT_ORIGINS = [
  'https://yogatik.web.app',
  'https://yogatik.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsHeaders(origin, env) {
  const list = (env?.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : DEFAULT_ORIGINS);
  const allowed = list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    // Get the target URL from the header
    const targetUrl = request.headers.get('X-Target-URL');
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing X-Target-URL header' }),
        { status: 400, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
      );
    }

    // Validate target URL (only allow known LLM API hosts)
    const allowedHosts = [
      'integrate.api.nvidia.com',
      'api.nvidia.com',
    ];
    try {
      const url = new URL(targetUrl);
      if (!allowedHosts.some(h => url.hostname.endsWith(h))) {
        return new Response(
          JSON.stringify({ error: 'Target host not allowed' }),
          { status: 403, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid target URL' }),
        { status: 400, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
      );
    }

    // Build forwarded headers (skip hop-by-hop and browser-specific)
    const skipHeaders = new Set([
      'host', 'origin', 'referer', 'x-target-url',
      'x-forwarded-for', 'x-forwarded-proto',
      'cf-connecting-ip', 'cf-ray', 'cf-visitor',
      'connection', 'upgrade',
    ]);

    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!skipHeaders.has(key.toLowerCase())) {
        forwardHeaders.set(key, value);
      }
    }

    try {
      // Forward the request to the target API
      const upstream = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      });

      // Build response with CORS headers
      const responseHeaders = new Headers(corsHeaders(origin, env));
      // Copy content-type and other useful headers from upstream
      // NB: never copy content-length — the body is re-streamed, so a stale
      // length truncates SSE responses.
      const copyHeaders = ['content-type', 'x-request-id'];
      for (const h of copyHeaders) {
        const val = upstream.headers.get(h);
        if (val) responseHeaders.set(h, val);
      }
      responseHeaders.set('Cache-Control', 'no-cache, no-transform');

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Proxy error', message: err.message }),
        { status: 502, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
      );
    }
  },
};
