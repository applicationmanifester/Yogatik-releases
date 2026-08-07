import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Plus, Sun, Moon, Upload, Menu, X, Trash2, Plug, LogIn, LogOut, User, Square, Download, Sparkles, Mic, MicOff, Wrench, Smartphone, AlertTriangle, Globe, FileText, Search, Pencil, RefreshCw, ChevronDown } from 'lucide-react'
import { streamMessage, stopGeneration, uploadDocument, getModels, removeProvider, testProvider, saveProviderApiKey, logout, getMe, getConversations, getConversation, deleteConversation, exportConversation, getTemplates, requestTTS, stopTTS, listDocuments, removeDocument, createConversation, saveMessage, renameConversation, trimConversationFrom, getActiveProvider, setActiveProvider, getActiveModel, setActiveModel, getAllProviderStatus, ensureTested, getTools, setToolEnabled, setToolsEnabledBulk, getPrefs, setPref } from './api'
import { ArtifactPanel } from './components/ArtifactPanel'
import { YogatikLogo } from './components/YogatikLogo'
import { ToolResultCard, TOOL_ICONS } from './components/ToolResultCard'
import { MessageBubble } from './components/MessageBubble'
import { AuthModal } from './components/AuthModal'
import { ProviderModal } from './components/ProviderModal'
import { AdModal } from './components/AdModal'
import { Modal } from './components/Modal'

// Messages rendered at once; older turns load on demand.
const WINDOW_STEP = 40

/** 329189ms is unreadable; 5m 29s is not. */
function formatLatency(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  return `${m}m ${Math.round((ms % 60000) / 1000)}s`
}

const SUGGESTIONS = [
  "What's the weather in New York?",
  "Generate an image of a futuristic city",
  "Translate 'hello world' to Japanese",
  "Calculate the square root of 144",
  "Search the web for today's AI news",
  "Summarize this YouTube video",
]

