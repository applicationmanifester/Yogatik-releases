// Built-in Brave-style ad and tracker blocker for Yogatik Browser and Electron views.
// REFACTORED: Added LRU cache for URL decisions, compiled patterns, and batched cosmetic injection.

const { session } = require('electron')

// Ad & Tracker filter patterns - compiled once at startup
const AD_PATTERNS = [
  // DoubleClick & Google Ads
  /(?:^|\.)doubleclick\.net$/i,
  /(?:^|\.)googleadservices\.com$/i,
  /(?:^|\.)googlesyndication\.com$/i,
  /(?:^|\.)adservice\.google\./i,
  /(?:^|\.)pagead2\.googlesyndication\.com$/i,
  /(?:^|\.)pubads\.g\.doubleclick\.net$/i,
  /(?:^|\.)securepubads\.g\.doubleclick\.net$/i,

  // Major Ad Networks & DSPs
  /(?:^|\.)adnxs\.com$/i,
  /(?:^|\.)adsafeprotected\.com$/i,
  /(?:^|\.)criteo\.(?:com|net)$/i,
  /(?:^|\.)outbrain\.com$/i,
  /(?:^|\.)taboola\.com$/i,
  /(?:^|\.)moatads\.com$/i,
  /(?:^|\.)rubiconproject\.com$/i,
  /(?:^|\.)openx\.net$/i,
  /(?:^|\.)adroll\.com$/i,
  /(?:^|\.)casalemedia\.com$/i,
  /(?:^|\.)advertising\.com$/i,
  /(?:^|\.)amazon-adsystem\.com$/i,
  /(?:^|\.)popads\.net$/i,
  /(?:^|\.)popcash\.net$/i,
  /(?:^|\.)zergnet\.com$/i,
  /(?:^|\.)trafficjunky\.com$/i,
  /(?:^|\.)revcontent\.com$/i,
  /(?:^|\.)adform\.net$/i,
  /(?:^|\.)adblade\.com$/i,
  /(?:^|\.)bidswitch\.net$/i,
  /(?:^|\.)smartadserver\.com$/i,
  /(?:^|\.)yieldmo\.com$/i,
  /(?:^|\.)adtechus\.com$/i,
  /(?:^|\.)serving-sys\.com$/i,
  /(?:^|\.)exponential\.com$/i,

  // Trackers & Analytics
  /(?:^|\.)google-analytics\.com$/i,
  /(?:^|\.)analytics\.google\.com$/i,
  /(?:^|\.)hotjar\.com$/i,
  /(?:^|\.)clarity\.ms$/i,
  /(?:^|\.)scorecardresearch\.com$/i,
  /(?:^|\.)quantserve\.com$/i,
]

// YouTube-specific ad paths
const YT_AD_PATHS = [
  '/pagead/',
  '/api/stats/ads',
  '/get_midroll_info',
  '/ptracking',
]

// LRU Cache for URL blocking decisions
class LRUCache {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get(key) {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    // Move to end (most recent)
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key)
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }

  clear() { this.cache.clear() }
}

const urlDecisionCache = new LRUCache(10000)
let adShieldEnabled = true
let blockedCount = 0

/** Determine if a URL should be blocked. */
function shouldBlockUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false

  // Check cache first
  const cached = urlDecisionCache.get(rawUrl)
  if (cached !== undefined) return cached

  let urlObj
  try {
    urlObj = new URL(rawUrl)
  } catch {
    urlDecisionCache.set(rawUrl, false)
    return false
  }

  const hostname = urlObj.hostname.toLowerCase()
  let blocked = false

  // 1. YouTube ad endpoints
  if (hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
    const pathname = urlObj.pathname.toLowerCase()
    blocked = YT_AD_PATHS.some(p => pathname.startsWith(p))
  }

  // 2. Video playback ads
  if (!blocked && (hostname.endsWith('.googlevideo.com') || hostname === 'googlevideo.com')) {
    blocked = urlObj.searchParams.has('adformat') || urlObj.searchParams.get('ctier') === 'A'
  }

  // 3. Domain-level patterns
  if (!blocked) {
    for (const re of AD_PATTERNS) {
      if (re.test(hostname)) {
        blocked = true
        break
      }
    }
  }

  // Cache decision
  urlDecisionCache.set(rawUrl, blocked)
  return blocked
}

