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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL, X-Subscription-Token, Accept, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, *',
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

// Hosts that are trusted to RECEIVE a forwarded credential (Authorization /
// x-api-key). Any other HTTPS target is still relayed — user-configured tool
// URLs must keep working — but WITHOUT the credential, so a compromised or
// XSS'd allowed origin cannot use the proxy to exfiltrate a provider key to an
// attacker-controlled endpoint. Extend via env.CREDENTIALED_HOSTS (comma list).
const DEFAULT_CREDENTIALED_HOSTS = [
  'integrate.api.nvidia.com',
  'api.openai.com',
  'openrouter.ai',
  'api.groq.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
];

function hostIsCredentialed(hostname, env) {
  const list = env?.CREDENTIALED_HOSTS
    ? env.CREDENTIALED_HOSTS.split(',').map(s => s.trim().toLowerCase())
    : DEFAULT_CREDENTIALED_HOSTS;
  return list.includes(String(hostname || '').toLowerCase());
}

// Best-effort per-origin rate limit. In-memory, per-isolate (Cloudflare spins up
// many), so it is a coarse abuse brake, not a hard quota — pair with a WAF rule
// or Durable Object for strict limits. Window: RL_MAX requests / RL_WINDOW_MS.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 120;
const _rl = new Map(); // origin -> { count, resetAt }
function rateLimited(origin) {
  const now = Date.now();
  const rec = _rl.get(origin);
  if (!rec || now > rec.resetAt) {
    _rl.set(origin, { count: 1, resetAt: now + RL_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RL_MAX;
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

    // Coarse per-origin abuse brake.
    if (rateLimited(origin)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', message: 'Too many requests through the proxy. Slow down and retry shortly.' }),
        { status: 429, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json', 'Retry-After': '30' } }
      );
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

    // Only vetted provider hosts may receive a forwarded credential. For any
    // other destination we relay the request but strip auth headers.
    let targetHost = '';
    try { targetHost = new URL(targetUrl).hostname; } catch { /* validated above */ }
    const credentialed = hostIsCredentialed(targetHost, env);
    const credentialHeaders = new Set(['authorization', 'x-api-key', 'x-subscription-token']);

    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase();
      if (skipHeaders.has(lower)) continue;
      if (!credentialed && credentialHeaders.has(lower)) continue; // never leak keys to unvetted hosts
      forwardHeaders.set(key, value);
    }
    // Minimal audit trail (host only, never the key or body).
    try { console.log(JSON.stringify({ at: Date.now(), origin, targetHost, credentialed })); } catch { /* ignore */ }

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
