/**
 * GrokDock — Side-panel dock for xAI Grok integration.
 * Provides a floating panel to interact with Grok models alongside the main chat.
 */
import React, { useState, useEffect, useRef } from 'react'
import { X, Zap, Send, RefreshCw } from 'lucide-react'

export function GrokDock({ onClose }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      // Grok dock uses the main LLM route via xAI provider when configured
      const { chatComplete } = await import('../llm')
      const { getSetting } = await import('../db')
      const apiKey = await getSetting('xai_api_key', '')
      if (!apiKey) {
        setMessages(prev => [...prev, { role: 'assistant', text: 'No xAI API key set. Add it under Settings → Providers → xAI.' }])
        return
      }
      const resp = await chatComplete({
        provider: 'xai',
        model: 'grok-2',
        apiKey,
        messages: [
          ...messages.map(m => ({ role: m.role, content: m.text })),
          { role: 'user', content: userMsg },
        ],
        maxTokens: 1024,
        temperature: 0.7,
      })
      const reply = resp?.choices?.[0]?.message?.content || '(no response)'
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e?.message || 'Unknown error'}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grok-dock" style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-secondary, #1a1a2e)', color: 'var(--text-primary, #e0e0e0)',
      borderLeft: '1px solid var(--border, #2a2a3e)', fontFamily: 'inherit',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border, #2a2a3e)' }}>
        <Zap size={16} color="#7c3aed" />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Grok Dock</span>
        <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 'auto' }}>xAI</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'inherit', opacity: 0.6 }}>
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ opacity: 0.4, fontSize: 13, textAlign: 'center', marginTop: 32 }}>
            Ask Grok anything alongside your main conversation.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%', padding: '8px 12px', borderRadius: 10,
            background: m.role === 'user' ? '#7c3aed22' : 'var(--bg-tertiary, #2a2a3e)',
            fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>{m.text}</div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', opacity: 0.5, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Thinking…
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border, #2a2a3e)', display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Message Grok…"
          style={{
            flex: 1, background: 'var(--bg-tertiary, #2a2a3e)', border: '1px solid var(--border, #3a3a4e)',
            borderRadius: 8, padding: '7px 10px', color: 'inherit', fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            background: '#7c3aed', border: 'none', borderRadius: 8, padding: '7px 12px',
            cursor: 'pointer', color: '#fff', opacity: (!input.trim() || loading) ? 0.4 : 1,
          }}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}

export default GrokDock
