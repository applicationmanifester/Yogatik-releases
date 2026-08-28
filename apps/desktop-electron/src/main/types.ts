export type BrowserType = 'chromium' | 'firefox' | 'webkit'

export interface Viewport {
  width: number
  height: number
  deviceScaleFactor?: number
  isMobile?: boolean
  hasTouch?: boolean
  isLandscape?: boolean
}

export interface LaunchBrowserRequest {
  type?: BrowserType
  headless?: boolean
  args?: string[]
  viewport?: Viewport
  userAgent?: string
  proxy?: { server: string; username?: string; password?: string }
  downloadsPath?: string
  slowMo?: number
  devtools?: boolean
  channel?: 'stable' | 'beta' | 'dev' | 'canary'
  executablePath?: string
}

export interface LaunchBrowserResponse {
  success: boolean
  sessionId?: string
  error?: string
}

export interface CloseBrowserRequest {
  sessionId: string
}

export interface CloseBrowserResponse {
  success: boolean
  error?: string
}

export interface ListSessionsResponse {
  sessions: BrowserSession[]
}

export interface BrowserSession {
  id: string
  type: BrowserType
  headless: boolean
  createdAt: number
  pages: BrowserPage[]
}

export interface BrowserPage {
  id: string
  sessionId: string
  url: string
  title: string
  isClosed: boolean
  viewport?: Viewport
}

export interface GetSessionRequest {
  sessionId: string
}

export interface GetSessionResponse {
  session?: BrowserSession
  error?: string
}

export interface NavigateRequest {
  sessionId: string
  pageId?: string
  url: string
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
  referer?: string
}

export interface NavigateResponse {
  success: boolean
  pageId?: string
  url?: string
  error?: string
}

export interface GoBackRequest {
  sessionId: string
  pageId?: string
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
}

export interface GoForwardRequest {
  sessionId: string
  pageId?: string
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
}

export interface ReloadRequest {
  sessionId: string
  pageId?: string
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
}

export interface NavigationResponse {
  success: boolean
  url?: string
  error?: string
}

export interface ClickRequest {
  sessionId: string
  pageId?: string
  selector: string
  options?: {
    button?: 'left' | 'right' | 'middle'
    clickCount?: number
    delay?: number
    force?: boolean
    modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[]
    position?: { x: number; y: number }
    timeout?: number
    trial?: boolean
  }
}

export interface ClickResponse {
  success: boolean
  error?: string
}

export interface TypeRequest {
  sessionId: string
  pageId?: string
  selector: string
  text: string
  options?: {
    delay?: number
    timeout?: number
    noWaitAfter?: boolean
  }
}

export interface TypeResponse {
  success: boolean
  error?: string
}

export interface KeyboardRequest {
  sessionId: string
  pageId?: string
  action: 'press' | 'down' | 'up' | 'type'
  key: string
  options?: {
    delay?: number
    text?: string
    modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[]
  }
}

export interface KeyboardResponse {
  success: boolean
  error?: string
}

export interface MouseRequest {
  sessionId: string
  pageId?: string
  action: 'move' | 'down' | 'up' | 'wheel'
  x?: number
  y?: number
  options?: {
    button?: 'left' | 'right' | 'middle'
    clickCount?: number
    deltaX?: number
    deltaY?: number
    modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[]
    steps?: number
  }
}

export interface MouseResponse {
  success: boolean
  error?: string
}

export interface WaitForSelectorRequest {
  sessionId: string
  pageId?: string
  selector: string
  options?: {
    state?: 'attached' | 'detached' | 'visible' | 'hidden'
    timeout?: number
    strict?: boolean
  }
}

export interface WaitForSelectorResponse {
  success: boolean
  error?: string
}

export interface WaitForFunctionRequest {
  sessionId: string
  pageId?: string
  function: string
  args?: any[]
  options?: {
    timeout?: number
    polling?: 'raf' | 'mutation' | number
  }
}