function isAdShieldEnabled() {
  return adShieldEnabled
}

function setAdShieldEnabled(enabled) {
  adShieldEnabled = !!enabled
  return adShieldEnabled
}

function getAdShieldStats() {
  return { enabled: adShieldEnabled, blockedCount }
}

/** Register network-level ad blocking on an Electron session. */
function enableAdBlocker(ses = session.defaultSession) {
  if (!ses?.webRequest) return
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      if (!adShieldEnabled || !details.url.startsWith('http')) {
        callback({ cancel: false })
        return
      }
      if (shouldBlockUrl(details.url)) {
        blockedCount++
        callback({ cancel: true })
      } else {
        callback({ cancel: false })
      }
    }
  )
}

// Batch cosmetic injection queue per WebContents
const COSMETIC_INJECTION_QUEUE = new Map()

const COSMETIC_AD_CSS = `
  /* YouTube Ads & Promoted Sections */
  .video-ads, .ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-image-overlay, .ytp-ad-text-overlay,
  ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer,
  ytd-banner-promo-renderer, ytd-statement-banner-renderer, ytd-player-legacy-desktop-watch-ads-renderer,
  #masthead-ad, #player-ads,
  /* General Web Banner & Pop-up Ads */
  ins.adsbygoogle, div[id^="google_ads_"], div[id*="_ad_container"], .ad-banner, .advertisement {
    display: none !important; visibility: hidden !important; height: 0 !important;
    width: 0 !important; opacity: 0 !important; pointer-events: none !important;
  }
`

const YOUTUBE_AD_SKIP_SCRIPT = `(function() {
  if (window.__YOGATIK_SHIELD_ACTIVE__) return;
  window.__YOGATIK_SHIELD_ACTIVE__ = true;
  function skipYouTubeAds() {
    const skipBtns = document.querySelectorAll(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-overlay-close-button'
    );
    for (const b of skipBtns) if (b && typeof b.click === 'function') b.click();
    const player = document.querySelector('.html5-video-player');
    if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
      const video = player.querySelector('video');
      if (video) { video.muted = true; video.playbackRate = 16.0; if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration; }
    }
  }
  setInterval(skipYouTubeAds, 200);
})();`

/** Inject cosmetic ad blocker styles and YouTube auto-skipper into a WebContents tab. */
function injectAdShield(wc) {
  if (!wc || typeof wc.on !== 'function') return

  const wcId = wc.id
  if (COSMETIC_INJECTION_QUEUE.has(wcId)) return // Already queued

  const pending = new Set()
  COSMETIC_INJECTION_QUEUE.set(wcId, pending)

  const onLoad = async () => {
    if (wc.isDestroyed() || !adShieldEnabled) {
      COSMETIC_INJECTION_QUEUE.delete(wcId)
      return
    }
    try {
      await Promise.all([
        wc.insertCSS(COSMETIC_AD_CSS).catch(() => {}),
        wc.getURL().includes('youtube.com')
          ? wc.executeJavaScript(YOUTUBE_AD_SKIP_SCRIPT).catch(() => {})
          : Promise.resolve()
      ])
    } finally {
      COSMETIC_INJECTION_QUEUE.delete(wcId)
    }
  }

  wc.on('did-finish-load', onLoad)
  pending.add(onLoad)

  // Cleanup on destroy
  const onDestroyed = () => {
    COSMETIC_INJECTION_QUEUE.delete(wcId)
    wc.removeListener('destroyed', onDestroyed)
  }
  wc.on('destroyed', onDestroyed)
  pending.add(onDestroyed)
}

module.exports = {
  shouldBlockUrl,
  enableAdBlocker,
  injectAdShield,
  isAdShieldEnabled,
  setAdShieldEnabled,
  getAdShieldStats,
  AD_PATTERNS,
  COSMETIC_AD_CSS,
  YOUTUBE_AD_SKIP_SCRIPT,
}