// ─── Main App ───
export default function App() {
  const [conversations, setConversations] = useState([{ id: null, title: 'New Chat', messages: [] }])
  const [activeArtifact, setActiveArtifact] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingIdx, setStreamingIdx] = useState(null)
  const [statusText, setStatusText] = useState('')
  const [currentStreamId, setCurrentStreamId] = useState(null)
  const [theme, setTheme] = useState(localStorage.getItem('bgkai_theme') || 'dark')
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)
  const [provider, setProviderState] = useState('groq')
  const [model, setModel] = useState('')
  const [webSearch, setWebSearchState] = useState(true)
  const [tools, setToolsEnabledState] = useState(true)
  const [temperature, setTemperatureState] = useState(0.7)
  const [models, setModels] = useState({})
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [user, setUser] = useState(null)
  const [promptTemplates, setPromptTemplates] = useState([])
  const [activeTemplate, setActiveTemplate] = useState('default')
  const [isListening, setIsListening] = useState(false)
  const [activeTools, setActiveTools] = useState([])
  const [pendingToolResults, setPendingToolResults] = useState({})
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [attachedFile, setAttachedFile] = useState(null)
  const [docs, setDocs] = useState([])
  const [convQuery, setConvQuery] = useState('')
  const [providerStatus, setProviderStatus] = useState({})
  const [verifying, setVerifying] = useState(false)
  const [toolPrefs, setToolPrefs] = useState([])
  const [showToolPicker, setShowToolPicker] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(() => window.innerWidth > 900)
  const [renamingIdx, setRenamingIdx] = useState(null)
  const [renameText, setRenameText] = useState('')
  const [visibleCount, setVisibleCount] = useState(WINDOW_STEP)
  const [editingProvider, setEditingProvider] = useState(null)
  const [pwaPrompt, setPwaPrompt] = useState(null)
  const [showPwaInstall, setShowPwaInstall] = useState(false)
  const [showAd, setShowAd] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const chatCountRef = useRef(0)
  const messagesEnd = useRef(null)
  const textareaRef = useRef(null)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const recognitionRef = useRef(null)

  const conv = conversations[activeIdx]

  // Provider/model must be persisted: the agent reads them from IndexedDB, so
  // React-only state meant every message silently went to the stored default.
  const setProvider = useCallback((id) => {
    setProviderState(id)
    setActiveProvider(id).catch(() => {})
  }, [])
  const chooseModel = useCallback((m) => {
    setModel(m)
    setActiveModel(provider, m).catch(() => {})
  }, [provider])

  // Chat preferences persist across reloads like provider and model do.
  const setTemperature = useCallback((v) => {
    setTemperatureState(v)
    setPref('temperature', v).catch(() => {})
  }, [])
  const setWebSearch = useCallback((v) => {
    setWebSearchState(v)
    setPref('web_search', v).catch(() => {})
  }, [])
  const setToolsEnabled = useCallback((v) => {
    setToolsEnabledState(v)
    setPref('tools_enabled', v).catch(() => {})
  }, [])

  // Only the tail of a long conversation is mounted; older turns stay in state
  // (and IndexedDB) but are not rendered until asked for. Keeps a 500-message
  // chat as cheap to paint as a fresh one.
  const allMessages = conv?.messages || []
  const shownMessages = allMessages.length > visibleCount
    ? allMessages.slice(-visibleCount)
    : allMessages
  const hiddenCount = allMessages.length - shownMessages.length
  // A reply streams into the conversation it was sent from, even if the user
  // navigates away mid-answer.
  const isStreamingHere = streamingIdx === activeIdx

  // Streaming tokens arrive faster than the browser can paint. Coalesce them
  // into one state update per animation frame instead of one per token.
  const streamFrame = useRef(0)
  const streamPending = useRef('')
  const pushStream = useCallback((text) => {
    streamPending.current = text
    if (streamFrame.current) return
    streamFrame.current = requestAnimationFrame(() => {
      streamFrame.current = 0
      setStreamingContent(streamPending.current)
    })
  }, [])
  useEffect(() => () => { if (streamFrame.current) cancelAnimationFrame(streamFrame.current) }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('bgkai_theme', theme)
  }, [theme])
  useEffect(() => { if (isStreamingHere || !loading) messagesEnd.current?.scrollIntoView({ behavior: streamingContent ? 'auto' : 'smooth' }) }, [conv?.messages, streamingContent, isStreamingHere, loading])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setPwaPrompt(e); setShowPwaInstall(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const installPwa = async () => {
    if (!pwaPrompt) return
    pwaPrompt.prompt()
    const result = await pwaPrompt.userChoice
    if (result.outcome === 'accepted') setShowPwaInstall(false)
    setPwaPrompt(null)
  }

  useEffect(() => {
    refreshModels()
  }, [provider])

  // Verify the *selected* model automatically. Asking the user to remember a
  // Test button meant a green badge could describe a model they had since
  // changed away from.
  useEffect(() => {
    if (!models[provider]?.available) return
    const target = model || models[provider]?.default_model
    if (!target) return

    let cancelled = false
    const t = setTimeout(async () => {
      setVerifying(true)
      try {
        await ensureTested(provider, target)   // cached for 30 min per model
        if (!cancelled) setProviderStatus(await getAllProviderStatus())
      } finally {
        if (!cancelled) setVerifying(false)
      }
    }, 500)   // debounce: typing in the model box shouldn't fire a test per keystroke

    return () => { cancelled = true; clearTimeout(t); setVerifying(false) }
  }, [provider, model, models[provider]?.available, models[provider]?.default_model])

  useEffect(() => {
    refreshModels()
    refreshTemplates()
    refreshDocs()
    // Conversations live in IndexedDB and belong to this device, not to an
    // account — load them whether or not the user has signed in.
    loadConversations()
    getMe().then(u => { if (u) setUser(u) }).catch(() => {})
    getActiveProvider().then(async (p) => {
      setProviderState(p)
      setModel(await getActiveModel(p))
      setProviderStatus(await getAllProviderStatus())
    }).catch(() => {})
    getPrefs().then(pref => {
      if (pref.temperature != null) setTemperatureState(pref.temperature)
      if (pref.web_search != null) setWebSearchState(pref.web_search)
      if (pref.tools_enabled != null) setToolsEnabledState(pref.tools_enabled)
      if (pref.persona) setActiveTemplate(pref.persona)
    }).catch(() => {})
    refreshToolPrefs()
    // Init Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SR()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
        setInput(transcript)
      }
      recognition.onend = () => setIsListening(false)
      recognition.onerror = () => setIsListening(false)
      recognitionRef.current = recognition
    }
    // Global Keyboard Shortcuts
    const handleGlobalKeyDown = (e) => {
      // Ctrl+Shift+O or Cmd+Shift+O -> New Chat
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault()
        newChat()
      }
      // Escape -> Stop generation
      if (e.key === 'Escape' && loading) {
        e.preventDefault()
        handleStop()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [loading])

  // One fetch, not two: getProviders() is an alias of getModels() and the
  // second call only fed state nothing ever read.
  const refreshModels = () => {
    getModels().then(setModels).catch(() => {})
  }

  const refreshTemplates = () => {
    getTemplates().then(setPromptTemplates).catch(() => {})
  }

  const refreshDocs = useCallback(() => {
    listDocuments().then(setDocs).catch(() => {})
  }, [])

  const refreshToolPrefs = useCallback(() => {
    getTools().then(setToolPrefs).catch(() => {})
  }, [])

  const toggleTool = async (name, enabled) => {
    await setToolEnabled(name, enabled)
    refreshToolPrefs()
  }

  const toggleToolGroup = async (group, enabled) => {
    const names = toolPrefs.filter(t => t.group === group).map(t => t.name)
    await setToolsEnabledBulk(names, enabled)
    refreshToolPrefs()
  }

  const hydrate = (m) => ({
    role: m.role, content: m.content,
    sources: m.sources || [],
    toolResults: m.toolResults || undefined,
  })

  const loadConversations = async () => {
    const convs = await getConversations()
    if (!convs.length) return
    const first = await getConversation(convs[0].id)
    const mapped = convs.map((c, i) => ({
      id: c.id, title: c.title,
      messages: i === 0 && first ? first.messages.map(hydrate) : [],
    }))
    setConversations([...mapped, { id: null, title: 'New Chat', messages: [] }])
    setActiveIdx(0)
  }

  const handleAuth = (userData) => { setUser(userData); loadConversations() }

  const autoResize = useCallback(() => {
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 280) + 'px' }
  }, [])

  const newChat = () => {
    setVisibleCount(WINDOW_STEP)
    setConversations(prev => [...prev, { id: null, title: 'New Chat', messages: [] }])
    setActiveIdx(conversations.length)
  }

  const switchChat = async (idx) => {
    setActiveIdx(idx)
    setVisibleCount(WINDOW_STEP)
    const c = conversations[idx]
    if (c.id && c.messages.length === 0) {
      const full = await getConversation(c.id)
      if (full) {
        setConversations(prev => prev.map((conv, i) =>
          i === idx ? { ...conv, messages: full.messages.map(hydrate) } : conv
        ))
      }
    }
  }

  const deleteChat = async (idx) => {
    const c = conversations[idx]
    if (c.id) { try { await deleteConversation(c.id) } catch {} }
    setVisibleCount(WINDOW_STEP)
    setConversations(prev => {
      const next = prev.filter((_, i) => i !== idx)
      // Always keep one empty chat to land in, rather than appending a new one
      // beside the row we just deleted.
      return next.length ? next : [{ id: null, title: 'New Chat', messages: [] }]
    })
    setActiveIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev))
  }

  const handleExport = async () => {
    if (!conv.id) {
      const md = conv.messages.map(m => `**${m.role === 'user' ? 'You' : 'Yogatik'}**:\n\n${m.content}`).join('\n\n---\n\n')
      const blob = new Blob([md], { type: 'text/markdown' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${conv.title}.md`; a.click()
      return
    }
    try {
      const data = await exportConversation(conv.id)
      const blob = new Blob([data.content], { type: 'text/markdown' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = data.filename; a.click()
    } catch { alert('Export failed') }
  }

  const handleStop = async () => {
    if (currentStreamId) { await stopGeneration(currentStreamId); setCurrentStreamId(null) }
  }

  const [apiKeyInput, setApiKeyInput] = useState({})
  const [savingApiKey, setSavingApiKey] = useState(null)
  const [errorModalMsg, setErrorModalMsg] = useState(null)

  const handleAddApiKey = async (pid) => {
    const keyToSave = apiKeyInput[pid]
    if (!keyToSave || !keyToSave.trim()) {
      setErrorModalMsg(`Please enter a valid API Key for ${models[pid]?.name || pid}.`)
      return
    }
    setSavingApiKey(pid)
    try {
      await saveProviderApiKey(pid, keyToSave.trim())
      const testRes = await testProvider(pid)
      setSavingApiKey(null)
      setProviderStatus(await getAllProviderStatus())
      if (testRes.success) {
        refreshModels()
        setApiKeyInput(prev => ({ ...prev, [pid]: '' }))
      } else {
        setErrorModalMsg(`Could not connect to ${models[pid]?.name || pid}:\n\n${testRes.error}`)
      }
    } catch (err) {
      setSavingApiKey(null)
      setErrorModalMsg(`Failed to save API Key for ${models[pid]?.name || pid}:\n${err.message}`)
    }
  }

  const retestProvider = async (pid) => {
    setSavingApiKey(pid)
    await testProvider(pid, model || undefined).catch(() => {})
    setProviderStatus(await getAllProviderStatus())
    setSavingApiKey(null)
    refreshModels()
  }

  const handleRemoveProvider = async (pid) => {
    if (!confirm(`Remove "${pid}"?`)) return
    try { await removeProvider(pid); refreshModels(); if (provider === pid) setProvider('gemini') }
    catch (e) { alert(e.message) }
  }

  const toggleVoice = () => {
    if (!recognitionRef.current) return
    if (isListening) { recognitionRef.current.stop(); setIsListening(false) }
    else { recognitionRef.current.start(); setIsListening(true) }
  }

  const handleTTS = async (text) => {
    // Web Speech API speaks directly — there is no audio file to fetch.
    if (ttsPlaying) { stopTTS(); setTtsPlaying(false); return }
    try {
      setTtsPlaying(true)
      const result = await requestTTS(text.slice(0, 5000), { onEnd: () => setTtsPlaying(false) })
      if (!result?.success) setTtsPlaying(false)
    } catch { setTtsPlaying(false); console.error('TTS failed') }
  }

  const getSystemPrompt = () => {
    const t = promptTemplates.find(t => t.id === activeTemplate)
    return t?.system_prompt || null
  }

  const send = async (text = input) => {
    if ((!text.trim() && !attachedFile) || loading) return
    if (!navigator.onLine) {
      setErrorModalMsg("You're offline. Yogatik needs a connection to reach the model provider — your chats and documents are safe on this device.")
      return
    }
    const msgText = text.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)
    setStreamingContent('')
    setStreamingIdx(activeIdx)   // the stream belongs to THIS conversation
    setStatusText('Connecting...')
    setCurrentStreamId(null)
    setActiveTools([])
    setPendingToolResults({})

    let fileContext = ''
    if (attachedFile) {
      setStatusText(`Reading ${attachedFile.name}...`)
      try {
        const result = await uploadDocument(attachedFile)
        if (!result.success) {
          fileContext = `[Could not read ${attachedFile.name}: ${result.error}] `
        } else if (result.inline) {
          // Small enough to read directly — no retrieval round-trip needed.
          fileContext = `[Document: ${result.name}]\n"""\n${result.inline}\n"""\n\n`
        } else {
          fileContext = `[Document "${result.name}" indexed: ${result.chars.toLocaleString()} chars in ${result.chunks} passages. `
            + `Use doc_search to retrieve relevant parts.] `
        }
      } catch (err) {
        fileContext = `[File upload failed: ${err.message}] `
      }
      setAttachedFile(null)
      refreshDocs()
    }

    const finalText = fileContext + (msgText || 'Process the attached file')
    const displayText = msgText || (attachedFile ? `📎 ${attachedFile.name}` : '')
    const userMsg = { role: 'user', content: displayText, sources: [] }
    const updated = { ...conv, messages: [...conv.messages, userMsg] }
    const isNewTitle = updated.title === 'New Chat'
    if (isNewTitle) updated.title = (msgText || displayText).trim().slice(0, 40) || 'New Chat'

    // Persist as we go — a refresh mid-answer must not lose the exchange.
    let convId = conv.id
    try {
      if (!convId) {
        convId = await createConversation(updated.title)
        updated.id = convId
      } else if (isNewTitle) {
        await renameConversation(convId, updated.title)
      }
      await saveMessage(convId, userMsg)
    } catch (e) { console.error('Failed to persist message', e) }

    setConversations(prev => prev.map((c, i) => i === activeIdx ? updated : c))

    let content = ''
    let sources = []
    let toolsUsed = []

    await streamMessage(
      { message: finalText, messages: updated.messages, tools, use_tools: tools, use_web_search: webSearch,
        system_prompt: getSystemPrompt(), temperature, model: model || undefined, channel: 'chat' },
      (token) => { content += token; pushStream(content); setStatusText('') },
      (s) => { sources = s },
      (_final, meta) => {
        setStatusText('')
        setCurrentStreamId(null)
        if (!content.trim() && meta?.aborted) { setStreamingContent(''); setActiveTools([]); setPendingToolResults({}); return }
        const assistantMsg = {
          role: 'assistant',
          content: meta?.aborted ? content + '\n\n_[stopped]_' : content,
          sources, toolResults: { ...pendingToolResults }, toolsUsed,
        }
        saveMessage(convId, assistantMsg).catch(e => console.error('Failed to persist reply', e))
        setConversations(prev => prev.map((c, i) =>
          i === activeIdx ? { ...c, id: convId, messages: [...updated.messages, assistantMsg] } : c
        ))
        setStreamingContent('')
        setActiveTools([])
        setPendingToolResults({})
        // Show ad every 3 chats
        chatCountRef.current++
        if (chatCountRef.current % 10 === 0) setShowAd(true)
      },
      (err) => {
        setStatusText('')
        setCurrentStreamId(null)
        const errMsg = { role: 'assistant', content: `Error: ${err}`, sources: [] }
        saveMessage(convId, errMsg).catch(() => {})
        setConversations(prev => prev.map((c, i) =>
          i === activeIdx ? { ...c, id: convId, messages: [...updated.messages, errMsg] } : c
        ))
        setStreamingContent('')
      },
      (status) => { setStatusText(status) },
      (streamId) => { setCurrentStreamId(streamId) },
      (detectedTools) => { setActiveTools(detectedTools) },
      (toolName, toolResult) => {
        setPendingToolResults(prev => ({ ...prev, [toolName]: toolResult }))
      }
    )
    setLoading(false)
    setStreamingIdx(null)
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachedFile(file)
    e.target.value = ''
  }

  const handleEnhancePrompt = async () => {
    if (!input.trim() || isEnhancing) return
    setIsEnhancing(true)
    try {
      const promptToEnhance = input.trim()
      let enhanced = ''
      await streamMessage(
        {
          message: `Enhance and expand the following short user prompt into a clear, detailed, structured prompt for an AI assistant. Output ONLY the enhanced prompt text, without any conversational filler or quotes:\n\n"${promptToEnhance}"`,
          provider,
          model: model || undefined,
          use_web_search: false,
          use_tools: false,
          temperature: 0.7,
          channel: 'enhance',
        },
        (token) => { enhanced += token; setInput(enhanced) }, // onToken
        () => {}, // onSources
        () => {}, // onDone
        () => {}, // onError
        () => {}, // onStatus
        () => {}, // onStreamId
        () => {}, // onToolsDetected
        () => {}  // onToolResult
      )
    } catch {
      // Ignored
    } finally {
      setIsEnhancing(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      send()
    }
  }

  const regenerate = async () => {
    if (loading) return
    const msgs = conv?.messages || []
    let lastUser = -1
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'user') { lastUser = i; break } }
    if (lastUser < 0) return
    const prompt = msgs[lastUser].content
    // Rewind local state to just before that turn; the stored rows are rebuilt
    // on the next save, and stale trailing rows are pruned here.
    const kept = msgs.slice(0, lastUser)
    setConversations(prev => prev.map((c, i) => i === activeIdx ? { ...c, messages: kept } : c))
    if (conv?.id) { try { await trimConversationFrom(conv.id, lastUser) } catch {} }
    send(prompt)
  }

  const startRename = (idx) => {
    setRenamingIdx(idx)
    setRenameText(conversations[idx].title)
  }

  const commitRename = async () => {
    const idx = renamingIdx
    const title = renameText.trim()
    setRenamingIdx(null)
    if (idx == null || !title) return
    setConversations(prev => prev.map((c, i) => i === idx ? { ...c, title } : c))
    const id = conversations[idx]?.id
    if (id) { try { await renameConversation(id, title) } catch {} }
  }

  const providerEntries = Object.entries(models)
  const providerModels = models[provider]?.models || []

  // Conversation filter — matches title and message text
  const visibleConvs = conversations
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => {
      if (!convQuery.trim()) return true
      const q = convQuery.toLowerCase()
      return c.title.toLowerCase().includes(q) ||
        c.messages.some(m => (m.content || '').toLowerCase().includes(q))
    })

  return (
    <div className="app">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><YogatikLogo size={28} /> Yogatik</h2>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={16} /></button>
        </div>

        <div className="auth-section">
          {user ? (
            <div className="user-info">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
              ) : (
                <User size={14} />
              )}
              <span>{user.displayName || user.email}</span>
              <button className="icon-btn" onClick={() => { logout(); setUser(null); setConversations([{ id: null, title: 'New Chat', messages: [] }]); setActiveIdx(0) }} title="Sign out">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button className="auth-btn" onClick={() => setShowAuthModal(true)} aria-label="Sign in">
              <LogIn size={14} /> Sign In
            </button>
          )}
        </div>

        <button className="new-chat-btn" onClick={newChat} aria-label="New chat"><Plus size={14} /> New Chat</button>

        {conversations.length > 3 && (
          <div className="conv-search">
            <Search size={12} />
            <input value={convQuery} onChange={e => setConvQuery(e.target.value)}
              placeholder="Search chats..." aria-label="Search conversations" />
            {convQuery && (
              <button className="icon-btn" onClick={() => setConvQuery('')} aria-label="Clear search"><X size={11} /></button>
            )}
          </div>
        )}

        <div className="sidebar-scroll">
        <div className="conversation-list">
          {visibleConvs.map(({ c, i }) => (
            <div key={i} className={`conversation-item ${i === activeIdx ? 'active' : ''}`}
              onClick={() => switchChat(i)} onDoubleClick={() => startRename(i)}>
              {renamingIdx === i ? (
                <input className="conv-rename" autoFocus value={renameText}
                  onChange={e => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingIdx(null)
                  }} />
              ) : (
                <span className="conv-title" title={c.title}>{c.title}</span>
              )}
              {i === activeIdx && renamingIdx !== i && (
                <span className="conv-actions">
                  <button className="icon-btn" onClick={e => { e.stopPropagation(); startRename(i) }} aria-label="Rename conversation">
                    <Pencil size={11} />
                  </button>
                  <button className="icon-btn conv-delete" onClick={e => { e.stopPropagation(); deleteChat(i) }} aria-label="Delete conversation">
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </div>
          ))}
          {convQuery && visibleConvs.length === 0 && (
            <div className="conv-empty">No chats match "{convQuery}"</div>
          )}
        </div>
        </div>

        <div className={`settings ${settingsOpen ? 'open' : 'closed'}`}>
          <button className="settings-toggle" onClick={() => setSettingsOpen(v => !v)}
            aria-expanded={settingsOpen} aria-controls="settings-body">
            <span className="settings-toggle-main">
              <Plug size={12} />
              <span>{models[provider]?.name || provider}</span>
              <span className={`conn-dot conn-dot-inline conn-${providerStatus[provider]?.state || 'no-key'}`} />
            </span>
            <ChevronDown size={14} className={settingsOpen ? 'chev open' : 'chev'} />
          </button>

          <div className="settings-body" id="settings-body" hidden={!settingsOpen}>
          <label><Sparkles size={12} /> Persona</label>
          <select value={activeTemplate} aria-label="Persona" onChange={e => { setActiveTemplate(e.target.value); setPref('persona', e.target.value).catch(() => {}) }}>
            {promptTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <label style={{ margin: 0 }}>Provider</label>
            <button className="small-btn" onClick={() => setShowProviderModal(true)} title="Add custom API">
              <Plus size={11} /> Custom
            </button>
          </div>
          <select value={provider} aria-label="Provider" onChange={e => { setProvider(e.target.value); chooseModel('') }}>
            {providerEntries.map(([key, val]) => (
              <option key={key} value={key}>
                {val.name || key}
              </option>
            ))}
          </select>

          {(() => {
            const st = providerStatus[provider] || {}
            const label = verifying ? 'Checking model…' : ({
              connected: 'Ready', failed: 'Not working',
              untested: 'Key saved — checking…', 'no-key': 'No API key',
            }[st.state] || 'No API key')
            return (
              <div className={`conn-status conn-${verifying ? 'testing' : (st.state || 'no-key')}`}>
                <span className="conn-dot" />
                <span className="conn-label">{label}</span>
                {!verifying && st.state === 'connected' && st.latencyMs != null && (
                  <span className="conn-meta">
                    {formatLatency(st.latencyMs)}
                    {st.latencyMs > 15000 ? ' — very slow' : ''}
                  </span>
                )}
                {st.hasKey && (
                  <button className="small-btn" onClick={() => retestProvider(provider)}
                    disabled={savingApiKey === provider || verifying} aria-label="Re-check this model">
                    Retest
                  </button>
                )}
              </div>
            )
          })()}
          {providerStatus[provider]?.error && (
            <div className="conn-error">{providerStatus[provider].error}</div>
          )}

          <label>API Key {models[provider]?.key_url && <a href={models[provider].key_url} target="_blank" rel="noopener" style={{fontSize:10,color:'var(--accent)'}}>(get free key)</a>}</label>
          <input type="password" placeholder="Enter API key..."
            value={apiKeyInput[provider] !== undefined ? apiKeyInput[provider] : ''}
            onChange={e => setApiKeyInput({ ...apiKeyInput, [provider]: e.target.value })}
            style={{ width:'100%',padding:'6px 8px',background:'var(--bg-input)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text-primary)',fontSize:'12px',marginBottom:'8px' }}
          />

          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            <button className="small-btn btn-primary" onClick={() => handleAddApiKey(provider)} disabled={savingApiKey === provider}>
              <Plus size={11} /> {savingApiKey === provider ? 'Verifying...' : 'Add Key'}
            </button>
            <button className="small-btn" onClick={() => { setShowProviderModal(true); setEditingProvider(provider) }} title="Edit provider details">
              <Plug size={11} /> Edit
            </button>
            <button className="small-btn" onClick={() => handleRemoveProvider(provider)} title="Remove provider" style={{ color: '#ff4444' }}>
              <Trash2 size={11} /> Remove
            </button>
          </div>

          <label>Model {providerModels.length > 0 && <span style={{opacity:.6}}>({providerModels.length})</span>}</label>
          <input list="model-options" value={model} onChange={e => chooseModel(e.target.value)}
            placeholder={`Auto (${models[provider]?.default_model || 'default'}) — type to filter`}
            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', marginBottom: '8px' }} />
          <datalist id="model-options">
            {providerModels.map(m => <option key={m} value={m} />)}
          </datalist>
          {model && !providerModels.includes(model) && (
            <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: -4, marginBottom: 8 }}>
              Not in this provider's catalog — will be sent as-is.
              <button className="small-btn" style={{ marginLeft: 6 }} onClick={() => chooseModel('')}>Reset</button>
            </div>
          )}

          <label>Temperature: {temperature}</label>
          <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
          <div className="toggle-row">
            <label><Wrench size={12} /> AI Tools</label>
            <label className="toggle" aria-label="Toggle AI tools">
              <input type="checkbox" checked={tools} onChange={e => setToolsEnabled(e.target.checked)} /><span className="slider" />
            </label>
          </div>
          {tools && (
            <>
              <button className="small-btn tool-picker-toggle" onClick={() => setShowToolPicker(v => !v)}>
                {showToolPicker ? 'Hide' : 'Choose'} tools
                <span className="tool-count">
                  {toolPrefs.filter(t => t.enabled).length}/{toolPrefs.length}
                </span>
              </button>
              {showToolPicker && (
                <div className="tool-picker">
                  {[...new Set(toolPrefs.map(t => t.group))].map(group => {
                    const inGroup = toolPrefs.filter(t => t.group === group)
                    const allOn = inGroup.every(t => t.enabled)
                    return (
                      <div key={group} className="tool-group">
                        <div className="tool-group-head">
                          <span>{group}</span>
                          <button className="link-btn" onClick={() => toggleToolGroup(group, !allOn)}>
                            {allOn ? 'none' : 'all'}
                          </button>
                        </div>
                        {inGroup.map(t => (
                          <label key={t.name} className="tool-check">
                            <input type="checkbox" checked={t.enabled}
                              onChange={e => toggleTool(t.name, e.target.checked)} />
                            <span>{t.name.replace(/_/g, ' ')}</span>
                          </label>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
          <div className="toggle-row">
            <label><Globe size={12} /> Web Research</label>
            <label className="toggle" aria-label="Toggle web research">
              <input type="checkbox" checked={webSearch} disabled={!tools}
                onChange={e => setWebSearch(e.target.checked)} /><span className="slider" />
            </label>
          </div>
          {docs.length > 0 && (
            <div className="doc-list">
              <label><FileText size={12} /> Documents ({docs.length})</label>
              {docs.map(d => (
                <div key={d.id} className="doc-item">
                  <span className="doc-name" title={`${d.chars.toLocaleString()} chars · ${d.chunks.length} passages`}>{d.name}</span>
                  <button className="icon-btn" aria-label={`Remove ${d.name}`}
                    onClick={() => removeDocument(d.id).then(refreshDocs)}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!sidebarOpen && <button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={18} /></button>}
            <h1>{conv?.title || 'New Chat'}</h1>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={handleExport} title="Export chat" aria-label="Export chat"><Download size={18} /></button>
            <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="messages">
          {allMessages.length === 0 && !isStreamingHere ? (
            <div className="welcome">
              <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}><YogatikLogo size={48} /> Yogatik</h1>
              <p>AI assistant with live web research, document Q&A, image generation, code execution, weather, translation, TTS and 32 free tools — all running in your browser.</p>
              {showPwaInstall && (
                <button className="pwa-install-btn" onClick={installPwa}>
                  <Smartphone size={16} /> Install App
                </button>
              )}
              <div className="tool-badges">
                {Object.entries(TOOL_ICONS).map(([name, Icon]) => (
                  <span key={name} className="tool-badge"><Icon size={14} /> {name.replace('_', ' ')}</span>
                ))}
              </div>
              {!user && <p className="welcome-hint">Sign in to save your chat history across sessions.</p>}
              <div className="suggestions">
                {SUGGESTIONS.map((s, i) => <div key={i} className="suggestion" onClick={() => send(s)}>{s}</div>)}
              </div>
            </div>
          ) : (
            <>
              {hiddenCount > 0 && (
                <button className="load-earlier" onClick={() => setVisibleCount(v => v + WINDOW_STEP)}>
                  Load {Math.min(hiddenCount, WINDOW_STEP)} earlier message{Math.min(hiddenCount, WINDOW_STEP) === 1 ? '' : 's'}
                  <span className="load-earlier-count"> · {hiddenCount} hidden</span>
                </button>
              )}
              {shownMessages.map((m, i) => (
                <MessageBubble key={i + (conv.messages.length - shownMessages.length)} msg={m}
                  onTTS={handleTTS} onOpenArtifact={(art) => setActiveArtifact(art)} />
              ))}
              {/* Show pending tool results while streaming */}
              {loading && Object.keys(pendingToolResults).length > 0 && (
                <div className="message assistant">
                  <div className="tool-results">
                    {Object.entries(pendingToolResults).map(([tool, result]) => (
                      <ToolResultCard key={tool} tool={tool} result={result} />
                    ))}
                  </div>
                </div>
              )}
              {isStreamingHere && streamingContent && (
                <div className="message assistant">
                  <div className="message-role">Yogatik</div>
                  <div className="message-content"><ReactMarkdown>{streamingContent}</ReactMarkdown></div>
                </div>
              )}
              {loading && streamingIdx === activeIdx && !streamingContent && (
                <div className="message assistant">
                  {statusText && <div className="status-text">{statusText}</div>}
                  {activeTools.length > 0 && (
                    <div className="active-tools">
                      {activeTools.map(t => {
                        const Icon = TOOL_ICONS[t] || Wrench
                        return <span key={t} className="tool-chip active"><Icon size={10} /> {t}</span>
                      })}
                    </div>
                  )}
                  <div className="typing"><span /><span /><span /></div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEnd} />
        </div>

        <div className="input-area">
          <div className="upload-area">
            <label className="upload-btn">
              <Upload size={12} /> Upload
              <input type="file" hidden accept="*/*" onChange={handleUpload} />
            </label>
            <button className={`small-btn ${isEnhancing ? 'pulsing' : ''}`} onClick={handleEnhancePrompt} disabled={!input.trim() || isEnhancing} title="Enhance prompt with AI" aria-label="Enhance prompt with AI">
              <Sparkles size={12} /> {isEnhancing ? 'Enhancing...' : 'Enhance'}
            </button>
            {recognitionRef.current && (
              <button className={`voice-btn ${isListening ? 'listening' : ''}`} onClick={toggleVoice} title={isListening ? 'Stop listening' : 'Voice input'}>
                {isListening ? <MicOff size={12} /> : <Mic size={12} />}
                {isListening ? 'Stop' : 'Voice'}
              </button>
            )}
            {loading && (
              <button className="stop-btn" onClick={handleStop} title="Stop generation (Esc)" aria-label="Stop generation (Esc)">
                <Square size={12} /> Stop (Esc)
              </button>
            )}
            {!loading && conv?.messages?.some(m => m.role === 'assistant') && (
              <button className="small-btn" onClick={regenerate}
                title="Regenerate last response" aria-label="Regenerate last response">
                <RefreshCw size={12} /> Regenerate
              </button>
            )}
          </div>
          {!online && (
            <div className="offline-banner" role="status">
              <AlertTriangle size={12} /> Offline — messages will fail until the connection returns.
            </div>
          )}
          {attachedFile && (
            <div className="attached-file">
              <span className="attached-name">📎 {attachedFile.name}</span>
              <button className="icon-btn" onClick={() => setAttachedFile(null)} title="Remove"><X size={12} /></button>
            </div>
          )}
          <div className="input-wrapper">
            <textarea ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown} placeholder={attachedFile ? `Describe what to do with ${attachedFile.name}...` : "Ask anything... (try: weather, images, code, translate)"} rows={1} />
            <button className="send-btn" aria-label="Send message" onClick={() => send()} disabled={loading || !online || (!input.trim() && !attachedFile)}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>

      {showProviderModal && <ProviderModal
        onClose={() => { setShowProviderModal(false); setEditingProvider(null) }}
        onSaved={() => { refreshModels(); setEditingProvider(null) }}
        editProvider={editingProvider ? { id: editingProvider, ...models[editingProvider] } : null}
      />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onAuth={handleAuth} />}
      {activeArtifact && <ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />}
      {showAd && <AdModal onClose={() => setShowAd(false)} />}
      {errorModalMsg && (
        <Modal title="Connection problem" icon={<AlertTriangle size={18} />}
          onClose={() => setErrorModalMsg(null)} labelledBy="error-title"
          footer={
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setErrorModalMsg(null)}>Got it</button>
            </div>
          }>
          <div style={{ padding: '16px 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {errorModalMsg}
          </div>
        </Modal>
      )}
    </div>
  )
}
