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

const ALL_URLS = { urls: ['http://*/*', 'https://*/*'] }
const LOCALHOST_ORIGIN = /:(11434|1234)\b/

const isProvider = (url) => PROVIDER_PATTERNS.some(re => re.test(url))
const isFirstParty = (url) => FIRST_PARTY.some(re => re.test(url))

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function enableProviderCors() {
  const wr = session.defaultSession.webRequest

  wr.onHeadersReceived(ALL_URLS, (details, cb) => {
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

    if (LOCALHOST_ORIGIN.test(url)) {
      // Send an Origin the daemon ALREADY trusts, and derive it from the URL
      // rather than hardcoding one.
      //
      // Ollama's default allowlist is 127.0.0.1 and 0.0.0.0 — anything else
      // needs OLLAMA_ORIGINS set by the user, which a desktop app must not
      // require. This previously sent a fixed `http://localhost:11434`, so
      // when the request went to 127.0.0.1 the Origin named a DIFFERENT host
      // than the target, and on an Ollama build that does not allowlist
      // `localhost` the daemon answers 403. A 403 with no CORS headers reaches
      // the renderer as a bare network failure, which the app then reported as
      // "network or CORS proxy issue" — the same unhelpful sentence for a
      // rejected origin as for a daemon that is not running.
      //
      // Matching the origin to the target host means the request always looks
      // same-origin to the daemon, for both Ollama (11434) and LM Studio (1234).
      try {
        const u = new URL(url)
        h['Origin'] = `${u.protocol}//${u.host}`
      } catch {
        h['Origin'] = 'http://127.0.0.1:11434'
      }
    } else if (!isProvider(url) && !isFirstParty(url)) {
      // General web read: go anonymously. See the SAFETY note above.
      delete h['Cookie']
      delete h['cookie']
      // Many sites serve a bot page or 403 to an unknown UA; presenting a normal
      // browser UA is a large part of what makes "read any site" actually work.
      if (!h['User-Agent'] || /Electron|Yogatik/i.test(h['User-Agent'])) {
        h['User-Agent'] = BROWSER_UA
      }
      // A file:// Origin makes some servers refuse outright; omitting it makes
      // the request look like an ordinary top-level fetch.
      delete h['Origin']
    }
    cb({ requestHeaders: h })
  })
}

module.exports = {
  enableProviderCors, isProvider, isFirstParty,
  PROVIDER_PATTERNS, FIRST_PARTY, BROWSER_UA,
}
