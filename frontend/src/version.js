/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '4.3.1'
export const BUILD_DATE = 'September 2026'
export const APP_CODENAME = 'Yogatik 4.3.1 — Interactive Browser Automation, Agent Reflex & Desktop Sync'

export const APP_RELEASES = [
  {
    version: '4.3.1',
    title: 'Yogatik 4.3.1: Interactive Browser Automation, Agent Reflex Loop & Cross-Platform Desktop Sync',
    date: 'September 2, 2026',
    isLatest: true,
    highlights: [
      'Interactive Browser Automation: Full IPC-driven browser control with accessibility tree parsing, interactive element targeting, and visual viewport highlight overlay',
      'Autonomous Agent Reflex Loop: Added reflective self-evaluation heuristics to detect repetitive tool calls, inspect progress, and trigger corrective reasoning mid-turn',
      'Cross-Platform Desktop & Web Parity: Synchronized version 4.3.1 across web app, Windows installer (NSIS), macOS DMG, and Linux AppImage/Deb packages',
      'Hardened Native IPC Lifecycle: Safe window messaging across Electron main and renderer processes eliminating destroyed-window exceptions',
      'Optimized App State & Rendering: Clean separation of UI state helpers and reactive sub-agent pipelines for smooth chat execution',
    ],
    sections: [
      {
        category: '🌐 Browser Automation & Tools',
        items: [
          {
            title: 'Interactive DOM & Accessibility Tree',
            description: 'Agent directly queries and interacts with live browser tabs using semantic DOM trees and scoped ref keys.',
          },
          {
            title: 'Live Viewport Highlighting',
            description: 'Visual overlay displays targeted interactive elements in real-time during autonomous navigation.',
          },
        ],
      },
      {
        category: '🧠 Agent Intelligence & Reflex',
        items: [
          {
            title: 'Reflective Self-Evaluation',
            description: 'Integrated reflex heuristics detect stagnation, repetitive errors, and automatically guide the agent toward alternate strategies.',
          },
        ],
      },
    ],
  },
  {
    version: '4.2.0',
    title: 'Yogatik 4.2: Desktop Account Linking Fix, Faster Startup, Cleaner Codebase',
    date: 'September 2, 2026',
    isLatest: false,
    highlights: [
      'Fixed: desktop sign-in was authenticating to the CLOUD FUNCTION correctly but never actually authenticating its own local Firestore session — a credential-type mismatch (Firebase ID token fed to an API expecting Google\'s own OAuth token) meant every Firestore call from the desktop app went out unauthenticated and was silently rejected',
      'Fixed: API key / chat cloud sync between web and desktop for the same signed-in account — was a direct consequence of the auth bug above',
      'Fixed: desktop showing "Trial ended" / an upgrade prompt for accounts that are Pro on the web — the desktop\'s licence refresh was resending an already-expired sign-in token on every window-focus check instead of fetching a current one, and eventually the local licence cache aged out with nothing to renew it',
      'The "Trial ended" account screen now names the real reason (no licence yet, wrong account, clock rollback, awaiting renewal, etc.) instead of one label for every locked state',
      'Initial app bundle cut ~34% (1.79MB → 1.18MB, 587KB → 386KB gzipped) by loading the ~195-tool registry as its own background chunk instead of blocking first paint',
      'Fixed a crash on the payment-success return path (`?paid=1`) that could blank the whole app right after a customer paid',
      'Housekeeping: removed a dead pnpm monorepo scaffold left in the repo root; corrected stale docs that still described a second (Tauri) desktop shell — that shell was already retired',
    ],
    sections: [
      {
        category: '🔐 Account & Sync',
        items: [
          {
            title: 'Desktop Firestore authentication fixed',
            description: 'The desktop app now correctly authenticates its own local Firebase session on sign-in, instead of silently failing and sending every key/chat sync request unauthenticated.',
          },
          {
            title: 'Licence refresh uses a live token',
            description: 'Window-focus and background entitlement checks now fetch a current sign-in token instead of resending the one captured at sign-in, which expires within the hour.',
          },
          {
            title: 'Accurate locked-state messaging',
            description: 'The account page names the real reason a device is locked (no licence yet, wrong account, clock rollback, awaiting renewal) instead of always saying "trial ended".',
          },
        ],
      },
      {
        category: '⚡ Performance',
        items: [
          {
            title: 'Tool registry loads in the background',
            description: 'The ~195-tool registry now ships as its own chunk fetched right after first paint instead of blocking the initial page load — the main bundle is about a third smaller.',
          },
        ],
      },
    ],
  },
  {
    version: '4.1.5',
    title: 'Yogatik 4.1: Pro Payment Versioning, Cross-Platform Desktop Matrix & Unified Clean Provider Hub',
    date: 'September 2, 2026',
    isLatest: false,
    highlights: [
      'Pro Payment Versioning: File-system access restrictions and pro entitlements tied directly to live Paddle/Razorpay subscription verification',
      'Cross-Platform Git Builds: Complete multi-platform build matrices configured for Windows (.exe / NSIS), macOS (.dmg / universal), and Linux (.AppImage / .deb)',
      'Clean AI Provider Hub: Neutral provider directory with auto-loading models across custom API endpoints, Ollama daemons, and on-device WebLLMs',
      'Sanitized Read Aloud TTS: Model thinking/scratchpads, tool execution traces, and raw code blocks are automatically filtered from voice playback',
      'Universal Theme Synchronization: Zero-flash light/dark theme persistence across all application surfaces, command palettes, and static marketing pages',
    ],
    sections: [
      {
        category: '🔐 Pro Payment & Entitlements',
        items: [
          {
            title: 'Pro Feature Gate & Verification',
            description: 'Unlocks local workspace tools and advanced intelligence capabilities for active subscribers with immediate fallback for standard web users.',
          },
          {
            title: 'Live Subscription Days Counter',
            description: 'Accurate billing cycle and countdown display showing exact active subscription duration.',
          },
        ],
      },
      {
        category: '🌐 Cross-Platform Build Pipelines',
        items: [
          {
            title: 'Windows, macOS & Linux Multi-Targeting',
            description: 'Automated GitHub release builds producing signed Windows installers, macOS DMG bundles, and Linux AppImages.',
          },
        ],
      },
    ],
  },
  {
    version: '4.0.0',
    title: 'Yogatik 4.0: Dedicated Full-Page Dashboard, Live Paddle Billing, Left Sidebar Overhaul & Theme Sync',
    date: 'September 1, 2026',
    isLatest: false,
    highlights: [
      'Dedicated Full-Page Dashboard & Settings: Transformed settings and tool panels into a spacious, full-viewport dashboard experience with dedicated URLs (/app/settings, /app/billing, /app/agents, /app/usage, /app/mcp, /app/skills) and single-step Esc/Back-to-Chat navigation',
      'Clean Minimalist Sidebar: Streamlined conversation history view with date groupings, quick search, and an unobtrusive status and dashboard trigger',
      'Live Paddle & Razorpay Billing: Live subscription checkout ($9.99/mo & $99.99/yr), Google Secret Manager automated webhook signature verification, and instant pro entitlement activation',
      'Universal Light & Dark Theme Synchronization: Complete contrast and theme overhaul across the Universal Search Command Palette (Ctrl+K), Social Media & Domain Hub, and all modal surfaces',
      'Local AI Daemon & Multimodal Suite: Native ComfyUI daemon lifecycle, Windows Ollama binary resolution, and layered Live Voice & Vision HUD',
    ],
    sections: [
      {
        category: '🖥️ Dedicated Full-Page Dashboard',
        items: [
          {
            title: 'Full-Viewport Canvas & Clean Navigation',
            description: 'A 100vw × 100vh dedicated workspace providing plenty of breathing room for AI Providers, API key configurations, Model latency benchmarks, Billing history, Specialized Agents, MCP Servers, and Diagnostics logs.',
          },
          {
            title: 'Direct URL Routing & Deep Links',
            description: 'Direct deep-linkable URLs (/app/settings, /app/billing, /app/agents, /app/usage, /app/skills, /app/mcp, /app/plugins, /app/diagnostics, /app/capabilities) with full browser history synchronization.',
          },
          {
            title: 'Instant Back-to-Chat Escape',
            description: 'Seamless Esc keypress and topbar/sidebar "Back to Chat" actions that return you directly to your active chat without reloading state.',
          },
        ],
      },
      {
        category: '💳 Production Payments & Billing',
        items: [
          {
            title: 'Paddle Live Billing Gateway',
            description: 'Integrated live Paddle client token and products ($9.99/month and $99.99/year) with automated Google Secret Manager webhook fulfillment.',
          },
          {
            title: 'Domestic Razorpay UPI Integration',
            description: 'Full support for Indian domestic UPI and card checkout with live Razorpay payment processing.',
          },
        ],
      },
      {
        category: '🎨 Theme Synchronization & Polished UI',
        items: [
          {
            title: 'Universal Search & Palette Theme Sync',
            description: 'High-contrast light and dark themes for the Ctrl+K Command Palette with crisp typography and responsive shortcut pills.',
          },
          {
            title: 'Social Media & Domain Hub Light Mode',
            description: 'Clean light mode styling for Naukri, LinkedIn, YouTube, X, and Indeed search integration cards.',
          },
        ],
      },
    ],
  },
  {
    version: '3.22.4',
    title: 'Yogatik Ultra: ComfyUI Local Daemon, Deep Links, Layered Live HUD & Windows Ollama Path Resolution',
    date: 'September 1, 2026',
    isLatest: false,
    highlights: [
      'Local ComfyUI Daemon & Workflows: Added native ComfyUI daemon lifecycle management and direct HTTP workflow execution for on-device image generation',
      'Windows Ollama Path Resolution: Fixed user profile path discovery for Windows accounts with special usernames and added HTTP model streaming fallback',
      'Layered Live HUD Overlay: Re-architected Live call HUD into non-colliding bands with safe-area spacing and Live settings bottom sheet',
      'Deep Linking & CSP Whitelisting: Added yogatik:// deep link support and updated CSP connect-src with explicit local loopback daemon ports (11434, 1234, 8188)',
    ],
    sections: [
      {
        category: '🎨 ComfyUI & Local Generation',
        items: [
          {
            title: 'Native ComfyUI Daemon Support',
            description: 'Automatic detection, probing, and background launching of local ComfyUI instances on port 8188 with text2image workflows.',
          },
          {
            title: 'Windows Ollama Homedir Resolution',
            description: 'Accurate binary resolution via os.homedir() with HTTP polling fallback so local Ollama models are discovered flawlessly.',
          },
        ],
      },
      {
        category: '🎙️ Live Experience',
        items: [
          {
            title: 'Layered Live HUD & Settings',
            description: 'Non-colliding vertical bands for reticle, real-time speech captions, action chips, and call controls with sound cues.',
          },
        ],
      },
    ],
  },
]

/**
 * Check if the user has seen the current app version.
 */
export function hasSeenCurrentVersion() {
  try {
    const seen = localStorage.getItem('yogatik_last_seen_version')
    return seen === APP_VERSION
  } catch {
    return false
  }
}

/**
 * Mark the current app version as seen.
 */
export function markCurrentVersionAsSeen() {
  try {
    localStorage.setItem('yogatik_last_seen_version', APP_VERSION)
  } catch {}
}

/**
 * Get release info by version string or latest release.
 */
export function getRelease(version = APP_VERSION) {
  return APP_RELEASES.find(r => r.version === version) || APP_RELEASES[0]
}
