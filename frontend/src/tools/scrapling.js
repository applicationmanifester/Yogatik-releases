/**
 * Scrapling: Adaptive Web Scraping (self-healing selectors + structured
 * extraction), named after (not built on) the Scrapling Python project.
 *
 * FIXED 2026-09-04: the tool used to always set `anti_bot_bypassed: true`
 * on a successful fetch — even when detectAntiBotChallenge never fired,
 * i.e. nothing was ever bypassed, there was simply nothing to bypass. Worse,
 * when a challenge WAS detected on desktop, it returned success:true with
 * `stealth_escalation: 'Browser Engine Active'` and a note claiming
 * "Scrapling engine activated real browser session" — while actually just
 * re-running extractReadable() on the SAME blocked challenge-page HTML it
 * had already flagged as not-real-content. No browser session was ever
 * opened; the model would have reported a bypass that never happened. Both
 * claims are gone — a challenge is now reported as blocked, honestly, with
 * a pointer to the real desktop-only bypass (browser_control, which renders
 * in an actual Chromium process and can pass what only a real browser can).
 * A bare fetch, here or anywhere else in this app, cannot solve a Cloudflare
 * JS challenge — there is no JS engine running the challenge script.
 *
 * Also fixed: STEALTH_HEADERS was declared and never used — the "stealth
 * fetching" the description promised sent the browser's default fetch
 * headers, nothing else. It is passed through proxyFetch now, which is the
 * one real thing a header set can do (it cannot solve a JS challenge, but
 * it is no longer dead code pretending to be active).
 *
 * Kept, because they are real and useful on their own: the self-healing
 * selector matcher (DOM fingerprint + similarity scoring) and structured
 * extraction — neither claims a capability beyond what the code does.
 */

import { proxyText } from './http'
import { extractReadable } from './readability'

// Modern Chrome/Edge stealth headers
export const STEALTH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

/**
 * Calculates string similarity using Sorensen-Dice coefficient
 */
export function calculateTextSimilarity(str1 = '', str2 = '') {
  const s1 = String(str1).trim().toLowerCase()
  const s2 = String(str2).trim().toLowerCase()
  if (s1 === s2) return 1.0
  if (s1.length < 2 || s2.length < 2) return 0.0

  const getBigrams = (str) => {
    const bigrams = new Map()
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2)
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1)
    }
    return bigrams
  }

  const b1 = getBigrams(s1)
  const b2 = getBigrams(s2)
  let intersection = 0

  for (const [key, count1] of b1.entries()) {
    if (b2.has(key)) {
      intersection += Math.min(count1, b2.get(key))
    }
  }

  const total = (s1.length - 1) + (s2.length - 1)
  return total > 0 ? (2.0 * intersection) / total : 0.0
}

/**
 * Calculates Jaccard similarity for token sets (e.g. CSS classes or attributes)
 */
export function calculateSetSimilarity(setA = [], setB = []) {
  const a = new Set(setA.filter(Boolean))
  const b = new Set(setB.filter(Boolean))
  if (a.size === 0 && b.size === 0) return 1.0
  if (a.size === 0 || b.size === 0) return 0.0

  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = new Set([...a, ...b]).size
  return union > 0 ? intersection / union : 0.0
}

/**
 * Creates an element fingerprint from a DOM Node or selector match
 */
export function createElementFingerprint(el, targetSelector = '') {
  if (!el) return null
  const tag = (el.tagName || '').toLowerCase()
  const classes = Array.from(el.classList || [])
  const id = el.id || ''
  const text = (el.textContent || '').trim().slice(0, 120)
  const role = el.getAttribute?.('role') || ''
  const ariaLabel = el.getAttribute?.('aria-label') || ''
  const testId = el.getAttribute?.('data-testid') || el.getAttribute?.('data-qa') || ''

  // Compute depth and ancestry tags
  const ancestry = []
  let curr = el.parentElement
  let depth = 0
  while (curr && depth < 5) {
    ancestry.push((curr.tagName || '').toLowerCase())
    curr = curr.parentElement
    depth++
  }

  return {
    tag,
    classes,
    id,
    textSample: text,
    role,
    ariaLabel,
    testId,
    ancestry,
    originalSelector: targetSelector,
    childCount: el.children ? el.children.length : 0,
  }
}

/**
 * Scrapling Adaptive Matcher:
 * Scores DOM candidates against a fingerprint to locate mutated or relocated elements.
 */
