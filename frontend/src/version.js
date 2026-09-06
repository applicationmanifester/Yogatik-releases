/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '7.2.0'
export const BUILD_DATE = 'September 2026'
export const APP_CODENAME = 'Yogatik 7.2.0 — Built-in BitTorrent Engine, Yogatik Browser Search Bar & Grok Local Files Bridge'

export const APP_RELEASES = [
  {
    version: '7.2.0',
    title: 'Yogatik 7.2.0: Built-in BitTorrent Engine, Yogatik Browser Search Bar & Grok Local Files Bridge',
    date: 'September 6, 2026',
    isLatest: true,
    highlights: [
      'Built-in BitTorrent P2P Engine: Download open-source torrents and magnet links natively in Yogatik Desktop with real-time peer swarms, download speeds, DHT, pause/resume, and destination path selection',
      'Yogatik Browser Search & New Tab Start Page: Dedicated, clean start page with DuckDuckGo, Google, Bing, Brave, GitHub, and Wikipedia search engine switcher and speed-dial shortcuts',
      'Grok.com Local Folder Files Bundler: Send multiple project files and full subfolder source code directly into Grok with explicit anti-artifacts cloud sandbox redirection',
      'Entitlement Matrix & Safe Window Hardening: All BitTorrent and desktop browser capabilities classified as Free Always (FA) and protected by safeWindow communication',
      'Bulletproof Exception Recovery: Comprehensive type guards on local paths and dialog pickers preventing React error #31',
    ],
    sections: [
      {
        category: '🌊 Built-in BitTorrent Client',
        items: [
          {
            title: 'Native Electron P2P BitTorrent Engine',
            description: 'Direct swarm downloading for magnet URIs and torrent files with piece allocation, speed telemetry, and 1-click open folder in explorer.',
          },
          {
            title: 'Free Always Entitlement Guarantee',
            description: 'BitTorrent download management and destination directories remain 100% accessible to the user with zero subscription lockouts.',
          },
        ],
      },
      {
        category: '🧭 Yogatik Browser Search Engine',
        items: [
          {
            title: 'Built-in Start Page & Search Bar',
            description: 'Never opens to an empty black screen again — launches with a modern search bar, multi-engine switcher, and quick web shortcuts.',
          },
        ],
      },
      {
        category: '🤖 Grok Local Files & Folder Bridge',
        items: [
          {
            title: 'Multi-File Folder Bundler',
            description: 'Package and transmit source code files from any project folder directly into Grok.com with clear instructions to review the user code instead of looking in empty cloud sandbox folders.',
          },
        ],
      },
    ],
  },
  {
    version: '7.1.0',
    title: 'Yogatik 7.1.0: Grok.com & Gemini.com Studio Docks with Desktop Local Files Bridge',
    date: 'September 6, 2026',
    isLatest: false,
    highlights: [
      'Grok.com Studio Dock with Local Files Bridge: Seamless embedded session of grok.com with bidirectional workspace file injector, active Git diff review, and 1-click code block extraction to disk',
      'Gemini.com Studio Dock with Deep Shadow DOM Traversal: Full Google Web Components integration, real-time code extraction, and comment-based filepath auto-detection',
      'Dynamic WebContentsView Occlusion & Detachment: Electron native webview automatically detaches during modal overlays (Send File, Code Pull Drawer, Ctrl+K Palette) eliminating layering occlusions',
      'Mutual Dock Exclusivity & 1-Click Switcher: Prevents concurrent GPU/RAM spikes with instant toggle between Grok and Gemini studios directly in the header',
      'Safe Local File Bridge Guards: Automatic binary file filtration and 180KB safe chunking for high-speed IPC transmission',
      'Dynamic Precision Temperature Bar: Interactive slider in Personalization and Chat Composer supporting reasoning models and auto-retry error handling',
    ],
    sections: [
      {
        category: '🤖 Grok.com & Gemini.com Desktop Studio Docks',
        items: [
          {
            title: 'Embedded WebContentsView Studio Docks',
            description: 'Direct interactive sessions for grok.com and gemini.google.com docked alongside your workspace files with persistent session state and responsive layout.',
          },
          {
            title: 'Bidirectional Desktop Local Files Bridge',
            description: 'Read local workspace files or git diffs and inject formatted markdown prompts into Grok/Gemini; extract generated code blocks directly back into workspace files.',
          },
        ],
      },
      {
        category: '⚡ Native Performance & Occlusion Engine',
        items: [
          {
            title: 'Intelligent WebContentsView Occlusion Handling',
            description: 'Solves the Electron native window overlay limitation by dynamically detaching webviews during modal displays and re-attaching on dismiss.',
          },
          {
            title: 'Memory & Resource Isolation',
            description: 'Enforces mutual dock exclusivity and binary file filtering to keep memory low and prevent IPC transmission freezes.',
          },
        ],
      },
      {
        category: '🎨 UI Enhancements & Temperature Tuning',
        items: [
          {
            title: 'Precision Temperature Control Slider',
            description: 'Fine-tune model creativity directly from the Chat Composer or Personalization modal, with automatic compatibility fallbacks for fixed-temperature models.',
          },
          {
            title: '1-Click Studio Switcher',
            description: 'Instant header toggle to switch between Grok.com and Gemini.com without losing conversation context.',
          },
        ],
      },
    ],
  },
  {
    version: '6.3.0',
    title: 'Yogatik 6.3.0: Live Meeting Copilot, Multi-Agent Collaboration Board & Visual Browser Inspector',
    date: 'September 6, 2026',
    isLatest: false,
    highlights: [
      'Live Meeting Copilot in Desktop Companion: Real-time speaker audio transcription, interactive action items checklist, instant tactical whisper suggestions, and 1-click Markdown export',
      'Multi-Agent Collaboration Board: Responsive 4-column Kanban layout (Backlog, In Progress, Review, Completed) with real-time sync of sub-agents, autonomous planning steps, and team tasks',
      'Power Slash Command Palette: Instant slash commands (/deck, /doc, /anim, /audit, /cast, /swarm, /calc, /graph) with prompt auto-fill and composer focus',
      'Visual Browser DOM Live Inspector: In-app "Agent Eye" displaying accessibility element trees, interactive refs (ref_epoch_idx), and real-time browser action history',
      'Dual-Mode Semantic Memory & Knowledge Graph: Interactive radial visualization of quantized vector memory clusters and federated research citations with node inspection and memory pruning',
      'Post-Live Meeting Secretary & Smart Intent Router: Automatic categorization, executive briefings, and real-time model switching recommendations',
    ],
    sections: [
      {
        category: '🎙️ Live Meeting Copilot & Audio Intelligence',
        items: [
          {
            title: 'Passive Meeting Transcriber & Audio Visualizer',
            description: 'Monitors audio streams with real-time biometric equalizers, attributing statements to speakers and logging chronological transcripts.',
          },
          {
            title: 'Whisper Suggestion Engine & Action Checklist',
            description: 'Generates tactical replies and fact-checks on what speakers said, keeping a live checklist of meeting action items.',
          },
        ],
      },
      {
        category: '⚡ Multi-Agent Swarms & Visual Collaboration',
        items: [
          {
            title: 'Interactive Kanban Board',
            description: 'Organize tasks across Backlog, In Progress, Review, and Completed columns, seamlessly reflecting running sub-agents and planner steps.',
          },
          {
            title: 'Power Slash Commands & One-Click Templates',
            description: 'Fast trigger shortcuts for presentations (/deck), executive documents (/doc), animations (/anim), security audits (/audit), and TV casting (/cast).',
          },
        ],
      },
      {
        category: '🔍 Browser DOM Inspector & Semantic Knowledge Graph',
        items: [
          {
            title: 'Agent Eye Live Inspector',
            description: 'Inspect the browser DOM accessibility tree, element interaction refs, and recent browser automation actions in a dedicated slide-over drawer.',
          },
          {
            title: 'TurboQuant Vector Memory Visualizer',
            description: 'Dual-mode radial graph linking user preferences, architecture decisions, meeting notes, and research citations.',
          },
        ],
      },
    ],
  },
  {
    version: '6.2.0',
    title: 'Yogatik 6.2.0: LiveView Ambient HUD, Scanned PDF Auto-OCR & Universal File Extraction',
    date: 'September 5, 2026',
    isLatest: false,
    highlights: [
      'LiveView Ambient HUD & Perceptual Diffing: Floating pill HUD with biometric audio waveforms, dynamic 5 FPS frame scaling, and 70% bandwidth reduction via 64-bit pHash perceptual change detection',
      'Spatial Telestration & Live Stage: Real-time visual vectors, highlights, and annotations directly over screen feeds plus a synchronized workspace side stage for live code/document projections',
      'Scanned PDF Auto-OCR & RAG Persistence: Automatic detection of flattened raster tickets and image documents with 1.75x high-DPI offscreen canvas rendering and client-side Tesseract OCR indexing',
      'Universal Client-Side File Extraction: Direct extraction for Word (.docx), Excel spreadsheets (.xlsx/.xls), images via OCR, and 50+ programming languages with automated UTF-8 byte inspection fallback',
      'Multi-Platform Production Distributions: Automated release pipeline publishing standalone Windows (.exe), macOS Apple Silicon & Intel (.dmg/.zip), Linux (.AppImage/.deb), and self-hostable Web (.zip)',
    ],
    sections: [
      {
        category: '🎙️ LiveView High-Performance Architecture',
        items: [
          {
            title: 'Perceptual screen differencing & dynamic framerate',
            description: 'Adaptive 64-bit pHash comparison skips redundant frames to cut API token costs by 70%, dynamically scaling from 0.5 FPS up to 5 FPS on active screen changes.',
          },
          {
            title: 'Live Dock Overlay & interactive HUD',
            description: 'Ambient floating control pill provides live audio waveforms, instant device routing, and latency/FPS telemetry without obstructing active workspace windows.',
          },
          {
            title: 'Spatial telestration & workspace artifact stage',
            description: 'Visual vector annotations over screen captures and a dedicated live side-stage for interactive code and document reviews during audio calls.',
          },
        ],
      },
      {
        category: '📄 Document Intelligence & RAG Persist',
        items: [
          {
            title: 'Scanned PDF high-DPI auto-OCR',
            description: 'Flattened tickets, receipts, and graphic PDFs automatically render to an offscreen 1.75x canvas and run through client-side Tesseract OCR.',
          },
          {
            title: 'Guaranteed local IndexedDB storage',
            description: 'Extracted text from scanned documents is immediately chunked and indexed into IndexedDB, fully queryable via doc_list and doc_search.',
          },
        ],
      },
      {
        category: '🌐 Universal Document & File Support',
        items: [
          {
            title: 'Microsoft Word (.docx) & Excel (.xlsx)',
            description: 'Client-side XML parsing for Word documents and SheetJS tabular CSV conversion for multi-sheet Excel spreadsheets.',
          },
          {
            title: 'Universal text & code inspection',
            description: 'Automated byte inspection identifies any text-encoded file (including extensionless Dockerfile, Makefile, LICENSE) and indexes it cleanly.',
          },
        ],
      },
      {
        category: '🚀 Multi-Platform Releases & Web App',
        items: [
          {
            title: 'Standalone Web App zip & Desktop matrix',
            description: 'Automated GitHub Actions pipeline builds and publishes yogatik-web-dist.zip and installers for Windows, macOS, and Linux.',
          },
        ],
      },
    ],
  },
  {
    version: '6.1.0',
    title: 'Yogatik 6.1.0: Real-Time Live Vision HUD, AI Voice Mute, Chrome AI Tools & Process Tree Management',
    date: 'September 4, 2026',
    isLatest: false,
    highlights: [
      'Live Feed Object Detection Overlay: Client-side continuous DETR object detection with smart mirror coordinate mapping and aHash change-gated visual processing',
      'AI Voice Output Mute: Dedicated speaker audio toggle in Live call controls with cascade choke-point gating and zero-latency gain-node muting',
      'Chrome Built-in AI (Gemini Nano) Tool Calling: Fixed prompted-mode tool injection on turn start and added interactive replay status heartbeats',
      'Honest Web Scraping & Proxy Routing: Eliminated fabricated bypass and browser claims in Scrapling and Lightpanda; routed all URL fetches through resilient proxy layer',
      'Sports Scores & Anime Lookup: Added keyless TheSportsDB live sports tracking and Jikan/MyAnimeList search; unified Wayback Machine archive tools',
      'Process Tree Kill & Terminal Server Safety: Robust taskkill/SIGKILL tree termination preventing port binding leaks on stopped dev servers',
    ],
    sections: [
      {
        category: '🎙️ Live Audio & Vision HUD',
        items: [
          {
            title: 'Real-time on-device object detection overlay',
            description: 'Local DETR pipeline continuously identifies scene objects in live camera feeds with mirrored coordinate correction and zero server token costs.',
          },
          {
            title: 'AI voice output mute control',
            description: 'Instant speaker toggle in Live call controls silences spoken output at the synthesizer choke point without interrupting captions or session state.',
          },
        ],
      },
      {
        category: '🤖 AI Models & Provider Connectivity',
        items: [
          {
            title: 'Chrome AI & on-device model tool access',
            description: 'Fixed prompted tool definition delivery for isLocal providers so Gemini Nano and WebLLM models can access and invoke Yogatik tools on turn 1.',
          },
          {
            title: 'On-device replay progress heartbeats',
            description: 'Detailed live status updates during conversation history playback eliminate perceived application freezes during on-device model turns.',
          },
        ],
      },
      {
        category: '🔍 Web Intelligence & Public Tools',
        items: [
          {
            title: 'Sports scores, schedules & standings',
            description: 'Added keyless TheSportsDB integration for real-time fixtures, live scores, and league tables across football, basketball, and more.',
          },
          {
            title: 'Anime & manga database lookup',
            description: 'Integrated Jikan API for anime/manga search, top-ranked titles, synopsis, and character details directly from MyAnimeList.',
          },
          {
            title: 'Resilient web scraping & unified Wayback archive',
            description: 'Replaced unhandled fetch calls with proxyText CORS routing, removed fabricated claims in Scrapling/Lightpanda, and sandboxed JS evaluation.',
          },
        ],
      },
      {
        category: '💻 Desktop Terminal & Process Engine',
        items: [
          {
            title: 'Full process tree termination',
            description: 'Shared procKill architecture reliably terminates dev servers and background process trees across Windows and POSIX without leaking port bindings.',
          },
          {
            title: 'Terminal long-running process protection',
            description: 'Automatic detection of persistent dev servers in terminal_run avoids 5-minute timeout hangs and guides the agent to proc_start.',
          },
        ],
      },
    ],
  },
  {
    version: '5.2.0',
    title: 'Yogatik 5.2.0: Dynamic Model Discovery, Provider CORS Bypass & Resilient Web Tools',
    date: 'September 4, 2026',
    isLatest: false,
    highlights: [
      'Dynamic Model Discovery: Directly queries and live-validates available models from upstream providers (NVIDIA NIM, Anthropic, OpenAI, custom endpoints) with zero hardcoded presets',
      'Provider CORS Bypass: High-speed edge proxy routing with X-Target-URL for NVIDIA NIM, Anthropic, and custom endpoints eliminating CORS preflight errors in browser',
      'Instant Bot-Free Web Search: Official DuckDuckGo Instant Answer API integration for high-speed search without anti-bot blocks or 500 relay failures',
      'Statically Bundled Tools: Built-in MCP registry bundling to eliminate dynamic chunk 404 network fetch errors during conversation turns',
      'Desktop Packaging Pipeline: Resilient GitHub Actions multi-platform workflow with continue-on-error artifact uploads and unmetered Releases publishing',
    ],
    sections: [
      {
        category: '🤖 AI Models & Provider Connectivity',
        items: [
          {
            title: 'Live dynamic model fetching',
            description: 'Providers now dynamically query /v1/models directly using your API key. No outdated preset lists or inaccessible model IDs.',
          },
          {
            title: 'Zero-CORS edge proxy routing',
            description: 'Requests to NVIDIA NIM, Anthropic, and custom LLM providers route through a high-performance Cloudflare Worker proxy with target URL forwarding.',
          },
        ],
      },
      {
        category: '🔍 Web Search & Resilience',
        items: [
          {
            title: 'DuckDuckGo Instant Answer API',
            description: 'Switched from fragile HTML scraping to official Instant Answer JSON API for instant, bot-block-free search queries.',
          },
          {
            title: 'Static tool bundling',
            description: 'Eliminated runtime dynamic imports for MCP connector resolution to ensure uninterrupted agent execution.',
          },
        ],
      },
      {
        category: '💻 Cross-Platform Desktop Builds',
        items: [
          {
            title: 'Unmetered release uploads',
            description: 'Desktop CI builds bypass temporary GitHub Actions artifact quotas and publish directly to public mirror Releases.',
          },
        ],
      },
    ],
  },
  {
    version: '5.1.0',
    title: 'Yogatik 5.1.0: MCP Auto-Connect, Relevance-Ranked Web Reading & On-Device AI Setup',
    date: 'September 3, 2026',
    isLatest: false,
    highlights: [
      'MCP Auto-Connect: a connector you already configured but left disabled reconnects on its own the moment a request needs it — no re-adding it by hand',
      'MCP Suggestions: when a request could use a connector you have not set up yet (GitHub, Stripe, Cloudflare, and more), Yogatik tells you so instead of quietly doing nothing',
      'Smarter Web Reading: web_extract can now target a long page for the passages that actually answer your question instead of just the first few thousand characters',
      'File Skimming: a new fs_skim tool lets the agent see a source file’s shape — every function and class signature — before deciding whether to read the whole thing',
      'On-Device AI Setup Fixed: picking WebLLM or Chrome’s built-in AI now shows a real consent screen with download progress, instead of silently starting a multi-hundred-MB download',
    ],
    sections: [
      {
        category: '🔌 MCP Connectors',
        items: [
          {
            title: 'Automatic reconnect for configured servers',
            description: 'A connector you already added but disabled is flipped back on and reconnected for the turn that needs it — never for one you have not configured, since that would need a credential Yogatik does not have.',
          },
          {
            title: 'Honest suggestions, never a silent connection',
            description: 'An unconfigured but relevant connector is named in plain language, with what it needs to set up — Yogatik never claims to be using something it is not actually connected to.',
          },
        ],
      },
      {
        category: '📄 Reading Files & the Web',
        items: [
          {
            title: 'Relevance-ranked page excerpts',
            description: 'Give web_extract a focus and it ranks a long page’s passages instead of blindly truncating — the answer buried at the bottom of an article is no longer missed.',
          },
          {
            title: 'fs_skim file skeletons',
            description: 'See a file’s functions, classes, and structure with long bodies collapsed to a line count — a fast way to decide what is worth a full read.',
          },
        ],
      },
      {
        category: '🖥️ On-Device AI',
        items: [
          {
            title: 'Real consent before any download',
            description: 'WebLLM and Chrome’s built-in AI now show model size, a download button, and live progress — nothing downloads until you choose to.',
          },
        ],
      },
    ],
  },
  {
    version: '4.3.2',
    title: 'Yogatik 4.3.2: Desktop Pro Entitlement Sync, Version Dropdown & Clean Tool Registry',
    date: 'September 2, 2026',
    isLatest: false,
    highlights: [
      'Desktop Pro Account Sync: Fixed Firebase auth state preservation on desktop so Pro subscriptions and 30-day trials sync immediately between web and desktop',
      'Interactive Version Dropdown: Added version selector dropdown to the What’s New showcase with instantaneous switching across recent releases',
      'Clean & Resilient Tool Registry: Streamlined agent tools and removed noisy recipe lookup failures for smooth, robust task completion',
      'Cross-Platform Build Parity: Synchronized release 4.3.2 across web app, Windows installer (NSIS), macOS DMG, and Linux AppImage/Deb packages',
      'Hardened Native IPC Lifecycle: Safe window messaging across Electron main and renderer processes eliminating destroyed-window exceptions',
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
