// Vercel Serverless Function — CORS proxy for non-CORS LLM providers
// Auto-detected by Vercel when deployed. Free tier: 1M invocations/month.

export const config = { runtime: 'edge' }

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const targetUrl = req.headers.get('X-Target-URL')
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing X-Target-URL header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const headers = {}
    if (req.headers.get('content-type')) headers['Content-Type'] = req.headers.get('content-type')
    if (req.headers.get('authorization')) headers['Authorization'] = req.headers.get('authorization')

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: req.body,
    })

    const responseHeaders = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': resp.headers.get('content-type') || 'application/json',
    })

    return new Response(resp.body, { status: resp.status, headers: responseHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
