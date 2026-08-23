import React, { useState } from 'react'
import { Modal } from './Modal'
import { Sparkles, Globe, FileText, Mic, Key, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react'

export function DemoModal({ onClose }) {
  const [slide, setSlide] = useState(0)

  const slides = [
    {
      title: "Welcome to Yogatik AI!",
      subtitle: "Your supercharged AI assistant with 44+ built-in tools",
      icon: <Sparkles size={32} style={{ color: 'var(--accent-color, #ff6b35)' }} />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} style={{ color: '#ff6b35' }} /> 100% In-Browser & Privacy First
            </strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Yogatik communicates directly with model providers from your browser. Your chats, documents, and API keys stay on your device.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 10, borderRadius: 6, fontSize: 12 }}>
              🌐 <strong>Web Search</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>Real-time search with live academic & web sources.</div>
            </div>
            <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 10, borderRadius: 6, fontSize: 12 }}>
              📊 <strong>44+ Smart Tools</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>Weather, diagrams, data stats & text analytics.</div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "1-Click Word/PDF Exports & Code Execution",
      subtitle: "Export documents instantly & run code in-browser",
      icon: <FileText size={32} style={{ color: 'var(--accent-color, #ff6b35)' }} />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>📄 1-Click Document Exports (.doc & .pdf)</strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Click the Download icon on any AI message or tool card to download as native Microsoft Word <strong>.doc</strong> or <strong>.pdf</strong> files.
            </p>
          </div>
          <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>▶️ Live In-Browser Code Runner</strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Click <strong>▶️ Run Code</strong> on any Python or JavaScript snippet to evaluate code instantly inside your browser!
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Voice Dictation & Smart Input",
      subtitle: "Speak naturally or attach files & images",
      icon: <Mic size={32} style={{ color: 'var(--accent-color, #ff6b35)' }} />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>🎙️ Browser Voice Input</strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Tap the <strong>Mic button</strong> in the prompt box to dictate your questions hands-free.
            </p>
          </div>
          <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>📎 Upload Documents & Images</strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Attach PDFs, text files, or images for instant document summaries, Q&A, and visual inspection.
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Choose Free On-Device or Cloud AI Models",
      subtitle: "Chat 100% free with no API key or connect cloud models",
      icon: <Key size={32} style={{ color: 'var(--accent-color, #ff6b35)' }} />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'rgba(46, 204, 113, 0.1)', padding: 14, borderRadius: 8, border: '1px solid #2ecc71' }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
              ⚡ 100% Free On-Device AI (No API Key Needed!)
            </strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Yogatik automatically comes pre-loaded with an <strong>On-Device Local AI model</strong> running directly on your GPU — start chatting immediately with <strong>zero setup and no API key required</strong>!
            </p>
          </div>
          <div style={{ background: 'rgba(255, 107, 53, 0.08)', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
              ☁️ Optional Cloud AI Models
            </strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Want massive cloud models like Llama 3.3 70B or Gemini 2.5? Click <strong>Settings</strong> in the left sidebar to add free API keys for <strong>Groq, Gemini, OpenRouter, or NVIDIA</strong> anytime.
            </p>
          </div>
        </div>
      )
    }
  ]

  const current = slides[slide]

  return (
    <Modal
      title={current.title}
      icon={current.icon}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {slides.map((_, i) => (
              <span
                key={i}
                onClick={() => setSlide(i)}
                style={{
                  width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                  background: i === slide ? 'var(--accent-color, #ff6b35)' : 'var(--border-color, rgba(255,255,255,0.2))'
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {slide > 0 && (
              <button className="small-btn" onClick={() => setSlide(s => s - 1)}>
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {slide < slides.length - 1 ? (
              <button className="btn-primary" onClick={() => setSlide(s => s + 1)}>
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button className="btn-primary" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> Get Started
              </button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, marginTop: -4 }}>
          {current.subtitle}
        </p>
        {current.content}
      </div>
    </Modal>
  )
}
