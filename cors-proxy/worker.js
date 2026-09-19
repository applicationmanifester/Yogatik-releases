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

const SENSITIVE_HEADERS = ['cookie', 'x-auth-token', 'x-access-token'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = url.searchParams.get('target') || request.headers.get('x-target-url');
    
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
    
    const headers = new Headers(request.headers);
    
    // Strip sensitive headers for non-allowlisted hosts OR preflight
    if (!isAllowed || isPreflight) {
      for (const h of SENSITIVE_HEADERS) {
        headers.delete(h);
      }
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