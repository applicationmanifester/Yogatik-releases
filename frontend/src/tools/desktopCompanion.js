/**
 * OS-Level AI Companion, Cross-App Computer Use & Browser Autopilot Tools
 *
 * Enables Yogatik to monitor external applications, capture screen frames,
 * query foreground window state, dispatch synthetic keyboard/app actions,
 * and pilot browser workflows autonomously.
 */
import { describeWithoutModel } from '../vision/source'
import { proxyFetch } from './http'
import { captureWebScreenFrame, isScreenCaptureSupported } from '../pipCompanion'

/** Check if running inside Yogatik Desktop with Companion capabilities */
export function hasCompanionCapabilities() {
  return typeof window !== 'undefined' && Boolean(window.__YOGATIK_COMPANION__)
}

/**
 * 1. Screen Inspect Tool
 * Captures live screen frame and active application metadata.
 */
export async function executeScreenInspect(args = {}) {
  const { focus = 'all', includeOcr = true } = args

  if (typeof window === 'undefined' || !window.__YOGATIK_COMPANION__) {
    // Browser mode: use HTML5 getDisplayMedia screen & tab capture
    if (isScreenCaptureSupported()) {
      try {
        const frame = await captureWebScreenFrame()
        let ocrSummary = ''
        if (includeOcr && frame.dataUrl) {
          try {
            const ocrResult = await describeWithoutModel(frame.dataUrl, { allowVlm: false })
            ocrSummary = ocrResult?.text || ''
          } catch { /* OCR best effort */ }
        }
        return {
          success: true,
          mode: 'web-capture',
          activeApp: 'Web Browser / Monitored Tab',
          activeTitle: frame.sourceLabel || document.title,
          screenWidth: frame.width,
          screenHeight: frame.height,
          hasImage: true,
          dataUrl: frame.dataUrl,
          ocrPreview: ocrSummary ? ocrSummary.slice(0, 800) : undefined,
          message: `Captured live browser tab/screen frame (${frame.width}x${frame.height}) via Web Screen Stream.`,
        }
      } catch (e) {
        return {
          success: true,
          mode: 'web-fallback',
          activeApp: 'Web Browser Window',
          activeTitle: document.title,
          text: `Web Screen Capture prompt dismissed: ${e.message}`,
        }
      }
    }
    return {
      success: true,
      mode: 'simulated',
      activeApp: 'Desktop Workspace',
      activeTitle: 'External Application',
      text: 'To monitor external apps continuously across Windows, use the installed Yogatik Desktop app with companion mode.',
    }
  }

  try {
    const [screenRes, activeWindow] = await Promise.all([
      window.__YOGATIK_COMPANION__.captureScreen(),
      window.__YOGATIK_COMPANION__.getActiveWindow(),
    ])

    if (!screenRes.success) {
      return { success: false, error: screenRes.error || 'Failed to capture desktop screen' }
    }

    let ocrSummary = ''
    if (includeOcr && screenRes.dataUrl) {
      try {
        // Run fast on-device OCR or heuristic descriptor
        const ocrResult = await describeWithoutModel(screenRes.dataUrl, { allowVlm: false })
        ocrSummary = ocrResult?.text || ''
      } catch { /* OCR is best effort */ }
    }

    return {
      success: true,
      activeApp: activeWindow?.appName || 'External Application',
      activeTitle: activeWindow?.title || 'Active Window',
      pid: activeWindow?.pid,
      screenWidth: screenRes.width,
      screenHeight: screenRes.height,
      hasImage: Boolean(screenRes.dataUrl),
      dataUrl: screenRes.dataUrl, // thumbnail dataUrl
      ocrPreview: ocrSummary ? ocrSummary.slice(0, 800) : undefined,
      message: `Captured foreground window [${activeWindow?.appName}]: "${activeWindow?.title}" (${screenRes.width}x${screenRes.height})`,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * 2. Desktop Action Tool
 * Executes synthetic keyboard input, hotkey combinations, app launches, or clipboard copying.
 */
export async function executeDesktopAction(args = {}) {
  const { action, text, keys, targetUrl, targetApp } = args

  if (!hasCompanionCapabilities()) {
    if (action === 'launch' && targetUrl) {
      if (typeof window !== 'undefined') window.open(targetUrl, '_blank')
      // `target` is what the card labels; keep targetUrl for the model.
      return { success: true, action: 'launch', targetUrl, target: targetUrl, note: 'Opened URL in browser tab' }
    }
    if (action === 'clipboard' && text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        return { success: true, action: 'clipboard', length: text.length, note: 'Copied to clipboard' }
      }
    }
    return {
      success: false,
      error: 'OS-level desktop actions require running inside the Yogatik Desktop application.',
    }
  }

  try {
    const res = await window.__YOGATIK_COMPANION__.executeAction({
      type: action,
      text,
      keys,
      targetUrl,
      targetApp,
    })
    // main returns whatever the action produced; the card reads action/text/keys/
    // target, so fill them in rather than showing "Desktop Action: dispatched".
    return { action, text, keys, target: targetUrl || targetApp, ...res }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * 3. Browser Autopilot Tool
 * Navigates to a web page, extracts clean structural data, or analyzes page state.
 */
export async function executeBrowserAutopilot(args = {}) {
  const { url, task = 'extract', query = '', selector = '' } = args

  if (!url || !/^https?:\/\//i.test(url)) {
    return { success: false, error: 'A valid http/https URL is required for browser autopilot.' }
  }

  try {
    // 1. Fetch clean content via proxy HTTP client
    const resp = await proxyFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Yogatik/3.8' } })
    if (!resp.ok) {
      return { success: false, error: `Failed to load page: ${resp.status} ${resp.statusText}` }
    }
    const html = await resp.text()

    // 2. Extract title and body text
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const pageTitle = titleMatch ? titleMatch[1].trim() : url

    // Remove script, style, svg tags
    let clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Extract relevant sections if query provided
    let excerpt = clean.slice(0, 3000)
    if (query) {
      const qLower = query.toLowerCase()
      const idx = clean.toLowerCase().indexOf(qLower)
      if (idx !== -1) {
        const start = Math.max(0, idx - 400)
        excerpt = clean.slice(start, start + 3000)
      }
    }

    return {
      success: true,
      url,
      title: pageTitle,
      task,
      contentLength: clean.length,
      excerpt,
      message: `Autopilot loaded "${pageTitle}" (${clean.length.toLocaleString()} characters extracted)`,
    }
  } catch (err) {
    return { success: false, url, error: err.message }
  }
}
