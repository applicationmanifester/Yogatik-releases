import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { compareScreenshots, saveBaseline, loadBaseline, listBaselines, deleteBaseline, clearBaselines, captureAndCompare, runVisualRegressionSuite, generateVisualReport, visualRegressionTool } from './visualRegression'
import { browserControlTool } from './browserControl'

vi.mock('./browserControl', () => ({
  browserControlTool: {
    execute: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  clearBaselines()
})

afterEach(() => vi.unstubAllGlobals())

describe('visualRegression - core functions', () => {
  const baselinePNG = Buffer.from('baseline-png-data')
  const currentPNG = Buffer.from('current-png-data')

  it('saveBaseline stores screenshot with metadata', () => {
    const result = saveBaseline('test-key', baselinePNG, { url: 'https://example.com', width: 800, height: 600 })
    expect(result.success).toBe(true)
    expect(result.key).toBe('test-key')

    const loaded = loadBaseline('test-key')
    expect(loaded).toBeTruthy()
    expect(loaded.screenshot).toBe(baselinePNG)
    expect(loaded.metadata.url).toBe('https://example.com')
  })

  it('loadBaseline returns null for missing key', () => {
    expect(loadBaseline('nonexistent')).toBeNull()
  })

  it('listBaselines returns all stored baselines', () => {
    saveBaseline('key1', baselinePNG, { url: 'https://a.com' })
    saveBaseline('key2', baselinePNG, { url: 'https://b.com' })
    
    const list = listBaselines()
    expect(list).toHaveLength(2)
    expect(list.map(l => l.key)).toEqual(['key1', 'key2'])
  })

  it('deleteBaseline removes a specific baseline', () => {
    saveBaseline('key1', baselinePNG)
    saveBaseline('key2', baselinePNG)
    
    expect(deleteBaseline('key1')).toBe(true)
    expect(loadBaseline('key1')).toBeNull()
    expect(loadBaseline('key2')).toBeTruthy()
    expect(deleteBaseline('nonexistent')).toBe(false)
  })

  it('clearBaselines removes all baselines', () => {
    saveBaseline('key1', baselinePNG)
    saveBaseline('key2', baselinePNG)
    
    clearBaselines()
    expect(listBaselines()).toHaveLength(0)
  })

  it('compareScreenshots returns diff metrics when pixelmatch available', async () => {
    // Mock the dynamic imports
    vi.doMock('pngjs', () => ({
      PNG: {
        sync: {
          read: vi.fn(() => ({ width: 100, height: 100, data: new Uint8Array(40000) })),
          write: vi.fn(() => Buffer.from('diff-png-data')),
        },
      },
    }))
    vi.doMock('pixelmatch', () => ({ default: vi.fn(() => 100) }))
    
    const { compareScreenshots: compareFresh } = await import('./visualRegression')
    
    const result = await compareFresh(baselinePNG, currentPNG, { threshold: 0.1 })
    
    expect(result.success).toBe(true)
    expect(result.diffPixels).toBe(100)
    expect(result.totalPixels).toBe(10000)
    expect(result.diffRatio).toBe(0.01)
    expect(result.passed).toBe(true) // 1% < 10% threshold
    expect(result.diffImage).toBeDefined()
  })

  it('compareScreenshots detects dimension mismatch', async () => {
    vi.doMock('pngjs', () => ({
      PNG: {
        sync: {
          read: vi.fn()
            .mockReturnValueOnce({ width: 100, height: 100, data: new Uint8Array(40000) })
            .mockReturnValueOnce({ width: 200, height: 200, data: new Uint8Array(160000) }),
        },
      },
    }))
    
    const { compareScreenshots: compareFresh } = await import('./visualRegression')
    
    const result = await compareFresh(baselinePNG, currentPNG)
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('Dimension mismatch')
  })

  it('compareScreenshots fails when diff exceeds threshold', async () => {
    vi.doMock('pngjs', () => ({
      PNG: {
        sync: {
          read: vi.fn(() => ({ width: 100, height: 100, data: new Uint8Array(40000) })),
        },
      },
    }))
    vi.doMock('pixelmatch', () => ({ default: vi.fn(() => 2000) }))
    
    const { compareScreenshots: compareFresh } = await import('./visualRegression')
    
    const result = await compareFresh(baselinePNG, currentPNG, { threshold: 0.1 })
    
    expect(result.success).toBe(true)
    expect(result.passed).toBe(false)
    expect(result.diffRatio).toBe(0.2)
  })

  it('compareScreenshots falls back to byte comparison when pixelmatch unavailable', async () => {
    // Simulate import failure
    vi.doMock('pixelmatch', () => { throw new Error('Not available') })
    vi.doMock('pngjs', () => { throw new Error('Not available') })
    
    const { compareScreenshots: compareFresh } = await import('./visualRegression')
    
    const baseline = Buffer.from([1, 2, 3, 4, 5])
    const current = Buffer.from([1, 2, 3, 4, 6]) // 1 byte different
    
    const result = await compareFresh(baseline, current, { threshold: 0.1 })
    
    expect(result.success).toBe(true)
    expect(result.fallback).toBe('byte-comparison')
    expect(result.diffPixels).toBe(1)
    expect(result.totalPixels).toBe(5)
    expect(result.diffRatio).toBe(0.2)
  })
})

describe('visualRegression - captureAndCompare', () => {
  it('creates baseline when none exists', async () => {
    browserControlTool.execute
      .mockResolvedValueOnce({ success: true }) // navigate
      .mockResolvedValueOnce({ success: true, screenshot: Buffer.from('screenshot'), width: 800, height: 600 }) // screenshot
    
    const result = await captureAndCompare({ url: 'https://example.com', baselineKey: 'new-baseline' })
    
    expect(result.success).toBe(true)
    expect(result.baselineCreated).toBe(true)
    expect(result.message).toContain('saved as baseline')
    
    // Verify baseline was stored
    const baseline = loadBaseline('new-baseline')
    expect(baseline).toBeTruthy()
  })

  it('compares against existing baseline', async () => {
    // Pre-save a baseline
    saveBaseline('existing-baseline', Buffer.from('baseline'), { url: 'https://example.com' })
    
    browserControlTool.execute
      .mockResolvedValueOnce({ success: true }) // navigate
      .mockResolvedValueOnce({ success: true, screenshot: Buffer.from('current'), width: 800, height: 600 }) // screenshot
    
    vi.doMock('pngjs', () => ({
      PNG: { sync: { read: vi.fn(() => ({ width: 100, height: 100, data: new Uint8Array(40000) })) } },
    }))
    vi.doMock('pixelmatch', () => ({ default: vi.fn(() => 50) }))
    
    const { captureAndCompare: captureFresh } = await import('./visualRegression')
    const result = await captureFresh({ url: 'https://example.com', baselineKey: 'existing-baseline', threshold: 0.1 })
    
    expect(result.success).toBe(true)
    expect(result.passed).toBe(true)
    expect(result.baselineKey).toBe('existing-baseline')
  })

  it('handles navigation failure', async () => {
    browserControlTool.execute.mockResolvedValueOnce({ success: false, error: 'Network error' })
    
    const result = await captureAndCompare({ url: 'https://example.com', baselineKey: 'test' })
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('Navigation failed')
    expect(result.stage).toBe('navigate')
  })

  it('handles wait_for failure', async () => {
    browserControlTool.execute
      .mockResolvedValueOnce({ success: true }) // navigate
      .mockResolvedValueOnce({ success: false, error: 'Timeout' }) // wait_for
    
    const result = await captureAndCompare({ url: 'https://example.com', baselineKey: 'test', waitForSelector: '.content' })
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('Wait failed')
    expect(result.stage).toBe('wait_for')
  })

  it('handles screenshot failure', async () => {
    browserControlTool.execute
      .mockResolvedValueOnce({ success: true }) // navigate
      .mockResolvedValueOnce({ success: false }) // screenshot
    
    const result = await captureAndCompare({ url: 'https://example.com', baselineKey: 'test' })
    
    expect(result.success).toBe(false)
    expect(result.error).toBe('Screenshot capture failed')
    expect(result.stage).toBe('screenshot')
  })
})

describe('visualRegression - runVisualRegressionSuite', () => {
  it('runs multiple test cases and aggregates results', async () => {
    browserControlTool.execute.mockResolvedValue({ success: true, screenshot: Buffer.from('screenshot'), width: 800, height: 600 })
    
    vi.doMock('pngjs', () => ({ PNG: { sync: { read: vi.fn(() => ({ width: 100, height: 100, data: new Uint8Array(40000) })) } } }))
    vi.doMock('pixelmatch', () => ({ default: vi.fn(() => 50) }))
    
    const { runVisualRegressionSuite: runFresh } = await import('./visualRegression')
    
    const testCases = [
      { name: 'Homepage', url: 'https://example.com' },
      { name: 'About', url: 'https://example.com/about' },
      { name: 'Contact', url: 'https://example.com/contact' },
    ]
    
    const result = await runFresh(testCases)
    
    expect(result.success).toBe(true)
    expect(result.summary.total).toBe(3)
    expect(result.summary.passed).toBe(3)
    expect(result.summary.failed).toBe(0)
    expect(result.results).toHaveLength(3)
  })

  it('stops on first failure when continueOnFailure=false', async () => {
    browserControlTool.execute
      .mockResolvedValueOnce({ success: true, screenshot: Buffer.from('screenshot'), width: 800, height: 600 })
      .mockResolvedValueOnce({ success: false, error: 'Network error' })
      .mockResolvedValueOnce({ success: true, screenshot: Buffer.from('screenshot'), width: 800, height: 600 })
    
    vi.doMock('pngjs', () => ({ PNG: { sync: { read: vi.fn(() => ({ width: 100, height: 100, data: new Uint8Array(40000) })) } } }))
    vi.doMock('pixelmatch', () => ({ default: vi.fn(() => 50) }))
    
    const { runVisualRegressionSuite: runFresh } = await import('./visualRegression')
    
    const testCases = [
      { name: 'Test 1', url: 'https://example.com/1' },
      { name: 'Test 2', url: 'https://example.com/2' },
      { name: 'Test 3', url: 'https://example.com/3' },
    ]
    
    const result = await runFresh(testCases, { continueOnFailure: false })
    
    expect(result.summary.total).toBe(3)
    expect(result.results.length).toBeLessThanOrEqual(2) // Should stop after first failure
  })

  it('updateBaselines mode captures and saves new baselines', async () => {
    browserControlTool.execute.mockResolvedValue({ success: true, screenshot: Buffer.from('screenshot'), width: 800, height: 600 })
    
    const { runVisualRegressionSuite: runFresh } = await import('./visualRegression')
    
    const testCases = [
      { name: 'Test 1', url: 'https://example.com/1' },
      { name: 'Test 2', url: 'https://example.com/2' },
    ]
    
    const result = await runFresh(testCases, { updateBaselines: true })
    
    expect(result.success).toBe(true)
    expect(result.summary.baselinesUpdated).toBe(2)
    expect(result.results.every(r => r.baselineUpdated)).toBe(true)
  })
})

describe('visualRegression - generateVisualReport', () => {
  it('generates HTML report with summary and test cases', () => {
    const results = [
      { name: 'Test 1', key: 'test-1', passed: true, diffPercent: '0.50', diffPixels: 50, totalPixels: 10000, threshold: 0.1 },
      { name: 'Test 2', key: 'test-2', passed: false, diffPercent: '15.00', diffPixels: 1500, totalPixels: 10000, threshold: 0.1, error: null },
      { name: 'Test 3', key: 'test-3', baselineCreated: true, passed: true },
    ]
    
    const html = generateVisualReport(results, { title: 'Test Report', includePassed: true })
    
    expect(html).toContain('Test Report')
    expect(html).toContain('Passed: 2')
    expect(html).toContain('Failed: 1')
    expect(html).toContain('Baselines Created: 1')
    expect(html).toContain('Test 1')
    expect(html).toContain('Test 2')
    expect(html).toContain('Test 3')
    expect(html).toContain('PASSED')
    expect(html).toContain('FAILED')
    expect(html).toContain('BASELINE CREATED')
  })

  it('excludes passed tests when includePassed=false', () => {
    const results = [
      { name: 'PassingCase', passed: true },
      { name: 'FailingCase', passed: false },
    ]
    
    const html = generateVisualReport(results, { includePassed: false })
    
    expect(html).not.toContain('PassingCase')
    expect(html).toContain('FailingCase')
  })
})

describe('visualRegressionTool - tool handler', () => {
  it('handles list_baselines action', async () => {
    saveBaseline('key1', Buffer.from('test'))
    
    const result = await visualRegressionTool.execute({ action: 'list_baselines' })
    
    expect(result.success).toBe(true)
    expect(result.baselines).toHaveLength(1)
  })

  it('handles delete_baseline action', async () => {
    saveBaseline('key1', Buffer.from('test'))
    
    const result = await visualRegressionTool.execute({ action: 'delete_baseline', baselineKey: 'key1' })
    
    expect(result.success).toBe(true)
    expect(loadBaseline('key1')).toBeNull()
  })

  it('rejects delete_baseline without key', async () => {
    const result = await visualRegressionTool.execute({ action: 'delete_baseline' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('baselineKey required')
  })

  it('handles run_suite action', async () => {
    browserControlTool.execute.mockResolvedValue({ success: true, screenshot: Buffer.from('screenshot'), width: 800, height: 600 })
    
    vi.doMock('pngjs', () => ({ PNG: { sync: { read: vi.fn(() => ({ width: 100, height: 100, data: new Uint8Array(40000) })) } } }))
    vi.doMock('pixelmatch', () => ({ default: vi.fn(() => 50) }))
    
    const { visualRegressionTool: toolFresh } = await import('./visualRegression')
    
    const result = await toolFresh.execute({
      action: 'run_suite',
      testCases: [{ name: 'Test', url: 'https://example.com' }],
    })
    
    expect(result.success).toBe(true)
    expect(result.summary.total).toBe(1)
  })

  it('rejects run_suite without testCases', async () => {
    const result = await visualRegressionTool.execute({ action: 'run_suite' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('testCases array required')
  })
})
