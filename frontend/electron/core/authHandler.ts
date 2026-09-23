/**
 * GoogleAuthHandler — Native Google OAuth desktop bridge
 *
 * Runs a localhost callback server, opens the hosted auth page in the user's
 * browser, and resolves with the token when the browser redirects back.
 * All inputs validated; the callback only accepts JSON with expected fields.
 */

import { shell, BrowserWindow } from 'electron'
import * as http from 'http'
import { Logger } from './Logger'
import { parse as parseUrl } from 'url'

export interface GoogleAuthContext {
  getWindow: () => BrowserWindow | null
  logger: Logger
  timeoutMs: number
}

export interface GoogleAuthResult {
  success: boolean
  user?: Record<string, unknown>
  idToken?: string
  googleIdToken?: string | null
  error?: string
}

export function handleGoogleAuth(ctx: GoogleAuthContext): Promise<GoogleAuthResult> {
  return new Promise((resolve) => {
    let server: http.Server | null = null
    let timeoutTimer: NodeJS.Timeout | null = null
    let resolved = false

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (server) {
        try { server.close() } catch { /* ignore */ }
        server = null
      }
    }

    const finish = (result: GoogleAuthResult) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(result)
    }

    server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const reqUrl = parseUrl(req.url || '', true)
        if (reqUrl.pathname === '/callback') {
          const rawData = reqUrl.query.data
          if (rawData && typeof rawData === 'string') {
            // Validate the callback payload shape before trusting it
            let parsed: Record<string, unknown>
            try {
              parsed = JSON.parse(rawData)
            } catch {
              res.writeHead(400, { 'Content-Type': 'text/plain' })
              res.end('Bad Request: invalid JSON')
              return
            }

            const idToken = typeof parsed.idToken === 'string' ? parsed.idToken : undefined
            const googleIdToken = typeof parsed.googleIdToken === 'string' ? parsed.googleIdToken : null
            if (!idToken && !googleIdToken) {
              res.writeHead(400, { 'Content-Type': 'text/plain' })
              res.end('Bad Request: no token in callback')
              return
            }

            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed in to Yogatik Desktop</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e14; color: #f0f4f8; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { background: #121820; border: 1px solid #1e2632; border-radius: 16px; padding: 40px; text-align: center; max-width: 440px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { color: #ff6b35; font-size: 22px; margin-bottom: 12px; }
    p { color: #8892b0; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <h1>✨ Signed in successfully!</h1>
    <p>You are now authenticated in Yogatik Desktop. You can close this browser tab and return to the application.</p>
  </div>
</body>
</html>`)

            // Focus the app window so the user returns to it
            try {
              const window = ctx.getWindow()
              if (window && !window.isDestroyed()) {
                if (window.isMinimized()) window.restore()
                window.show()
                window.focus()
              }
            } catch { /* ignore */ }

            finish({
              success: true,
              user: parsed,
              idToken,
              googleIdToken,
            })
            return
          }
        }
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      } catch (err) {
        ctx.logger.error('Google auth callback error', { error: String(err) })
        try {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal Error')
        } catch { /* ignore */ }
        finish({ success: false, error: err instanceof Error ? err.message : String(err) })
      }
    })

    // Listen on a random available port
    server.listen(0, '127.0.0.1', () => {
      if (!server) return
      const address = server.address()
      if (!address || typeof address === 'string') {
        finish({ success: false, error: 'Failed to bind callback server' })
        return
      }
      const port = address.port
      const callbackUrl = `http://127.0.0.1:${port}/callback`
      const targetAuthUrl = `https://yogatik.web.app/auth-desktop.html?callback=${encodeURIComponent(callbackUrl)}`

      shell.openExternal(targetAuthUrl).catch((err: Error) => {
        ctx.logger.error('Failed to open auth URL', { error: String(err) })
        finish({ success: false, error: `Failed to open browser: ${err.message}` })
      })

      // Configurable timeout (default 120s)
      timeoutTimer = setTimeout(() => {
        finish({ success: false, error: 'Sign-in timed out. Please try again.' })
      }, ctx.timeoutMs)
    })

    server.on('error', (err: Error) => {
      ctx.logger.error('Google auth server error', { error: err.message })
      finish({ success: false, error: err.message })
    })
  })
}