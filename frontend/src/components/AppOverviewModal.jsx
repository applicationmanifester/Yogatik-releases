import React, { useState } from 'react'
import { Modal } from './Modal'
import { YogatikLogo } from './YogatikLogo'
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
  Camera
} from 'lucide-react'

export function AppOverviewModal({ onClose, onOpenSettings, onOpenDemo, onOpenDomainHub, onOpenMcp }) {
  const [activeTab, setActiveTab] = useState('workflow') // 'workflow' | 'architecture' | 'tools' | 'mcp' | 'companion' | 'shortcuts'

  const workflowSteps = [
    {
      num: '01',
      title: 'Choose Your Intelligence Engine',
      icon: <Cpu size={20} color="#38bdf8" />,
      tag: 'Zero-Key Local or Multi-Cloud',
      desc: 'Run 100% private, on-device AI directly in your browser using WebGPU — no API key or setup required. Or connect your keys for Claude 3.7 Sonnet, GPT-4o, xAI Grok, DeepSeek Reasoner, Gemini 2.5, Mistral Large, Perplexity, or OpenRouter.',
    },
    {
      num: '02',
      title: 'Multimodal Input & Rich Context (RAG)',
      icon: <Mic size={20} color="#a78bfa" />,
      tag: 'Text · Voice · Documents · Vision',
      desc: 'Type naturally, dictate hands-free via browser speech-to-text, drag-and-drop PDFs/documents for in-memory vector embeddings (RAG), or capture live screens/cameras for visual AI analysis.',
    },
    {
      num: '03',
      title: 'Autonomous Agent Loop & Tool Calling',
      icon: <Wrench size={20} color="#fbbf24" />,
      tag: '50+ Built-in Tools',
      desc: 'The intelligent agent loop automatically determines when external capabilities are needed — performing live web search, executing in-browser Python/JS code, querying weather/finance, rendering diagrams, or spawning sub-agents.',
    },
    {
      num: '04',
      title: 'Model Context Protocol (MCP) Ecosystem',
      icon: <Plug size={20} color="#34d399" />,
      tag: 'Live External Data',
      desc: 'Connect to remote MCP servers (GitHub, Stripe, PostgreSQL, Brave Search, Memory Graph, local desktop bridge) via standard JSON-RPC 2.0 to query production databases and execute external tasks.',
    },
    {
      num: '05',
      title: 'Interactive Outputs & 1-Click Exports',
      icon: <FileDown size={20} color="#f472b6" />,
      tag: 'Word · PDF · Code Runners',
      desc: 'Stream responses with live code runners, interactive charts, and 1-click downloads to Microsoft Word (.doc) and native PDF formats.',
    },
  ]

  const toolCategories = [
    {
      name: 'Web & Search Intelligence',
      color: '#38bdf8',
      tools: ['web_search', 'local_search', 'wikipedia', 'scholar', 'hackernews', 'stackoverflow', 'rss_feed', 'whois', 'link_preview', 'youtube'],
    },
    {
      name: 'Code & Sandboxing',
      color: '#a78bfa',
      tools: ['code_execute (Python)', 'js_execute', 'terminal_run', 'code_format', 'regex', 'diff', 'hash'],
    },
    {
      name: 'Vision & Multimodal',
      color: '#fbbf24',
      tools: ['screen_inspect', 'ocr', 'image_generate (Flux)', 'sticker_generate', 'qr_generate', 'qr_read', 'image_info', 'chart', 'diagram (Mermaid)'],
    },
    {
      name: 'OS & Companion Automation',
      color: '#34d399',
      tools: ['desktop_action', 'browser_autopilot', 'scheduler', 'timer', 'alarm', 'spawn_agents', 'sub_agent_runner', 'fs_read/write'],
    },
    {
      name: 'Document & Knowledge RAG',
      color: '#f472b6',
      tools: ['doc_search', 'pdf_extract', 'summarize', 'md_to_pdf', 'doc_export', 'text_analytics', 'data_stats', 'thesaurus', 'dictionary'],
    },
  ]

  return (
    <Modal
      title="About Yogatik AI Workstation"
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
                Yogatik AI Workstation
              </h2>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontWeight: 700 }}>
                v3.8.0
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', fontWeight: 700 }}>
                Local-First &amp; Private
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              All-in-one autonomous AI workstation combining on-device privacy (WebGPU), 50+ built-in agent tools, multi-cloud LLM routing, cross-app screen monitoring, and native Model Context Protocol (MCP) server connectors.
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
            <Wrench size={14} style={{ marginRight: 6 }} /> 50+ Agent Tools
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
