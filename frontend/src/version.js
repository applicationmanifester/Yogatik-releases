/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '3.15.0'
export const BUILD_DATE = 'August 2026'
export const APP_CODENAME = 'Adaptive Scrapling Engine & Deep Autonomous Execution'

export const APP_RELEASES = [
  {
    version: '3.15.0',
    title: 'Adaptive Scrapling Web Engine, Deep Task Limits & Clean Routing',
    date: 'August 24, 2026',
    isLatest: true,
    highlights: [
      'Zero-Dependency Scrapling Engine: Self-healing adaptive element tracking using DOM fingerprints & semantic similarity',
      'Progressive Stealth Fetcher: Anti-bot bypass (Cloudflare Turnstile, Datadome, PerimeterX) with modern TLS hints',
      'Deep Tool Loop Allowance: Default round limit raised to 50–100 rounds for uninterrupted multi-step coding tasks',
      'Graceful Web/Desktop Routing: Clean fallbacks preventing web builds from hallucinating desktop-only capabilities',
      'Standalone Python Generator: Generate production-ready external Scrapling scripts on demand',
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
