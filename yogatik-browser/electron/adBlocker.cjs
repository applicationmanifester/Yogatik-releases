// Built-in Brave-style ad and tracker blocker for Yogatik Browser and Electron views.
// Now with EasyList support and configurable enabling.

const { session } = require('electron')
const https = require('https')
const { load: loadSettings, get: getSetting, set: setSetting } = require('./settings/store.cjs')

// Ad & Tracker filter patterns - will be loaded from EasyList
let AD_PATTERNS = []
let patternsLoaded = false
let loadingPatterns = false

// Hardcoded fallback patterns (current list)
const HARDCODED_PATTERNS = [
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

// Global cosmetic stylesheet hiding ad slots, banners, and overlays
const COSMETIC_AD_CSS = `
  /* YouTube Ads & Promoted Sections */
  .video-ads,
  .ytp-ad-module,
  .ytp-ad-overlay-container,
  .ytp-ad-image-overlay,
  .ytp-ad-text-overlay,
  ytd-ad-slot-renderer,
  ytd-promoted-sparkles-web-renderer,
  ytd-promoted-video-renderer,
  ytd-banner-promo-renderer,
  ytd-statement-banner-renderer,
  ytd-player-legacy-desktop-watch-ads-renderer,
  #masthead-ad,
  #player-ads,
  /* General Web Banner & Pop-up Ads */
  ins.adsbygoogle,
  div[id^="google_ads_"],
  div[id*="_ad_container"],
  .ad-banner,
  .advertisement {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
`

// Injected lightweight YouTube ad-skipper & fast-forwarder
const YOUTUBE_AD_SKIP_SCRIPT = `
(function() {
  if (window.__YOGATIK_SHIELD_ACTIVE__) return;
  window.__YOGATIK_SHIELD_ACTIVE__ = true;

  function skipYouTubeAds() {
    // 1. Click standard skip buttons immediately if rendered
    const skipBtns = document.querySelectorAll(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-overlay-close-button'
    );
    for (const b of skipBtns) {
      if (b && typeof b.click === 'function') b.click();
    }

    // 2. If a video ad is playing, fast-forward to end immediately and mute
    const player = document.querySelector('.html5-video-player');
    if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
      const video = player.querySelector('video');
      if (video) {
        video.muted = true;
        video.playbackRate = 16.0;
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
        }
      }
    }
  }

  setInterval(skipYouTubeAds, 200);
})();
`

let adShieldEnabled = true
let blockedCount = 0 // this session (drives the toolbar badge)
let lifetimeBlocked = 0 // cumulative, persisted across launches
let statsSaveTimer = null

// Cumulative blocked count persists in userData so the new-tab dashboard
// shows a real, growing number instead of resetting to a placeholder.
function statsFilePath() {
  try {
    return path.join(app.getPath('userData'), 'shield-stats.json')
  } catch { return null }
}

function loadLifetimeCount() {
  const p = statsFilePath()
  if (!p) return
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      lifetimeBlocked = Number(data.lifetimeBlocked) || 0
    }
  } catch {}
}

function persistLifetimeCount() {
  if (statsSaveTimer) clearTimeout(statsSaveTimer)
  statsSaveTimer = setTimeout(() => {
    const p = statsFilePath()
    if (!p) return
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, JSON.stringify({ lifetimeBlocked, updatedAt: Date.now() }))
    } catch {}
  }, 1000)
}

function isAdShieldEnabled() {
  // Override with setting if available
  const setting = getSetting('adBlockerEnabled')
  if (typeof setting === 'boolean') {
    return setting
  }
  return adShieldEnabled
}

function setAdShieldEnabled(enabled) {
  adShieldEnabled = !!enabled
  // Also persist to settings
  setSetting('adBlockerEnabled', adShieldEnabled)
  return adShieldEnabled
}

function getAdShieldStats() {
  return {
    enabled: isAdShieldEnabled(),
    blockedCount,
    lifetimeBlocked,
    patternsLoaded,
    loadingPatterns,
  }
}

/**
 * Parse EasyList text into an array of regex patterns for domain blocking.
 * We ignore rules with options (containing $) for simplicity.
 */
