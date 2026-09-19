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
  /(?:^|\\.)doubleclick\\.net$/i,
  /(?:^|\\.)googleadservices\\.com$/i,
  /(?:^|\\.)googlesyndication\\.com$/i,
  /(?:^|\\.)adservice\\.google\\./i,
  /(?:^|\\.)pagead2\\.googlesyndication\\.com$/i,
  /(?:^|\\.)pubads\\.g\\.doubleclick\\.net$/i,
  /(?:^|\\.)securepubads\\.g\\.doubleclick\\.net$/i,

  // Major Ad Networks & DSPs
  /(?:^|\\.)adnxs\\.com$/i,
  /(?:^|\\.)adsafeprotected\\.com$/i,
  /(?:^|\\.)criteo\\.(?:com|net)$/i,
  /(?:^|\\.)outbrain\\.com$/i,
  /(?:^|\\.)taboola\\.com$/i,
  /(?:^|\\.)moatads\\.com$/i,
  /(?:^|\\.)rubiconproject\\.com$/i,
  /(?:^|\\.)openx\\.net$/i,
  /(?:^|\\.)adroll\\.com$/i,
  /(?:^|\\.)casalemedia\\.com$/i,
  /(?:^|\\.)advertising\\.com$/i,
  /(?:^|\\.)amazon-adsystem\\.com$/i,
  /(?:^|\\.)popads\\.net$/i,
  /(?:^|\\.)popcash\\.net$/i,
  /(?:^|\\.)zergnet\\.com$/i,
  /(?:^|\\.)trafficjunky\\.com$/i,
  /(?:^|\\.)revcontent\\.com$/i,
  /(?:^|\\.)adform\\.net$/i,
  /(?:^|\\.)adblade\\.com$/i,
  /(?:^|\\.)bidswitch\\.net$/i,
  /(?:^|\\.)smartadserver\\.com$/i,
  /(?:^|\\.)yieldmo\\.com$/i,
  /(?:^|\\.)adtechus\\.com$/i,
  /(?:^|\\.)serving-sys\\.com$/i,
  /(?:^|\\.)exponential\\.com$/i,

  // Trackers & Analytics
  /(?:^|\\.)google-analytics\\.com$/i,
  /(?:^|\\.)analytics\\.google\\.com$/i,
  /(?:^|\\.)hotjar\\.com$/i,
  /(?:^|\\.)clarity\\.ms$/i,
  /(?:^|\\.)scorecardresearch\\.com$/i,
  /(?:^|\\.)quantserve\\.com$/i,
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
  div[id^=\"google_ads_\"],\n  div[id*=\"_ad_container\"],\n  .ad-banner,\n  .advertisement {\n    display: none !important;\n    visibility: hidden !important;\n    height: 0 !important;\n    width: 0 !important;\n    opacity: 0 !important;\n    pointer-events: none !important;\n  }\n`\n\n// Injected lightweight YouTube ad-skipper & fast-forwarder\nconst YOUTUBE_AD_SKIP_SCRIPT = `\n(function() {\n  if (window.__YOGATIK_SHIELD_ACTIVE__) return;\n  window.__YOGATIK_SHIELD_ACTIVE__ = true;\n\n  function skipYouTubeAds() {\n    // 1. Click standard skip buttons immediately if rendered\n    const skipBtns = document.querySelectorAll(\n      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-overlay-close-button'\n    );\n    for (const b of skipBtns) {\n      if (b && typeof b.click === 'function') b.click();\n    }\n\n    // 2. If a video ad is playing, fast-forward to end immediately and mute\n    const player = document.querySelector('.html5-video-player');\n    if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {\n      const video = player.querySelector('video');\n      if (video) {\n        video.muted = true;\n        video.playbackRate = 16.0;\n        if (Number.isFinite(video.duration) && video.duration > 0) {\n          video.currentTime = video.duration;\n        }\n      }\n    }\n  }\n\n  setInterval(skipYouTubeAds, 200);\n})();\n`\n\nlet adShieldEnabled = true\nlet blockedCount = 0\n\nfunction isAdShieldEnabled() {\n  // Override with setting if available\n  const setting = getSetting('adBlockerEnabled')\n  if (typeof setting === 'boolean') {\n    return setting\n  }\n  return adShieldEnabled\n}\n\nfunction setAdShieldEnabled(enabled) {\n  adShieldEnabled = !!enabled\n  // Also persist to settings\n  setSetting('adBlockerEnabled', adShieldEnabled)\n  return adShieldEnabled\n}\n\nfunction getAdShieldStats() {\n  return {\n    enabled: isAdShieldEnabled(),\n    blockedCount,\n    patternsLoaded,\n    loadingPatterns,\n  }\n}\n\n/**\n * Parse EasyList text into an array of regex patterns for domain blocking.\n * We ignore rules with options (containing $) for simplicity.\n */\nfunction parseEasyList(text) {\n  const lines = text.split('\\n')\n  const patterns = []\n  for (const line of lines) {\n    const trimmed = line.trim()\n    // Skip comments, empty lines, and rules with options (like $script, $third-party)\n    if (!trimmed || trimmed.startsWith('!') || trimmed.includes('$')) {\n      continue\n    }\n    // Convert to regex: escape dots and convert wildcards\n    // EasyList domains may have wildcards like * but we treat as .*\n    // We'll anchor to start and end of hostname\n    let regexStr = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex chars\n    regexStr = regexStr.replace(/\\\*/g, '.*') // * -> .*\n    // Ensure it matches a domain (either start of hostname or preceded by dot)\n    // and end of hostname or followed by dot or end.\n    // We'll use: (?:^|\\.)regexStr(?:$|\\.)\n    // But note: we already escaped dots, so we need to handle the wildcards we introduced.\n    // Actually, we want to match hostname exactly or subdomain.\n    // We'll use: (?:^|\\.)regexStr$\n    // However, if regexStr ends with .* we don't want an extra dot.\n    // Let's just match if hostname ends with regexStr or is exactly regexStr or has a dot before.\n    // Simpler: check if hostname ends with the pattern (with optional leading dot).\n    // We'll do string matching instead of regex for performance.\n    // We'll push the trimmed string and use endsWith with a dot check.\n    // But note: we already have a function shouldBlockUrl that uses regex.test(hostname).\n    // We'll convert to regex that matches hostname ending with the pattern (with optional dot prefix).\n    // We'll do: (?:^|\\.)pattern$\n    try {\n      const regex = new RegExp(`(?:^|\\.)${regexStr}$`, 'i')\n      patterns.push(regex)\n    } catch (e) {\n      // If regex invalid, skip\n      console.warn(`Invalid EasyList rule: ${trimmed}`, e)\n    }\n  }\n  return patterns\n}\n\n/**\n * Load EasyList from remote URL.\n * @returns {Promise<Array<RegExp>>}\n */\nfunction loadEasyList() {\n  return new Promise((resolve, reject) => {\n    const url = 'https://easylist.to/easylist/easylist.txt'\n    const req = https.get(url, (res) => {\n      let data = ''\n      res.on('data', (chunk) => {\n        data += chunk\n      })\n      res.on('end', () => {\n        try {\n          const patterns = parseEasyList(data)\n          resolve(patterns)\n        } catch (e) {\n          reject(e)\n        }\n      })\n    })\n    req.on('error', (err) => {\n      reject(err)\n    })\n    req.setTimeout(5000, () => {\n      req.destroy()\n      reject(new Error('Request timeout'))\n    })\n  })\n}\n\n/**\n * Initialize ad blocker patterns.\n * Called once at startup.\n */\nasync function initializePatterns() {\n  if (patternsLoaded || loadingPatterns) return\n  loadingPatterns = true\n  try {\n    const patterns = await loadEasyList()\n    if (patterns && patterns.length > 0) {\n      AD_PATTERNS = patterns\n      console.log(`Loaded ${patterns.length} EasyList rules`)\n    } else {\n      throw new Error('No patterns loaded')\n    }\n  } catch (err) {\n    console.warn('Failed to load EasyList, using hardcoded fallback:', err.message)\n    AD_PATTERNS = HARDCODED_PATTERNS.slice() // copy\n  } finally {\n    patternsLoaded = true\n    loadingPatterns = false\n  }\n}\n\n/**\n * Determine if a URL is an advertisement, tracking beacon, or video pre-roll stream.\n */\nfunction shouldBlockUrl(rawUrl) {\n  if (!rawUrl || typeof rawUrl !== 'string') return false\n  let urlObj\n  try {\n    urlObj = new URL(rawUrl)\n  } catch {\n    return false\n  }\n\n  const hostname = urlObj.hostname.toLowerCase()\n\n  // 1. YouTube specific ad & tracking endpoints (pagead, stats/ads, midrolls, ptracking)\n  // NOTE: We do NOT block /youtubei/v1/log_event because YouTube's Polymer client\n  // halts initial feed hydration with an empty skeleton state if log_event is rejected.\n  if (hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {\n    const p = urlObj.pathname.toLowerCase()\n    if (\n      p.startsWith('/pagead/') ||\n      p.startsWith('/api/stats/ads') ||\n      p.startsWith('/get_midroll_info') ||\n      p.startsWith('/ptracking')\n    ) {\n      return true\n    }\n  }\n\n  // 2. Video playback ads (adformat parameter or ctier=A in googlevideo; ctier=L is legitimate content)\n  if (hostname.endsWith('.googlevideo.com') || hostname === 'googlevideo.com') {\n    if (urlObj.searchParams.has('adformat') || urlObj.searchParams.get('ctier') === 'A') {\n      return true\n    }\n  }\n\n  // 3. Domain level matching against patterns\n  for (const re of AD_PATTERNS) {\n    if (re.test(hostname)) {\n      return true\n    }\n  }\n\n  return false\n}\n\n/**\n * Register network-level ad blocking on the default Electron session.\n */\nfunction enableAdBlocker(ses = session.defaultSession) {\n  if (!ses?.webRequest) return\n  // Ensure patterns are loaded\n  if (!patternsLoaded) {\n    initializePatterns().catch(() => {})\n  }\n  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {\n    if (isAdShieldEnabled() && shouldBlockUrl(details.url)) {\n      blockedCount++\n      cb({ cancel: true })\n      return\n    }\n    cb({ cancel: false })\n  })\n}\n\n/**\n * Inject cosmetic ad blocker styles and YouTube auto-skipper into a WebContents tab.\n */\nfunction injectAdShield(wc) {\n  if (!wc || typeof wc.on !== 'function') return\n  wc.on('did-finish-load', () => {\n    if (wc.isDestroyed() || !isAdShieldEnabled()) return\n    wc.insertCSS(COSMETIC_AD_CSS).catch(() => {})\n    const url = wc.getURL() || ''\n    if (url.includes('youtube.com')) {\n      wc.executeJavaScript(YOUTUBE_AD_SKIP_SCRIPT).catch(() => {})\n    }\n  })\n}\n\n// Initialize patterns when module is loaded\ninitializePatterns().catch(console.error)\n\nmodule.exports = {\n  shouldBlockUrl,\n  enableAdBlocker,\n  injectAdShield,\n  isAdShieldEnabled,\n  setAdShieldEnabled,\n  getAdShieldStats,\n  AD_PATTERNS,\n  COSMETIC_AD_CSS,\n  YOUTUBE_AD_SKIP_SCRIPT,\n}\n