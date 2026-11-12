/**
 * Content Security Policy definitions and utilities.
 * Used by Electron main process and Vite dev server.
 */

// Base CSP for the app (local files, localhost dev server, custom schemas)
export const APP_CSP = [
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
].join('; ')

// CSP for external web content (browser tool windows, etc.)
export const EXTERNAL_CSP = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "font-src * data:",
  "connect-src *",
  "frame-src *",
  "frame-ancestors *"
].join('; ')

/**
 * Apply CSP headers to an Electron BrowserWindow's session.
 * Only enforces on app origins (file:, http://localhost, http://127.0.0.1, yogatik:).
 */
export function applyCSP(win) {
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
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
        'Content-Security-Policy': [APP_CSP]
      }
    })
  })
}

/**
 * Get CSP string for Vite dev server middleware.
 */
export function getCSPHeader() {
  return APP_CSP
}

export default {
  APP_CSP,
  EXTERNAL_CSP,
  applyCSP,
  getCSPHeader,
}
