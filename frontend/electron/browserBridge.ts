// browserBridge.ts — Playwright-based browser automation bridge for Yogatik
// REFACTORED: Full TypeScript types, automatic cleanup, crash handlers, periodic stale session cleanup

import { ipcMain, BrowserWindow } from 'electron'
import { browserRateLimiter } from './utils'
import { validatePath } from './utils'

// ============================================================================
// Types
// ============================================================================

export interface BrowserSession {
  id: string
  browserType: 'chromium' | 'firefox' | 'webkit'
  headless: boolean
  viewport?: { width: number; height: number }
  userAgent?: string
  createdAt: number
}

export interface NavigateRequest {
  sessionId: string
  url: string
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
}

export interface ScreenshotRequest {
  sessionId: string
  path?: string
  fullPage?: boolean
  clip?: { x: number; y: number; width: number; height: number }
  type?: 'png' | 'jpeg'
  quality?: number
}

export interface EvaluateRequest {
  sessionId: string
  script: string
  args?: any[]
}

export interface ClickRequest {
  sessionId: string
  selector: string
  options?: { delay?: number; button?: 'left' | 'right' | 'middle'; clickCount?: number }
}

export interface TypeRequest {
  sessionId: string
  selector: string
  text: string
  options?: { delay?: number }
}

export interface WaitRequest {
  sessionId: string
  selector?: string
  timeout?: number
  state?: 'attached' | 'detached' | 'visible' | 'hidden'
  function?: string
}

export interface PdfRequest {
  sessionId: string
  path: string
  options?: {
    format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'
    landscape?: boolean
    margin?: { top?: string; right?: string; bottom?: string; left?: string }
    printBackground?: boolean
    scale?: number
  }
}

export interface Cookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface StorageState {
  cookies: Cookie[]
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>
}

// Playwright types for type safety
interface PlaywrightBrowser {
  close(): Promise<void>
  newContext(options?: any): Promise<PlaywrightContext>
}

interface PlaywrightContext {
  close(): Promise<void>
  newPage(): Promise<PlaywrightPage>
  addCookies(cookies: Cookie[]): Promise<void>
  clearCookies(): Promise<void>
  storageState(): Promise<StorageState>
  pages(): PlaywrightPage[]
}

interface PlaywrightPage {
  close(): Promise<void>
  goto(url: string, options?: any): Promise<any>
  goBack(): Promise<void>
  goForward(): Promise<void>
  reload(): Promise<void>
  screenshot(options?: any): Promise<Buffer>
  pdf(options?: any): Promise<Buffer>
  evaluate(script: string, args?: any[]): Promise<any>
  click(selector: string, options?: any): Promise<void>
  fill(selector: string, value: string, options?: any): Promise<void>
  waitForSelector(selector: string, options?: any): Promise<any>
  waitForFunction(fn: string, options?: any): Promise<any>
  title(): Promise<string>
  url(): string
  on(event: string, listener: (...args: any[]) => void): this
  keyboard: { press(key: string, options?: any): Promise<void>; type(text: string, options?: any): Promise<void> }
  mouse: { click(x: number, y: number, options?: any): Promise<void> }
  setViewportSize(viewport: { width: number; height: number }): Promise<void>
  bringToFront(): Promise<void>
  evaluateHandle(script: string, ...args: any[]): Promise<any>
}

interface PlaywrightModule {
  chromium: { launch(options: any): Promise<PlaywrightBrowser> }
  firefox: { launch(options: any): Promise<PlaywrightBrowser> }
  webkit: { launch(options: any): Promise<PlaywrightBrowser> }
}

// ============================================================================
// Session Management with Automatic Cleanup
// ============================================================================

const sessions = new Map<string, BrowserSession>()
const browsers = new Map<string, PlaywrightBrowser>()
const contexts = new Map<string, PlaywrightContext>()
const pages = new Map<string, PlaywrightPage>()
const pageCrashHandlers = new Map<string, () => void>()

let playwright: PlaywrightModule | null = null
let mainWindow: BrowserWindow | null = null
let cleanupInterval: NodeJS.Timeout | null = null

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

async function getPlaywright(): Promise<PlaywrightModule> {
  if (!playwright) {
    try {
      playwright = require('playwright') as PlaywrightModule
    } catch {
      throw new Error('Playwright not installed. Run: npm install playwright')
    }
  }
  return playwright
}

