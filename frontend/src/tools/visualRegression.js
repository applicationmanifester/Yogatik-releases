/**
 * visualRegression — Screenshot comparison and visual regression testing.
 * 
 * Uses pixelmatch for fast pixel-level diffing with configurable thresholds.
 * Integrates with browser_control for automated visual QA workflows.
 */

import { browserControlTool } from './browserControl'

// Simple in-memory baseline store (in production, persist to IndexedDB)
const baselineStore = new Map()

/**
 * Compare two screenshots and return diff metrics
 * @param {Buffer|Uint8Array} baseline - Baseline screenshot (PNG)
 * @param {Buffer|Uint8Array} current - Current screenshot (PNG)
 * @param {Object} options - Comparison options
 * @returns {Object} Diff result with metrics and diff image
 */
export async function compareScreenshots(baseline, current, options = {}) {
  const {
    threshold = 0.1,        // Pixel difference threshold (0-1)
    includeAA = true,       // Include anti-aliasing in diff
    alpha = 0.3,            // Opacity of diff overlay
    diffColor = [255, 0, 0], // Diff highlight color (red)
    maxDiffPixels = null,   // Fail fast if exceeded
  } = options

  try {
    // Dynamic import of pixelmatch (only available in Node/Electron)
    const { PNG } = await import('pngjs')
    const pixelmatchMod = await import('pixelmatch')
    const pixelmatch = pixelmatchMod.default || pixelmatchMod

    const baselinePNG = PNG.sync.read(baseline)
    const currentPNG = PNG.sync.read(current)

    if (baselinePNG.width !== currentPNG.width || baselinePNG.height !== currentPNG.height) {
      return {
        success: false,
        error: `Dimension mismatch: baseline ${baselinePNG.width}x${baselinePNG.height} vs current ${currentPNG.width}x${currentPNG.height}`,
        baselineDimensions: { width: baselinePNG.width, height: baselinePNG.height },
        currentDimensions: { width: currentPNG.width, height: currentPNG.height },
      }
    }

    const { width, height } = baselinePNG
    let diffPNG
    try {
      diffPNG = typeof PNG === 'function' ? new PNG({ width, height }) : { width, height, data: new Uint8Array(width * height * 4) }
    } catch {
      diffPNG = { width, height, data: new Uint8Array(width * height * 4) }
    }

    const diffData = diffPNG.data || new Uint8Array(width * height * 4)
    const diffPixels = pixelmatch(
      baselinePNG.data,
      currentPNG.data,
      diffData,
      width,
      height,
      { threshold, includeAA, alpha, diffColor }
    )

    const totalPixels = width * height
    const diffRatio = diffPixels / totalPixels

    let diffImage = null
    try {
      if (PNG.sync?.write) diffImage = PNG.sync.write(diffPNG)
    } catch {}

    const result = {
      success: true,
      diffPixels,
      totalPixels,
      diffRatio,
      diffPercent: (diffRatio * 100).toFixed(2),
      passed: diffRatio <= threshold,
      threshold,
      dimensions: { width, height },
      diffImage,
    }

    if (maxDiffPixels && diffPixels > maxDiffPixels) {
      result.passed = false
      result.exceededMaxDiff = true
    }

    return result
  } catch (e) {
    // pixelmatch/pngjs not available (e.g., in browser)
    // Fallback: simple byte comparison
    if (baseline.length === current.length) {
      let diffBytes = 0
      for (let i = 0; i < baseline.length; i++) {
        if (baseline[i] !== current[i]) diffBytes++
      }
      const diffRatio = diffBytes / baseline.length
      return {
        success: true,
        diffPixels: diffBytes,
        totalPixels: baseline.length,
        diffRatio,
        diffPercent: (diffRatio * 100).toFixed(2),
        passed: diffRatio <= threshold,
        threshold,
        fallback: 'byte-comparison',
      }
    }
    return { success: false, error: e.message, fallbackFailed: true }
  }
}

/**
 * Save a baseline screenshot for a given key
 */
export function saveBaseline(key, screenshot, metadata = {}) {
  baselineStore.set(key, {
    screenshot,
    metadata: {
      ...metadata,
      savedAt: Date.now(),
      width: metadata.width,
      height: metadata.height,
    },
  })
  return { success: true, key }
}

