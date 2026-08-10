import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retryImport } from './pwa'

const origLocation = globalThis.location

beforeEach(() => {
  sessionStorage.clear()
  // jsdom's location is read-only; swap it for the duration of the test.
  delete globalThis.location
  globalThis.location = { reload: vi.fn(), href: 'https://test/' }
})
afterEach(() => {
  globalThis.location = origLocation
})

describe('retryImport', () => {
  it('passes the module through when the import works', async () => {
    const load = vi.fn(async () => ({ default: 'ok' }))
    expect(await retryImport(load)()).toEqual({ default: 'ok' })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries once — a flaky chunk fetch should not need a reload', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ default: 'ok' })
    expect(await retryImport(load)()).toEqual({ default: 'ok' })
    expect(load).toHaveBeenCalledTimes(2)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('reloads to pick up new chunk names when the chunk is really gone', async () => {
    const load = vi.fn(async () => { throw new Error('Failed to fetch dynamically imported module') })
    const pending = retryImport(load)()
    await Promise.race([pending, new Promise(r => setTimeout(r, 20))])
    expect(location.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload twice — a broken build must not become a reload loop', async () => {
    const load = vi.fn(async () => { throw new Error('gone') })
    sessionStorage.setItem('yogatik.chunkReload', '1')
    await expect(retryImport(load)()).rejects.toThrow('gone')
    expect(location.reload).not.toHaveBeenCalled()
  })
})
