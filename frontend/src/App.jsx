import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Plus, Sun, Moon, Upload, Menu, X, Trash2, Plug, LogIn, LogOut, User, Square, Download, Sparkles, Mic, MicOff, Wrench, Smartphone, AlertTriangle, Globe, FileText, Search, Pencil, RefreshCw, ChevronDown, Key, Cloud, CloudOff, Zap, GitCompare, Radio, Sliders, Cpu, Folder } from 'lucide-react'
import { streamMessage, stopGeneration, uploadDocument, getModels, removeProvider, testProvider, saveProviderApiKey, logout, getMe, getConversations, getConversation, deleteConversation, exportConversation, getTemplates, requestTTS, stopTTS, listDocuments, removeDocument, createConversation, saveMessage, renameConversation, updateConversationModel, trimConversationFrom, getActiveProvider, setActiveProvider, getActiveModel, setActiveModel, getAllProviderStatus, ensureTested, autoPickModel, getTools, setToolEnabled, setToolsEnabledBulk, getPrefs, setPref, getTodayUsage, getProjects, createProject, deleteProject, getActiveProject, setActiveProject, hasAcceptedTerms, acceptTerms, downloadBackup, restoreBackup, getMeasuredModels, isRetiredModelError, pruneRetiredModel, getAllKeyInfo, forgetApiKey, getLiveConfig, checkGoogleRedirect, hasAnyProviderKey, getStoredProvider, getVisionStatus, branchConversation, syncCloudKeys, createTemplate, deleteTemplate } from './api'
import { isDesktop, grantFolder, getGrantedRoot } from './tools/localFs'
import { runMultiAgentDebate } from './multiAgent'
import { ArtifactPanel } from './components/ArtifactPanel'
import { YogatikLogo } from './components/YogatikLogo'
import { ToolResultCard, TOOL_ICONS } from './components/ToolResultCard'
import { MessageBubble } from './components/MessageBubble'
import { AuthModal } from './components/AuthModal'
import { ProviderModal } from './components/ProviderModal'
import { AdModal, adsConfigured } from './components/AdModal'
import { Modal } from './components/Modal'
import { TermsModal, TERMS_VERSION, CONTACT_EMAIL } from './components/TermsModal'
import { LocalModelPanel } from './components/LocalModelPanel'
import { CommandPalette } from './components/CommandPalette'
import { ModelPicker } from './components/ModelPicker'
import { ArenaView } from './components/ArenaView'
import { LiveView } from './components/LiveView'
import { PersonalisePanel } from './components/PersonalisePanel'
import { SkillsPanel } from './components/SkillsPanel'
import { runWorkflow } from './workflows'
import { DemoModal } from './components/DemoModal'
import { DownloadModal } from './components/DownloadModal'
import { isDbClosedError } from './db'
import { resolveFeatures } from './features'
import { setLocalVLMConsent } from './vision/localVLM'
import { setSemanticConsent } from './semantic'
import { looksVisionCapable } from './vision/capability'
import { prepareImage, isImageFile, imageFromClipboard, imageFromDrop } from './vision/attach'
import { registerServiceWorker } from './pwa'
import { requestPersistence, storageReport, formatBytes } from './storage'
import { DEFAULT_LOCAL_MODEL, webGpuDetails, loadLocalModel, LOCAL_MODELS, clearLocalModelCache } from './localLLM'
import { isDirectTimeQuery } from './timeQuery'

// Messages rendered at once; older turns load on demand.
const WINDOW_STEP = 40

