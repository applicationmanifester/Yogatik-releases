// electron/security.cjs
// Content Security Policy for Electron main process and Vite dev server

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://apis.google.com https://*.gstatic.com https://esm.run https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' https: wss: blob: data: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function applyCSP(win) {
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Only enforce app CSP on internal app windows (local files, localhost/127.0.0.1 dev server, or custom schemas).
    // NEVER apply desktop app CSP to external internet browsing traffic (e.g. YouTube, Google, GitHub)!
    const isAppOrigin = details.url.startsWith('file:') ||
      details.url.startsWith('http://localhost') ||
      details.url.startsWith('http://127.0.0.1') ||
      details.url.startsWith('yogatik:')
    if (!isAppOrigin) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    });
  });
}

module.exports = { applyCSP, CSP };