// @vitest-environment node
/**
 * The Content-Security-Policy in index.html is ENFORCED by the browser, and a
 * host it forgets fails as an opaque browser refusal — not as an error the app
 * can catch, report or fall back from. A previous revision allowlisted
 * `api.nvidia.com` while llm.js calls `integrate.api.nvidia.com`, omitted the
 * Cloudflare proxy worker and every keyless tool API, and left esm.run out of
 * script-src while ten modules import from it. Nothing in the suite noticed,
 * because tests never load index.html.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')

function directive(name) {
  const meta = html.match(/http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"\s*>/)
  if (!meta) return null
  const found = meta[1].split(';').map(s => s.trim()).find(s => s.startsWith(`${name} `))
  return found ? found.slice(name.length).trim().split(/\s+/) : null
}

/** Hosts the app dials that a connect-src allowlist would have to enumerate. */
function providerHosts() {
  const llm = fs.readFileSync(path.join(ROOT, 'src', 'llm.js'), 'utf8')
  return [...llm.matchAll(/baseUrl:\s*'https?:\/\/([^/'`]+)/g)].map(m => m[1])
}

describe('index.html CSP', () => {
  it('lets scripts load from esm.run, which ten modules import from', () => {
    const script = directive('script-src')
    expect(script, 'no script-src directive').toBeTruthy()
    expect(script).toContain('https://esm.run')
    // Kokoro/Transformers/WebLLM compile WASM.
    expect(script).toContain("'wasm-unsafe-eval'")
  })

  it('does not try to allowlist connect-src', () => {
    // The user picks their own provider, tools call dozens of keyless APIs and
    // public relays, and desktop talks to localhost daemons. Any enumerated list
    // is wrong the moment a tool is added.
    const connect = directive('connect-src')
    expect(connect, 'no connect-src directive').toBeTruthy()
    expect(connect).toContain('https:')
  })

  it('permits every provider baseUrl in llm.js', () => {
    const connect = directive('connect-src') || []
    const wildcard = connect.includes('https:') || connect.includes('*')
    const missing = providerHosts().filter(h => wildcard
      ? false
      : !connect.some(src => src.includes(h)))
    expect(missing).toEqual([])
  })

  it('permits the PLAINTEXT local daemons, which `https:` does not cover', () => {
    // This is the hole the wildcard above hides. `https:` matches every https
    // origin and nothing else, so an http:// provider passed that check
    // vacuously — and Ollama, which serves plain HTTP on the loopback, was
    // blocked by the app's own CSP on every request. A CSP refusal cannot be
    // caught or reported by the page, so it surfaced as a bare "Failed to
    // fetch" and read as a dead daemon on a machine where Ollama was running.
    //
    // Checked explicitly rather than by relaxing the directive to `http:`:
    // naming the two loopback ports keeps the protection everywhere else.
    const connect = directive('connect-src') || []
    const plaintext = ['http://127.0.0.1:11434', 'http://localhost:11434']
    for (const origin of plaintext) {
      expect(connect, `${origin} must be reachable — Ollama is not https`).toContain(origin)
    }
  })

  it('keeps the directives that actually harden the page', () => {
    expect(directive('object-src')).toContain("'none'")
    expect(directive('base-uri')).toContain("'self'")
    // frame-ancestors cannot be delivered via <meta>, so it is enforced via firebase.json HTTP header
    const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'firebase.json'), 'utf8'))
    const allHeaders = firebaseJson.hosting?.headers?.flatMap((h) => h.headers || []) || []
    const headerCsp = allHeaders.find((h) => h.key.includes('Content-Security-Policy'))?.value
    expect(headerCsp).toContain("frame-ancestors 'none'")
  })
})
