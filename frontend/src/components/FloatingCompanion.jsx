import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Monitor,
  Maximize2,
  Minimize2,
  Sparkles,
  Send,
  Mic,
  MicOff,
  Camera,
  Layers,
  Globe,
  Code,
  FileText,
  Zap,
  Bot,
  Activity,
  X,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Radio,
  Play,
  RotateCw,
  Sliders,
  CheckCircle2,
  Copy,
  Terminal,
  Cpu,
  Plus,
  Compass,
  FileCode,
  MessageSquare,
  Search,
  Check,
  ZoomIn,
  Repeat,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  CheckSquare,
  Wand2,
  GripHorizontal,
  UploadCloud,
  FileUp,
  Settings2,
} from 'lucide-react'
import { YogatikLogo } from './YogatikLogo'
import {
  captureWebScreenFrame,
  isScreenCaptureSupported,
  isDocumentPipSupported,
} from '../pipCompanion'
import { describeWithoutModel } from '../vision/source'
import {
  contextChanged, shouldObserve, shouldSpeak, buildObservationPrompt,
  OBSERVE_INTERVAL_MS,
} from '../companionAwareness'

// ─── Real-time Audio Visualizer Equalizer Component ─────────────────────────
function AudioEqualizer({ active = false, color = '#10b981' }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 14, padding: '0 4px' }}>
      {[0.4, 0.9, 0.6, 1.0, 0.5].map((h, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 2.5,
            height: active ? `${Math.max(4, h * 12)}px` : '3px',
            backgroundColor: color,
            borderRadius: 2,
            transition: 'height 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            animation: active ? `eqWave 0.8s ease-in-out ${i * 0.12}s infinite alternate` : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ─── Enhanced In-Companion Code Block with 1-Click Fast Apply ────────────────
function CompanionMessageContent({ content, onApplyCode }) {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null)
  const [appliedCodeIdx, setAppliedCodeIdx] = useState(null)

  if (!content) return null

  const parts = []
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'code', lang: match[1] || 'code', code: match[2] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) })
  }

  const handleCopyCode = (idx, code) => {
    navigator.clipboard.writeText(code)
    setCopiedCodeIdx(idx)
    setTimeout(() => setCopiedCodeIdx(null), 2000)
  }

  const handleApply = (idx, code) => {
    if (onApplyCode) {
      onApplyCode(code)
      setAppliedCodeIdx(idx)
      setTimeout(() => setAppliedCodeIdx(null), 2500)
    }
  }

  const formatText = (txt) => {
    return txt.split('\n').map((line, lineIdx) => {
      const isBullet = /^\s*[-*•]\s+(.*)/.test(line)
      const lineContent = isBullet ? line.replace(/^\s*[-*•]\s+/, '') : line

      // Semantica Decision Badge detection
      const isDecision = /\[(DECISION|APPROVED|PRECEDENT|POLICY)\]/i.test(lineContent)

      const tokens = []
      const inlineRegex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
      let cur = 0
      let m
      while ((m = inlineRegex.exec(lineContent)) !== null) {
        if (m.index > cur) tokens.push(lineContent.slice(cur, m.index))
        if (m[2]) {
          tokens.push(<strong key={m.index} style={{ color: 'var(--accent, #6366f1)', fontWeight: 600 }}>{m[2]}</strong>)
        } else if (m[3]) {
          tokens.push(
            <code key={m.index} style={{
              background: 'rgba(255, 255, 255, 0.08)',
              padding: '1px 5px',
              borderRadius: 4,
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '0.88em',
              color: '#38bdf8',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}>{m[3]}</code>
          )
        }
        cur = m.index + m[0].length
      }
      if (cur < lineContent.length) tokens.push(lineContent.slice(cur))

      return (
        <div key={lineIdx} style={{
          marginBottom: lineIdx === txt.split('\n').length - 1 ? 0 : 3,
          paddingLeft: isBullet ? 12 : 0,
          position: 'relative',
          lineHeight: 1.45,
          fontSize: 12.5,
        }}>
          {isBullet && (
            <span style={{ position: 'absolute', left: 2, color: 'var(--accent, #6366f1)', fontSize: '0.9em' }}>•</span>
          )}
          {isDecision && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 600,
              color: '#818cf8',
              marginRight: 4,
            }}>
              <Sparkles size={10} /> Semantica Provenance
            </span>
          )}
          {tokens.length ? tokens : lineContent}
        </div>
      )
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {parts.map((p, idx) => {
        if (p.type === 'text') {
          return <div key={idx}>{formatText(p.text)}</div>
        }
        return (
          <div key={idx} style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            overflow: 'hidden',
            margin: '4px 0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              background: 'rgba(255, 255, 255, 0.04)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: 10,
              color: 'var(--text-secondary, #94a3b8)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}>
              <span>{p.lang}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {onApplyCode && (
                  <button
                    onClick={() => handleApply(idx, p.code)}
                    style={{
                      background: appliedCodeIdx === idx ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: appliedCodeIdx === idx ? '#10b981' : '#a5b4fc',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 9.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 6px',
                      transition: 'all 0.15s',
                    }}
                    title="Apply code directly to active file"
                  >
                    {appliedCodeIdx === idx ? <Check size={10} /> : <Wand2 size={10} />}
                    {appliedCodeIdx === idx ? 'Applied' : 'Apply'}
                  </button>
                )}
                <button
                  onClick={() => handleCopyCode(idx, p.code)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedCodeIdx === idx ? '#10b981' : 'inherit',
                    cursor: 'pointer',
                    fontSize: 9.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 4px',
                  }}
                >
                  {copiedCodeIdx === idx ? <Check size={10} /> : <Copy size={10} />}
                  {copiedCodeIdx === idx ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <pre style={{
              margin: 0,
              padding: '8px 10px',
              fontSize: 11,
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              color: '#e2e8f0',
              overflowX: 'auto',
              whiteSpace: 'pre',
              lineHeight: 1.45,
            }}>
              <code>{p.code}</code>
            </pre>
          </div>
        )
      })}
    </div>
  )
}