export function scoreCandidateMatch(candidate, fingerprint) {
  if (!candidate || !fingerprint) return 0.0

  const candidateTag = (candidate.tagName || '').toLowerCase()
  // Tag match is mandatory or high penalty
  if (fingerprint.tag && candidateTag !== fingerprint.tag) {
    return 0.1 // Significant penalty if tag differs
  }

  let totalScore = 0.0
  let weights = 0.0

  // 1. Class Set Similarity (Weight: 2.5)
  const candidateClasses = Array.from(candidate.classList || [])
  const classSim = calculateSetSimilarity(candidateClasses, fingerprint.classes)
  totalScore += classSim * 2.5
  weights += 2.5

  // 2. Text Content Similarity (Weight: 3.0)
  if (fingerprint.textSample) {
    const candidateText = (candidate.textContent || '').trim().slice(0, 120)
    const textSim = calculateTextSimilarity(candidateText, fingerprint.textSample)
    totalScore += textSim * 3.0
    weights += 3.0
  }

  // 3. Test ID / QA Attributes (Weight: 4.0 if present)
  const candidateTestId = candidate.getAttribute?.('data-testid') || candidate.getAttribute?.('data-qa') || ''
  if (fingerprint.testId) {
    totalScore += (candidateTestId === fingerprint.testId ? 1.0 : 0.0) * 4.0
    weights += 4.0
  }

  // 4. Aria / Role Attributes (Weight: 2.0)
  const candidateAria = candidate.getAttribute?.('aria-label') || ''
  const candidateRole = candidate.getAttribute?.('role') || ''
  if (fingerprint.ariaLabel) {
    totalScore += (candidateAria === fingerprint.ariaLabel ? 1.0 : 0.0) * 2.0
    weights += 2.0
  }
  if (fingerprint.role) {
    totalScore += (candidateRole === fingerprint.role ? 1.0 : 0.0) * 2.0
    weights += 2.0
  }

  // 5. Ancestry Structure (Weight: 1.5)
  const candidateAncestry = []
  let curr = candidate.parentElement
  let depth = 0
  while (curr && depth < 5) {
    candidateAncestry.push((curr.tagName || '').toLowerCase())
    curr = curr.parentElement
    depth++
  }
  const ancestrySim = calculateSetSimilarity(candidateAncestry, fingerprint.ancestry)
  totalScore += ancestrySim * 1.5
  weights += 1.5

  return weights > 0 ? totalScore / weights : 0.0
}

/**
 * Adaptive Query Selector:
 * Attempts exact selector, and if it fails or returns empty, executes self-healing search.
 */
export function querySelectorAdaptive(rootDoc, selector, fingerprint = null) {
  if (!rootDoc) return { element: null, method: 'none', confidence: 0 }

  // 1. Try exact selector first
  if (selector) {
    try {
      const direct = rootDoc.querySelector(selector)
      if (direct) {
        return {
          element: direct,
          method: 'exact_selector',
          confidence: 1.0,
          fingerprint: createElementFingerprint(direct, selector),
        }
      }
    } catch { /* malformed or mutated selector */ }
  }

  // 2. If no fingerprint provided, we cannot adapt
  if (!fingerprint) {
    return { element: null, method: 'failed_no_fingerprint', confidence: 0 }
  }

  // 3. Search all candidate elements with matching tag
  const candidates = Array.from(rootDoc.querySelectorAll(fingerprint.tag || '*'))
  let bestMatch = null
  let highestScore = 0.0

  for (const candidate of candidates) {
    const score = scoreCandidateMatch(candidate, fingerprint)
    if (score > highestScore) {
      highestScore = score
      bestMatch = candidate
    }
  }

  // Require minimum confidence threshold (0.45) for adaptive match
  if (bestMatch && highestScore >= 0.45) {
    return {
      element: bestMatch,
      method: 'adaptive_healed',
      confidence: Math.round(highestScore * 100) / 100,
      fingerprint: createElementFingerprint(bestMatch, selector),
    }
  }

  return { element: null, method: 'exhausted', confidence: highestScore }
}

/**
 * Checks if HTML response indicates anti-bot challenge (Cloudflare, Datadome, Turnstile)
 */