/**
 * Load a baseline screenshot
 */
export function loadBaseline(key) {
  return baselineStore.get(key) || null
}

/**
 * List all saved baselines
 */
export function listBaselines() {
  return Array.from(baselineStore.entries()).map(([key, value]) => ({
    key,
    ...value.metadata,
  }))
}

/**
 * Delete a baseline
 */
export function deleteBaseline(key) {
  return baselineStore.delete(key)
}

/**
 * Clear all baselines
 */
export function clearBaselines() {
  baselineStore.clear()
  return { success: true }
}

/**
 * Capture screenshot and compare against baseline
 * @param {Object} params - Parameters for browser_control navigate/read + comparison
 */
export async function captureAndCompare(params) {
  const {
    url,
    baselineKey,
    action = 'navigate',
    selector,
    waitForSelector,
    threshold = 0.1,
    ...browserOptions
  } = params

  // Navigate to URL
  const navResult = await browserControlTool.execute({
    action: 'navigate',
    url,
    ...browserOptions,
  })

  if (!navResult.success) {
    return { success: false, error: `Navigation failed: ${navResult.error}`, stage: 'navigate' }
  }

  // Wait for selector if specified
  if (waitForSelector) {
    const waitResult = await browserControlTool.execute({
      action: 'wait_for',
      selector: waitForSelector,
      timeout: 10000,
      ...browserOptions,
    })
    if (!waitResult.success) {
      return { success: false, error: `Wait failed: ${waitResult.error}`, stage: 'wait_for' }
    }
  }

  // Capture screenshot
  const screenshotResult = await browserControlTool.execute({
    action: 'screenshot',
    fullPage: true,
    ...browserOptions,
  })

  if (!screenshotResult.success || !screenshotResult.screenshot) {
    return { success: false, error: 'Screenshot capture failed', stage: 'screenshot' }
  }

  const currentScreenshot = screenshotResult.screenshot

  // Get baseline
  const baseline = loadBaseline(baselineKey)
  if (!baseline) {
    // No baseline - save current as baseline
    saveBaseline(baselineKey, currentScreenshot, {
      url,
      width: screenshotResult.width,
      height: screenshotResult.height,
    })
    return {
      success: true,
      baselineCreated: true,
      message: 'No baseline existed - current screenshot saved as baseline',
      key: baselineKey,
      screenshot: currentScreenshot,
    }
  }

  // Compare
  const comparison = await compareScreenshots(baseline.screenshot, currentScreenshot, { threshold })

  return {
    success: comparison.success,
    ...comparison,
    baselineKey,
    baselineMetadata: baseline.metadata,
    currentScreenshot,
    passed: comparison.passed,
  }
}

/**
 * Visual regression test suite runner
 * Runs multiple capture-and-compare operations
 */
export async function runVisualRegressionSuite(testCases, options = {}) {
  const {
    continueOnFailure = true,
    updateBaselines = false, // If true, failed comparisons update the baseline
  } = options

  const results = []
  let passed = 0
  let failed = 0
  let baselinesCreated = 0
  let baselinesUpdated = 0

  for (const testCase of testCases) {
    const { name, url, baselineKey, ...params } = testCase
    const key = baselineKey || `visual-${name.replace(/\s+/g, '-').toLowerCase()}`

    try {
      let result
      if (updateBaselines) {
        // Force update: capture and save as new baseline
        const navResult = await browserControlTool.execute({ action: 'navigate', url, ...params })
        if (navResult.success) {
          const screenshotResult = await browserControlTool.execute({ action: 'screenshot', fullPage: true, ...params })
          if (screenshotResult.success && screenshotResult.screenshot) {
            saveBaseline(key, screenshotResult.screenshot, { url, ...params })
            result = { success: true, baselineUpdated: true, name, key }
            baselinesUpdated++
          } else {
            result = { success: false, error: 'Screenshot failed', name, key }
          }
        } else {
          result = { success: false, error: navResult.error, name, key }
        }
      } else {
        result = await captureAndCompare({ url, baselineKey: key, ...params })
        result.name = name
        result.key = key
      }

      if (result.success && (result.passed || result.baselineCreated || result.baselineUpdated)) {
        passed++
        if (result.baselineCreated) baselinesCreated++
      } else {
        failed++
      }

      results.push(result)

      if (!continueOnFailure && failed > 0) break
    } catch (e) {
      failed++
      results.push({ success: false, error: e.message, name, key })
      if (!continueOnFailure) break
    }
  }

  return {
    success: failed === 0,
    summary: { total: testCases.length, passed, failed, baselinesCreated, baselinesUpdated },
    results,
  }
}

