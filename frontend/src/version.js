/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '4.0.0'
export const BUILD_DATE = 'September 2026'
export const APP_CODENAME = 'Yogatik 4.0 — Dedicated Full-Page Dashboard, Live Paddle Billing & Complete Theme Synchronization'

export const APP_RELEASES = [
  {
    version: '4.0.0',
    title: 'Yogatik 4.0: Dedicated Full-Page Dashboard, Live Paddle Billing, Left Sidebar Overhaul & Theme Sync',
    date: 'September 1, 2026',
    isLatest: true,
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
  {
    version: '3.22.3',
    title: 'Yogatik Ultra: Live Device Picker, Front/Back Camera Flipping, On-Device Image Segmentation & Crash Hardening',
    date: 'August 31, 2026',
    isLatest: false,
    highlights: [
      'Live Device Selection: Real-time audio and camera device picker bottom sheet with instant front/back camera flipping without ending the call',
      'On-Device Image Segmentation: Added segment tool for instant background removal, object isolation and cutout operations',
      'Lint & Stability Hardening: Resolved undefined variable crashes in LiveView and PersonalisePanel, and prevented AdSense push TagError',
      'Global Pricing Normalization: Unified Pro tier at $9/mo or $99/year internationally across all checkout and landing pages',
    ],
    sections: [
      {
        category: '🎙️ Live Voice & Vision',
        items: [
          {
            title: 'Live Device Picker & Flip',
            description: 'Hot-swap microphones and cameras during an active live call with thumb-friendly controls and auto hardware detection.',
          },
          {
            title: 'On-Device Segmentation',
            description: 'Extract and isolate objects or remove image backgrounds locally on-device without cloud upload.',
          },
        ],
      },
    ],
  },
  {
    version: '3.22.2',
    title: 'Yogatik Ultra: Seamless Marketing-to-Paywall Routing, In-Modal Sign-In & Platform Pricing Matrix',
    date: 'August 31, 2026',
    isLatest: false,
    highlights: [
      'Deep-Linked Upgrade Funnel: Instant navigation from marketing pages (/platforms) directly to the interactive paywall with ?upgrade=1',
      'In-Modal Frictionless Sign-In: Direct sign-in action within the upgrade modal with automatic modal restoration post-auth',
      'Unified Marketing Pricing Matrix: Complete transparent tiers comparison on the platforms showcase',
    ],
    sections: [
      {
        category: '✨ Funnel & Conversion UX',
        items: [
          {
            title: 'Marketing Paywall Integration',
            description: 'Direct deep linking from static landing and download pages into the live checkout modal.',
          },
          {
            title: 'Seamless Authentication Recovery',
            description: 'One-click sign-in trigger from the upgrade modal that automatically restores checkout flow after Google auth.',
          },
        ],
      },
    ],
  },
  {
    version: '3.22.1',
    title: 'Yogatik Ultra: Multi-Surface Entitlements, Razorpay/Paddle Checkout Routing & Ad Suppression',
    date: 'August 31, 2026',
    isLatest: false,
    highlights: [
      'Multi-Surface Pro Entitlement: Unified single account subscription across web and desktop with reactive ad suppression',
      'Dedicated /checkout Gateway: Seamless routing for Razorpay (UPI/Card) and Paddle with token protection and CSP security',
      'Live Account Sync: Direct Firestore account integration for real-time subscription status without Cloud Function overhead',
      'Enhanced Upgrade Pitch: Surface-aware upgrade modals tailored for web and desktop capabilities',
    ],
    sections: [
      {
        category: '💎 Entitlement & Monetization',
        items: [
          {
            title: 'Unified Cross-Surface Subscriptions',
            description: 'Subscribing on web immediately unlocks desktop capabilities; desktop Pro users automatically enjoy ad-free web browsing.',
          },
          {
            title: 'Standalone Checkout Routing',
            description: 'Dedicated static checkout route bypassing SPA catch-all with signature verification and error guards.',
          },
        ],
      },
    ],
  },
  {
    version: '3.22.0',
    title: 'Yogatik Ultra: Interactive Human-In-The-Loop Execution, Native Video Players & Command Controls',
    date: 'August 29, 2026',
    isLatest: false,
    highlights: [
      'Interactive Human-In-The-Loop Execution: Added ask_user tool with interactive decision cards and option selection mid-turn',
      'Continuous Input & Steer Mode: Send messages seamlessly while the AI is busy; toggle between FIFO Queue and Immediate Steer execution',
      'Terminal Command Auto Execution Settings: Configure terminal approval policies (Always Proceed, Ask for Confirmation, Never Allow) in Settings',
      'Native Embedded Video & YouTube Player: Responsive in-chat YouTube video player with resilient ID parsing and HTML5 direct video playback',
      'Document Deduplication & Multi-Tier Translation: Zero-storage SHA-256 hash deduplication and multi-tier fallback translation pipeline',
    ],
    sections: [
      {
        category: '⚡ Execution & Human-In-The-Loop',
        items: [
          {
            title: 'Interactive Question Prompt',
            description: 'AI pauses mid-execution when user preferences or decisions are needed, displaying interactive choices and resuming continuously upon selection.',
          },
          {
            title: 'Terminal Execution Approval Mode',
            description: 'Customizable execution policies for terminal commands: Always Proceed (autonomous), Ask for Confirmation, or Never Allow.',
          },
          {
            title: 'Follow-up Delivery Config',
            description: 'Switch between FIFO queued message delivery or immediate steering while the agent is running.',
          },
        ],
      },
      {
        category: '🎬 Multimedia & Performance',
        items: [
          {
            title: 'Inline YouTube & HTML5 Video Player',
            description: 'Embedded responsive video players for YouTube URLs, direct MP4/WebM files, and AI-generated animations.',
          },
          {
            title: 'Content Hash Deduplication',
            description: 'Instant SHA-256 hash checking prevents redundant file indexing and cuts IndexedDB storage waste.',
          },
        ],
      },
    ],
  },
  {
    version: '3.21.0',
    title: 'Yogatik Ultra: Isolated Workspace Roots, Zero-Latency Streaming & Academic Peer Review Swarm',
    date: 'August 28, 2026',
    isLatest: false,
    highlights: [
      'Strict Per-Chat Root Isolation: Added automatic unbinding on chat deletion and eliminated global default folder pollution',
      'Ultra-Low Latency Pipeline: Speculative Pyodide WASM pre-warming and parallel multi-agent swarm evaluation cut execution delays by >50%',
      'Enterprise Academic & IEEE Tools: Integrated OpenAlex citation graphs, DOI Crossref resolution, and CSL-JSON bibliography manager',
      'Hardware Verification & UVM Architecture: IEEE 1800.2 UVM testbench generator and SystemVerilog Assertions (SVA) synthesizer',
      'LaTeX Error Diagnostics & Multi-File Bundling: Automated Overleaf ZIP generator and compiler error triage parser',
    ],
    sections: [
      {
        category: '⚡ Performance & Workspace Isolation',
        items: [
          {
            title: 'Isolated Working Folders',
            description: 'Chats maintain strictly isolated directory scopes; deleting a conversation cleanly releases all bound filesystem resources without affecting other chats.',
          },
          {
            title: 'Concurrent Multi-Agent Review',
            description: 'Algorithm Architect and Verification Engineer evaluate proposals in parallel, slashing consensus latency from 6s to 2.5s.',
          },
          {
            title: 'WASM & Runtime Pre-Warming',
            description: 'Speculatively initializes Pyodide Python kernels during typing idle frames for zero-cold-start execution.',
          },
        ],
      },
      {
        category: '📚 Academic & Hardware Verification',
        items: [
          {
            title: 'UVM IEEE 1800.2 Generator',
            description: 'Instant generation of SystemVerilog UVM sequence items, drivers, monitors, and scoreboards.',
          },
          {
            title: 'Overleaf Multi-File Packager',
            description: 'Bundles complete LaTeX documents with IEEEtran.cls, bibtex references, and latexmkrc configurations.',
          },
        ],
      },
    ],
  },
  {
    version: '3.20.0',
    title: 'Yogatik Studio Edition: Native Git Tools, Intelligent Turn Auto-Scroll & Resilient File Diagnostics',
    date: 'August 25, 2026',
    isLatest: false,
    highlights: [
      'Native Git Tool (`fs_git`): Added structured status, diff, log, commit, staging and unstage actions without raw shell risks',
      'Intelligent Turn Auto-Scroll: Opening or switching any chat instantly focuses on the latest prompt and response with sub-tick layout shift stabilization',
      'Self-Healing Query Aliases: Auto-repairs missing query keys from prompt topics, questions, and search terms to eliminate tool validation errors',
      'Resilient File System Diagnostics: Cleanly handles missing file lookups (ENOENT) with helpful directory search suggestions instead of provider error cards',
      'Multi-Chat Context Isolation: Parallel turns and subagents execute with fully isolated filesystem, PTY, and browser contexts',
    ],
    sections: [
      {
        category: '🛠️ Git & Workspace Tools',
        items: [
          {
            title: 'Native Version Control',
            description: 'Inspect status, review staged/unstaged diffs, browse history, and stage/commit files directly via structured tools.',
          },
          {
            title: 'Self-Healing Tool Repair',
            description: 'Automatic parameter alias resolution and schema type coercion prevent tool crashes.',
          },
        ],
      },
      {
        category: '🎨 UX & Chat Workflow',
        items: [
          {
            title: 'Instant Bottom Alignment',
            description: 'Chats now open focused on the most recent message with markdown layout compensation.',
          },
        ],
      },
    ],
  },
  {
    version: '3.19.0',
    title: 'Yogatik Studio Edition: Multi-Chat Parallel Isolation, Advanced Browser Automation & JIT Schema Engine',
    date: 'August 25, 2026',
    isLatest: false,
    highlights: [
      'Multi-Chat Context Isolation: Parallel chats run their own independent tools, terminals, filesystem workspaces, and browser sessions without cross-talk',
      'Advanced Browser Automation: Added native hover, PDF export, cookie & storage inspectors, and batch script pipeline execution (`run_script`)',
      'JIT Schema Prioritization: Intent-driven tool schema filtering saves 70% prompt tokens and eliminates small-model hallucinations',
      'Multi-Agent Shared Blackboard: Inter-agent in-memory artifact sharing for parallel DAG dependency waves',
      'Self-Healing Tool Reflection: Inline error remediation hints and schema type coercion for zero-crash tool calling',
    ],
    sections: [
      {
        category: '⚡ Parallel Multi-Agent Runtime',
        items: [
          {
            title: 'Isolated Workspace Contexts',
            description: 'Every concurrent chat turn and sub-agent executes in its own isolated filesystem and terminal context.',
          },
          {
            title: 'Inter-Agent Blackboard',
            description: 'Dispatched specialist sub-agents pass discovery notes, code snippets, and verified facts via in-memory shared blackboard.',
          },
        ],
      },
      {
        category: '🌐 Browser & Web Automation',
        items: [
          {
            title: 'Extended Browser Controls',
            description: 'Full support for hover, print to PDF, cookie manipulation, local/session storage reads, and transactional multi-step automation scripts.',
          },
        ],
      },
    ],
  },
  {
    version: '3.18.0',
    title: 'Yogatik Studio Edition: 100% Independent Agentic Engine & 1,465+ Skills Library',
    date: 'August 25, 2026',
    isLatest: false,
    highlights: [
      'Yogatik Studio: Standalone, unrestricted desktop edition running with isolated storage and zero license gates',
      'Autonomous Skills Engine: Integrated Stable Skills Manifest v1 with 1,465+ agentic skills across 18 domains',
      'Autonomous Workflows: Built-in multi-stage execution DAGs (SaaS MVP Launch, Security Hardening, Refactoring, Full-Stack Delivery)',
      'Dynamic @skill Mentions: Instant prompt augmentation with specialized rules, constraints, and tool permissions',
      'Zero Cloud Dependency: Fully offline skill catalog indexing and local vector retrieval via TurboVec',
    ],
    sections: [
      {
        category: '🎨 Yogatik Studio Edition',
        items: [
          {
            title: 'Dedicated Studio Branding & Binaries',
            description: 'Packaged as Yogatik Studio (`release-studio/Yogatik Studio.exe` and `Yogatik-Studio-Setup.exe`) with dedicated studio bat script.',
          },
          {
            title: 'Unrestricted Developer Runtime',
            description: 'All system tools, terminals, file system commands, and AI features run without subscription gates or network license checks.',
          },
        ],
      },
      {
        category: '🌌 1,465+ Skills & Workflows Catalog',
        items: [
          {
            title: 'Stable Skills Manifest v1',
            description: 'Full compatibility with the universal SKILL.md specification and role-based curated bundles.',
          },
          {
            title: 'Autonomous DAG Workflows',
            description: 'Execute multi-step sequences from ideation to TDD, security review, and PR packaging.',
          },
        ],
      },
    ],
  },
  {
    version: '3.17.0',
    title: 'Hyper-Stable Reactive Architecture, Window Guards & Unrestricted Desktop Suite',
    date: 'August 25, 2026',
    isLatest: false,
    highlights: [
      'Zero-Tear Terminal Store: Referentially stable cached snapshots resolving React re-render loops (Error #185)',
      '100% Unrestricted Personal Desktop: Gating bypass, zero license checks, and isolated application user profile',
      'Native Window Lifecycle Hardening: Full protection against destroyed object exceptions during background tray and second-instance activations',
      'Multi-Persona AI Companion: Pair Programmer, Security Analyst, Code Copilot, and Concierge with live voice PTT',
      'Proactive Quick Actions & Code Copy: 1-click Git review, error scanner, test generator, and formatted code blocks',
    ],
    sections: [
      {
        category: '⚡ Architecture & Stability',
        items: [
          {
            title: 'Stable useSyncExternalStore Snapshots',
            description: 'Cached timeline data arrays in terminalStore preventing unbounded update loops and improving desktop UI responsiveness.',
          },
          {
            title: 'Safe Native Window Lifecycle',
            description: 'Electron main process handlers verify BrowserWindow destroyed status before invoking IPC methods across tray, hotkeys, and second instances.',
          },
        ],
      },
      {
        category: '🚀 Personal Edition & Companion',
        items: [
          {
            title: 'Unrestricted Execution Runtime',
            description: 'All developer tools, filesystem actions, terminal access, and agents run without payment barriers or license validation.',
          },
        ],
      },
    ],
  },
  {
    version: '3.16.0',
    title: 'Unrestricted Personal Desktop Edition, Proactive AI Companion & Resilient Lifecycle',
    date: 'August 25, 2026',
    isLatest: false,
    highlights: [
      'Unrestricted Personal Edition: 100% unlocked native desktop application with no subscriptions, restrictions, or license gates',
      'Multi-Persona AI Companion: Specialized modes (Pair Programmer, Security Analyst, Code Copilot, Concierge) with dynamic prompt injection',
      'Proactive Dev Quick Actions: 1-click Git Diff Review, Terminal Error Scanner, Active File Explainer, and Test Generation',
      'Push-to-Talk & Global Shortcuts: Dedicated PTT voice dictation, shortcuts (Ctrl+Alt+V / W / M), and live audio equalizer animation',
      'Syntax Code Blocks & Copy: High-readability formatted code blocks with 1-click copy inside AI Companion turns',
      'Resilient Window Lifecycle: Hardened against destroyed window exceptions across tray, second-instance, and global hotkeys',
    ],
    sections: [
      {
        category: '🚀 Personal Desktop Edition',
        items: [
          {
            title: 'Zero-Restriction Desktop Architecture',
            description: 'The Personal Edition completely compiles out entitlement checks, licensing modals, and tool restrictions, allowing unlimited offline execution.',
          },
          {
            title: 'Hardened Native Runtime',
            description: 'All Electron window lifecycle hooks are guarded against destroyed instance exceptions when minimizing to tray or re-focusing.',
          },
        ],
      },
      {
        category: '🤖 AI Companion Suite',
        items: [
          {
            title: 'Adaptive Companion Personas',
            description: 'Switch companion behavior between Pair Programmer, Security Analyst, Code Copilot, and Concierge with one click.',
          },
          {
            title: 'Push-to-Talk & Live Audio Visualizer',
            description: 'Hold Push-to-Talk for noise-free voice dictation with an interactive waveform equalizer animation.',
          },
        ],
      },
    ],
  },
  {
    version: '3.15.0',
    title: 'Adaptive Scrapling Web Engine, Workspace IDE & Deep Task Limits',
    date: 'August 25, 2026',
    isLatest: false,
    highlights: [
      'Workspace IDE Suite: Integrated File Explorer, Git Changes panel, Side-by-Side Diff Viewer, and Code Editor pane',
      'Zero-Dependency Scrapling Engine: Self-healing adaptive element tracking using DOM fingerprints & semantic similarity',
      'Progressive Stealth Fetcher: Anti-bot bypass (Cloudflare Turnstile, Datadome, PerimeterX) with modern TLS hints',
      'Deep Tool Loop Allowance: Default round limit raised to 50–100 rounds for uninterrupted multi-step coding tasks',
      'Git Write Guard & Journal Core: Pre-write safety verification, workspace snapshotting, and transaction rollbacks',
      'Graceful Web/Desktop Routing: Clean fallbacks preventing web builds from hallucinating desktop-only capabilities',
    ],
    sections: [
      {
        category: '🕷️ Web Scraping & Intelligence',
        items: [
          {
            title: 'Scrapling Adaptive Locator',
            description: 'Relocates mutated, obfuscated, or redesigned DOM elements using fuzzy string similarity and structural ancestry matching.',
          },
          {
            title: 'Progressive Stealth Fetch',
            description: 'Emulates modern Chrome client headers and automatically detects anti-bot challenges before escalating.',
          },
        ],
      },
      {
        category: '⚡ Agent Runtime & Task Completion',
        items: [
          {
            title: 'Expanded Tool Rounds',
            description: 'Raised max tool round ceiling from 20 to 100 in agent.js and Personalise panel for comprehensive multi-step refactoring and execution.',
          },
          {
            title: 'Unparsed XML Tag Stripping',
            description: 'Sanitizes model outputs to ensure raw tool tags never leak into user-facing chat responses.',
          },
        ],
      },
    ],
  },
  {
    version: '3.14.0',
    title: 'In-Flight Prompt Queueing, Arrow History Recall & Resilient Filesystem',
    date: 'August 24, 2026',
    isLatest: false,
    highlights: [
      'Interactive In-Flight Prompt Queueing: Queue messages while model generates with automatic FIFO execution',
      'Keyboard Arrow History Navigation (↑/↓) with unsubmitted draft preservation',
      'Ambient AI Companion screen forwarding, STT voice input, TTS voice out, and webcam capture',
      'Resilient Fuzzy Line Matcher in fsCore & localFs for indentation-agnostic code edits',
      'Windows Drive Path Sanitization & workspace boundary enforcement',
    ],
    sections: [
      {
        category: '✨ New Features & Workflow',
        items: [
          {
            title: 'Intelligent Message Queueing',
            description: 'Send follow-up prompts and attachment payloads while the model is busy. Prompts are held in a FIFO queue with an interactive banner (Edit/Cancel) and execute automatically upon turn completion.',
          },
          {
            title: 'Command & Prompt History Recall',
            description: 'Pressing Up Arrow (↑) in empty composer recalls previous messages across session history, while Down Arrow (↓) traverses forward and restores work-in-progress drafts.',
          },
          {
            title: 'Ambient Multimodal Suite',
            description: 'Screen monitoring, camera feeds, live voice speech-to-text dictation, and thinking-block sanitization are deeply integrated into the AI Companion.',
          },
        ],
      },
      {
        category: '⚡ Filesystem & Reliability',
        items: [
          {
            title: 'Indentation & Whitespace Tolerance',
            description: 'applyEdit and fs_patch now use fuzzy line trimming to safely match blocks even with tabs/spaces discrepancies from LLM outputs.',
          },
          {
            title: 'Windows Path Normalizer',
            description: 'Sanitizes Linux-style forward slash drive prefixes (/C:/...) and quoted paths before resolving within workspace roots.',
          },
        ],
      },
    ],
  },
  {
    version: '3.13.0',
    title: 'Universal Model Protocol, Resilient Patcher & High-Speed MCP Suite',
    date: 'August 24, 2026',
    isLatest: false,
    highlights: [
      'Universal XML, Nemotron, Hermes, Claude invoke & ReAct tool call parsing',
      'Unified Diff Resilient Patching engine (fs_patch) with fuzzy whitespace matching',
      'AST Code Outline & symbol extractor (code_outline) for high-speed file inspection',
      'Zero-Latency Stale-While-Revalidate discovery cache (<1ms) for Model Context Protocol',
      'Dynamic MCP Resource Templates, Multimodal Normalizer & Interactive Tool Tester',
    ],
    sections: [
      {
        category: '✨ New Features',
        items: [
          {
            title: 'Universal Multi-Syntax Tool Call Parser',
            description: 'Extracts and runs tool calls from Nemotron XML, Hermes XML, Claude invoke tags, ReAct formats, and standard JSON seamlessly.',
          },
          {
            title: 'Resilient Diff Patcher (fs_patch)',
            description: 'Applies unified diff hunks with offset tracking and fuzzy whitespace tolerance for safe atomic file edits.',
          },
          {
            title: 'Interactive MCP Tool Tester & Inspector',
            description: 'Directly test any discovered MCP tool in the UI with custom JSON arguments and live latency metrics before handing off to the agent.',
          },
        ],
      },
      {
        category: '⚡ Performance & Protocol',
        items: [
          {
            title: 'Sub-Millisecond MCP Discovery Cache',
            description: 'Loads all MCP schemas and resources instantly from IndexedDB cache on boot with background revalidation.',
          },
          {
            title: 'High-Throughput Parallel Handshakes',
            description: 'Dispatches tools/list, resources/list, templates/list, and prompts/list concurrently with individual timeout guards.',
          },
        ],
      },
    ],
  },
  {
    version: '3.12.0',
    title: 'Autonomous Multi-Agent DAG & Multimodal UI Verification',
    date: 'August 24, 2026',
    isLatest: false,
    highlights: [
      'Topological Multi-Agent DAG Wave Scheduling with automatic dependency piping',
      'Multimodal UI Visual Verification tool (visual_verify) for offscreen component evaluation',
      'Speculative runtime pre-warming on user typing intent via requestIdleCallback',
      'Cross-Agent Shared Blackboard memory for zero-redundancy collaborative research',
      'Dynamic Self-Healing Tool Reflection & Error Auto-Repair hints',
    ],
    sections: [
      {
        category: '✨ New Features',
        items: [
          {
            title: 'Topological Multi-Agent DAG Waves',
            description: 'Sub-agents can now declare depends_on relationships. Independent tasks execute concurrently in Wave 0, while downstream tasks automatically receive upstream findings in subsequent waves.',
          },
          {
            title: 'Visual UI Verifier Tool',
            description: 'Generates snapshot images from HTML/CSS/SVG code so vision-capable LLMs (Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro) can inspect and iterate on their own visual designs.',
          },
          {
            title: 'Cross-Agent Shared Blackboard',
            description: 'Sub-agents collaboratively publish and read findings on a shared session blackboard, eliminating duplicate web searches and token waste.',
          },
        ],
      },
      {
        category: '⚡ Performance & Optimization',
        items: [
          {
            title: 'Speculative Tool Pre-Warming',
            description: 'Analyzes user input intent while typing to pre-warm WASM runtimes (Pyodide, Tesseract OCR, TurboVec) during idle frames.',
          },
          {
            title: 'Semantic Context Compaction',
            description: 'Automatically compacts massive tool outputs and binary payloads before appending to conversation memory.',
          },
        ],
      },
      {
        category: '🛡️ Safety & Reliability',
        items: [
          {
            title: 'Static Tool Parameter Guardrails',
            description: 'Strictly prevents destructive shell commands, fork bombs, and root directory deletions.',
          },
          {
            title: 'Self-Healing Schema Repair',
            description: 'Automatically repairs argument aliases, type mismatches, and JSON stringified inputs from language models.',
          },
        ],
      },
    ],
  },
  {
    version: '3.11.0',
    title: 'Precision Prompting & High-Performance Hyperdrive',
    date: 'August 23, 2026',
    highlights: [
      'Unbiased, universal prompt enhancement engine independent of workspace or app bias',
      'One-key prompt enhancement keyboard shortcut (Ctrl+Shift+E / Cmd+Shift+E)',
      'Vite bundle optimization with ~50% faster compile/load times via split vendor chunks',
      'Native Electron on-device Whisper speech recognition fallback with zero network errors',
      'Reasoning stream separation preventing <think> scratchpad tokens from leaking into voice',
    ],
    sections: [
      {
        category: '✨ New Features',
        items: [
          {
            title: 'Neutral & Universal Prompt Enhancer',
            description: 'Refined prompt enhancement into a dedicated, unbiased prompt-engineering engine that works across any general AI task without injecting codebase internals or app-specific contexts.',
          },
          {
            title: 'Keyboard Shortcut for Prompt Enhancement',
            description: 'Press Ctrl+Shift+E (or Cmd+Shift+E on macOS) directly in the chat box to instantly enhance and expand your prompt with AI.',
          },
          {
            title: 'Integrated Release Notes & Version Updates',
            description: 'View the active app version, recent updates, and full changelog anytime from Settings, Sidebar, or on initial update boot.',
          },
        ],
      },
      {
        category: '⚡ Performance & Latency',
        items: [
          {
            title: 'Granular Vendor Chunking',
            description: 'Split heavy libraries (Firebase, Lucide, Dexie, React, Markdown) into browser-cached chunks, slashing cold start time and bundle generation by 50%.',
          },
          {
            title: 'Sub-350ms Voice Endpointing',
            description: 'Optimized voice turn detection for natural, fast-flowing live conversations with reduced dead air.',
          },
          {
            title: 'Sequential ONNX Speech Queue',
            description: 'Eliminated "Session already started" concurrency collisions in Transformers.js WebGPU Whisper transcription.',
          },
        ],
      },
      {
        category: '🛡️ Quality & Fixes',
        items: [
          {
            title: 'Reasoning Filter for Voice & Captions',
            description: 'Filtered out internal <think>...</think> reasoning traces from speech synthesizers and real-time caption transcripts.',
          },
          {
            title: 'Electron Speech Network Error Resolution',
            description: 'Added graceful automatic fallback to on-device Whisper when Chromium Web Speech lacks cloud API credentials.',
          },
        ],
      },
    ],
  },
  {
    version: '3.10.4',
    title: 'Multi-Agent Orchestration & Enterprise RAG Frameworks',
    date: 'August 23, 2026',
    highlights: [
      'Implemented LangGraph stateful multi-agent workflows and Haystack RAG pipelines',
      'DSPy prompt compilation, Aider copilot unified diffs, and LangSmith observability',
      'Zero-key local LLM orchestration supporting Ollama and vLLM server endpoints',
    ],
    sections: [
      {
        category: '✨ New Features',
        items: [
          {
            title: '6 Core Agent & RAG Frameworks',
            description: 'Integrated LangGraph Flow, Haystack RAG, DSPy Optimizer, Aider Copilot, LangSmith Observability, and Local Inference engines.',
          },
          {
            title: 'Automated Tool Verification',
            description: 'Added comprehensive test suites and parameter validation across all new multi-agent toolkits.',
          },
        ],
      },
    ],
  },
  {
    version: '3.10.0',
    title: 'Autonomous Skills & Encrypted Vault Sync',
    date: 'August 2026',
    highlights: [
      'Dynamic Auto-Skills discovery with rule generation',
      'End-to-end encrypted cloud synchronization for keys and conversations',
      'Live Companion video calling and screen share diagnostics',
    ],
    sections: [
      {
        category: '✨ New Features',
        items: [
          {
            title: 'End-to-End Encrypted Cloud Sync',
            description: 'Synchronize your API keys, preferences, and conversations securely across devices with zero-knowledge encryption.',
          },
          {
            title: 'Custom Personas & Skills Panel',
            description: 'Build, share, and customize assistant skills, starter prompts, and autonomous agent roles.',
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
