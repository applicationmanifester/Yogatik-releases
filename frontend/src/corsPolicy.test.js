import { describe, it, expect } from 'vitest'
import { isProvider, isFirstParty, isStudioAuth, PROVIDER_PATTERNS, FIRST_PARTY, STUDIO_AUTH_PATTERNS } from '../electron/cors.cjs'
import worker, {
  isHostAllowed,
  canReceiveCredentials,
  resetRateLimits,
  RATE_LIMIT_MAX_REQUESTS,
} from '../../cors-proxy/worker.js'

describe('CORS policy classification', () => {
  it('recognises every LLM provider host', () => {
    for (const u of [
      'https://api.openai.com/v1/chat/completions',
      'https://api.anthropic.com/v1/messages',
      'https://integrate.api.nvidia.com/v1/models',
      'https://api.groq.com/openai/v1/chat',
      'http://localhost:11434/v1/models',
      'http://127.0.0.1:1234/v1/models',
    ]) expect(isProvider(u)).toBe(true)
  })

  it('does not treat an arbitrary site as a provider', () => {
    for (const u of ['https://example.com/', 'https://news.ycombinator.com/', 'https://en.wikipedia.org/wiki/X']) {
      expect(isProvider(u)).toBe(false)
    }
  })

  // Auth must keep working: these are OUR hosts and their cookies are ours.
  it('recognises first-party auth hosts', () => {
    for (const u of [
      'https://yogatik.firebaseapp.com/__/auth/handler',
      'https://identitytoolkit.googleapis.com/v1/accounts',
      'https://securetoken.googleapis.com/v1/token',
      'https://accounts.google.com/o/oauth2/auth',
      'https://yogatik.web.app/',
    ]) expect(isFirstParty(u)).toBe(true)
  })

  // The security property: a general web read is neither provider nor
  // first-party, so cors.cjs strips its cookies. If a random site were ever
  // classified first-party, it would be fetched with the user's session.
  it('an arbitrary site is NEITHER provider nor first-party, so it is fetched anonymously', () => {
    for (const u of ['https://evil.example/steal', 'https://mail.google.com.attacker.net/', 'http://192.168.1.1/admin']) {
      expect(isProvider(u)).toBe(false)
      expect(isFirstParty(u)).toBe(false)
    }
  })

  it('a lookalike domain does not pass as first-party', () => {
    expect(isFirstParty('https://firebaseapp.com.evil.net/')).toBe(false)
    expect(isFirstParty('https://notfirebaseapp.com/')).toBe(false)
  })

  it('recognises studio auth and interactive login hosts for Grok and Gemini', () => {
    for (const u of [
      'https://grok.com/',
      'https://accounts.x.ai/login',
      'https://x.ai/api',
      'https://gemini.google.com/app',
      'https://x.com/login',
      'https://twitter.com/oauth',
    ]) expect(isStudioAuth(u)).toBe(true)
  })

  it('patterns are anchored, not substring matches', () => {
    expect(PROVIDER_PATTERNS.every(re => re.source.startsWith('^'))).toBe(true)
    expect(FIRST_PARTY.every(re => re.source.startsWith('^'))).toBe(true)
    expect(STUDIO_AUTH_PATTERNS.every(re => re.source.startsWith('^'))).toBe(true)
  })
})

/**
 * cors-proxy/worker.js — the web-build equivalent of the Electron guards
 * above. Vetted provider-host allowlist, Authorization stripping for
 * non-credential hosts, per-origin rate limiting, and target logging.
 */
describe('CORS proxy worker hardening', () => {
  it('blocks hosts outside the vetted allowlist with 403', async () => {
    resetRateLimits()
    const req = new Request('https://proxy.test/?target=https://evil.example/steal', {
      headers: { origin: 'https://yogatik.web.app' },
    })
    const res = await worker.fetch(req, {})
    expect(res.status).toBe(403)
  })

  it('strips Authorization for allowlisted-but-not-credentialed hosts, keeps it for credentialed ones', async () => {
    resetRateLimits()
    expect(isHostAllowed('api.openai.com')).toBe(true)
    expect(isHostAllowed('evil.example')).toBe(false)
    expect(canReceiveCredentials('api.openai.com')).toBe(true)
    // api.github.com proxies file reads but must never receive the user's key.
    expect(isHostAllowed('api.github.com')).toBe(true)
    expect(canReceiveCredentials('api.github.com')).toBe(false)

    const seen = {}
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      seen.url = String(url)
      seen.auth = new Headers(init?.headers).get('authorization')
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    try {
      const anon = new Request('https://proxy.test/?target=https://api.github.com/repos/x', {
        headers: { origin: 'https://yogatik.web.app', authorization: 'Bearer SECRET' },
      })
      const r1 = await worker.fetch(anon, {})
      expect(r1.status).toBe(200)
      expect(seen.auth).toBeNull()

      const cred = new Request('https://proxy.test/?target=https://api.openai.com/v1/models', {
        headers: { origin: 'https://yogatik.web.app', authorization: 'Bearer SECRET' },
      })
      const r2 = await worker.fetch(cred, {})
      expect(r2.status).toBe(200)
      expect(seen.auth).toBe('Bearer SECRET')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('rate-limits a single origin and logs each target', async () => {
    resetRateLimits()
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('{}', { status: 200 })
    const logs = []
    const origLog = console.log
    console.log = (...a) => { logs.push(a.join(' ')) }
    try {
      const mk = () => new Request('https://proxy.test/?target=https://api.openai.com/v1/models', {
        headers: { origin: 'https://rate-limit-probe.test' },
      })
      let last = null
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) last = await worker.fetch(mk(), {})
      expect(last.status).toBe(429)
      expect(logs.some(l => l.includes('api.openai.com'))).toBe(true)
    } finally {
      console.log = origLog
      globalThis.fetch = origFetch
      resetRateLimits()
    }
  })
})