function toBase64(input) {
  if (!input) return ''
  const Buf = typeof globalThis !== 'undefined' ? globalThis.Buffer : null
  if (typeof input === 'string') {
    if (input.startsWith('data:')) return input.split(',')[1] || ''
    try {
      if (typeof btoa !== 'undefined') return btoa(input)
      if (Buf) return Buf.from(input).toString('base64')
    } catch {
      return ''
    }
  }
  try {
    if (Buf) return Buf.from(input).toString('base64')
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    let binary = ''
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  } catch {
    return ''
  }
}

/**
 * Generate HTML report for visual regression results
 */
export function generateVisualReport(results, options = {}) {
  const { title = 'Visual Regression Report', includePassed = true } = options

  let html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 20px; }
    .summary { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { padding: 10px 20px; border-radius: 8px; color: white; }
    .passed { background: #22c55e; }
    .failed { background: #ef4444; }
    .created { background: #3b82f6; }
    .updated { background: #f59e0b; }
    .test-case { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px; padding: 16px; }
    .test-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .test-name { font-weight: 600; font-size: 1.1em; }
    .badge { padding: 4px 12px; border-radius: 9999px; font-size: 0.85em; font-weight: 600; }
    .badge-pass { background: #dcfce7; color: #166534; }
    .badge-fail { background: #fee2e2; color: #991b1b; }
    .badge-new { background: #dbeafe; color: #1e40af; }
    .badge-updated { background: #fef3c7; color: #92400e; }
    .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .image-container { text-align: center; }
    .image-label { font-size: 0.9em; color: #6b7280; margin-bottom: 8px; }
    img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; }
    .metrics { font-family: monospace; font-size: 0.85em; color: #374151; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="summary">
    <div class="stat passed">Passed: ${results.filter(r => r.passed).length}</div>
    <div class="stat failed">Failed: ${results.filter(r => (r.passed === false) || (r.success === false && !r.baselineCreated && !r.baselineUpdated)).length}</div>
    <div class="stat created">Baselines Created: ${results.filter(r => r.baselineCreated).length}</div>
    <div class="stat updated">Baselines Updated: ${results.filter(r => r.baselineUpdated).length}</div>
  </div>

  ${results.map(r => {
    if (!includePassed && r.passed && !r.baselineCreated && !r.baselineUpdated) return ''
    
    let badgeClass = 'badge-pass'
    let badgeText = 'PASSED'
    if (r.passed === false || (r.success === false && !r.baselineCreated && !r.baselineUpdated)) {
      badgeClass = 'badge-fail'
      badgeText = 'FAILED'
    } else if (r.baselineCreated) {
      badgeClass = 'badge-new'
      badgeText = 'BASELINE CREATED'
    } else if (r.baselineUpdated) {
      badgeClass = 'badge-updated'
      badgeText = 'BASELINE UPDATED'
    }

    let imagesHtml = ''
    if (r.diffImage) {
      const baselineB64 = r.baselineMetadata ? `data:image/png;base64,${toBase64(r.baselineMetadata.screenshot || '')}` : ''
      const currentB64 = r.currentScreenshot ? `data:image/png;base64,${toBase64(r.currentScreenshot)}` : ''
      const diffB64 = `data:image/png;base64,${toBase64(r.diffImage)}`
      
      imagesHtml = `
        <div class="images">
          <div class="image-container">
            <div class="image-label">Baseline</div>
            <img src="${baselineB64}" alt="Baseline" />
          </div>
          <div class="image-container">
            <div class="image-label">Current</div>
            <img src="${currentB64}" alt="Current" />
          </div>
          <div class="image-container">
            <div class="image-label">Diff (${r.diffPercent}%)</div>
            <img src="${diffB64}" alt="Diff" />
          </div>
        </div>
      `
    }

    return `
    <div class="test-case">
      <div class="test-header">
        <span class="test-name">${r.name || r.key}</span>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      ${r.url ? `<div class="metrics">URL: ${r.url}</div>` : ''}
      ${r.diffPercent ? `<div class="metrics">Diff: ${r.diffPercent}% (${r.diffPixels}/${r.totalPixels} pixels) | Threshold: ${r.threshold}</div>` : ''}
      ${r.error ? `<div class="metrics" style="color: #ef4444;">Error: ${r.error}</div>` : ''}
      ${imagesHtml}
    </div>
    `}).join('')}
</body>
</html>`

  return html
}

export const visualRegressionTool = {
  schema: {
    type: 'function',
    function: {
      name: 'visual_regression',
      description: 'Visual regression testing: capture screenshots and compare against baselines to detect UI changes.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['compare', 'capture_baseline', 'list_baselines', 'delete_baseline', 'run_suite', 'generate_report'],
            description: 'Action to perform',
          },
          url: { type: 'string', description: 'URL to navigate to for capture/compare' },
          baselineKey: { type: 'string', description: 'Key identifying the baseline' },
          threshold: { type: 'number', description: 'Difference threshold 0-1 (default 0.1)', minimum: 0, maximum: 1 },
          waitForSelector: { type: 'string', description: 'CSS selector to wait for before screenshot' },
          testCases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                url: { type: 'string' },
                baselineKey: { type: 'string' },
                waitForSelector: { type: 'string' },
                threshold: { type: 'number' },
              },
              required: ['name', 'url'],
            },
            description: 'Test cases for run_suite action',
          },
          updateBaselines: { type: 'boolean', description: 'For run_suite: update baselines instead of comparing' },
          continueOnFailure: { type: 'boolean', description: 'For run_suite: continue after first failure' },
          includePassed: { type: 'boolean', description: 'For generate_report: include passing tests in report' },
        },
        required: ['action'],
      },
    },
  },
  async execute({ action, url, baselineKey, threshold = 0.1, waitForSelector, testCases = [], updateBaselines = false, continueOnFailure = true, includePassed = true }) {
    switch (action) {
      case 'compare':
        if (!url || !baselineKey) return { success: false, error: 'url and baselineKey required for compare' }
        return await captureAndCompare({ url, baselineKey, waitForSelector, threshold })
      case 'capture_baseline':
        if (!url || !baselineKey) return { success: false, error: 'url and baselineKey required for capture_baseline' }
        const navResult = await browserControlTool.execute({ action: 'navigate', url })
        if (!navResult.success) return { success: false, error: navResult.error }
        if (waitForSelector) {
          const waitResult = await browserControlTool.execute({ action: 'wait_for', selector: waitForSelector, timeout: 10000 })
          if (!waitResult.success) return { success: false, error: waitResult.error }
        }
        const screenshotResult = await browserControlTool.execute({ action: 'screenshot', fullPage: true })
        if (!screenshotResult.success || !screenshotResult.screenshot) {
          return { success: false, error: 'Screenshot capture failed' }
        }
        saveBaseline(baselineKey, screenshotResult.screenshot, { url, width: screenshotResult.width, height: screenshotResult.height })
        return { success: true, baselineKey, message: 'Baseline captured and saved' }
      case 'list_baselines':
        return { success: true, baselines: listBaselines() }
      case 'delete_baseline':
        if (!baselineKey) return { success: false, error: 'baselineKey required' }
        return { success: deleteBaseline(baselineKey) }
      case 'run_suite':
        if (!testCases.length) return { success: false, error: 'testCases array required for run_suite' }
        return await runVisualRegressionSuite(testCases, { updateBaselines, continueOnFailure })
      case 'generate_report':
        // Requires results from a previous run_suite
        return { success: false, error: 'generate_report requires results from run_suite - not implemented as standalone' }
      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}
