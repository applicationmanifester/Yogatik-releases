// frontend/electron/httpsUpgrade.cjs
// ------------------------------------------------
// Very lightweight HTTPS‑upgrade logic for Electron.
// Rewrites *http:* URLs to *https:* before they are sent.
// ------------------------------------------------

const { session } = require('electron')

/**
 * Enable HTTP→HTTPS rewriting for a given Electron session.
 *
 * @param {Electron.Session} electronSession
 */
function enableHTTPSUpgrade(electronSession) {
  electronSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const url = new URL(details.url)
      if (url.protocol === 'http:') {
        // For demo purposes we always rewrite to HTTPS.
        // A real implementation might perform an HTTPS HEAD check first.
        const httpsUrl = details.url.replace(/^http:/, 'https:')
        callback({ redirectURL: httpsUrl })
      } else {
        callback({})
      }
    }
  )
}

module.exports = { enableHTTPSUpgrade }
