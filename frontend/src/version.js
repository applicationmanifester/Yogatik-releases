/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '11.3.0'
export const BUILD_DATE = 'September 2026'
export const APP_CODENAME = 'Yogatik 11.3.0 — Real-Time Reasoning Streaming & Robust Model Watchdog'

const SEEN_VERSION_KEY = 'yogatik:seen_version'

export function hasSeenCurrentVersion() {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY) === APP_VERSION
  } catch { return false }
}

export function markCurrentVersionAsSeen() {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION)
  } catch { /* ignore */ }
}

export const APP_RELEASES = [
  {
    "version": "11.3.0",
    "title": "Yogatik 11.3.0: Real-Time Reasoning Streaming & Robust Model Watchdog",
    "date": "September 29, 2026",
    "isLatest": true,
    "highlights": [
      "Real-Time Reasoning Streaming: Fixed chat UI token streaming for reasoning models (Nemotron, Qwen, DeepSeek) so thinking steps and answers appear live without getting suppressed",
      "Robust Code Block & Markdown Streaming: Markdown JSON and code blocks are preserved and streamed without false-triggering internal tool call guards",
      "Immediate Synthesis & Anti-Stall: Turns with pure reasoning or pending tool intents immediately synthesize user-facing action plans and avoid watchdog false-abort drops",
      "Cross-Platform Release Sync: Coordinated v11.3.0 deployment across Web, Desktop (Windows, macOS, Linux), and Standalone Browser"
    ],
    "sections": [
      {
        "category": "⚡ Reasoning & Streaming Engine",
        "items": [
          {
            "title": "Unrestricted Live Reasoning Streaming",
            "description": "Streamed tokens in prompted and native mode are immediately rendered to the chat UI and thinking drawers, eliminating blank bubble stalls."
          },
          {
            "title": "Strict Tool Call Discrimination",
            "description": "Adjusted tool pattern matching to strictly identify structured function calls while allowing standard markdown JSON and code blocks to stream unimpeded."
          },
          {
            "title": "Watchdog Pre-Synthesis Guard",
            "description": "Ensured fallback synthesis runs before response quality evaluations to prevent premature empty retries on pure reasoning turns."
          }
        ]
      }
    ]
  },
  {
    "version": "11.2.0",
    "title": "Yogatik 11.2.0: Auto-Recovery for Model Overload & Autonomous Watchdog Reconnect",
    "date": "September 29, 2026",
    "isLatest": false,
    "highlights": [
      "Overloaded Model Auto-Recovery: Automatic retry with exponential backoff when upstream provider APIs report high load or rate limits",
      "Autonomous Watchdog Continuation: Truncated or incomplete responses (unclosed code fences, mid-sentence cuts) are automatically continued",
      "Seamless Stream Healing: Reconnecting and self-healing stream errors even after initial tokens were received",
      "Cross-Platform Release Sync: Coordinated v11.2.0 deployment across Web, Desktop (Windows, macOS, Linux), and Standalone Browser"
    ],
    "sections": [
      {
        "category": "⚡ Resilience & Self-Healing",
        "items": [
          {
            "title": "Autonomous Transient Error Reconnection",
            "description": "Integrated automatic retry in agent processStream and App.jsx for transient provider errors (429, 503, model overloaded) with exponential backoff and live status cues."
          },
          {
            "title": "Response Quality Watchdog Auto-Continuation",
            "description": "Watchdog assessResponse verdict now triggers real auto-continuation passes using continuationPrompt instead of merely logging telemetry."
          }
        ]
      }
    ]
  },
  {
    "version": "11.1.0",
    "title": "Yogatik 11.1.0: Live Voice On-Device Whisper Fallback & Vision Modal JSON Formatter",
    "date": "September 28, 2026",
    "isLatest": false,
    "highlights": [
      "Live Voice Desktop Fix: Skip failing cloud Web Speech in Electron and automatically fall back to on-device Whisper STT",
      "Vision Modal JSON Formatter: Interactive collapsible JSON tree viewer with Raw and Formatted view modes",
      "Conversational Vision Prompts: Enforced natural language responses for live multimodal camera and screen captures",
      "Cross-Platform Release Sync: Coordinated v11.1.0 deployment across Web, Desktop (Windows, macOS, Linux), and Browser"
    ],
    "sections": [
      {
        "category": "🎙️ Live Mode Speech Recognition",
        "items": [
          {
            "title": "Electron Cloud Web Speech Bypass",
            "description": "Detected Electron runtime environment in cascade.js to skip the Google Cloud Web Speech API (which throws repeated network errors without Google API credentials) and directly route voice audio to fast, on-device Whisper transcription."
          },
          {
            "title": "Immediate Voice Response",
            "description": "Eliminated the 2-retry network error delay and reconnecting banners when speaking in desktop Live mode."
          }
        ]
      },
      {
        "category": "👁️ Vision & Multimodal Inspection",
        "items": [
          {
            "title": "Collapsible JSON Tree Viewer",
            "description": "Added an interactive JSON viewer for structured vision outputs with depth-aware expansion, colored primitives, and formatted/raw toggling."
          },
          {
            "title": "Conversational Response Guard",
            "description": "Prompted live frame vision queries to default to natural language explanations rather than raw JSON strings."
          }
        ]
      }
    ]
  },
  {
    "version": "11.0.0",
    "title": "Yogatik 11.0.0: Modal Streaming Fixes, Session Replay, Cost Tracking, Plugin System, Git Worktree Isolation, Cost Tracking UI",
    "date": "September 28, 2026",
    "isLatest": false,
    "highlights": [
      "Fixed modal streaming race condition: modals now properly close when AI stream starts via onStreamStart callback",
      "Session Replay: Full event logging with playback, speed control, search/filter, and JSON export",
      "Cost Tracking: Per-conversation cost breakdown by model with provider pricing comparison table",
      "Plugin System: Capability-based permissions (18 capabilities), sandboxed execution, JSON manifest + JS code",
      "Git Worktree Isolation: git_worktree_add/remove/list/prune tools for parallel agent workspaces",
      "Cost Tracking UI: Per-model breakdown, provider pricing comparison, current model pricing display"
    ],
    "sections": [
      {
        "category": "🔧 Modal & Streaming Fixes",
        "items": [
          {
            "title": "Modal Streaming Race Condition Fix",
            "description": "Fixed race condition where modals closed before AI stream started. Added onStreamStart callback and ensureStreamStart() helper to guarantee modal closes only after first meaningful token arrives."
          },
          {
            "title": "DomainHubModal Streaming Fix",
            "description": "DomainHubModal now stays open until first token arrives via onStreamStart callback, with 3-second fallback timeout."
          },
          {
            "title": "ArtifactCanvas Auto-Send",
            "description": "ArtifactCanvas 'Ask AI to Edit' now auto-sends the prompt instead of requiring manual Enter press."
          }
        ]
      },
      {
        "category": "🎬 Session Replay & Debugging",
        "items": [
          {
            "title": "Session Replay System",
            "description": "Full event logging with playback, speed control, search/filter, and JSON export. Records all events (user/AI messages, tool calls, streams) with timestamps."
          },
          {
            "title": "Plugin System Foundation",
            "description": "Capability-based permissions (18 capabilities), sandboxed execution, JSON manifest + JS code installation."
          },
          {
            "title": "Cost Tracking UI",
            "description": "Per-conversation cost breakdown by model with provider pricing comparison table. Cost badge component for message bubbles."
          }
        ]
      },
      {
        "category": "🛠️ Developer Tools",
        "items": [
          {
            "title": "Git Worktree Isolation",
            "description": "git_worktree_add/remove/list/prune tools for parallel agent workspaces. Each agent gets isolated checkout."
          },
          {
            "title": "Diff Review UI",
            "description": "Cursor-style visual diff with Accept/Reject per hunk, unified/split view, line numbers."
          },
          {
            "title": "Plugin System Foundation",
            "description": "Capability-based permissions (18 capabilities), sandboxed execution, JSON manifest + JS code installation."
          }
        ]
      }
    ],
    "isLatest": true
  },
  {
    "version": "10.10.0",
    "title": "Yogatik 10.10.0: Proactive Multi-Agent Delegation, Concurrent Specialists & Orchestration Reflex",
    "date": "September 28, 2026",
    "isLatest": false,
    "highlights": [
      "Mandatory Multi-Agent Delegation: Autonomously decomposes multi-part objectives across specialized sub-agents running concurrently in parallel via spawn_agents and crew_orchestrator",
      "Proactive General Assistant Delegation: The default General Assistant actively delegates research, code, analysis, and writing sub-tasks to specialists instead of executing sequentially",
      "Dynamic Multi-Intent Tool Prioritization: Enhances tool prioritization to rank multi-agent orchestration tools (spawn_agents, crew_orchestrator) to top priority on complex multi-part requests",
      "Concurrent Synthesis Engine: Merges outputs from parallel specialist runs into a coherent, high-fidelity final answer"
    ],
    "sections": [
      {
        "category": "🤖 Multi-Agent Orchestration & Sub-Agent Delegation",
        "items": [
          {
            "title": "Mandatory Multi-Agent Delegation Directive",
            "description": "Replaced passive suggestions with a direct system instruction commanding models to delegate multi-part tasks to specialized agents (researcher, coder, analyst, writer, planner) concurrently in parallel."
          },
          {
            "title": "General Assistant Orchestration",
            "description": "Configured the default assistant persona to proactively spawn sub-tasks whenever a goal spans multiple distinct capabilities or comparative analyses."
          },
          {
            "title": "Dynamic Multi-Intent Scoring",
            "description": "Tool schema ranking automatically boosts spawn_agents and crew_orchestrator when multi-step intent phrases or complex conjunctions are detected."
          }
        ]
      }
    ],
    "isLatest": false
  },
  {
    "version": "10.9.6",
    "title": "Yogatik 10.9.6: Live AI Reasoning Visibility, Stream Transparency & Icon Persistence",
    "date": "September 26, 2026",
    "isLatest": false,
    "highlights": [
      "Live AI Thinking & Reasoning Visibility: Real-time streaming of 答案/<thought>/<reasoning> tokens into the Reasoning accordion and Thinking & Actions panel across all model families (NVIDIA Nemotron, DeepSeek-R1, QwQ, etc.)",
      "Zero-Latency Stream Transparency: Fixed suppression bug in prompted tool execution mode where thought tokens were hidden until completion",
      "Persistent Desktop Icon & Shortcuts: Fixed missing icon after Windows NSIS installation, ensuring desktop and start menu shortcuts preserve the Yogatik branding",
      "Packaged Splash Screen Asset Reliability: Standardized logo asset paths across Electron packaging workflows"
    ],
    "sections": [
      {
        "category": "🧠 AI Thinking & Real-Time Reasoning",
        "items": [
          {
            "title": "Prompted Mode Live Reasoning",
            "description": "In prompted tool mode, thinking tokens (答案, <thought>, <reasoning>) now stream directly into the UI in real-time while tool calls continue to be safely buffered and executed."
          },
          {
            "title": "Universal Model Compatibility",
            "description": "Ensures models with reasoning capabilities like NVIDIA Nemotron Ultra, DeepSeek-R1, and Qwen-QwQ display their reasoning process visibly rather than appearing frozen during long reasoning phases."
          }
        ]
      },
      {
        "category": "🖥️ Desktop App & Installation Quality",
        "items": [
          {
            "title": "Desktop Icon Persistence",
            "description": "Updated NSIS installer settings with explicit installerIcon, uninstallerIcon, and shortcut configurations so the desktop and start menu shortcuts preserve the Yogatik branding."
          },
          {
            "title": "Packaged Splash Screen",
            "description": "Fixed relative path references for the application icon on the Electron splash screen in production bundles."
          }
        ]
      }
    ],
    "isLatest": false
  },
  {
    "version": "10.9.5",
    "title": "Yogatik 10.9.5: Structured Output, Reasoning Transparency & CLI Hardening",
    "date": "September 25, 2026",
    "isLatest": false,
    "highlights": [
      "Structured Output Enforcement: Enforced JSON schema validation for tool calls, preventing models from emitting malformed arguments that would otherwise crash the agent loop",
      "Reasoning Transparency: All reasoning tokens (answers, 思想, 推理) now surface in the Thinking panel with expand/collapse and copy-to-clipboard, so users see exactly what the model 'thought' before acting",
      "CLI Hardening: Fixed race conditions in the terminal tool chain that caused spurious failures on Windows when multiple concurrent commands were issued"
    ],
    "sections": [
      {
        "category": "🧠 Reasoning & Output Quality",
        "items": [
          {
            "title": "Structured Output Validation",
            "description": "Added JSON schema validation for all tool calls at the protocol layer, catching malformed arguments before they reach the model."
          },
          {
            "title": "Reasoning Visibility",
            "description": "All reasoning tokens now render in the Thinking accordion with copy-to-clipboard and expand/collapse, matching OpenAI/Anthropic UX."
          }
        ]
      },
      {
        "category": "💻 CLI & Terminal Hardening",
        "items": [
          {
            "title": "Terminal Race Condition Fix",
            "description": "Fixed use-after-free in the PTY session manager that caused intermittent crashes when multiple commands were issued in quick succession."
          },
          {
            "title": "Windows PTY Stability",
            "description": "Fixed buffer overrun in the Windows PTY backend that corrupted output on long-running commands."
          }
        ]
      }
    ],
    "isLatest": false
  }
]

/**
 * Get release info by version string or latest release.
 */
export function getRelease(version = APP_VERSION) {
  return APP_RELEASES.find(r => r.version === version) || APP_RELEASES[0]
}