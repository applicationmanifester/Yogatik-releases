// Unified Configuration for Yogatik Browser
// Centralized constants and settings - single source of truth

const CONFIG = {
  // Browser limits
  browser: {
    maxSessions: 50,
    maxTabsPerSession: 20,
    sessionTTL: 30 * 60 * 1000, // 30 minutes idle cleanup
    tabLoadTimeout: 30000,
    navigationTimeout: 30000,
    hibernateAfterMs: 5 * 60 * 1000, // 5 minutes
  },

  // UI constants (synced with browserWindow.html CSS)
  ui: {
    tabBarHeight: 72,
    aiPanelWidth: 340,
    minWindowWidth: 380,
    minWindowHeight: 560,
    defaultWindowWidth: 1200,
    defaultWindowHeight: 820,
    sidebarWidth: 260,
    sidebarCollapsedWidth: 48,
  },

  // Performance tuning
  performance: {
    syncDebounceMs: 16, // ~60fps
    snapshotCacheTTL: 100, // ms
    maxRawNodes: 3000,
    maxTreeNodes: 800,
    maxTextLength: 120,
    adBlockCacheSize: 10000,
    cosmeticInjectionQueue: true,
  },

  // Security
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
  },

  // Ad blocker
  adBlocker: {
    enabled: true,
    cosmeticInjection: true,
    youtubeSkipper: true,
    cacheDecisions: true,
    easyListUrl: 'https://easylist.to/easylist/easylist.txt',
    easyListTimeout: 5000,
  },

  // IPC rate limits (per minute)
  rateLimits: {
    browserLaunch: { max: 10, windowMs: 60000 },
    browserNavigate: { max: 60, windowMs: 60000 },
    browserScreenshot: { max: 30, windowMs: 60000 },
    browserEvaluate: { max: 100, windowMs: 60000 },
    browserClose: { max: 20, windowMs: 60000 },
    companionActions: { max: 30, windowMs: 60000 },
    fsCommands: { max: 100, windowMs: 60000 },
    terminalCommands: { max: 30, windowMs: 60000 },
  },

  // Extensions
  extensions: {
    enabled: true,
    sampleExtensionName: 'sample-reader-enhancer',
  },

  // Reader mode
  readerMode: {
    enabled: true,
    minTextLength: 25,
    maxContentLength: 10000,
    minWordCount: 1,
  },
}

// Helper to get nested config
function getConfig(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], CONFIG)
}

module.exports = { CONFIG, getConfig }