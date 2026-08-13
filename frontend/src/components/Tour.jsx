import React, { useEffect, useState, useRef } from 'react'
import { X, ChevronRight, ChevronLeft, Check, HelpCircle, Sparkles, Zap, Shield, Keyboard } from 'lucide-react'

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Yogatik',
    content: 'Your private AI assistant with 65+ free tools — running entirely in your browser. No account required.',
    icon: Sparkles,
    target: null,
  },
  {
    id: 'chat',
    title: 'Start a Conversation',
    content: 'Type a message and press Enter (Shift+Enter for new line). The AI responds with live web research, code execution, image generation, and more.',
    icon: HelpCircle,
    target: '.messages',
  },
  {
    id: 'sidebar',
    title: 'Sidebar — Models & Settings',
    content: 'Click the gear icon or press Ctrl+, to open Settings. Add API keys (NVIDIA, Groq, OpenRouter, OpenAI, Gemini) or use local Ollama models offline.',
    icon: Zap,
    target: '.settings-toggle',
  },
  {
    id: 'tools',
    title: '65+ Built-in Tools',
    content: 'The AI can search the web, analyze documents, generate images/video, run Python code, create diagrams, and much more — all automatically.',
    icon: Shield,
    target: '.tool-badge',
  },
  {
    id: 'keyboard',
    title: 'Keyboard Shortcuts',
    content: '• Ctrl+K — Command Palette\n• Ctrl+Shift+O — New Chat\n• Ctrl+, — Settings\n• Ctrl+Shift+P/K/A — Personalise/Skills/Agents\n• Escape — Stop generation',
    icon: Keyboard,
    target: null,
  },
  {
    id: 'desktop',
    title: 'Desktop App Available',
    content: 'Install the desktop app for local Ollama models, file system access, system tray, native notifications, and auto-updates.',
    icon: Sparkles,
    target: null,
  },
]

export function Tour({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setStep(0)
    if (onComplete) onComplete()
  }, [isOpen, onComplete])

  useEffect(() => {
    const current = TOUR_STEPS[step]
    if (!current?.target) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector(current.target)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
    } else {
      setTargetRect(null)
    }
  }, [step])

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1)
    else onClose()
  }

  const prev = () => {
    if (step > 0) setStep(s => s - 1)
  }

  if (!isOpen) return null

  const current = TOUR_STEPS[step]
  const Icon = current.icon
  const isLast = step === TOUR_STEPS.length - 1

  return (
    <>
      <div className="tour-overlay" onClick={onClose} />
      <div className="tour-tooltip" ref={tooltipRef} style={targetRect ? {
        top: targetRect.bottom + 12,
        left: targetRect.left,
      } : {}}>
        <div className="tour-arrow" />
        <div className="tour-content">
          <div className="tour-header">
            <div className="tour-icon"><Icon size={24} /></div>
            <div className="tour-title-area">
              <h3>{current.title}</h3>
              <div className="tour-progress">{step + 1} / {TOUR_STEPS.length}</div>
            </div>
            <button className="tour-close" onClick={onClose} aria-label="Close tour"><X size={16} /></button>
          </div>
          <p>{current.content}</p>
          <div className="tour-actions">
            {step > 0 && <button className="tour-btn secondary" onClick={prev}><ChevronLeft size={14} /> Back</button>}
            <button className="tour-btn primary" onClick={next}>
              {isLast ? 'Get Started' : 'Next'} {isLast ? <Check size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
      {targetRect && (
        <div
          className="tour-highlight"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}
    </>
  )
}