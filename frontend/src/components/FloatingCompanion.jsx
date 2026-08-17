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
  Repeat
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

// ─── Simple In-Companion Markdown & Code Block Formatter ────────────────────
function CompanionMessageContent({ content }) {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null)

  if (!content) return null

  // Split code blocks ```lang ... ``` vs plain text
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

  // Format bold, inline code, and lists
  const formatText = (txt) => {
    return txt.split('\n').map((line, lineIdx) => {
      // Bullet list item
      const isBullet = /^\s*[-*•]\s+(.*)/.test(line)
      const lineContent = isBullet ? line.replace(/^\s*[-*•]\s+/, '') : line

      // Process **bold** and `code` inline
      const tokens = []
      const inlineRegex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
      let cur = 0
      let m
      while ((m = inlineRegex.exec(lineContent)) !== null) {
        if (m.index > cur) tokens.push(lineContent.slice(cur, m.index))
        if (m[2]) {
          tokens.push(<strong key={m.index} style={{ color: 'var(--accent)', fontWeight: 600 }}>{m[2]}</strong>)
        } else if (m[3]) {
          tokens.push(
            <code key={m.index} style={{
              background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
              padding: '1px 4px',
              borderRadius: 3,
              fontFamily: 'monospace',
              fontSize: '0.9em',
              color: '#f472b6'
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
        }}>
          {isBullet && (
            <span style={{ position: 'absolute', left: 2, color: 'var(--accent)', fontSize: '0.9em' }}>•</span>
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
            background: 'var(--code-bg)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            borderRadius: 6,
            overflow: 'hidden',
            margin: '4px 0',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '3px 8px',
              background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
              borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
              fontSize: 9.5,
              color: 'var(--text-secondary)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}>
              <span>{p.lang}</span>
              <button
                onClick={() => handleCopyCode(idx, p.code)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copiedCodeIdx === idx ? 'var(--success)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 9.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '1px 4px',
                }}
              >
                {copiedCodeIdx === idx ? <Check size={10} /> : <Copy size={10} />}
                {copiedCodeIdx === idx ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre style={{
              margin: 0,
              padding: '6px 8px',
              fontSize: 11,
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              color: 'var(--text-primary)',
              overflowX: 'auto',
              whiteSpace: 'pre',
              lineHeight: 1.4,
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
  const [isCompact, setIsCompact] = useState(false)
  const [opacityLevel, setOpacityLevel] = useState(0.96) // 0.96 (Solid), 0.85 (Frosted), 0.72 (Translucent)
  // null = follow whatever the active window suggests. Showing all twelve
  // actions at once put more chrome above the chat than the chat itself had,
  // and the component already knows which category fits — using that beats
  // making the user filter by hand. An explicit tab click pins it.
  const [categoryFilter, setCategoryFilter] = useState(null) // null (auto) | 'all' | 'code' | 'write' | 'data' | 'autopilot'
  const [monitoredApp, setMonitoredApp] = useState({ appName: activeApp, title: activeTitle })
  // Ambient awareness. Off by default: it spends tokens and interrupts, so it
  // is something the user turns on, not something that happens to them.
  const [ambient, setAmbient] = useState(false)
  const ambientRef = useRef({ lastObservedAt: 0, lastSpokeAt: 0, spokenCount: 0, seen: null, seenAt: 0 })
  const [copiedId, setCopiedId] = useState(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrText, setOcrText] = useState(null)
  const [zoomModal, setZoomModal] = useState(false)

  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const lastSpokenMsgRef = useRef(null)

  const isDesktopEnv = typeof window !== 'undefined' && Boolean(window.__YOGATIK_COMPANION__)

  // Scroll to bottom on new messages or stream
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

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

  // Smart App Category Identification
  const detectedCategory = useMemo(() => {
    const name = (monitoredApp.appName || '').toLowerCase()
    const title = (monitoredApp.title || '').toLowerCase()
    if (/code|cursor|pycharm|webstorm|intellij|studio|sublime|vim|terminal|powershell|cmd|git|bash/i.test(name + title)) {
      return 'code'
    }
    if (/chrome|edge|firefox|safari|brave|arc|opera|browser/i.test(name + title)) {
      return 'data'
    }
    if (/word|doc|notion|slack|teams|outlook|gmail|discord|obsidian|notes/i.test(name + title)) {
      return 'write'
    }
    if (/excel|sheet|jupyter|tableau|powerbi|dbeaver|sql|postman/i.test(name + title)) {
      return 'data'
    }
    return 'autopilot'
  }, [monitoredApp])

  // Helper to build visual image attachment payload
  const buildAttachment = useCallback((dataUrl, width = 1280, height = 720) => {
    if (!dataUrl) return null
    return {
      name: `companion_screen_${Date.now()}.jpg`,
      dataUrl,
      thumb: dataUrl,
      width,
      height,
    }
  }, [])

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
      }
    } catch { /* ignore */ }
    finally {
      setOcrLoading(false)
    }
  }

  // Auto-Watch background periodic frame refresh
  useEffect(() => {
    if (!autoWatch) return
    const autoTimer = setInterval(() => {
      handleCaptureScreen(true)
    }, 10000)
    return () => clearInterval(autoTimer)
  }, [autoWatch, handleCaptureScreen])

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
      rec.onend = () => {
        setListening(false)
      }
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
        utterance.rate = 1.05
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
  }, [speechEnabled, isStreaming, messages, continuousVoice])

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

  const handleQuickAction = async (actionPrompt, autoIncludeScreen = true) => {
    let prefix = ''
    let imgPayload = null
    if (autoIncludeScreen) {
      const dataUrl = await handleCaptureScreen(true)
      if (dataUrl) {
        imgPayload = buildAttachment(dataUrl, screenMeta?.width, screenMeta?.height)
      }
      prefix = `[Context: Active Application is ${monitoredApp.appName} ("${monitoredApp.title}")] `
    }
    onSendPrompt?.(`${prefix}${actionPrompt}`, imgPayload)
  }


  // ── Ambient awareness ────────────────────────────────────────────────────
  // Noticing is cheap and frequent (a window title); speaking is rare and has
  // to clear every gate in companionAwareness. The prompt licenses silence and
  // a SILENT reply is dropped by App before it reaches the transcript, so the
  // common case costs one small call and says nothing.
  useEffect(() => {
    if (!ambient) return undefined
    const id = setInterval(async () => {
      const now = Date.now()
      const st = ambientRef.current
      if (!shouldObserve({ enabled: ambient, open: true, streaming: isStreaming, now, lastObservedAt: st.lastObservedAt })) return
      st.lastObservedAt = now

      const ctx = { appName: monitoredApp.appName, title: monitoredApp.title }
      const changed = contextChanged(st.seen, ctx)
      if (changed) { st.seen = ctx; st.seenAt = now; return }   // let it settle first

      if (!shouldSpeak({
        changed: !!st.seen && st.seenAt > (st.lastSpokeAt || 0),
        settledMs: now - (st.seenAt || now),
        streaming: isStreaming,
        userTyping: !!input.trim(),
        now,
        lastSpokeAt: st.lastSpokeAt,
        spokenCount: st.spokenCount,
      })) return

      st.lastSpokeAt = now
      st.spokenCount += 1
      let img = null
      try {
        const dataUrl = await handleCaptureScreen(true)
        if (dataUrl) img = buildAttachment(dataUrl, screenMeta?.width, screenMeta?.height)
      } catch { /* no screen source; the prompt still names the window */ }
      onSendPrompt?.(buildObservationPrompt(ctx), img)
    }, OBSERVE_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient, isStreaming, monitoredApp.appName, monitoredApp.title, input])

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!input.trim() || isStreaming) return
    const userPrompt = input.trim()
    setInput('')
    let imgPayload = null
    if (autoWatch || screenPreview) {
      const dataUrl = screenPreview || await handleCaptureScreen(true)
      if (dataUrl) {
        imgPayload = buildAttachment(dataUrl, screenMeta?.width, screenMeta?.height)
      }
    }
    onSendPrompt?.(userPrompt, imgPayload)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleCaptureScreen(true).then((dataUrl) => {
        const img = buildAttachment(dataUrl, screenMeta?.width, screenMeta?.height)
        if (input.trim()) {
          const userPrompt = input.trim()
          setInput('')
          onSendPrompt?.(userPrompt, img)
        }
      })
    } else if (e.key === 'Escape') {
      setIsCompact(c => !c)
    }
  }

  const copyMessage = (idx, text) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedId(idx)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const cycleOpacity = () => {
    if (opacityLevel === 0.96) setOpacityLevel(0.84)
    else if (opacityLevel === 0.84) setOpacityLevel(0.70)
    else setOpacityLevel(0.96)
  }

  const recentMessages = messages.slice(-8)

  const quickActionPills = [
    // Coding
    { cat: 'code', label: 'Debug Error', icon: <Code size={11} />, prompt: 'Inspect the code and error on my screen and generate the exact fix', color: '#f43f5e' },
    { cat: 'code', label: 'Explain Code', icon: <Terminal size={11} />, prompt: 'Explain the function, logic, and architecture visible on my screen', color: '#38bdf8' },
    { cat: 'code', label: 'Write Tests', icon: <CheckCircle2 size={11} />, prompt: 'Generate comprehensive unit tests for the functions visible on my screen', color: '#10b981' },
    { cat: 'code', label: 'Refactor Code', icon: <Cpu size={11} />, prompt: 'Refactor the code on my screen to make it cleaner, typed, and optimal', color: '#a855f7' },
    // Writing & Comms
    { cat: 'write', label: 'Draft Reply', icon: <Send size={11} />, prompt: 'Draft a professional, concise reply to the open conversation/email on my screen', color: '#3b82f6' },
    { cat: 'write', label: 'Polish Text', icon: <Sparkles size={11} />, prompt: 'Proofread and polish the text on my screen for clarity and executive impact', color: '#ec4899' },
    { cat: 'write', label: 'Key Takeaways', icon: <Compass size={11} />, prompt: 'Synthesize the key takeaways and decisions from this document/conversation', color: '#f59e0b' },
    // Data & Research
    { cat: 'data', label: 'Extract Table', icon: <FileText size={11} />, prompt: 'Extract all data tables and figures visible on my screen into clean Markdown/JSON', color: '#10b981' },
    { cat: 'data', label: 'Summarize Tab', icon: <Globe size={11} />, prompt: 'Summarize the article or web page currently open on my screen', color: '#eab308' },
    { cat: 'data', label: 'Analyze Chart', icon: <Activity size={11} />, prompt: 'Analyze the metrics, graphs, and trends displayed on my screen', color: '#06b6d4' },
    // Autopilot
    { cat: 'autopilot', label: 'Next Action', icon: <Zap size={11} />, prompt: 'Analyze what I am doing and propose the top 3 high-impact next steps', color: '#06b6d4' },
    { cat: 'autopilot', label: 'Make Diagram', icon: <Layers size={11} />, prompt: 'Create a Mermaid flowchart diagram representing what is on my screen', color: '#8b5cf6' },
  ]

  const effectiveCategory = categoryFilter ?? detectedCategory
  const filteredPills = effectiveCategory === 'all'
    ? quickActionPills
    : quickActionPills.filter(p => p.cat === effectiveCategory)

  // -------------------------------------------------------------
  // Compact Mini Pill / Dock View
  // -------------------------------------------------------------
  if (isCompact) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: `color-mix(in srgb, var(--bg-secondary) ${Math.round(opacityLevel * 100)}%, transparent)`,
        backdropFilter: 'blur(20px)',
        border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
        borderRadius: 12,
        color: 'var(--text-primary)',
        boxSizing: 'border-box',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <YogatikLogo size={20} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>AI COMPANION</span>
            <span style={{ fontSize: 9.5, color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {monitoredApp.appName}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={() => handleQuickAction('Inspect my active screen and tell me what to do next')}
            style={{
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              borderRadius: 6,
              color: 'var(--accent)',
              fontSize: 11,
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Sparkles size={11} /> Ask Screen
          </button>
          <button
            className="icon-btn"
            onClick={() => setIsCompact(false)}
            title="Expand Companion View"
            style={{ padding: 4, color: 'var(--text-secondary)' }}
          >
            <ChevronDown size={14} />
          </button>
          <button
            className="icon-btn"
            onClick={onExitCompanion}
            title="Expand to Full Workstation"
            style={{ padding: 4, color: 'var(--text-secondary)' }}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------
  // Full Companion View
  // -------------------------------------------------------------
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: `color-mix(in srgb, var(--bg-secondary) ${Math.round(opacityLevel * 100)}%, transparent)`,
      backdropFilter: 'blur(28px)',
      color: 'var(--text-primary)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      boxSizing: 'border-box',
      overflow: 'hidden',
      border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
      boxShadow: '0 16px 48px rgba(0,0,0,0.75)',
    }}>
      {/* 1. Companion Top Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',
        background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 4%, transparent))',
        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <YogatikLogo size={18} />
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--accent)' }}>
            AI COMPANION
          </span>
          <span style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 10,
            background: isDesktopEnv ? 'color-mix(in srgb, var(--success) 20%, transparent)' : 'color-mix(in srgb, var(--accent) 20%, transparent)',
            color: isDesktopEnv ? 'var(--success)' : 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontWeight: 700,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: isDesktopEnv ? 'var(--success)' : 'var(--accent)' }} />
            {isDesktopEnv ? 'OS DESKTOP' : 'WEB PiP'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' }}>
          {/* New Chat Button */}
          {onNewChat && (
            <button
              className="icon-btn"
              onClick={onNewChat}
              title="New Topic / Clean Slate"
              style={{ padding: 4, color: 'var(--text-secondary)' }}
            >
              <Plus size={13} />
            </button>
          )}

          {/* Opacity Selector */}
          <button
            className="icon-btn"
            onClick={cycleOpacity}
            title={`Opacity: ${Math.round(opacityLevel * 100)}% (Click to toggle translucency)`}
            style={{ padding: 4, color: opacityLevel < 0.9 ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            <Sliders size={13} />
          </button>

          {/* Voice Response Output Toggle */}
          <button
            className="icon-btn"
            onClick={() => setSpeechEnabled(s => !s)}
            title={speechEnabled ? 'Voice Output Enabled (Speaking answers)' : 'Enable Voice Response Audio'}
            style={{ padding: 4, color: speechEnabled ? 'var(--success)' : 'var(--text-muted)' }}
          >
            {speechEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>

          {/* Document PiP Pop-Out (Web mode) */}
          {isDocumentPipSupported() && onPopOutPip && (
            <button
              className="icon-btn"
              onClick={onPopOutPip}
              title="Pop out Always-on-Top Floating Window (Document Picture-in-Picture)"
              style={{ padding: 4, color: 'var(--accent)' }}
            >
              <ExternalLink size={13} />
            </button>
          )}

          {/* Compact Mini Mode */}
          <button
            className="icon-btn"
            onClick={() => setIsCompact(true)}
            title="Compact Mini Dock"
            style={{ padding: 4, color: 'var(--text-secondary)' }}
          >
            <ChevronUp size={14} />
          </button>

          {/* Maximize to full workstation */}
          <button
            className="icon-btn"
            onClick={onExitCompanion}
            title="Expand to Full Workstation"
            style={{ padding: 4, color: 'var(--text-secondary)' }}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* 2. Active App Monitor & Continuous Radar Strip */}
      <div style={{
        padding: '5px 12px',
        background: 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 11,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <Monitor size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>Watching:</span>
          <strong style={{
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={`${monitoredApp.appName} · ${monitoredApp.title}`}>
            {monitoredApp.appName} {monitoredApp.title ? `· ${monitoredApp.title}` : ''}
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {/* Auto-Watch Radar Toggle */}
          <button
            onClick={() => setAutoWatch(a => !a)}
            style={{
              background: autoWatch ? 'color-mix(in srgb, var(--success) 15%, transparent)' : 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
              border: `1px solid ${autoWatch ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
              borderRadius: 4,
              color: autoWatch ? 'var(--success)' : 'var(--text-secondary)',
              fontSize: 10,
              padding: '2px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title={autoWatch ? 'Auto-Watch is active (attaches visual screen frame on send)' : 'Enable Continuous Auto-Watch'}
          >
            {autoWatch ? <Eye size={10} /> : <EyeOff size={10} />}
            {autoWatch ? 'Live Vision' : 'Manual'}
          </button>

          {/* Ambient awareness. Opt-in on purpose: it spends tokens on a timer
              and can interrupt, so the user turns it on rather than meeting it. */}
          <button
            onClick={() => setAmbient(v => !v)}
            style={{
              background: ambient ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
              border: `1px solid ${ambient ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
              borderRadius: 4,
              color: ambient ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 10,
              padding: '2px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title={ambient
              ? 'Thinking ahead: watches what you switch to and speaks only when it has something useful'
              : 'Let the companion notice context changes and speak up when useful'}
          >
            <Zap size={10} />
            {ambient ? 'Thinking ahead' : 'Reactive'}
          </button>

          {/* Manual Snapshot Scan */}
          <button
            onClick={() => handleCaptureScreen(false)}
            disabled={scanning}
            style={{
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              borderRadius: 4,
              color: 'var(--accent)',
              fontSize: 10,
              padding: '2px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Capture screen snapshot now"
          >
            <Camera size={10} /> {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>

      {/* 3. Screen Preview Thumbnail Card (if captured) */}
      {screenPreview && (
        <div style={{
          position: 'relative',
          padding: '6px 12px',
          background: 'rgba(0,0,0,0.55)',
          borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setZoomModal(z => !z)}>
            <img
              src={screenPreview}
              alt="Screen Preview"
              style={{
                height: 42,
                borderRadius: 4,
                border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                display: 'block',
              }}
            />
            <div style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              background: 'rgba(0,0,0,0.7)',
              borderRadius: 2,
              padding: 1,
              color: 'var(--accent)',
            }}>
              <ZoomIn size={8} />
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--text-secondary)' }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              Screen Frame Ready
              <span style={{ fontSize: 8.5, padding: '0 4px', borderRadius: 3, background: 'var(--success)22', color: 'var(--success)' }}>Multimodal</span>
            </div>
            <div style={{ fontSize: 9.5, opacity: 0.8 }}>
              {screenMeta?.source || 'Display'} · {screenMeta?.time || 'Just now'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Quick OCR Extract */}
            <button
              onClick={handleExtractOcr}
              disabled={ocrLoading}
              style={{
                background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 9.5,
                padding: '3px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              title="Extract & Copy Text from screen snapshot"
            >
              <Copy size={9} /> {ocrLoading ? 'Reading...' : (ocrText ? 'Copied OCR' : 'Copy OCR')}
            </button>

            <button
              onClick={() => { setScreenPreview(null); setOcrText(null) }}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 3 }}
              title="Clear preview"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Screen Zoom Modal */}
      {zoomModal && screenPreview && (
        <div
          onClick={() => setZoomModal(false)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
          }}
        >
          <img
            src={screenPreview}
            alt="Screen Zoom"
            style={{ maxWidth: '100%', maxHeight: '80%', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)' }}
          />
          <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8 }}>Click anywhere to close</span>
        </div>
      )}

      {/* 4. Quick Action Category Pills */}
      <div style={{
        padding: '5px 10px 4px',
        display: 'flex',
        gap: 4,
        overflowX: 'auto',
        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
        flexShrink: 0,
      }}>
        {['all', 'code', 'write', 'data', 'autopilot'].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            style={{
              background: effectiveCategory === cat ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
              border: `1px solid ${effectiveCategory === cat ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 8%, transparent)'}`,
              color: effectiveCategory === cat ? 'var(--accent)' : 'var(--text-secondary)',
              borderRadius: 12,
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 8px',
              cursor: 'pointer',
              textTransform: 'capitalize',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            {cat === detectedCategory && <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />}
            {cat}
          </button>
        ))}
      </div>

      {/* Quick Action Buttons */}
      <div style={{
        display: 'flex',
        gap: 5,
        padding: '5px 10px 7px',
        overflowX: 'auto',
        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
        flexShrink: 0,
      }}>
        {filteredPills.map((pill, idx) => (
          <button
            key={idx}
            onClick={() => handleQuickAction(pill.prompt, true)}
            style={{
              background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
              border: `1px solid ${pill.color}33`,
              borderRadius: 8,
              color: pill.color,
              fontSize: 10.5,
              fontWeight: 500,
              padding: '3px 8px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {pill.icon} {pill.label}
          </button>
        ))}
      </div>

      {/* 5. Messages / Live Feed Stream */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        {recentMessages.length === 0 && !isStreaming && (
          <div style={{
            margin: 'auto',
            textAlign: 'center',
            color: 'var(--text-muted)',
            padding: 16,
          }}>
            <Bot size={28} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12.5 }}>Companion Ready</div>
            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Click any quick action pill above or type below.<br />
              Press <strong>Ctrl+Enter</strong> to capture screen &amp; analyze with multimodal AI.
            </div>
            {activeModel && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 10,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                fontSize: 10,
                color: 'var(--accent)'
              }}>
                <Sparkles size={10} /> Powered by {activeModel}
              </div>
            )}
          </div>
        )}

        {recentMessages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '94%',
              padding: '7px 11px',
              borderRadius: 8,
              background: m.role === 'user' ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
              border: m.role === 'user' ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
              color: 'var(--text-primary)',
              fontSize: 11.5,
              position: 'relative',
              wordBreak: 'break-word',
            }}
          >
            {m.image && (
              <img
                src={m.image}
                alt="Captured Screen"
                style={{
                  maxHeight: 70,
                  borderRadius: 4,
                  marginBottom: 6,
                  border: '1px solid color-mix(in srgb, var(--text-primary) 15%, transparent)',
                  display: 'block',
                }}
              />
            )}
            <CompanionMessageContent content={m.content} />
            {m.role === 'assistant' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  onClick={() => copyMessage(idx, m.content)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 9.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: 0,
                  }}
                  title="Copy message"
                >
                  {copiedId === idx ? <CheckCircle2 size={10} color="var(--success)" /> : <Copy size={10} />}
                  {copiedId === idx ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        ))}

        {isStreaming && (
          <div style={{
            alignSelf: 'flex-start',
            maxWidth: '94%',
            padding: '7px 11px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
            color: 'var(--text-primary)',
            fontSize: 11.5,
            wordBreak: 'break-word',
          }}>
            <CompanionMessageContent content={streamText || 'Reasoning & piloting...'} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 6. Companion Input Bar */}
      <form onSubmit={handleSubmit} style={{
        padding: '7px 10px',
        background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
        borderTop: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
      }}>
        {/* Voice Dictation */}
        <button
          type="button"
          onClick={toggleVoice}
          style={{
            background: listening ? 'var(--error)' : 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
            borderRadius: '50%',
            width: 28,
            height: 28,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
          }}
          title={listening ? 'Listening... click to stop' : 'Voice dictation'}
        >
          {listening && (
            <span style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: '2px solid var(--error)',
              animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
            }} />
          )}
          {listening ? <MicOff size={13} /> : <Mic size={13} />}
        </button>

        {/* Text Input */}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening to voice...' : 'Command AI companion (Ctrl+Enter to scan)...'}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11.5,
            color: '#fff',
            outline: 'none',
          }}
        />

        {/* Continuous Voice Loop Toggle */}
        <button
          type="button"
          onClick={() => setContinuousVoice(c => !c)}
          style={{
            background: continuousVoice ? 'color-mix(in srgb, var(--success) 20%, transparent)' : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
            border: `1px solid ${continuousVoice ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 8%, transparent)'}`,
            borderRadius: 6,
            width: 28,
            height: 28,
            color: continuousVoice ? 'var(--success)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title={continuousVoice ? 'Hands-Free Conversational Voice Loop is ON' : 'Turn on Continuous Hands-Free Voice Loop'}
        >
          <Repeat size={12} />
        </button>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          style={{
            background: 'linear-gradient(135deg, var(--accent), #818cf8)',
            border: 'none',
            borderRadius: 6,
            width: 28,
            height: 28,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: (!input.trim() || isStreaming) ? 0.4 : 1,
            flexShrink: 0,
          }}
          title="Send command"
        >
          <Send size={12} />
        </button>
      </form>
    </div>
  )
}