export interface WaitForFunctionResponse {
  success: boolean
  result?: any
  error?: string
}

export interface ScreenshotRequest {
  sessionId: string
  pageId?: string
  options?: {
    path?: string
    fullPage?: boolean
    clip?: { x: number; y: number; width: number; height: number }
    omitBackground?: boolean
    type?: 'png' | 'jpeg'
    quality?: number
    timeout?: number
  }
}

export interface ScreenshotResponse {
  success: boolean
  buffer?: Buffer
  path?: string
  error?: string
}

export interface PdfRequest {
  sessionId: string
  pageId?: string
  options?: {
    path?: string
    format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'
    width?: string | number
    height?: string | number
    printBackground?: boolean
    landscape?: boolean
    margin?: { top?: string | number; right?: string | number; bottom?: string | number; left?: string | number }
    pageRanges?: string
    preferCSSPageSize?: boolean
    timeout?: number
  }
}

export interface PdfResponse {
  success: boolean
  buffer?: Buffer
  path?: string
  error?: string
}

export interface GetContentRequest {
  sessionId: string
  pageId?: string
  format?: 'html' | 'text'
}

export interface GetContentResponse {
  success: boolean
  content?: string
  error?: string
}

export interface EvaluateRequest {
  sessionId: string
  pageId?: string
  expression: string
  args?: any[]
  returnByValue?: boolean
}

export interface EvaluateResponse {
  success: boolean
  result?: any
  error?: string
}

export interface AddScriptRequest {
  sessionId: string
  pageId?: string
  path?: string
  content?: string
  type?: 'module' | 'classic'
}

export interface AddScriptResponse {
  success: boolean
  error?: string
}

export interface ExposeFunctionRequest {
  sessionId: string
  pageId?: string
  name: string
  function: string
}

export interface ExposeFunctionResponse {
  success: boolean
  error?: string
}

export interface Cookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

export interface GetCookiesRequest {
  sessionId: string
  pageId?: string
  urls?: string[]
}

export interface GetCookiesResponse {
  success: boolean
  cookies?: Cookie[]
  error?: string
}

export interface SetCookieRequest {
  sessionId: string
  pageId?: string
  cookie: Cookie
}

export interface SetCookieResponse {
  success: boolean
  error?: string
}

export interface ClearCookiesRequest {
  sessionId: string
  pageId?: string
}

export interface ClearCookiesResponse {
  success: boolean
  error?: string
}

export interface StorageStateRequest {
  sessionId: string
  pageId?: string
}

export interface StorageStateResponse {
  success: boolean
  state?: { cookies: Cookie[]; origins: any[] }
  error?: string
}

export interface LoadStorageStateRequest {
  sessionId: string
  pageId?: string
  state: { cookies: Cookie[]; origins: any[] }
}

export interface LoadStorageStateResponse {
  success: boolean
  error?: string
}

export interface NewPageRequest {
  sessionId: string
  url?: string
}

export interface NewPageResponse {
  success: boolean
  pageId?: string
  error?: string
}

export interface SwitchPageRequest {
  sessionId: string
  pageId: string
}

export interface SwitchPageResponse {
  success: boolean
  error?: string
}

export interface ClosePageRequest {
  sessionId: string
  pageId: string
}

export interface ClosePageResponse {
  success: boolean
  error?: string
}

export interface ListPagesRequest {
  sessionId: string
}

export interface ListPagesResponse {
  success: boolean
  pages?: BrowserPage[]
  error?: string
}

export interface SetViewportRequest {
  sessionId: string
  pageId?: string
  viewport: Viewport
}

export interface SetViewportResponse {
  success: boolean
  error?: string
}

export interface SetUserAgentRequest {
  sessionId: string
  pageId?: string
  userAgent: string
}

export interface SetUserAgentResponse {
  success: boolean
  error?: string
}

export interface BringToFrontRequest {
  sessionId: string
  pageId?: string
}

export interface BringToFrontResponse {
  success: boolean
  error?: string
}