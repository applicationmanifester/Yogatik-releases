import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldBlockUrl, COSMETIC_AD_CSS, YOUTUBE_AD_SKIP_SCRIPT } = require('../electron/adBlocker.cjs')

describe('Brave-style Ad & Tracker Blocker (adBlocker.cjs)', () => {
  it('blocks known ad network URLs', () => {
    expect(shouldBlockUrl('https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123')).toBe(true)
    expect(shouldBlockUrl('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')).toBe(true)
    expect(shouldBlockUrl('https://securepubads.g.doubleclick.net/gampad/ads?correlator=123')).toBe(true)
    expect(shouldBlockUrl('https://adservice.google.com/adsid/integrator.js')).toBe(true)
    expect(shouldBlockUrl('https://static.criteo.net/js/ld/ld.js')).toBe(true)
    expect(shouldBlockUrl('https://widgets.outbrain.com/outbrain.js')).toBe(true)
    expect(shouldBlockUrl('https://ib.adnxs.com/seg?add=1')).toBe(true)
    expect(shouldBlockUrl('https://aax.amazon-adsystem.com/e/dtb/bid')).toBe(true)
  })

  it('blocks tracking and telemetry services', () => {
    expect(shouldBlockUrl('https://www.google-analytics.com/analytics.js')).toBe(true)
    expect(shouldBlockUrl('https://static.hotjar.com/c/hotjar-123.js')).toBe(true)
    expect(shouldBlockUrl('https://www.clarity.ms/tag/abc')).toBe(true)
    expect(shouldBlockUrl('https://sb.scorecardresearch.com/beacon.js')).toBe(true)
  })

  it('blocks YouTube ad endpoints and ad video playback streams', () => {
    expect(shouldBlockUrl('https://www.youtube.com/pagead/parallel_ad_playback')).toBe(true)
    expect(shouldBlockUrl('https://www.youtube.com/api/stats/ads?v=xyz&ad_type=1')).toBe(true)
    expect(shouldBlockUrl('https://www.youtube.com/get_midroll_info?v=xyz')).toBe(true)
    expect(shouldBlockUrl('https://www.youtube.com/ptracking?v=xyz')).toBe(true)
    expect(shouldBlockUrl('https://rr2---sn-4g5ednks.googlevideo.com/videoplayback?expire=123&adformat=1_2&sparams=expire')).toBe(true)
    expect(shouldBlockUrl('https://rr1---sn-4g5ednks.googlevideo.com/videoplayback?ctier=A&sparams=ctier')).toBe(true)
  })

  it('allows legitimate web pages, searches, and normal YouTube video streams', () => {
    expect(shouldBlockUrl('https://www.youtube.com/watch?v=7JmNVO3LLEk')).toBe(false)
    expect(shouldBlockUrl('https://rr2---sn-4g5ednks.googlevideo.com/videoplayback?expire=123&id=456&sparams=expire')).toBe(false)
    expect(shouldBlockUrl('https://www.google.com/search?q=bali+street+food')).toBe(false)
    expect(shouldBlockUrl('https://en.wikipedia.org/wiki/Main_Page')).toBe(false)
    expect(shouldBlockUrl('https://github.com/trending')).toBe(false)
    expect(shouldBlockUrl('https://vimeo.com/123456')).toBe(false)
    expect(shouldBlockUrl('')).toBe(false)
    expect(shouldBlockUrl(null)).toBe(false)
  })

  it('provides cosmetic CSS hiding ad slots and YouTube overlays', () => {
    expect(COSMETIC_AD_CSS).toContain('ytd-ad-slot-renderer')
    expect(COSMETIC_AD_CSS).toContain('.video-ads')
    expect(COSMETIC_AD_CSS).toContain('.ytp-ad-module')
    expect(COSMETIC_AD_CSS).toContain('ins.adsbygoogle')
    expect(COSMETIC_AD_CSS).toContain('display: none !important')
  })

  it('provides YouTube ad skip & fast-forward script', () => {
    expect(YOUTUBE_AD_SKIP_SCRIPT).toContain('.ytp-ad-skip-button')
    expect(YOUTUBE_AD_SKIP_SCRIPT).toContain('ad-showing')
    expect(YOUTUBE_AD_SKIP_SCRIPT).toContain('video.playbackRate = 16.0')
  })
})