function parseEasyList(text) {
  const lines = text.split('\n')
  const patterns = []
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip comments, empty lines, and rules with options (like $script, $third-party)
    if (!trimmed || trimmed.startsWith('!') || trimmed.includes('$')) {
      continue
    }
    // Convert to regex: escape dots and convert wildcards
    // EasyList domains may have wildcards like * but we treat as .*
    // We'll anchor to start and end of hostname
    let regexStr = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex chars
    regexStr = regexStr.replace(/\\\*/g, '.*') // * -> .*
    // Ensure it matches a domain (either start of hostname or preceded by dot)
    // and end of hostname or followed by dot or end.
    // We'll use: (?:^|\.)regexStr(?:$|\.)
    // But note: we already escaped dots, so we need to handle the wildcards we introduced.
    // Actually, we want to match hostname exactly or subdomain.
    // We'll use: (?:^|\.)regexStr$
    // However, if regexStr ends with .* we don't want an extra dot.
    // Let's just match if hostname ends with regexStr or is exactly regexStr or has a dot before.
    // Simpler: check if hostname ends with the pattern (with optional leading dot).
    // We'll do string matching instead of regex for performance.
    // We'll push the trimmed string and use endsWith with a dot check.
    // But note: we already have a function shouldBlockUrl that uses regex.test(hostname).
    // We'll convert to regex that matches hostname ending with the pattern (with optional dot prefix).
    // We'll do: (?:^|\.)pattern$
    try {
      const regex = new RegExp(`(?:^|\\.)${regexStr}$`, 'i')
      patterns.push(regex)
    } catch (e) {
      // If regex invalid, skip
      console.warn(`Invalid EasyList rule: ${trimmed}`, e)
    }
  }
  return patterns
}

/**
 * Load EasyList from remote URL.
 * @returns {Promise<Array<RegExp>>}
 */
function loadEasyList() {
  return new Promise((resolve, reject) => {
    const url = 'https://easylist.to/easylist/easylist.txt'
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const patterns = parseEasyList(data)
          resolve({ patterns, text: data })
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', (err) => {
      reject(err)
    })
    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

// ── Bundled Filter List (offline-safe) ────────────────────────────────────
// A snapshot of EasyList ships inside the package (electron/assets/
// easylist.txt) so first-load-on-offline still blocks the whole list, not
// just the ~50 hardcoded fallback rules. The freshest copy the app ever
// fetched is cached in userData and preferred over the bundle.
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

function bundledListPath() {
  try {
    return path.join(__dirname, 'assets', 'easylist.txt')
  } catch {
    return null
  }
}

function cachedListPath() {
  try {
    return path.join(app.getPath('userData'), 'easylist-cache.txt')
  } catch {
    return null
  }
}

function readListFile(p) {
  if (!p) return null
  try {
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, 'utf-8')
      return text && text.length > 1000 ? text : null
    }
  } catch {}
  return null
}

/**
 * Initialize ad blocker patterns.
 * Called once at startup.
 */
async function initializePatterns() {
  if (patternsLoaded || loadingPatterns) return
  loadingPatterns = true
  try {
    // 1. Freshest cached copy (written by a previous successful refresh)
    // 2. Bundled snapshot (works fully offline, first run included)
    // 3. Hardcoded fallback (~50 core rules)
    let text = readListFile(cachedListPath()) || readListFile(bundledListPath())
    if (text) {
      const patterns = parseEasyList(text)
      if (patterns.length > 0) {
        AD_PATTERNS = patterns
        patternsLoaded = true
        loadingPatterns = false
        console.log(`Loaded ${patterns.length} filter rules from local list`)
        // Refresh from the network in the background; a newer list is cached
        // for next launch (never blocks startup).
        loadEasyList().then(({ text: fresh }) => {
          if (!fresh) return
          AD_PATTERNS = parseEasyList(fresh)
          const cache = cachedListPath()
          if (cache) {
            try { fs.writeFileSync(cache, fresh) } catch {}
          }
          console.log(`Refreshed ${AD_PATTERNS.length} filter rules from network`)
        }).catch(() => {})
        return
      }
    }
    throw new Error('No local list available')
  } catch (err) {
    console.warn('No local/bundled list, trying network fetch:', err.message)
    try {
      const { patterns, text } = await loadEasyList()
      if (patterns && patterns.length > 0) {
        AD_PATTERNS = patterns
        const cache = cachedListPath()
        if (cache) {
          try { fs.writeFileSync(cache, text) } catch {}
        }
        console.log(`Loaded ${patterns.length} EasyList rules`)
      } else {
        throw new Error('No patterns loaded')
      }
    } catch (netErr) {
      console.warn('Failed to load EasyList, using hardcoded fallback:', netErr.message)
      AD_PATTERNS = HARDCODED_PATTERNS.slice() // copy
    }
  } finally {
    patternsLoaded = true
    loadingPatterns = false
  }
}

