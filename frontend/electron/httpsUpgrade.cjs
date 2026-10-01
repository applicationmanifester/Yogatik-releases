// frontend/electron/httpsUpgrade.cjs
// ------------------------------------------------
// Very lightweight HTTPS‑upgrade logic for Electron.
// Rewrites *http:* URLs to *https:* before they are sent.
// Respects allowlist for localhost, local domains, and dev environments.
// ------------------------------------------------

const { session } = require('electron')

// Hosts that should NOT be auto-upgraded to HTTPS
const HTTPS_UPGRADE_ALLOWLIST = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '.local',
  '.test',
  '.internal',
  '.localhost',
]

function isAllowlisted(hostname) {
  const host = hostname.toLowerCase()
  return HTTPS_UPGRADE_ALLOWLIST.some(a => 
    host === a || host.endsWith(a)
  )
}

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
        // Skip upgrade for allowlisted hosts (localhost, .local, .test, etc.)
        if (isAllowlisted(url.hostname)) {
          callback({})
          return
        }
        // Rewrite to HTTPS for all other hosts
        const httpsUrl = details.url.replace(/^http:/, 'https:')
        callback({ redirectURL: httpsUrl })
      } else {
        callback({})
      }
    }
  )
}

module.exports = { enableHTTPSUpgrade, isAllowlisted, HTTPS_UPGRADE_ALLOWLIST }
