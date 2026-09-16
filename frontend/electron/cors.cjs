// Cross-origin access for the file://-origin renderer.
//
// Two jobs, ONE pair of webRequest listeners. Electron keeps only the LAST
// listener registered per event, so registering a second pair would silently
// clobber the first — everything is handled in one handler that branches on URL.
//
//   1. LLM providers  — permissive CORS; Authorization is preserved because
//                       those calls need the user's API key.
//   2. Everything else — permissive CORS so the app can read ANY site directly
//                       (web_extract, deep_research, market data …) instead of
//                       bouncing through public relays that rate-limit, strip
//                       content, or hand back markdown.
//
// SAFETY: ambient cookies are stripped from that general web traffic. A blanket
// CORS bypass makes every cross-origin response readable by the renderer, and
// the renderer is influenced by model output — so if those requests carried the
// session's cookies, a logged-in page could be read as the user and handed to
// the model. Providers keep Authorization; first-party hosts (Firebase/Google
// auth) are left untouched; all other web reads are anonymous.

const { session } = require('electron')

const PROVIDER_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1):(11434|1234)\b/,      // Ollama, LM Studio
  /^https:\/\/integrate\.api\.nvidia\.com\//,
  /^https:\/\/api\.anthropic\.com\//,
  /^https:\/\/api\.groq\.com\//,
  /^https:\/\/openrouter\.ai\//,
  /^https:\/\/api\.openai\.com\//,
  /^https:\/\/api\.deepseek\.com\//,
  /^https:\/\/api\.x\.ai\//,
  /^https:\/\/api\.mistral\.ai\//,
  /^https:\/\/generativelanguage\.googleapis\.com\//,
]

// First-party hosts whose cookies are legitimately ours — auth must keep working.
// The subdomain group is (?:[^/]*\.)? — optional, but if present it must end in
// a real dot. Writing it as [^/]*\.? instead let "notfirebaseapp.com" match,
// which would have sent the user's session cookies to a lookalike domain.
const FIRST_PARTY = [
  /^https:\/\/(?:[^/]*\.)?firebaseapp\.com\//,
  /^https:\/\/(?:[^/]*\.)?googleapis\.com\//,
  /^https:\/\/(?:[^/]*\.)?firebaseio\.com\//,
  /^https:\/\/(?:[^/]*\.)?web\.app\//,
  /^https:\/\/(?:[^/]*\.)?firebase\.com\//,
  /^https:\/\/accounts\.google\.com\//,
  /^https:\/\/securetoken\.googleapis\.com\//,
  /^https:\/\/identitytoolkit\.googleapis\.com\//,
]

// Studio docks and interactive browser auth (Grok, Gemini, xAI, Google, X/Twitter, YouTube, streaming).
// Cookies and credentials must persist across sessions so the user stays logged in and media streams play.
const STUDIO_AUTH_PATTERNS = [
  /^https:\/\/(?:[^/]*\.)?grok\.com\//,
  /^https:\/\/(?:[^/]*\.)?x\.ai\//,
  /^https:\/\/(?:[^/]*\.)?x\.com\//,
  /^https:\/\/(?:[^/]*\.)?twitter\.com\//,
  /^https:\/\/(?:[^/]*\.)?google\.com\//,
  /^https:\/\/(?:[^/]*\.)?googleusercontent\.com\//,
  /^https:\/\/(?:[^/]*\.)?gstatic\.com\//,
  /^https:\/\/(?:[^/]*\.)?youtube\.com\//,
  /^https:\/\/(?:[^/]*\.)?googlevideo\.com\//,
  /^https:\/\/(?:[^/]*\.)?ytimg\.com\//,
  /^https:\/\/(?:[^/]*\.)?vimeo\.com\//,
  /^https:\/\/(?:[^/]*\.)?dailymotion\.com\//,
  /^https:\/\/(?:[^/]*\.)?twitch\.tv\//,
]

const ALL_URLS = { urls: ['http://*/*', 'https://*/*'] }
const LOCALHOST_ORIGIN = /:(11434|1234)\b/

const isProvider = (url) => PROVIDER_PATTERNS.some(re => re.test(url))
const isFirstParty = (url) => FIRST_PARTY.some(re => re.test(url))
const isStudioAuth = (url) => STUDIO_AUTH_PATTERNS.some(re => re.test(url))

/**
 * Distinguishes user-facing web browsing (Yogatik Browser, media streaming, web apps)
 * from headless AI tool fetches originating from the file:// app renderer.
 */
function isInteractive(details) {
  const url = details.url || ''
  // 1. Navigation requests
  if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') return true
  // 2. Video and audio media streaming (YouTube MSE chunks, MP4/WebM, audio)
  if (details.resourceType === 'media') return true
  // 3. Known interactive services (YouTube, Grok, Google, X, Vimeo, etc.)
  if (isStudioAuth(url) || isFirstParty(url)) return true
  // 4. Any subresource fetch or XHR initiated by a genuine web origin (https:// / http://)
  if (details.initiator && /^https?:/i.test(details.initiator)) return true
  return false
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

function enableProviderCors() {
  const wr = session.defaultSession.webRequest

  wr.onHeadersReceived(ALL_URLS, (details, cb) => {
    // Interactive user browsing in Yogatik Browser and Studio Docks must receive genuine
    // server headers without CORS mutations or stripping of Set-Cookie / Credentials.
    if (isInteractive(details)) {
      cb({ responseHeaders: details.responseHeaders })
      return
    }

    const headers = details.responseHeaders || {}
    headers['Access-Control-Allow-Origin'] = ['*']
    headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, PATCH, OPTIONS']
    headers['Access-Control-Allow-Headers'] = ['*, Authorization, Content-Type']
    headers['Access-Control-Expose-Headers'] = ['*, Retry-After, Content-Length, Content-Type']
    // Wildcard origin and credentials are mutually exclusive per spec; drop the
    // credentials flag rather than have the browser reject the whole response.
    delete headers['Access-Control-Allow-Credentials']
    delete headers['access-control-allow-credentials']

    cb({
      responseHeaders: headers,
      statusLine: details.method === 'OPTIONS' ? 'HTTP/1.1 200 OK' : details.statusLine,
    })
  })

  wr.onBeforeSendHeaders(ALL_URLS, (details, cb) => {
    const h = details.requestHeaders
    const url = details.url || ''

    // Use a genuine, modern Chrome User-Agent across requests so Google and xAI
    // do not flag the session as an insecure embedded webview.
    if (!h['User-Agent'] || /Electron|Yogatik/i.test(h['User-Agent'])) {
      h['User-Agent'] = BROWSER_UA
    }

    if (LOCALHOST_ORIGIN.test(url)) {
      try {
        const u = new URL(url)
        h['Origin'] = `${u.protocol}//${u.host}`
      } catch {
        h['Origin'] = 'http://127.0.0.1:11434'
      }
    } else if (isInteractive(details) || isProvider(url)) {
      // Interactive user browsing, OAuth flows, and media streams MUST keep cookies and credentials intact
    } else {
      // General web read via tool (web_extract, scrapling, etc.): go anonymously.
      delete h['Cookie']
      delete h['cookie']
      // A file:// Origin makes some servers refuse outright; omitting it makes
      // the request look like an ordinary top-level fetch.
      delete h['Origin']
    }
    cb({ requestHeaders: h })
  })
}

module.exports = {
  enableProviderCors, isProvider, isFirstParty, isStudioAuth,
  PROVIDER_PATTERNS, FIRST_PARTY, STUDIO_AUTH_PATTERNS, BROWSER_UA,
}
