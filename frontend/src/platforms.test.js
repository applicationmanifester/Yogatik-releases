/**
 * /platforms advertises Windows, macOS and Linux, but macOS and Linux cannot be
 * cross-compiled — they exist only once CI publishes them. A static link for a
 * build that isn't there hands the visitor a 404, which is the precise failure
 * this page exists to prevent.
 *
 * So the cards are driven by the release's real asset list. This exercises the
 * shipped public/platforms.html against stubbed releases, because the branch
 * that matters (an asset appearing later) cannot be triggered by looking at it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import PAGE_SRC from '../public/platforms.html?raw'

function card(id) {
  const el = document.getElementById(id)
  return {
    label: el.textContent.trim(),
    href: el.getAttribute('href'),
    pending: el.classList.contains('dl-unavailable'),
    note: el.parentNode.querySelector('.note')?.textContent.trim() || '',
  }
}

/** Load the page and run its inline scripts with a stubbed release. */
async function render(assetNames, { failApi = false, tag = 'v3.9.1', publishedAt = '2026-08-17T18:00:00Z' } = {}) {
  document.documentElement.innerHTML = PAGE_SRC
    .replace(/<!doctype html>/i, '')
    .replace(/<\/?html[^>]*>/gi, '')

  global.fetch = vi.fn(() => failApi
    ? Promise.reject(new TypeError('Failed to fetch'))
    : Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        tag_name: tag,
        published_at: publishedAt,
        assets: assetNames.map(name => ({ name, size: /\.exe$/.test(name) ? 120874971 : 1024 })),
      }),
    }))

  // jsdom does not execute scripts injected via innerHTML; run them by hand.
  for (const tag of document.querySelectorAll('script')) {
    try { new Function(tag.textContent)() } catch { /* unrelated page script */ }
  }
  await new Promise(r => setTimeout(r, 0))
  await new Promise(r => setTimeout(r, 0))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('/platforms reflects what the release actually contains', () => {
  it('today: Windows only — mac and Linux stay pending, not 404 links', async () => {
    await render(['Yogatik-Setup.exe', 'latest.yml'])
    expect(card('win-dl').pending).toBe(false)
    expect(card('win-dl').href).toContain('Yogatik-Setup.exe')
    expect(card('mac-dl').pending).toBe(true)
    expect(card('mac-dl').href).toBeNull()
    expect(card('linux-dl').pending).toBe(true)
  })

  it('promotes mac and Linux once their assets exist — no edit to the page', async () => {
    await render(['Yogatik-Setup.exe', 'Yogatik.dmg', 'Yogatik.AppImage', 'Yogatik.deb'])
    expect(card('mac-dl').pending).toBe(false)
    expect(card('mac-dl').href).toContain('Yogatik.dmg')
    expect(card('mac-dl').label).toBe('Download for macOS')
    // The real instructions come back too, not just the link.
    expect(card('mac-dl').note).toMatch(/right-click/i)
    expect(card('linux-dl').pending).toBe(false)
    expect(card('linux-dl').label).toBe('Download for Linux')
  })

  it('accepts either Linux artefact', async () => {
    await render(['Yogatik-Setup.exe', 'Yogatik.deb'])
    expect(card('linux-dl').pending).toBe(false)
  })

  it('withdraws Windows if its asset disappears (pulled or retagged release)', async () => {
    await render(['Yogatik.dmg'])
    expect(card('win-dl').pending).toBe(true)
    expect(card('win-dl').href).toBeNull()
  })

  it('fails SAFE when the API cannot be reached', async () => {
    // Offline, or GitHub's 60/hr anonymous limit on a public page. Cards must
    // fall back to the truth: Windows live, the unbuilt ones still pending.
    await render([], { failApi: true })
    expect(card('win-dl').pending).toBe(false)
    expect(card('mac-dl').pending).toBe(true)
    expect(card('linux-dl').pending).toBe(true)
  })

  it('does not auto-download when the installer is absent', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Windows NT 10.0', configurable: true })
    await render(['Yogatik.dmg'])
    expect(localStorage.getItem('yogatik_autodl')).toBeNull()
  })
})

describe('/platforms shows the version it is actually serving', () => {
  const meta = () => document.getElementById('release-meta')

  it('shows the release tag and installer size', async () => {
    await render(['Yogatik-Setup.exe'])
    expect(meta().hidden).toBe(false)
    expect(meta().textContent).toMatch(/Version\s*v3\.9\.1/)
    expect(meta().textContent).toMatch(/115 MB/)   // 120874971 bytes
  })

  it('tracks whatever the release says, rather than a hardcoded number', async () => {
    await render(['Yogatik-Setup.exe'], { tag: 'v4.2.0' })
    expect(meta().textContent).toMatch(/v4\.2\.0/)
  })

  it('stays hidden when the release cannot be read', async () => {
    // A wrong or stale version is worse than none on a download page.
    await render([], { failApi: true })
    expect(meta().hidden).toBe(true)
  })

  it('omits the date rather than printing an invalid one', async () => {
    await render(['Yogatik-Setup.exe'], { publishedAt: null })
    expect(meta().hidden).toBe(false)
    expect(meta().textContent).toMatch(/v3\.9\.1/)
    expect(meta().textContent).not.toMatch(/Invalid|NaN/)
  })
})
