// electron/security.cjs
// Content Security Policy for Electron main process and Vite dev server

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://api.openai.com https://api.groq.com https://openrouter.ai https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://api.anthropic.com https://api.elevenlabs.io https://api.github.com https://raw.githubusercontent.com https://integrate.api.nvidia.com https://api.deepseek.com https://api.mistral.ai https://api.together.xyz https://api.x.ai https://api.perplexity.ai https://api.cohere.com https://api.tokenrouter.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function applyCSP(win) {
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    });
  });
}

module.exports = { applyCSP, CSP };