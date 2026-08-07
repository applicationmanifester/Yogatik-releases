import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Plus, Sun, Moon, Upload, Menu, X, Trash2, Plug, LogIn, LogOut, User, Square, Download, Sparkles, Mic, MicOff, Wrench, Smartphone, AlertTriangle, Globe, FileText } from 'lucide-react'
import { streamMessage, stopGeneration, uploadDocument, getModels, getProviders, removeProvider, testProvider, saveProviderApiKey, logout, isLoggedIn, getMe, getConversations, getConversation, deleteConversation, exportConversation, getTemplates, requestTTS, stopTTS, listDocuments, removeDocument } from './api'
import { ArtifactPanel } from './components/ArtifactPanel'
import { YogatikLogo } from './components/YogatikLogo'
import { ToolResultCard, TOOL_ICONS } from './components/ToolResultCard'
import { MessageBubble } from './components/MessageBubble'
import { AuthModal } from './components/AuthModal'
import { ProviderModal } from './components/ProviderModal'
import { AdModal } from './components/AdModal'

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
  const [statusText, setStatusText] = useState('')
  const [currentStreamId, setCurrentStreamId] = useState(null)
  const [theme, setTheme] = useState(localStorage.getItem('bgkai_theme') || 'dark')
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)
  const [provider, setProvider] = useState('nvidia')
  const [model, setModel] = useState('')
  const [webSearch, setWebSearch] = useState(true)
  const [tools, setToolsEnabled] = useState(true)
  const [temperature, setTemperature] = useState(0.7)
  const [models, setModels] = useState({})
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [providerTemplates, setProviderTemplates] = useState({})
  const [testingProvider, setTestingProvider] = useState(null)
  const [user, setUser] = useState(null)
  const [promptTemplates, setPromptTemplates] = useState([])
  const [activeTemplate, setActiveTemplate] = useState('default')
  const [isListening, setIsListening] = useState(false)
  const [activeTools, setActiveTools] = useState([])
  const [pendingToolResults, setPendingToolResults] = useState({})
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [attachedFile, setAttachedFile] = useState(null)
  const [docs, setDocs] = useState([])
  const [editingProvider, setEditingProvider] = useState(null)
  const [pwaPrompt, setPwaPrompt] = useState(null)
  const [showPwaInstall, setShowPwaInstall] = useState(false)
  const [showAd, setShowAd] = useState(false)
  const chatCountRef = useRef(0)
  const messagesEnd = useRef(null)
  const textareaRef = useRef(null)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)

  const conv = conversations[activeIdx]

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
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: streamingContent ? 'auto' : 'smooth' }) }, [conv?.messages, streamingContent])

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

  useEffect(() => {
    refreshModels()
    refreshTemplates()
    refreshDocs()
    if (isLoggedIn()) {
      getMe().then(u => {
        if (u) { setUser(u); loadConversations() }
        else logout()
      })
    }
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

  const refreshModels = () => {
    getModels().then(setModels).catch(() => {})
    getProviders().then(d => setProviderTemplates(d.templates || {})).catch(() => {})
  }

  const refreshTemplates = () => {
    getTemplates().then(setPromptTemplates).catch(() => {})
  }

  const refreshDocs = useCallback(() => {
    listDocuments().then(setDocs).catch(() => {})
  }, [])

  const loadConversations = async () => {
    const convs = await getConversations()
    if (convs.length > 0) {
      const first = await getConversation(convs[0].id)
      const mapped = convs.map((c, i) => ({
        id: c.id, title: c.title,
        messages: i === 0 && first ? first.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources || [] })) : []
      }))
      setConversations([...mapped, { id: null, title: 'New Chat', messages: [] }])
      setActiveIdx(0)
    }
  }

  const handleAuth = (userData) => { setUser(userData); loadConversations() }

  const autoResize = useCallback(() => {
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 280) + 'px' }
  }, [])

  const newChat = () => {
    setConversations(prev => [...prev, { id: null, title: 'New Chat', messages: [] }])
    setActiveIdx(conversations.length)
  }

  const switchChat = async (idx) => {
    setActiveIdx(idx)
    const c = conversations[idx]
    if (c.id && c.messages.length === 0 && user) {
      const full = await getConversation(c.id)
      if (full) {
        setConversations(prev => prev.map((conv, i) =>
          i === idx ? { ...conv, messages: full.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources || [] })) } : conv
        ))
      }
    }
  }

  const deleteChat = async (idx) => {
    const c = conversations[idx]
    if (c.id && user) { try { await deleteConversation(c.id) } catch {} }
    if (conversations.length === 1) { newChat(); return }
    setConversations(prev => prev.filter((_, i) => i !== idx))
    setActiveIdx(prev => prev >= idx ? Math.max(0, prev - 1) : prev)
  }

  const handleExport = async () => {
    if (!conv.id || !user) {
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
      if (testRes.status === 'ok' || testRes.success) {
        refreshModels()
      } else {
        setErrorModalMsg(`API Key connection failed for ${models[pid]?.name || pid}:\n${testRes.error || 'Invalid API Key or Provider unreachable'}`)
      }
    } catch (err) {
      setSavingApiKey(null)
      setErrorModalMsg(`Failed to save API Key for ${models[pid]?.name || pid}:\n${err.message}`)
    }
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
    const msgText = text.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)
    setStreamingContent('')
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
    if (updated.title === 'New Chat') updated.title = text.trim().slice(0, 40)
    setConversations(prev => prev.map((c, i) => i === activeIdx ? updated : c))

    let content = ''
    let sources = []
    let convId = conv.id
    let toolResults = {}
    let toolsUsed = []

    await streamMessage(
      { message: finalText, messages: updated.messages, tools, use_tools: tools, use_web_search: webSearch, temperature, model: model || undefined },
      (token) => { content += token; pushStream(content); setStatusText('') },
      (s) => { sources = s },
      () => {
        setStatusText('')
        setCurrentStreamId(null)
        const assistantMsg = { role: 'assistant', content, sources, toolResults: { ...pendingToolResults }, toolsUsed }
        setConversations(prev => prev.map((c, i) =>
          i === activeIdx ? { ...c, messages: [...updated.messages, assistantMsg] } : c
        ))
        setStreamingContent('')
        setActiveTools([])
        setPendingToolResults({})
        // Show ad every 3 chats
        chatCountRef.current++
        if (chatCountRef.current % 3 === 0) setShowAd(true)
      },
      (err) => {
        setStatusText('')
        setCurrentStreamId(null)
        const errMsg = { role: 'assistant', content: `Error: ${err}`, sources: [] }
        setConversations(prev => prev.map((c, i) =>
          i === activeIdx ? { ...c, messages: [...updated.messages, errMsg] } : c
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
          use_rag: false,
          use_tools: false,
          temperature: 0.7
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

  const providerEntries = Object.entries(models)

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
        <div className="conversation-list">
          {conversations.map((c, i) => (
            <div key={i} className={`conversation-item ${i === activeIdx ? 'active' : ''}`} onClick={() => switchChat(i)}>
              <span className="conv-title">{c.title}</span>
              {i === activeIdx && (
                <button className="icon-btn conv-delete" onClick={e => { e.stopPropagation(); deleteChat(i) }} aria-label="Delete conversation">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="settings">
          <label><Sparkles size={12} /> Persona</label>
          <select value={activeTemplate} onChange={e => setActiveTemplate(e.target.value)}>
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
          <select value={provider} onChange={e => { setProvider(e.target.value); setModel('') }}>
            {providerEntries.map(([key, val]) => (
              <option key={key} value={key}>
                {val.name || key}
              </option>
            ))}
          </select>

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

          <label>Model</label>
          <select value={model} onChange={e => setModel(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', marginBottom: '8px' }}>
            <option value="">Auto ({models[provider]?.default_model || 'default'})</option>
            {(models[provider]?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <label>Temperature: {temperature}</label>
          <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
          <div className="toggle-row">
            <label><Wrench size={12} /> AI Tools</label>
            <label className="toggle" aria-label="Toggle AI tools">
              <input type="checkbox" checked={tools} onChange={e => setToolsEnabled(e.target.checked)} /><span className="slider" />
            </label>
          </div>
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
          {conv?.messages.length === 0 && !streamingContent ? (
            <div className="welcome">
              <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}><YogatikLogo size={48} /> Yogatik</h1>
              <p>AI-powered assistant with web search, RAG, image generation, code execution, weather, translation, TTS, and 28 free tools.</p>
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
              {conv?.messages.map((m, i) => (
                <MessageBubble key={i} msg={m} onTTS={handleTTS} onOpenArtifact={(art) => setActiveArtifact(art)} />
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
              {streamingContent && (
                <div className="message assistant">
                  <div className="message-role">Yogatik</div>
                  <div className="message-content"><ReactMarkdown>{streamingContent}</ReactMarkdown></div>
                </div>
              )}
              {loading && !streamingContent && (
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
          </div>
          {attachedFile && (
            <div className="attached-file">
              <span className="attached-name">📎 {attachedFile.name}</span>
              <button className="icon-btn" onClick={() => setAttachedFile(null)} title="Remove"><X size={12} /></button>
            </div>
          )}
          <div className="input-wrapper">
            <textarea ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown} placeholder={attachedFile ? `Describe what to do with ${attachedFile.name}...` : "Ask anything... (try: weather, images, code, translate)"} rows={1} />
            <button className="send-btn" aria-label="Send message" onClick={() => send()} disabled={loading || (!input.trim() && !attachedFile)}>
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
        <div className="modal-overlay" onClick={() => setErrorModalMsg(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 style={{ color: '#ff4444' }}><AlertTriangle size={18} /> API Key Error</h2>
              <button className="icon-btn" onClick={() => setErrorModalMsg(null)} aria-label="Dismiss error"><X size={18} /></button>
            </div>
            <div style={{ padding: '16px 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', whitespace: 'pre-wrap' }}>
              {errorModalMsg}
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setErrorModalMsg(null)}>Got It</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
