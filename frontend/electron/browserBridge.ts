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

// ============================================================================
// Session Management
// ============================================================================

const sessions = new Map<string, BrowserSession>()
const browsers = new Map<string, any>()
const contexts = new Map<string, any>()
const pages = new Map<string, any>()

let playwright: any = null
let mainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

async function getPlaywright() {
  if (!playwright) {
    try {
      playwright = require('playwright')
    } catch {
      throw new Error('Playwright not installed. Run: npm install playwright')
    }
  }
  return playwright
}

function generateSessionId(): string {
  return `browser_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerBrowserBridge(): void {
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

    page.on('crash', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser:crash', { sessionId })
      }
    })

    return session
  })

  // ---- Close browser ----
  ipcMain.handle('browser:close', async (_event, sessionId: string): Promise<boolean> => {
    if (!browserRateLimiter.tryConsume('browser:close')) {
      throw new Error('Rate limit exceeded for browser:close')
    }

    const browser = browsers.get(sessionId)
    if (!browser) return false

    try {
      await browser.close()
    } catch {}

    sessions.delete(sessionId)
    browsers.delete(sessionId)
    contexts.delete(sessionId)
    pages.delete(sessionId)

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

  // ---- Navigate ----
  ipcMain.handle('browser:navigate', async (_event, request: NavigateRequest): Promise<{ url: string; title: string }> => {
    if (!browserRateLimiter.tryConsume('browser:navigate')) {
      throw new Error('Rate limit exceeded for browser:navigate')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { url, waitUntil = 'load', timeout = 30000 } = request
    const response = await page.goto(url, { waitUntil, timeout })

    return {
      url: page.url(),
      title: await page.title()
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

  // ---- Screenshot ----
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
    return await page.evaluate(script, ...args)
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

  // ---- Type text ----
  ipcMain.handle('browser:type', async (_event, request: TypeRequest): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:type')) {
      throw new Error('Rate limit exceeded for browser:type')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { selector, text, options = {} } = request
    await page.fill(selector, '', { force: true })
    await page.type(selector, text, options)
  })

  // ---- Wait for selector/function ----
  ipcMain.handle('browser:wait', async (_event, request: WaitRequest): Promise<void> => {
    if (!browserRateLimiter.tryConsume('browser:wait')) {
      throw new Error('Rate limit exceeded for browser:wait')
    }

    const page = pages.get(request.sessionId)
    if (!page) throw new Error(`Session ${request.sessionId} not found`)

    const { selector, timeout = 30000, state = 'visible', function: fn } = request

    if (selector) {
      await page.waitForSelector(selector, { timeout, state })
    } else if (fn) {
      await page.waitForFunction(fn, { timeout })
    }
  })

  // ---- Get page content ----
  ipcMain.handle('browser:content', async (_event, sessionId: string): Promise<string> => {
    if (!browserRateLimiter.tryConsume('browser:content')) {
      throw new Error('Rate limit exceeded for browser:content')
    }

    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)

    return await page.content()
  })

  // ---- Get page title ----
  ipcMain.handle('browser:title', async (_event, sessionId: string): Promise<string> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    return await page.title()
  })

  // ---- Get page URL ----
  ipcMain.handle('browser:url', async (_event, sessionId: string): Promise<string> => {
    const page = pages.get(sessionId)
    if (!page) throw new Error(`Session ${sessionId} not found`)
    return page.url()
  })

  // ---- Cookies ----
  ipcMain.handle('browser:cookies:get', async (_event, sessionId: string, urls?: string[]): Promise<Cookie[]> => {
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
      // Find the page ID for this page
      for (const [id, pg] of pages.entries()) {
        if (pg === p) return id
      }
      return ''
    }).filter(Boolean)
  })
}