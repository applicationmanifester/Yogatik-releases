/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '10.6.0'
export const BUILD_DATE = 'September 2026'
export const APP_CODENAME = 'Yogatik 10.6.0 — Frontier AI Studio, Smart Follow-Ups, Visual Diffs & Voice Dictation'

export const APP_RELEASES = [
  {
    "version": "10.6.0",
    "title": "Yogatik 10.6.0: Frontier AI Studio — Smart Follow-Ups, Visual Code Diffs, Hover Citations, Chart Sandbox & Live Waveform Dictation",
    "date": "September 24, 2026",
    "isLatest": true,
    "highlights": [
      "Dynamic Follow-Up Suggestion Chips: Context-aware next-turn prompt chips (unit tests, optimizations, deep explanations, visual charts) automatically derived from assistant replies",
      "Rich Web Citation Hover Cards: Instant popover on hovering search citations displaying domain, favicon, verification badge, snippet preview, and direct link",
      "Cursor-Style Visual Code Diff & 1-Click Apply: Dedicated Diff button on all code snippets opening unified red/green diff review with line addition/deletion stats and one-click accept & apply",
      "Interactive Data Visualization Sandbox in Artifact Canvas: Zero-dependency SVG Bar, Line, and Donut charts parsing CSV, Markdown tables, or JSON directly inside Artifact Canvas",
      "Real-Time Voice Dictation with Live Waveform: Continuous speech-to-text dictation with pulsing listening orb and animated 4-bar equalizer streaming into composer textarea",
      "1-Click Smart History Compaction & Headroom Optimization: Quick-compact badge in ContextMeter when usage exceeds 50%, freeing 60%+ context tokens via semantic compaction"
    ],
    "sections": [
      {
        "category": "✨ Frontier AI Chat & Reasoning Experience",
        "items": [
          {
            "title": "Dynamic Smart Follow-Up Chips",
            "description": "Assistant messages analyze the reply type to intelligently suggest 3 context-aware follow-up action chips (writing unit tests, performance tuning, deep dive explanations, or visual chart generation) for single-click prompt continuation."
          },
          {
            "title": "Rich Web Citation Hover Cards",
            "description": "Hovering citation badges [1], [2] displays domain favicons, source domain verification badges, title previews, and extracted snippets with hover-delay preservation."
          },
          {
            "title": "Cursor-Style Code Diff Reviewer",
            "description": "Added an interactive Diff button to code blocks opening a visual unified diff comparison with line additions, deletions, change statistics, and one-click Accept & Apply."
          }
        ]
      },
      {
        "category": "📊 Artifact Canvas & Voice Audio",
        "items": [
          {
            "title": "Interactive SVG Data Chart Sandbox",
            "description": "Artifact Canvas now features a dedicated Chart view that parses markdown tables, CSV, and JSON data arrays into clean SVG Bar, Line, and Donut visualizers with summary statistics."
          },
          {
            "title": "Real-Time Continuous Voice Dictation",
            "description": "Continuous Web Speech API recognition integrated into the composer with animated 4-bar soundwave equalizer, active glowing listening states, and smooth transcript appending."
          },
          {
            "title": "1-Click Context Compaction",
            "description": "Automatic ⚡ Compact badge appears in the context usage meter when token utilization exceeds 50%, enabling instant history compaction that frees 60%+ headroom."
          }
        ]
      }
    ]
  },
  {
    "version": "10.5.0",
    "title": "Yogatik 10.5.0: Autonomous Reasoner Recovery, Interactive RAG & Context Manager",
    "date": "September 24, 2026",
    "isLatest": false,
    "highlights": [
      "Autonomous Reasoner Recovery: Self-healing intent recognition and tool execution for reasoning models (Nemotron-3, DeepSeek-R1, Qwen)",
      "Interactive Local RAG Manager: One-click inspection of saved IndexedDB location, chunk passage preview, export, and deletion from the composer RAG badge",
      "AI Context Window Inspector: Clickable context meter revealing live itemized token breakdown, headroom capacity, compaction tools, and cost analytics",
      "Windows Desktop Shell Integration: Native taskbar icon persistence and AppUserModelId association in development and production builds",
      "Seamless Root Electron Launcher: Integrated forwarding entry point eliminating module resolution errors when launching from repository root",
      "Robust Agent Turn Alternation: Proper user-assistant message sequencing preventing API reject errors during mid-turn tool nudging"
    ],
    "sections": [
      {
        "category": "🧠 Agent & Context Management",
        "items": [
          {
            "title": "Interactive Local RAG Knowledge Hub",
            "description": "Clicking the RAG badge opens full storage details (IndexedDB db.documents), passage previews with chunk copying, text export, and document removal."
          },
          {
            "title": "AI Context Window & Token Inspector",
            "description": "Clicking the context meter badge launches an itemized token breakdown covering system prompt, chat history, tool payloads, RAG context, and draft tokens."
          },
          {
            "title": "Expanded Planning Intent Recognition",
            "description": "Expanded hasUnexecutedToolIntent to match connectors, modal auxiliaries, and gerund verbs across reasoning models."
          },
          {
            "title": "Sequential Message Turn Preservation",
            "description": "Preserved assistant thought turn before user nudge to ensure strict role alternation and avoid provider 400 errors."
          },
          {
            "title": "Autonomous Exploratory Tool Seeding",
            "description": "Added automatic exploratory tool seeding when reasoning indicates file/project inspection intent without raw tool tags."
          }
        ]
      },
      {
        "category": "🖥️ Desktop & Electron Shell",
        "items": [
          {
            "title": "Windows Taskbar Icon Fix",
            "description": "Configured dynamic AppUserModelId and nativeImage window icons ensuring the Yogatik icon renders cleanly on Windows taskbars."
          },
          {
            "title": "Root Electron Forwarder",
            "description": "Created root electron/main.cjs forwarder and updated root package.json to resolve Electron apps launched from the root directory."
          }
        ]
      }
    ]
  },
  {
    "version": "10.4.0",
    "title": "Yogatik 10.4.0: Desktop Release Stability, Left-Aligned Composer & Enhanced RAG Tools",
    "date": "September 23, 2026",
    "isLatest": false,
    "highlights": [
      "Desktop Multi-Platform Build Pipeline: Resolved packaging main entrypoint in electron-builder, restoring automated Windows, macOS, and Linux artifact generation on GitHub Actions",
      "Unified Left-Aligned Composer Controls: Harmonized top composer row layout with persona selector dropdown, quick edit actions, and document context indicator left-aligned",
      "Interactive Document Context Management: Added quick inspection and deletion management for active RAG context documents directly from the composer",
      "Resilient Tool Discovery & Suggestion Engine: Cleaned and optimized public API tool suggestion ranking with token-aware keyword matching and safe fallback schemas",
      "Yogatik Browser v10.4.0 Standalone Alignment: Synchronized cross-platform browser runtime bindings, ad-shield controls, and standalone desktop release triggers"
    ],
    "sections": [
      {
        "category": "🖥️ Desktop & Release Infrastructure",
        "items": [
          {
            "title": "Electron Packaging Entrypoint Fix",
            "description": "Fixed electron main script resolution to electron/main.cjs, eliminating corrupted app.asar packaging errors across all desktop CI targets."
          },
          {
            "title": "Automated Matrix Cross-Platform Builds",
            "description": "Fully enabled continuous releases for Windows (.exe), macOS (.dmg / .zip), and Linux (.AppImage / .deb) via GitHub Actions."
          }
        ]
      },
      {
        "category": "🎨 UI & Composer Experience",
        "items": [
          {
            "title": "Left-Aligned Composer Bar",
            "description": "Streamlined the composer top row to align persona picker, edit buttons, and active RAG badges neatly to the left."
          },
          {
            "title": "Contextual Document Controls",
            "description": "Expanded transparency for active RAG documents with quick inspection and removal badges above chat input."
          }
        ]
      },
      {
        "category": "⚡ Tool Hub & Discovery",
        "items": [
          {
            "title": "Token-Aware Tool Suggestion",
            "description": "Upgraded tool discovery with token-bounded keyword evaluation to prevent substring misidentifications and improve prompt recommendations."
          }
        ]
      }
    ]
  },
  {
    "version": "10.3.0",
    "title": "Yogatik 10.3.0: Adaptive Vision, Persona Studio & Enhanced Icon Navigation",
    "date": "September 23, 2026",
    "isLatest": false,
    "highlights": [
      "Persona Selector & In-Place Editing: Interactive persona dropdown replacing crowded chips, with active-persona quick-edit icon and per-persona editor modal for prompt/name/icon changes",
      "Streamlined Icon Navigation: Left sidebar footer and composer actions consolidated into clean, accessible icon controls with clear tooltips",
      "Provider Stabilization: Removed non-functional and unreliably gated Chrome Built-in AI (Gemini Nano) with automatic migration to working providers",
      "3-Way Vision & Adaptive Framerate: Tri-state vision mode control (Off / Auto / Always) with dynamic fps scaling (0.2fps static to 1.0fps motion), reducing bandwidth and token usage",
      "Audio Device Recovery: Automated reconnection listeners for hot-swapped audio devices (headsets and external mics) ensuring uninterrupted live sessions",
      "Prewarmed Neural Voice: Kokoro-82M speech synthesizer pre-warming on application initialization for instant natural voice feedback",
      "Event-Driven Tool Status Hub: Centralized pub/sub tool lifecycle tracking with typed state transitions, diagnostics logging, and telemetry reporting"
    ],
    "sections": [
      {
        "category": "👁️ Live Vision & Multimodal",
        "items": [
          {
            "title": "Tri-State Vision Mode & HUD Badge",
            "description": "Cycle between Off, Auto, and Always vision modes with real-time HUD status badge and color indicators."
          },
          {
            "title": "Adaptive Frame Rate Scaling",
            "description": "Calculates perceptual hash distance to scale frame captures dynamically from 0.2 fps (static scenes) to 1.0 fps (active motion)."
          },
          {
            "title": "Cascade Screen Sharing",
            "description": "Integrated screen sharing with adaptive frame delivery into the Cascade multi-provider live session engine."
          }
        ]
      },
      {
        "category": "🎙️ Audio & Voice Pipeline",
        "items": [
          {
            "title": "Device Change Recovery",
            "description": "Automatic recovery listener handles headphone and microphone plug/unplug events without dropping calls."
          },
          {
            "title": "Neural Speech Pre-warming",
            "description": "Pre-warms cached Kokoro-82M weights on startup so the very first speech clause uses natural neural voice without latency."
          }
        ]
      },
      {
        "category": "⚡ Reflex Engine & Tool Hub",
        "items": [
          {
            "title": "Structured Reflex Introspection",
            "description": "Reflex engine now exposes structured intent classification and confidence metrics alongside instant on-device answers."
          },
          {
            "title": "Tool Status Hub",
            "description": "Event-driven hub tracking invocation lifecycle, timing buckets, error diagnostics, and reactive UI state updates."
          }
        ]
      },
      {
        "category": "🛡️ Desktop & Security",
        "items": [
          {
            "title": "HTTPS Upgrade & Anti-Fingerprinting",
            "description": "Desktop session layer forces secure HTTPS upgrades and protects against browser fingerprinting."
          },
          {
            "title": "Address Bar Navigation Smoothing",
            "description": "Prevents URL flicker during SPA transitions (e.g. YouTube) and redirects by intelligently falling back to committed URLs."
          }
        ]
      }
    ]
  },
  {
    "version": "10.2.0",
    "title": "Yogatik 10.2.0: File Workspace Management, DOMPurify Security & Isolated Composer Drafts",
    "date": "September 19, 2026",
    "isLatest": false,
    "highlights": [
      "Multi-Chat Composer Isolation: Chat-scoped unsubmitted prompt drafts with sessionStorage persistence, preventing prompt leakage across conversations and scoping prompt enhancement undo toasts",
      "File Workspace & Picker Components: Virtualized FileBrowser tree view with search filtering and FilePicker with magic-bytes binary validation, MIME enforcement, and path traversal sanitization",
      "DOMPurify Hardened Security: Standardized HTML, Markdown, and SVG sanitization preventing XSS attacks across LLM responses, tool outputs, and document views",
      "Zerodha Kite Session & Desktop Fetch: Direct desktop native fetch bypassing CORS relay overhead, local preview server proxy support, and manual access token fallback",
      "Cloudflare CORS Proxy Hardening: Strict credential allowlisting (Authorization & x-api-key headers) and per-origin sliding-window rate limiting (60 req/min)",
      "Unified 10.2.0 Multi-Platform Matrix: Monorepo desktop apps, standalone browser, and web app aligned"
    ],
    "sections": [
      {
        "category": "💬 Multi-Chat & Composer UX",
        "items": [
          {
            "title": "Per-Conversation Composer Drafts",
            "description": "Each conversation maintains an independent draft state in memory and sessionStorage. Switching chats preserves in-progress prompts and attachments, while creating a new chat opens a pristine composer."
          },
          {
            "title": "Scoped Prompt Enhancement & Undo",
            "description": "Prompt enhancement actions and undo confirmations are strictly linked to the originating chat and dismissed automatically when navigating between conversations."
          }
        ]
      },
      {
        "category": "📁 Workspace & File Management",
        "items": [
          {
            "title": "Virtualized FileBrowser",
            "description": "High-performance virtualized file tree component supporting deep directory traversal, multi-selection, file operations (read, write, move, delete, mkdir), and file preview."
          },
          {
            "title": "Hardened FilePicker",
            "description": "Drag-and-drop file uploader with binary magic-bytes validation, strict MIME checking, 10MB ceiling, and path traversal sanitization."
          },
          {
            "title": "Filesystem Facade",
            "description": "Centralized, robust filesystem abstraction layer with consistent error handling and cross-environment support."
          }
        ]
      },
      {
        "category": "🛡️ Security & Privacy Hardening",
        "items": [
          {
            "title": "DOMPurify Sanitization Pipeline",
            "description": "Replaced ad-hoc regex scrubbing with industry-standard DOMPurify across all HTML, Markdown, and SVG render paths with 18 automated regression tests."
          },
          {
            "title": "Proxy Credential Allowlist & Rate Limiting",
            "description": "CORS worker now enforces a strict credential allowlist and sliding-window rate limiting to prevent credential leakage and abuse."
          },
          {
            "title": "API Key Storage Transparency",
            "description": "Visible disclosure notices inform users that custom and provider credentials reside exclusively in local client storage."
          }
        ]
      }
    ]
  },
  {
    "version": "10.1.0",
    "title": "Yogatik 10.1.0: Quantitative Trading Suite, Atomic Storage & Performance Hyperdrive",
    "date": "September 19, 2026",
    "isLatest": false,
    "highlights": [
      "Full Quantitative Trading Suite: Vector backtesting engine, risk management module, explainable signal system, and cryptographic trade journal",
      "Zerodha Kite Connect & Paper Trading Engine: Live API integration with Indian market fee model (brokerage, STT, GST) and zero-risk paper simulator",
      "Performance Hyperdrive: Parallelised market scanner (~8× faster), stale-closure fix for auto-refresh intervals, optimistic UI for instant order feedback",
      "Atomic localStorage Write: Staging-key pattern prevents config corruption on crash, with automatic recovery fallback",
      "Accessibility & Error Surface: aria-hidden on decorative icons, visible error banners for live-data failures, 6 new error-case unit tests",
      "Monorepo Version 10.1.0 Alignment: Unified release matrix across desktop apps, standalone browser, web application, and GitHub Actions pipelines"
    ],
    "sections": [
      {
        "category": "📈 Quantitative Trading Suite",
        "items": [
          {
            "title": "Vector Backtesting Engine",
            "description": "Full OHLCV backtesting with EMA crossover, RSI/MACD signal generation, Chandelier Exit stops, Indian market friction (brokerage, STT, GST, SEBI charges), and equity-curve metrics including CAGR, Sharpe, max drawdown, and win rate."
          },
          {
            "title": "Risk Management Module",
            "description": "Fractional-Kelly position sizing, daily drawdown circuit breaker, per-order capital limits, and SEBI-aligned order validation with real-time enforcement."
          },
          {
            "title": "Explainable Signal System",
            "description": "Human-readable signal explanations pairing technical indicators with plain-English rationale, giving traders full transparency on every recommendation."
          },
          {
            "title": "Cryptographic Trade Journal",
            "description": "Tamper-evident SHA-256 chained trade journal with integrity verification, CSV/JSON export, and forensic audit capabilities."
          }
        ]
      },
      {
        "category": "⚡ Performance & Architecture",
        "items": [
          {
            "title": "Parallelised Market Scanner",
            "description": "Replaced sequential for-await loop with Promise.allSettled across all watchlist symbols — scan time drops from Σ(latency) to max(latency), ~8× faster for the default 8-stock watchlist."
          },
          {
            "title": "Stale-Closure Fix for Auto-Refresh",
            "description": "configRef pattern ensures fetchLiveData always reads the latest trading configuration without restarting the polling interval on every settings keystroke."
          },
          {
            "title": "Optimistic UI for Order Execution",
            "description": "Orders appear instantly in the Order Book with PENDING (Placing...) status before the async engine resolves, with clean rollback on failure for zero-latency perceived responsiveness."
          },
          {
            "title": "Atomic localStorage Write",
            "description": "Staging-key write pattern (write staging → promote primary → remove staging) eliminates the torn-write window that could corrupt config JSON on crash or tab close, with automatic recovery from staging on next load."
          }
        ]
      },
      {
        "category": "♿ Accessibility & Quality",
        "items": [
          {
            "title": "Screen-Reader Friendly Icons",
            "description": "All decorative Lucide icons adjacent to visible text (mode pill, circuit status, kill switch, refresh button) now carry aria-hidden=true so screen readers skip SVGs and announce only the meaningful text."
          },
          {
            "title": "Visible Error Surface",
            "description": "Live-data fetch failures now surface as actionable error notices instead of silent console.error, keeping traders informed of connectivity issues."
          },
          {
            "title": "Expanded Test Coverage",
            "description": "6 new unit tests covering fetchLiveData error surface, optimistic order rollback, and atomic storage recovery. Full suite: 2811 tests passing across 268 test files."
          }
        ]
      }
    ]
  },
  {
    "version": "9.1.0",
    "title": "Yogatik 9.1.0: Real-Time AI Media Studio, YouTube Anti-Adblock Engine & Multi-Platform Hyperdrive",
    "date": "September 19, 2026",
    "isLatest": false,
    "highlights": [
      "Real-Time AI Media Studio Generation: Live prompt-derived visual generation with Flux AI, dynamic aspect ratios, and Fal.ai / Kling 3 Pro cloud pipeline integration",
      "YouTube Anti-Adblock & Hydration Resilience: Zero-latency ad skipper without triggering YouTube's Polymer skeleton freeze or telemetry errors",
      "Yogatik Browser v1.0.0 Standalone Portal: Consistent download architecture across Windows (.exe), macOS (.dmg), and Linux (.AppImage)",
      "Monorepo Version 9.1.0 Alignment: Unified release matrix across desktop apps, standalone browser, web application, and GitHub Actions pipelines"
    ],
    "sections": [
      {
        "category": "🎨 Creative Media Studio",
        "items": [
          {
            "title": "Flux AI Real-Time Prompt Visualizer",
            "description": "Instant generation of rich, prompt-accurate visuals with dynamic aspect ratio scaling and zero black-screen fallback states."
          },
          {
            "title": "Kling 3 Pro & Seedance Cloud GPU Pipeline",
            "description": "Direct Fal.ai / Kuaishou cloud execution when user platform keys are provided, with resilient error boundaries."
          }
        ]
      },
      {
        "category": "🌐 Standalone Yogatik Browser",
        "items": [
          {
            "title": "YouTube AdShield Anti-Detection Refinement",
            "description": "Eliminated network aborts on internal YouTube telemetry endpoints, allowing instant feed hydration while seamlessly skipping video ads."
          },
          {
            "title": "Uniform Multi-Platform Download Center",
            "description": "Pixel-perfect layout consistency across Windows, macOS, and Linux download cards at /browser."
          }
        ]
      }
    ]
  },
  {
    "version": "9.0.0",
    "title": "Yogatik 9.0.0: Standalone Yogatik Browser v1.0.0, AI-First Privacy Engine & Multi-Platform Hyperdrive",
    "date": "September 18, 2026",
    "isLatest": false,
    "highlights": [
      "Standalone Yogatik Browser v1.0.0: Independent Electron architecture with isolated user data, custom brand DNA, and zero cloud tracking",
      "Hardware-Accelerated AdShield & Video Skipper: Strict network-level blocker stopping trackers, telemetry, and YouTube ad interruptions",
      "Distraction-Free Reader Mode (Ctrl+Shift+R): In-place article extraction with Dark, Sepia, and Light themes plus dynamic font size scaling",
      "Spotlight Command Palette (Ctrl+K) & Multi-Theme Engine: Fast keyboard navigation across open tabs, bookmarks, and actions with 5 curated themes",
      "Unified Desktop & Browser Distribution Pipeline: Synchronized multi-platform release builder publishing both Yogatik Studio and Yogatik Browser"
    ],
    "sections": [
      {
        "category": "🌐 Standalone Yogatik Browser v1.0.0",
        "items": [
          {
            "title": "Independent App Architecture & Identity",
            "description": "Completely separated from the Studio monorepo into yogatik-browser/ with dedicated NSIS installer, persistent geometry, and branded splash screen."
          },
          {
            "title": "Built-in Privacy AdShield & Reader Mode",
            "description": "Hardware-accelerated network filtering and clean reader overlay with Dark, Sepia, and Light reading modes."
          },
          {
            "title": "Command Palette & Multi-Theme Engine",
            "description": "Ctrl+K spotlight navigation for tabs, bookmarks, and quick actions, with Midnight, Arctic, Dracula, Solarized, and Cyberpunk themes."
          }
        ]
      },
      {
        "category": "🚀 Core System & Performance",
        "items": [
          {
            "title": "Version 9.0.0 Monorepo Alignment",
            "description": "Synchronized versioning across desktop apps, marketing showcase, bot gateway, and GitHub Actions release pipelines."
          }
        ]
      }
    ]
  },
  {
    "version": "8.5.2",
    "title": "Yogatik 8.5.2: Desktop Entitlement Hardening, Multi-Device Cloud Sync & Live Trading Resilience",
    "date": "September 17, 2026",
    "isLatest": false,
    "highlights": [
      "Desktop Entitlement & In-App Browser Hardening: Direct user notification and automatic license upgrade dialog if opening the built-in autonomous browser without active Pro entitlement",
      "Cross-Platform Account Synchronization: Reliable multi-device cloud persistence for chats, preferences, API configurations, and custom agent states via Firebase Auth",
      "Zerodha Kite Connect 2FA & Token Setup Guide: Streamlined request-token auto-capture, instant SHA-256 session generation, and comprehensive in-app setup instructions",
      "Adaptive System Theme Alignment: Polished dark/light mode switching and high-contrast accessibility across all interactive modals and tool panels"
    ],
    "sections": [
      {
        "category": "🛡️ Desktop Security & Entitlements",
        "items": [
          {
            "title": "Pro Browser Entitlement Verification",
            "description": "Integrated direct entitlement inspection when launching the autonomous built-in browser window, with proactive toast feedback and upgrade modal invocation."
          }
        ]
      },
      {
        "category": "☁️ Cloud Synchronization & Persistence",
        "items": [
          {
            "title": "Multi-Device Account Sync",
            "description": "Seamless state synchronization across web, desktop, and mobile platforms with real-time Firebase Auth session resilience."
          }
        ]
      },
      {
        "category": "📈 Zerodha Trading Suite Resilience",
        "items": [
          {
            "title": "Kite Connect Token Helper & Diagnostics",
            "description": "Automated URL parameter parsing for Zerodha redirect tokens and built-in interactive helper for fast daily authentication."
          }
        ]
      }
    ]
  },
  {
    "version": "8.5.0",
    "title": "Yogatik 8.5.0: Autonomous Quantitative Profit Engine & Zerodha Live Trading Suite",
    "date": "September 17, 2026",
    "isLatest": false,
    "highlights": [
      "Zerodha Kite Connect v3 Integration: Secure session exchange (SHA-256), live margin requirements, real-time quotes, holdings & positions fetching",
      "Autonomous Quantitative Profit Engine: Continuous market scanner with technical confluence (RSI, MACD, EMA 20/50, Bollinger Bands, ATR) and EV-maximizing profit targets",
      "Zero-Risk Virtual Paper Simulator: Full simulated order execution with ₹1,00,000 starting cash, real-time unrealized P&L, trade logs, and instant reset",
      "Human-in-the-Loop Trade Confirmations: Interactive trade confirmation tickets in chat with auto-calculated stop-loss, target, and risk/reward preview",
      "Algorithmic Trading Dashboard: Dedicated modal for Zerodha 2FA token generation, auto-trader controls, and portfolio analytics"
    ],
    "sections": [
      {
        "category": "📈 Live & Paper Stock Trading",
        "items": [
          {
            "title": "Zerodha Kite Connect v3 REST Client",
            "description": "Direct integration with Zerodha Kite Connect API supporting orders (CNC, MIS, NRML), market/limit pricing, margin queries, and holdings."
          },
          {
            "title": "Zero-Risk Paper Trading Simulator",
            "description": "Realistic paper engine with virtual ₹1,00,000 wallet, real-time price updates, position tracking, and historical trade ledger."
          }
        ]
      },
      {
        "category": "🤖 Autonomous AI Profit Optimizer",
        "items": [
          {
            "title": "Multi-Indicator Confluence Scanner",
            "description": "Evaluates RSI, MACD crossovers, EMA 20/50 trends, Bollinger Band volatility, and ATR for a composite 0-100 algorithmic score."
          },
          {
            "title": "Positive Expected Value (EV) Execution",
            "description": "Only triggers trades with positive mathematical expected value, enforcing strict 1:2+ risk/reward, automated profit locking, and stop-loss trailing."
          }
        ]
      }
    ]
  },
  {
    "version": "8.4.0",
    "title": "Yogatik 8.4.0: High-Resilience Agent Suite — Unlimited JS Execution, Fuzzy Filesystem Edits & Pre-Flight Syntax Validation",
    "date": "September 17, 2026",
    "isLatest": false,
    "highlights": [
      "Unlimited JS Execution: Native Electron VM direct execution eliminates Windows cmd.exe 8,191-character command line limit for large scripts and computations",
      "Fuzzy-Tolerant Filesystem Matching: Multi-pass tolerance for quotes, blank lines, and trailing semicolons/commas with surrounding context diagnostics on mismatch",
      "Pre-Flight Syntax Validation (code_validate): Instant in-memory AST and structural checking for JS, JSX, TS, TSX, JSON, HTML, CSS, and Markdown",
      "Uncapped Agent Autonomy: Removed arbitrary tool round limits (Infinity rounds) for deep long-running autonomous workflows",
      "Real-Time Reflex Prefetch Telemetry: Bi-directional telemetry cards in DiagnosticsModal monitoring prefetch cache hits and latency reduction"
    ],
    "sections": [
      {
        "category": "🛠️ High-Resilience Developer & Agent Tools",
        "items": [
          {
            "title": "Native Electron VM JavaScript Runner",
            "description": "Executes JavaScript in Node.js VM context directly via desktop IPC, removing Windows command-line length limits and shell escaping issues."
          },
          {
            "title": "Resilient Filesystem Fuzzy Matcher",
            "description": "Multi-pass fuzzy line matching tolerates quotes, blank lines, indentation, and trailing punctuation, providing closest-match line context on failure."
          },
          {
            "title": "Instant Structural Syntax Validator (code_validate)",
            "description": "Fast multi-language parser checks balanced delimiters, unclosed JSX tags, and invalid JSON with exact line and column pointers."
          }
        ]
      },
      {
        "category": "⚡ Autonomy & Live Telemetry",
        "items": [
          {
            "title": "Uncapped Execution Rounds",
            "description": "Agents execute multi-step plans without arbitrary turn-round clamp constraints."
          },
          {
            "title": "Reflex Prefetch Monitor",
            "description": "Interactive diagnostics card visualizing prefetch cache hit rates, predictive fetches, and response latency gains."
          }
        ]
      }
    ]
  },
  {
    "version": "8.3.0",
    "title": "Yogatik 8.3.0: Sovereign AI Workstation — Multi-Agent Swarms, Action Journal & Artifact Studio",
    "date": "September 16, 2026",
    "isLatest": false,
    "highlights": [
      "Autonomous Multi-Agent Swarms: Hierarchical DAG scheduling with Planner, Coder, Critic, and QA roles plus self-healing retry loops",
      "Cryptographic Action Journal: Merkle hash-chained audit logging and 1-click time-machine state rollback for all file modifications",
      "Ambient Screen Intelligence: Optical diffing via Hamming distance perceptual hashing and silent proactive action chips",
      "Auto-Skill Synthesis: Automatically distills successful multi-turn tool sessions into standard, spec-compliant SKILL.md documents",
      "Interactive Artifact Studio Canvas: Responsive multi-device viewport switching (Desktop, Tablet, Mobile) with live preview reload"
    ],
    "sections": [
      {
        "category": "⚡ Sovereign Multi-Agent & Governance",
        "items": [
          {
            "title": "Hierarchical Multi-Agent Swarm Coordinator",
            "description": "Orchestrates concurrent specialized agents over a shared blackboard with dependency DAG resolution and automated self-healing error recovery."
          },
          {
            "title": "Merkle-Chained Action Journal & Rollback",
            "description": "Cryptographically verifies every file write, deletion, and shell execution with SHA-256 chaining and enables single-click time-machine rollback."
          }
        ]
      }
    ]
  },
  {
    "version": "8.2.0",
    "title": "Yogatik 8.2.0: Streamlined Core — First-Impression Focus, Strict CSP & 177 Tools Transparency",
    "date": "September 12, 2026",
    "isLatest": false,
    "highlights": [
      "Focused First Impression: Streamlined onboarding centered on 'Choose a provider or run locally' with clear Cloud vs On-Device paths",
      "Above-the-Fold Privacy Transparency: Honest disclosures on local storage, transparent developer CORS proxy, and optional Firebase cloud sync",
      "Strict Content Security Policy: Promoted CSP from Report-Only to enforced blocking headers protecting user API keys and data integrity",
      "Real 404 Route Handling: Dedicated static 404 page and scoped Firebase rewrites returning genuine HTTP 404 status codes for unknown URLs",
      "Catalogue & Metadata Sync: Standardized all tool counts across HTML headers, OpenGraph cards, PWA manifest, and desktop guide to 177 tools"
    ],
    "sections": [
      {
        "category": "🛡️ Security & Routing Integrity",
        "items": [
          {
            "title": "Enforced Content Security Policy (CSP)",
            "description": "Upgraded response headers to enforce tested CSP rules blocking untrusted origins while preserving ESM WASM execution and local daemons."
          },
          {
            "title": "Standardized 404 Route Responses",
            "description": "Scoped SPA routing to valid application paths so unknown URLs return real HTTP 404 status codes instead of serving the app shell."
          }
        ]
      },
      {
        "category": "✨ UX & Privacy Clarity",
        "items": [
          {
            "title": "Focused First Impression",
            "description": "Replaced competing welcome buttons with two clear setup cards: Connect an AI Provider (Cloud) or Run Locally on Device (Offline WebGPU / Ollama)."
          },
          {
            "title": "Above-the-Fold Privacy Guarantee",
            "description": "Added upfront transparent disclosure regarding browser IndexedDB storage, developer CORS proxying for restricted APIs, and optional Firebase sync."
          },
          {
            "title": "Unified Tool Count Metadata",
            "description": "Updated all marketing descriptions, social preview cards, and manifest files to accurately reflect the 177 browser-native tools catalogue."
          }
        ]
      }
    ]
  },
  {
    "version": "8.1.0",
    "title": "Yogatik 8.1.0: Apex Frontier — Full Modal Control, Ambient Telemetry & Action Chips",
    "date": "September 11, 2026",
    "isLatest": false,
    "highlights": [
      "Next-Gen Model Readiness: 100% synergy for frontier and upcoming models (Claude Fable 5.1, GPT-6 Astra, Claude 3.7 Sonnet, Gemini 2.5)",
      "Ambient UI Telemetry: Live viewport, theme, active modal/tab, and text selection awareness injected into agent prompts",
      "Interactive Action Chips: AI models emit clickable action pills for instant prompt continuations and one-click workflows",
      "App Settings & Resource Control: Models can programmatically inspect/modify settings, list workspace resources, and open UI modals via app_settings tool",
      "Visual Layout Verification: Automated HTML/SVG layout inspection and direct AI feedback loop for artifact previews",
      "Stepped Progress Trees: Hierarchical animated execution checklists rendered directly inside streaming agent bubbles"
    ],
    "sections": [
      {
        "category": "🚀 Next-Gen AI-UI Synergy",
        "items": [
          {
            "title": "Ambient Viewport & UI Telemetry",
            "description": "The AI receives real-time ambient awareness of the active modal, active tab, viewport dimensions, theme, and user text selections."
          },
          {
            "title": "Interactive Action Chips",
            "description": "Assistant messages dynamically render actionable suggestion chips that execute workflow prompts in one click."
          },
          {
            "title": "Closed-Loop Layout Inspection",
            "description": "Artifact panels analyze code layouts and provide an instant feedback pipe to ask the AI for visual polish."
          }
        ]
      },
      {
        "category": "🛠️ Programmatic Modal & Workspace Control",
        "items": [
          {
            "title": "Dynamic Modal Triggering",
            "description": "Models can open any modal in the app (File Editor, Settings, Domain Hub, Diagnostics, MCP) with preloaded state."
          },
          {
            "title": "Live Settings Management",
            "description": "Read, update, and broadcast application settings changes with masked credentials and zero page reloads."
          }
        ]
      }
    ]
  },
  {
    "version": "7.4.0",
    "title": "Yogatik 7.4.0: Apex — Fully Autonomous Multi-Agent Orchestrator",
    "date": "September 9, 2026",
    "isLatest": false,
    "highlights": [
      "Apex Agent: A fully autonomous multi-agent persona that plans, researches, codes, edits files, runs shell commands, controls the browser, and executes complex projects end-to-end — zero hand-holding required",
      "Zero-Friction Autonomy: Apex never asks for confirmation mid-task. It acts, recovers from errors automatically, and reports only the final result",
      "47 Specialist Sub-Agents: Researcher, Coder, Analyst, DevOps, QA Engineer, Writer, Architect, Scientist and more — spawned in parallel when possible",
      "6 Crew Orchestration Patterns: auto, sequential, hierarchical, reflexion, map_reduce, and best_of_n — Apex picks the right one for every goal",
      "Full Tool Access: All 195 registered tools — filesystem, terminal, git, browser, code execution, research, documents, memory, scheduling",
      "Autonomous Error Recovery: Test failures and command errors are fixed in a continuous loop without ever escalating to the user"
    ],
    "sections": [
      {
        "category": "🤖 Apex Autonomous Orchestrator",
        "items": [
          {
            "title": "Zero-Friction End-to-End Execution",
            "description": "Give Apex a goal and walk away. It creates a silent plan, delegates to specialist sub-agents in parallel, fixes any errors autonomously, and delivers a clean result — no confirmation prompts, no mid-task questions."
          },
          {
            "title": "47 Built-In Specialist Sub-Agents",
            "description": "Researcher, Coder, Analyst, DevOps, QA Engineer, Writer, Planner, Architect, Scientist, Translator, Security Auditor, Data Engineer and more — each with scoped tools for safe parallel execution."
          }
        ]
      },
      {
        "category": "⚙️ Multi-Agent Orchestration Patterns",
        "items": [
          {
            "title": "6 Crew Workflow Modes",
            "description": "auto (planner decomposes goal automatically), sequential (strict pipeline), hierarchical (parallel specialists + synthesizer), reflexion (generator → critic loop), map_reduce (N items in parallel), best_of_n (N attempts, critic picks the best)."
          },
          {
            "title": "Automatic Parallel Fan-Out",
            "description": "Apex never does in series what can be done in parallel. It sets isolate_workspace automatically when multiple agents write files simultaneously."
          }
        ]
      },
      {
        "category": "🛡️ Autonomous Error Recovery",
        "items": [
          {
            "title": "Continuous Fix-and-Retry Loop",
            "description": "If a test fails, Apex reads the error, patches the code, and re-runs — in one uninterrupted loop. Command errors are diagnosed and retried with corrections. Only truly unrecoverable failures surface to the user."
          }
        ]
      }
    ]
  },
  {
    "version": "7.3.0",
    "title": "Yogatik 7.3.0: SOTA Deep Research Engine, Multi-Facet Sub-Query Decomposition & Keyless Multi-Index Web Search",
    "date": "September 7, 2026",
    "isLatest": false,
    "highlights": [
      "SOTA Deep Research Engine: Parallel multi-facet sub-query decomposition analyzing core overview, technical benchmarks, and critical challenges simultaneously",
      "Hacker News Algolia & Europe PMC Search: Zero-rate-limit, open-CORS keyless engines covering engineering/tech, AI, and peer-reviewed biomedical literature",
      "Structured Table & Metrics Extraction: Retains raw page HTML to extract spec comparisons, data benchmarks, and financial metrics into structured Markdown tables",
      "Dialectic Research Briefings & Study Guides: NotebookLM-inspired executive synthesis with quantitative metrics, active recall flashcards, and 4-speaker debate script",
      "Domain Extraction & Citable Links: Clean domain attribution with anti-hallucination markdown link anchors [Title](URL) across all tool results"
    ],
    "sections": [
      {
        "category": "🔬 SOTA Deep Research Engine",
        "items": [
          {
            "title": "Parallel Multi-Facet Query Decomposition",
            "description": "Decomposes complex and open-ended topics into 2–3 targeted research facets (core overview, technical benchmarks, and critical challenges/developments) executed concurrently."
          },
          {
            "title": "Structured Table & Benchmark Extraction",
            "description": "Retains raw HTML on fetched pages so specification matrices, hardware benchmarks, and financial metrics are extracted directly into clean Markdown tables."
          }
        ]
      },
      {
        "category": "🌐 Expanded Keyless Search Indexes",
        "items": [
          {
            "title": "Hacker News Algolia API & Europe PMC Biomedical",
            "description": "Keyless, zero-rate-limiting, native-CORS search engines covering software, open source, AI, startups, and peer-reviewed medical and life sciences research."
          },
          {
            "title": "Smart Multi-Intent Engine Routing",
            "description": "Intelligently routes queries across medical, tech, finance, entertainment, academic, code, and community engines with auto-inferred temporal filters."
          }
        ]
      },
      {
        "category": "📚 Dialectic Research Briefing & Study Guide",
        "items": [
          {
            "title": "NotebookLM-Style Briefing with 4-Speaker Dialectic Debate",
            "description": "Compiles executive thesis, quantitative metrics, active recall flashcards, and a 4-speaker dialectic dialogue script (Host, Expert, Skeptic, Synthesizer)."
          }
        ]
      }
    ]
  },
  {
    "version": "7.2.0",
    "title": "Yogatik 7.2.0: Built-in BitTorrent Engine, Yogatik Browser Search Bar & Grok Local Files Bridge",
    "date": "September 6, 2026",
    "isLatest": false,
    "highlights": [
      "Built-in BitTorrent P2P Engine: Download open-source torrents and magnet links natively in Yogatik Desktop with real-time peer swarms, download speeds, DHT, pause/resume, and destination path selection",
      "Yogatik Browser Search & New Tab Start Page: Dedicated, clean start page with DuckDuckGo, Google, Bing, Brave, GitHub, and Wikipedia search engine switcher and speed-dial shortcuts",
      "Grok.com Local Folder Files Bundler: Send multiple project files and full subfolder source code directly into Grok with explicit anti-artifacts cloud sandbox redirection",
      "Entitlement Matrix & Safe Window Hardening: All BitTorrent and desktop browser capabilities classified as Free Always (FA) and protected by safeWindow communication",
      "Bulletproof Exception Recovery: Comprehensive type guards on local paths and dialog pickers preventing React error #31"
    ],
    "sections": [
      {
        "category": "🌊 Built-in BitTorrent Client",
        "items": [
          {
            "title": "Native Electron P2P BitTorrent Engine",
            "description": "Direct swarm downloading for magnet URIs and torrent files with piece allocation, speed telemetry, and 1-click open folder in explorer."
          },
          {
            "title": "Free Always Entitlement Guarantee",
            "description": "BitTorrent download management and destination directories remain 100% accessible to the user with zero subscription lockouts."
          }
        ]
      },
      {
        "category": "🧭 Yogatik Browser Search Engine",
        "items": [
          {
            "title": "Built-in Start Page & Search Bar",
            "description": "Never opens to an empty black screen again — launches with a modern search bar, multi-engine switcher, and quick web shortcuts."
          }
        ]
      },
      {
        "category": "🤖 Grok Local Files & Folder Bridge",
        "items": [
          {
            "title": "Multi-File Folder Bundler",
            "description": "Package and transmit source code files from any project folder directly into Grok.com with clear instructions to review the user code instead of looking in empty cloud sandbox folders."
          }
        ]
      }
    ]
  },
  {
    "version": "7.1.0",
    "title": "Yogatik 7.1.0: Grok.com & Gemini.com Studio Docks with Desktop Local Files Bridge",
    "date": "September 6, 2026",
    "isLatest": false,
    "highlights": [
      "Grok.com Studio Dock with Local Files Bridge: Seamless embedded session of grok.com with bidirectional workspace file injector, active Git diff review, and 1-click code block extraction to disk",
      "Gemini.com Studio Dock with Deep Shadow DOM Traversal: Full Google Web Components integration, real-time code extraction, and comment-based filepath auto-detection",
      "Dynamic WebContentsView Occlusion & Detachment: Electron native webview automatically detaches during modal overlays (Send File, Code Pull Drawer, Ctrl+K Palette) eliminating layering occlusions",
      "Mutual Dock Exclusivity & 1-Click Switcher: Prevents concurrent GPU/RAM spikes with instant toggle between Grok and Gemini studios directly in the header",
      "Safe Local File Bridge Guards: Automatic binary file filtration and 180KB safe chunking for high-speed IPC transmission",
      "Dynamic Precision Temperature Bar: Interactive slider in Personalization and Chat Composer supporting reasoning models and auto-retry error handling"
    ],
    "sections": [
      {
        "category": "🤖 Grok.com & Gemini.com Desktop Studio Docks",
        "items": [
          {
            "title": "Embedded WebContentsView Studio Docks",
            "description": "Direct interactive sessions for grok.com and gemini.google.com docked alongside your workspace files with persistent session state and responsive layout."
          },
          {
            "title": "Bidirectional Desktop Local Files Bridge",
            "description": "Read local workspace files or git diffs and inject formatted markdown prompts into Grok/Gemini; extract generated code blocks directly back into workspace files."
          }
        ]
      },
      {
        "category": "⚡ Native Performance & Occlusion Engine",
        "items": [
          {
            "title": "Intelligent WebContentsView Occlusion Handling",
            "description": "Solves the Electron native window overlay limitation by dynamically detaching webviews during modal displays and re-attaching on dismiss."
          },
          {
            "title": "Memory & Resource Isolation",
            "description": "Enforces mutual dock exclusivity and binary file filtering to keep memory low and prevent IPC transmission freezes."
          }
        ]
      },
      {
        "category": "🎨 UI Enhancements & Temperature Tuning",
        "items": [
          {
            "title": "Precision Temperature Control Slider",
            "description": "Fine-tune model creativity directly from the Chat Composer or Personalization modal, with automatic compatibility fallbacks for fixed-temperature models."
          },
          {
            "title": "1-Click Studio Switcher",
            "description": "Instant header toggle to switch between Grok.com and Gemini.com without losing conversation context."
          }
        ]
      }
    ]
  },
  {
    "version": "6.3.0",
    "title": "Yogatik 6.3.0: Live Meeting Copilot, Multi-Agent Collaboration Board & Visual Browser Inspector",
    "date": "September 6, 2026",
    "isLatest": false,
    "highlights": [
      "Live Meeting Copilot in Desktop Companion: Real-time speaker audio transcription, interactive action items checklist, instant tactical whisper suggestions, and 1-click Markdown export",
      "Multi-Agent Collaboration Board: Responsive 4-column Kanban layout (Backlog, In Progress, Review, Completed) with real-time sync of sub-agents, autonomous planning steps, and team tasks",
      "Power Slash Command Palette: Instant slash commands (/deck, /doc, /anim, /audit, /cast, /swarm, /calc, /graph) with prompt auto-fill and composer focus",
      "Visual Browser DOM Live Inspector: In-app \"Agent Eye\" displaying accessibility element trees, interactive refs (ref_epoch_idx), and real-time browser action history",
      "Dual-Mode Semantic Memory & Knowledge Graph: Interactive radial visualization of quantized vector memory clusters and federated research citations with node inspection and memory pruning",
      "Post-Live Meeting Secretary & Smart Intent Router: Automatic categorization, executive briefings, and real-time model switching recommendations"
    ],
    "sections": [
      {
        "category": "🎙️ Live Meeting Copilot & Audio Intelligence",
        "items": [
          {
            "title": "Passive Meeting Transcriber & Audio Visualizer",
            "description": "Monitors audio streams with real-time biometric equalizers, attributing statements to speakers and logging chronological transcripts."
          },
          {
            "title": "Whisper Suggestion Engine & Action Checklist",
            "description": "Generates tactical replies and fact-checks on what speakers said, keeping a live checklist of meeting action items."
          }
        ]
      },
      {
        "category": "⚡ Multi-Agent Swarms & Visual Collaboration",
        "items": [
          {
            "title": "Interactive Kanban Board",
            "description": "Organize tasks across Backlog, In Progress, Review, and Completed columns, seamlessly reflecting running sub-agents and planner steps."
          },
          {
            "title": "Power Slash Commands & One-Click Templates",
            "description": "Fast trigger shortcuts for presentations (/deck), executive documents (/doc), animations (/anim), security audits (/audit), and TV casting (/cast)."
          }
        ]
      },
      {
        "category": "🔍 Browser DOM Inspector & Semantic Knowledge Graph",
        "items": [
          {
            "title": "Agent Eye Live Inspector",
            "description": "Inspect the browser DOM accessibility tree, element interaction refs, and recent browser automation actions in a dedicated slide-over drawer."
          },
          {
            "title": "TurboQuant Vector Memory Visualizer",
            "description": "Dual-mode radial graph linking user preferences, architecture decisions, meeting notes, and research citations."
          }
        ]
      }
    ]
  },
  {
    "version": "6.2.0",
    "title": "Yogatik 6.2.0: LiveView Ambient HUD, Scanned PDF Auto-OCR & Universal File Extraction",
    "date": "September 5, 2026",
    "isLatest": false,
    "highlights": [
      "LiveView Ambient HUD & Perceptual Diffing: Floating pill HUD with biometric audio waveforms, dynamic 5 FPS frame scaling, and 70% bandwidth reduction via 64-bit pHash perceptual change detection",
      "Spatial Telestration & Live Stage: Real-time visual vectors, highlights, and annotations directly over screen feeds plus a synchronized workspace side stage for live code/document projections",
      "Scanned PDF Auto-OCR & RAG Persistence: Automatic detection of flattened raster tickets and image documents with 1.75x high-DPI offscreen canvas rendering and client-side Tesseract OCR indexing",
      "Universal Client-Side File Extraction: Direct extraction for Word (.docx), Excel spreadsheets (.xlsx/.xls), images via OCR, and 50+ programming languages with automated UTF-8 byte inspection fallback",
      "Multi-Platform Production Distributions: Automated release pipeline publishing standalone Windows (.exe), macOS Apple Silicon & Intel (.dmg/.zip), Linux (.AppImage/.deb), and self-hostable Web (.zip)"
    ],
    "sections": [
      {
        "category": "🎙️ LiveView High-Performance Architecture",
        "items": [
          {
            "title": "Perceptual screen differencing & dynamic framerate",
            "description": "Adaptive 64-bit pHash comparison skips redundant frames to cut API token costs by 70%, dynamically scaling from 0.5 FPS up to 5 FPS on active screen changes."
          },
          {
            "title": "Live Dock Overlay & interactive HUD",
            "description": "Ambient floating control pill provides live audio waveforms, instant device routing, and latency/FPS telemetry without obstructing active workspace windows."
          },
          {
            "title": "Spatial telestration & workspace artifact stage",
            "description": "Visual vector annotations over screen captures and a dedicated live side-stage for interactive code and document reviews during audio calls."
          }
        ]
      },
      {
        "category": "📄 Document Intelligence & RAG Persist",
        "items": [
          {
            "title": "Scanned PDF high-DPI auto-OCR",
            "description": "Flattened tickets, receipts, and graphic PDFs automatically render to an offscreen 1.75x canvas and run through client-side Tesseract OCR."
          },
          {
            "title": "Guaranteed local IndexedDB storage",
            "description": "Extracted text from scanned documents is immediately chunked and indexed into IndexedDB, fully queryable via doc_list and doc_search."
          }
        ]
      },
      {
        "category": "🌐 Universal Document & File Support",
        "items": [
          {
            "title": "Microsoft Word (.docx) & Excel (.xlsx)",
            "description": "Client-side XML parsing for Word documents and SheetJS tabular CSV conversion for multi-sheet Excel spreadsheets."
          },
          {
            "title": "Universal text & code inspection",
            "description": "Automated byte inspection identifies any text-encoded file (including extensionless Dockerfile, Makefile, LICENSE) and indexes it cleanly."
          }
        ]
      },
      {
        "category": "🚀 Multi-Platform Releases & Web App",
        "items": [
          {
            "title": "Standalone Web App zip & Desktop matrix",
            "description": "Automated GitHub Actions pipeline builds and publishes yogatik-web-dist.zip and installers for Windows, macOS, and Linux."
          }
        ]
      }
    ]
  },
  {
    "version": "6.1.0",
    "title": "Yogatik 6.1.0: Real-Time Live Vision HUD, AI Voice Mute, Chrome AI Tools & Process Tree Management",
    "date": "September 4, 2026",
    "isLatest": false,
    "highlights": [
      "Live Feed Object Detection Overlay: Client-side continuous DETR object detection with smart mirror coordinate mapping and aHash change-gated visual processing",
      "AI Voice Output Mute: Dedicated speaker audio toggle in Live call controls with cascade choke-point gating and zero-latency gain-node muting",
      "Chrome Built-in AI (Gemini Nano) Tool Calling: Fixed prompted-mode tool injection on turn start and added interactive replay status heartbeats",
      "Honest Web Scraping & Proxy Routing: Eliminated fabricated bypass and browser claims in Scrapling and Lightpanda; routed all URL fetches through resilient proxy layer",
      "Sports Scores & Anime Lookup: Added keyless TheSportsDB live sports tracking and Jikan/MyAnimeList search; unified Wayback Machine archive tools",
      "Process Tree Kill & Terminal Server Safety: Robust taskkill/SIGKILL tree termination preventing port binding leaks on stopped dev servers"
    ],
    "sections": [
      {
        "category": "🎙️ Live Audio & Vision HUD",
        "items": [
          {
            "title": "Real-time on-device object detection overlay",
            "description": "Local DETR pipeline continuously identifies scene objects in live camera feeds with mirrored coordinate correction and zero server token costs."
          },
          {
            "title": "AI voice output mute control",
            "description": "Instant speaker toggle in Live call controls silences spoken output at the synthesizer choke point without interrupting captions or session state."
          }
        ]
      },
      {
        "category": "🤖 AI Models & Provider Connectivity",
        "items": [
          {
            "title": "Chrome AI & on-device model tool access",
            "description": "Fixed prompted tool definition delivery for isLocal providers so Gemini Nano and WebLLM models can access and invoke Yogatik tools on turn 1."
          },
          {
            "title": "On-device replay progress heartbeats",
            "description": "Detailed live status updates during conversation history playback eliminate perceived application freezes during on-device model turns."
          }
        ]
      },
      {
        "category": "🔍 Web Intelligence & Public Tools",
        "items": [
          {
            "title": "Sports scores, schedules & standings",
            "description": "Added keyless TheSportsDB integration for real-time fixtures, live scores, and league tables across football, basketball, and more."
          },
          {
            "title": "Anime & manga database lookup",
            "description": "Integrated Jikan API for anime/manga search, top-ranked titles, synopsis, and character details directly from MyAnimeList."
          },
          {
            "title": "Resilient web scraping & unified Wayback archive",
            "description": "Replaced unhandled fetch calls with proxyText CORS routing, removed fabricated claims in Scrapling/Lightpanda, and sandboxed JS evaluation."
          }
        ]
      },
      {
        "category": "💻 Desktop Terminal & Process Engine",
        "items": [
          {
            "title": "Full process tree termination",
            "description": "Shared procKill architecture reliably terminates dev servers and background process trees across Windows and POSIX without leaking port bindings."
          },
          {
            "title": "Terminal long-running process protection",
            "description": "Automatic detection of persistent dev servers in terminal_run avoids 5-minute timeout hangs and guides the agent to proc_start."
          }
        ]
      }
    ]
  },
  {
    "version": "5.2.0",
    "title": "Yogatik 5.2.0: Dynamic Model Discovery, Provider CORS Bypass & Resilient Web Tools",
    "date": "September 4, 2026",
    "isLatest": false,
    "highlights": [
      "Dynamic Model Discovery: Directly queries and live-validates available models from upstream providers (NVIDIA NIM, Anthropic, OpenAI, custom endpoints) with zero hardcoded presets",
      "Provider CORS Bypass: High-speed edge proxy routing with X-Target-URL for NVIDIA NIM, Anthropic, and custom endpoints eliminating CORS preflight errors in browser",
      "Instant Bot-Free Web Search: Official DuckDuckGo Instant Answer API integration for high-speed search without anti-bot blocks or 500 relay failures",
      "Statically Bundled Tools: Built-in MCP registry bundling to eliminate dynamic chunk 404 network fetch errors during conversation turns",
      "Desktop Packaging Pipeline: Resilient GitHub Actions multi-platform workflow with continue-on-error artifact uploads and unmetered Releases publishing"
    ],
    "sections": [
      {
        "category": "🤖 AI Models & Provider Connectivity",
        "items": [
          {
            "title": "Live dynamic model fetching",
            "description": "Providers now dynamically query /v1/models directly using your API key. No outdated preset lists or inaccessible model IDs."
          },
          {
            "title": "Zero-CORS edge proxy routing",
            "description": "Requests to NVIDIA NIM, Anthropic, and custom LLM providers route through a high-performance Cloudflare Worker proxy with target URL forwarding."
          }
        ]
      },
      {
        "category": "🔍 Web Search & Resilience",
        "items": [
          {
            "title": "DuckDuckGo Instant Answer API",
            "description": "Switched from fragile HTML scraping to official Instant Answer JSON API for instant, bot-block-free search queries."
          },
          {
            "title": "Static tool bundling",
            "description": "Eliminated runtime dynamic imports for MCP connector resolution to ensure uninterrupted agent execution."
          }
        ]
      },
      {
        "category": "💻 Cross-Platform Desktop Builds",
        "items": [
          {
            "title": "Unmetered release uploads",
            "description": "Desktop CI builds bypass temporary GitHub Actions artifact quotas and publish directly to public mirror Releases."
          }
        ]
      }
    ]
  },
  {
    "version": "5.1.0",
    "title": "Yogatik 5.1.0: MCP Auto-Connect, Relevance-Ranked Web Reading & On-Device AI Setup",
    "date": "September 3, 2026",
    "isLatest": false,
    "highlights": [
      "MCP Auto-Connect: a connector you already configured but left disabled reconnects on its own the moment a request needs it — no re-adding it by hand",
      "MCP Suggestions: when a request could use a connector you have not set up yet (GitHub, Stripe, Cloudflare, and more), Yogatik tells you so instead of quietly doing nothing",
      "Smarter Web Reading: web_extract can now target a long page for the passages that actually answer your question instead of just the first few thousand characters",
      "File Skimming: a new fs_skim tool lets the agent see a source file’s shape — every function and class signature — before deciding whether to read the whole thing",
      "On-Device AI Setup Fixed: picking WebLLM or Chrome’s built-in AI now shows a real consent screen with download progress, instead of silently starting a multi-hundred-MB download"
    ],
    "sections": [
      {
        "category": "🔌 MCP Connectors",
        "items": [
          {
            "title": "Automatic reconnect for configured servers",
            "description": "A connector you already added but disabled is flipped back on and reconnected for the turn that needs it — never for one you have not configured, since that would need a credential Yogatik does not have."
          },
          {
            "title": "Honest suggestions, never a silent connection",
            "description": "An unconfigured but relevant connector is named in plain language, with what it needs to set up — Yogatik never claims to be using something it is not actually connected to."
          }
        ]
      },
      {
        "category": "📄 Reading Files & the Web",
        "items": [
          {
            "title": "Relevance-ranked page excerpts",
            "description": "Give web_extract a focus and it ranks a long page’s passages instead of blindly truncating — the answer buried at the bottom of an article is no longer missed."
          },
          {
            "title": "fs_skim file skeletons",
            "description": "See a file’s functions, classes, and structure with long bodies collapsed to a line count — a fast way to decide what is worth a full read."
          }
        ]
      },
      {
        "category": "🖥️ On-Device AI",
        "items": [
          {
            "title": "Real consent before any download",
            "description": "WebLLM and Chrome’s built-in AI now show model size, a download button, and live progress — nothing downloads until you choose to."
          }
        ]
      }
    ]
  },
  {
    "version": "4.3.2",
    "title": "Yogatik 4.3.2: Desktop Pro Entitlement Sync, Version Dropdown & Clean Tool Registry",
    "date": "September 2, 2026",
    "isLatest": false,
    "highlights": [
      "Desktop Pro Account Sync: Fixed Firebase auth state preservation on desktop so Pro subscriptions and 30-day trials sync immediately between web and desktop",
      "Interactive Version Dropdown: Added version selector dropdown to the What’s New showcase with instantaneous switching across recent releases",
      "Clean & Resilient Tool Registry: Streamlined agent tools and removed noisy recipe lookup failures for smooth, robust task completion",
      "Cross-Platform Build Parity: Synchronized release 4.3.2 across web app, Windows installer (NSIS), macOS DMG, and Linux AppImage/Deb packages",
      "Hardened Native IPC Lifecycle: Safe window messaging across Electron main and renderer processes eliminating destroyed-window exceptions"
    ],
    "sections": [
      {
        "category": "🌐 Browser Automation & Tools",
        "items": [
          {
            "title": "Interactive DOM & Accessibility Tree",
            "description": "Agent directly queries and interacts with live browser tabs using semantic DOM trees and scoped ref keys."
          },
          {
            "title": "Live Viewport Highlighting",
            "description": "Visual overlay displays targeted interactive elements in real-time during autonomous navigation."
          }
        ]
      },
      {
        "category": "🧠 Agent Intelligence & Reflex",
        "items": [
          {
            "title": "Reflective Self-Evaluation",
            "description": "Integrated reflex heuristics detect stagnation, repetitive errors, and automatically guide the agent toward alternate strategies."
          }
        ]
      }
    ]
  },
  {
    "version": "4.3.1",
    "title": "Yogatik 4.3.1: Interactive Browser Automation, Agent Reflex Loop & Cross-Platform Desktop Sync",
    "date": "September 2, 2026",
    "isLatest": false,
    "highlights": [
      "Interactive Browser Automation: Full IPC-driven browser control with accessibility tree parsing, interactive element targeting, and visual viewport highlight overlay",
      "Autonomous Agent Reflex Loop: Added reflective self-evaluation heuristics to detect repetitive tool calls, inspect progress, and trigger corrective reasoning mid-turn",
      "Cross-Platform Desktop & Web Parity: Synchronized version 4.3.1 across web app, Windows installer (NSIS), macOS DMG, and Linux AppImage/Deb packages",
      "Hardened Native IPC Lifecycle: Safe window messaging across Electron main and renderer processes eliminating destroyed-window exceptions",
      "Optimized App State & Rendering: Clean separation of UI state helpers and reactive sub-agent pipelines for smooth chat execution"
    ],
    "sections": [
      {
        "category": "🌐 Browser Automation & Tools",
        "items": [
          {
            "title": "Interactive DOM & Accessibility Tree",
            "description": "Agent directly queries and interacts with live browser tabs using semantic DOM trees and scoped ref keys."
          },
          {
            "title": "Live Viewport Highlighting",
            "description": "Visual overlay displays targeted interactive elements in real-time during autonomous navigation."
          }
        ]
      },
      {
        "category": "🧠 Agent Intelligence & Reflex",
        "items": [
          {
            "title": "Reflective Self-Evaluation",
            "description": "Integrated reflex heuristics detect stagnation, repetitive errors, and automatically guide the agent toward alternate strategies."
          }
        ]
      }
    ]
  },
  {
    "version": "4.2.0",
    "title": "Yogatik 4.2: Desktop Account Linking Fix, Faster Startup, Cleaner Codebase",
    "date": "September 2, 2026",
    "isLatest": false,
    "highlights": [
      "Fixed: desktop sign-in was authenticating to the CLOUD FUNCTION correctly but never actually authenticating its own local Firestore session — a credential-type mismatch (Firebase ID token fed to an API expecting Google's own OAuth token) meant every Firestore call from the desktop app went out unauthenticated and was silently rejected",
      "Fixed: API key / chat cloud sync between web and desktop for the same signed-in account — was a direct consequence of the auth bug above",
      "Fixed: desktop showing \"Trial ended\" / an upgrade prompt for accounts that are Pro on the web — the desktop's licence refresh was resending an already-expired sign-in token on every window-focus check instead of fetching a current one, and eventually the local licence cache aged out with nothing to renew it",
      "The \"Trial ended\" account screen now names the real reason (no licence yet, wrong account, clock rollback, awaiting renewal, etc.) instead of one label for every locked state",
      "Initial app bundle cut ~34% (1.79MB → 1.18MB, 587KB → 386KB gzipped) by loading the ~195-tool registry as its own background chunk instead of blocking first paint",
      "Fixed a crash on the payment-success return path (`?paid=1`) that could blank the whole app right after a customer paid",
      "Housekeeping: removed a dead pnpm monorepo scaffold left in the repo root; corrected stale docs that still described a second (Tauri) desktop shell — that shell was already retired"
    ],
    "sections": [
      {
        "category": "🔐 Account & Sync",
        "items": [
          {
            "title": "Desktop Firestore authentication fixed",
            "description": "The desktop app now correctly authenticates its own local Firebase session on sign-in, instead of silently failing and sending every key/chat sync request unauthenticated."
          },
          {
            "title": "Licence refresh uses a live token",
            "description": "Window-focus and background entitlement checks now fetch a current sign-in token instead of resending the one captured at sign-in, which expires within the hour."
          },
          {
            "title": "Accurate locked-state messaging",
            "description": "The account page names the real reason a device is locked (no licence yet, wrong account, clock rollback, awaiting renewal) instead of always saying \"trial ended\"."
          }
        ]
      },
      {
        "category": "⚡ Performance",
        "items": [
          {
            "title": "Tool registry loads in the background",
            "description": "The ~195-tool registry now ships as its own chunk fetched right after first paint instead of blocking the initial page load — the main bundle is about a third smaller."
          }
        ]
      }
    ]
  },
  {
    "version": "4.1.5",
    "title": "Yogatik 4.1: Pro Payment Versioning, Cross-Platform Desktop Matrix & Unified Clean Provider Hub",
    "date": "September 2, 2026",
    "isLatest": false,
    "highlights": [
      "Pro Payment Versioning: File-system access restrictions and pro entitlements tied directly to live Paddle/Razorpay subscription verification",
      "Cross-Platform Git Builds: Complete multi-platform build matrices configured for Windows (.exe / NSIS), macOS (.dmg / universal), and Linux (.AppImage / .deb)",
      "Clean AI Provider Hub: Neutral provider directory with auto-loading models across custom API endpoints, Ollama daemons, and on-device WebLLMs",
      "Sanitized Read Aloud TTS: Model thinking/scratchpads, tool execution traces, and raw code blocks are automatically filtered from voice playback",
      "Universal Theme Synchronization: Zero-flash light/dark theme persistence across all application surfaces, command palettes, and static marketing pages"
    ],
    "sections": [
      {
        "category": "🔐 Pro Payment & Entitlements",
        "items": [
          {
            "title": "Pro Feature Gate & Verification",
            "description": "Unlocks local workspace tools and advanced intelligence capabilities for active subscribers with immediate fallback for standard web users."
          },
          {
            "title": "Live Subscription Days Counter",
            "description": "Accurate billing cycle and countdown display showing exact active subscription duration."
          }
        ]
      },
      {
        "category": "🌐 Cross-Platform Build Pipelines",
        "items": [
          {
            "title": "Windows, macOS & Linux Multi-Targeting",
            "description": "Automated GitHub release builds producing signed Windows installers, macOS DMG bundles, and Linux AppImages."
          }
        ]
      }
    ]
  },
  {
    "version": "4.0.0",
    "title": "Yogatik 4.0: Dedicated Full-Page Dashboard, Live Paddle Billing, Left Sidebar Overhaul & Theme Sync",
    "date": "September 1, 2026",
    "isLatest": false,
    "highlights": [
      "Dedicated Full-Page Dashboard & Settings: Transformed settings and tool panels into a spacious, full-viewport dashboard experience with dedicated URLs (/app/settings, /app/billing, /app/agents, /app/usage, /app/mcp, /app/skills) and single-step Esc/Back-to-Chat navigation",
      "Clean Minimalist Sidebar: Streamlined conversation history view with date groupings, quick search, and an unobtrusive status and dashboard trigger",
      "Live Paddle & Razorpay Billing: Live subscription checkout ($9.99/mo & $99.99/yr), Google Secret Manager automated webhook signature verification, and instant pro entitlement activation",
      "Universal Light & Dark Theme Synchronization: Complete contrast and theme overhaul across the Universal Search Command Palette (Ctrl+K), Social Media & Domain Hub, and all modal surfaces",
      "Local AI Daemon & Multimodal Suite: Native ComfyUI daemon lifecycle, Windows Ollama binary resolution, and layered Live Voice & Vision HUD"
    ],
    "sections": [
      {
        "category": "🖥️ Dedicated Full-Page Dashboard",
        "items": [
          {
            "title": "Full-Viewport Canvas & Clean Navigation",
            "description": "A 100vw × 100vh dedicated workspace providing plenty of breathing room for AI Providers, API key configurations, Model latency benchmarks, Billing history, Specialized Agents, MCP Servers, and Diagnostics logs."
          },
          {
            "title": "Direct URL Routing & Deep Links",
            "description": "Direct deep-linkable URLs (/app/settings, /app/billing, /app/agents, /app/usage, /app/skills, /app/mcp, /app/plugins, /app/diagnostics, /app/capabilities) with full browser history synchronization."
          },
          {
            "title": "Instant Back-to-Chat Escape",
            "description": "Seamless Esc keypress and topbar/sidebar \"Back to Chat\" actions that return you directly to your active chat without reloading state."
          }
        ]
      },
      {
        "category": "💳 Production Payments & Billing",
        "items": [
          {
            "title": "Paddle Live Billing Gateway",
            "description": "Integrated live Paddle client token and products ($9.99/month and $99.99/year) with automated Google Secret Manager webhook fulfillment."
          },
          {
            "title": "Domestic Razorpay UPI Integration",
            "description": "Full support for Indian domestic UPI and card checkout with live Razorpay payment processing."
          }
        ]
      },
      {
        "category": "🎨 Theme Synchronization & Polished UI",
        "items": [
          {
            "title": "Universal Search & Palette Theme Sync",
            "description": "High-contrast light and dark themes for the Ctrl+K Command Palette with crisp typography and responsive shortcut pills."
          },
          {
            "title": "Social Media & Domain Hub Light Mode",
            "description": "Clean light mode styling for Naukri, LinkedIn, YouTube, X, and Indeed search integration cards."
          }
        ]
      }
    ]
  },
  {
    "version": "3.22.4",
    "title": "Yogatik Ultra: ComfyUI Local Daemon, Deep Links, Layered Live HUD & Windows Ollama Path Resolution",
    "date": "September 1, 2026",
    "isLatest": false,
    "highlights": [
      "Local ComfyUI Daemon & Workflows: Added native ComfyUI daemon lifecycle management and direct HTTP workflow execution for on-device image generation",
      "Windows Ollama Path Resolution: Fixed user profile path discovery for Windows accounts with special usernames and added HTTP model streaming fallback",
      "Layered Live HUD Overlay: Re-architected Live call HUD into non-colliding bands with safe-area spacing and Live settings bottom sheet",
      "Deep Linking & CSP Whitelisting: Added yogatik:// deep link support and updated CSP connect-src with explicit local loopback daemon ports (11434, 1234, 8188)"
    ],
    "sections": [
      {
        "category": "🎨 ComfyUI & Local Generation",
        "items": [
          {
            "title": "Native ComfyUI Daemon Support",
            "description": "Automatic detection, probing, and background launching of local ComfyUI instances on port 8188 with text2image workflows."
          },
          {
            "title": "Windows Ollama Homedir Resolution",
            "description": "Accurate binary resolution via os.homedir() with HTTP polling fallback so local Ollama models are discovered flawlessly."
          }
        ]
      },
      {
        "category": "🎙️ Live Experience",
        "items": [
          {
            "title": "Layered Live HUD & Settings",
            "description": "Non-colliding vertical bands for reticle, real-time speech captions, action chips, and call controls with sound cues."
          }
        ]
      }
    ]
  },
  {
    "version": "3.22.3",
    "title": "Yogatik Ultra: Live Device Picker, Front/Back Camera Flipping, On-Device Image Segmentation & Crash Hardening",
    "date": "August 31, 2026",
    "isLatest": false,
    "highlights": [
      "Live Device Selection: Real-time audio and camera device picker bottom sheet with instant front/back camera flipping without ending the call",
      "On-Device Image Segmentation: Added segment tool for instant background removal, object isolation and cutout operations",
      "Lint & Stability Hardening: Resolved undefined variable crashes in LiveView and PersonalisePanel, and prevented AdSense push TagError",
      "Global Pricing Normalization: Unified Pro tier at $9/mo or $99/year internationally across all checkout and landing pages"
    ],
    "sections": [
      {
        "category": "🎙️ Live Voice & Vision",
        "items": [
          {
            "title": "Live Device Picker & Flip",
            "description": "Hot-swap microphones and cameras during an active live call with thumb-friendly controls and auto hardware detection."
          },
          {
            "title": "On-Device Segmentation",
            "description": "Extract and isolate objects or remove image backgrounds locally on-device without cloud upload."
          }
        ]
      }
    ]
  },
  {
    "version": "3.22.2",
    "title": "Yogatik Ultra: Seamless Marketing-to-Paywall Routing, In-Modal Sign-In & Platform Pricing Matrix",
    "date": "August 31, 2026",
    "isLatest": false,
    "highlights": [
      "Deep-Linked Upgrade Funnel: Instant navigation from marketing pages (/platforms) directly to the interactive paywall with ?upgrade=1",
      "In-Modal Frictionless Sign-In: Direct sign-in action within the upgrade modal with automatic modal restoration post-auth",
      "Unified Marketing Pricing Matrix: Complete transparent tiers comparison on the platforms showcase"
    ],
    "sections": [
      {
        "category": "✨ Funnel & Conversion UX",
        "items": [
          {
            "title": "Marketing Paywall Integration",
            "description": "Direct deep linking from static landing and download pages into the live checkout modal."
          },
          {
            "title": "Seamless Authentication Recovery",
            "description": "One-click sign-in trigger from the upgrade modal that automatically restores checkout flow after Google auth."
          }
        ]
      }
    ]
  },
  {
    "version": "3.22.1",
    "title": "Yogatik Ultra: Multi-Surface Entitlements, Razorpay/Paddle Checkout Routing & Ad Suppression",
    "date": "August 31, 2026",
    "isLatest": false,
    "highlights": [
      "Multi-Surface Pro Entitlement: Unified single account subscription across web and desktop with reactive ad suppression",
      "Dedicated /checkout Gateway: Seamless routing for Razorpay (UPI/Card) and Paddle with token protection and CSP security",
      "Live Account Sync: Direct Firestore account integration for real-time subscription status without Cloud Function overhead",
      "Enhanced Upgrade Pitch: Surface-aware upgrade modals tailored for web and desktop capabilities"
    ],
    "sections": [
      {
        "category": "💎 Entitlement & Monetization",
        "items": [
          {
            "title": "Unified Cross-Surface Subscriptions",
            "description": "Subscribing on web immediately unlocks desktop capabilities; desktop Pro users automatically enjoy ad-free web browsing."
          },
          {
            "title": "Standalone Checkout Routing",
            "description": "Dedicated static checkout route bypassing SPA catch-all with signature verification and error guards."
          }
        ]
      }
    ]
  },
  {
    "version": "3.22.0",
    "title": "Yogatik Ultra: Interactive Human-In-The-Loop Execution, Native Video Players & Command Controls",
    "date": "August 29, 2026",
    "isLatest": false,
    "highlights": [
      "Interactive Human-In-The-Loop Execution: Added ask_user tool with interactive decision cards and option selection mid-turn",
      "Continuous Input & Steer Mode: Send messages seamlessly while the AI is busy; toggle between FIFO Queue and Immediate Steer execution",
      "Terminal Command Auto Execution Settings: Configure terminal approval policies (Always Proceed, Ask for Confirmation, Never Allow) in Settings",
      "Native Embedded Video & YouTube Player: Responsive in-chat YouTube video player with resilient ID parsing and HTML5 direct video playback",
      "Document Deduplication & Multi-Tier Translation: Zero-storage SHA-256 hash deduplication and multi-tier fallback translation pipeline"
    ],
    "sections": [
      {
        "category": "⚡ Execution & Human-In-The-Loop",
        "items": [
          {
            "title": "Interactive Question Prompt",
            "description": "AI pauses mid-execution when user preferences or decisions are needed, displaying interactive choices and resuming continuously upon selection."
          },
          {
            "title": "Terminal Execution Approval Mode",
            "description": "Customizable execution policies for terminal commands: Always Proceed (autonomous), Ask for Confirmation, or Never Allow."
          },
          {
            "title": "Follow-up Delivery Config",
            "description": "Switch between FIFO queued message delivery or immediate steering while the agent is running."
          }
        ]
      },
      {
        "category": "🎬 Multimedia & Performance",
        "items": [
          {
            "title": "Inline YouTube & HTML5 Video Player",
            "description": "Embedded responsive video players for YouTube URLs, direct MP4/WebM files, and AI-generated animations."
          },
          {
            "title": "Content Hash Deduplication",
            "description": "Instant SHA-256 hash checking prevents redundant file indexing and cuts IndexedDB storage waste."
          }
        ]
      }
    ]
  },
  {
    "version": "3.21.0",
    "title": "Yogatik Ultra: Isolated Workspace Roots, Zero-Latency Streaming & Academic Peer Review Swarm",
    "date": "August 28, 2026",
    "isLatest": false,
    "highlights": [
      "Strict Per-Chat Root Isolation: Added automatic unbinding on chat deletion and eliminated global default folder pollution",
      "Ultra-Low Latency Pipeline: Speculative Pyodide WASM pre-warming and parallel multi-agent swarm evaluation cut execution delays by >50%",
      "Enterprise Academic & IEEE Tools: Integrated OpenAlex citation graphs, DOI Crossref resolution, and CSL-JSON bibliography manager",
      "Hardware Verification & UVM Architecture: IEEE 1800.2 UVM testbench generator and SystemVerilog Assertions (SVA) synthesizer",
      "LaTeX Error Diagnostics & Multi-File Bundling: Automated Overleaf ZIP generator and compiler error triage parser"
    ],
    "sections": [
      {
        "category": "⚡ Performance & Workspace Isolation",
        "items": [
          {
            "title": "Isolated Working Folders",
            "description": "Chats maintain strictly isolated directory scopes; deleting a conversation cleanly releases all bound filesystem resources without affecting other chats."
          },
          {
            "title": "Concurrent Multi-Agent Review",
            "description": "Algorithm Architect and Verification Engineer evaluate proposals in parallel, slashing consensus latency from 6s to 2.5s."
          },
          {
            "title": "WASM & Runtime Pre-Warming",
            "description": "Speculatively initializes Pyodide Python kernels during typing idle frames for zero-cold-start execution."
          }
        ]
      },
      {
        "category": "📚 Academic & Hardware Verification",
        "items": [
          {
            "title": "UVM IEEE 1800.2 Generator",
            "description": "Instant generation of SystemVerilog UVM sequence items, drivers, monitors, and scoreboards."
          },
          {
            "title": "Overleaf Multi-File Packager",
            "description": "Bundles complete LaTeX documents with IEEEtran.cls, bibtex references, and latexmkrc configurations."
          }
        ]
      }
    ]
  },
  {
    "version": "3.20.0",
    "title": "Yogatik Studio Edition: Native Git Tools, Intelligent Turn Auto-Scroll & Resilient File Diagnostics",
    "date": "August 25, 2026",
    "isLatest": false,
    "highlights": [
      "Native Git Tool (`fs_git`): Added structured status, diff, log, commit, staging and unstage actions without raw shell risks",
      "Intelligent Turn Auto-Scroll: Opening or switching any chat instantly focuses on the latest prompt and response with sub-tick layout shift stabilization",
      "Self-Healing Query Aliases: Auto-repairs missing query keys from prompt topics, questions, and search terms to eliminate tool validation errors",
      "Resilient File System Diagnostics: Cleanly handles missing file lookups (ENOENT) with helpful directory search suggestions instead of provider error cards",
      "Multi-Chat Context Isolation: Parallel turns and subagents execute with fully isolated filesystem, PTY, and browser contexts"
    ],
    "sections": [
      {
        "category": "🛠️ Git & Workspace Tools",
        "items": [
          {
            "title": "Native Version Control",
            "description": "Inspect status, review staged/unstaged diffs, browse history, and stage/commit files directly via structured tools."
          },
          {
            "title": "Self-Healing Tool Repair",
            "description": "Automatic parameter alias resolution and schema type coercion prevent tool crashes."
          }
        ]
      },
      {
        "category": "🎨 UX & Chat Workflow",
        "items": [
          {
            "title": "Instant Bottom Alignment",
            "description": "Chats now open focused on the most recent message with markdown layout compensation."
          }
        ]
      }
    ]
  },
  {
    "version": "3.19.0",
    "title": "Yogatik Studio Edition: Multi-Chat Parallel Isolation, Advanced Browser Automation & JIT Schema Engine",
    "date": "August 25, 2026",
    "isLatest": false,
    "highlights": [
      "Multi-Chat Context Isolation: Parallel chats run their own independent tools, terminals, filesystem workspaces, and browser sessions without cross-talk",
      "Advanced Browser Automation: Added native hover, PDF export, cookie & storage inspectors, and batch script pipeline execution (`run_script`)",
      "JIT Schema Prioritization: Intent-driven tool schema filtering saves 70% prompt tokens and eliminates small-model hallucinations",
      "Multi-Agent Shared Blackboard: Inter-agent in-memory artifact sharing for parallel DAG dependency waves",
      "Self-Healing Tool Reflection: Inline error remediation hints and schema type coercion for zero-crash tool calling"
    ],
    "sections": [
      {
        "category": "⚡ Parallel Multi-Agent Runtime",
        "items": [
          {
            "title": "Isolated Workspace Contexts",
            "description": "Every concurrent chat turn and sub-agent executes in its own isolated filesystem and terminal context."
          },
          {
            "title": "Inter-Agent Blackboard",
            "description": "Dispatched specialist sub-agents pass discovery notes, code snippets, and verified facts via in-memory shared blackboard."
          }
        ]
      },
      {
        "category": "🌐 Browser & Web Automation",
        "items": [
          {
            "title": "Extended Browser Controls",
            "description": "Full support for hover, print to PDF, cookie manipulation, local/session storage reads, and transactional multi-step automation scripts."
          }
        ]
      }
    ]
  },
  {
    "version": "3.18.0",
    "title": "Yogatik Studio Edition: 100% Independent Agentic Engine & 1,465+ Skills Library",
    "date": "August 25, 2026",
    "isLatest": false,
    "highlights": [
      "Yogatik Studio: Standalone, unrestricted desktop edition running with isolated storage and zero license gates",
      "Autonomous Skills Engine: Integrated Stable Skills Manifest v1 with 1,465+ agentic skills across 18 domains",
      "Autonomous Workflows: Built-in multi-stage execution DAGs (SaaS MVP Launch, Security Hardening, Refactoring, Full-Stack Delivery)",
      "Dynamic @skill Mentions: Instant prompt augmentation with specialized rules, constraints, and tool permissions",
      "Zero Cloud Dependency: Fully offline skill catalog indexing and local vector retrieval via TurboVec"
    ],
    "sections": [
      {
        "category": "🎨 Yogatik Studio Edition",
        "items": [
          {
            "title": "Dedicated Studio Branding & Binaries",
            "description": "Packaged as Yogatik Studio (`release-studio/Yogatik Studio.exe` and `Yogatik-Studio-Setup.exe`) with dedicated studio bat script."
          },
          {
            "title": "Unrestricted Developer Runtime",
            "description": "All system tools, terminals, file system commands, and AI features run without subscription gates or network license checks."
          }
        ]
      },
      {
        "category": "🌌 1,465+ Skills & Workflows Catalog",
        "items": [
          {
            "title": "Stable Skills Manifest v1",
            "description": "Full compatibility with the universal SKILL.md specification and role-based curated bundles."
          },
          {
            "title": "Autonomous DAG Workflows",
            "description": "Execute multi-step sequences from ideation to TDD, security review, and PR packaging."
          }
        ]
      }
    ]
  },
  {
    "version": "3.17.0",
    "title": "Hyper-Stable Reactive Architecture, Window Guards & Unrestricted Desktop Suite",
    "date": "August 25, 2026",
    "isLatest": false,
    "highlights": [
      "Zero-Tear Terminal Store: Referentially stable cached snapshots resolving React re-render loops (Error #185)",
      "100% Unrestricted Personal Desktop: Gating bypass, zero license checks, and isolated application user profile",
      "Native Window Lifecycle Hardening: Full protection against destroyed object exceptions during background tray and second-instance activations",
      "Multi-Persona AI Companion: Pair Programmer, Security Analyst, Code Copilot, and Concierge with live voice PTT",
      "Proactive Quick Actions & Code Copy: 1-click Git review, error scanner, test generator, and formatted code blocks"
    ],
    "sections": [
      {
        "category": "⚡ Architecture & Stability",
        "items": [
          {
            "title": "Stable useSyncExternalStore Snapshots",
            "description": "Cached timeline data arrays in terminalStore preventing unbounded update loops and improving desktop UI responsiveness."
          },
          {
            "title": "Safe Native Window Lifecycle",
            "description": "Electron main process handlers verify BrowserWindow destroyed status before invoking IPC methods across tray, hotkeys, and second instances."
          }
        ]
      },
      {
        "category": "🚀 Personal Edition & Companion",
        "items": [
          {
            "title": "Unrestricted Execution Runtime",
            "description": "All developer tools, filesystem actions, terminal access, and agents run without payment barriers or license validation."
          }
        ]
      }
    ]
  },
  {
    "version": "3.16.0",
    "title": "Unrestricted Personal Desktop Edition, Proactive AI Companion & Resilient Lifecycle",
    "date": "August 25, 2026",
    "isLatest": false,
    "highlights": [
      "Unrestricted Personal Edition: 100% unlocked native desktop application with no subscriptions, restrictions, or license gates",
      "Multi-Persona AI Companion: Specialized modes (Pair Programmer, Security Analyst, Code Copilot, Concierge) with dynamic prompt injection",
      "Proactive Dev Quick Actions: 1-click Git Diff Review, Terminal Error Scanner, Active File Explainer, and Test Generation",
      "Push-to-Talk & Global Shortcuts: Dedicated PTT voice dictation, shortcuts (Ctrl+Alt+V / W / M), and live audio equalizer animation",
      "Syntax Code Blocks & Copy: High-readability formatted code blocks with 1-click copy inside AI Companion turns",
      "Resilient Window Lifecycle: Hardened against destroyed window exceptions across tray, second-instance, and global hotkeys"
    ],
    "sections": [
      {
        "category": "🚀 Personal Desktop Edition",
        "items": [
          {
            "title": "Zero-Restriction Desktop Architecture",
            "description": "The Personal Edition completely compiles out entitlement checks, licensing modals, and tool restrictions, allowing unlimited offline execution."
          },
          {
            "title": "Hardened Native Runtime",
            "description": "All Electron window lifecycle hooks are guarded against destroyed instance exceptions when minimizing to tray or re-focusing."
          }
        ]
      },
      {
        "category": "🤖 AI Companion Suite",
        "items": [
          {
            "title": "Adaptive Companion Personas",
            "description": "Switch companion behavior between Pair Programmer, Security Analyst, Code Copilot, and Concierge with one click."
          },
          {
            "title": "Push-to-Talk & Live Audio Visualizer",
            "description": "Hold Push-to-Talk for noise-free voice dictation with an interactive waveform equalizer animation."
          }
        ]
      }
    ]
  },
  {
    "version": "3.15.0",
    "title": "Adaptive Scrapling Web Engine, Workspace IDE & Deep Task Limits",
    "date": "August 25, 2026",
    "isLatest": false,
    "highlights": [
      "Workspace IDE Suite: Integrated File Explorer, Git Changes panel, Side-by-Side Diff Viewer, and Code Editor pane",
      "Zero-Dependency Scrapling Engine: Self-healing adaptive element tracking using DOM fingerprints & semantic similarity",
      "Progressive Stealth Fetcher: Anti-bot bypass (Cloudflare Turnstile, Datadome, PerimeterX) with modern TLS hints",
      "Deep Tool Loop Allowance: Default round limit raised to 50–100 rounds for uninterrupted multi-step coding tasks",
      "Git Write Guard & Journal Core: Pre-write safety verification, workspace snapshotting, and transaction rollbacks",
      "Graceful Web/Desktop Routing: Clean fallbacks preventing web builds from hallucinating desktop-only capabilities"
    ],
    "sections": [
      {
        "category": "🕷️ Web Scraping & Intelligence",
        "items": [
          {
            "title": "Scrapling Adaptive Locator",
            "description": "Relocates mutated, obfuscated, or redesigned DOM elements using fuzzy string similarity and structural ancestry matching."
          },
          {
            "title": "Progressive Stealth Fetch",
            "description": "Emulates modern Chrome client headers and automatically detects anti-bot challenges before escalating."
          }
        ]
      },
      {
        "category": "⚡ Agent Runtime & Task Completion",
        "items": [
          {
            "title": "Expanded Tool Rounds",
            "description": "Raised max tool round ceiling from 20 to 100 in agent.js and Personalise panel for comprehensive multi-step refactoring and execution."
          },
          {
            "title": "Unparsed XML Tag Stripping",
            "description": "Sanitizes model outputs to ensure raw tool tags never leak into user-facing chat responses."
          }
        ]
      }
    ]
  },
  {
    "version": "3.14.0",
    "title": "In-Flight Prompt Queueing, Arrow History Recall & Resilient Filesystem",
    "date": "August 24, 2026",
    "isLatest": false,
    "highlights": [
      "Interactive In-Flight Prompt Queueing: Queue messages while model generates with automatic FIFO execution",
      "Keyboard Arrow History Navigation (↑/↓) with unsubmitted draft preservation",
      "Ambient AI Companion screen forwarding, STT voice input, TTS voice out, and webcam capture",
      "Resilient Fuzzy Line Matcher in fsCore & localFs for indentation-agnostic code edits",
      "Windows Drive Path Sanitization & workspace boundary enforcement"
    ],
    "sections": [
      {
        "category": "✨ New Features & Workflow",
        "items": [
          {
            "title": "Intelligent Message Queueing",
            "description": "Send follow-up prompts and attachment payloads while the model is busy. Prompts are held in a FIFO queue with an interactive banner (Edit/Cancel) and execute automatically upon turn completion."
          },
          {
            "title": "Command & Prompt History Recall",
            "description": "Pressing Up Arrow (↑) in empty composer recalls previous messages across session history, while Down Arrow (↓) traverses forward and restores work-in-progress drafts."
          },
          {
            "title": "Ambient Multimodal Suite",
            "description": "Screen monitoring, camera feeds, live voice speech-to-text dictation, and thinking-block sanitization are deeply integrated into the AI Companion."
          }
        ]
      },
      {
        "category": "⚡ Filesystem & Reliability",
        "items": [
          {
            "title": "Indentation & Whitespace Tolerance",
            "description": "applyEdit and fs_patch now use fuzzy line trimming to safely match blocks even with tabs/spaces discrepancies from LLM outputs."
          },
          {
            "title": "Windows Path Normalizer",
            "description": "Sanitizes Linux-style forward slash drive prefixes (/C:/...) and quoted paths before resolving within workspace roots."
          }
        ]
      }
    ]
  },
  {
    "version": "3.13.0",
    "title": "Universal Model Protocol, Resilient Patcher & High-Speed MCP Suite",
    "date": "August 24, 2026",
    "isLatest": false,
    "highlights": [
      "Universal XML, Nemotron, Hermes, Claude invoke & ReAct tool call parsing",
      "Unified Diff Resilient Patching engine (fs_patch) with fuzzy whitespace matching",
      "AST Code Outline & symbol extractor (code_outline) for high-speed file inspection",
      "Zero-Latency Stale-While-Revalidate discovery cache (<1ms) for Model Context Protocol",
      "Dynamic MCP Resource Templates, Multimodal Normalizer & Interactive Tool Tester"
    ],
    "sections": [
      {
        "category": "✨ New Features",
        "items": [
          {
            "title": "Universal Multi-Syntax Tool Call Parser",
            "description": "Extracts and runs tool calls from Nemotron XML, Hermes XML, Claude invoke tags, ReAct formats, and standard JSON seamlessly."
          },
          {
            "title": "Resilient Diff Patcher (fs_patch)",
            "description": "Applies unified diff hunks with offset tracking and fuzzy whitespace tolerance for safe atomic file edits."
          },
          {
            "title": "Interactive MCP Tool Tester & Inspector",
            "description": "Directly test any discovered MCP tool in the UI with custom JSON arguments and live latency metrics before handing off to the agent."
          }
        ]
      },
      {
        "category": "⚡ Performance & Protocol",
        "items": [
          {
            "title": "Sub-Millisecond MCP Discovery Cache",
            "description": "Loads all MCP schemas and resources instantly from IndexedDB cache on boot with background revalidation."
          },
          {
            "title": "High-Throughput Parallel Handshakes",
            "description": "Dispatches tools/list, resources/list, templates/list, and prompts/list concurrently with individual timeout guards."
          }
        ]
      }
    ]
  },
  {
    "version": "3.12.0",
    "title": "Autonomous Multi-Agent DAG & Multimodal UI Verification",
    "date": "August 24, 2026",
    "isLatest": false,
    "highlights": [
      "Topological Multi-Agent DAG Wave Scheduling with automatic dependency piping",
      "Multimodal UI Visual Verification tool (visual_verify) for offscreen component evaluation",
      "Speculative runtime pre-warming on user typing intent via requestIdleCallback",
      "Cross-Agent Shared Blackboard memory for zero-redundancy collaborative research",
      "Dynamic Self-Healing Tool Reflection & Error Auto-Repair hints"
    ],
    "sections": [
      {
        "category": "✨ New Features",
        "items": [
          {
            "title": "Topological Multi-Agent DAG Waves",
            "description": "Sub-agents can now declare depends_on relationships. Independent tasks execute concurrently in Wave 0, while downstream tasks automatically receive upstream findings in subsequent waves."
          },
          {
            "title": "Visual UI Verifier Tool",
            "description": "Generates snapshot images from HTML/CSS/SVG code so vision-capable LLMs (Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro) can inspect and iterate on their own visual designs."
          },
          {
            "title": "Cross-Agent Shared Blackboard",
            "description": "Sub-agents collaboratively publish and read findings on a shared session blackboard, eliminating duplicate web searches and token waste."
          }
        ]
      },
      {
        "category": "⚡ Performance & Optimization",
        "items": [
          {
            "title": "Speculative Tool Pre-Warming",
            "description": "Analyzes user input intent while typing to pre-warm WASM runtimes (Pyodide, Tesseract OCR, TurboVec) during idle frames."
          },
          {
            "title": "Semantic Context Compaction",
            "description": "Automatically compacts massive tool outputs and binary payloads before appending to conversation memory."
          }
        ]
      },
      {
        "category": "🛡️ Safety & Reliability",
        "items": [
          {
            "title": "Static Tool Parameter Guardrails",
            "description": "Strictly prevents destructive shell commands, fork bombs, and root directory deletions."
          },
          {
            "title": "Self-Healing Schema Repair",
            "description": "Automatically repairs argument aliases, type mismatches, and JSON stringified inputs from language models."
          }
        ]
      }
    ]
  },
  {
    "version": "3.11.0",
    "title": "Precision Prompting & High-Performance Hyperdrive",
    "date": "August 23, 2026",
    "highlights": [
      "Unbiased, universal prompt enhancement engine independent of workspace or app bias",
      "One-key prompt enhancement keyboard shortcut (Ctrl+Shift+E / Cmd+Shift+E)",
      "Vite bundle optimization with ~50% faster compile/load times via split vendor chunks",
      "Native Electron on-device Whisper speech recognition fallback with zero network errors",
      "Reasoning stream separation preventing <think> scratchpad tokens from leaking into voice"
    ],
    "sections": [
      {
        "category": "✨ New Features",
        "items": [
          {
            "title": "Neutral & Universal Prompt Enhancer",
            "description": "Refined prompt enhancement into a dedicated, unbiased prompt-engineering engine that works across any general AI task without injecting codebase internals or app-specific contexts."
          },
          {
            "title": "Keyboard Shortcut for Prompt Enhancement",
            "description": "Press Ctrl+Shift+E (or Cmd+Shift+E on macOS) directly in the chat box to instantly enhance and expand your prompt with AI."
          },
          {
            "title": "Integrated Release Notes & Version Updates",
            "description": "View the active app version, recent updates, and full changelog anytime from Settings, Sidebar, or on initial update boot."
          }
        ]
      },
      {
        "category": "⚡ Performance & Latency",
        "items": [
          {
            "title": "Granular Vendor Chunking",
            "description": "Split heavy libraries (Firebase, Lucide, Dexie, React, Markdown) into browser-cached chunks, slashing cold start time and bundle generation by 50%."
          },
          {
            "title": "Sub-350ms Voice Endpointing",
            "description": "Optimized voice turn detection for natural, fast-flowing live conversations with reduced dead air."
          },
          {
            "title": "Sequential ONNX Speech Queue",
            "description": "Eliminated \"Session already started\" concurrency collisions in Transformers.js WebGPU Whisper transcription."
          }
        ]
      },
      {
        "category": "🛡️ Quality & Fixes",
        "items": [
          {
            "title": "Reasoning Filter for Voice & Captions",
            "description": "Filtered out internal <think>...</think> reasoning traces from speech synthesizers and real-time caption transcripts."
          },
          {
            "title": "Electron Speech Network Error Resolution",
            "description": "Added graceful automatic fallback to on-device Whisper when Chromium Web Speech lacks cloud API credentials."
          }
        ]
      }
    ],
    "isLatest": false
  },
  {
    "version": "3.10.4",
    "title": "Multi-Agent Orchestration & Enterprise RAG Frameworks",
    "date": "August 23, 2026",
    "highlights": [
      "Implemented LangGraph stateful multi-agent workflows and Haystack RAG pipelines",
      "DSPy prompt compilation, Aider copilot unified diffs, and LangSmith observability",
      "Zero-key local LLM orchestration supporting Ollama and vLLM server endpoints"
    ],
    "sections": [
      {
        "category": "✨ New Features",
        "items": [
          {
            "title": "6 Core Agent & RAG Frameworks",
            "description": "Integrated LangGraph Flow, Haystack RAG, DSPy Optimizer, Aider Copilot, LangSmith Observability, and Local Inference engines."
          },
          {
            "title": "Automated Tool Verification",
            "description": "Added comprehensive test suites and parameter validation across all new multi-agent toolkits."
          }
        ]
      }
    ],
    "isLatest": false
  },
  {
    "version": "3.10.0",
    "title": "Autonomous Skills & Encrypted Vault Sync",
    "date": "August 2026",
    "highlights": [
      "Dynamic Auto-Skills discovery with rule generation",
      "End-to-end encrypted cloud synchronization for keys and conversations",
      "Live Companion video calling and screen share diagnostics"
    ],
    "sections": [
      {
        "category": "✨ New Features",
        "items": [
          {
            "title": "End-to-End Encrypted Cloud Sync",
            "description": "Synchronize your API keys, preferences, and conversations securely across devices with zero-knowledge encryption."
          },
          {
            "title": "Custom Personas & Skills Panel",
            "description": "Build, share, and customize assistant skills, starter prompts, and autonomous agent roles."
          }
        ]
      }
    ],
    "isLatest": false
  }
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
