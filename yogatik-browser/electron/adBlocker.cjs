// Built-in Brave-style ad and tracker blocker for Yogatik Browser and Electron views.
//
// Blocks requests to known ad exchanges, telemetry, tracker servers, and video ad streams
// at the network level (webRequest.onBeforeRequest), plus injects cosmetic ad-hiding CSS
// and an automatic YouTube video ad fast-forwarder/skipper into browser tabs.

const { session } = require('electron')

// Ad & Tracker filter patterns
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

  // 3. Domain level matching
  for (const re of AD_PATTERNS) {
    if (re.test(hostname)) {
      return true
    }
  }

  return false
}

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
let blockedCount = 0

function isAdShieldEnabled() {
  return adShieldEnabled
}

function setAdShieldEnabled(enabled) {
  adShieldEnabled = !!enabled
  return adShieldEnabled
}

function getAdShieldStats() {
  return {
    enabled: adShieldEnabled,
    blockedCount,
  }
}

/**
 * Register network-level ad blocking on the default Electron session.
 */
function enableAdBlocker(ses = session.defaultSession) {
  if (!ses?.webRequest) return
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    if (adShieldEnabled && shouldBlockUrl(details.url)) {
      blockedCount++
      cb({ cancel: true })
      return
    }
    cb({ cancel: false })
  })
}

/**
 * Inject cosmetic ad blocker styles and YouTube auto-skipper into a WebContents tab.
 */
function injectAdShield(wc) {
  if (!wc || typeof wc.on !== 'function') return
  wc.on('did-finish-load', () => {
    if (wc.isDestroyed() || !adShieldEnabled) return
    wc.insertCSS(COSMETIC_AD_CSS).catch(() => {})
    const url = wc.getURL() || ''
    if (url.includes('youtube.com')) {
      wc.executeJavaScript(YOUTUBE_AD_SKIP_SCRIPT).catch(() => {})
    }
  })
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
