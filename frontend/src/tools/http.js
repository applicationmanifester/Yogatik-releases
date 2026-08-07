/**
 * Shared CORS-proxy fetch for tools.
 * Prefers the project's own worker (VITE_LLM_PROXY_BASE / the Vite dev plugin);
 * falls back to a public relay only for credential-free public content.
 */

import { getProxyEndpoint } from '../llm'

const PUBLIC_RELAY = 'https://api.allorigins.win/raw?url='

/** @param {{credentials?: boolean}} opts credentials:true forbids the public relay */
export async function proxyFetch(url, { credentials = false, ...init } = {}) {
  const endpoint = getProxyEndpoint()
  if (endpoint) {
    return fetch(endpoint, { ...init, headers: { ...init.headers, 'X-Target-URL': url } })
  }
  if (credentials) {
    throw new Error('No private proxy configured — refusing to send credentials through a public relay.')
  }
  return fetch(PUBLIC_RELAY + encodeURIComponent(url), init)
}

export async function proxyText(url, opts) {
  const resp = await proxyFetch(url, opts)
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`)
  return resp.text()
}

export async function proxyJson(url, opts) {
  const resp = await proxyFetch(url, opts)
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`)
  return resp.json()
}
