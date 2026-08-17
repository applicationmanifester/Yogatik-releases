import { describe, it, expect } from 'vitest'
import { isProvider, isFirstParty, PROVIDER_PATTERNS, FIRST_PARTY } from '../electron/cors.cjs'

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

  it('patterns are anchored, not substring matches', () => {
    expect(PROVIDER_PATTERNS.every(re => re.source.startsWith('^'))).toBe(true)
    expect(FIRST_PARTY.every(re => re.source.startsWith('^'))).toBe(true)
  })
})