function generateSessionId(): string {
  return `browser_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// Cleanup a single session completely
async function cleanupSession(sessionId: string): Promise<void> {
  const page = pages.get(sessionId)
  if (page) {
    const handler = pageCrashHandlers.get(sessionId)
    if (handler) {
      try { page.off('crash', handler) } catch {}
    }
    try { await page.close() } catch {}
    pages.delete(sessionId)
  }

  const context = contexts.get(sessionId)
  if (context) {
    try { await context.close() } catch {}
    contexts.delete(sessionId)
  }

  const browser = browsers.get(sessionId)
  if (browser) {
    try { await browser.close() } catch {}
    browsers.delete(sessionId)
  }

  sessions.delete(sessionId)
  pageCrashHandlers.delete(sessionId)
}

// Periodic cleanup of stale sessions (30 min idle)
function startPeriodicCleanup(): void {
  if (cleanupInterval) return
  cleanupInterval = setInterval(async () => {
    const now = Date.now()
    const MAX_AGE = 30 * 60 * 1000 // 30 minutes

    for (const [sessionId, session] of sessions) {
      if (now - session.createdAt > MAX_AGE) {
        console.log(`[browserBridge] Cleaning up stale session: ${sessionId}`)
        await cleanupSession(sessionId)
      }
    }
  }, 60_000)
}

function stopPeriodicCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerBrowserBridge(): void {
  startPeriodicCleanup()

  // ---- Launch browser ----
  ipcMain.handle('browser:launch', async (_event, options: {
    browserType?: 'chromium' | 'firefox' | 'webkit'
    headless?: boolean
    viewport?: { width: number; height: number }
    userAgent?: string
    args?: string[]
    proxy?: { server: string; username?: string; password?: string }
  }): Promise<BrowserSession> => {
    if (!browserRateLimiter.tryConsume('browser:launch')) {
      throw new Error('Rate limit exceeded for browser:launch')
    }

    const pw = await getPlaywright()
    const { browserType = 'chromium', headless = true, viewport, userAgent, args = [], proxy } = options

    const launchOptions: any = { headless, args }
    if (proxy) launchOptions.proxy = proxy

    const browser = await pw[browserType].launch(launchOptions)
    const sessionId = generateSessionId()

    const session: BrowserSession = {
      id: sessionId,
      browserType,
      headless,
      viewport,
      userAgent,
      createdAt: Date.now()
    }

    sessions.set(sessionId, session)
    browsers.set(sessionId, browser)

    const context = await browser.newContext({
      viewport,
      userAgent,
      ignoreHTTPSErrors: true
    })
    contexts.set(sessionId, context)

    const page = await context.newPage()
    pages.set(sessionId, page)

    // Track crash handler for cleanup
    const crashHandler = () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser:crash', { sessionId })
      }
      // Auto-cleanup on crash
      cleanupSession(sessionId).catch(console.error)
    }
    page.on('crash', crashHandler)
    pageCrashHandlers.set(sessionId, crashHandler)

    return session
  })

  // ---- Close browser with full cleanup ----
  ipcMain.handle('browser:close', async (_event, sessionId: string): Promise<boolean> => {
    if (!browserRateLimiter.tryConsume('browser:close')) {
      throw new Error('Rate limit exceeded for browser:close')
    }

    await cleanupSession(sessionId)
    return true
  })

  // ---- List sessions ----
  ipcMain.handle('browser:list', async (): Promise<BrowserSession[]> => {
    return Array.from(sessions.values())
  })

  // ---- Get session ----
  ipcMain.handle('browser:get', async (_event, sessionId: string): Promise<BrowserSession | null> => {
    return sessions.get(sessionId) || null
  })

  // ---- Navigate with timeout handling ----
  ipcMain.handle('browser:navigate', async (_event, request: NavigateRequest): Promise<{ url: string; title: string }> => {
    if (!browserRateLimiter.tryConsume('browser:navigate')) {
      throw new Error('Rate limit exceeded for browser:navigate')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { url, waitUntil = 'load', timeout = 30000 } = request

    try {
      const response = await page.goto(url, { waitUntil, timeout })
      return {
        url: page.url(),
        title: await page.title()
      }
    } catch (error) {
      throw new Error(`Navigation failed for session ${request.sessionId}: ${error.message}`)
    }
  })

  // ---- Go back/forward/reload ----
  ipcMain.handle('browser:back', async (_event, sessionId: string): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.goBack()
  })

  ipcMain.handle('browser:forward', async (_event, sessionId: string): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.goForward()
  })

  ipcMain.handle('browser:reload', async (_event, sessionId: string): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.reload()
  })

  // ---- Screenshot with proper buffer handling ----
  ipcMain.handle('browser:screenshot', async (_event, request: ScreenshotRequest): Promise<{ path: string; data: string }> => {
    if (!browserRateLimiter.tryConsume('browser:screenshot')) {
      throw new Error('Rate limit exceeded for browser:screenshot')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { path, fullPage = false, clip, type = 'png', quality = 90 } = request

    const options: any = { fullPage, type }
    if (clip) options.clip = clip
    if (type === 'jpeg') options.quality = quality

    const buffer = await page.screenshot(options)

    let savedPath = ''
    if (path) {
      const safePath = validatePath(path)
      const { writeFileSync } = require('fs')
      writeFileSync(safePath, buffer)
      savedPath = safePath
    }

    return {
      path: savedPath,
      data: buffer.toString('base64')
    }
  })

  // ---- PDF ----
  ipcMain.handle('browser:pdf', async (_event, request: PdfRequest): Promise<{ path: string; data: string }> => {
    if (!browserRateLimiter.tryConsume('browser:pdf')) {
      throw new Error('Rate limit exceeded for browser:pdf')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { path, options = {} } = request
    const safePath = validatePath(path)

    const pdfOptions: any = {
      path: safePath,
      format: options.format || 'A4',
      landscape: options.landscape || false,
      printBackground: options.printBackground !== false,
      scale: options.scale || 1,
      margin: options.margin || { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
    }

    const buffer = await page.pdf(pdfOptions)

    return {
      path: safePath,
      data: buffer.toString('base64')
    }
  })

  // ---- Evaluate JavaScript ----
  ipcMain.handle('browser:evaluate', async (_event, request: EvaluateRequest): Promise<any> => {
    if (!browserRateLimiter.tryConsume('browser:evaluate')) {
      throw new Error('Rate limit exceeded for browser:evaluate')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { script, args = [] } = request
    try {
      const result = await page.evaluate(script, ...args)
      // Ensure result is serializable
      return JSON.parse(JSON.stringify(result))
    } catch (error) {
      throw new Error(`Script evaluation failed: ${error.message}`)
    }
  })

  // ---- Click ----
  ipcMain.handle('browser:click', async (_event, request: ClickRequest): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:click')) {
      throw new Error('Rate limit exceeded for browser:click')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { selector, options = {} } = request
    await page.click(selector, options)
  })

  // ---- Type ----
  ipcMain.handle('browser:type', async (_event, request: TypeRequest): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:type')) {
      throw new Error('Rate limit exceeded for browser:type')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { selector, text, options = {} } = request
    await page.fill(selector, text, options)
  })

  // ---- Wait ----
  ipcMain.handle('browser:wait', async (_event, request: WaitRequest): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:wait')) {
      throw new Error('Rate limit exceeded for browser:wait')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { selector, timeout = 30000, state = 'visible', function: fn } = request

    if (selector) {
      await page.waitForSelector(selector, { state, timeout })
    } else if (fn) {
      await page.waitForFunction(fn, { timeout })
    } else {
      throw new Error('Either selector or function is required')
    }
  })

  // ---- Cookies ----
  ipcMain.handle('browser:cookies:get', async (_event, sessionId: string, urls?: string[]): Promise<Cookie[]> => {
    if (!browserRateLimiter.tryConsume('browser:cookies:get')) {
      throw new Error('Rate limit exceeded for browser:cookies:get')
    }

    const context = contexts.get(sessionId)
    if (!context) throw new Error(`Session ${sessionId} not found`)
    return await context.cookies(urls)
  })

  ipcMain.handle('browser:cookies:set', async (_event, sessionId: string, cookies: Cookie[]): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:cookies:set')) {
      throw new Error('Rate limit exceeded for browser:cookies:set')
    }

    const context = contexts.get(sessionId)
    if (!context) throw new Error(`Session ${sessionId} not found`)
    await context.addCookies(cookies)
  })

  ipcMain.handle('browser:cookies:clear', async (_event, sessionId: string): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:cookies:clear')) {
      throw new Error('Rate limit exceeded for browser:cookies:clear')
    }

    const context = contexts.get(sessionId)
    if (!context) throw new Error(`Session ${sessionId} not found`)
    await context.clearCookies()
  })

  // ---- Storage State (for auth persistence) ----
  ipcMain.handle('browser:storage:get', async (_event, sessionId: string): Promise<StorageState> => {
    const context = contexts.get(sessionId)
    if (!context) throw new Error(`Session ${sessionId} not found`)
    return await context.storageState()
  })

  ipcMain.handle('browser:storage:set', async (_event, sessionId: string, state: StorageState): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:storage:set')) {
      throw new Error('Rate limit exceeded for browser:storage:set')
    }

    const browser = browsers.get(sessionId)
    if (!browser) throw new Error(`Session ${sessionId} not found`)

    // Close old context and create new one with storage state
    const oldContext = contexts.get(sessionId)
    if (oldContext) {
      await oldContext.close()
    }

    const pw = await getPlaywright()
    const session = sessions.get(sessionId)
    const newContext = await browser.newContext({
      viewport: session?.viewport,
      userAgent: session?.userAgent,
      ignoreHTTPSErrors: true,
      storageState: state
    })
    contexts.set(sessionId, newContext)

    const oldPage = pages.get(sessionId)
    if (oldPage) {
      await oldPage.close()
    }

    const newPage = await newContext.newPage()
    pages.set(sessionId, newPage)

    newPage.on('crash', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser:crash', { sessionId })
      }
    })
  })

  // ---- Keyboard / Mouse ----
  ipcMain.handle('browser:keyboard:press', async (_event, sessionId: string, key: string, options?: { delay?: number }): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.keyboard.press(key, options)
  })

  ipcMain.handle('browser:keyboard:type', async (_event, sessionId: string, text: string, options?: { delay?: number }): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.keyboard.type(text, options)
  })

  ipcMain.handle('browser:mouse:click', async (_event, sessionId: string, x: number, y: number, options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number; delay?: number }): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.mouse.click(x, y, options)
  })

  // ---- Viewport ----
  ipcMain.handle('browser:viewport:set', async (_event, sessionId: string, viewport: { width: number; height: number }): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.setViewportSize(viewport)
  })

  // ---- User Agent ----
  ipcMain.handle('browser:useragent:get', async (_event, sessionId: string): Promise<string> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    return await page.evaluate(() => navigator.userAgent)
  })

  // ---- Bring to front (for headed mode) ----
  ipcMain.handle('browser:bringToFront', async (_event, sessionId: string): Promise<void> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    await page.bringToFront()
  })

  // ---- New page / tab ----
  ipcMain.handle('browser:newPage', async (_event, sessionId: string): Promise<string> => {
    if (!browserRateLimiter.tryConsume('browser:newPage')) {
      throw new Error('Rate limit exceeded for browser:newPage')
    }

    const context = contexts.get(sessionId)
    if (!context) throw new Error(`Session ${sessionId} not found`)

    const newPage = await context.newPage()
    const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    pages.set(pageId, newPage)

    newPage.on('crash', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser:crash', { sessionId: pageId })
      }
    })

    return pageId
  })

  // ---- Switch page ----
  ipcMain.handle('browser:switchPage', async (_event, sessionId: string, pageId: string): Promise<void> => {
    const page = pages.get(pageId)
    if (!page) throw new Error(`Page ${pageId} not found`)
    await page.bringToFront()
  })

  // ---- Close page ----
  ipcMain.handle('browser:closePage', async (_event, pageId: string): Promise<boolean> => {
    const page = pages.get(pageId)
    if (!page) return false
    await page.close()
    pages.delete(pageId)
    return true
  })

  // ---- Get all pages in session ----
  ipcMain.handle('browser:pages', async (_event, sessionId: string): Promise<string[]> => {
    const context = contexts.get(sessionId)
    if (!context) throw new Error(`Session ${sessionId} not found`)
    return context.pages().map((p: any) => {
      for (const [id, pg] of pages.entries()) {
        if (pg === p) return id
      }
      return ''
    }).filter(Boolean)
  })

  // ---- Shutdown handler for graceful cleanup ----
  ipcMain.on('browser:shutdown', async () => {
    stopPeriodicCleanup()
    const sessionIds = Array.from(sessions.keys())
    await Promise.all(sessionIds.map(id => cleanupSession(id)))
  })
}

export { cleanupSession, startPeriodicCleanup, stopPeriodicCleanup }