/** 329189ms is unreadable; 5m 29s is not. */
function formatLatency(ms) {
  if (ms == null || isNaN(ms)) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

const SUGGESTIONS = [
  "What's the weather in New York?",
  "Generate an image of a futuristic city",
  "Translate 'hello world' to Japanese",
  "Calculate the square root of 144",
  "Search the web for today's AI news",
  "Summarize this YouTube video",
]


function formatDirectTimeAnswer() {
  const locale = navigator.language || 'en-US'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  const now = new Date()
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(now)
  return `${date} at ${time} (${tz})`
}

// ─── Main App ───
export default function App() {
  const [conversations, setConversations] = useState([{ clientId: `c_def_${Date.now()}`, id: null, title: 'New Chat', messages: [] }])
  const [activeArtifact, setActiveArtifact] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [input, setInput] = useState('')
  const [loadingMap, setLoadingMap] = useState({})
  const [streamingMap, setStreamingMap] = useState({})
  const [statusMap, setStatusMap] = useState({})
  const [streamIdMap, setStreamIdMap] = useState({})
  const [theme, setTheme] = useState(() => {
    // Migrate old key 'bgkai_theme' → 'yogatik_theme' on first load
    const old = localStorage.getItem('bgkai_theme')
    const cur = localStorage.getItem('yogatik_theme')
    if (old && !cur) { localStorage.setItem('yogatik_theme', old); localStorage.removeItem('bgkai_theme') }
    return localStorage.getItem('yogatik_theme') || 'dark'
  })
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)
  const [provider, setProviderState] = useState('local')
  const [model, setModel] = useState('')
  const [webSearch, setWebSearchState] = useState(true)
  const [tools, setToolsEnabledState] = useState(true)
  const [temperature, setTemperatureState] = useState(0.7)
  const [models, setModels] = useState({})
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [user, setUser] = useState(null)
  const [promptTemplates, setPromptTemplates] = useState([])
  const [activeTemplate, setActiveTemplate] = useState('default')
  const [activeTools, setActiveTools] = useState([])
  const [pendingToolResults, setPendingToolResults] = useState({})
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [attachedFile, setAttachedFile] = useState(null)
  const [attachedImage, setAttachedImage] = useState(null)   // { dataUrl, thumb, name, width, height }
  const [dragOver, setDragOver] = useState(false)
  const [modelSees, setModelSees] = useState(null)   // null = unknown yet
  const [updateReady, setUpdateReady] = useState(null)   // () => apply
  const [storage, setStorage] = useState(null)
  const [docs, setDocs] = useState([])
  const [convQuery, setConvQuery] = useState('')
  const [providerStatus, setProviderStatus] = useState({})
  const [verifying, setVerifying] = useState(false)
  const [keyInfo, setKeyInfo] = useState({})
  const [measuredModels, setMeasuredModels] = useState({})
  const [usage, setUsage] = useState({})
  const [arena, setArena] = useState(null)
  const [comparing, setComparing] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [liveConfig, setLiveConfig] = useState(null)   // non-null = call in progress
  const liveConvRef = useRef(null)                     // transcript's own conversation
  const [compareModels, setCompareModels] = useState(['', ''])
  const [projects, setProjects] = useState([])
  const [activeProject, setActiveProjectState] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [autoPicking, setAutoPicking] = useState(false)
  const [autoPickMsg, setAutoPickMsg] = useState('')
  const [autoRoute, setAutoRouteState] = useState(false)
  const [fallback, setFallbackState] = useState(true)
  const [prefs, setPrefsState] = useState({})
  const [showPersonalise, setShowPersonalise] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [grantedRoot, setGrantedRoot] = useState(null)
  const [toast, setToast] = useState(null)
  const showToast = useCallback((msg) => {
    setToast(msg)
    // Scale dismiss timeout by message length — short messages 2s, long messages up to 5s
    const ms = Math.min(5000, Math.max(2000, msg.length * 60))
    setTimeout(() => setToast(t => (t === msg ? null : t)), ms)
  }, [])
  const showConfirm = useCallback((msg, onOk, { okLabel = 'OK', cancelLabel = 'Cancel', onCancel } = {}) => {
    setConfirmModal({ msg, okLabel, cancelLabel, onOk, onCancel })
  }, [])
  const handleGrantFolder = useCallback(async () => {
    const root = await grantFolder()
    if (root) setGrantedRoot(root)
  }, [])
  const features = useMemo(() => resolveFeatures(prefs.features), [prefs.features])
  // The vision fallback lives outside React; it needs the toggle, not a prop.
  useEffect(() => { setLocalVLMConsent(features.localVision) }, [features.localVision])
  useEffect(() => { setSemanticConsent(features.semanticSearch) }, [features.semanticSearch])
  // Discover tools from any configured MCP servers once at startup.
  useEffect(() => { import('./mcp').then(m => m.refreshMcpTools()).catch(() => {}) }, [])
  const [localBoot, setLocalBoot] = useState(null)

  /**
   * Zero-key start. Someone who has never seen an API key should be able to
   * type a question and get an answer, so with no key and a GPU we pull the
   * smallest on-device model and load it. It only ever runs when the user has
   * nothing else: any stored key, or any provider they picked themselves, wins.
   */
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (await getStoredProvider()) return
      if (await hasAnyProviderKey()) return
      const gpu = await webGpuDetails()
      if (cancelled || !gpu?.available) return

      const id = DEFAULT_LOCAL_MODEL
      setProviderState('local')
      setModel(id)
      await Promise.all([setActiveProvider('local'), setActiveModel('local', id)]).catch(() => {})
      setLocalBoot({ progress: 0, text: 'Preparing on-device AI…' })
      try {
        await loadLocalModel(id, p => { if (!cancelled) setLocalBoot(p) })
        if (!cancelled) { setLocalBoot({ ready: true }); refreshModels() }
      } catch (e) {
        if (!cancelled) setLocalBoot({ error: e.message })
      }
    }
    run().catch(() => {})
    return () => { cancelled = true }
  }, [])
  const backupInput = useRef(null)
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
  const toolRunRef = useRef({ results: {}, used: [] })
  const traceRef = useRef([])   // ordered per-turn activity steps (tool + args + status)
  const messagesEnd = useRef(null)
  const textareaRef = useRef(null)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const recognitionRef = useRef(null)
  const [showDemoModal, setShowDemoModal] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showStorageDetails, setShowStorageDetails] = useState(false)
  const [showPersonaModal, setShowPersonaModal] = useState(false)
  // Generic confirm modal — replaces native confirm() throughout the app
  const [confirmModal, setConfirmModal] = useState(null) // { msg, okLabel?, cancelLabel?, onOk, onCancel? }
  // Project-name prompt modal — replaces native prompt() in addProject
  const [projectNameModal, setProjectNameModal] = useState(null) // { onSubmit }
  // Restore-mode modal — replaces confirm() in handleRestore
  const [restoreModal, setRestoreModal] = useState(null) // { file }

  // Service worker updates + durable storage. Both are fire-and-forget: a
  // browser that refuses either must still get a working app.
  useEffect(() => {
    registerServiceWorker((apply) => setUpdateReady(() => apply))
    requestPersistence()
      .then(() => storageReport())
      .then(setStorage)
      .catch(() => {})
  }, [])

  // Finish a Google sign-in redirect. A silent catch here is why a failed
  // mobile sign-in looked like nothing happening at all.
  useEffect(() => {
    checkGoogleRedirect()
      .then(u => { if (u) { setUser(u); loadConversations() } })
      .catch(err => {
        if (isDbClosedError(err)) return
        setErrorModalMsg(`Sign-in did not complete.\n\n${err.message || err}`)
      })
  }, [])

  // Auto-show demo modal ONLY for brand new first-time users (0 messages & 0 API keys)
  useEffect(() => {
    const seen = localStorage.getItem('yogatik_demo_seen')
    if (!seen && conversations.length > 0) {
      const hasHistory = conversations.some(c => c.messages?.length > 0)
      const hasKeys = Object.values(keyInfo || {}).some(k => k.configured)

      if (hasHistory || hasKeys) {
        // Returning user — mark as seen so demo never pops up
        localStorage.setItem('yogatik_demo_seen', 'true')
      } else if (conversations.length === 1 && conversations[0]?.messages?.length === 0) {
        // Truly first-time new user
        setShowDemoModal(true)
        localStorage.setItem('yogatik_demo_seen', 'true')
      }
    }
  }, [conversations, keyInfo])

  const conv = conversations[activeIdx]
  const activeClientId = conv?.clientId
  const isStreamingHere = !!(activeClientId && loadingMap[activeClientId])
  const streamingContent = (activeClientId && streamingMap[activeClientId]) || ''
  const statusText = (activeClientId && statusMap[activeClientId]) || ''
  const currentStreamId = (activeClientId && streamIdMap[activeClientId]) || null

  // Provider/model must be persisted: the agent reads them from IndexedDB, so
  // React-only state meant every message silently went to the stored default.
  const setProvider = useCallback((id) => {
    setProviderState(prev => {
      if (prev !== id) {
        setModel('')
        setActiveModel(id, '').catch(() => {})
      }
      return id
    })
    setActiveProvider(id).catch(() => {})
    setConversations(prev => prev.map((c, i) => {
      if (i !== activeIdx) return c
      const updated = { ...c, provider: id, model: '' }
      if (updated.id) {
        updateConversationModel(updated.id, id, '', {
          systemPrompt: updated.systemPrompt,
          temperature: updated.temperature,
          webSearch: updated.webSearch,
          tools: updated.tools,
        }).catch(() => {})
      }
      return updated
    }))
  }, [activeIdx])
  const chooseModel = useCallback((m, providerId = provider) => {
    setModel(m)
    setActiveModel(providerId, m).catch(() => {})
    setConversations(prev => prev.map((c, i) => {
      if (i !== activeIdx) return c
      const updated = { ...c, provider: providerId, model: m }
      if (updated.id) {
        updateConversationModel(updated.id, providerId, m, {
          systemPrompt: updated.systemPrompt,
          temperature: updated.temperature,
          webSearch: updated.webSearch,
          tools: updated.tools,
        }).catch(() => {})
      }
      return updated
    }))
  }, [provider, activeIdx])

  // Chat preferences persist across reloads like provider and model do.
  const setTemperature = useCallback((v) => {
    setTemperatureState(v)
    setPref('temperature', v).catch(() => {})
    setConversations(prev => prev.map((c, i) => {
      if (i !== activeIdx) return c
      const updated = { ...c, temperature: v }
      if (updated.id) {
        updateConversationModel(updated.id, updated.provider, updated.model, {
          systemPrompt: updated.systemPrompt,
          temperature: v,
          webSearch: updated.webSearch,
          tools: updated.tools,
        }).catch(() => {})
      }
      return updated
    }))
  }, [activeIdx])
  const setWebSearch = useCallback((v) => {
    setWebSearchState(v)
    setPref('web_search', v).catch(() => {})
    setConversations(prev => prev.map((c, i) => {
      if (i !== activeIdx) return c
      const updated = { ...c, webSearch: v }
      if (updated.id) {
        updateConversationModel(updated.id, updated.provider, updated.model, {
          systemPrompt: updated.systemPrompt,
          temperature: updated.temperature,
          webSearch: v,
          tools: updated.tools,
        }).catch(() => {})
      }
      return updated
    }))
  }, [activeIdx])
  const setAutoRoute = useCallback((v) => {
    setAutoRouteState(v)
    setPref('auto_route', v).catch(() => {})
  }, [])
  const setFallback = useCallback((v) => {
    setFallbackState(v)
    setPref('fallback', v).catch(() => {})
  }, [])
  const setToolsEnabled = useCallback((v) => {
    setToolsEnabledState(v)
    setPref('tools_enabled', v).catch(() => {})
    setConversations(prev => prev.map((c, i) => {
      if (i !== activeIdx) return c
      const updated = { ...c, tools: v }
      if (updated.id) {
        updateConversationModel(updated.id, updated.provider, updated.model, {
          systemPrompt: updated.systemPrompt,
          temperature: updated.temperature,
          webSearch: updated.webSearch,
          tools: v,
        }).catch(() => {})
      }
      return updated
    }))
  }, [activeIdx])
  /** One updater for every small preference the Personalise panel owns. */
  const updatePref = useCallback((key, value) => {
    setPrefsState(p => ({ ...p, [key]: value }))
    setPref(key, value).catch(() => {})
  }, [])

  // Only the tail of a long conversation is mounted; older turns stay in state
  // (and IndexedDB) but are not rendered until asked for. Keeps a 500-message
  // chat as cheap to paint as a fresh one.
  const allMessages = conv?.messages || []
  const shownMessages = allMessages.length > visibleCount
    ? allMessages.slice(-visibleCount)
    : allMessages
  const hiddenCount = allMessages.length - shownMessages.length

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('yogatik_theme', theme)
  }, [theme])
  // Follow the stream only while the user is already at the bottom. Yanking
  // someone back mid-read is the most annoying thing a chat UI can do.
  const scrollerRef = useRef(null)
  const [atBottom, setAtBottom] = useState(true)

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
  }, [])

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEnd.current?.scrollIntoView({ behavior })
    setAtBottom(true)
  }, [])

  useEffect(() => {
    if (!isStreamingHere) return
    if (atBottom) scrollToBottom(streamingContent ? 'auto' : 'smooth')
  }, [conv?.messages, streamingContent, isStreamingHere, atBottom, scrollToBottom])

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

  const [listening, setListening] = useState(false)

  const toggleVoiceInput = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setErrorModalMsg('Voice dictation is not supported by your browser.')
      return
    }
    if (listening) {
      setListening(false)
      return
    }
    try {
      const rec = new SR()
      rec.continuous = false
      rec.interimResults = true
      rec.lang = navigator.language || 'en-US'
      rec.onstart = () => setListening(true)
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      rec.onresult = (e) => {
        const text = Array.from(e.results).map(r => r[0].transcript).join('')
        setInput(text)
      }
      rec.start()
    } catch {
      setListening(false)
    }
}, [listening])

  // Global Keyboard Shortcuts (Alt+L: Live, Alt+V: Vision, Alt+K: Command Palette)
  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      if (!e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'l') {
        e.preventDefault()
        if (liveConfig) setLiveConfig(null)
        else startLive()
      } else if (k === 'k') {
        e.preventDefault()
        setShowPalette(prev => !prev)
      } else if (k === 'v') {
        e.preventDefault()
        if (!liveConfig) startLive()
      }
    }
    window.addEventListener('keydown', handleGlobalShortcuts)
    return () => window.removeEventListener('keydown', handleGlobalShortcuts)
  }, [liveConfig])

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

  // Cheap: cached probe result, else the name heuristic. Tells the user BEFORE
  // they send whether the image goes to the model or gets read on-device.
  useEffect(() => {
    let live = true
    getVisionStatus(provider, model)
      .then(v => { if (live) setModelSees(v.cached ?? v.guessed) })
      .catch(() => { if (live) setModelSees(null) })
    return () => { live = false }
  }, [provider, model])

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
        if (!cancelled) {
          setProviderStatus(await getAllProviderStatus())
          setMeasuredModels(await getMeasuredModels(provider))
        }
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
    getActiveProject().then(pid => { setActiveProjectState(pid); loadConversations(pid) })
    refreshProjects()
    getMe().then(u => { if (u) setUser(u) }).catch(() => {})
    getActiveProvider().then(async (p) => {
      setProviderState(p)
      setModel(await getActiveModel(p) || '')
      setProviderStatus(await getAllProviderStatus())
    }).catch(() => {})
    if (isDesktop()) {
      getGrantedRoot().then(setGrantedRoot).catch(() => {})
    }
    getPrefs().then(pref => {
      if (pref.temperature != null) setTemperatureState(pref.temperature)
      if (pref.web_search != null) setWebSearchState(pref.web_search)
      if (pref.tools_enabled != null) setToolsEnabledState(pref.tools_enabled)
      if (pref.persona) setActiveTemplate(pref.persona)
      if (pref.auto_route != null) setAutoRouteState(pref.auto_route)
      if (pref.fallback != null) setFallbackState(pref.fallback)
      setPrefsState(pref)
    }).catch(() => {})
    refreshToolPrefs()
    refreshKeys()
    getTodayUsage().then(setUsage).catch(() => {})

    // Android share sheet / app shortcuts land here as query params.
    const params = new URLSearchParams(location.search)
    const shared = [params.get('title'), params.get('text'), params.get('url')]
      .filter(Boolean).join('\n').trim()
    if (shared) {
      setInput(params.get('intent') === 'research' ? `Research this:\n${shared}` : shared)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
    if (params.get('intent') === 'research' && !shared) setInput('Research ')
    // Live is a standalone mode: launched from a PWA shortcut it opens the
    // call directly, without needing a conversation or a chat provider.
    if (params.get('live')) startLive()
    if (shared || params.get('new') || params.get('intent') || params.get('live')) {
      history.replaceState(null, '', location.pathname)   // don't re-fire on reload
    }
    // Note: Speech Recognition is initialised on-demand in toggleVoiceInput;
    // no duplicate init is needed here.
    // Global Keyboard Shortcuts
    const handleGlobalKeyDown = (e) => {
      // Ctrl/Cmd+K -> command palette
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setShowPalette(v => !v)
      }
      // Ctrl+Shift+O or Cmd+Shift+O -> New Chat
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault()
        newChatRef.current()
      }
      // Escape -> Stop generation (only if THIS chat is generating)
      if (e.key === 'Escape' && isStreamingHere) {
        e.preventDefault()
        handleStop()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isStreamingHere])


  // One fetch, not two: getProviders() is an alias of getModels() and the
  // second call only fed state nothing ever read.
  const refreshModels = useCallback(() => {
    getModels().then(setModels).catch(() => {})
  }, [])

  const refreshTemplates = useCallback(() => {
    getTemplates().then(setPromptTemplates).catch(() => {})
  }, [])

  const refreshDocs = useCallback(() => {
    getActiveProject().then(pid => listDocuments(pid)).then(setDocs).catch(() => {})
  }, [])

  const refreshProjects = useCallback(() => {
    getProjects().then(setProjects).catch(() => {})
  }, [])

  const chooseProject = async (pid) => {
    setActiveProjectState(pid)
    await setActiveProject(pid)
    await loadConversations(pid)
    refreshDocs()
  }

  const addProject = () => {
    setProjectNameModal({
      onSubmit: async (name) => {
        setProjectNameModal(null)
        if (!name?.trim()) return
        const pid = await createProject(name.trim())
        refreshProjects()
        chooseProject(pid)
      }
    })
  }

  const removeProject = async (pid) => {
    showConfirm(
      'Delete this project? Its chats and documents are kept and moved out of the project.',
      async () => { await deleteProject(pid); refreshProjects(); chooseProject(null) },
      { okLabel: 'Delete Project' }
    )
  }

  const refreshKeys = useCallback(() => {
    getAllKeyInfo().then(setKeyInfo).catch(() => {})
  }, [])

  const forgetKey = async (pid) => {
    await forgetApiKey(pid)
    refreshKeys()
    refreshModels()
    setProviderStatus(await getAllProviderStatus())
  }

  /** Manual nudge — sync already runs on sign-in and on every key save. */
  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const { pulled = 0, pushed = 0 } = await syncCloudKeys()
      refreshKeys()
      refreshModels()
      setErrorModalMsg(pulled || pushed
        ? `Synced: ${pulled} key${pulled === 1 ? '' : 's'} brought to this device, ${pushed} uploaded.`
        : 'Everything is already up to date on this device.')
    } catch (e) {
      setErrorModalMsg(e.message)
    } finally {
      setSyncing(false)
    }
  }

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
    toolsUsed: m.toolsUsed || undefined,
    trace: m.trace || undefined,
    provider: m.provider || undefined,
    model: m.model || undefined,
    createdAt: m.createdAt,
  })

  const loadConversations = useCallback(async (projectId = activeProject) => {
    const convs = await getConversations(projectId ?? undefined)
    if (!convs.length) {
      setConversations([{
        clientId: `c_def_${Date.now()}`, id: null, title: 'New Chat', messages: [],
        provider: provider || 'local', model: model || '',
        systemPrompt: '', temperature: temperature ?? 0.7,
        webSearch: webSearch ?? true, tools: tools ?? true,
      }])
      setActiveIdx(0)
      return
    }
    const first = await getConversation(convs[0].id)
    const mapped = convs.map((c, i) => ({
      clientId: `c_${c.id}_${i}`,
      id: c.id,
      title: c.title,
      provider: c.provider || provider || 'local',
      model: c.model !== undefined ? c.model : model || '',
      systemPrompt: c.settings?.systemPrompt ?? c.systemPrompt ?? '',
      temperature: c.settings?.temperature ?? c.temperature ?? temperature ?? 0.7,
      webSearch: c.settings?.webSearch ?? c.webSearch ?? webSearch ?? true,
      tools: c.settings?.tools ?? c.tools ?? tools ?? true,
      messages: i === 0 && first ? (first.messages || []).map(hydrate) : [],
    }))
    const filtered = mapped.filter(c => c.title || (c.messages && c.messages.length))
    setConversations(filtered)
    if (!filtered.length) setActiveIdx(0)
    else {
      const top = filtered[0]
      if (top.provider) setProviderState(top.provider)
      if (top.model !== undefined) setModel(top.model)
      if (top.temperature !== undefined) setTemperatureState(top.temperature)
      if (top.webSearch !== undefined) setWebSearchState(top.webSearch)
      if (top.tools !== undefined) setToolsEnabledState(top.tools)
    }
  }, [activeProject, provider, model, temperature, webSearch, tools])

  const handleAuth = (userData) => { setUser(userData); loadConversations() }

  /**
   * Sign-in is gated on accepting the current terms. Acceptance is recorded
   * per version, so a material update asks again.
   */
  const requestSignIn = async () => {
    if (await hasAcceptedTerms(TERMS_VERSION)) setShowAuthModal(true)
    else setShowTerms(true)
  }

  const handleAcceptTerms = async (version) => {
    await acceptTerms(version)
    setShowTerms(false)
    setShowAuthModal(true)
  }

  const autoResize = useCallback(() => {
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 280) + 'px' }
  }, [])

  const newChat = useCallback(() => {
      setConvQuery('')
      setInput('')
      setActiveArtifact(null)
      setAttachedFile(null)
      setAttachedImage(null)
      setVisibleCount(WINDOW_STEP)

      setConversations(prev => {
        const current = prev[activeIdx]
        const isEmptyNewChat = current && !current.id && current.title === 'New Chat' && (!current.messages || current.messages.length === 0)
      
        if (isEmptyNewChat) {
          return prev.map((c, i) => i === activeIdx ? {
            ...c,
            messages: [],
            title: 'New Chat',
            provider: provider || 'local',
            model: model || '',
            systemPrompt: '',
            temperature: temperature ?? 0.7,
            webSearch: webSearch ?? true,
            tools: tools ?? true,
          } : c)
        }
      
        const newConv = {
          clientId: `c_new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          id: null,
          title: 'New Chat',
          messages: [],
          provider: provider || 'local',
          model: model || '',
          systemPrompt: '',
          temperature: temperature ?? 0.7,
          webSearch: webSearch ?? true,
          tools: tools ?? true,
        }
        return [newConv, ...prev]
      })

      setActiveIdx(0)
      if (window.innerWidth <= 768) setSidebarOpen(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }, [provider, model, temperature, webSearch, tools, activeIdx])

  const newChatRef = useRef(newChat)
  useEffect(() => { newChatRef.current = newChat }, [newChat])

  /** Jump to a conversation by its stored id — the palette searches messages,
   *  which know their conversation but not its position in the sidebar. */
  const openChatById = useCallback(async (convId) => {
    const idx = conversations.findIndex(c => c.id === convId)
    if (idx >= 0) { switchChat(idx); return }
    const full = await getConversation(convId)
    if (!full) return
    const formatted = {
      clientId: `c_${full.id}_0`,
      ...full,
      provider: full.provider || provider || 'local',
      model: full.model !== undefined ? full.model : model || '',
      systemPrompt: full.settings?.systemPrompt ?? full.systemPrompt ?? '',
      temperature: full.settings?.temperature ?? full.temperature ?? temperature ?? 0.7,
      webSearch: full.settings?.webSearch ?? full.webSearch ?? webSearch ?? true,
      tools: full.settings?.tools ?? full.tools ?? tools ?? true,
      messages: (full.messages || []).map(hydrate),
    }
    setConversations(prev => [formatted, ...prev])
    setActiveIdx(0)
    setVisibleCount(WINDOW_STEP)
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }, [conversations, provider, model, temperature, webSearch, tools])

  const switchChat = async (idx) => {
    setActiveIdx(idx)
    setVisibleCount(WINDOW_STEP)
    if (window.innerWidth <= 768) setSidebarOpen(false)
    const c = conversations[idx]
    if (!c) return

    if (c.provider) setProviderState(c.provider)
    if (c.model !== undefined) setModel(c.model)
    if (c.temperature !== undefined) setTemperatureState(c.temperature)
    if (c.webSearch !== undefined) setWebSearchState(c.webSearch)
    if (c.tools !== undefined) setToolsEnabledState(c.tools)

    if (c.id && c.messages.length === 0) {
      const full = await getConversation(c.id)
      if (full) {
        setConversations(prev => prev.map((conv, i) =>
          i === idx ? {
            ...conv,
            provider: full.provider || conv.provider,
            model: full.model !== undefined ? full.model : conv.model,
            systemPrompt: full.settings?.systemPrompt ?? conv.systemPrompt ?? '',
            temperature: full.settings?.temperature ?? conv.temperature ?? 0.7,
            webSearch: full.settings?.webSearch ?? conv.webSearch ?? true,
            tools: full.settings?.tools ?? conv.tools ?? true,
            messages: (full.messages || []).map(hydrate),
          } : conv
        ))
      }
    }
  }

  const deleteChat = async (idx) => {
    const c = conversations[idx]
    const cClientId = c?.clientId
    const doDelete = async () => {
      if (c?.id) { try { await deleteConversation(c.id) } catch {} }
      setVisibleCount(WINDOW_STEP)
      setConversations(prev => {
        const next = prev.filter((_, i) => i !== idx)
        return next.length ? next : [{ clientId: `c_def_${Date.now()}`, id: null, title: 'New Chat', messages: [], provider, model, temperature, webSearch, tools }]
      })
      setActiveIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev))
    }
    if (cClientId && loadingMap[cClientId]) {
      showConfirm(
        'This chat is currently generating a response. Stop generation and delete?',
        () => {
          const streamId = streamIdMap[cClientId]
          if (streamId) stopGeneration(streamId).catch(() => {})
          setLoadingMap(prev => { const n = { ...prev }; delete n[cClientId]; return n })
          setStreamingMap(prev => { const n = { ...prev }; delete n[cClientId]; return n })
          setStatusMap(prev => { const n = { ...prev }; delete n[cClientId]; return n })
          setStreamIdMap(prev => { const n = { ...prev }; delete n[cClientId]; return n })
          doDelete()
        },
        { okLabel: 'Stop & Delete' }
      )
      return
    }
    doDelete()
  }

  const handleExport = async () => {
    if (!conv.id) {
      const md = (conv.messages || []).map(m => `**${m.role === 'user' ? 'You' : 'Yogatik'}**:\n\n${m.content}`).join('\n\n---\n\n')
      const blob = new Blob([md], { type: 'text/markdown' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${conv.title}.md`; a.click()
      showToast('Chat exported as Markdown')
      return
    }
    try {
      const data = await exportConversation(conv.id)
      const blob = new Blob([data.content], { type: 'text/markdown' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = data.filename; a.click()
      showToast('Chat exported as Markdown')
    } catch { showToast('Export failed') }
  }

  const handleStop = async () => {
    const activeClientId = conv?.clientId
    const streamId = activeClientId ? streamIdMap[activeClientId] : null
    if (streamId) {
      await stopGeneration(streamId)
      setStreamIdMap(prev => ({ ...prev, [activeClientId]: null }))
      setLoadingMap(prev => { const n = { ...prev }; delete n[activeClientId]; return n })
    }
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
      refreshKeys()
      if (testRes.success) {
        refreshModels()
        setApiKeyInput(prev => ({ ...prev, [pid]: '' }))
        // The user has no way to know which of 79 models is usable — measure
        // and choose for them, unless they already picked one.
        if (!(await getActiveModel(pid))) await handleAutoPick(pid)
      } else {
        setErrorModalMsg(`Could not connect to ${models[pid]?.name || pid}:\n\n${testRes.error}`)
      }
    } catch (err) {
      setSavingApiKey(null)
      setErrorModalMsg(`Failed to save API Key for ${models[pid]?.name || pid}:\n${err.message}`)
    }
  }

  const handleAutoPick = async (pid = provider) => {
    setAutoPicking(true)
    showToast('')
    try {
      const res = await autoPickModel(pid, { onProgress: setAutoPickMsg })
      setModel(res.model)
      setProviderStatus(await getAllProviderStatus())
      setMeasuredModels(await getMeasuredModels(pid))
      const others = res.tried.filter(t => t.model !== res.model && t.ok)
        .sort((a, b) => a.latencyMs - b.latencyMs)
        .map(t => `${t.model} (${formatLatency(t.latencyMs)})`)
      setErrorModalMsg(
        `Selected ${res.model} — responded in ${formatLatency(res.latencyMs)}.` +
        (others.length ? `\n\nAlso working: ${others.join(', ')}` : '') +
        `\n\nChange it any time in the Model box.`
      )
    } catch (e) {
      setErrorModalMsg(e.message)
    } finally {
      setAutoPicking(false)
      setAutoPickMsg('')
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
    showConfirm(`Remove "${pid}"?`, async () => {
      try {
        await removeProvider(pid)
        refreshModels()
        if (provider === pid) {
          const fallback = models.groq?.available ? 'groq'
            : models.openrouter?.available ? 'openrouter'
            : models.openai?.available ? 'openai'
            : models.gemini?.available ? 'gemini'
            : 'local'
          setProvider(fallback)
        }
      } catch (e) {
        setErrorModalMsg(e.message)
      }
    }, { okLabel: 'Remove' })
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

  const getSystemPrompt = useCallback((query = '', customSystemPrompt = '') => {
    const t = promptTemplates.find(t => t.id === activeTemplate)
    const basePrompt = customSystemPrompt || t?.system_prompt || 'You are Yogatik, an intelligent AI assistant.'

    let queryContext = ''
    const q = (query || '').toLowerCase()

    if (q.includes('ppt') || q.includes('presentation') || q.includes('slides') || q.includes('deck')) {
      queryContext = '\n\nQUERY-SPECIFIC FORMATTING (PRESENTATION SLIDES):\n' +
        '- Format content into clear slide blocks starting with `# Slide 1: [Title]`, `# Slide 2: [Title]`.\n' +
        '- Keep text concise, bullet-pointed, and executive-ready for 1-click PowerPoint (.ppt) export.'
    } else if (q.includes('prd') || q.includes('product requirement') || q.includes('spec') || q.includes('architecture')) {
      queryContext = '\n\nQUERY-SPECIFIC FORMATTING (EXECUTIVE PRD / SPEC):\n' +
        '- Include: 1. Executive Summary 2. Problem Statement 3. User Stories (Table) 4. Technical Architecture (Diagram) 5. Milestones & KPI Metrics.'
    } else if (q.includes('table') || q.includes('csv') || q.includes('compare') || q.includes('data')) {
      queryContext = '\n\nQUERY-SPECIFIC FORMATTING (DATA TABLE / SPREADSHEET):\n' +
        '- Present comparative data in structured Markdown tables (| Header 1 | Header 2 |) ready for 1-click CSV export.'
    }

    const folderCtx = grantedRoot
      ? `\n\nWORKING FOLDER: ${grantedRoot}\n` +
        `You have full file-system access to this folder via the fs_* tools. ` +
        `Use them proactively when the user asks to create, read, edit, rename, move, delete files or directories:\n` +
        `- fs_list   → list contents (use path="" for root)\n` +
        `- fs_read   → read a file\n` +
        `- fs_write  → create or overwrite a file\n` +
        `- fs_edit   → patch a file by exact string replacement\n` +
        `- fs_search → grep across files\n` +
        `- fs_delete → delete a file or empty directory\n` +
        `- fs_mkdir  → create a directory tree\n` +
        `- fs_move   → move or rename a file/directory\n` +
        `All paths are relative to the working folder above.`
      : ''

    return (
      basePrompt +
      folderCtx +
      queryContext +
      '\n\nPRESENTATION, DOCUMENT & SLIDE ENHANCEMENT GUIDELINES:\n' +
      '- Present answers with high visual clarity: use clear headers (#, ##), formatted bullet points, bold key terms, and structured Markdown tables.\n' +
      '- When creating or editing PowerPoint presentations, Word documents, CSV spreadsheets, or reports, call `doc_export` or `doc_enhance` to build high-quality files with slide graphics, calculated totals, and executive styling.\n' +
      '- When asked to generate visual aids, graphics, icons, or stickers, call the `sticker_generate` or `image_generate` tools.\n' +
      '- When explaining processes or workflows, include Mermaid flowcharts using `diagram` or ```mermaid code blocks.\n' +
      '- Keep document exports (Word .doc, PowerPoint .pptx, CSV) structured into clean sections and slides.'
    )
  }, [promptTemplates, activeTemplate, grantedRoot])

  const loadingRef = useRef(null)
  useEffect(() => { loadingRef.current = !!(conv?.clientId && loadingMap[conv.clientId]) }, [loadingMap, conv?.clientId])

  const activateNewChatRef = useRef(false)

  /** Run a workflow: send each (variable-filled) step in order, waiting for the
   *  previous turn to finish. Steps chain through the conversation history. */
  const runWorkflowNow = async (wf, values) => {
    await runWorkflow(wf, values, (prompt) => new Promise((resolve) => {
      send(prompt)
      const started = Date.now()
      const iv = setInterval(() => {
        const settled = !loadingRef.current && Date.now() - started > 900
        if (settled || Date.now() - started > 180000) { clearInterval(iv); resolve('') }
      }, 300)
    }))
  }

  const send = async (text = input) => {
    if (compareMode) {
      runCompare(text)
      return
    }
    const targetIdx = activeIdx
    const targetConv = conversations[targetIdx]
    if (!targetConv) return
    const targetClientId = targetConv.clientId

    if ((!text.trim() && !attachedFile && !attachedImage) || loadingMap[targetClientId]) return
    if (!navigator.onLine) {
      setErrorModalMsg("You're offline. Yogatik needs a connection to reach the model provider — your chats and documents are safe on this device.")
      return
    }

    const useProvider = targetConv.provider || provider
    let useModel = targetConv.model !== undefined ? targetConv.model : model
    const useTemp = targetConv.temperature !== undefined ? targetConv.temperature : temperature
    const useWeb = targetConv.webSearch !== undefined ? targetConv.webSearch : webSearch
    const useTools = targetConv.tools !== undefined ? targetConv.tools : tools

    // Auto-switch to a vision model if enabled and current model cannot see natively
    if (attachedImage && features.autoVision !== false && modelSees === false) {
      const visionCandidate = (providerModels || []).find(m => looksVisionCapable(m))
      if (visionCandidate) {
        chooseModel(visionCandidate, useProvider)
        useModel = visionCandidate
      }
    }

    // models is populated asynchronously; if it's still empty the provider list
    // hasn't loaded yet — don't block the first send while that fetch is in flight.
    const modelsLoaded = Object.keys(models).length > 0
    const isProviderReady = !modelsLoaded || models[useProvider]?.available || keyInfo[useProvider]?.configured || useProvider === 'local'

    if (!isProviderReady) {
      setErrorModalMsg(
        `🔑 API Key Required for ${models[useProvider]?.name || useProvider}\n\n` +
        `To send messages using ${models[useProvider]?.name || useProvider}, please add your API key in the left sidebar.\n\n` +
        `👉 Click "get free key" in the sidebar to claim a free key in seconds, paste it into the API Key field, and click "+ Add Key"!`
      )
      setSidebarOpen(true)
      setSettingsOpen(true)
      return
    }

    const msgText = text.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    setLoadingMap(prev => ({ ...prev, [targetClientId]: true }))
    setStreamingMap(prev => ({ ...prev, [targetClientId]: '' }))
    setStatusMap(prev => ({ ...prev, [targetClientId]: 'Connecting...' }))
    setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))

    setActiveTools([])
    setPendingToolResults({})

    let fileContext = ''
    if (attachedFile) {
      setStatusMap(prev => ({ ...prev, [targetClientId]: `Reading ${attachedFile.name}...` }))
      try {
        const result = await uploadDocument(attachedFile)
        if (!result.success) {
          fileContext = `[Could not read ${attachedFile.name}: ${result.error}] `
        } else if (result.inline) {
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

    const isMultiAgent = msgText.startsWith('/collaborate ')
    const collaborateTopic = isMultiAgent ? msgText.replace('/collaborate ', '').trim() : ''

    const sentImage = attachedImage
    if (sentImage) setAttachedImage(null)

    const fallbackPrompt = sentImage ? 'What is in this image?' : 'Process the attached file'
    const finalText = fileContext + (isMultiAgent ? collaborateTopic : (msgText || fallbackPrompt))
    const displayText = msgText || (attachedFile ? `📎 ${attachedFile.name}` : (sentImage ? '' : ''))
    const userMsg = {
      role: 'user', content: displayText, sources: [], createdAt: Date.now(),
      ...(sentImage ? { image: sentImage.thumb } : {}),
    }
    const updated = { ...targetConv, messages: [...targetConv.messages, userMsg] }
    const isNewTitle = updated.title === 'New Chat'
    if (isNewTitle) updated.title = (msgText || displayText).trim().slice(0, 40) || 'New Chat'

    let convId = targetConv.id
    try {
      if (!convId) {
        const chatSettings = {
          systemPrompt: targetConv.systemPrompt || '',
          temperature: useTemp,
          webSearch: useWeb,
          tools: useTools,
        }
        convId = await createConversation(updated.title, null, useProvider, useModel, chatSettings)
        updated.id = convId
      } else if (isNewTitle) {
        await renameConversation(convId, updated.title)
      }
      await saveMessage(convId, userMsg)
    } catch (e) { console.error('Failed to persist message', e) }

    setConversations(prev => prev.map(c => c.clientId === targetClientId ? updated : c))

    if (!attachedFile && !sentImage && isDirectTimeQuery(msgText)) {
      const assistantMsg = {
        createdAt: Date.now(),
        role: 'assistant',
        content: `It is ${formatDirectTimeAnswer()}.`,
        sources: [],
        provider: useProvider,
        model: useModel,
      }
      try {
        if (convId) await saveMessage(convId, assistantMsg)
      } catch (e) {
        console.error('Failed to persist direct reply', e)
      }
      setConversations(prev => prev.map(c =>
        c.clientId === targetClientId ? { ...c, id: convId, messages: [...updated.messages, assistantMsg] } : c
      ))
      setStreamingMap(prev => ({ ...prev, [targetClientId]: '' }))
      setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
      setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
      setStreamIdMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
      return
    }

    let content = ''
    let sources = []
    toolRunRef.current = { results: {}, used: [] }
    traceRef.current = []

    const pushStreamContent = (txt) => {
      setStreamingMap(prev => ({ ...prev, [targetClientId]: txt }))
    }

    if (isMultiAgent) {
      await runMultiAgentDebate({
        topic: collaborateTopic,
        modelA: { provider: useProvider, model: useModel },
        modelB: { provider: useProvider, model: useModel },
        rounds: 2,
        onMessageStart: (agent, mdl, label) => {
          content += `\n\n> **${agent === 'A' ? 'Proposer' : 'Critic'}** (${mdl.model || mdl.provider}): _${label}_\n\n`
          pushStreamContent(content)
          setStatusMap(prev => ({ ...prev, [targetClientId]: label }))
        },
        onToken: (agent, token) => {
          content += token
          pushStreamContent(content)
        },
        onMessageDone: (agent, finalContent) => {
          content += '\n'
          pushStreamContent(content)
        },
        onDone: (finalContent) => {
          setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
          setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))
          setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
          const assistantMsg = {
            createdAt: Date.now(),
            role: 'assistant',
            content: content,
            sources: [],
            toolResults: {},
            toolsUsed: [],
          }
          saveMessage(convId, assistantMsg).catch(e => console.error('Failed to persist reply', e))
          setConversations(prev => prev.map(c =>
            c.clientId === targetClientId ? { ...c, id: convId, messages: [...updated.messages, assistantMsg] } : c
          ))
          setStreamingMap(prev => ({ ...prev, [targetClientId]: '' }))
        },
        onError: (err) => {
          setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
          setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))
          setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
          setConversations(prev => prev.map(c =>
            c.clientId === targetClientId
              ? { ...c, id: convId, messages: [...updated.messages, { role: 'assistant', error: String(err), content: '' }] }
              : c
          ))
          setStreamingMap(prev => ({ ...prev, [targetClientId]: '' }))
        }
      })
      return
    }

    await streamMessage(
      {
        message: finalText,
        messages: updated.messages,
        tools: useTools,
        use_tools: useTools,
        use_web_search: useWeb,
        system_prompt: getSystemPrompt(finalText, targetConv.systemPrompt),
        temperature: useTemp,
        provider: useProvider,
        model: useModel || undefined,
        channel: 'chat',
        image: sentImage?.dataUrl || null,
      },
      (token) => { content += token; pushStreamContent(content); setStatusMap(prev => ({ ...prev, [targetClientId]: '' })) },
      (s) => { sources = s },
      (_final, meta) => {
        setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
        setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))
        setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
        if (!content.trim() && meta?.aborted) {
          setStreamingMap(prev => ({ ...prev, [targetClientId]: '' }))
          setActiveTools([])
          setPendingToolResults({})
          return
        }
        const finalTrace = (meta?.trace?.length ? meta.trace : traceRef.current)
        const assistantMsg = {
          createdAt: Date.now(),
          role: 'assistant',
          content: meta?.aborted ? content + '\n\n_[stopped]_' : content,
          sources,
          toolResults: { ...toolRunRef.current.results },
          toolsUsed: [...toolRunRef.current.used],
          trace: finalTrace.length ? [...finalTrace] : undefined,
          provider: meta?.provider || useProvider,
          model: meta?.model || useModel || (useProvider === 'local' ? DEFAULT_LOCAL_MODEL : undefined),
        }
        saveMessage(convId, assistantMsg).catch(e => console.error('Failed to persist reply', e))
        setConversations(prev => prev.map(c =>
          c.clientId === targetClientId ? { ...c, id: convId, messages: [...updated.messages, assistantMsg] } : c
        ))
        setStreamingMap(prev => ({ ...prev, [targetClientId]: '' }))
        setActiveTools([])
        setPendingToolResults({})
        getTodayUsage().then(setUsage).catch(() => {})
        chatCountRef.current++
        if (adsConfigured && chatCountRef.current % 10 === 0) setShowAd(true)
      },
      (err) => {
        setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
        setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))
        setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
        if (isRetiredModelError(err)) {
          pruneRetiredModel(useProvider, useModel).then(() => {
            setModel('')
            refreshModels()
            getAllProviderStatus().then(setProviderStatus)
          })
        }
        setConversations(prev => prev.map(c =>
          c.clientId === targetClientId
            ? { ...c, id: convId, messages: [...updated.messages, { role: 'assistant', error: String(err), content: '' }] }
            : c
        ))
        setStreamingMap(prev => ({ ...prev, [targetClientId]: '' }))
      },
      (status) => { setStatusMap(prev => ({ ...prev, [targetClientId]: status })) },
      (streamId) => { setStreamIdMap(prev => ({ ...prev, [targetClientId]: streamId })) },
      (detectedTools, args) => {
        setActiveTools(detectedTools)
        for (const t of detectedTools) {
          if (!toolRunRef.current.used.includes(t)) toolRunRef.current.used.push(t)
          traceRef.current.push({ tool: t, args: args || undefined, status: 'running' })
        }
      },
      (toolName, toolResult) => {
        toolRunRef.current.results[toolName] = toolResult
        setPendingToolResults(prev => ({ ...prev, [toolName]: toolResult }))
        const step = [...traceRef.current].reverse().find(s => s.tool === toolName && s.status === 'running')
        if (step) step.status = toolResult?.success === false ? 'error' : 'done'
      }
    )
  }

  /** An image is not a document: it goes to the model's eyes, not to BM25. */
  const attachImage = useCallback(async (file) => {
    try {
      const prepared = await prepareImage(file)
      setAttachedImage(prepared)
      setAttachedFile(null)
    } catch (err) {
      setErrorModalMsg(`That image could not be read.\n\n${err.message}`)
    }
  }, [])

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (isImageFile(file)) { attachImage(file); return }
    setAttachedImage(null)
    setAttachedFile(file)
  }

  const handlePaste = (e) => {
    const img = imageFromClipboard(e)
    if (img) { e.preventDefault(); attachImage(img) }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const img = imageFromDrop(e)
    if (img) { attachImage(img); return }
    const file = e.dataTransfer?.files?.[0]
    if (file) setAttachedFile(file)
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

  /**
   * Start a face-to-face call. Live is a websocket protocol only Gemini speaks,
   * so it is gated on a Gemini key rather than the active chat provider.
   */
  const startLive = async () => {
    const cfg = await getLiveConfig()
    if (!cfg.available) {
      setErrorModalMsg('Live needs a model to talk to.\n\nSelect a provider with a saved API key in Settings, or use the On-device model (no key needed). Live works with any provider — Groq, NVIDIA, OpenRouter, OpenAI, Gemini, or local.')
      return
    }
    setLiveConfig({ ...cfg, persona: getSystemPrompt() })
  }

  /** Write each completed spoken turn into the current conversation. */
  const saveLiveTurn = useCallback(async (role, text) => {
    const msg = { role, content: text, sources: [], createdAt: Date.now(), live: true }
    try {
      // A call owns its own conversation — it must not depend on, or write
      // into, whatever chat happens to be open.
      let id = liveConvRef.current
      if (!id) {
      id = await createConversation(`Live — ${new Date().toLocaleString()}`, null, provider, model)
      liveConvRef.current = id
      }
      await saveMessage(id, msg)
    } catch (e) { console.error('Failed to persist live turn', e) }
  }, [])

  const regenerate = async () => {
    if (isStreamingHere) return
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

  const handleBackup = async () => {
    try {
      const c = await downloadBackup()
      setErrorModalMsg(`Exported ${c.conversations} conversations, ${c.messages} messages and ${c.documents} documents.\n\nAPI keys are not included — add them again after restoring.`)
    } catch (e) { setErrorModalMsg(e.message) }
  }

  const handleRestore = async (file) => {
    setRestoreModal({ file })
  }

  const doRestore = async (file, mode) => {
    setRestoreModal(null)
    try {
      const c = await restoreBackup(file, mode)
      await loadConversations()
      refreshDocs()
      setErrorModalMsg(`Restored ${c.conversations} conversations, ${c.messages} messages and ${c.documents} documents.`)
    } catch (e) { setErrorModalMsg(e.message) }
  }

  /**
   * Compare mode: send the same prompt to two models at once. Useful when
   * choosing between models that only differ under real use.
   */
  const runCompare = async (text = input) => {
    const prompt = text.trim()
    if (!prompt || comparing) return
    const [a, b] = compareModels
    if (!a || !b) { setErrorModalMsg('Pick two models to compare.'); return }

    const userMsg = { role: 'user', content: prompt, createdAt: Date.now() }
    const updated = {
      ...conv,
      messages: [...(conv?.messages || []), userMsg],
    }
    setConversations(prev => prev.map((c, i) => i === activeIdx ? updated : c))

    setComparing(true)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setArena({ modelA: a, modelB: b, responseA: '', responseB: '', streamingA: true, streamingB: true, prompt })

    await Promise.all([runCompareSide(a, 'A', prompt), runCompareSide(b, 'B', prompt)])
    setComparing(false)
    setTimeout(() => scrollToBottom(), 100)
  }

  /** Run (or retry) a single compare side. */
  const runCompareSide = (mdl, side, prompt) => {
    setArena(prev => ({ ...prev, [`response${side}`]: '', [`streaming${side}`]: true }))
    return new Promise(resolve => {
      let out = ''
      streamMessage(
        { message: prompt, messages: [], provider, model: mdl, use_tools: false, use_web_search: false,
          temperature, channel: `compare-${side}` },
        (t) => { out += t; setArena(prev => ({ ...prev, [`response${side}`]: out })) },
        () => {},
        () => { setArena(prev => ({ ...prev, [`streaming${side}`]: false })); resolve() },
        (err) => {
          setArena(prev => ({ ...prev, [`response${side}`]: `Error: ${err}`, [`streaming${side}`]: false }))
          resolve()
        },
        () => {}, () => {}, () => {}, () => {},
      )
    })
  }

  const retryCompareSide = (side) => {
    const mdl = side === 'A' ? arena?.modelA : arena?.modelB
    if (mdl && arena?.prompt) runCompareSide(mdl, side, arena.prompt)
  }

  const handlePickCompareResponse = (side, content, modelName) => {
    const convId = conv?.id
    const assistantMsg = {
      createdAt: Date.now(),
      role: 'assistant',
      content: content + `\n\n_[Chosen from Model ${side}: ${modelName}]_`,
      sources: [],
    }
    if (convId) saveMessage(convId, assistantMsg).catch(() => {})
    setConversations(prev => prev.map((c, i) =>
      i === activeIdx ? { ...c, messages: [...(c.messages || []), assistantMsg] } : c
    ))
    setArena(null)
  }

  /**
   * Edit an earlier turn without losing the thread it produced.
   *
   * The original conversation is left exactly as it was; everything before the
   * edited turn is copied into a new one, which becomes active. So a different
   * question is an extra branch, not a deletion — and the old answer is still
   * one click away in the sidebar.
   */
  const editAndResend = useCallback(async (index, text) => {
    if (isStreamingHere) return
    const source = conversations[activeIdx]
    const msgs = source?.messages || []

    // Find the actual index of the last user message so we rewind in-place
    // when editing it (nothing after it is worth keeping as a separate branch).
    // The old `-2` heuristic was wrong: it branched even when editing the very
    // last turn once there was one assistant reply sitting after it.
    const lastUserIdx = msgs.reduceRight(
      (found, m, i) => found >= 0 ? found : m.role === 'user' ? i : -1, -1
    )
    const isLastTurn = index >= lastUserIdx

    // The very last turn has nothing after it worth preserving: rewind in place.
    if (isLastTurn) {
      const kept = msgs.slice(0, index)
      setConversations(prev => prev.map((c, i) => i === activeIdx ? { ...c, messages: kept } : c))
      if (source?.id) { try { await trimConversationFrom(source.id, index) } catch {} }
      setInput(text)
      textareaRef.current?.focus()
      autoResize()
      return
    }

    try {
      const forked = await branchConversation(source?.id, index)
      setConversations(prev => [{ ...forked, messages: (forked.messages || []).map(hydrate) }, ...prev])
      setActiveIdx(0)
      setVisibleCount(WINDOW_STEP)
      setInput(text)
      textareaRef.current?.focus()
      autoResize()
      showToast('Branched — the original chat is untouched')
    } catch (e) {
      setErrorModalMsg(`Could not branch this conversation.\n\n${e.message}`)
    }
  }, [loadingMap, conversations, activeIdx])

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

  const paletteCommands = useMemo(() => {
    const cmds = [
      { id: 'new', group: 'Chat', label: 'New chat', hint: 'Ctrl+Shift+O', run: newChat },
      { id: 'regen', group: 'Chat', label: 'Regenerate last reply', run: regenerate },
      { id: 'export', group: 'Chat', label: 'Export this chat as markdown', run: handleExport },
      { id: 'backup', group: 'Data', label: 'Export all data (backup)', run: handleBackup },
      { id: 'import', group: 'Data', label: 'Import a backup file', run: () => backupInput.current?.click() },
      { id: 'theme', group: 'View', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, run: () => setTheme(t => t === 'dark' ? 'light' : 'dark') },
      { id: 'settings', group: 'View', label: 'Open settings', run: () => { setSidebarOpen(true); setSettingsOpen(true) } },
      { id: 'personalise', group: 'View', label: 'Personalise — voice & interface', run: () => setShowPersonalise(true) },
      { id: 'skills', group: 'View', label: 'Skills & workflows', run: () => setShowSkills(true) },
      { id: 'tools', group: 'Settings', label: `${tools ? 'Disable' : 'Enable'} AI tools`, run: () => setToolsEnabled(!tools) },
      { id: 'web', group: 'Settings', label: `${webSearch ? 'Disable' : 'Enable'} web research`, run: () => setWebSearch(!webSearch) },
      { id: 'route', group: 'Settings', label: `${autoRoute ? 'Disable' : 'Enable'} auto-routing`, run: () => setAutoRoute(!autoRoute) },
      { id: 'autopick', group: 'Models', label: 'Auto-pick the fastest model', run: () => handleAutoPick() },
    ]
    for (const [id, p] of Object.entries(models)) {
      cmds.push({
        id: `prov-${id}`, group: 'Provider', label: `Switch to ${p.name}`,
        hint: p.available ? undefined : 'no key', run: () => setProvider(id),
      })
    }
    for (const m of (models[provider]?.models || []).slice(0, 100)) {
      const ms = measuredModels[m]
      cmds.push({
        id: `model-${m}`, group: 'Model', label: m,
        hint: ms?.success ? formatLatency(ms.latencyMs) : undefined,
        run: () => chooseModel(m),
      })
    }
    conversations.forEach((c, i) => {
      if (!c.messages.length) return
      cmds.push({ id: `conv-${i}`, group: 'Chat', label: c.title, hint: `${c.messages.length} messages`, run: () => switchChat(i) })
    })
    return cmds
  }, [models, provider, measuredModels, conversations.length, conversations.map(c => `${c.title}:${c.messages?.length}`).join('|'), theme, tools, webSearch, autoRoute])

  const providerEntries = Object.entries(models)
  const providerModels = models[provider]?.models || []

  // Conversation filter — matches title and message text (memoised to prevent full-tree scan on every render)
  const visibleConvs = useMemo(() => {
    return conversations
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        if (!convQuery.trim()) return true
        const q = convQuery.toLowerCase()
        return c.title.toLowerCase().includes(q) ||
          c.messages.some(m => (m.content || '').toLowerCase().includes(q))
      })
  }, [conversations, convQuery])

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
            <button className="auth-btn" onClick={requestSignIn} aria-label="Sign in">
              <LogIn size={14} /> Sign In
            </button>
          )}
        </div>

        <div className="project-bar">
          <select value={activeProject ?? ''} aria-label="Project"
            onChange={e => chooseProject(e.target.value ? Number(e.target.value) : null)}>
            <option value="">All chats</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="icon-btn" onClick={addProject} aria-label="New project" title="New project"><Plus size={13} /></button>
          {activeProject && (
            <button className="icon-btn" onClick={() => removeProject(activeProject)} aria-label="Delete project" title="Delete project"><Trash2 size={12} /></button>
          )}
        </div>

        <button type="button" className="new-chat-btn" onClick={(e) => { e.preventDefault(); newChat(); }} aria-label="New chat"><Plus size={14} /> New Chat</button>

        {conversations.length > 3 && (
          <div className="conv-search">
            <Search size={12} />
            <input aria-label="Search conversations" value={convQuery} onChange={e => setConvQuery(e.target.value)}
              placeholder="Search chats..." />
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
                <input className="conv-rename" aria-label="Conversation title" autoFocus value={renameText}
                  onChange={e => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingIdx(null)
                  }} />
              ) : (
                <span className="conv-title" title={c.title}>
                  {c.title}
                  {!!(c.clientId && loadingMap[c.clientId]) && <span className="conv-streaming-dot" title="Generating response…" />}
                </span>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <label style={{ margin: 0 }}><Sparkles size={12} /> Persona</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {activeTemplate.startsWith('tmpl-') && (
                <button className="small-btn delete-persona-btn" style={{ padding: '2px 6px', fontSize: '10px', color: '#ff6b6b', height: 'auto', background: 'rgba(255,107,107,0.1)', border: 'none', borderRadius: '3px', cursor: 'pointer' }} onClick={() =>
                  showConfirm('Delete this custom persona?', async () => {
                    await deleteTemplate(activeTemplate)
                    setActiveTemplate('default')
                    await setPref('persona', 'default')
                    refreshTemplates()
                  }, { okLabel: 'Delete' })
                } title="Delete current custom persona">
                  Delete
                </button>
              )}
              <button className="small-btn" style={{ padding: '2px 6px', fontSize: '10px', height: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-color, inherit)' }} onClick={() => setShowPersonaModal(true)} title="Create custom persona">
                <Plus size={11} /> Custom
              </button>
            </div>
          </div>
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
          <select value={provider} aria-label="Provider" onChange={e => {
            const nextProvider = e.target.value
            setProvider(nextProvider)
            chooseModel('', nextProvider)
          }}>
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

          {provider === 'local' ? (
            <LocalModelPanel
              model={model || DEFAULT_LOCAL_MODEL}
              onModelChange={chooseModel}
              onReady={(m) => { chooseModel(m); refreshModels() }} />
          ) : (
            <>
              <label>API Key {models[provider]?.key_url && <a href={models[provider].key_url} target="_blank" rel="noopener" style={{fontSize:10,color:'var(--accent)'}}>(get free key)</a>}</label>
              {keyInfo[provider]?.saved ? (
            <div className="key-saved">
              <div className="key-saved-row">
                <Key size={12} />
                <code>{keyInfo[provider].masked}</code>
                <button className="link-btn" onClick={() => forgetKey(provider)}>Forget</button>
              </div>
              <div className="key-where">
                <span title="Stored in this browser's IndexedDB">
                  <Smartphone size={10} /> This device
                </span>
                <span title={keyInfo[provider].syncedAt
                  ? 'Encrypted and synced to your account'
                  : 'Not uploaded anywhere'}>
                  {keyInfo[provider].syncedAt
                    ? <><Cloud size={10} /> Cloud (encrypted)</>
                    : <><CloudOff size={10} /> Not in cloud</>}
                </span>
              </div>
            </div>
          ) : (
            <div className="key-none">No key stored for this provider.</div>
          )}

          <input type="password" aria-label={`API key for ${models[provider]?.name || provider}`}
            placeholder={keyInfo[provider]?.saved ? 'Replace key…' : 'Enter API key...'}
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

          </>
          )}

          <div className="cloud-sync" hidden={provider === 'local'}>
            {!user ? (
              <span className="cloud-hint">
                <CloudOff size={11} /> Keys stay on this device.
                <button className="link-btn" onClick={requestSignIn}>Sign in</button> to use them everywhere.
              </span>
            ) : (
              <>
                <span className="cloud-hint">
                  <Cloud size={11} /> Keys sync to your account
                  <button className="link-btn" onClick={handleSyncNow} disabled={syncing}>
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </button>
                </span>
                <span className="cloud-note">
                  Encrypted and tied to your Google account — sign in on any device and your keys
                  are there. Nothing to remember.
                </span>
              </>
            )}
          </div>

          {/* ── Model ─────────────────────────────────────────── */}
          <div className="sidebar-section-title">Model {providerModels.length > 0 && <span className="sidebar-count">{providerModels.length}</span>}</div>
          <ModelPicker
            models={providerModels}
            value={model}
            measured={measuredModels}
            formatLatency={formatLatency}
            disabled={!models[provider]?.available}
            onChange={chooseModel} />

          <button className="small-btn auto-pick wide" onClick={() => handleAutoPick()}
            disabled={autoPicking || !models[provider]?.available}
            title="Measure a few models and select the fastest that works">
            <Zap size={11} /> {autoPicking ? (autoPickMsg || 'Testing…') : 'Auto-pick fastest'}
          </button>
          <div className="toggle-row">
            <label title="Pick a model per message from those measured as working">
              <Zap size={12} /> Auto-route models
            </label>
            <label className="toggle" aria-label="Toggle per-message model routing">
              <input type="checkbox" checked={autoRoute} onChange={e => setAutoRoute(e.target.checked)} /><span className="slider" />
            </label>
          </div>
          {autoRoute && (
            <div className="route-note">
              Code questions go to a code model, quick questions to a fast one. Only models that
              passed a speed check are used — run Auto-pick to measure more.
            </div>
          )}

          {/* ── Response ──────────────────────────────────────── */}
          <div className="sidebar-section-title">Response</div>
          <label className="slider-label">Temperature <span className="sidebar-count">{temperature}</span></label>
          <input type="range" aria-label="Response randomness (temperature)" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />

          {/* ── Tools ─────────────────────────────────────────── */}
          <div className="sidebar-section-title">Tools</div>
          <div className="toggle-row">
            <label><Wrench size={12} /> AI Tools</label>
            <label className="toggle" aria-label="Toggle AI tools">
              <input type="checkbox" checked={tools} onChange={e => setToolsEnabled(e.target.checked)} /><span className="slider" />
            </label>
          </div>
          {tools && (
            <button className="small-btn tool-picker-toggle wide" onClick={() => setShowToolPicker(true)}>
              <Wrench size={11} /> Choose &amp; Configure Tools
              <span className="tool-count">
                {toolPrefs.filter(t => t.enabled).length}/{toolPrefs.length}
              </span>
            </button>
          )}

          {/* ── More ──────────────────────────────────────────── */}
          <div className="sidebar-section-title">More</div>
          <button className="small-btn wide" onClick={() => setShowPersonalise(true)}>
            <Sliders size={12} /> Personalise — voice &amp; interface
          </button>
          <button className="small-btn wide" onClick={() => setShowSkills(true)}>
            <Sparkles size={12} /> Skills &amp; workflows
          </button>
          <div className="toggle-row">
            <label><Globe size={12} /> Web Research</label>
            <label className="toggle" aria-label="Toggle web research">
              <input type="checkbox" checked={webSearch} disabled={!tools}
                onChange={e => setWebSearch(e.target.checked)} /><span className="slider" />
            </label>
          </div>
          <div className="toggle-row">
            <label title="If a provider times out or rate-limits, retry on another provider that has a key">
              <RefreshCw size={12} /> Provider fallback
            </label>
            <label className="toggle" aria-label="Toggle provider fallback">
              <input type="checkbox" checked={fallback} onChange={e => setFallback(e.target.checked)} /><span className="slider" />
            </label>
          </div>

          {features.usage && Object.keys(usage).length > 0 && (
            <div className="usage-row">
              <label><Zap size={12} /> Today's usage <span className="usage-approx">(approx.)</span></label>
              {Object.entries(usage).map(([pid, u]) => (
                <div key={pid} className="usage-item">
                  <span className="usage-provider">{models[pid]?.name || pid}</span>
                  <span className="usage-nums">
                    {u.messages} msg · {((u.in + u.out) / 1000).toFixed(1)}k tokens
                  </span>
                </div>
              ))}
            </div>
          )}

          {storage && (
            <div className="usage-row storage-row">
              <div className="storage-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={12} /> On-device storage
                </label>
                <button className="small-btn info-btn" style={{ padding: '2px 6px', fontSize: '10px', height: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-color, inherit)' }} onClick={() => setShowStorageDetails(!showStorageDetails)}>
                  {showStorageDetails ? 'Hide' : 'What & Where?'}
                </button>
              </div>
              <div className="usage-item" style={{ marginTop: '4px' }}>
                <span className="usage-provider">
                  {formatBytes(storage.used)} used
                  {storage.quota ? ` of ${formatBytes(storage.quota)}` : ''}
                </span>
                <span 
                  className={`usage-nums storage-badge ${storage.persisted ? 'persisted' : 'best-effort'}`} 
                  style={{ cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={async () => {
                    if (!storage.persisted) {
                      const granted = await requestPersistence()
                      setStorage(prev => prev ? { ...prev, persisted: granted } : null)
                    }
                  }}
                  title={storage.persisted
                    ? 'Your browser will not evict this data automatically'
                    : 'Click to request protection. The browser may clear this data when disk space runs low.'}
                >
                  {storage.persisted ? 'protected' : 'best-effort (protect?)'}
                </span>
              </div>
              {showStorageDetails && (
                <div className="storage-details" style={{ fontSize: '11px', marginTop: '8px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <strong>What is stored here:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                      <li><strong>WebLLM Cache:</strong> Local chat model weights (Qwen/Llama) if downloaded.</li>
                      <li><strong>IndexedDB:</strong> Your local chat conversations, documents, and settings.</li>
                      <li><strong>Chrome Native Model:</strong> Chrome's built-in Gemini Nano model weights (typically stored natively in User Data).</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Chrome Native Model Path (Windows):</strong>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                      <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px', wordBreak: 'break-all', flex: 1, fontFamily: 'monospace' }}>
                        %LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel
                      </code>
                      <button className="small-btn" style={{ padding: '2px 6px', height: 'auto' }} onClick={() => {
                        navigator.clipboard.writeText('%LOCALAPPDATA%\\Google\\Chrome\\User Data\\OptGuideOnDeviceModel')
                          .then(() => showToast('Path copied to clipboard'))
                          .catch(() => showToast('Could not copy — try manually'))
                      }}>Copy</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    <button className="small-btn" style={{ flex: 1, padding: '4px' }} onClick={async () => {
                      if (confirm('Clear all cached WebLLM local models from the browser storage?')) {
                        await clearLocalModelCache()
                        const rep = await storageReport()
                        setStorage(rep)
                        showToast('Model cache cleared')
                      }
                    }}>Clear model cache</button>
                    <button className="small-btn" style={{ flex: 1, padding: '4px' }} onClick={() => {
                      setErrorModalMsg('Configure on-device AI settings:\n\n• Type chrome://flags in your address bar and search for "on-device AI".\n• Type chrome://components to update optimization guide components.')
                    }}>Browser flags info</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="backup-row">
            <label><Download size={12} /> Backup</label>
            <div className="backup-actions">
              <button className="small-btn" onClick={handleBackup}>Export all</button>
              <button className="small-btn" onClick={() => backupInput.current?.click()}>Import</button>
              <input ref={backupInput} type="file" accept="application/json" hidden
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleRestore(f) }} />
            </div>
            <span className="backup-note">
              Chats, documents and settings — everything except API keys, which never go in a file.
            </span>
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
            {isDesktop() && (
              <div className="desktop-folder-indicator" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginRight: 8, color: 'var(--text-secondary)' }}>
                <Folder size={15} />
                <span title={grantedRoot || 'No working folder granted'} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {grantedRoot ? grantedRoot.split(/[/\\]/).pop() || grantedRoot : 'No folder'}
                </span>
                <button
                  className="small-btn"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={handleGrantFolder}
                  title="Change granted working folder for local filesystem tools (create/edit/read files)"
                >
                  {grantedRoot ? 'Change' : 'Grant folder'}
                </button>
              </div>
            )}
            <button className="icon-btn" onClick={handleExport} title="Export chat" aria-label="Export chat"><Download size={18} /></button>
            <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="messages" ref={scrollerRef} onScroll={onScroll}>
          {allMessages.length === 0 && !isStreamingHere && !arena ? (
            <div className="welcome">
              <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}><YogatikLogo size={48} /> Yogatik</h1>
              <div className="hero-buttons">
                <button
                  className="hero-btn primary"
                  onClick={() => setShowDemoModal(true)}
                >
                  <Sparkles size={16} /> Take a Quick Demo
                </button>
                <button
                  className="hero-btn secondary"
                  onClick={() => setShowDownloadModal(true)}
                >
                  <Download size={16} /> Install App
                </button>
              </div>
              <div className="tool-badges">
                {Object.entries(TOOL_ICONS).map(([name, Icon]) => (
                  <span key={name} className="tool-badge"><Icon size={14} /> {name.replace('_', ' ')}</span>
                ))}
              </div>
              {!user && <p className="welcome-hint">Sign in to save your chat history across sessions.</p>}
              {localBoot && !localBoot.ready && !localBoot.error ? (
                <div className="setup-card">
                  <Cpu size={18} />
                  <h3>Setting up AI on this device</h3>
                  <p>
                    No account, no API key, nothing sent anywhere: the model runs on your GPU.
                    One-time download of about {LOCAL_MODELS[DEFAULT_LOCAL_MODEL]?.size || '350 MB'},
                    cached by your browser — later visits start instantly and work offline.
                  </p>
                  <div className="local-progress">
                    <div className="local-bar">
                      <div className="local-bar-fill" style={{ width: `${Math.round((localBoot.progress || 0) * 100)}%` }} />
                    </div>
                    <span className="local-progress-text">
                      {Math.round((localBoot.progress || 0) * 100)}% — {localBoot.text || 'Working…'}
                    </span>
                  </div>
                  <div className="setup-actions">
                    <button className="small-btn" onClick={() => { setSidebarOpen(true); setSettingsOpen(true) }}>
                      I have an API key instead
                    </button>
                  </div>
                </div>
              ) : !models[provider]?.available ? (
                <div className="setup-card">
                  <Key size={18} />
                  <h3>Add an API key to start</h3>
                  <p>
                    Yogatik runs entirely in your browser and talks to the model provider directly,
                    so it needs your own key. Nothing is sent anywhere else.
                  </p>
                  {localBoot?.error && (
                    <p className="local-error">On-device AI could not start here: {localBoot.error}</p>
                  )}
                  <div className="setup-actions">
                    <a className="btn-primary setup-btn" href="https://build.nvidia.com" target="_blank" rel="noopener">
                      Get a free NVIDIA key
                    </a>
                    <button className="small-btn" onClick={() => { setSidebarOpen(true); setSettingsOpen(true) }}>
                      I have a key — open settings
                    </button>
                    <button className="small-btn" onClick={() => {
                      webGpuDetails().then(g => {
                        if (!g?.available) {
                          setErrorModalMsg(`Your browser or device cannot run the on-device model.\n\n${g?.reason || 'WebGPU is unavailable.'}`)
                          return
                        }
                        setProvider('local')
                        setSidebarOpen(true)
                        setSettingsOpen(true)
                      }).catch(err => {
                        setErrorModalMsg(`Could not check on-device model support.\n\n${err.message}`)
                      })
                    }}>
                      Or run a model on this device
                    </button>
                  </div>
                  <span className="setup-note">NVIDIA gives free credits and a wide model catalogue (it routes through the app&apos;s proxy). Groq, Gemini, OpenRouter and OpenAI also work.</span>
                </div>
              ) : (
                <div className="suggestions" hidden={!features.suggestions}>
                  {SUGGESTIONS.map((s, i) => <div key={i} className="suggestion" onClick={() => send(s)}>{s}</div>)}
                </div>
              )}
            </div>
          ) : (
            <>
              {hiddenCount > 0 && (
                <button className="load-earlier" onClick={() => setVisibleCount(v => v + WINDOW_STEP)}>
                  Load {Math.min(hiddenCount, WINDOW_STEP)} earlier message{Math.min(hiddenCount, WINDOW_STEP) === 1 ? '' : 's'}
                  <span className="load-earlier-count"> · {hiddenCount} hidden</span>
                </button>
              )}
              {shownMessages.map((m, i) => {
                const absolute = i + (allMessages.length - shownMessages.length)
                const isLastAssistant = absolute === allMessages.length - 1 && m.role === 'assistant'
                return (
                  <MessageBubble key={absolute} msg={m} showToolCards={features.toolCards}
                    onTTS={handleTTS}
                    onOpenArtifact={(art) => setActiveArtifact(art)}
                    onRegenerate={isLastAssistant && !isStreamingHere ? regenerate : undefined}
                    onEdit={!isStreamingHere ? (text) => editAndResend(absolute, text) : undefined}
                    onRetry={m.error && !isStreamingHere ? regenerate : undefined} />
                )
              })}
              {/* Show pending tool results while streaming */}
              {features.toolCards && isStreamingHere && Object.keys(pendingToolResults).length > 0 && (
                <div className="message assistant">
                  <div className="tool-results">
                    {Object.entries(pendingToolResults).map(([tool, result]) => (
                      <ToolResultCard key={tool} tool={tool} result={result} />
                    ))}
                  </div>
                </div>
              )}
              {isStreamingHere && streamingContent && (() => {
                const { provider: useProvider = provider, model: useModel = model } = conv || {}
                return (
                <div className="message assistant">
                  <div className="message-role">
                    <span className="message-who">Yogatik</span>
                    {(useModel || useProvider) && (
                      <span className="msg-model-badge" title={`Generating with ${useProvider ? `${useProvider} (${useModel || 'default'})` : useModel}`}>
                        {useProvider && useModel ? `${useProvider} / ${useModel}` : (useModel || useProvider)}
                      </span>
                    )}
                  </div>
                  {activeTools.length > 0 && (
                    <div className="tools-used" style={{ marginTop: 4 }}>
                      {activeTools.map(t => {
                        const Icon = TOOL_ICONS[t] || Wrench
                        return <span key={t} className="tool-chip active"><Icon size={10} /> {t}</span>
                      })}
                    </div>
                  )}
                  {traceRef.current.length > 0 && (
                    <details className="activity-trace" open style={{ marginTop: 4 }}>
                      <summary>Steps, thoughts & actions taken ({traceRef.current.length} step{traceRef.current.length === 1 ? '' : 's'})</summary>
                      <ol>
                        {traceRef.current.map((s, i) => {
                          const Icon = TOOL_ICONS[s.tool] || Wrench
                          const arg = s.args && Object.keys(s.args).length
                            ? JSON.stringify(s.args).replace(/^{|}$/g, '').slice(0, 180)
                            : ''
                          const mark = s.status === 'error' ? '✕ Failed' : s.status === 'done' ? '✓ Completed' : '… In progress'
                          return (
                            <li key={i} className={`trace-step trace-${s.status}`}>
                              <Icon size={11} /> <span className="trace-tool">Step {i + 1}: Executed {s.tool}</span>
                              {arg && <div className="trace-args" style={{ fontSize: '10.5px', opacity: 0.85, marginTop: '2px' }}>Input: {arg}</div>}
                              <span className="trace-mark" style={{ fontSize: '10px', marginLeft: 'auto', fontWeight: 600 }}>{mark}</span>
                            </li>
                          )
                        })}
                      </ol>
                    </details>
                  )}
                  <div className="message-content"><ReactMarkdown>{streamingContent}</ReactMarkdown></div>
                </div>
                )
              })()}
              {isStreamingHere && !streamingContent && (() => {
                const { provider: useProvider = provider, model: useModel = model } = conv || {}
                // Build a friendly display name: prefer the real model ID, then provider name.
                const modelLabel = useModel
                  ? `${models[useProvider]?.name || useProvider} · ${useModel.split('/').pop()}`
                  : models[useProvider]?.name || useProvider
                return (
                  <div className="message assistant">
                    <div className="message-role">
                      <span className="message-who">Yogatik</span>
                      <span className="msg-model-badge" title={`Running: ${useProvider} / ${useModel || 'default'}`}>
                        {modelLabel}
                      </span>
                    </div>
                    {statusText && <div className="status-text">{statusText}</div>}
                    {activeTools.length > 0 && (
                      <div className="active-tools">
                        {activeTools.map(t => {
                          const Icon = TOOL_ICONS[t] || Wrench
                          return <span key={t} className="tool-chip active"><Icon size={10} /> {t}</span>
                        })}
                      </div>
                    )}
                    {traceRef.current.length > 0 && (
                      <div className="live-trace-steps" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {traceRef.current.map((s, i) => {
                          const Icon = TOOL_ICONS[s.tool] || Wrench
                          return (
                            <span key={i} className={`tool-chip trace-chip trace-${s.status}`} title={s.tool}>
                              <Icon size={10} />
                              {' '}{s.tool}
                              {s.status === 'running' ? ' …' : s.status === 'done' ? ' ✓' : ' ✕'}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <div className="typing"><span /><span /><span /></div>
                  </div>
                )
              })()}
              {arena && (
                <div className="arena-wrap">
                  <button className="small-btn arena-close" onClick={() => setArena(null)}
                    aria-label="Close comparison">
                    <X size={12} /> Close comparison
                  </button>
                  <ArenaView arenaData={arena} onOpenArtifact={setActiveArtifact} onPickResponse={handlePickCompareResponse} onRetry={retryCompareSide} />
                </div>
              )}
            </>
          )}
          <div ref={messagesEnd} />
          {!atBottom && (
            <button className="scroll-bottom" onClick={() => scrollToBottom()} aria-label="Scroll to latest">
              <ChevronDown size={14} /> {isStreamingHere ? 'Streaming…' : 'Latest'}
            </button>
          )}
        </div>

        <div className={`input-area${dragOver ? ' drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}>
          <div className="composer-top-bar">
            <div className="persona-chips">
              <span className="persona-chip-label">Persona:</span>
              {promptTemplates.slice(0, 4).map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`persona-chip ${activeTemplate === t.id ? 'active' : ''}`}
                  onClick={() => setActiveTemplate(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {docs.length > 0 && (
              <div
                className="rag-docs-badge"
                title={`${docs.length} document(s) in active project local RAG index`}
              >
                <FileText size={11} /> {docs.length} RAG doc{docs.length === 1 ? '' : 's'} active
              </div>
            )}
          </div>
          <div className="upload-area">
            {/* Which model answers is a per-message decision, so it belongs next
                to the message — not buried in the settings drawer. */}
            <ModelPicker
              compact
              prefix={models[provider]?.name || provider}
              models={providerModels}
              value={model}
              measured={measuredModels}
              formatLatency={formatLatency}
              disabled={!models[provider]?.available}
              onChange={chooseModel} />
            <label className="upload-btn">
              <Upload size={12} /> Upload
              <input type="file" hidden accept="image/*,.pdf,.txt,.md,.csv,.json,.log,.html,.xml,.rtf" onChange={handleUpload} />
            </label>
            {features.enhance && <button className={`small-btn ${isEnhancing ? 'pulsing' : ''}`} onClick={handleEnhancePrompt} disabled={!input.trim() || isEnhancing} title="Enhance prompt with AI" aria-label="Enhance prompt with AI">
              <Sparkles size={12} /> {isEnhancing ? 'Enhancing...' : 'Enhance'}
            </button>}
            {recognitionRef.current && (
              <button className={`voice-btn ${listening ? 'listening' : ''}`} onClick={toggleVoiceInput} title={listening ? 'Stop listening' : 'Voice input'}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}>
                {listening ? <MicOff size={12} /> : <Mic size={12} />}
                {listening ? 'Stop' : 'Voice'}
              </button>
            )}
            {isStreamingHere && (
              <button className="stop-btn" onClick={handleStop} title="Stop generation (Esc)" aria-label="Stop generation (Esc)">
                <Square size={12} /> Stop (Esc)
              </button>
            )}
            {features.compare && (
              <button className={`small-btn ${compareMode ? 'active' : ''}`}
                onClick={() => {
                  setCompareMode(v => {
                    const next = !v
                    if (next && (!compareModels[0] || !compareModels[1])) {
                      const avail = models[provider]?.models || []
                      const m1 = avail[0] || model || ''
                      const m2 = avail[1] || avail[0] || model || ''
                      setCompareModels([m1, m2])
                    }
                    return next
                  })
                }} title="Send one prompt to two models">
                <GitCompare size={12} /> Compare
              </button>
            )}
            {features.live && (
              <button className="small-btn live-start" onClick={startLive}
                title="Talk face to face — live voice and video">
                <Radio size={12} /> Live
              </button>
            )}
            {!isStreamingHere && conv?.messages?.some(m => m.role === 'assistant') && (
              <button className="small-btn" onClick={regenerate}
                title="Regenerate last response" aria-label="Regenerate last response">
                <RefreshCw size={12} /> Regenerate
              </button>
            )}
          </div>
          {compareMode && (
            <div className="compare-bar">
              <select value={compareModels[0]} onChange={e => setCompareModels([e.target.value, compareModels[1]])} aria-label="Model A">
                <option value="">Model A…</option>
                {(models[provider]?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={compareModels[1]} onChange={e => setCompareModels([compareModels[0], e.target.value])} aria-label="Model B">
                <option value="">Model B…</option>
                {(models[provider]?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button className="small-btn btn-primary" onClick={() => runCompare()} disabled={comparing || !input.trim()}>
                {comparing ? 'Running…' : 'Run both'}
              </button>
            </div>
          )}
          {updateReady && (
            <div className="update-banner" role="status">
              <RefreshCw size={12} /> A new version is ready.
              <button className="small-btn" onClick={() => { const apply = updateReady; setUpdateReady(null); apply() }}>
                Reload
              </button>
              <button className="icon-btn" onClick={() => setUpdateReady(null)} aria-label="Dismiss update notice">
                <X size={12} />
              </button>
            </div>
          )}
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
          {attachedImage && (() => {
            const visionCandidate = modelSees === false ? (providerModels || []).find(m => looksVisionCapable(m)) : null
            return (
              <div className="attached-file attached-image">
                <img src={attachedImage.thumb} alt={attachedImage.name} className="attach-thumb" />
                <span className="attached-name">
                  {attachedImage.name}
                  <em>{attachedImage.width}×{attachedImage.height}{modelSees === false ? ' — read on-device (text model active)' : ''}</em>
                </span>
                {visionCandidate && (
                  <button
                    type="button"
                    className="small-btn btn-vision-switch"
                    onClick={() => chooseModel(visionCandidate)}
                    title={`Switch to ${visionCandidate} for full native vision`}
                    style={{
                      fontSize: '11px', padding: '3px 8px', marginLeft: 'auto', marginRight: '6px',
                      background: 'var(--accent-color, #ff6b35)', color: '#fff', border: 'none',
                      borderRadius: '5px', cursor: 'pointer', fontWeight: 600, display: 'inline-flex',
                      alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                    }}
                  >
                    <Sparkles size={11} /> Switch to {visionCandidate.split('/').pop()}
                  </button>
                )}
                <button className="icon-btn" onClick={() => setAttachedImage(null)} title="Remove image" aria-label="Remove image"><X size={12} /></button>
              </div>
            )
          })()}
          <div className="input-wrapper">
            <textarea ref={textareaRef} aria-label="Message" value={input} onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown} onPaste={handlePaste}
              data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
              placeholder={attachedImage
                ? 'Ask about this image… (or just send)'
                : attachedFile ? `Describe what to do with ${attachedFile.name}...`
                : 'Ask anything… paste or drop an image too'} rows={1} />
            <button
              type="button"
              className={`voice-mic-btn ${listening ? 'listening' : ''}`}
              onClick={toggleVoiceInput}
              title={listening ? 'Listening... Speak now' : 'Voice dictation'}
              aria-label={listening ? 'Stop dictation' : 'Start voice dictation'}
              style={{
                background: listening ? '#ef4444' : 'transparent',
                color: listening ? '#fff' : 'var(--text-secondary, #a6adc8)',
                border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 6, transition: 'all 0.2s ease',
              }}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button className="send-btn" aria-label="Send message" onClick={() => send()} disabled={isStreamingHere || !online || (!input.trim() && !attachedFile && !attachedImage)}>
              <Send size={18} />
            </button>
          </div>

          <div className="composer-footer">
            <span className="disclaimer">
              AI can make mistakes — please check important responses.
            </span>
            <a className="feedback-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Yogatik feedback')}`}>
              Feedback
            </a>
          </div>
        </div>
      </main>

      {showProviderModal && <ProviderModal
        onClose={() => { setShowProviderModal(false); setEditingProvider(null) }}
        onSaved={() => { refreshModels(); setEditingProvider(null) }}
        editProvider={editingProvider ? { id: editingProvider, ...models[editingProvider] } : null}
      />}
      {liveConfig && (
        <LiveView
          engine={liveConfig.engine}
          provider={liveConfig.provider}
          modelCanSee={liveConfig.modelCanSee}
          apiKey={liveConfig.apiKey}
          model={liveConfig.model}
          voice={liveConfig.voice}
          voiceEngine={liveConfig.voiceEngine}
          fallbacks={liveConfig.fallbacks}
          persona={liveConfig.persona}
          disabledTools={liveConfig.disabledTools}
          features={features}
          onTranscript={saveLiveTurn}
          availableModels={models[liveConfig.provider]?.models || []}
          onModelChange={async (newModel) => {
            chooseModel(newModel, liveConfig.provider)
            const status = await getVisionStatus(liveConfig.provider, newModel).catch(() => ({ cached: false, guessed: false }))
            const visionCapable = status.cached ?? status.guessed
            setLiveConfig(prev => prev ? { ...prev, model: newModel, modelCanSee: visionCapable } : null)
          }}
          onEnd={() => {
            setLiveConfig(null)
            liveConvRef.current = null
            loadConversations()
          }}
        />
      )}
      {showSkills && (
        <SkillsPanel
          onClose={() => setShowSkills(false)}
          onRunWorkflow={runWorkflowNow}
        />
      )}
      {showPersonalise && (
        <PersonalisePanel
          prefs={prefs}
          onChange={updatePref}
          onClose={() => setShowPersonalise(false)}
        />
      )}
      {showToolPicker && (
        <Modal
          title="AI Tools Configuration"
          icon={<Wrench size={18} />}
          onClose={() => setShowToolPicker(false)}
          footer={
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setShowToolPicker(false)}>Done</button>
            </div>
          }
        >
          <div className="tool-picker-modal-content" style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Enable or disable specific tools for the AI assistant ({toolPrefs.filter(t => t.enabled).length} of {toolPrefs.length} active).
            </p>
            {[...new Set(toolPrefs.map(t => t.group))].map(group => {
              const inGroup = toolPrefs.filter(t => t.group === group)
              const allOn = inGroup.every(t => t.enabled)
              return (
                <div key={group} className="tool-group-card" style={{ marginBottom: 16, background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
                  <div className="tool-group-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
                    <strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{group}</strong>
                    <button className="link-btn" style={{ fontSize: 12, color: 'var(--accent-color, #ff6b35)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => toggleToolGroup(group, !allOn)}>
                      {allOn ? 'Disable group' : 'Enable group'}
                    </button>
                  </div>
                  <div className="tool-group-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {inGroup.map(t => (
                      <label key={t.name} className="tool-check-card" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}>
                        <input
                          type="checkbox"
                          checked={t.enabled}
                          onChange={e => toggleTool(t.name, e.target.checked)}
                        />
                        <span>{t.name.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Modal>
      )}
      {showPalette && <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} onOpenChat={openChatById} />}
      {showTerms && (
        <TermsModal onAccept={handleAcceptTerms} onDecline={() => setShowTerms(false)} />
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onAuth={handleAuth} />}
      {features.artifacts && activeArtifact && <ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />}
      {showPersonaModal && (
        <Modal title="Create Custom Persona" icon={<Sparkles size={16} />} onClose={() => setShowPersonaModal(false)}>
          <form onSubmit={async (e) => {
            e.preventDefault()
            const name = e.target.elements.name.value.trim()
            const system_prompt = e.target.elements.system_prompt.value.trim()
            const icon = e.target.elements.icon.value.trim() || '🤖'
            if (!name || !system_prompt) {
              setErrorModalMsg('Persona Name and System Instructions are both required.')
              return
            }
            const t = await createTemplate({ name, system_prompt, icon })
            setShowPersonaModal(false)
            refreshTemplates()
            setActiveTemplate(t.id)
            await setPref('persona', t.id)
          }} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="persona-icon" style={{ fontSize: '12px' }}>Emoji / Icon</label>
              <input id="persona-icon" name="icon" type="text" defaultValue="🤖" placeholder="e.g. 🤖, 🧑‍💻, ✍️" maxLength={4} style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'inherit' }} />
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="persona-name" style={{ fontSize: '12px' }}>Persona Name</label>
              <input id="persona-name" name="name" type="text" placeholder="e.g. French Translator" required style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'inherit' }} />
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="persona-prompt" style={{ fontSize: '12px' }}>System Instructions / Prompt</label>
              <textarea id="persona-prompt" name="system_prompt" placeholder="e.g. You are a French translator. Translate all user inputs into French..." required rows={5} style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'inherit', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="button" className="small-btn" style={{ flex: 1 }} onClick={() => setShowPersonaModal(false)}>Cancel</button>
              <button type="submit" className="small-btn btn-primary" style={{ flex: 1 }}>Save Persona</button>
            </div>
          </form>
        </Modal>
      )}
      {showAd && <AdModal onClose={() => setShowAd(false)} />}
      {showDemoModal && <DemoModal onClose={() => setShowDemoModal(false)} />}
      <DownloadModal isOpen={showDownloadModal} onClose={() => setShowDownloadModal(false)} onInstallPwa={installPwa} showPwa={!!showPwaInstall} />
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {/* Generic confirm modal — no more native confirm() dialogs */}
      {confirmModal && (
        <Modal title="Confirm" onClose={() => { confirmModal.onCancel?.(); setConfirmModal(null) }}
          footer={
            <div className="modal-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="small-btn" onClick={() => { confirmModal.onCancel?.(); setConfirmModal(null) }}>{confirmModal.cancelLabel || 'Cancel'}</button>
              <button className="small-btn btn-primary" onClick={() => { confirmModal.onOk(); setConfirmModal(null) }}>{confirmModal.okLabel || 'OK'}</button>
            </div>
          }>
          <div style={{ padding: '12px 0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{confirmModal.msg}</div>
        </Modal>
      )}
      {/* Project-name modal — replaces native prompt() in addProject */}
      {projectNameModal && (
        <Modal title="New Project" onClose={() => setProjectNameModal(null)}
          footer={null}>
          <form onSubmit={e => { e.preventDefault(); projectNameModal.onSubmit(e.target.elements.name.value) }}
            style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input name="name" autoFocus placeholder="Project name" required
              style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="small-btn" onClick={() => setProjectNameModal(null)}>Cancel</button>
              <button type="submit" className="small-btn btn-primary">Create</button>
            </div>
          </form>
        </Modal>
      )}
      {/* Restore-mode modal — replace/merge choice for backup restore */}
      {restoreModal && (
        <Modal title="Restore Backup" onClose={() => setRestoreModal(null)}
          footer={
            <div className="modal-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="small-btn" onClick={() => setRestoreModal(null)}>Cancel</button>
              <button className="small-btn" onClick={() => doRestore(restoreModal.file, 'merge')}>Merge (keep both)</button>
              <button className="small-btn btn-primary" onClick={() => doRestore(restoreModal.file, 'replace')}>Replace (overwrite)</button>
            </div>
          }>
          <div style={{ padding: '12px 0', fontSize: 13, lineHeight: 1.6 }}>
            How should the backup be applied?
            <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text-secondary)' }}>
              <li><strong style={{ color: 'var(--text-primary)' }}>Merge</strong> — keep your existing chats and add the restored ones alongside them.</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>Replace</strong> — delete everything currently stored and restore from the backup file.</li>
            </ul>
          </div>
        </Modal>
      )}
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