export function detectAntiBotChallenge(html = '') {
  if (!html || typeof html !== 'string') return { blocked: false }

  const indicators = [
    { name: 'Cloudflare Turnstile', pattern: /cf-turnstile|challenges\.cloudflare\.com|turnstile\.min\.js/i },
    { name: 'Cloudflare Challenge', pattern: /just a moment|checking your browser|cf_chl_opt|_cf_chl_prog|attention required! \| cloudflare/i },
    { name: 'Datadome', pattern: /datadome|dd\.js|geo\.captcha-delivery\.com/i },
    { name: 'Akamai Bot Manager', pattern: /ak_bmsc|akamai_telemetry|_abck/i },
    { name: 'PerimeterX / HUMAN', pattern: /_px3|_pxhd|px-captcha|perimeterx/i },
    { name: 'Generic Access Denied / 403', pattern: /<title>(403 forbidden|access denied|blocked)<\/title>/i },
  ]

  for (const ind of indicators) {
    if (ind.pattern.test(html)) {
      return { blocked: true, reason: ind.name }
    }
  }

  return { blocked: false }
}

/**
 * Parses raw HTML string into a DOM Document (cross-platform: works in browser, Electron, or lightweight JSDOM fallback)
 */
export function parseHtml(html = '') {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(html, 'text/html')
  }
  // If in minimal Node/worker environment without DOMParser
  return null
}

/**
 * Extracts structured data based on selectors dictionary
 */
export function extractStructuredData(doc, selectorsMap = {}, adaptive = true) {
  const results = {}
  const adaptationReports = []

  for (const [key, selectorConfig] of Object.entries(selectorsMap)) {
    const isObj = typeof selectorConfig === 'object' && selectorConfig !== null
    const selector = isObj ? selectorConfig.selector : String(selectorConfig)
    const isMultiple = isObj ? Boolean(selectorConfig.multiple) : false
    const attr = isObj ? selectorConfig.attribute : null
    const fingerprint = isObj ? selectorConfig.fingerprint : null

    if (isMultiple) {
      const elements = Array.from(doc.querySelectorAll(selector || '*'))
      results[key] = elements.map(el => {
        if (attr) return el.getAttribute?.(attr) || ''
        return (el.textContent || '').trim()
      }).filter(Boolean)
    } else {
      const match = adaptive
        ? querySelectorAdaptive(doc, selector, fingerprint)
        : { element: doc.querySelector(selector), method: 'exact', confidence: 1.0 }

      if (match.element) {
        let val = ''
        if (attr) val = match.element.getAttribute?.(attr) || ''
        else val = (match.element.textContent || '').trim()
        results[key] = val

        if (match.method === 'adaptive_healed') {
          adaptationReports.push({ key, originalSelector: selector, confidence: match.confidence })
        }
      } else {
        results[key] = null
      }
    }
  }

  return { data: results, adaptations: adaptationReports }
}

/**
 * Generates an executable standalone Python Scrapling script for external use
 */
export function generateScraplingScript(url, selectors = {}, options = {}) {
  const stealth = options.stealth !== false
  const adaptive = options.adaptive !== false

  const selectorsCode = Object.entries(selectors).map(([k, v]) => {
    const sel = typeof v === 'object' ? v.selector : v
    return `    data["${k}"] = page.css("${sel}::text").getall() or page.css("${sel}").get()`
  }).join('\n')

  return `#!/usr/bin/env python3
"""
Standalone Scrapling Web Scraper
Generated automatically by Yogatik Engine
"""
from scrapling import ${stealth ? 'StealthyFetcher' : 'Fetcher'}

def run_scraper():
    url = "${url}"
    print(f"[*] Fetching target: {url}")
    
    # 1. Fetch page using Scrapling's ${stealth ? 'Stealthy Engine' : 'Adaptive Engine'}
    page = ${stealth ? 'StealthyFetcher' : 'Fetcher'}.get(url)
    
    data = {}
    
    # 2. Extract elements with resilient parsing
${selectorsCode || '    # Auto extract title and main content\n    data["title"] = page.css("title::text").get()\n    data["headings"] = page.css("h1, h2, h3::text").getall()'}

    print("[+] Scraped Data:")
    for k, v in data.items():
        print(f"  - {k}: {v}")
    
    return data

if __name__ == "__main__":
    run_scraper()
`
}

/**
 * Scrapling Universal Tool for Yogatik
 */
