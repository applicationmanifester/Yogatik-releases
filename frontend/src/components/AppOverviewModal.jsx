import React, { useState } from 'react'
import { Modal } from './Modal'
import { YogatikLogo } from './YogatikLogo'
import { APP_VERSION } from '../version'
import {
  Sparkles,
  Cpu,
  Wrench,
  Plug,
  ShieldCheck,
  Zap,
  ArrowRight,
  Workflow,
  Search,
  Globe,
  Layers,
  Database,
  Code,
  FileDown,
  Mic,
  Bot,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Lock,
  Monitor,
  HelpCircle,
  Play,
  Terminal,
  Clock,
  Compass,
  FileText,
  Eye,
  Camera,
  GitBranch
} from 'lucide-react'

export function AppOverviewModal({ onClose, onOpenSettings, onOpenDemo, onOpenTour, onOpenDomainHub, onOpenMcp }) {
  const [activeTab, setActiveTab] = useState('workflow') // 'workflow' | 'architecture' | 'tools' | 'mcp' | 'companion' | 'shortcuts'

  const workflowSteps = [
    {
      num: '01',
      title: 'Choose Your Intelligence Engine',
      icon: <Cpu size={20} color="#38bdf8" />,
      tag: 'Zero-Key Local or Multi-Cloud',
      desc: 'Run 100% private, on-device AI directly on your computer or connect keys for Claude 3.7 Sonnet, GPT-4o, xAI Grok, DeepSeek R1/V3, Gemini 2.5, Mistral Large, Perplexity, or OpenRouter.',
    },
    {
      num: '02',
      title: 'Multimodal Context & Autonomous Skills',
      icon: <Mic size={20} color="#a78bfa" />,
      tag: '1,465+ Skills · Audio · Vision · RAG',
      desc: 'Dictate hands-free via live voice, drag-and-drop workspace directories, auto-detect skills via @skill mentions, or capture active screens and camera feeds for visual inspection.',
    },
    {
      num: '03',
      title: 'Autonomous Tool Execution & Git Workflows',
      icon: <Wrench size={20} color="#fbbf24" />,
      tag: '90+ Built-in Tools & Git',
      desc: 'The agent loop seamlessly executes local file edits, runs PTY shell commands, inspects and stages Git repositories (fs_git), executes browser automation, and dispatches subagent DAGs.',
    },
    {
      num: '04',
      title: 'Model Context Protocol (MCP) Ecosystem',
      icon: <Plug size={20} color="#34d399" />,
      tag: 'Live External Data & STDIO',
      desc: 'Connect to remote or local MCP servers (GitHub, Stripe, PostgreSQL, Brave Search, Memory Graph) via JSON-RPC 2.0 and native STDIO subprocesses.',
    },
    {
      num: '05',
      title: '4-Store Memory & Safe Journal Reversion',
      icon: <FileDown size={20} color="#f472b6" />,
      tag: 'Episodic · Semantic · Procedural · Emotional',
      desc: 'Long-term adaptive memory across 4 stores with single-click JSON backup/restore and pre-mutation file snapshot journaling (fs_undo).',
    },
  ]

  const toolCategories = [
    {
      name: 'Git & Scoped Filesystem Tools',
      color: '#38bdf8',
      tools: ['fs_git (status/diff/log/commit)', 'fs_read', 'fs_write', 'fs_edit', 'fs_search', 'fs_find_files', 'fs_file_tree', 'fs_undo', 'fs_batch_write'],
    },
    {
      name: 'Interactive Shell & Process Management',
      color: '#a78bfa',
      tools: ['terminal_run (PTY shell)', 'process_manager', 'watch_folder', 'code_execute (Python)', 'js_execute', 'code_format', 'diff'],
    },
    {
      name: 'Browser & Web Automation',
      color: '#34d399',
      tools: ['browser_control (DOM refs, hover, pdf, cookies, storage, run_script)', 'web_search', 'lightpanda', 'firecrawl', 'link_preview'],
    },
    {
      name: 'Multi-Agent DAGs & Autonomous Skills',
      color: '#f59e0b',
      tools: ['spawn_agents (Blackboard)', 'dag_resolver', 'auto_skills (1,465+ skills)', 'sub_agent_runner', 'crew_orchestrator'],
    },
    {
      name: 'Vision, Multimodal & Document RAG',
      color: '#ec4899',
      tools: ['screen_inspect', 'ocr', 'image_generate', 'turbovec (Vector RAG)', 'haystack_rag', 'pdf_extract', 'doc_export', 'chart', 'diagram'],
    },
  ]

  return (
    <Modal
      title="About Yogatik Studio"
      icon={<YogatikLogo size={22} />}
      onClose={onClose}
      labelledBy="overview-title"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '78vh', overflowY: 'auto', paddingRight: 4 }}>
        {/* Header Hero Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(168, 85, 247, 0.12) 50%, rgba(251, 191, 36, 0.1) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            padding: 12,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            <YogatikLogo size={42} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Yogatik Studio
              </h2>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontWeight: 700 }}>
                v{APP_VERSION}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', fontWeight: 700 }}>
                Unrestricted Developer Edition
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              All-in-one unrestricted AI studio combining on-device privacy (WebGPU), 90+ agent tools, 1,465+ skills library, interactive PTY terminal, live DOM browser automation, and native MCP connectors.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="modal-tabs" style={{ marginBottom: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button className={activeTab === 'workflow' ? 'active' : ''} onClick={() => setActiveTab('workflow')}>
            <Workflow size={14} style={{ marginRight: 6 }} /> End-to-End Workflow
          </button>
          <button className={activeTab === 'architecture' ? 'active' : ''} onClick={() => setActiveTab('architecture')}>
            <ShieldCheck size={14} style={{ marginRight: 6 }} /> Architecture &amp; Privacy
          </button>
          <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>
            <Wrench size={14} style={{ marginRight: 6 }} /> 90+ Tools &amp; Skills
          </button>
          <button className={activeTab === 'mcp' ? 'active' : ''} onClick={() => setActiveTab('mcp')}>
            <Plug size={14} style={{ marginRight: 6 }} /> MCP Connectors
          </button>
          <button className={activeTab === 'companion' ? 'active' : ''} onClick={() => setActiveTab('companion')}>
            <Monitor size={14} style={{ marginRight: 6 }} /> Floating Companion
          </button>
          <button className={activeTab === 'shortcuts' ? 'active' : ''} onClick={() => setActiveTab('shortcuts')}>
            <Zap size={14} style={{ marginRight: 6 }} /> Shortcuts
          </button>
        </div>

        {/* TAB 1: WORKFLOW PIPELINE */}
        {activeTab === 'workflow' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workflowSteps.map((step) => (
              <div
                key={step.num}
                style={{
                  background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(255,255,255,0.12)'
                  }}>
                    {step.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
                    {step.num}
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {step.title}
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)' }}>
                      {step.tag}
                    </span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: ARCHITECTURE & PRIVACY */}
        {activeTab === 'architecture' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 10,
              padding: 14,
            }}>
              <strong style={{ fontSize: 14, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Lock size={16} /> 100% Local-First Privacy Model
              </strong>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Yogatik communicates directly between your device and LLM endpoints. <strong>No chat history, personal files, or API keys are ever stored on an intermediary server.</strong> Everything is persisted in your local encrypted IndexedDB storage.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Cpu size={14} /> Dual Agent Protocol
                </strong>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Seamlessly toggles between native OpenAI-style function calling (for fast cloud models) and prompted JSON protocols (for open-source and local WebGPU models).
                </p>
              </div>

              <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Database size={14} /> In-Memory RAG Vector Engine
                </strong>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Uploaded PDFs and documents are chunked and vector-embedded locally using TF-IDF + cosine similarity for zero-latency retrieval without third-party vector databases.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TOOLS CATALOG */}
        {activeTab === 'tools' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {toolCategories.map((cat, idx) => (
              <div key={idx} style={{
                background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: 12,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: cat.color, marginBottom: 8 }}>
                  {cat.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cat.tools.map((t) => (
                    <span key={t} style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: MCP CONNECTORS */}
        {activeTab === 'mcp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: 14 }}>
              <strong style={{ fontSize: 14, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plug size={16} /> Model Context Protocol (MCP) Integration
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Yogatik includes a complete client implementation of the standard <strong>Model Context Protocol (JSON-RPC 2.0)</strong>. Connect to any remote or local MCP server to dynamically expand the agent's toolbelt!
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>GitHub Remote MCP</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>Search repositories, inspect files, read commits, and manage pull requests.</p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Brave Search MCP</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>Real-time web search and news indexing with privacy-preserving queries.</p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>PostgreSQL Database MCP</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>Execute read-only SQL queries and inspect live database schemas.</p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Local Desktop MCP Bridge</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>Bridge local workspace files, git repos, and bash scripts.</p>
              </div>
            </div>

            {onOpenMcp && (
              <button className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => { onClose(); onOpenMcp() }}>
                <Plug size={14} style={{ marginRight: 6 }} /> Open MCP Connectors Manager
              </button>
            )}
          </div>
        )}

        {/* TAB 5: COMPANION & SCREEN WATCHER */}
        {activeTab === 'companion' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: 10, padding: 14 }}>
              <strong style={{ fontSize: 14, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Monitor size={16} /> Floating AI Companion &amp; Screen Watcher
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Work outside the app across VS Code, Chrome, Excel, Slack, or any desktop application. The companion floats always-on-top, observes what you are working on, and executes actions.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: '#38bdf8' }}>🖥️ Desktop App (`Yogatik.exe`)</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Press <strong>`Ctrl + Shift + Space`</strong> anywhere in Windows. Automatically reads the active foreground window title and takes instant high-res screenshots.
                </p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 13, color: '#34d399' }}>🌐 Web App (`browser`)</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Uses <strong>Document Picture-in-Picture (PiP)</strong> to pop out an always-on-top floating window, and <strong>`getDisplayMedia`</strong> to monitor selected tabs and apps.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SHORTCUTS */}
        {activeTab === 'shortcuts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Summon AI Companion</span>
                <kbd style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }}>Ctrl + Shift + Space</kbd>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Universal Search / Command Palette</span>
                <kbd style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }}>Ctrl + K</kbd>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Social &amp; Domain Hub</span>
                <kbd style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }}>Alt + D</kbd>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Send Prompt</span>
                <kbd style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }}>Enter</kbd>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          paddingTop: 12,
          marginTop: 4,
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {onOpenDemo && (
              <button className="small-btn" onClick={() => { onClose(); onOpenDemo() }}>
                <Sparkles size={12} /> Quick Demo
              </button>
            )}
            {onOpenTour && (
              <button className="small-btn" onClick={() => { onClose(); onOpenTour() }}>
                <Sparkles size={12} /> Interactive Tour
              </button>
            )}
            {onOpenDomainHub && (
              <button className="small-btn" onClick={() => { onClose(); onOpenDomainHub() }}>
                <Globe size={12} /> Domain Hub
              </button>
            )}
          </div>
          <button className="btn-primary" onClick={onClose}>
            Back to Chat
          </button>
        </div>
      </div>
    </Modal>
  )
}