/**
 * Determine if a URL is an advertisement, tracking beacon, or video pre-roll stream.
 */
function shouldBlockUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  let urlObj
  try {
    urlObj = new URL(rawUrl)
  } catch {
    return false
  }

  const hostname = urlObj.hostname.toLowerCase()

  // 1. YouTube specific ad & tracking endpoints (pagead, stats/ads, midrolls, ptracking)
  // NOTE: We do NOT block /youtubei/v1/log_event because YouTube's Polymer client
  // halts initial feed hydration with an empty skeleton state if log_event is rejected.
  if (hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
    const p = urlObj.pathname.toLowerCase()
    if (
      p.startsWith('/pagead/') ||
      p.startsWith('/api/stats/ads') ||
      p.startsWith('/get_midroll_info') ||
      p.startsWith('/ptracking')
    ) {
      return true
    }
  }

  // 2. Video playback ads (adformat parameter or ctier=A in googlevideo; ctier=L is legitimate content)
  if (hostname.endsWith('.googlevideo.com') || hostname === 'googlevideo.com') {
    if (urlObj.searchParams.has('adformat') || urlObj.searchParams.get('ctier') === 'A') {
      return true
    }
  }

  // 3. Domain level matching against patterns
  for (const re of AD_PATTERNS) {
    if (re.test(hostname)) {
      return true
    }
  }

  return false
}

/**
 * Register network-level ad blocking on the default Electron session.
 */
function enableAdBlocker(ses = session.defaultSession) {
  if (!ses?.webRequest) return
  // Ensure patterns are loaded
  if (!patternsLoaded) {
    initializePatterns().catch(() => {})
  }
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    if (isAdShieldEnabled() && shouldBlockUrl(details.url)) {
      blockedCount++
      lifetimeBlocked++
      persistLifetimeCount()
      cb({ cancel: true })
      return
    }
    cb({ cancel: false })
  })
}

/**
 * Inject cosmetic ad blocker styles and YouTube auto-skipper into a WebContents tab.
 * On new-tab pages, also pushes the REAL AdShield counters so the privacy
 * dashboard shows live data instead of a hardcoded placeholder.
 */
function injectAdShield(wc) {
  if (!wc || typeof wc.on !== 'function') return
  wc.on('did-finish-load', () => {
    if (wc.isDestroyed() || !isAdShieldEnabled()) return
    wc.insertCSS(COSMETIC_AD_CSS).catch(() => {})
    const url = wc.getURL() || ''
    if (url.includes('youtube.com')) {
      wc.executeJavaScript(YOUTUBE_AD_SKIP_SCRIPT).catch(() => {})
    }
    // New tab: replace the fake "Trackers Blocked" placeholder with the REAL
    // cumulative counter (persisted across launches, grows with use).
    if (url.includes('newtab.html')) {
      const stats = getAdShieldStats()
      wc.executeJavaScript(`window.__setShieldStats && window.__setShieldStats(${JSON.stringify({
        blockedCount: stats.blockedCount,
        lifetimeBlocked: stats.lifetimeBlocked,
        rulesLoaded: stats.patternsLoaded,
        enabled: stats.enabled,
      })})`).catch(() => {})
    }
  })
}

// Initialize patterns when module is loaded
initializePatterns().catch(console.error)
loadLifetimeCount()

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