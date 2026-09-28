/**
 * App Versioning & Release Updates Registry for Yogatik
 * Tracks current version, build metadata, and itemized release updates/changelog.
 */

export const APP_VERSION = '11.0.0'
export const BUILD_DATE = 'September 2026'
export const APP_CODENAME = 'Yogatik 11.0.0 — Modal Streaming Fixes, Session Replay, Cost Tracking, Plugin System, Git Worktree Isolation, Cost Tracking UI'

export const APP_RELEASES = [
  {
    "version": "11.0.0",
    "title": "Yogatik 11.0.0: Modal Streaming Fixes, Session Replay, Cost Tracking, Plugin System, Git Worktree Isolation, Cost Tracking UI",
    "date": "September 28, 2026",
    "isLatest": true,
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
            "description": "All reasoning tokens now render in the Thinking panel with copy-to-clipboard and expand/collapse, matching OpenAI/Anthropic UX."
          }
        ]
      },
      {
        "category": "💻 CLI & Terminal Hardening",
        "items": [
          {
            "title": "Terminal Race Condition Fix",
            "description": "Fixed use-after-free in the PTY session manager that caused intermittent crashes when multiple concurrent commands were issued."
          },
          {
            "title": "Windows PTY Stability",
            "description": "Fixed buffer overrun in the Windows PTY backend that corrupted output on long-running commands."
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
  }
]