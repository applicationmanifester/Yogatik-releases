/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '11.6.0'
export const BUILD_DATE = 'October 2026'
export const APP_CODENAME = 'Yogatik 11.6.0 — Adaptive Tool Calling, In-Place Prompt Rewind & Precision Code Editing Suite'

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
    "version": "11.6.0",
    "title": "Yogatik 11.6.0: Adaptive Tool Calling, In-Place Prompt Rewind & Precision Code Editing Suite",
    "date": "October 1, 2026",
    "isLatest": true,
    "highlights": [
      "In-Place Prompt Rewind & Edit: Editing any earlier turn now truncates subsequent turns in-place, keeping the conversation session and working folder intact without branch clutter",
      "Adaptive Tool Schema Limits: Models on Groq, NVIDIA NIM, Ollama, and local providers receive an optimized 36-tool schema limit, eliminating schema overload and drastically improving tool call success rate",
      "Precision Code Editing Architecture: Strictly enforces fs_edit (search & replace) and fs_patch (unified diffs) over full-file overwrites, preventing code truncation and lost lines",
      "Live Workspace Root Injection: Desktop agent system prompt automatically receives the active workspace directory path, eliminating hallucinated file paths and path-guessing",
      "Immediate Tool Error Self-Correction: Instantly feeds actionable reflection hints into the agent turn upon any tool failure, enabling rapid single-step healing",
      "Multi-Round Context Compaction: Automatically compacts older tool outputs in multi-turn runs, maintaining low latency and crisp reasoning"
    ],
    "sections": [
      {
        "category": "⚡ Autonomous Execution & Tool Calling",
        "items": [
          {
            "title": "Adaptive Schema Budgeting for Open Models",
            "description": "Capped tool schemas dynamically to 36 for open-weight and local models while ensuring full priority for filesystem, terminal, and research tools, preventing token bloat and function-calling confusion."
          },
          {
            "title": "Immediate Error Self-Correction Loop",
            "description": "Injected actionable guidance upon the first tool failure to guide the model on line inspection, path discovery, or command adjustments."
          }
        ]
      },
      {
        "category": "🛠️ Code Development & Workspace Context",
        "items": [
          {
            "title": "fs_edit & fs_patch Standard",
            "description": "Instructed Yogatik AI to prefer exact find-and-replace and unified diff patches for modifying existing files, reserving fs_write exclusively for brand new files."
          },
          {
            "title": "Active Workspace Path Awareness",
            "description": "Desktop agent prompt automatically contains the primary workspace path from roots management, preventing models from guessing file locations."
          }
        ]
      },
      {
        "category": "💬 Conversation UX & Prompt Editing",
        "items": [
          {
            "title": "In-Place Rewind & Resend",
            "description": "Prompt edits now rewind the current chat by discarding subsequent turns directly in-place, preserving active folders, models, and conversation ID."
          }
        ]
      }
    ]
  },
  {
    "version": "11.5.0",
    "title": "Yogatik 11.5.0: Flagship Yogatik AI, Zero-Stall Tool Calling & Code Engineering Suite",
    "date": "September 30, 2026",
    "isLatest": false,
    "highlights": [
      "Native Flagship Yogatik AI: Dedicated autonomous intelligence endowed with permanent priority access to filesystem, terminal, live web search, and multi-agent delegation",
      "Zero-Stall Reasoning & Tool Unsticking: Fixed reasoning model tool dropouts in desktop app with active action-intent nudges and auto-seeding for fs_list and fs_write",
      "Full Code Writing & Refactoring Priority: Guaranteed write, edit, and diff tools remain active during code reviews, audits, and workspace refactoring",
      "Tool Results Synthesis Card: Ensured executed actions are always synthesized into rich markdown findings, preventing empty message bubbles",
      "Localhost CORS & Proxy Guard: Stopped 403 cloud proxy errors for local Ollama instances on web origins and quieted live model warnings"
    ],
    "sections": [
      {
        "category": "⚡ Flagship Yogatik AI & Autonomous Engineering",
        "items": [
          {
            "title": "Zero-Laziness Code Implementation Protocol",
            "description": "Enforced strict full-code production rules in Yogatik AI, ensuring all code reviews and refactors actively inspect via fs_read and apply complete, working code via fs_write/fs_edit."
          },
          {
            "title": "Flagship Tool Suite Priority Boost",
            "description": "Yogatik AI automatically receives maximum prioritization for all core execution tools (fs_*, terminal_run, code_execute, web_search, spawn_agents) across every turn."
          }
        ]
      },
      {
        "category": "🛠️ Agent Tool Calling & Stream Reliability",
        "items": [
          {
            "title": "Reasoning Intent Interception",
            "description": "Intercepts deliberated tool actions in <think> tags (such as 'Use fs_write for each') and compels immediate tool calling instead of stalling in monologue."
          },
          {
            "title": "Stream Buffer & JSON Stub Sanitization",
            "description": "Automatically cleanses aborted leading JSON fences and broken code blocks before synthesizing tool findings."
          }
        ]
      }
    ]
  },
  {
    "version": "11.4.0",
    "title": "Yogatik 11.4.0: AI Modal & Prompted-Mode Response Healing, Shell Stability & Cross-Platform Sync",
    "date": "September 30, 2026",
    "isLatest": false,
    "highlights": [
      "Prompted-Mode Response & Token Healing: Resolved reply duplication in agent.js where responses were duplicated twice and raw tool call JSON leaked to users during unbuffered prompted execution",
      "AI Modals & App Shell Stability: Fixed ReferenceError in App.jsx (webDockOccluded modalState alignment) preventing startup crashes",
      "Streaming Message Engine: Restored imperative ref methods, multi-agent pipeline stepped progress trees, and typewriter integration for zero-latency 60fps streaming",
      "Entitlement & Capability Matrix: Classified Git worktrees (git_worktree_*) and persistent app configuration channels under security matrix",
      "Cross-Platform Release Sync: Coordinated v11.4.0 deployment across Web, Desktop (Windows, macOS, Linux), and Standalone Browser"
    ],
    "sections": [
      {
        "category": "🤖 AI Model Execution & Streaming",
        "items": [
          {
            "title": "Prompted-Mode Buffering & Deduplication",
            "description": "Restored proper token buffering in agent.js so that raw tool-calling syntax and XML blocks never pollute user bubbles, and prose is never double-emitted upon harvest."
          },
          {
            "title": "Real-Time Thought Streaming",
            "description": "Live reasoning <think> tokens stream immediately while tool calls remain isolated and securely parsed."
          }
        ]
      },
      {
        "category": "🪟 App Shell & Modal Stability",
        "items": [
          {
            "title": "Modal State Reference Fix",
            "description": "Fixed webDockOccluded reference in App.jsx to properly mirror modalState, preventing application crash on initial mount."
          },
          {
            "title": "StreamingMessage Synchronous Ref",
            "description": "Restored synchronous imperative ref handle methods, activeAction stepped progress tree, and clean null-state guards."
          }
        ]
      }
    ]
  },
  {
    "version": "11.3.2",
    "title": "Yogatik 11.3.2: Taskbar Icon Fix — Packaged Window Icon from Shipped File",
    "date": "September 29, 2026",
    "isLatest": false,
    "highlights": [
      "Taskbar Icon Fix: The packaged Windows app now loads its brand icon from the shipped icon.ico (inside app.asar) instead of process.execPath — nativeImage cannot decode an exe, so packaged windows previously shipped with no explicit icon and the taskbar fell back to a generic icon",
      "ArtifactCanvas Direct Edit: 'Prompt AI to Edit' now asks what to change first, then sends the full instruction demanding direct code output — it previously auto-sent a contentless prefix, so the model asked again and again instead of writing",
      "Design System Completed: JsonTree, AIResponse, useFocusTrap and useInert modules created — VisionModal's design-system migration had been left half-finished and broke every build",
      "Window setIcon Alive: The explicit setIcon(appIcon) call now applies in packaged builds too — it was silently skipped when the exe-derived image came back empty",
      "NSIS Shortcut AUMID Preserved: Start Menu shortcuts keep the app.yogatik.desktop AppUserModelID so taskbar pins and grouping resolve the Yogatik branding"
    ],
    "sections": [
      {
        "category": "🖥️ Desktop App & Installation",
        "items": [
          {
            "title": "Window Icon from Shipped File",
            "description": "createWindow() loads electron/icon.ico from app.asar in packaged mode — the same reliable path the tray already used — instead of trying to decode the executable as an image."
          },
          {
            "title": "Explicit setIcon in Packaged Builds",
            "description": "The window's setIcon(appIcon) call no longer skips when the image is valid, so the taskbar button shows the Yogatik logo regardless of shell icon-cache state."
          }
        ]
      },
      {
        "category": "🪟 Modal & Artifact Fixes",
        "items": [
          {
            "title": "ArtifactCanvas Asks Once, Writes Directly",
            "description": "The 'Prompt AI to Edit' button collects the requested change first and sends a complete instruction (prefix + request + apply-directly directive) instead of auto-sending an empty prefix that made the model ask clarifying questions on every click."
          },
          {
            "title": "Design System Modules Completed",
            "description": "Created the missing JsonTree (with formatted/raw toggle), AIResponse, useFocusTrap and useInert modules the VisionModal migration referenced — the incomplete barrel file failed every Vite build with 'Could not resolve ./JsonTree'."
          },
          {
            "title": "useInert Ref Timing Fix",
            "description": "excludeRef is read at effect time after the modal ref attaches; the old exclude:[modalRef.current] pattern captured null during render and inerted nothing."
          }
        ]
      }
    ]
  },
  {
    "version": "11.3.1",
    "title": "Yogatik 11.3.1: Honest fs_read Truncation & StreamingMessage Parse Fix",
    "date": "September 29, 2026",
    "isLatest": false,
    "highlights": [
      "Honest fs_read Truncation: fs_smart_read and fs_outline now report the TRUE line count and flag head truncation — start_line past the readable head fails loudly with the exact continuation call instead of silently returning empty content",
      "Smarter Symbol Reads: fs_smart_read reads until the NEXT definition (capped by max_lines) instead of a blind +150 lines, so long functions come back whole; missing symbols past the truncation point explain why and how to read deeper",
      "StreamingMessage Parse Fix: Fixed an unclosed forwardRef parenthesis that made the streaming reply component fail to parse entirely",
      "fs_outline PARTIAL Notes: Outlines of byte-capped files are marked partial with the readable range and how to read the rest"
    ],
    "sections": [
      {
        "category": "📖 File Reading & Truncation",
        "items": [
          {
            "title": "True Total Line Count",
            "description": "fs_smart_read and fs_outline read the real line count from the native fs_read result instead of counting the truncated head, so line ranges and outlines of large files are accurate."
          },
          {
            "title": "Loud Empty-Read Guard",
            "description": "A start_line past the readable head returns a clear error with the head size, true total, and the exact fs_read call to continue — never silent empty content."
          },
          {
            "title": "Next-Definition Symbol Reads",
            "description": "Symbol reads span to the next symbol's line (capped by max_lines) with truncated/continuation notes, so long function bodies are not silently cut mid-way."
          }
        ]
      },
      {
        "category": "🔧 Component Fixes",
        "items": [
          {
            "title": "StreamingMessage Parse Fix",
            "description": "Closed the forwardRef parenthesis that broke parsing of the in-flight assistant reply component (Expected ')' but found end of file)."
          }
        ]
      }
    ]
  },
  {
    "version": "11.3.0",
    "title": "Yogatik 11.3.0: Real-Time Reasoning Streaming & Robust Model Watchdog",
    "date": "September 29, 2026",
    "isLatest": false,
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