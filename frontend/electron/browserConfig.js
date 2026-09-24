// Centralized Configuration for Yogatik Browser
// Single source of truth for all constants, limits, and feature flags

const CONFIG = {
  // Browser session limits
  browser: {
    maxSessions: 50,
    maxTabsPerSession: 20,
    sessionTTL: 30 * 60 * 1000, // 30 minutes idle cleanup
    tabLoadTimeout: 30_000,
    navigationTimeout: 30_000,
    hibernateAfterMs: 5 * 60 * 1000, // 5 minutes
  },

  // UI constants (must stay in sync with browserWindow.html CSS)
  ui: {
    tabBarHeight: 72,
    aiPanelWidth: 340,
    minWindowWidth: 380,
    minWindowHeight: 560,
    defaultWindowWidth: 1200,
    defaultWindowHeight: 820,
  },

  // Performance tuning
  performance: {
    syncDebounceMs: 16, // ~60fps max
    snapshotCacheTTL: 100, // ms
    maxRawNodes: 3000,
    maxTreeNodes: 800,
    maxTextLength: 120,
    adBlockCacheSize: 10000,
    cosmeticInjectionQueueSize: 100,
  },

  // Security settings
  security: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    cspEnabled: true,
    allowedCSPOrigins: [
      'file:',
      'http://localhost',
      'http://127.0.0.1',
      'yogatik:',
    ],
    preloadSandbox: true,
  },

  // Ad blocker configuration
  adBlocker: {
    enabled: true,
    cosmeticInjection: true,
    youtubeSkipper: true,
    cacheDecisions: true,
    easyListUrl: 'https://easylist.to/easylist/easylist.txt',
    easyListTimeout: 5000,
  },

  // IPC rate limits (requests per windowMs)
  rateLimits: {
    browserLaunch: { max: 10, windowMs: 60_000 },
    browserNavigate: { max: 60, windowMs: 60_000 },
    browserScreenshot: { max: 30, windowMs: 60_000 },
    browserEvaluate: { max: 100, windowMs: 60_000 },
    browserClose: { max: 30, windowMs: 60_000 },
    browserBackForward: { max: 100, windowMs: 60_000 },
    companionActions: { max: 30, windowMs: 60_000 },
    terminalCommands: { max: 30, windowMs: 60_000 },
    fsOperations: { max: 100, windowMs: 60_000 },
  },

  // Download settings
  downloads: {
    maxConcurrent: 5,
    defaultDirectory: null, // null = system default
    saveHistory: true,
    historyLimit: 1000,
  },

  // Tab hibernation
  hibernation: {
    enabled: true,
    afterMs: 5 * 60 * 1000, // 5 minutes
    saveScrollPosition: true,
    restoreOnActivate: true,
  },

  // Logging
  logging: {
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    enablePerformanceMarks: false,
  },
}

module.exports = CONFIG