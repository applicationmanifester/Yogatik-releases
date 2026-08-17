// Strip CORS for LLM provider hosts so the file://-origin renderer can call them
// directly — the native-desktop model (no browser proxy). Scoped to known API
// hosts only, so first-party requests (Firebase, etc.) are untouched.

const { session } = require('electron')

const PROVIDER_FILTER = {
  urls: [
    'http://localhost:11434/*', 'http://127.0.0.1:11434/*',   // Ollama
    'http://localhost:1234/*', 'http://127.0.0.1:1234/*',     // LM Studio
    'https://integrate.api.nvidia.com/*',                      // NVIDIA
    'https://api.anthropic.com/*',                             // Anthropic Claude
    'https://api.groq.com/*',
    'https://openrouter.ai/*',
    'https://api.openai.com/*',
    'https://api.deepseek.com/*',                              // DeepSeek
    'https://api.x.ai/*',                                      // xAI Grok
    'https://api.mistral.ai/*',                                // Mistral AI
    'https://generativelanguage.googleapis.com/*',
  ],
}
const LOCALHOST_ORIGIN = /:(11434|1234)\b/

function enableProviderCors() {
  const wr = session.defaultSession.webRequest
  wr.onHeadersReceived(PROVIDER_FILTER, (details, cb) => {
    const headers = details.responseHeaders || {}
    headers['Access-Control-Allow-Origin'] = ['*']
    headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS']
    headers['Access-Control-Allow-Headers'] = ['*, Authorization, Content-Type']
    headers['Access-Control-Expose-Headers'] = ['*, Retry-After']
    const isPreflight = details.method === 'OPTIONS'
    cb({
      responseHeaders: headers,
      statusLine: isPreflight ? 'HTTP/1.1 200 OK' : details.statusLine,
    })
  })
  wr.onBeforeSendHeaders(PROVIDER_FILTER, (details, cb) => {
    if (LOCALHOST_ORIGIN.test(details.url)) {
      details.requestHeaders['Origin'] = 'http://localhost:11434'
    }
    cb({ requestHeaders: details.requestHeaders })
  })
}

module.exports = { enableProviderCors }