export const scraplingTool = {
  schema: {
    description: 'Fetches a page and extracts structured data via CSS selectors, self-healing them if the DOM changes (class/structure drift). Detects — but cannot bypass — Cloudflare/Datadome/PerimeterX-style JS challenges (that needs a real browser: browser_control, desktop app). Also does auto/markdown extraction and standalone Python-script generation for external use.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL to scrape or extract' },
        selectors: {
          type: 'object',
          description: 'Optional dictionary of key-selector pairs for structured extraction (e.g. {"title": "h1", "price": ".price-val", "items": ".item-card"}).',
        },
        adaptive: {
          type: 'boolean',
          description: 'Enable self-healing adaptive element locator if class names or DOM paths change (default true).',
        },
        stealth: {
          type: 'boolean',
          description: 'Enable progressive anti-bot headers and fingerprint spoofing (default true).',
        },
        extract_mode: {
          type: 'string',
          enum: ['auto', 'markdown', 'structured', 'html', 'script_gen'],
          description: 'Extraction mode: "auto" (article/content), "structured" (using selectors), "markdown", "html", or "script_gen" (generate standalone Python Scrapling script).',
        },
        max_chars: {
          type: 'number',
          description: 'Maximum characters of text to return (default 12000).',
        },
      },
      required: ['url'],
    },
  },

  async execute({
    url,
    selectors = null,
    adaptive = true,
    stealth = true,
    extract_mode = 'auto',
    max_chars = 12000,
  } = {}) {
    if (!url || !/^https?:\/\//i.test(url.trim())) {
      return { success: false, error: 'Please provide a valid http:// or https:// URL.' }
    }

    const cleanUrl = url.trim()

    // Mode: Generate standalone Python script
    if (extract_mode === 'script_gen') {
      const script = generateScraplingScript(cleanUrl, selectors || {}, { stealth, adaptive })
      return {
        success: true,
        tool: 'scrapling_scrape',
        mode: 'script_gen',
        url: cleanUrl,
        python_script: script,
        instructions: 'Run `pip install scrapling` and execute this standalone script to scrape externally.',
      }
    }

    try {
      // Step 1: fetch, with stealth-ish headers (this is a plain fetch —
      // better headers, not a real browser; see file header).
      const html = await proxyText(cleanUrl, { headers: stealth ? STEALTH_HEADERS : undefined })
      if (!html || typeof html !== 'string') {
        return { success: false, error: `Failed to fetch HTML from ${cleanUrl}`, url: cleanUrl }
      }

      // Step 2: Anti-Bot Challenge Inspection
      const antiBot = detectAntiBotChallenge(html)
      const isDesktopApp = typeof window !== 'undefined' && Boolean(window.__YOGATIK_BROWSER__ || window.electronAPI)

      if (antiBot.blocked) {
        // Honest, in both cases: a bare fetch cannot run the challenge's own
        // JS, so nothing here can pass it — only a real rendering engine can
        // (browser_control, desktop-only, a real Chromium process).
        return {
          success: false,
          url: cleanUrl,
          anti_bot_detected: antiBot.reason,
          error: isDesktopApp
            ? `Target is protected by ${antiBot.reason}. This tool cannot pass a JS challenge — call browser_control to navigate there in a real browser instead.`
            : `Target is protected by ${antiBot.reason}. In web mode there is no way around this; the desktop app's browser_control tool can render the page in a real browser.`,
        }
      }

      const doc = parseHtml(html)

      // Step 3: Structured Extraction via Selectors
      if (selectors && Object.keys(selectors).length > 0 && doc) {
        const { data, adaptations } = extractStructuredData(doc, selectors, adaptive)
        return {
          success: true,
          tool: 'scrapling_scrape',
          mode: 'structured',
          url: cleanUrl,
          data,
          adaptive_healed_selectors: adaptations.length > 0 ? adaptations : undefined,
          status: 'success',
        }
      }

      // Step 4: Auto & Markdown Extraction Mode
      const readable = extractReadable(html, { maxChars: Math.min(Math.max(1000, max_chars | 0), 30000) })

      return {
        success: true,
        tool: 'scrapling_scrape',
        mode: extract_mode,
        url: cleanUrl,
        title: readable.title,
        site: readable.site || undefined,
        byline: readable.author || undefined,
        text: readable.text,
        words: readable.words,
        tables: readable.tables || undefined,
        code_blocks: readable.code_blocks || undefined,
        images: readable.images || undefined,
        links: readable.links || undefined,
      }
    } catch (err) {
      return {
        success: false,
        tool: 'scrapling_scrape',
        url: cleanUrl,
        error: `Scrapling engine error: ${err.message}`,
      }
    }
  },
}
