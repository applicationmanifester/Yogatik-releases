import React, { useState, useMemo } from 'react'
import {
  Share2, ExternalLink, Download, Sparkles, BookOpen, Layers,
  Brain, Database, Shield, Zap, Copy, Check, Trash2
} from 'lucide-react'

/**
 * Interactive Citation & Knowledge Graph Modal
 * Renders node-link visual graph of academic cross-references, author connections,
 * and semantic vector memory clusters using responsive SVG layout.
 */
export function CitationGraphModal({ isOpen, onClose, papers = [] }) {
  const [mode, setMode] = useState('memory') // 'memory' | 'papers'
  const [selectedNode, setSelectedNode] = useState(null)
  const [copiedText, setCopiedText] = useState(false)
  const [prunedIds, setPrunedIds] = useState(new Set())

  // Sample semantic memory items from vector memory & local graph
  const defaultMemories = useMemo(() => [
    {
      id: 'm1',
      title: 'UI Preferences: Glassmorphism & Fast Hotkeys',
      category: 'Profile',
      confidence: '98%',
      summary: 'Prefers sleek dark-mode glassmorphic cards, compact floating companion, and global hotkey invocation.',
      tags: ['ui', 'theme', 'shortcuts'],
    },
    {
      id: 'm2',
      title: 'Architecture Decision: Pure Functions for Live Cascade',
      category: 'Architecture',
      confidence: '99%',
      summary: 'Separated pure audio parsing from DOM-binding speech recognition listeners to eliminate audio leaks.',
      tags: ['live', 'audio', 'webrtc'],
    },
    {
      id: 'm3',
      title: 'Meeting Action: Multi-Agent Benchmark Latency 42ms',
      category: 'Meeting Minutes',
      confidence: '92%',
      summary: 'Benchmarked sub-agent RPC dispatch time across isolated worker threads with average roundtrip 42ms.',
      tags: ['agents', 'benchmarks', 'performance'],
    },
    {
      id: 'm4',
      title: 'Vector Cache: TurboQuant 4-Bit Embedding Index',
      category: 'Vector RAG',
      confidence: '95%',
      summary: 'Browser-native randomized vector quantization engine supporting fast approximate nearest neighbor lookups.',
      tags: ['turbovec', 'embeddings', 'quantization'],
    },
    {
      id: 'm5',
      title: 'Security Policy: Action Gate for Native OS Shell',
      category: 'Security',
      confidence: '100%',
      summary: 'Mandatory user prompt and validation before executing terminal or write operations from autonomous agents.',
      tags: ['security', 'action-gate', 'desktop'],
    },
    {
      id: 'm6',
      title: 'Browser Automation: Accessibility Ref Mapping',
      category: 'Automation',
      confidence: '94%',
      summary: 'Deterministic epoch-based accessibility tree node refs (ref_epoch_idx) for reliable web element clicks.',
      tags: ['browser', 'dom', 'accessibility'],
    },
  ], [])

  // Default sample research papers if none passed
  const activePapers = useMemo(() => {
    if (papers && papers.length > 0) return papers
    return [
      { id: 'p1', title: 'Deep Residual Learning for Image Recognition', authors: ['K. He', 'X. Zhang', 'S. Ren', 'J. Sun'], year: 2016, venue: 'CVPR', citations: 180000 },
      { id: 'p2', title: 'Attention Is All You Need', authors: ['A. Vaswani', 'N. Shazeer', 'N. Parmar', 'J. Uszkoreit'], year: 2017, venue: 'NeurIPS', citations: 120000 },
      { id: 'p3', title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: ['J. Devlin', 'M. Chang', 'K. Lee', 'K. Toutanova'], year: 2018, venue: 'NAACL', citations: 95000 },
      { id: 'p4', title: 'Language Models are Few-Shot Learners (GPT-3)', authors: ['T. Brown', 'B. Mann', 'N. Ryder', 'M. Subbiah'], year: 2020, venue: 'NeurIPS', citations: 55000 },
      { id: 'p5', title: 'Retrieval-Augmented Generation for NLP', authors: ['P. Lewis', 'E. Perez', 'A. Piktus', 'F. Petroni'], year: 2020, venue: 'NeurIPS', citations: 18000 },
    ]
  }, [papers])

  const activeItems = useMemo(() => {
    if (mode === 'memory') {
      return defaultMemories.filter(m => !prunedIds.has(m.id))
    }
    return activePapers
  }, [mode, defaultMemories, activePapers, prunedIds])

  const width = 640
  const height = 360
  const centerX = width / 2
  const centerY = height / 2
  const radius = 130

  // Calculate radial layout positions
  const graphData = useMemo(() => {
    const total = activeItems.length
    const nodes = activeItems.map((item, idx) => {
      const angle = (idx / total) * 2 * Math.PI - Math.PI / 2
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)
      return {
        ...item,
        x,
        y,
        color: ['#06b6d4', '#818cf8', '#a855f7', '#ec4899', '#10b981', '#f59e0b'][idx % 6],
      }
    })

    // Construct interconnected links
    const links = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.abs(i - j) === 1 || (i === 0 && j === nodes.length - 1) || Math.random() > 0.55) {
          links.push({
            source: nodes[i],
            target: nodes[j],
          })
        }
      }
    }
    return { nodes, links }
  }, [activeItems, centerX, centerY, radius])

  const handlePruneNode = (id) => {
    setPrunedIds(prev => new Set([...prev, id]))
    if (selectedNode?.id === id) setSelectedNode(null)
  }

  const handleCopyNodeSummary = (text) => {
    navigator.clipboard.writeText(text)
    setCopiedText(true)
    setTimeout(() => setCopiedText(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette citation-graph-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Knowledge & Memory Graph"
        style={{ width: 'min(780px, 96%)', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="palette-input-bar" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Share2 size={18} style={{ color: 'var(--accent, #06b6d4)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Interactive Knowledge &amp; Memory Graph</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 6 }}>
              <button
                className={`small-btn ${mode === 'memory' ? 'btn-primary' : ''}`}
                onClick={() => { setMode('memory'); setSelectedNode(null) }}
                style={{ fontSize: 11, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Brain size={12} /> Semantic Memory ({defaultMemories.length - prunedIds.size})
              </button>
              <button
                className={`small-btn ${mode === 'papers' ? 'btn-primary' : ''}`}
                onClick={() => { setMode('papers'); setSelectedNode(null) }}
                style={{ fontSize: 11, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <BookOpen size={12} /> Research Citations ({activePapers.length})
              </button>
            </div>
            <span className="status-chip ready" style={{ fontSize: 11, padding: '2px 8px' }}>
              <Sparkles size={11} /> {mode === 'memory' ? 'TurboQuant Vector Graph' : 'Federated RAG Graph'}
            </span>
          </div>

          {/* SVG Graph Viewport */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {/* Central Hub Glow */}
              <circle cx={centerX} cy={centerY} r={radius + 30} fill="none" stroke="var(--border)" strokeDasharray="4 4" opacity="0.4" />
              <circle cx={centerX} cy={centerY} r={8} fill="var(--accent, #06b6d4)" opacity="0.8" />
              <text x={centerX} y={centerY + 20} textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontWeight="600">
                {mode === 'memory' ? 'SEMANTIC CLUSTER' : 'RESEARCH CLUSTER'}
              </text>

              {/* Edge Links */}
              {graphData.links.map((l, i) => (
                <line
                  key={i}
                  x1={l.source.x}
                  y1={l.source.y}
                  x2={l.target.x}
                  y2={l.target.y}
                  stroke="var(--border)"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
              ))}

              {/* Node Circles */}
              {graphData.nodes.map(n => {
                const isSelected = selectedNode?.id === n.id
                return (
                  <g
                    key={n.id}
                    onClick={() => setSelectedNode(n)}
                    style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                  >
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={isSelected ? 18 : 14}
                      fill={n.color}
                      stroke={isSelected ? '#ffffff' : 'rgba(0,0,0,0.3)'}
                      strokeWidth={isSelected ? 2.5 : 1}
                      filter="drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
                    />
                    <text
                      x={n.x}
                      y={n.y + 26}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontSize="10.5"
                      fontWeight={isSelected ? '700' : '500'}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {n.title.length > 24 ? n.title.slice(0, 22) + '…' : n.title}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Selected Node Details Box */}
          {selectedNode ? (
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedNode.title}</span>
                {selectedNode.category ? (
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                    {selectedNode.category} • Confidence: {selectedNode.confidence}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedNode.year} • {selectedNode.venue || 'Journal'}</span>
                )}
              </div>

              {selectedNode.summary && (
                <div style={{ fontSize: 11.5, color: '#e2e8f0', lineHeight: 1.45 }}>
                  {selectedNode.summary}
                </div>
              )}

              {selectedNode.tags && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selectedNode.tags.map(t => (
                    <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {selectedNode.authors && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  <strong>Authors:</strong> {selectedNode.authors.join(', ')}
                </div>
              )}

              {/* Action Buttons for Selected Node */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <button
                  className="small-btn"
                  onClick={() => handleCopyNodeSummary(selectedNode.summary || selectedNode.title)}
                  style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {copiedText ? <Check size={11} /> : <Copy size={11} />}
                  {copiedText ? 'Copied' : 'Copy Text'}
                </button>
                {mode === 'memory' && (
                  <button
                    className="small-btn"
                    onClick={() => handlePruneNode(selectedNode.id)}
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: '#f87171' }}
                  >
                    <Trash2 size={11} /> Prune from Memory
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center' }}>
              Tip: Click any node in the graph above to inspect semantic details, copy context, or prune memory records.
            </div>
          )}
        </div>

        <div className="palette-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="small-btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
export default CitationGraphModal
