/**
 * Browser Types — Shared type definitions for the browser subsystem
 */

export interface BrowserTab {
  id: string
  view: Electron.WebContentsView
  url: string
  title: string
  favicon?: string
  active: boolean
  audible: boolean
  muted: boolean
  loading: boolean
  suspended: boolean
  suspendedData?: TabSuspendedData
  epoch: number // For ref staleness detection
  history: string[]
  historyIndex: number
  zoomFactor: number
  bounds: Electron.Rectangle
  createdAt: number
  lastActiveAt: number
}

export interface TabSuspendedData {
  url: string
  title: string
  scrollX: number
  scrollY: number
  timestamp: number
  history: string[]
  historyIndex: number
  zoomFactor: number
}

export interface BrowserSession {
  key: string
  conversationId: string | null
  mode: 'window' | 'panel'
  win: Electron.BrowserWindow | null
  tabs: Map<string, BrowserTab>
  activeTabId: string | null
  bounds: Electron.Rectangle | null
  detached: boolean
  isHtmlFullScreen: boolean
  createdAt: number
  lastActivityAt: number
}

export interface BrowserConfig {
  maxSessions: number
  maxTabsPerSession: number
  sessionTTL: number
  tabLoadTimeout: number
  navigationTimeout: number
  hibernateAfterMs: number
  tabBarHeight: number
  newTabUrl: string
}

export interface DownloadRecord {
  id: string
  url: string
  filename: string
  mimeType: string
  totalBytes: number
  receivedBytes: number
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  startTime: number
  endTime?: number
  path?: string
  tabId: string
  sessionKey: string
}

export type TabAction = 
  | { type: 'new-tab'; url?: string }
  | { type: 'close-tab'; tabId: string }
  | { type: 'select-tab'; tabId: string }
  | { type: 'navigate'; tabId: string; url: string }
  | { type: 'back'; tabId: string }
  | { type: 'forward'; tabId: string }
  | { type: 'reload'; tabId: string }
  | { type: 'zoom'; tabId: string; factor: number }
  | { type: 'mute'; tabId: string; muted: boolean }
  | { type: 'suspend-tab'; tabId: string }
  | { type: 'restore-tab'; tabId: string }
  | { type: 'duplicate-tab'; tabId: string }
  | { type: 'pin-tab'; tabId: string; pinned: boolean }
  | { type: 'group-tabs'; tabIds: string[]; groupName: string }
  | { type: 'move-tab'; tabId: string; index: number };

export interface BrowserIpcChannels {
  'browser:tab-action': TabAction
  'browser:get-tabs': { sessionKey: string }
  'browser:create-session': { conversationId?: string; mode?: 'window' | 'panel' }
  'browser:destroy-session': { sessionKey: string }
  'browser:set-mode': { sessionKey: string; mode: 'window' | 'panel' }
  'browser:set-bounds': { sessionKey: string; bounds: Electron.Rectangle }
  'browser:sync-tab-bar': { sessionKey: string }
  'browser:download-started': DownloadRecord
  'browser:download-updated': DownloadRecord
  'browser:download-completed': DownloadRecord
  'browser:download-cancelled': { downloadId: string }
  'browser:page-title-updated': { tabId: string; title: string }
  'browser:page-favicon-updated': { tabId: string; favicon: string }
  'browser:loading-state-changed': { tabId: string; loading: boolean }
  'browser:audio-state-changed': { tabId: string; audible: boolean }
  'browser:crash': { tabId: string; killed: boolean }
  'browser:permission-request': { tabId: string; permission: string; callback: (granted: boolean) => void }
  'browser:ai-summarize': { tabId: string }
  'browser:ai-fill-form': { tabId: string; data: Record<string, string> }
  'browser:ai-extract': { tabId: string; selector: string }
  'browser:toggle-devtools': { tabId: string }
  'browser:print': { tabId: string }
}

// Default configuration
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  maxSessions: 50,
  maxTabsPerSession: 20,
  sessionTTL: 30 * 60 * 1000,
  tabLoadTimeout: 30_000,
  navigationTimeout: 30_000,
  hibernateAfterMs: 5 * 60 * 1000,
  tabBarHeight: 72,
  newTabUrl: '', // Will be set at runtime
}