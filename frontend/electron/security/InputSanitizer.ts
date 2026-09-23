/**
 * InputSanitizer — Prevents command injection in desktop:executeAction
 *
 * CRITICAL: This replaces the unsafe PowerShell exec with user input.
 * Uses ALLOWLIST approach, not denylist.
 */

export interface ActionInput {
  type: string
  text?: string
  keys?: string
  targetUrl?: string
  targetApp?: string
}

export interface SanitizedAction {
  valid: boolean
  error?: string
  action?: ActionInput
}

export class InputSanitizer {
  // Strict allowlists
  private static readonly ALLOWED_ACTION_TYPES = ['type', 'hotkey', 'clipboard', 'launch'] as const
  private static readonly ALLOWED_HOTKEYS = [
    // Common hotkeys - explicit allowlist
    '^c', '^v', '^x', '^z', '^y', '^a', '^s', '^f', '^n', '^o', '^p', '^w', '^t',
    '{ENTER}', '{TAB}', '{ESC}', '{SPACE}', '{BACKSPACE}', '{DELETE}',
    '{UP}', '{DOWN}', '{LEFT}', '{RIGHT}',
    '{F1}', '{F2}', '{F3}', '{F4}', '{F5}', '{F6}', '{F7}', '{F8}', '{F9}', '{F10}', '{F11}', '{F12}',
    '%{F4}', // Alt+F4
    '^w', '^t', '^n', // Ctrl+W, Ctrl+T, Ctrl+N
  ] as const

  private static readonly MAX_TEXT_LENGTH = 10000
  private static readonly MAX_KEYS_LENGTH = 100

  // URL allowlist for launch actions
  private static readonly ALLOWED_URL_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:']
  private static readonly ALLOWED_DOMAINS = [
    'yogatik.web.app',
    'github.com',
    'docs.yogatik.app',
  ]

  sanitizeAction(input: unknown): SanitizedAction {
    // Type check
    if (!input || typeof input !== 'object') {
      return { valid: false, error: 'Invalid action: must be an object' }
    }

    const action = input as Record<string, unknown>

    // Validate type
    const type = action.type
    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'Missing or invalid action type' }
    }

    if (!InputSanitizer.ALLOWED_ACTION_TYPES.includes(type as any)) {
      return { valid: false, error: `Action type not allowed: ${type}` }
    }

    // Sanitize based on type
    switch (type) {
      case 'type':
        return this.sanitizeTypeAction(action)
      case 'hotkey':
        return this.sanitizeHotkeyAction(action)
      case 'clipboard':
        return this.sanitizeClipboardAction(action)
      case 'launch':
        return this.sanitizeLaunchAction(action)
      default:
        return { valid: false, error: `Unhandled action type: ${type}` }
    }
  }

  private sanitizeTypeAction(action: Record<string, unknown>): SanitizedAction {
    const text = action.text
    if (!text || typeof text !== 'string') {
      return { valid: false, error: 'Type action requires text string' }
    }

    if (text.length > InputSanitizer.MAX_TEXT_LENGTH) {
      return { valid: false, error: `Text too long (max ${InputSanitizer.MAX_TEXT_LENGTH} chars)` }
    }

    // Allow only safe characters for typing
    // Reject control characters except common ones
    const hasDangerousChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)
    if (hasDangerousChars) {
      return { valid: false, error: 'Text contains control characters' }
    }

    // Escape special SendKeys characters
    const escaped = text.replace(/[{}+^%~()]/g, '{$&}')

    return {
      valid: true,
      action: { type: 'type', text: escaped },
    }
  }

  private sanitizeHotkeyAction(action: Record<string, unknown>): SanitizedAction {
    const keys = action.keys
    if (!keys || typeof keys !== 'string') {
      return { valid: false, error: 'Hotkey action requires keys string' }
    }

    if (keys.length > InputSanitizer.MAX_KEYS_LENGTH) {
      return { valid: false, error: `Keys too long (max ${InputSanitizer.MAX_KEYS_LENGTH} chars)` }
    }

    // Must match allowed hotkey pattern exactly
    const normalized = keys.trim()
    if (!InputSanitizer.ALLOWED_HOTKEYS.includes(normalized as any)) {
      return { valid: false, error: `Hotkey not in allowlist: ${normalized}` }
    }

    return { valid: true, action: { type: 'hotkey', keys: normalized } }
  }

  private sanitizeClipboardAction(action: Record<string, unknown>): SanitizedAction {
    const text = action.text
    if (!text || typeof text !== 'string') {
      return { valid: false, error: 'Clipboard action requires text string' }
    }

    if (text.length > InputSanitizer.MAX_TEXT_LENGTH) {
      return { valid: false, error: `Text too long (max ${InputSanitizer.MAX_TEXT_LENGTH} chars)` }
    }

    return { valid: true, action: { type: 'clipboard', text } }
  }

  private sanitizeLaunchAction(action: Record<string, unknown>): SanitizedAction {
    const targetUrl = action.targetUrl
    const targetApp = action.targetApp

    if (!targetUrl && !targetApp) {
      return { valid: false, error: 'Launch action requires targetUrl or targetApp' }
    }

    if (targetUrl) {
      if (typeof targetUrl !== 'string') {
        return { valid: false, error: 'targetUrl must be a string' }
      }

      try {
        const url = new URL(targetUrl)

        // Protocol check
        if (!InputSanitizer.ALLOWED_URL_PROTOCOLS.includes(url.protocol)) {
          return { valid: false, error: `Protocol not allowed: ${url.protocol}` }
        }

        // Domain check for HTTP(S)
        if (['https:', 'http:'].includes(url.protocol)) {
          const hostname = url.hostname.toLowerCase()
          const allowed = InputSanitizer.ALLOWED_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
          )
          if (!allowed) {
            return { valid: false, error: `Domain not in allowlist: ${hostname}` }
          }
        }

        return { valid: true, action: { type: 'launch', targetUrl } }
      } catch {
        return { valid: false, error: 'Invalid URL format' }
      }
    }

    if (targetApp) {
      if (typeof targetApp !== 'string') {
        return { valid: false, error: 'targetApp must be a string' }
      }

      // Only allow specific known applications
      const allowedApps = ['notepad', 'calc', 'code', 'terminal', 'cmd', 'powershell']
      const appName = targetApp.toLowerCase().split(/[\\/]/).pop() || ''
      if (!allowedApps.includes(appName)) {
        return { valid: false, error: `Application not in allowlist: ${appName}` }
      }

      return { valid: true, action: { type: 'launch', targetApp } }
    }

    return { valid: false, error: 'Invalid launch action' }
  }
}