export function FloatingCompanion({
  activeApp = 'Visual Studio Code',
  activeTitle = 'Yogatik Project',
  activeProvider = '',
  activeModel = '',
  onSendPrompt,
  onExitCompanion,
  onPopOutPip,
  onNewChat,
  isStreaming = false,
  streamText = '',
  messages = [],
}) {
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [continuousVoice, setContinuousVoice] = useState(false)
  const [screenPreview, setScreenPreview] = useState(null)
  const [screenMeta, setScreenMeta] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [autoWatch, setAutoWatch] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  const [speechRate, setSpeechRate] = useState(1.05)
  const [availableVoices, setAvailableVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const [isCompact, setIsCompact] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [opacityLevel, setOpacityLevel] = useState(0.96)
  const [monitoredApp, setMonitoredApp] = useState({ appName: activeApp, title: activeTitle })
  const [ambient, setAmbient] = useState(false)
  const ambientRef = useRef({ lastObservedAt: 0, lastSpokeAt: 0, spokenCount: 0, seen: null, seenAt: 0 })
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrText, setOcrText] = useState(null)
  const [zoomModal, setZoomModal] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)

  // ── Drag & Position Management ──
  const [position, setPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 400) : 100,
    y: typeof window !== 'undefined' ? Math.max(20, window.innerHeight - 640) : 100,
  }))
  const isDraggingRef = useRef(false)
  const dragStartOffset = useRef({ x: 0, y: 0 })

  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const lastSpokenMsgRef = useRef(null)

  const isDesktopEnv = typeof window !== 'undefined' && Boolean(window.__YOGATIK_COMPANION__)

  // Load available speech synthesis voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        const voices = window.speechSynthesis.getVoices()
        if (voices.length) {
          setAvailableVoices(voices)
          const natural = voices.find(v => /natural|google|samantha|neural/i.test(v.name)) || voices[0]
          setSelectedVoice(natural)
        }
      }
      updateVoices()
      window.speechSynthesis.onvoiceschanged = updateVoices
    }
  }, [])

  // Show a quick transient toast message in the companion HUD
  const triggerToast = useCallback((msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }, [])

  // Track unread messages when minimized
  useEffect(() => {
    if (isCompact && messages.length > 0) {
      setUnreadCount(c => c + 1)
    }
  }, [messages.length, isCompact])

  // Scroll to bottom on new messages or stream
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // Window drag handlers
  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return
    isDraggingRef.current = true
    dragStartOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
  }, [position])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return
      const newX = Math.max(10, Math.min(window.innerWidth - 390, e.clientX - dragStartOffset.current.x))
      const newY = Math.max(10, Math.min(window.innerHeight - 630, e.clientY - dragStartOffset.current.y))
      setPosition({ x: newX, y: newY })
    }
    const handleMouseUp = () => {
      isDraggingRef.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Keyboard shortcut listener (Escape to minimize/close)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!isCompact) setIsCompact(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCompact])

  // Poll or query active window every 2.5s in desktop Electron
  useEffect(() => {
    let timer = null
    const updateActive = async () => {
      if (isDesktopEnv && window.__YOGATIK_COMPANION__?.getActiveWindow) {
        try {
          const info = await window.__YOGATIK_COMPANION__.getActiveWindow()
          if (info?.appName && info.appName !== 'Unknown') {
            setMonitoredApp(info)
          }
        } catch { /* ignore */ }
      }
    }
    updateActive()
    timer = setInterval(updateActive, 2500)
    return () => { if (timer) clearInterval(timer) }
  }, [isDesktopEnv])

  // Determine current companion glow state
  const companionState = useMemo(() => {
    if (listening) return { label: 'Listening...', color: '#10b981', glow: '0 0 24px rgba(16, 185, 129, 0.45)' }
    if (isStreaming) return { label: 'Thinking...', color: '#06b6d4', glow: '0 0 24px rgba(6, 182, 212, 0.45)' }
    if (scanning) return { label: 'Scanning Screen...', color: '#f59e0b', glow: '0 0 20px rgba(245, 158, 11, 0.4)' }
    if (autoWatch) return { label: 'Watching Screen', color: '#8b5cf6', glow: '0 0 16px rgba(139, 92, 246, 0.3)' }
    return { label: 'Ready', color: '#6366f1', glow: '0 0 14px rgba(99, 102, 241, 0.25)' }
  }, [listening, isStreaming, scanning, autoWatch])

  // Capture screen frame helper
  const handleCaptureScreen = useCallback(async (silent = false) => {
    if (!silent) setScanning(true)
    try {
      if (isDesktopEnv && window.__YOGATIK_COMPANION__?.captureScreen) {
        const res = await window.__YOGATIK_COMPANION__.captureScreen()
        if (res.success) {
          setScreenPreview(res.dataUrl)
          setScreenMeta({
            source: 'Desktop Screen',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            count: res.screens?.length || 1,
            width: res.width || 1920,
            height: res.height || 1080,
          })
          return res.dataUrl
        }
      } else if (isScreenCaptureSupported()) {
        const frame = await captureWebScreenFrame()
        if (frame.success && frame.dataUrl) {
          setScreenPreview(frame.dataUrl)
          setScreenMeta({
            source: frame.sourceLabel || 'Web Tab / Screen',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            width: frame.width || 1280,
            height: frame.height || 720,
          })
          setMonitoredApp({ appName: 'Web Browser', title: frame.sourceLabel || 'Monitored Tab / Screen' })
          return frame.dataUrl
        }
      }
    } catch { /* ignore */ }
    finally {
      if (!silent) setScanning(false)
    }
    return null
  }, [isDesktopEnv])

  // Extract OCR text from current screen snapshot
  const handleExtractOcr = async () => {
    if (!screenPreview) return
    setOcrLoading(true)
    try {
      const res = await describeWithoutModel(screenPreview, { allowVlm: false })
      if (res?.text) {
        setOcrText(res.text)
        await navigator.clipboard.writeText(res.text)
        triggerToast('Copied OCR text from screen to clipboard!')
      }
    } catch { /* ignore */ }
    finally {
      setOcrLoading(false)
    }
  }

  // Voice speech-to-text setup
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition
      const rec = new SpeechClass()
      rec.continuous = false
      rec.interimResults = true
      rec.onresult = (e) => {
        const text = Array.from(e.results).map(r => r[0].transcript).join('')
        setInput(text)
      }
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      recognitionRef.current = rec
    }
  }, [])

  // Text-To-Speech audio feedback when speech is enabled + continuous voice loop
  useEffect(() => {
    if (!speechEnabled || isStreaming || !messages.length) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role === 'assistant' && lastMsg.content && lastMsg.id !== lastSpokenMsgRef.current) {
      lastSpokenMsgRef.current = lastMsg.id || lastMsg.content
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(lastMsg.content.slice(0, 400))
        utterance.rate = speechRate
        if (selectedVoice) utterance.voice = selectedVoice
        utterance.onend = () => {
          if (continuousVoice && recognitionRef.current) {
            try {
              setInput('')
              recognitionRef.current.start()
              setListening(true)
            } catch {}
          }
        }
        window.speechSynthesis.speak(utterance)
      }
    }
  }, [speechEnabled, isStreaming, messages, continuousVoice, speechRate, selectedVoice])

  const toggleVoice = () => {
    if (!recognitionRef.current) return
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
    } else {
      setInput('')
      try {
        recognitionRef.current.start()
        setListening(true)
      } catch {}
    }
  }

  // Quick Action triggers
  const handleQuickAction = async (actionType) => {
    let prompt = ''
    if (actionType === 'review') {
      prompt = `Perform an Alibaba Open Code Review on the current workspace/file. Categorize any defects by SECURITY, BUG_RISK, PERFORMANCE, DESIGN, and STYLE, and suggest line-level fixes.`
    } else if (actionType === 'audit') {
      prompt = `Audit current active window/code for security vulnerabilities, exposed credentials, prompt injections, and unsanitized parameters.`
    } else if (actionType === 'decision') {
      prompt = `Record an auditable Semantica decision for the current proposed changes with category, reasoning, and policy compliance verification.`
    } else if (actionType === 'explain') {
      prompt = `Explain the architecture, data flow, and key functions in the current active context clearly and concisely.`
    } else {
      prompt = actionType
    }

    const dataUrl = await handleCaptureScreen(true)
    let attachment = null
    if (dataUrl) {
      attachment = {
        name: `screen_${Date.now()}.jpg`,
        dataUrl,
        thumb: dataUrl,
        width: screenMeta?.width || 1280,
        height: screenMeta?.height || 720,
      }
    }
    const contextPrefix = `[Context: Active Window is ${monitoredApp.appName} ("${monitoredApp.title}")] `
    onSendPrompt?.(`${contextPrefix}${prompt}`, attachment)
  }

  // File Dropzone Handler
  const handleFileDrop = (e) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return

    const file = files[0]
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        onSendPrompt?.(`Analyze this attached image: ${file.name}`, {
          name: file.name,
          dataUrl: reader.result,
          thumb: reader.result,
        })
        triggerToast(`Ingested image: ${file.name}`)
      }
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result
        onSendPrompt?.(`Analyze this attached file [${file.name}]:\n\`\`\`\n${text.slice(0, 8000)}\n\`\`\``)
        triggerToast(`Ingested file: ${file.name}`)
      }
      reader.readAsText(file)
    }
  }

  const handleApplyCodeToDisk = async (codeSnippet) => {
    if (!isDesktopEnv) {
      await navigator.clipboard.writeText(codeSnippet)
      triggerToast('Copied code to clipboard (Desktop mode required for direct file write)')
      return
    }
    try {
      const activeFile = monitoredApp.title.includes('.') ? monitoredApp.title.trim() : null
      if (activeFile && window.__YOGATIK_ACTION_GATE__) {
        onSendPrompt?.(`Apply this code snippet directly to ${activeFile}:\n\`\`\`\n${codeSnippet}\n\`\`\``)
        triggerToast(`Dispatched patch for ${activeFile}`)
      } else {
        await navigator.clipboard.writeText(codeSnippet)
        triggerToast('Copied code to clipboard!')
      }
    } catch {
      await navigator.clipboard.writeText(codeSnippet)
      triggerToast('Copied code to clipboard!')
    }
  }

  // ── Render Compact Floating Capsule ──────────────────────────────────────
  if (isCompact) {
    return (
      <div
        style={{
          position: 'fixed',
          top: position.y,
          left: position.x,
          zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 30,
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: companionState.glow,
          transition: 'box-shadow 0.3s ease',
          cursor: 'grab',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onClick={() => {
          setIsCompact(false)
          setUnreadCount(0)
        }}
      >
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: companionState.color,
            boxShadow: `0 0 8px ${companionState.color}`,
          }} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: -6,
              right: -6,
              background: '#8b5cf6',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 10,
              padding: '1px 4px',
              boxShadow: '0 0 6px #8b5cf6',
            }}>
              {unreadCount}
            </span>
          )}
        </div>
        <YogatikLogo size={18} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#f8fafc' }}>Companion</span>
        {listening && <AudioEqualizer active={true} color="#10b981" />}
        <button
          onClick={(e) => { e.stopPropagation(); toggleVoice() }}
          style={{
            background: listening ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#fff',
            borderRadius: '50%',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {listening ? <Mic size={13} /> : <MicOff size={13} />}
        </button>
        <Maximize2 size={13} color="#94a3b8" />
      </div>
    )
  }

  // ── Render Full Glassmorphic HUD Companion ───────────────────────────────
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true) }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleFileDrop}
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        width: 380,
        height: 620,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        background: `rgba(10, 15, 29, ${opacityLevel})`,
        backdropFilter: 'blur(24px) saturate(180%)',
        border: isDraggingFile ? '2px dashed #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 16,
        boxShadow: `0 20px 50px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.15), ${companionState.glow}`,
        overflow: 'hidden',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
      }}
    >
      {/* Drag & Drop File Overlay */}
      {isDraggingFile && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.9)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: '#38bdf8',
          pointerEvents: 'none',
        }}>
          <UploadCloud size={48} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>Drop file to analyze in companion</div>
        </div>
      )}

      {/* ── Top Cyber-HUD Header (Draggable) ── */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GripHorizontal size={14} color="#64748b" style={{ cursor: 'grab' }} />
          <div style={{
            position: 'relative',
            width: 24,
            height: 24,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
          }}>
            <YogatikLogo size={16} />
            <span style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: companionState.color,
              boxShadow: `0 0 6px ${companionState.color}`,
            }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2, display: 'flex', alignItems: 'center', gap: 4 }}>
              Yogatik AI Companion
            </div>
            <div style={{ fontSize: 10, color: companionState.color, fontWeight: 500 }}>
              {companionState.label}
            </div>
          </div>
        </div>

        {/* Header Action Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isDocumentPipSupported() && (
            <button
              onClick={onPopOutPip}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                display: 'flex',
              }}
              title="Pop out into native Picture-in-Picture window"
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button
            onClick={() => setShowVoiceSettings(s => !s)}
            style={{
              background: showVoiceSettings ? 'rgba(99, 102, 241, 0.2)' : 'none',
              border: 'none',
              color: showVoiceSettings ? '#818cf8' : '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
            }}
            title="TTS Speech Settings"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={() => setSpeechEnabled(s => !s)}
            style={{
              background: speechEnabled ? 'rgba(99, 102, 241, 0.2)' : 'none',
              border: 'none',
              color: speechEnabled ? '#818cf8' : '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
            }}
            title={speechEnabled ? 'Mute Voice' : 'Enable Spoken Voice'}
          >
            {speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={() => {
              setIsCompact(true)
              setUnreadCount(0)
            }}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
            title="Minimize to floating pill (Esc)"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={onExitCompanion}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
            title="Close companion"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Voice Settings Popover */}
      {showVoiceSettings && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 11,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Speech Speed: {speechRate.toFixed(2)}x</span>
            <input
              type="range"
              min="0.8"
              max="1.4"
              step="0.05"
              value={speechRate}
              onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
              style={{ width: 100, accentColor: '#6366f1' }}
            />
          </div>
          {availableVoices.length > 0 && (
            <select
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const v = availableVoices.find(item => item.name === e.target.value)
                if (v) setSelectedVoice(v)
              }}
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 10,
              }}
            >
              {availableVoices.map(v => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Active Context & File Awareness HUD ── */}
      <div style={{
        padding: '6px 12px',
        background: 'rgba(255, 255, 255, 0.02)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 11,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Monitor size={12} color="#94a3b8" />
          <span style={{ color: '#cbd5e1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
            {monitoredApp.appName}: {monitoredApp.title || 'Active Document'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setAutoWatch(w => !w)}
            style={{
              background: autoWatch ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${autoWatch ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
              color: autoWatch ? '#a78bfa' : '#94a3b8',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Toggle autonomous screen observation"
          >
            {autoWatch ? <Eye size={10} /> : <EyeOff size={10} />}
            {autoWatch ? 'Watching' : 'Watch'}
          </button>
          <button
            onClick={() => handleCaptureScreen(false)}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Snap current screen frame"
          >
            <Camera size={10} /> Snap
          </button>
        </div>
      </div>

      {/* ── Quick Action Triggers Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'rgba(255, 255, 255, 0.01)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        overflowX: 'auto',
      }}>
        <button
          onClick={() => handleQuickAction('review')}
          style={{
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: '#38bdf8',
            borderRadius: 12,
            padding: '3px 9px',
            fontSize: 10.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
        >
          <Zap size={11} /> Code Review
        </button>
        <button
          onClick={() => handleQuickAction('audit')}
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171',
            borderRadius: 12,
            padding: '3px 9px',
            fontSize: 10.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
        >
          <ShieldCheck size={11} /> Security Audit
        </button>
        <button
          onClick={() => handleQuickAction('decision')}
          style={{
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            color: '#c084fc',
            borderRadius: 12,
            padding: '3px 9px',
            fontSize: 10.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
        >
          <Sparkles size={11} /> Record Decision
        </button>
        <button
          onClick={() => handleQuickAction('explain')}
          style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#34d399',
            borderRadius: 12,
            padding: '3px 9px',
            fontSize: 10.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
        >
          <Compass size={11} /> Explain
        </button>
      </div>

      {/* ── Screen Frame Radar Thumbnail Preview (if captured) ── */}
      {screenPreview && (
        <div style={{
          position: 'relative',
          padding: '6px 12px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <img
            src={screenPreview}
            alt="Screen capture"
            style={{
              width: 54,
              height: 34,
              borderRadius: 4,
              objectFit: 'cover',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
            }}
            onClick={() => setZoomModal(true)}
          />
          <div style={{ flex: 1, fontSize: 10, color: '#94a3b8' }}>
            <div>{screenMeta?.source || 'Screen Snapshot'} ({screenMeta?.time})</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <button
                onClick={handleExtractOcr}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: 10,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {ocrLoading ? 'OCR reading...' : 'OCR to Clipboard'}
              </button>
              <button
                onClick={() => setScreenPreview(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: 10,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification Banner ── */}
      {toastMessage && (
        <div style={{
          padding: '4px 12px',
          background: 'rgba(16, 185, 129, 0.2)',
          borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#34d399',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <CheckCircle2 size={12} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Chat Messages Stream Area ── */}
      <div style={{
        flex: 1,
        padding: '12px 14px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {messages.length === 0 && !streamText && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#64748b',
            textAlign: 'center',
            padding: '0 20px',
            gap: 10,
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Bot size={24} color="#818cf8" />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
              Companion Active
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.4 }}>
              I am monitoring <strong>{monitoredApp.appName}</strong>. Ask questions, click quick review chips, or drop files here.
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              background: m.role === 'user' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${m.role === 'user' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
              borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              padding: '8px 12px',
              fontSize: 12.5,
              color: '#f8fafc',
            }}
          >
            <CompanionMessageContent content={m.content} onApplyCode={handleApplyCodeToDisk} />
          </div>
        ))}

        {isStreaming && streamText && (
          <div style={{
            alignSelf: 'flex-start',
            maxWidth: '88%',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: '12px 12px 12px 2px',
            padding: '8px 12px',
            fontSize: 12.5,
            color: '#f8fafc',
          }}>
            <CompanionMessageContent content={streamText} onApplyCode={handleApplyCodeToDisk} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Bottom Input & Control Bar ── */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(255, 255, 255, 0.02)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const txt = input.trim()
            if (!txt || isStreaming) return
            setInput('')
            onSendPrompt?.(txt)
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            padding: '0 8px',
          }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'Listening to voice...' : 'Ask, drop files, or command companion...'}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                padding: '8px 4px',
                fontSize: 12,
                color: '#f8fafc',
                outline: 'none',
              }}
            />
            {listening && <AudioEqualizer active={true} color="#10b981" />}
          </div>
          <button
            type="button"
            onClick={toggleVoice}
            style={{
              background: listening ? '#10b981' : 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              color: '#fff',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            title={listening ? 'Stop listening' : 'Start voice input'}
          >
            {listening ? <Mic size={14} /> : <MicOff size={14} />}
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            style={{
              background: input.trim() && !isStreaming ? 'var(--accent, #6366f1)' : 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
              opacity: input.trim() && !isStreaming ? 1 : 0.5,
              transition: 'all 0.15s',
            }}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  )
}
