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
  const allowed = list.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL, X-Subscription-Token, Accept',
    // Without Expose-Headers the browser hides retry-after from the client that
    // needs it — CORS strips everything but the safelist.
    'Access-Control-Expose-Headers': 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id, X-Yogatik-Proxy',
    'Access-Control-Max-Age': '86400',
  };
}

function isAllowedOrigin(origin, env) {
  const list = env?.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : DEFAULT_ORIGINS;
  return list.includes(origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // This is a browser-facing proxy. Restrict callers, but deliberately do
    // not restrict their HTTPS destination: users can configure any provider
    // or public API URL in Yogatik.
    if (!isAllowedOrigin(origin, env)) {
      return new Response(JSON.stringify({ error: 'Origin is not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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

    // Accept every HTTPS destination. Provider and tool URLs are user-configured
    // and must not be constrained to a hard-coded host list.
    try {
      const url = new URL(targetUrl);

      if (url.protocol !== 'https:') {
        return new Response(
          JSON.stringify({ error: 'Only https targets are allowed' }),
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
      'host', 'origin', 'referer', 'x-target-url', 'cookie',
      'x-forwarded-for', 'x-forwarded-proto',
      'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry',
      'connection', 'upgrade',
      // Must NOT be forwarded: the body is re-encoded on the way out, so a
      // stale content-length makes the upstream wait for bytes that never
      // arrive — the request hangs until Cloudflare gives up with a 524.
      'content-length', 'transfer-encoding', 'content-encoding', 'accept-encoding',
    ]);

    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!skipHeaders.has(key.toLowerCase())) {
        forwardHeaders.set(key, value);
      }
    }

    try {
      // Buffer the request body (chat payloads are small) so the runtime sets a
      // correct content-length. Streaming request.body through with the client's
      // original headers is what produced the hang. Response streaming, which is
      // what actually matters for SSE, is untouched below.
      const bodyless = ['GET', 'HEAD'].includes(request.method);
      const body = bodyless ? undefined : await request.arrayBuffer();

      // Fail fast with a readable error instead of Cloudflare's opaque 524.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 90_000);

      let upstream;
      try {
        upstream = await fetch(targetUrl, {
          method: request.method,
          headers: forwardHeaders,
          body,
          signal: abort.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      // Build response with CORS headers
      const responseHeaders = new Headers(corsHeaders(origin, env));
      // Copy content-type and other useful headers from upstream
      // NB: never copy content-length — the body is re-streamed, so a stale
      // length truncates SSE responses.
      // retry-after MUST survive: the client honours it on 429/503, and without
      // it every rate limit degrades into blind exponential backoff.
      const copyHeaders = [
        'content-type', 'x-request-id', 'retry-after',
        'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
      ];
      for (const h of copyHeaders) {
        const val = upstream.headers.get(h);
        if (val) responseHeaders.set(h, val);
      }
      responseHeaders.set('Cache-Control', 'no-cache, no-transform');
      // Whose status is this? A 429 relayed from the target (DuckDuckGo and
      // YouTube rate-limit datacenter IPs hard) says nothing about this worker,
      // and the client must not put its own proxy on cooldown for it.
      responseHeaders.set('X-Yogatik-Proxy', 'upstream');

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      const timedOut = err.name === 'AbortError';
      return new Response(
        JSON.stringify({
          error: timedOut ? 'Upstream timeout' : 'Proxy error',
          message: timedOut
            ? 'The provider did not respond within 90s. It may be overloaded — try a smaller model.'
            : err.message,
        }),
        {
          status: timedOut ? 504 : 502,
          headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
