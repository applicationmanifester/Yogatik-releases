import React, { useState, useRef, useEffect, useCallback, useMemo, useDeferredValue } from 'react'
import ReactDOM from 'react-dom'
import { Send, Plus, Sun, Moon, Upload, Menu, X, Trash2, Plug, LogIn, LogOut, User, Square, Download, Share2, Sparkles, Mic, MicOff, Wrench, Smartphone, AlertTriangle, Globe, FileText, Search, Pencil, RefreshCw, ChevronDown, Key, Cloud, CloudOff, Zap, GitCompare, Radio, Sliders, Cpu, Folder, FolderPlus, Tag, Filter, Clock, Bell, Monitor, Activity, Bot, ListPlus, Edit2, PanelLeft, TerminalSquare, Compass, FileCode, Wand2, CheckCircle2, PlayCircle, ShieldCheck, Brain, Play } from 'lucide-react'
import { streamMessage, stopGeneration, enhancePromptText, uploadDocument, getModels, removeProvider, testProvider, saveProviderApiKey, logout, getMe, getConversations, getConversation, deleteConversation, getTemplates, requestTTS, stopTTS, listDocuments, removeDocument, createConversation, saveMessage, renameConversation, updateConversationFolder, updateConversationTags, updateConversationModel, trimConversationFrom, getActiveProvider, setActiveProvider, getActiveModel, setActiveModel, getAllProviderStatus, ensureTested, autoPickModel, getTools, setToolEnabled, setToolsEnabledBulk, getPrefs, setPref, getTodayUsage, getProjects, createProject, deleteProject, getActiveProject, setActiveProject, hasAcceptedTerms, acceptTerms, downloadBackup, restoreBackup, getMeasuredModels, isRetiredModelError, pruneRetiredModel, getAllKeyInfo, forgetApiKey, getLiveConfig, checkGoogleRedirect, hasAnyProviderKey, getStoredProvider, getVisionStatus, branchConversation, syncCloudKeys, createTemplate, deleteTemplate, addCustomModelToProvider } from './api'
import { isDesktop, addRoot, listRoots, removeRoot, setPrimaryRoot, rebindChatRoots, unbindChatRoots, setWorkspaceContext } from './tools/localFs'
import { setUserQuestionHandler } from './tools/askUser'
import { runMultiAgentDebate } from './multiAgent'
import { startActivityTurn, publishStream, publishStep, endActivityTurn, setActivityConversation } from './activityStream'
import { YogatikLogo } from './components/YogatikLogo'
import { ToolResultCard, TOOL_ICONS } from './components/ToolResultCard'
import ToolStatusPanel from './components/ToolStatusPanel'
import A11yAnnouncer, { announce } from './components/A11yAnnouncer'
import CrisisCard from './components/CrisisCard'
import { getProactiveCheckin, markCheckinShown } from './proactive'
import { recordTurn } from './adaptation'
import { startTurn } from './telemetry'
import { downloadChat } from './chatExport'
import { MessageBubble } from './components/MessageBubble'
import { StreamingMessage } from './components/StreamingMessage'
import { ArtifactCanvas } from './components/ArtifactCanvas'
import { Modal } from './components/Modal'
import { TERMS_VERSION, CONTACT_EMAIL } from './components/TermsModal'
import { ModelPicker } from './components/ModelPicker'
import { ContextMeter } from './components/ContextMeter'
import { runWorkflow } from './workflows'
import { FloatingCompanion } from './components/FloatingCompanion'
import { ActiveTimerIndicator } from './components/ActiveTimerIndicator'
import { openDocumentPip, closeDocumentPip, isDocumentPipSupported, getPipMount } from './pipCompanion'
import { getErrorLog, clearErrorLog, getDiagnosticsReport, diagnoseError } from './errorLog'
import { isDbClosedError } from './db'
import { resolveFeatures } from './features'
import { setLocalVLMConsent } from './vision/localVLM'
import { setDetectorConsent } from './vision/detect'
import { setSemanticConsent } from './semantic'
import { looksVisionCapable } from './vision/capability'
import { getProviders as getLLMProviders, normalizeModelName, preconnectProvider } from './llm'
import { prepareImage, isImageFile, imageFromClipboard, imageFromDrop } from './vision/attach'
import { registerServiceWorker } from './pwa'
import { enqueueOutbox, flushOutbox } from './offlineQueue'
import { requestPersistence, storageReport, formatBytes } from './storage'
import { DEFAULT_LOCAL_MODEL, webGpuDetails, loadLocalModel, LOCAL_MODELS, clearLocalModelCache } from './localLLM'
import { isDirectTimeQuery } from './timeQuery'
import { isInstalledApp, shareYogatik, nativeShareAvailable } from './share'
import { groupConversations } from './convGroups'
import { shouldNotifyTurn, notificationBody, notificationTitle, cleanReply } from './desktopNotify'
import { setPermissionPrompt } from './permissions'
import { setLocaleOverrides, overridesFromPrefs, applyDocumentLocale } from './locale'
import {
  entitlement, loadEntitlement, refreshEntitlement, signOutEntitlement,
  onEntitlementChange, isPersonalEdition,
} from './entitlement'
import * as terminalStore from './terminal/terminalStore'
import { startTerminalStream } from './terminal/useTerminal'
import PermissionPrompt from './components/PermissionPrompt'
import { APP_VERSION, hasSeenCurrentVersion } from './version'
import { AdSenseBanner } from './components/AdSenseBanner'
import { safeLazy } from './utils/safeLazy'
import { prewarmToolsFromInput } from './tools/toolPrewarm'

// Code-split heavy modals and auxiliary views on demand with auto-retry and cache-bust on new deploys
const ArtifactPanel = safeLazy(() => import('./components/ArtifactPanel').then(m => ({ default: m.ArtifactPanel })))
const BrowserPanel = safeLazy(() => import('./components/BrowserPanel').then(m => ({ default: m.BrowserPanel })))
const ActivityPanel = safeLazy(() => import('./components/ActivityPanel').then(m => ({ default: m.ActivityPanel })))
const DataDashboard = safeLazy(() => import('./components/DataDashboard'))
const OnboardingModal = safeLazy(() => import('./components/OnboardingModal'))
const AuthModal = safeLazy(() => import('./components/AuthModal').then(m => ({ default: m.AuthModal })))
const ProviderModal = safeLazy(() => import('./components/ProviderModal').then(m => ({ default: m.ProviderModal })))
const SettingsModal = safeLazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })))
const TermsModal = safeLazy(() => import('./components/TermsModal').then(m => ({ default: m.TermsModal })))
const LocalModelPanel = safeLazy(() => import('./components/LocalModelPanel').then(m => ({ default: m.LocalModelPanel })))
const CommandPalette = safeLazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })))
const ArenaView = safeLazy(() => import('./components/ArenaView').then(m => ({ default: m.ArenaView })))
const LiveView = safeLazy(() => import('./components/LiveView').then(m => ({ default: m.LiveView })))
const PersonalisePanel = safeLazy(() => import('./components/PersonalisePanel').then(m => ({ default: m.PersonalisePanel })))
const SkillsPanel = safeLazy(() => import('./components/SkillsPanel').then(m => ({ default: m.SkillsPanel })))
const AgentsPanel = safeLazy(() => import('./components/AgentsPanel').then(m => ({ default: m.AgentsPanel })))
// The shared terminal timeline: agent commands AND yours, in one bottom
// drawer. Supersedes the old floating TerminalPanel, whose session was private
// to the panel and was killed when it closed.
const TerminalDrawer = safeLazy(() => import('./components/TerminalDrawer'))
const SchedulerPanel = safeLazy(() => import('./components/SchedulerPanel').then(m => ({ default: m.SchedulerPanel })))
const SubAgentRunnerPanel = safeLazy(() => import('./components/SubAgentRunnerPanel').then(m => ({ default: m.SubAgentRunnerPanel })))
const AutoSkillsPanel = safeLazy(() => import('./components/AutoSkillsPanel').then(m => ({ default: m.AutoSkillsPanel })))
const FileEditorModal = safeLazy(() => import('./components/FileEditorModal').then(m => ({ default: m.FileEditorModal })))
// The docked workspace (explorer / search / source control / editor). Lazy and
// gated at the RENDER SITE below, not self-gated: rendering a React.lazy
// component downloads its chunk immediately, and this one pulls CodeMirror.
const WorkspaceDock = safeLazy(() => import('./components/WorkspacePanel').then(m => ({ default: m.WorkspaceDock })))
// Lazy and gated at the render site: most sessions never open it, and the
// pricing tables are dead weight in the first paint if they are not.
const UpgradeModal = safeLazy(() => import('./components/UpgradeModal'))
const DemoModal = safeLazy(() => import('./components/DemoModal').then(m => ({ default: m.DemoModal })))
const Tour = safeLazy(() => import('./components/Tour').then(m => ({ default: m.Tour })))
const AppOverviewModal = safeLazy(() => import('./components/AppOverviewModal').then(m => ({ default: m.AppOverviewModal })))
const McpModal = safeLazy(() => import('./components/McpModal').then(m => ({ default: m.McpModal })))
const DownloadModal = safeLazy(() => import('./components/DownloadModal').then(m => ({ default: m.DownloadModal })))
const DiagnosticsModal = safeLazy(() => import('./components/DiagnosticsModal').then(m => ({ default: m.DiagnosticsModal })))
const DomainHubModal = safeLazy(() => import('./components/DomainHubModal').then(m => ({ default: m.DomainHubModal })))
const WhatsNewModal = safeLazy(() => import('./components/WhatsNewModal').then(m => ({ default: m.WhatsNewModal })))
const ShareSheet = safeLazy(() => import('./components/ShareSheet').then(m => ({ default: m.ShareSheet })))
const ShortcutsModal = safeLazy(() => import('./components/ShortcutsModal').then(m => ({ default: m.ShortcutsModal })))
const SlashCommandsMenu = safeLazy(() => import('./components/SlashCommandsMenu').then(m => ({ default: m.SlashCommandsMenu })))
const StarterCards = safeLazy(() => import('./components/StarterCards').then(m => ({ default: m.StarterCards })))
const CitationGraphModal = safeLazy(() => import('./components/CitationGraphModal').then(m => ({ default: m.CitationGraphModal })))
const EvalDashboard = safeLazy(() => import('./components/EvalDashboard').then(m => ({ default: m.EvalDashboard })))


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

function getStatusIcon(text = '') {
  const t = text.toLowerCase()
  if (t.includes('search') || t.includes('web') || t.includes('fetching')) return <Globe size={13} style={{ color: '#38bdf8' }} />
  if (t.includes('code') || t.includes('file') || t.includes('read') || t.includes('write')) return <FileCode size={13} style={{ color: '#a855f7' }} />
  if (t.includes('think') || t.includes('reason') || t.includes('analyz')) return <Brain size={13} style={{ color: '#ec4899' }} />
  if (t.includes('running') || t.includes('execut') || t.includes('tool')) return <Wrench size={13} style={{ color: '#f59e0b' }} />
  if (t.includes('verif') || t.includes('test') || t.includes('audit')) return <ShieldCheck size={13} style={{ color: '#10b981' }} />
  if (t.includes('enhanc')) return <Wand2 size={13} style={{ color: '#ff6b35' }} />
  return <Sparkles size={13} style={{ color: 'var(--accent-color, #ff6b35)' }} />
}


const SUGGESTIONS = [
  {
    category: 'Live Research',
    label: "Search today's top AI & tech breakthroughs",
    prompt: "Search the web for today's top artificial intelligence and tech news highlights with key takeaways.",
  },
  {
    category: 'Productivity',
    label: "Draft a polite follow-up email on project status",
    prompt: "Draft a concise, professional follow-up email asking for an update on a pending project review.",
  },
  {
    category: 'Code Assistant',
    label: "Debug and optimize a slow query or code snippet",
    prompt: "Review my code, identify performance bottlenecks, and suggest clean, efficient optimizations.",
  },
  {
    category: 'Creative Gen',
    label: "Generate a cozy cyberpunk coffee shop image",
    prompt: "Generate an image of a cozy cyberpunk coffee shop in Tokyo on a rainy evening with warm neon glow.",
  },
  {
    category: 'Learning',
    label: "Explain complex concepts with everyday analogies",
    prompt: "Explain how neural networks and large language models work using a simple, relatable everyday analogy.",
  },
  {
    category: 'Daily Planning',
    label: "Create a 5-day quick meal prep & grocery list",
    prompt: "Create a balanced 5-day dinner meal plan under 30 minutes with an organized grocery shopping list.",
  },
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
  const [conversations, setConversations] = useState([{
    clientId: `c_def_${Date.now()}`,
    id: null,
    title: 'New Chat',
    messages: [],
    provider: 'local',
    model: '',
    systemPrompt: '',
    persona: 'default',
    temperature: 0.7,
    webSearch: true,
    tools: true,
  }])
  const [activeArtifact, setActiveArtifact] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [input, setInput] = useState('')
  const [loadingMap, setLoadingMap] = useState({})
  // Streaming text is deliberately NOT React state. One setState per token
  // re-rendered the whole shell — sidebar, composer and every MessageBubble,
  // each re-running ReactMarkdown — for text that only appears in one div.
  // The text lives in a ref and is pushed imperatively into <StreamingMessage/>;
  // App state holds only "does this chat have text yet" (flips once per turn).
  const streamTextRef = useRef({})
  const streamViewRef = useRef(null)
  const [hasStreamMap, setHasStreamMap] = useState({})
  // Companion mode replaces the entire shell, so there is no shell to protect:
  // that surface takes the text as a plain prop.
  const [companionStreamText, setCompanionStreamText] = useState('')
  const [statusMap, setStatusMap] = useState({})
  const [streamIdMap, setStreamIdMap] = useState({})
  const [queuedMessagesMap, setQueuedMessagesMap] = useState({})
  const queuedMessagesRef = useRef({})
  queuedMessagesRef.current = queuedMessagesMap
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
  const [activeToolsMap, setActiveToolsMap] = useState({})
  const [pendingToolResultsMap, setPendingToolResultsMap] = useState({})
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [attachedFile, setAttachedFile] = useState(null)
  // Real OS path for a file DROPPED on the desktop window. The browser only
  // hands over an opaque blob; webUtils.getPathForFile recovers where it
  // actually lives, so the agent can fs_read/fs_write the real file instead of
  // only seeing a copy of its text.
  const [attachedFilePath, setAttachedFilePath] = useState(null)
  const [attachedImage, setAttachedImage] = useState(null)   // { dataUrl, thumb, name, width, height }
  const [dragOver, setDragOver] = useState(false)
  const [modelSees, setModelSees] = useState(null)   // null = unknown yet
  const [updateReady, setUpdateReady] = useState(null)   // () => apply
  const [storage, setStorage] = useState(null)
  const [docs, setDocs] = useState([])
  const [convQuery, setConvQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState(null)
  const [activeTag, setActiveTag] = useState(null)
  const [showAllTools, setShowAllTools] = useState(false)
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
  const [showAgents, setShowAgents] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  // A BOOLEAN, deliberately: the terminal store notifies on every output chunk,
  // and subscribing App to that would re-render the whole shell per chunk —
  // exactly the regression StreamingMessage exists to prevent.
  const [agentTerminalBusy, setAgentTerminalBusy] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [showSubAgents, setShowSubAgents] = useState(false)
  const [showAutoSkills, setShowAutoSkills] = useState(false)
  const [showFileEditor, setShowFileEditor] = useState(false)
  // The workspace is a DOCK, not a modal: it is deliberately absent from
  // isAnyModalOpen so Escape and the global shortcuts keep working while it is
  // open — you are meant to chat and watch files at the same time. It IS in
  // browserOccluded, because it occupies the same pixels as the docked browser.
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [showCitationGraph, setShowCitationGraph] = useState(false)
  const [showEvalDashboard, setShowEvalDashboard] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  // Entitlement. The GATE is in the main process; this is only what the UI says.
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [ent, setEnt] = useState(() => entitlement())
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [chatRoots, setChatRoots] = useState([])
  const [rootsOpen, setRootsOpen] = useState(false)
  const rootsWrapRef = useRef(null)

  // Global Keyboard Shortcuts (Ctrl+/, Ctrl+N, Ctrl+B, Ctrl+`, Ctrl+Shift+D)
  useEffect(() => {
    const handleGlobalKey = (e) => {
      // Don't intercept when user is typing in form inputs/modals unless it's Ctrl+/ or Escape
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setShowShortcutsModal(prev => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault()
        createConversation()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarOpen(prev => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        setShowTerminal(prev => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setShowDiagnosticsModal(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [])

  // The folders popover is a role="dialog": Escape and a click outside must
  // dismiss it, not just a second click on the chip that opened it.
  useEffect(() => {
    if (!rootsOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setRootsOpen(false) }
    const onDown = (e) => {
      if (rootsWrapRef.current && !rootsWrapRef.current.contains(e.target)) setRootsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [rootsOpen])

  // Speculative runtime & tool pre-warming as user types (debounced 300ms)
  useEffect(() => {
    if (!input || input.length < 3) return
    const timer = setTimeout(() => {
      prewarmToolsFromInput(input)
    }, 300)
    return () => clearTimeout(timer)
  }, [input])
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
  // Once the app IS installed, prompting to install it is noise — offer to
  // pass it on instead. Covers Electron, Tauri and an installed PWA.
  const installed = useMemo(() => isInstalledApp(), [])
  const handleShare = useCallback(async () => {
    // Prefer the platform's own sheet — on a phone or in Edge it lists every
    // installed app, which nothing we build can match. Electron has no
    // navigator.share and Windows exposes no Share charm to it, so there the
    // old code fell through to a silent clipboard copy and Share looked broken.
    if (!nativeShareAvailable()) { setShowShareSheet(true); return }
    const outcome = await shareYogatik()
    if (outcome === 'copied') showToast('Link copied — share it anywhere')
    else if (outcome === 'failed') setShowShareSheet(true)
  }, [showToast])

  const handleAddFolder = useCallback(async () => {
    const added = await addRoot()
    if (added) setChatRoots(await listRoots())
  }, [])
  const handleRemoveFolder = useCallback(async (rootId) => {
    const updated = await removeRoot(rootId)
    setChatRoots(updated || [])
  }, [])
  const handleMakePrimary = useCallback(async (rootId) => {
    const updated = await setPrimaryRoot(rootId)
    setChatRoots(updated || [])
  }, [])
  const features = useMemo(() => resolveFeatures(prefs.features), [prefs.features])
  // The vision fallback lives outside React; it needs the toggle, not a prop.
  useEffect(() => { setLocalVLMConsent(features.localVision) }, [features.localVision])
  // The zero-shot classifier and the object detector are downloads too, so
  // they answer to the same switch as the VLM rather than pulling weights on
  // the first blind-model image.
  useEffect(() => { setDetectorConsent(features.localVision) }, [features.localVision])
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
  // Docked agent browser: { url } while panel mode is showing one.
  const [browserPanel, setBrowserPanel] = useState(null)
  const [showActivity, setShowActivity] = useState(false)
  const [showShareSheet, setShowShareSheet] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const toolRunMapRef = useRef({}) // per-chat tool results: { [clientId]: { results: {}, used: [] } }
  const traceMapRef = useRef({})   // per-chat activity steps: { [clientId]: [...] }
  const textareaRef = useRef(null)
  const promptHistoryRef = useRef([])
  const historyIndexRef = useRef(-1)
  const draftInputRef = useRef('')
  const [isEnhancing, setIsEnhancing] = useState(false)
  const recognitionRef = useRef(null)
  const [showDemoModal, setShowDemoModal] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showStorageDetails, setShowStorageDetails] = useState(false)
  const [crisisCard, setCrisisCard] = useState(null)
  const [checkin, setCheckin] = useState(null)
  const [showDataDashboard, setShowDataDashboard] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem('yogatik_onboarded') } catch { return false }
  })
  const [showPersonaModal, setShowPersonaModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsModalTab, setSettingsModalTab] = useState('providers')
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false)
  const [showDomainHub, setShowDomainHub] = useState(false)
  const [showOverviewModal, setShowOverviewModal] = useState(false)
  const [showMcpModal, setShowMcpModal] = useState(false)
  const [companionMode, setCompanionMode] = useState(false)
  const [pipWindow, setPipWindow] = useState(null)

  const handlePopOutPip = useCallback(async () => {
    if (!isDocumentPipSupported()) {
      showToast('Document Picture-in-Picture is not supported in this browser. Use Chrome/Edge 116+ or the Desktop app.')
      return
    }
    try {
      const win = await openDocumentPip({
        width: 380,
        height: 620,
        onClosed: () => {
          setPipWindow(null)
          setCompanionMode(false)
        },
      })
      setPipWindow(win)
      setCompanionMode(false)
    } catch (e) {
      showToast(`Could not open Picture-in-Picture: ${e.message}`)
    }
  }, [])

  const toggleCompanion = useCallback(async () => {
    // On the desktop the companion is a REAL separate always-on-top window that
    // follows the user into their other apps. Shrinking the main window into an
    // in-app panel instead keeps them inside Yogatik, which is the opposite of
    // what this button is for. The in-app panel stays as the web fallback.
    const winBridge = typeof window !== 'undefined' && window.__YOGATIK_COMPANION_WIN__
    if (winBridge?.toggle) {
      try {
        await winBridge.toggle()
        return
      } catch (e) {
        showToast(`Could not open the floating companion: ${e.message}`)
      }
    }
    const next = !companionMode
    setCompanionMode(next)
    if (typeof window !== 'undefined' && window.__YOGATIK_COMPANION__?.setCompanionMode) {
      await window.__YOGATIK_COMPANION__.setCompanionMode(next)
    }
  }, [companionMode, showToast])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__YOGATIK_COMPANION__) {
      const unbindHotkey = window.__YOGATIK_COMPANION__.onToggleHotkey?.(() => {
        setCompanionMode(c => {
          const next = !c
          window.__YOGATIK_COMPANION__.setCompanionMode(next)
          return next
        })
      })
      const unbindMode = window.__YOGATIK_COMPANION__.onModeChanged?.((active) => {
        setCompanionMode(active)
      })
      return () => {
        unbindHotkey?.()
        unbindMode?.()
      }
    }
  }, [])
  // Generic confirm modal — replaces native confirm() throughout the app
  const [confirmModal, setConfirmModal] = useState(null) // { msg, okLabel?, cancelLabel?, onOk, onCancel? }
  // One pending tool-permission request at a time: { request, resolve }
  const [permRequest, setPermRequest] = useState(null)
  // Project-name prompt modal — replaces native prompt() in addProject
  const [projectNameModal, setProjectNameModal] = useState(null) // { onSubmit }
  // Restore-mode modal — replaces confirm() in handleRestore
  const [restoreModal, setRestoreModal] = useState(null) // { file }
  // Folder & Tag assignment modals — interactive UI replacing prompt()
  const [folderModalConv, setFolderModalConv] = useState(null) // { idx, conv, folder }
  const [tagModalConv, setTagModalConv] = useState(null) // { idx, conv, tags }
  // Interactive human-in-the-loop question prompt (ask_user tool)
  const [userQuestionPrompt, setUserQuestionPrompt] = useState(null) // { question, options, placeholder, allow_custom, resolve, reject }
  const [userQuestionAnswer, setUserQuestionAnswer] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState({})
  const [savingApiKey, setSavingApiKey] = useState(null)
  const [errorModalMsg, setErrorModalMsg] = useState(null)

  // Wire interactive question handler so AI model can ask questions mid-execution
  useEffect(() => {
    setUserQuestionHandler((args) => {
      return new Promise((resolve, reject) => {
        setUserQuestionAnswer('')
        setUserQuestionPrompt({
          ...args,
          resolve: (ans) => {
            setUserQuestionPrompt(null)
            resolve(ans)
          },
          reject: (err) => {
            setUserQuestionPrompt(null)
            reject(err)
          },
        })
      })
    })
  }, [])

  // Memory-based proactive check-in (once/day, opt-out via proactiveAgent).
  useEffect(() => {
    if (features?.proactiveAgent === false) return
    getProactiveCheckin().then(c => { if (c) setCheckin(c) }).catch(() => {})
  }, [features])

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

  // Workspace context for the fs_* tools. Ref-backed and assigned during render
  // (not in an effect) so a tool call fired on the first prompt of a brand-new
  // chat still sees the right conversation — same fix as sendRef.
  const wsCtxRef = useRef({ conversationId: null, projectId: null })
  wsCtxRef.current = {
    conversationId: conv?.id ?? conv?.clientId ?? null,
    projectId: activeProject ?? null,
  }


  // A browsing session carries logged-in state. It must not follow the user into
  // an unrelated chat, so switching conversations ends it.
  const browserConvId = conv?.id ?? conv?.clientId ?? null
  useEffect(() => {
    const b = typeof window !== 'undefined' && window.__YOGATIK_BROWSER__
    if (!b) return
    setBrowserPanel(null)
    return () => { try { b.close({ conversationId: browserConvId }) } catch { /* ignore */ } }
  }, [browserConvId])

  // Anything that should visually cover the docked browser must detach it first:
  // a WebContentsView composites above the DOM, so an overlay would be painted
  // UNDER it. settingsOpen matters most — that drawer docks where the panel does.
  const browserOccluded = !!(
    settingsOpen || showPersonalise || showSkills || showToolPicker ||
    showPalette || showProviderModal || showAuthModal || showDataDashboard ||
    showDiagnosticsModal || showDomainHub || showDownloadModal || activeArtifact ||
    showTerminal || showScheduler || showSubAgents || showAutoSkills || showFileEditor ||
    showWorkspace || showTour
  )

  useEffect(() => { setWorkspaceContext(() => wsCtxRef.current) }, [])

  // Install the approval UI. permissions.js FAILS CLOSED without this, so a
  // build where the UI never mounts refuses destructive calls rather than
  // silently running them.
  useEffect(() => {
    setPermissionPrompt((request) => new Promise((resolve) => {
      setPermRequest({ request, resolve })
    }))
    return () => setPermissionPrompt(null)
  }, [])

  const resolvePermission = useCallback((answer) => {
    setPermRequest(prev => { prev?.resolve(answer); return null })
  }, [])

  // This chat's folders. Reloads when the chat or project changes, which is what
  // makes switching chats switch the working folder.
  useEffect(() => {
    if (!isDesktop()) return
    listRoots().then(setChatRoots).catch(() => setChatRoots([]))
  }, [conv?.id, conv?.clientId, activeProject])

  // clientId, NOT id. A turn publishes its reasoning and tool steps under
  // targetClientId, and every other per-chat map here (loadingMap, streamingMap,
  // traceMapRef) is keyed the same way. Keying the activity stream on `id`
  // instead meant that the moment a chat was saved and had a database id, the
  // panel subscribed to one bucket while the turn wrote to another — so it sat
  // empty for every chat except a brand-new unsaved one.
  useEffect(() => {
    setActivityConversation(conv?.clientId || 'default')
  }, [conv?.clientId])

  const activeClientId = conv?.clientId
  const isStreamingHere = !!(activeClientId && loadingMap[activeClientId])
  const hasStreamHere = !!(activeClientId && hasStreamMap[activeClientId])
  const statusText = (activeClientId && statusMap[activeClientId]) || ''
  const currentStreamId = (activeClientId && streamIdMap[activeClientId]) || null
  // Derive per-active-chat tool state from maps
  const activeTools = (activeClientId && activeToolsMap[activeClientId]) || []
  const pendingToolResults = (activeClientId && pendingToolResultsMap[activeClientId]) || {}

  const activeClientIdRef = useRef(activeClientId)
  activeClientIdRef.current = activeClientId
  const companionActiveRef = useRef(false)
  companionActiveRef.current = companionMode || !!pipWindow

  /**
   * The single choke point for in-flight assistant text. `txt` is the full text
   * so far, not a delta; '' clears the chat's stream.
   */
  const setStreamText = useCallback((clientId, txt) => {
    if (!clientId) return
    if (txt) streamTextRef.current[clientId] = txt
    else delete streamTextRef.current[clientId]
    if (clientId === activeClientIdRef.current) {
      if (txt) streamViewRef.current?.push(txt)
      else streamViewRef.current?.clear()
      if (companionActiveRef.current) setCompanionStreamText(txt || '')
    }
    // Only the ''<->non-empty transition is state; every token in between is
    // pushed straight into the streaming view.
    setHasStreamMap(prev => (!!prev[clientId] === !!txt ? prev : { ...prev, [clientId]: !!txt }))
  }, [])

  const loadingMapRef = useRef(loadingMap)
  loadingMapRef.current = loadingMap  // always current — no useEffect lag
  const isStreamingHereRef = useRef(isStreamingHere)
  isStreamingHereRef.current = isStreamingHere
  const isAnyModalOpen = !!(
    showPalette || showAuthModal || showTerms || showProviderModal ||
    showPersonalise || showSkills || showPersonaModal || showDomainHub ||
    showDemoModal || showDiagnosticsModal || confirmModal || projectNameModal ||
    restoreModal || showDownloadModal || errorModalMsg || arena ||
    showScheduler || showSubAgents || showAutoSkills || showFileEditor || showWhatsNew ||
    showTour || showUpgrade
  )
  const isAnyModalOpenRef = useRef(isAnyModalOpen)
  isAnyModalOpenRef.current = isAnyModalOpen

  // send() reads these refs so it always sees the latest state, even when
  // called from a closure captured during a previous render (e.g. right after
  // newChat() updates conversations but before the next React paint).
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const activeIdxRef = useRef(activeIdx)
  activeIdxRef.current = activeIdx

  // Provider/model must be persisted: the agent reads them from IndexedDB, so
  // React-only state meant every message silently went to the stored default.
  const setProvider = useCallback((id) => {
    preconnectProvider(id)
    const provDef = getLLMProviders()[id]
    const defModel = provDef?.default_model || provDef?.preferred?.[0] || provDef?.models?.[0] || ''
    setProviderState(id)
    setModel(defModel)
    setActiveProvider(id).catch(() => {})
    setActiveModel(id, defModel).catch(() => {})

    setConversations(prev => {
      const curIdx = activeIdxRef.current
      const targetClientId = prev[curIdx]?.clientId
      const next = prev.map((c, i) => {
        if (i !== curIdx && c.clientId !== targetClientId) return c
        const updated = { ...c, provider: id, model: defModel }
        if (updated.id) {
          updateConversationModel(updated.id, id, defModel, {
            systemPrompt: updated.systemPrompt,
            persona: updated.persona,
            temperature: updated.temperature,
            webSearch: updated.webSearch,
            tools: updated.tools,
          }).catch(() => {})
        }
        return updated
      })
      conversationsRef.current = next
      return next
    })
  }, [])

  // Warm DNS / TCP / TLS connection to active provider
  useEffect(() => {
    if (provider) preconnectProvider(provider)
  }, [provider])

  const chooseModel = useCallback((m, providerId = null) => {
    const cleanModel = normalizeModelName(m)
    setModel(cleanModel)
    const curIdx = activeIdxRef.current
    const targetClientId = conversationsRef.current[curIdx]?.clientId
    const activeConv = conversationsRef.current[curIdx]
    const pid = providerId || activeConv?.provider || provider
    if (cleanModel) {
      addCustomModelToProvider(pid, cleanModel).catch(() => {})
      setModels(prev => {
        const prov = prev[pid]
        if (!prov) return prev
        const existing = prov.models || []
        if (existing.includes(cleanModel)) return prev
        return {
          ...prev,
          [pid]: {
            ...prov,
            models: [cleanModel, ...existing],
          },
        }
      })
    }
    setConversations(prev => {
      const next = prev.map((c, i) => {
        if (i !== curIdx && c.clientId !== targetClientId) return c
        const updated = { ...c, provider: pid, model: cleanModel }
        if (updated.id) {
          updateConversationModel(updated.id, pid, cleanModel, {
            systemPrompt: updated.systemPrompt,
            persona: updated.persona,
            temperature: updated.temperature,
            webSearch: updated.webSearch,
            tools: updated.tools,
          }).catch(() => {})
        }
        return updated
      })
      conversationsRef.current = next
      return next
    })
  }, [provider])

  // Chat preferences persist across reloads like provider and model do.
  const setTemperature = useCallback((v) => {
    setTemperatureState(v)
    setPref('temperature', v).catch(() => {})
    setConversations(prev => {
      const curIdx = activeIdxRef.current
      const targetClientId = prev[curIdx]?.clientId
      const next = prev.map((c, i) => {
        if (i !== curIdx && c.clientId !== targetClientId) return c
        const updated = { ...c, temperature: v }
        if (updated.id) {
          updateConversationModel(updated.id, updated.provider, updated.model, {
            systemPrompt: updated.systemPrompt,
            persona: updated.persona,
            temperature: v,
            webSearch: updated.webSearch,
            tools: updated.tools,
          }).catch(() => {})
        }
        return updated
      })
      conversationsRef.current = next
      return next
    })
  }, [])

  const setWebSearch = useCallback((v) => {
    setWebSearchState(v)
    setPref('web_search', v).catch(() => {})
    setConversations(prev => {
      const curIdx = activeIdxRef.current
      const targetClientId = prev[curIdx]?.clientId
      const next = prev.map((c, i) => {
        if (i !== curIdx && c.clientId !== targetClientId) return c
        const updated = { ...c, webSearch: v }
        if (updated.id) {
          updateConversationModel(updated.id, updated.provider, updated.model, {
            systemPrompt: updated.systemPrompt,
            persona: updated.persona,
            temperature: updated.temperature,
            webSearch: v,
            tools: updated.tools,
          }).catch(() => {})
        }
        return updated
      })
      conversationsRef.current = next
      return next
    })
  }, [])

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
    setConversations(prev => {
      const curIdx = activeIdxRef.current
      const targetClientId = prev[curIdx]?.clientId
      const next = prev.map((c, i) => {
        if (i !== curIdx && c.clientId !== targetClientId) return c
        const updated = { ...c, tools: v }
        if (updated.id) {
          updateConversationModel(updated.id, updated.provider, updated.model, {
            systemPrompt: updated.systemPrompt,
            persona: updated.persona,
            temperature: updated.temperature,
            webSearch: updated.webSearch,
            tools: v,
          }).catch(() => {})
        }
        return updated
      })
      conversationsRef.current = next
      return next
    })
  }, [])

  const setPersona = useCallback((personaId) => {
    setActiveTemplate(personaId)
    setPref('persona', personaId).catch(() => {})
    setConversations(prev => {
      const curIdx = activeIdxRef.current
      const targetClientId = prev[curIdx]?.clientId
      const next = prev.map((c, i) => {
        if (i !== curIdx && c.clientId !== targetClientId) return c
        const updated = { ...c, persona: personaId }
        if (updated.id) {
          updateConversationModel(updated.id, updated.provider, updated.model, {
            systemPrompt: updated.systemPrompt,
            persona: personaId,
            temperature: updated.temperature,
            webSearch: updated.webSearch,
            tools: updated.tools,
          }).catch(() => {})
        }
        return updated
      })
      conversationsRef.current = next
      return next
    })
  }, [])
  /** One updater for every small preference the Personalise panel owns. */
  const updatePref = useCallback((key, value) => {
    setPrefsState(p => {
      const next = { ...p, [key]: value }
      // The locale layer is read SYNCHRONOUSLY while a system prompt is built,
      // so its overrides are pushed here rather than read from the database on
      // demand — otherwise a changed region would not reach the next turn.
      if (key.endsWith('_override')) {
        setLocaleOverrides(overridesFromPrefs(next))
        applyDocumentLocale()
      }
      return next
    })
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
  const messagesEnd = useRef(null)
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

  // When a chat is opened, loaded, or switched, always show the latest prompt and response at the bottom
  const activeChatKey = conv?.id || conv?.clientId || String(activeIdx)
  useEffect(() => {
    if (!conv?.messages || conv.messages.length === 0) return
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
    scrollToBottom('auto')

    // Second pass after Markdown / Math / Code highlights calculate heights
    const timer = setTimeout(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
      }
      scrollToBottom('auto')
    }, 60)
    return () => clearTimeout(timer)
  }, [activeChatKey, conv?.messages?.length, scrollToBottom])

  useEffect(() => {
    if (!isStreamingHere) return
    if (atBottom) scrollToBottom(hasStreamHere ? 'auto' : 'smooth')
  }, [conv?.messages, hasStreamHere, isStreamingHere, atBottom, scrollToBottom])

  // Following the growing stream is imperative for the same reason the text is:
  // keying it on the text would restore the per-token re-render.
  const atBottomRef = useRef(atBottom)
  atBottomRef.current = atBottom
  const followStream = useCallback(() => {
    if (atBottomRef.current) messagesEnd.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  // A chat switch (or opening the companion) must show whatever that chat has
  // already streamed — the ref kept it, but this surface reads it as a prop.
  useEffect(() => {
    setCompanionStreamText(streamTextRef.current[activeClientId] || '')
  }, [activeClientId, companionMode, pipWindow])

  useEffect(() => {
    const on = async () => {
      setOnline(true)
      try {
        const sent = await flushOutbox(async (text) => {
          if (sendRef.current) await sendRef.current(text)
        })
        if (sent > 0) {
          showToast(`Reconnected — sent ${sent} queued message${sent === 1 ? '' : 's'}`)
        }
      } catch {}
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [showToast])

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setPwaPrompt(e); setShowPwaInstall(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // What's New Version Check: automatically show release updates on new version
  useEffect(() => {
    try {
      if (!hasSeenCurrentVersion()) {
        setShowWhatsNew(true)
      }
    } catch {}
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
    // Entitlement: read the cached licence main already loaded from disk. No
    // network on this path — a launch must never block on the licence server,
    // or an outage at Firebase becomes an outage of the whole app.
    loadEntitlement().then(setEnt).catch(() => {})
    getActiveProvider().then(async (p) => {
      setProviderState(p)
      setModel(await getActiveModel(p) || '')
      setProviderStatus(await getAllProviderStatus())
    }).catch(() => {})
    getPrefs().then(pref => {
      if (pref.temperature != null) setTemperatureState(pref.temperature)
      if (pref.web_search != null) setWebSearchState(pref.web_search)
      if (pref.tools_enabled != null) setToolsEnabledState(pref.tools_enabled)
      if (pref.persona) setActiveTemplate(pref.persona)
      if (pref.auto_route != null) setAutoRouteState(pref.auto_route)
      if (pref.fallback != null) setFallbackState(pref.fallback)
      setLocaleOverrides(overridesFromPrefs(pref))
      applyDocumentLocale()
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
        newChatRef.current?.()
      }
      // Ctrl+B / Cmd+B -> toggle the workspace dock (explorer, search, changes).
      // Not guarded by isAnyModalOpen: the dock is not a modal, and being able
      // to open the file tree while a panel is up is the normal case.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        setShowWorkspace(v => !v)
      }
      // Ctrl+` -> toggle the terminal drawer. The universal IDE binding, and
      // like the dock it is deliberately NOT guarded by isAnyModalOpen: seeing
      // what the agent is running is exactly what you want while something else
      // is open.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault()
        setShowTerminal(v => !v)
      }
      // Alt+D -> Social Media & Domain Intelligence Hub
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        setShowDomainHub(v => !v)
      }
      // Escape -> Stop generation (only if THIS chat is generating AND no modal is open)
      if (e.key === 'Escape') {
        if (isAnyModalOpenRef.current) return
        if (isStreamingHereRef.current) {
          e.preventDefault()
          handleStopRef.current?.()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])


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
        const proj = await createProject(name.trim())
        refreshProjects()
        chooseProject(proj?.id ?? proj)
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

  const showInfoModal = (title, msg) => {
    setErrorModalMsg({ title, msg, isError: false })
  }

  /** Manual nudge — sync already runs on sign-in and on every key save. */
  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const { pulled = 0, pushed = 0 } = await syncCloudKeys()
      refreshKeys()
      refreshModels()
      showInfoModal('Cloud Sync', pulled || pushed
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
    role: m.role, content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(p => p.type === 'text').map(p => p.text).join('\n') : String(m.content ?? '')),
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
      const activeP = (await getActiveProvider().catch(() => null)) || provider || 'local'
      const activeM = (await getActiveModel(activeP).catch(() => '')) || model || ''
      const pref = await getPrefs().catch(() => ({}))
      const defConv = {
        clientId: `c_def_${Date.now()}`,
        id: null,
        title: 'New Chat',
        messages: [],
        provider: activeP,
        model: activeM,
        systemPrompt: '',
        persona: pref?.persona || 'default',
        temperature: pref?.temperature ?? 0.7,
        webSearch: pref?.web_search ?? true,
        tools: pref?.tools_enabled ?? true,
      }
      setConversations([defConv])
      conversationsRef.current = [defConv]
      setActiveIdx(0)
      activeIdxRef.current = 0
      setProviderState(activeP)
      setModel(activeM)
      if (pref?.temperature != null) setTemperatureState(pref.temperature)
      if (pref?.web_search != null) setWebSearchState(pref.web_search)
      if (pref?.tools_enabled != null) setToolsEnabledState(pref.tools_enabled)
      if (pref?.persona) setActiveTemplate(pref.persona)
      return
    }
    const first = await getConversation(convs[0].id)
    const mapped = convs.map((c, i) => ({
      clientId: `c_${c.id}_${i}`,
      id: c.id,
      title: c.title,
      folder: c.folder || null,
      tags: c.tags || [],
      provider: c.provider || provider || 'local',
      model: c.model !== undefined ? c.model : (model || ''),
      systemPrompt: c.settings?.systemPrompt ?? c.systemPrompt ?? '',
      persona: c.settings?.persona ?? c.persona ?? 'default',
      temperature: c.settings?.temperature ?? c.temperature ?? (temperature ?? 0.7),
      webSearch: c.settings?.webSearch ?? c.webSearch ?? (webSearch ?? true),
      tools: c.settings?.tools ?? c.tools ?? (tools ?? true),
      messages: i === 0 && first ? (first.messages || []).map(hydrate) : [],
    }))
    const filtered = mapped.filter(c => c.title || (c.messages && c.messages.length))
    setConversations(filtered)
    conversationsRef.current = filtered
    if (!filtered.length) {
      setActiveIdx(0)
      activeIdxRef.current = 0
    } else {
      const top = filtered[0]
      if (top.provider) setProviderState(top.provider)
      if (top.model !== undefined) setModel(top.model)
      if (top.temperature !== undefined) setTemperatureState(top.temperature)
      if (top.webSearch !== undefined) setWebSearchState(top.webSearch)
      if (top.tools !== undefined) setToolsEnabledState(top.tools)
      if (top.persona) setActiveTemplate(top.persona)
    }
  }, [activeProject, provider, model, temperature, webSearch, tools])

  const handleAuth = (userData) => {
    setUser(userData)
    loadConversations()
    // Sign-in is what starts the trial and fetches the licence. The ID token is
    // handed to main here and held only in memory — it is short-lived, and
    // persisting it would be storing a credential for no benefit.
    refreshEntitlement({ idToken: userData?.idToken || null, uid: userData?.uid || userData?.id || null })
      .then(setEnt).catch(() => {})
  }

  // One subscription so every surface (header chip, workspace dock, system
  // prompt) reads the same state. Without it the dock could show unlocked while
  // the prompt still told the model everything was locked.
  useEffect(() => onEntitlementChange(setEnt), [])

  // The terminal's live dot. Subscribing here — not inside the drawer — is what
  // makes an agent command visible while the drawer is CLOSED, which was the
  // whole complaint: terminal_run ran for minutes with nothing on screen.
  useEffect(() => {
    if (!isDesktop()) return undefined
    let alive = true
    const id = conv?.clientId || conv?.id || null
    const tick = () => {
      if (!alive) return
      const busy = terminalStore.agentIsBusy(String(id ?? ''))
      // setState with the same boolean is a no-op in React, so this is cheap
      // even though the store notifies on every chunk.
      setAgentTerminalBusy(busy)
    }
    // Start the IPC stream here, not in the drawer's hook: a command that runs
    // while the drawer is CLOSED is precisely the case this indicator is for.
    startTerminalStream()
    tick()
    const off = terminalStore.subscribe(tick)
    return () => { alive = false; off() }
  }, [conv?.clientId, conv?.id])

  // Re-check on focus: the purchase completes in ANOTHER window, and coming
  // back to a still-locked app after paying is the worst moment in the funnel.
  useEffect(() => {
    if (!isDesktop()) return undefined
    const onFocus = () => {
      if (!user) return
      refreshEntitlement({ idToken: user?.idToken || null, uid: user?.uid || user?.id || null })
        .then(setEnt).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user])

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

  const resizeRafRef = useRef(0)
  const autoResize = useCallback(() => {
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = 0
      const ta = textareaRef.current
      if (ta) {
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 280) + 'px'
      }
    })
  }, [])

  // Global Ctrl+Alt+C copies whatever is selected in ANY application and relays
  // it here. main.cjs has always sent this event; nothing in the renderer
  // listened, so the hotkey fired into the void and the feature did not exist.
  //
  // It lands in the composer rather than sending: capture must be reversible,
  // and the user usually wants to add an instruction ("summarise this") before
  // it goes anywhere.
  useEffect(() => {
    const bridge = typeof window !== 'undefined' && window.__YOGATIK_CLIPBOARD__
    if (!bridge || typeof bridge.onSelectionHotkey !== 'function') return
    return bridge.onSelectionHotkey((payload) => {
      const captured = String(payload?.text || '').trim()
      if (!captured) return
      setInput((prev) => {
        const base = prev.replace(/\s+$/, '')
        return base ? base + '\n\n' + captured : captured
      })
      // After the value lands, put the caret at the end so typing continues
      // naturally, and grow the box to fit what was just pasted in.
      setTimeout(() => {
        const ta = textareaRef.current
        if (!ta) return
        ta.focus()
        ta.selectionStart = ta.selectionEnd = ta.value.length
        autoResize()
      }, 0)
      try { announce('Captured selection') } catch { /* announcer optional */ }
    })
  }, [autoResize])

  // Live File Watcher: Show transient notifications when files are modified in granted directories
  useEffect(() => {
    const watcherBridge = typeof window !== 'undefined' && window.__YOGATIK_WATCHER__
    if (!watcherBridge || typeof watcherBridge.onChange !== 'function') return
    return watcherBridge.onChange((payload) => {
      if (!payload?.path) return
      try {
        announce(`File modified: ${payload.path}`)
      } catch {}
    })
  }, [])

  const newChat = useCallback(() => {
    // Don't stop other chats — let them keep streaming in background
    setConvQuery('')
    setInput('')
    setActiveArtifact(null)
    setAttachedFile(null)
    setAttachedImage(null)
    setVisibleCount(WINDOW_STEP)
    setShowSkills(false)
    setShowPersonalise(false)
    setShowToolPicker(false)
    setShowPalette(false)
    setShowProviderModal(false)
    setShowPersonaModal(false)
    setShowDemoModal(false)
    setShowDiagnosticsModal(false)

    const activeP = provider || 'local'
    const activeM = normalizeModelName(model)
    const activePersona = activeTemplate || 'default'

    const newConv = {
      clientId: `c_new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      id: null,
      title: 'New Chat',
      messages: [],
      provider: activeP,
      model: activeM,
      systemPrompt: '',
      persona: activePersona,
      temperature: temperature ?? 0.7,
      webSearch: webSearch ?? true,
      tools: tools ?? true,
    }

    setConversations(prev => {
      // If the top chat is already a brand new empty draft with 0 messages and not streaming, reuse it
      const topIsIdleDraft = prev[0] && !prev[0].id && (!prev[0].messages || prev[0].messages.length === 0) && !loadingMapRef.current[prev[0]?.clientId]
      if (topIsIdleDraft) {
        const next = [newConv, ...prev.slice(1)]
        conversationsRef.current = next
        return next
      }
      const next = [newConv, ...prev]
      conversationsRef.current = next
      return next
    })

    setActiveIdx(0)
    activeIdxRef.current = 0
    historyIndexRef.current = -1
    draftInputRef.current = ''
    setProviderState(newConv.provider)
    setModel(newConv.model)
    setTemperatureState(newConv.temperature)
    setWebSearchState(newConv.webSearch)
    setToolsEnabledState(newConv.tools)
    setActiveTemplate(newConv.persona)

    if (window.innerWidth <= 768) setSidebarOpen(false)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [provider, model, temperature, webSearch, tools, activeTemplate])

  const newChatRef = useRef(newChat)
  newChatRef.current = newChat  // always current — no useEffect lag

  // Desktop native menu listener (New Chat, Settings, Palette, Arena, Live, Diagnostics, Grant Folder)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.__YOGATIK_MENU__?.on) return
    const unlisten = window.__YOGATIK_MENU__.on((action) => {
      if (typeof action === 'string') {
        if (action === 'new-chat') newChatRef.current?.()
        else if (action === 'open-settings') { setSidebarOpen(true); setSettingsOpen(true) }
        else if (action === 'open-palette') setShowPalette(true)
        else if (action === 'open-arena') setCompareMode(true)
        else if (action === 'open-live') startLive()
        else if (action === 'open-diagnostics') setShowDiagnosticsModal(true)
        else if (action === 'grant-folder') handleAddFolder()
      }
    })
    return () => { if (typeof unlisten === 'function') unlisten() }
  }, [handleAddFolder])

  /** Jump to a conversation by its stored id — the palette searches messages,
   *  which know their conversation but not its position in the sidebar. */
  const openChatById = useCallback(async (convId) => {
    setShowPalette(false)
    setShowSkills(false)
    setShowPersonalise(false)
    setShowToolPicker(false)
    setShowProviderModal(false)
    setShowPersonaModal(false)
    setShowDemoModal(false)
    const idx = conversationsRef.current.findIndex(c => c.id === convId)
    if (idx >= 0) { switchChat(idx); return }
    const full = await getConversation(convId)
    if (!full) return
    const formatted = {
      clientId: `c_${full.id}_${Math.random().toString(36).slice(2, 6)}`,
      ...full,
      provider: full.provider || provider || 'local',
      model: full.model !== undefined ? full.model : (model || ''),
      systemPrompt: full.settings?.systemPrompt ?? full.systemPrompt ?? '',
      persona: full.settings?.persona ?? full.persona ?? 'default',
      temperature: full.settings?.temperature ?? full.temperature ?? (temperature ?? 0.7),
      webSearch: full.settings?.webSearch ?? full.webSearch ?? (webSearch ?? true),
      tools: full.settings?.tools ?? full.tools ?? (tools ?? true),
      messages: (full.messages || []).map(hydrate),
    }
    setConversations(prev => {
      const next = [formatted, ...prev]
      conversationsRef.current = next
      return next
    })
    setActiveIdx(0)
    activeIdxRef.current = 0
    setVisibleCount(WINDOW_STEP)
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }, [provider, model, temperature, webSearch, tools])

  const switchChat = async (idx) => {
    setActiveIdx(idx)
    activeIdxRef.current = idx
    historyIndexRef.current = -1
    draftInputRef.current = ''
    setVisibleCount(WINDOW_STEP)
    setShowSkills(false)
    setShowPersonalise(false)
    setShowPalette(false)
    setShowToolPicker(false)
    setShowProviderModal(false)
    setShowPersonaModal(false)
    setShowDemoModal(false)
    if (window.innerWidth <= 768) setSidebarOpen(false)
    const c = conversationsRef.current[idx] || conversations[idx]
    if (!c) return

    if (c.provider) setProviderState(c.provider)
    if (c.model !== undefined) setModel(c.model)
    if (c.temperature !== undefined) setTemperatureState(c.temperature)
    if (c.webSearch !== undefined) setWebSearchState(c.webSearch)
    if (c.tools !== undefined) setToolsEnabledState(c.tools)
    if (c.persona !== undefined) setActiveTemplate(c.persona)

    if (c.id && (!c.messages || c.messages.length === 0)) {
      const full = await getConversation(c.id)
      if (full) {
        setConversations(prev => {
          const next = prev.map(conv =>
            (conv.id === c.id || conv.clientId === c.clientId) ? {
              ...conv,
              provider: full.provider || conv.provider,
              model: full.model !== undefined ? full.model : conv.model,
              systemPrompt: full.settings?.systemPrompt ?? conv.systemPrompt ?? '',
              persona: full.settings?.persona ?? conv.persona ?? 'default',
              temperature: full.settings?.temperature ?? conv.temperature ?? 0.7,
              webSearch: full.settings?.webSearch ?? conv.webSearch ?? true,
              tools: full.settings?.tools ?? conv.tools ?? true,
              messages: (full.messages || []).map(hydrate),
            } : conv
          )
          conversationsRef.current = next
          return next
        })
      }
    }
  }

  const deleteChat = async (idx) => {
    const c = conversationsRef.current[idx] || conversations[idx]
    const cClientId = c?.clientId
    const cId = c?.id
    const doDelete = async () => {
      if (cId) { try { await deleteConversation(cId) } catch {} }
      if (isDesktop()) {
        if (cClientId) unbindChatRoots(cClientId).catch(() => {})
        if (cId) unbindChatRoots(cId).catch(() => {})
      }
      setVisibleCount(WINDOW_STEP)
      setConversations(prev => {
        const next = prev.filter((item, i) => (cClientId ? item.clientId !== cClientId : i !== idx))
        const fallbackList = next.length ? next : [{
          clientId: `c_def_${Date.now()}`,
          id: null,
          title: 'New Chat',
          messages: [],
          provider: provider || 'local',
          model: model || '',
          persona: activeTemplate || 'default',
          temperature: temperature ?? 0.7,
          webSearch: webSearch ?? true,
          tools: tools ?? true,
        }]
        conversationsRef.current = fallbackList
        return fallbackList
      })
      setActiveIdx(prev => {
        const nextIdx = Math.max(0, prev >= idx ? prev - 1 : prev)
        activeIdxRef.current = nextIdx
        return nextIdx
      })
    }
    if (cClientId && loadingMap[cClientId]) {
      showConfirm(
        'This chat is currently generating a response. Stop generation and delete?',
        async () => {
          await stopGeneration(cClientId).catch(() => {})
          setLoadingMap(prev => { const n = { ...prev }; delete n[cClientId]; return n })
          setStreamText(cClientId, '')
          setStatusMap(prev => ({ ...prev, [cClientId]: '' }))
          doDelete()
        },
        { okLabel: 'Stop & Delete' }
      )
      return
    }
    doDelete()
  }

  /**
   * Export the open chat as md | html | pdf.
   *
   * This used to hand-roll markdown in two places and then set
   * `a.download = data.filename` — a field api.exportConversation has never
   * returned (it returns { content, format }), so every saved chat with an id
   * came down as an extension-less file called "download". chatExport.js has
   * done this properly since v3.8 (real block markdown, self-contained HTML,
   * PDF via html2pdf, safe filenames) and nothing in the app imported it.
   *
   * conv already carries .messages in memory, which is the shape
   * conversationToMarkdown/Html want, so there is no reason to round-trip
   * through the database for the saved case either.
   */
  const handleExport = async (format = 'md') => {
    try {
      await downloadChat(conv, format)
      showToast(`Chat exported as ${format.toUpperCase()}`)
    } catch { showToast('Export failed') }
  }

  const handleStop = async () => {
    const activeClientId = conv?.clientId
    if (activeClientId) {
      await stopGeneration(activeClientId).catch(() => {})
      setLoadingMap(prev => { const n = { ...prev }; delete n[activeClientId]; return n })
      setStreamText(activeClientId, '')
      setStatusMap(prev => ({ ...prev, [activeClientId]: '' }))
    }
  }

  const setConvFolder = useCallback(async (idx, newFolder) => {
    const c = conversationsRef.current[idx] || conversations[idx]
    if (!c) return
    const folderVal = (newFolder || '').trim() || null
    setConversations(prev => {
      const copy = [...prev]
      if (copy[idx]) copy[idx] = { ...copy[idx], folder: folderVal }
      conversationsRef.current = copy
      return copy
    })
    if (c.id) {
      await updateConversationFolder(c.id, folderVal).catch(() => {})
    }
  }, [conversations])

  const setConvTags = useCallback(async (idx, newTags) => {
    const c = conversationsRef.current[idx] || conversations[idx]
    if (!c) return
    const tagsArr = Array.isArray(newTags) ? newTags : (newTags || '').split(',').map(t => t.trim()).filter(Boolean)
    setConversations(prev => {
      const copy = [...prev]
      if (copy[idx]) copy[idx] = { ...copy[idx], tags: tagsArr }
      conversationsRef.current = copy
      return copy
    })
    if (c.id) {
      await updateConversationTags(c.id, tagsArr).catch(() => {})
    }
  }, [conversations])

  const handleStopRef = useRef(handleStop)
  handleStopRef.current = handleStop

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

  const handleAutoPick = useCallback(async (pid = provider) => {
    setAutoPicking(true)
    try {
      const res = await autoPickModel(pid, { onProgress: setAutoPickMsg })
      setModel(res.model)
      setProviderStatus(await getAllProviderStatus())
      setMeasuredModels(await getMeasuredModels(pid))
      showToast(`Selected ${res.model} (${formatLatency(res.latencyMs)})`)
    } catch (e) {
      setErrorModalMsg(e.message)
    } finally {
      setAutoPicking(false)
      setAutoPickMsg('')
    }
  }, [provider, showToast])

  const handleOpenArtifact = useCallback((art) => setActiveArtifact(art), [])
  const handleOpenSettings = useCallback(() => { setSidebarOpen(true); setSettingsOpen(true) }, [])

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

  const getSystemPrompt = useCallback((query = '', customSystemPrompt = '', convPersona = null) => {
    const personaToUse = convPersona || activeTemplate
    const t = promptTemplates.find(tpl => tpl.id === personaToUse)
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

    const folderCtx = isDesktop()
      ? `\n\nWORKING FOLDERS & REPOSITORY ACCESS:\n` +
        (chatRoots.length ? chatRoots.map(r => `- ${r.path}${r.primary ? '  (primary)' : ''}`).join('\n') : '- Current workspace directory\n') +
        `\nYou have full native file-system access to these folders via the fs_* tools and terminal_run. ` +
        `Use them proactively when the user asks to inspect, create, read, edit, rename, move, delete files or directories:\n` +
        `- fs_list   → list contents and directory tree\n` +
        `- fs_read   → read a file\n` +
        `- fs_write  → create or overwrite a file\n` +
        `- fs_edit   → patch a file by exact string replacement\n` +
        `- fs_search → grep across folders\n` +
        `- fs_find_files → find files by name / extension\n` +
        `- fs_delete → delete a file or directory\n` +
        `- fs_mkdir  → create a directory tree\n` +
        `- fs_move   → move or rename a file/directory\n` +
        `- fs_add_folder → pick or grant another folder\n` +
        `- terminal_run → execute native CLI commands, builds, and tests.\n` +
        `Never claim you lack file access or ask the user to paste code when you can inspect it directly.`
      : ''

    return (
      basePrompt +
      folderCtx +
      queryContext +
      '\n\nTOOL-USE PRIORITY (CRITICAL — always follow these rules):\n' +
      '- ALWAYS call tools before answering from memory when real-time or external data is needed.\n' +
      '- For any question about current events, news, prices, weather, stock data, or anything after 2023: call `web_search` FIRST.\n' +
      '- For any translation request ("translate X to Y", "how do you say X in Y"): call the `translate` tool IMMEDIATELY.\n' +
      '- For any code execution, math computation, or data processing: call `js_execute` or `code_execute` instead of guessing.\n' +
      '- For any image generation, photorealistic art, or visual scenes: call `image_generate` or `sticker_generate`.\n' +
      '- For PDF document creation / PDF export: call `md_to_pdf` (it automatically renders an instant 1-click download button in the chat UI; do NOT output raw base64 or write local files manually).\n' +
      '- For Word (.doc), PowerPoint (.pptx), or CSV file creation: call `doc_export` or `doc_enhance`.\n' +
      '- For research/deep analysis: call `deep_research` or `web_search` to gather facts before responding.\n' +
      '- Accuracy over speed: if you are uncertain about a fact, use a tool to verify it. Do NOT guess or hallucinate.\n' +
      '- When tools are enabled, prefer multi-step tool chains to build complete, accurate answers.\n' +
      '\nPRESENTATION, DOCUMENT & SLIDE ENHANCEMENT GUIDELINES:\n' +
      '- Present answers with high visual clarity: use clear headers (#, ##), formatted bullet points, bold key terms, and structured Markdown tables.\n' +
      '- When creating PowerPoint presentations (.pptx), structure slides cleanly using horizontal rules (`---`) between slides, `# Slide Title` or `## Slide Title`, formatted bullets with `* **Key Term**: Detailed explanation`, KPI stat callouts (e.g. `+45% Growth`, `$2.5M Revenue`, `99.9% Uptime`), and comparison tables (`| Feature | Value |`).\n' +
      '- When creating or editing PowerPoint presentations, Word documents, CSV spreadsheets, or reports, call `doc_export` or `doc_enhance` to generate high-quality files with slide graphics, calculated totals, and executive styling.\n' +
      '- When asked to generate visual aids, graphics, icons, or stickers, call the `sticker_generate` or `image_generate` tools.\n' +
      '- When explaining processes or workflows, include Mermaid flowcharts using `diagram` or ```mermaid code blocks so diagrams are razor-sharp vector graphics with readable text.\n' +
      '- Keep document exports (Word .doc, PowerPoint .pptx, CSV) structured into clean sections and slides.'
    )
  }, [promptTemplates, activeTemplate, chatRoots])

  const loadingRef = useRef(null)
  useEffect(() => { loadingRef.current = !!(conv?.clientId && loadingMap[conv.clientId]) }, [loadingMap, conv?.clientId])

  /** Run a workflow: send each (variable-filled) step in order, waiting for the
   *  previous turn to finish. Steps chain through the conversation history. */
  const runWorkflowNow = async (wf, values) => {
    await runWorkflow(wf, values, (prompt) => new Promise((resolve) => {
      sendRef.current?.(prompt)
      const started = Date.now()
      const iv = setInterval(() => {
        const settled = !loadingRef.current && Date.now() - started > 900
        if (settled || Date.now() - started > 180000) { clearInterval(iv); resolve('') }
      }, 300)
    }))
  }

  const triggerNextQueued = useCallback((clientId) => {
    if (!clientId) return
    const queue = queuedMessagesRef.current[clientId] || []
    if (!queue.length) return
    const [nextItem, ...remaining] = queue
    const updatedMap = {
      ...queuedMessagesRef.current,
      [clientId]: remaining,
    }
    queuedMessagesRef.current = updatedMap
    setQueuedMessagesMap(updatedMap)

    setTimeout(() => {
      const idx = conversationsRef.current.findIndex(c => c.clientId === clientId)
      if (idx >= 0) {
        if (nextItem.attachedFile) setAttachedFile(nextItem.attachedFile)
        if (nextItem.attachedFilePath) setAttachedFilePath(nextItem.attachedFilePath)
        sendRef.current?.(nextItem.text, nextItem.attachedImage, idx)
      }
    }, 150)
  }, [])

  const handleRemoveQueued = useCallback((idx = 0) => {
    const targetClientId = conv?.clientId
    if (!targetClientId) return
    setQueuedMessagesMap(prev => {
      const q = [...(prev[targetClientId] || [])]
      q.splice(idx, 1)
      const next = { ...prev, [targetClientId]: q }
      queuedMessagesRef.current = next
      return next
    })
  }, [conv?.clientId])

  const handleRestoreQueued = useCallback((idx = 0) => {
    const targetClientId = conv?.clientId
    if (!targetClientId) return
    const q = [...(queuedMessagesRef.current[targetClientId] || [])]
    const item = q[idx]
    if (!item) return
    q.splice(idx, 1)
    setQueuedMessagesMap(prev => {
      const next = { ...prev, [targetClientId]: q }
      queuedMessagesRef.current = next
      return next
    })
    setInput(item.text || '')
    if (item.attachedFile) setAttachedFile(item.attachedFile)
    if (item.attachedFilePath) setAttachedFilePath(item.attachedFilePath)
    if (item.attachedImage) setAttachedImage(item.attachedImage)
    setTimeout(() => {
      textareaRef.current?.focus()
      autoResize()
    }, 0)
  }, [conv?.clientId, autoResize])

  const send = async (text = input, overrideImage = null, explicitIdx = null) => {
    if (compareMode) {
      runCompare(text)
      return
    }
    // Always read from refs so we get the freshest state, even if this closure
    // was captured before a newChat() state update was committed.
    const targetIdx = explicitIdx != null ? explicitIdx : activeIdxRef.current
    const targetConv = conversationsRef.current[targetIdx]
    if (!targetConv) return
    const targetClientId = targetConv.clientId

    if (!text.trim() && !attachedFile && !attachedImage && !overrideImage) return

    // If this conversation is currently generating, push the message into its FIFO queue
    if (loadingMapRef.current[targetClientId]) {
      const queueItem = {
        text: text.trim(),
        attachedFile,
        attachedFilePath,
        attachedImage: overrideImage || attachedImage,
        timestamp: Date.now(),
      }
      setQueuedMessagesMap(prev => {
        const next = {
          ...prev,
          [targetClientId]: [...(prev[targetClientId] || []), queueItem],
        }
        queuedMessagesRef.current = next
        return next
      })
      if (text.trim()) {
        promptHistoryRef.current = [...promptHistoryRef.current.filter(p => p !== text.trim()), text.trim()]
      }
      historyIndexRef.current = -1
      draftInputRef.current = ''
      setInput('')
      setAttachedFile(null)
      setAttachedFilePath(null)
      setAttachedImage(null)
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      showToast('Prompt queued — will send automatically when the model finishes.')
      return
    }
    const useProvider = targetConv.provider || provider || 'local'
    let useModel = normalizeModelName(targetConv.model) || normalizeModelName(model)
    if (!useModel) {
      const provDef = getLLMProviders()[useProvider]
      useModel = normalizeModelName(provDef?.default_model) || normalizeModelName(provDef?.default) || normalizeModelName(provDef?.preferred?.[0]) || normalizeModelName(provDef?.models?.[0]) || ''
    }

    const provDef = getLLMProviders()[useProvider]
    const isLocalOrOllama = useProvider === 'ollama' || useProvider === 'local' || Boolean(provDef?.isLocal || provDef?.isOllama || provDef?.offlineReady || (provDef?.baseUrl && /localhost|127\.0\.0\.1/i.test(provDef.baseUrl)))

    if (!navigator.onLine && !isLocalOrOllama) {
      enqueueOutbox(text)
      showToast("You're offline — message saved to outbox and will send automatically when reconnected.")
      return
    }

    const usePersona = targetConv.persona || activeTemplate || 'default'
    const useTemp = targetConv.temperature !== undefined ? targetConv.temperature : (temperature ?? 0.7)
    const useWeb = targetConv.webSearch !== undefined ? targetConv.webSearch : (webSearch ?? true)
    const useTools = targetConv.tools !== undefined ? targetConv.tools : (tools ?? true)

    // Auto-switch to a vision model ONLY if user explicitly enabled it in Settings
    if ((attachedImage || overrideImage) && features.autoVision === true && modelSees === false) {
      const visionCandidate = (providerModels || []).find(m => looksVisionCapable(m))
      if (visionCandidate) {
        chooseModel(visionCandidate, useProvider)
        useModel = visionCandidate
      }
    }

    // models is populated asynchronously; if it's still empty the provider list
    // hasn't loaded yet — don't block the first send while that fetch is in flight.
    const modelsLoaded = Object.keys(models).length > 0
    const isProviderReady = !modelsLoaded || models[useProvider]?.available || keyInfo[useProvider]?.configured || isLocalOrOllama

    if (!isProviderReady) {
      setErrorModalMsg(
        `🔑 API Key Required for ${models[useProvider]?.name || useProvider}\n\n` +
        `To send messages using ${models[useProvider]?.name || useProvider}, please add your API key in the left sidebar.\n\n` +
        `👉 Click "get the key" in the sidebar to get a key in seconds, paste it into the API Key field, and click "+ Add Key"!`
      )
      setSidebarOpen(true)
      setSettingsOpen(true)
      return
    }

    const msgText = text.trim()
    if (msgText) {
      promptHistoryRef.current = [...promptHistoryRef.current.filter(p => p !== msgText), msgText]
    }
    historyIndexRef.current = -1
    draftInputRef.current = ''
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    setLoadingMap(prev => ({ ...prev, [targetClientId]: true }))
    setStreamText(targetClientId, '')
    setStatusMap(prev => ({ ...prev, [targetClientId]: 'Connecting...' }))
    setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))

    setActiveToolsMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
    setPendingToolResultsMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })

    let fileContext = ''
    const sentFile = attachedFile ? {
      name: attachedFile.name,
      size: attachedFile.size,
      type: attachedFile.type,
      path: attachedFilePath || null,
    } : null

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
      // A dropped file exists on disk. Say where, so the agent can operate on
      // the real thing rather than only the text extracted from it.
      if (attachedFilePath) {
        fileContext += `[This file is on disk at: ${attachedFilePath} — you can read or edit it directly with the fs_* tools if the folder is granted for this chat.] `
      }
      setAttachedFile(null)
      setAttachedFilePath(null)
      refreshDocs()
    }

    const isMultiAgent = msgText.startsWith('/collaborate ')
    const collaborateTopic = isMultiAgent ? msgText.replace('/collaborate ', '').trim() : ''

    const sentImage = overrideImage || attachedImage
    if (attachedImage) setAttachedImage(null)

    const fallbackPrompt = sentImage ? 'What is in this image?' : 'Process the attached file'
    const finalText = fileContext + (isMultiAgent ? collaborateTopic : (msgText || fallbackPrompt))
    const displayText = msgText || (sentFile ? `📎 ${sentFile.name}` : (sentImage ? '' : ''))
    const userMsg = {
      role: 'user', content: displayText, sources: [], createdAt: Date.now(),
      ...(sentImage ? { image: sentImage.dataUrl || sentImage.thumb, imageName: sentImage.name } : {}),
      ...(sentFile ? { file: sentFile } : {}),
    }
    const updated = {
      ...targetConv,
      provider: useProvider,
      model: useModel,
      persona: usePersona,
      temperature: useTemp,
      webSearch: useWeb,
      tools: useTools,
      messages: [...targetConv.messages, userMsg],
    }
    const isNewTitle = updated.title === 'New Chat'
    if (isNewTitle) updated.title = (msgText || displayText).trim().slice(0, 40) || 'New Chat'

    let convId = targetConv.id
    try {
      if (!convId) {
        const chatSettings = {
          systemPrompt: targetConv.systemPrompt || '',
          persona: usePersona,
          temperature: useTemp,
          webSearch: useWeb,
          tools: useTools,
        }
        convId = await createConversation(updated.title, null, useProvider, useModel, chatSettings)
        if (!convId) convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        updated.id = convId
        // Folders added while this chat was still a draft are keyed by clientId;
        // move them onto the real id or they'd be orphaned on the next render.
        if (targetClientId) await rebindChatRoots(targetClientId, convId)
      } else if (isNewTitle) {
        await renameConversation(convId, updated.title)
      }
      await saveMessage(convId, userMsg)
    } catch (e) { console.error('Failed to persist message', e) }

    setConversations(prev => {
      const next = prev.map(c => c.clientId === targetClientId ? updated : c)
      conversationsRef.current = next
      return next
    })

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
      setConversations(prev => {
        const next = prev.map(c =>
          c.clientId === targetClientId ? { ...c, id: convId, messages: [...updated.messages, assistantMsg] } : c
        )
        conversationsRef.current = next
        return next
      })
      setStreamText(targetClientId, '')
      setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
      setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
      setStreamIdMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
      return
    }

    let content = ''
    let sources = []
    toolRunMapRef.current[targetClientId] = { results: {}, used: [] }
    traceMapRef.current[targetClientId] = []

    const pushStreamContent = (txt) => {
      setStreamText(targetClientId, txt)
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
          announce('Response ready')
          const assistantMsg = {
            createdAt: Date.now(),
            role: 'assistant',
            content: content,
            sources: [],
            toolResults: {},
            toolsUsed: [],
          }
          saveMessage(convId, assistantMsg).catch(e => console.error('Failed to persist reply', e))
          setConversations(prev => {
            const next = prev.map(c =>
              c.clientId === targetClientId ? { ...c, id: convId, messages: [...(c.messages || []), assistantMsg] } : c
            )
            conversationsRef.current = next
            return next
          })
          setStreamText(targetClientId, '')
          delete toolRunMapRef.current[targetClientId]
          delete traceMapRef.current[targetClientId]
          triggerNextQueued(targetClientId)
        },
        onError: (err) => {
          setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
          setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))
          setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
          setConversations(prev => {
            const next = prev.map(c =>
              c.clientId === targetClientId
                ? { ...c, id: convId, messages: [...(c.messages || []), { role: 'assistant', error: String(err), content: '' }] }
                : c
            )
            conversationsRef.current = next
            return next
          })
          setStreamText(targetClientId, '')
          delete toolRunMapRef.current[targetClientId]
          delete traceMapRef.current[targetClientId]
          triggerNextQueued(targetClientId)
        }
      })
      return
    }

    startActivityTurn(targetClientId)
    const _latTurn = startTurn({ provider: useProvider, model: useModel })
    await streamMessage(
      {
        message: finalText,
        messages: updated.messages,
        tools: useTools,
        use_tools: useTools,
        use_web_search: useWeb,
        system_prompt: getSystemPrompt(finalText, targetConv.systemPrompt, usePersona),
        temperature: useTemp,
        provider: useProvider,
        model: useModel || undefined,
        channel: targetClientId,
        conversationId: convId || targetClientId,
        projectId: activeProject?.id || null,
        image: sentImage?.dataUrl || null,
        // On-device safety screen → surface a soft support card (never blocks).
        onSafety: (_verdict, card) => { if (card) setCrisisCard(card) },
      },
      (token) => { _latTurn.firstToken(); content += token; pushStreamContent(content); publishStream(content, targetClientId); setStatusMap(prev => (prev[targetClientId] === '' ? prev : { ...prev, [targetClientId]: '' })) },
      (s) => { sources = s },
      (_final, meta) => {
        _latTurn.done()
        endActivityTurn(targetClientId)
        setStatusMap(prev => (prev[targetClientId] === '' ? prev : { ...prev, [targetClientId]: '' }))
        setStreamIdMap(prev => (prev[targetClientId] == null ? prev : { ...prev, [targetClientId]: null }))
        setLoadingMap(prev => (!prev[targetClientId] ? prev : (() => { const n = { ...prev }; delete n[targetClientId]; return n })()))

        // Tell the user their answer arrived if they looked away. The desktop
        // shell has supported rich notifications since v3.13 and nothing ever
        // called them, so a long question answered into an unfocused window
        // produced no signal at all. hasReply puts an inline box on the
        // notification, so they can carry on without switching back.
        try {
          if (shouldNotifyTurn({
            isDesktop: isDesktop(),
            hidden: typeof document !== 'undefined' && document.hidden,
            focused: typeof document !== 'undefined' && document.hasFocus(),
            aborted: !!meta?.aborted,
            error: meta?.error,
            hasText: !!content.trim(),
          }) && typeof window.__YOGATIK_NOTIFY__ === 'function') {
            window.__YOGATIK_NOTIFY__({
              title: notificationTitle(conversationsRef.current?.[activeIdxRef.current]?.title),
              body: notificationBody(content),
              hasReply: true,
            })
          }
        } catch { /* notifications are a courtesy; never break a finished turn */ }
        if (!content.trim() && meta?.aborted) {
          setStreamText(targetClientId, '')
          setActiveToolsMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
          setPendingToolResultsMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
          delete toolRunMapRef.current[targetClientId]
          delete traceMapRef.current[targetClientId]
          return
        }
        const runData = toolRunMapRef.current[targetClientId] || { results: {}, used: [] }
        const channelTrace = traceMapRef.current[targetClientId] || []
        const finalTrace = (meta?.trace?.length ? meta.trace : channelTrace)
        const assistantMsg = {
          createdAt: Date.now(),
          role: 'assistant',
          content: meta?.aborted ? content + '\n\n_[stopped]_' : content,
          sources,
          toolResults: { ...runData.results },
          toolsUsed: [...runData.used],
          trace: finalTrace.length ? [...finalTrace] : undefined,
          provider: meta?.provider || useProvider,
          model: meta?.model || useModel || (useProvider === 'local' ? DEFAULT_LOCAL_MODEL : undefined),
        }
        saveMessage(convId, assistantMsg).catch(e => console.error('Failed to persist reply', e))
        // Implicit procedural adaptation — learn interaction preferences from
        // behaviour (message length, tools leaned on, active style/persona).
        try {
          recordTurn({
            userLen: typeof finalText === 'string' ? finalText.length : 0,
            tool: (runData.used && runData.used[0]) || undefined,
            personaName: (activeTemplate && activeTemplate !== 'default') ? activeTemplate : undefined,
          })
        } catch { /* never break the turn */ }
        setConversations(prev => {
          const next = prev.map(c =>
            (c.clientId === targetClientId || (convId && c.id === convId)) ? { ...c, id: convId, messages: [...(c.messages || []), assistantMsg] } : c
          )
          conversationsRef.current = next
          return next
        })
        setStreamText(targetClientId, '')
        setActiveToolsMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
        setPendingToolResultsMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
        delete toolRunMapRef.current[targetClientId]
        delete traceMapRef.current[targetClientId]
        getTodayUsage().then(setUsage).catch(() => {})
        // Name the chat: switching away mid-turn would otherwise end the turn
        // on whichever conversation the user is now looking at.
        endActivityTurn(targetClientId)
        triggerNextQueued(targetClientId)
      },
      (err) => {
        setStatusMap(prev => ({ ...prev, [targetClientId]: '' }))
        setStreamIdMap(prev => ({ ...prev, [targetClientId]: null }))
        setLoadingMap(prev => { const n = { ...prev }; delete n[targetClientId]; return n })
        delete toolRunMapRef.current[targetClientId]
        delete traceMapRef.current[targetClientId]
        if (isRetiredModelError(err)) {
          pruneRetiredModel(useProvider, useModel).then(() => {
            setModel('')
            refreshModels()
            getAllProviderStatus().then(setProviderStatus)
          })
        }
        setConversations(prev => {
          const next = prev.map(c =>
            (c.clientId === targetClientId || (convId && c.id === convId))
              ? { ...c, id: convId, messages: [...(c.messages || []), { role: 'assistant', provider: useProvider, model: useModel || (useProvider === 'local' ? DEFAULT_LOCAL_MODEL : undefined), error: String(err), content: '' }] }
              : c
          )
          conversationsRef.current = next
          return next
        })
        setStreamText(targetClientId, '')
        triggerNextQueued(targetClientId)
      },
      (status) => { setStatusMap(prev => (prev[targetClientId] === status ? prev : { ...prev, [targetClientId]: status })) },
      (streamId) => { setStreamIdMap(prev => (prev[targetClientId] === streamId ? prev : { ...prev, [targetClientId]: streamId })) },
      (detectedTools, args) => {
        setActiveToolsMap(prev => (prev[targetClientId] === detectedTools ? prev : { ...prev, [targetClientId]: detectedTools }))
        const runData = toolRunMapRef.current[targetClientId] || { results: {}, used: [] }
        for (const t of detectedTools) {
          if (!runData.used.includes(t)) runData.used.push(t)
          const trace = traceMapRef.current[targetClientId] || []
          trace.push({ tool: t, args: args || undefined, status: 'running', startedAt: Date.now() })
          traceMapRef.current[targetClientId] = trace
          // Same data, live: keyed by position so the settle below replaces it.
          publishStep({
            id: `${targetClientId}:${trace.length - 1}`,
            name: t,
            status: 'running',
            startedAt: Date.now(),
            detail: args ? String(JSON.stringify(args)).slice(0, 160) : undefined,
          }, targetClientId)
        }
        toolRunMapRef.current[targetClientId] = runData
      },
      (toolName, toolResult) => {
        const runData = toolRunMapRef.current[targetClientId] || { results: {}, used: [] }
        runData.results[toolName] = toolResult
        toolRunMapRef.current[targetClientId] = runData
        setPendingToolResultsMap(prev => ({ ...prev, [targetClientId]: { ...(prev[targetClientId] || {}), [toolName]: toolResult } }))
        // The docked browser only exists while something is in it.
        if (toolResult?.tool === 'browser_control') {
          if (toolResult.mode === 'panel') setBrowserPanel({ url: toolResult.url || '' })
          else if (toolResult.mode === 'window') setBrowserPanel(null)
        }
        const trace = traceMapRef.current[targetClientId] || []
        const idx = [...trace].reverse().findIndex(s => s.tool === toolName && s.status === 'running')
        const step = idx === -1 ? null : trace[trace.length - 1 - idx]
        if (step) step.status = toolResult?.success === false ? 'error' : 'done'
        if (step) {
          publishStep({
            id: `${targetClientId}:${trace.length - 1 - idx}`,
            status: step.status,
            ms: step.startedAt ? Date.now() - step.startedAt : undefined,
            detail: toolResult?.error ? String(toolResult.error).slice(0, 200) : undefined,
          }, targetClientId)
        }
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
    if (file) {
      setAttachedFile(file)
      let real = null
      try { real = window.__YOGATIK_DND__?.getPathForFile?.(file) || null } catch { real = null }
      setAttachedFilePath(real)
    }
  }

  const handleEnhancePrompt = async () => {
    if (!input.trim() || isEnhancing) return
    setIsEnhancing(true)
    showToast('✨ Enhancing prompt…')
    try {
      const activeKey = keyInfo[conv?.provider || provider]?.key || ''
      const enhanced = await enhancePromptText(input, {
        provider: conv?.provider || provider,
        model: conv?.model || model,
        apiKey: activeKey,
      })
      if (enhanced && enhanced.trim() && enhanced.trim() !== input.trim()) {
        setInput(enhanced.trim())
        setTimeout(() => {
          autoResize()
          textareaRef.current?.focus()
        }, 50)
        showToast('✨ Prompt enhanced!')
      } else {
        showToast('✨ Prompt is already well-structured')
      }
    } catch (err) {
      console.warn('Enhance prompt failed:', err)
      showToast('Could not enhance prompt')
    } finally {
      setIsEnhancing(false)
    }
  }

  const sendRef = useRef(send)
  sendRef.current = send  // always current — no useEffect lag

  // Inline reply typed into the OS notification. main.cjs relays it as
  // 'notification-action'; nothing listened before, so the reply box the
  // notification offered went nowhere. Goes through sendRef for the same
  // reason every other deferred caller does: `send` is recreated each render.
  useEffect(() => {
    const bridge = window.__YOGATIK_NOTIFY_ACTIONS__
    if (!bridge?.on) return undefined
    return bridge.on((payload) => {
      const text = cleanReply(payload?.reply)
      if (text) sendRef.current?.(text)
    })
  }, [])



  const handleSlashCommandSelect = (cmd) => {
    setShowSlashMenu(false)
    if (!cmd) return
    switch (cmd.command) {
      case '/enhance':
        handleEnhancePrompt()
        break
      case '/clear':
        createConversation()
        setInput('')
        break
      case '/new':
        createConversation()
        setInput('')
        break
      case '/terminal':
        setShowTerminal(true)
        setInput('')
        break
      case '/export':
        handleExport()
        setInput('')
        break
      case '/settings':
        setSidebarOpen(true)
        setSettingsOpen(true)
        setInput('')
        break
      case '/help':
        setShowShortcutsModal(true)
        setInput('')
        break
      default:
        setInput('')
        break
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault()
      handleEnhancePrompt()
      return
    }

    if (showSlashMenu) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashMenuIndex(prev => Math.max(0, prev - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashMenuIndex(prev => prev + 1)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSlashMenu(false)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const menuCommands = [
          { command: '/enhance', label: 'Enhance Prompt' },
          { command: '/clear', label: 'Clear Chat' },
          { command: '/new', label: 'New Chat' },
          { command: '/terminal', label: 'Open Terminal' },
          { command: '/export', label: 'Export Conversation' },
          { command: '/settings', label: 'Open Settings' },
          { command: '/help', label: 'Keyboard Shortcuts & Help' },
        ]
        const cleanFilter = input.startsWith('/') ? input.slice(1).toLowerCase() : input.toLowerCase()
        const matching = menuCommands.filter(c =>
          c.command.slice(1).toLowerCase().includes(cleanFilter) ||
          c.label.toLowerCase().includes(cleanFilter)
        )
        const selected = matching[Math.min(slashMenuIndex, matching.length - 1)] || matching[0]
        if (selected) {
          handleSlashCommandSelect(selected)
          return
        }
      }
    }

    // Up Arrow (ArrowUp) -> Recall previous sent chat prompt(s)
    if (e.key === 'ArrowUp') {
      const isAtStart = e.target.selectionStart === 0 && e.target.selectionEnd === 0
      const isEmpty = !input
      if (isEmpty || isAtStart) {
        // Collect user prompts from current conversation + session history
        const curIdx = activeIdxRef.current
        const convMsgs = (conversationsRef.current[curIdx]?.messages || [])
          .filter(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim())
          .map(m => m.content.trim())

        const combinedHistory = Array.from(new Set([...promptHistoryRef.current, ...convMsgs]))
        if (combinedHistory.length > 0) {
          if (historyIndexRef.current === -1) {
            draftInputRef.current = input
            historyIndexRef.current = combinedHistory.length - 1
          } else if (historyIndexRef.current > 0) {
            historyIndexRef.current -= 1
          }

          const targetPrompt = combinedHistory[historyIndexRef.current]
          if (targetPrompt !== undefined) {
            e.preventDefault()
            setInput(targetPrompt)
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.setSelectionRange(targetPrompt.length, targetPrompt.length)
                autoResize()
              }
            }, 0)
            return
          }
        }
      }
    }

    // Down Arrow (ArrowDown) -> Go forward in prompt history or restore unsubmitted draft
    if (e.key === 'ArrowDown') {
      if (historyIndexRef.current !== -1) {
        const curIdx = activeIdxRef.current
        const convMsgs = (conversationsRef.current[curIdx]?.messages || [])
          .filter(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim())
          .map(m => m.content.trim())

        const combinedHistory = Array.from(new Set([...promptHistoryRef.current, ...convMsgs]))

        if (historyIndexRef.current < combinedHistory.length - 1) {
          historyIndexRef.current += 1
          const targetPrompt = combinedHistory[historyIndexRef.current]
          e.preventDefault()
          setInput(targetPrompt)
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.setSelectionRange(targetPrompt.length, targetPrompt.length)
              autoResize()
            }
          }, 0)
          return
        } else {
          // Reached latest draft
          historyIndexRef.current = -1
          const restored = draftInputRef.current || ''
          e.preventDefault()
          setInput(restored)
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.setSelectionRange(restored.length, restored.length)
              autoResize()
            }
          }, 0)
          return
        }
      }
    }

    if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      sendRef.current?.()
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
  }, [provider, model])

  const continueTurn = async () => {
    if (isStreamingHere) return
    sendRef.current?.('Continue from where you left off. Proceed immediately to execute the next steps and tool calls to complete the task.')
  }

  const regenerate = async () => {
    if (isStreamingHere) return
    const curIdx = activeIdxRef.current
    const targetConv = conversationsRef.current[curIdx]
    const msgs = targetConv?.messages || []
    let lastUser = -1
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'user') { lastUser = i; break } }
    if (lastUser < 0) return
    const lastUserMsg = msgs[lastUser]
    const prompt = lastUserMsg.content
    const imageToResend = lastUserMsg.image ? { dataUrl: lastUserMsg.image, thumb: lastUserMsg.image, name: 'attached-image' } : null
    // Rewind local state to just before that turn; the stored rows are rebuilt
    // on the next save, and stale trailing rows are pruned here.
    const kept = msgs.slice(0, lastUser)
    setConversations(prev => {
      const next = prev.map((c, i) => i === curIdx ? { ...c, messages: kept } : c)
      conversationsRef.current = next
      return next
    })
    if (targetConv?.id) { try { await trimConversationFrom(targetConv.id, lastUser) } catch {} }
    sendRef.current?.(prompt, imageToResend)
  }

  const handleBackup = async () => {
    try {
      const c = await downloadBackup()
      showInfoModal('Backup Exported', `Exported ${c.conversations} conversations, ${c.messages} messages and ${c.documents} documents.\n\nAPI keys are not included — add them again after restoring.`)
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
      showInfoModal('Restore Complete', `Restored ${c.conversations} conversations, ${c.messages} messages and ${c.documents} documents.`)
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

    const curIdx = activeIdxRef.current
    const targetConv = conversationsRef.current[curIdx]
    const userMsg = { role: 'user', content: prompt, createdAt: Date.now() }
    const updated = {
      ...targetConv,
      messages: [...(targetConv?.messages || []), userMsg],
    }
    setConversations(prev => {
      const next = prev.map((c, i) => i === curIdx ? updated : c)
      conversationsRef.current = next
      return next
    })

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
    const curIdx = activeIdxRef.current
    const targetConv = conversationsRef.current[curIdx]
    const curProv = targetConv?.provider || provider
    const curTemp = targetConv?.temperature !== undefined ? targetConv.temperature : temperature
    setArena(prev => ({ ...prev, [`response${side}`]: '', [`streaming${side}`]: true }))
    return new Promise(resolve => {
      let out = ''
      streamMessage(
        { message: prompt, messages: [], provider: curProv, model: mdl, use_tools: false, use_web_search: false,
          temperature: curTemp, channel: `compare-${side}`, noFallback: true },
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
    const curIdx = activeIdxRef.current
    const targetConv = conversationsRef.current[curIdx]
    const convId = targetConv?.id
    const assistantMsg = {
      createdAt: Date.now(),
      role: 'assistant',
      content: content + `\n\n_[Chosen from Model ${side}: ${modelName}]_`,
      sources: [],
    }
    if (convId) saveMessage(convId, assistantMsg).catch(() => {})
    setConversations(prev => {
      const next = prev.map((c, i) =>
        i === curIdx ? { ...c, messages: [...(c.messages || []), assistantMsg] } : c
      )
      conversationsRef.current = next
      return next
    })
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
    const curIdx = activeIdxRef.current
    const source = conversationsRef.current[curIdx] || conversations[curIdx]
    const msgs = source?.messages || []

    // Find the actual index of the last user message so we rewind in-place
    // when editing it (nothing after it is worth keeping as a separate branch).
    const lastUserIdx = msgs.reduceRight(
      (found, m, i) => found >= 0 ? found : m.role === 'user' ? i : -1, -1
    )
    const isLastTurn = index >= lastUserIdx

    // The very last turn has nothing after it worth preserving: rewind in place.
    if (isLastTurn) {
      const kept = msgs.slice(0, index)
      setConversations(prev => {
        const next = prev.map((c, i) => i === curIdx ? { ...c, messages: kept } : c)
        conversationsRef.current = next
        return next
      })
      if (source?.id) { try { await trimConversationFrom(source.id, index) } catch {} }
      setInput(text)
      textareaRef.current?.focus()
      autoResize()
      return
    }

    try {
      const forked = await branchConversation(source?.id, index)
      const newForked = {
        ...forked,
        clientId: `c_${forked.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        provider: forked.provider || source?.provider || provider || 'local',
        model: forked.model !== undefined ? forked.model : (source?.model || model || ''),
        systemPrompt: forked.settings?.systemPrompt ?? source?.systemPrompt ?? '',
        persona: forked.settings?.persona ?? source?.persona ?? 'default',
        temperature: forked.settings?.temperature ?? source?.temperature ?? 0.7,
        webSearch: forked.settings?.webSearch ?? source?.webSearch ?? true,
        tools: forked.settings?.tools ?? source?.tools ?? true,
        messages: (forked.messages || []).map(hydrate),
      }
      setConversations(prev => {
        const next = [newForked, ...prev]
        conversationsRef.current = next
        return next
      })
      setActiveIdx(0)
      activeIdxRef.current = 0
      setVisibleCount(WINDOW_STEP)
      setInput(text)
      textareaRef.current?.focus()
      autoResize()
      showToast('Branched — the original chat is untouched')
    } catch (e) {
      setErrorModalMsg(`Could not branch this conversation.\n\n${e.message}`)
    }
  }, [isStreamingHere, provider, model, autoResize, showToast])

  const startRename = (idx) => {
    setRenamingIdx(idx)
    setRenameText(conversationsRef.current[idx]?.title || conversations[idx]?.title || '')
  }

  const commitRename = async () => {
    const idx = renamingIdx
    const title = renameText.trim()
    setRenamingIdx(null)
    if (idx == null || !title) return
    const id = conversationsRef.current[idx]?.id || conversations[idx]?.id
    const targetClientId = conversationsRef.current[idx]?.clientId || conversations[idx]?.clientId
    setConversations(prev => {
      const next = prev.map((c, i) => (targetClientId ? c.clientId === targetClientId : i === idx) ? { ...c, title } : c)
      conversationsRef.current = next
      return next
    })
    if (id) { try { await renameConversation(id, title) } catch {} }
  }

  const paletteCommands = useMemo(() => {
    const cmds = [
      { id: 'new', group: 'Chat', label: 'New chat', hint: 'Ctrl+Shift+O', run: newChat },
      { id: 'compare', group: 'Chat', label: 'Model Arena (Compare 2 models)', hint: 'Side-by-side', run: () => setCompareMode(true) },
      { id: 'continue', group: 'Chat', label: 'Continue task from where model stopped', run: continueTurn },
      { id: 'regen', group: 'Chat', label: 'Regenerate last reply', run: regenerate },
      { id: 'export', group: 'Chat', label: 'Export this chat as Markdown', run: () => handleExport('md') },
      { id: 'export-html', group: 'Chat', label: 'Export this chat as HTML', run: () => handleExport('html') },
      { id: 'export-pdf', group: 'Chat', label: 'Export this chat as PDF', run: () => handleExport('pdf') },
      { id: 'backup', group: 'Data', label: 'Export all data (backup)', run: handleBackup },
      { id: 'import', group: 'Data', label: 'Import a backup file', run: () => backupInput.current?.click() },
      { id: 'theme', group: 'View', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, run: () => setTheme(t => t === 'dark' ? 'light' : 'dark') },
      { id: 'settings', group: 'View', label: 'Open settings & API keys', run: () => { setSidebarOpen(true); setSettingsOpen(true) } },
      { id: 'personalise', group: 'View', label: 'Personalise — voice & interface', run: () => setShowPersonalise(true) },
      { id: 'skills', group: 'View', label: 'Skills & workflows', run: () => setShowSkills(true) },
      { id: 'agents-panel', group: 'View', label: '🤖 Specialized Agents Panel (Researcher, Modeller, Swarms...)', hint: 'Specialist AI', run: () => setShowAgents(true) },
      // Desktop-only surfaces. They are listed on the web too and say so when
      // opened, rather than being silently absent depending on the build.
      { id: 'terminal', group: 'Tools', label: '⌨️ Terminal — watch the assistant, run your own', hint: 'Ctrl+`', run: () => setShowTerminal(true) },
      { id: 'file-editor', group: 'Tools', label: '📝 Create or edit a file in the workspace', hint: isDesktop() ? 'Workspace' : 'Desktop app', run: () => setShowFileEditor(true) },
      { id: 'workspace', group: 'View', label: '🗂️ File explorer & changes', hint: isDesktop() ? 'Ctrl+B' : 'Desktop app', run: () => setShowWorkspace(v => !v) },
      { id: 'workspace-scm', group: 'View', label: '🔀 Review the agent’s file changes', hint: isDesktop() ? 'Source control' : 'Desktop app', run: () => setShowWorkspace(true) },
      { id: 'scheduler', group: 'Tools', label: '⏰ Scheduled tasks (cron jobs)', hint: 'Manage & cancel', run: () => setShowScheduler(true) },
      { id: 'sub-agents', group: 'Tools', label: '🧩 Sub-agent runner', hint: 'Isolated agents', run: () => setShowSubAgents(true) },
      { id: 'auto-skills', group: 'Tools', label: '✨ Auto-generated skills', hint: 'Review & prune', run: () => setShowAutoSkills(true) },
      { id: 'tools-modal', group: 'Tools', label: 'Configure AI Tools (Search, Code, Image...)', run: () => setShowToolPicker(true) },
      { id: 'tools', group: 'Settings', label: `${tools ? 'Disable' : 'Enable'} all AI tools`, run: () => setToolsEnabled(!tools) },
      { id: 'web', group: 'Settings', label: `${webSearch ? 'Disable' : 'Enable'} web research`, run: () => setWebSearch(!webSearch) },
      { id: 'route', group: 'Settings', label: `${autoRoute ? 'Disable' : 'Enable'} auto-routing`, run: () => setAutoRoute(!autoRoute) },
      { id: 'autopick', group: 'Models', label: 'Auto-pick the fastest model', run: () => handleAutoPick() },
      { id: 'domain-hub', group: 'Navigation', label: '🌐 Social Media & Domain Hub (YouTube, X, Jobs, TikTok...)', hint: 'Alt+D', run: () => setShowDomainHub(true) },
      { id: 'naukri-jobs', group: 'Jobs & Careers', label: 'Search Tech Jobs on Naukri & Indeed', hint: 'Career AI', run: () => { setInput('Search Naukri and Indeed for Senior React and AI Engineer jobs in Bangalore and Remote. List top openings with salaries and requirements.'); textareaRef.current?.focus(); autoResize(); } },
      { id: 'youtube-summary', group: 'Video & Media', label: 'Summarize YouTube Video URL', hint: 'Video AI', run: () => { setInput('Please extract transcript, key insights, and timestamps for this YouTube video: '); textareaRef.current?.focus(); autoResize(); } },
      { id: 'x-thread', group: 'Social Content', label: 'Write Viral X (Twitter) Thread', hint: 'Thread Generator', run: () => { setInput('Write a viral 5-tweet thread explaining how AI agents transform productivity. Number [1/5] to [5/5].'); textareaRef.current?.focus(); autoResize(); } },
      { id: 'linkedin-post', group: 'Social Content', label: 'Draft High-Impact LinkedIn Post', hint: 'LinkedIn Generator', run: () => { setInput('Draft an engaging, insightful LinkedIn post about emerging AI trends in 2026 with a hook, line-spaced paragraphs, and closing discussion question.'); textareaRef.current?.focus(); autoResize(); } },
      { id: 'demo', group: 'View', label: 'Take a quick tour / interactive demo', run: () => setShowDemoModal(true) },
      { id: 'tour', group: 'View', label: 'Guided tour of the interface', run: () => setShowTour(true) },
      { id: 'download-pwa', group: 'View', label: 'Install / download desktop app (PWA)', run: () => setShowDownloadModal(true) },
      { id: 'new-persona', group: 'Personas', label: 'Create new custom persona...', run: () => setShowPersonaModal(true) },
      { id: 'diagnostics', group: 'Settings', label: 'Error Findings & Diagnostics Inspector', hint: 'Inspect Logs', run: () => setShowDiagnosticsModal(true) },
    ]

    for (const [id, p] of Object.entries(models)) {
      cmds.push({
        id: `prov-${id}`, group: 'Provider', label: `Switch to provider: ${p.name}`,
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

    promptTemplates.forEach(t => {
      cmds.push({
        id: `persona-${t.id}`,
        group: 'Personas',
        label: `${t.icon || '🤖'} ${t.name}`,
        hint: activeTemplate === t.id ? 'active' : 'activate',
        run: () => setPersona(t.id),
      })
    })

    toolPrefs.forEach(t => {
      cmds.push({
        id: `tool-pref-${t.name}`,
        group: 'Tools',
        label: `${t.enabled ? 'Disable' : 'Enable'} ${t.name.replace(/_/g, ' ')}`,
        hint: t.group,
        run: () => toggleTool(t.name, !t.enabled),
      })
    })

    conversations.forEach((c, i) => {
      if (!c.messages.length) return
      cmds.push({ id: `conv-${i}`, group: 'Chat', label: c.title, hint: `${c.messages.length} msg${c.messages.length === 1 ? '' : 's'}`, run: () => switchChat(i) })
    })

    return cmds
  }, [models, provider, measuredModels, conversations.length, conversations.map(c => `${c.title}:${c.messages?.length}`).join('|'), promptTemplates, toolPrefs, activeTemplate, theme, tools, webSearch, autoRoute])

  const providerEntries = Object.entries(models)
  const providerModels = models[provider]?.models || []

  // Folders & Tags for organization
  const allFolders = useMemo(() => {
    const set = new Set()
    conversations.forEach(c => { if (c.folder) set.add(c.folder) })
    return Array.from(set)
  }, [conversations])

  const allTags = useMemo(() => {
    const set = new Set()
    conversations.forEach(c => { (c.tags || []).forEach(t => set.add(t)) })
    return Array.from(set)
  }, [conversations])

  // Conversation filter — matches title and message text, folder, and tags (deferred and memoised to prevent UI blocking on keystrokes)
  const deferredConvQuery = useDeferredValue(convQuery)
  const visibleConvs = useMemo(() => {
    return conversations
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        if (activeFolder && (c.folder || '') !== activeFolder) return false
        if (activeTag && !(c.tags || []).includes(activeTag)) return false
        if (!deferredConvQuery.trim()) return true
        const q = deferredConvQuery.toLowerCase()
        return c.title.toLowerCase().includes(q) ||
          (c.folder && c.folder.toLowerCase().includes(q)) ||
          (c.tags && c.tags.some(t => t.toLowerCase().includes(q))) ||
          c.messages.some(m => (m.content || '').toLowerCase().includes(q))
      })
  }, [conversations, deferredConvQuery, activeFolder, activeTag])

  // Bucketed for the sidebar. Grouping is pure and lives in convGroups.js so the
  // date boundaries are testable rather than a clock-dependent render detail.
  const convGroups = useMemo(() => groupConversations(visibleConvs), [visibleConvs])

  // Hero tool badges. The curated names are the ones that read as capabilities
  // at a glance; anything not actually registered in TOOL_ICONS is filtered out
  // rather than rendering a blank chip, and the preview is topped up from
  // whatever remains so it never looks sparse if a name is renamed later.
  const { heroTools, hiddenToolCount } = useMemo(() => {
    const all = Object.entries(TOOL_ICONS)
    const CURATED = [
      'web_search', 'deep_research', 'image_generate', 'code_execute', 'video_render',
      'doc_search', 'weather', 'translate', 'ocr', 'chart', 'diagram', 'memory',
    ]
    const picked = CURATED.filter(n => TOOL_ICONS[n]).map(n => [n, TOOL_ICONS[n]])
    const seen = new Set(picked.map(([n]) => n))
    const topUp = all.filter(([n]) => !seen.has(n)).slice(0, Math.max(0, 12 - picked.length))
    const preview = [...picked, ...topUp]
    // Counted off the PREVIEW, not off what is currently rendered. Deriving it
    // from the rendered list made it 0 once expanded, which hid the toggle and
    // left "Show fewer" unreachable — expanding was a one-way door.
    return {
      heroTools: showAllTools ? all : preview,
      hiddenToolCount: all.length - preview.length,
    }
  }, [showAllTools])

  if (companionMode) {
    return (
      <FloatingCompanion
        onExitCompanion={toggleCompanion}
        onPopOutPip={handlePopOutPip}
        onNewChat={newChat}
        onSendPrompt={(p, img) => {
          // An ambient observation is not something the user typed, so it must
          // not land in the composer — otherwise their half-written question is
          // overwritten by the companion thinking to itself.
          if (!p.startsWith('[Ambient check')) setInput(p)
          sendRef.current?.(p, img)
        }}
        isStreaming={isStreamingHere}
        streamText={companionStreamText}
        messages={allMessages}
        activeProvider={conv?.provider || provider}
        activeModel={conv?.model || model}
      />
    )
  }

  return (
    // A COLUMN wrapper so the terminal can be a full-width bottom drawer.
    // `.app` is a flex ROW (sidebar | chat | workspace dock); putting the
    // drawer inside it would make it a fourth column, and putting it inside
    // the chat column would leave it fighting the dock for width.
    <div className="app-shell">
    <div className="app">
      {pipWindow && ReactDOM.createPortal(
        <FloatingCompanion
          isPip={true}
          onExitCompanion={() => {
            closeDocumentPip()
            setPipWindow(null)
          }}
          onNewChat={newChat}
          onSendPrompt={(p, img) => {
            // See the note on the other companion mount: an ambient observation
            // must not overwrite what the user is part-way through typing.
            if (!p.startsWith('[Ambient check')) setInput(p)
            sendRef.current?.(p, img)
          }}
          isStreaming={isStreamingHere}
          streamText={companionStreamText}
          messages={allMessages}
          activeProvider={conv?.provider || provider}
          activeModel={conv?.model || model}
        />,
        // #pip-root, not <body>: the injected base stylesheet gives that
        // element the window's height. Portalling into a bare body left the
        // companion in a box with no height of its own.
        getPipMount() || pipWindow.document.body
      )}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <h2
            onClick={() => setShowOverviewModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
            title="About Yogatik & Workflow Overview"
          >
            <YogatikLogo size={28} /> Yogatik
          </h2>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={16} /></button>
        </div>

        {/* Identity lives in the FOOTER now, not above the chat list: it is not
            navigation, and it was occupying the most valuable row in the panel. */}

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

        <button
          type="button"
          className="sidebar-search-btn"
          onClick={() => setShowPalette(true)}
          title="Search chats, models & commands (Ctrl+K)"
          aria-label="Universal Search"
        >
          <Search size={13} />
          <span>Search & Commands</span>
          <kbd>Ctrl+K</kbd>
        </button>

        {/* One search, not two. This used to be a SECOND input four rows below
            the Ctrl+K button, filtering titles by substring. The palette already
            searches chats — BM25 over titles AND message bodies (chatSearch.js) —
            so it strictly supersedes this. convQuery is still honoured by
            visibleConvs, so a search driven from the palette keeps working. */}

        <div className="sidebar-scroll">
        <div className="conversation-list">
          {(allFolders.length > 0 || allTags.length > 0) && (
            <div className="folder-filter-bar" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 6px', margin: '2px 0 8px', fontSize: 11 }}>
              <button
                type="button"
                className={`small-btn ${!activeFolder && !activeTag ? 'active' : ''}`}
                style={{ padding: '2px 6px', fontSize: 10, borderRadius: 12, border: '1px solid var(--border)', background: !activeFolder && !activeTag ? 'var(--accent, #6366f1)' : 'transparent', color: !activeFolder && !activeTag ? '#fff' : 'inherit' }}
                onClick={() => { setActiveFolder(null); setActiveTag(null); }}
              >
                All
              </button>
              {allFolders.map(f => (
                <button
                  key={f}
                  type="button"
                  className={`small-btn ${activeFolder === f ? 'active' : ''}`}
                  style={{ padding: '2px 6px', fontSize: 10, borderRadius: 12, border: '1px solid var(--border)', background: activeFolder === f ? 'var(--accent, #6366f1)' : 'transparent', color: activeFolder === f ? '#fff' : 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}
                  onClick={() => { setActiveFolder(activeFolder === f ? null : f); setActiveTag(null); }}
                >
                  <Folder size={10} /> {f}
                </button>
              ))}
              {allTags.map(t => (
                <button
                  key={t}
                  type="button"
                  className={`small-btn ${activeTag === t ? 'active' : ''}`}
                  style={{ padding: '2px 6px', fontSize: 10, borderRadius: 12, border: '1px solid var(--border)', background: activeTag === t ? 'var(--accent, #6366f1)' : 'transparent', color: activeTag === t ? '#fff' : 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}
                  onClick={() => { setActiveTag(activeTag === t ? null : t); setActiveFolder(null); }}
                >
                  <Tag size={10} /> {t}
                </button>
              ))}
            </div>
          )}

          {convGroups.map(group => (
          <div key={group.label} className="conv-group">
            <div className="conv-group-label">{group.label}</div>
            {group.items.map(({ c, i }) => (
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
                  {c.folder && (
                    <span style={{ fontSize: 9.5, opacity: 0.75, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginLeft: 4 }}>
                      📁 {c.folder}
                    </span>
                  )}
                  {!!(c.clientId && loadingMap[c.clientId]) && <span className="conv-streaming-dot" title="Generating response…" />}
                </span>
              )}
              {i === activeIdx && renamingIdx !== i && (
                <span className="conv-actions">
                  <button className="icon-btn" onClick={e => {
                    e.stopPropagation()
                    setFolderModalConv({ idx: i, conv: c, folder: c.folder || '' })
                  }} aria-label="Set folder" title="Organize into folder">
                    <FolderPlus size={11} />
                  </button>
                  <button className="icon-btn" onClick={e => {
                    e.stopPropagation()
                    setTagModalConv({ idx: i, conv: c, tags: [...(c.tags || [])] })
                  }} aria-label="Set tags" title="Tag conversation">
                    <Tag size={11} />
                  </button>
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
          </div>
          ))}
          {convQuery && visibleConvs.length === 0 && (
            <div className="conv-empty">No chats match "{convQuery}"</div>
          )}
        </div>

        {/* The ad lives INSIDE the scroll region, never in the settings drawer.
            adsbygoogle.js un-constrains every ancestor of a responsive unit
            (inline `height:auto!important; min-height:0!important`), and inline
            !important outranks any stylesheet — parked in .settings-body it
            blew #root/.app/.sidebar/.settings out to ~2100px in a 900px window,
            pushing the drawer and the footer off-screen with body overflow
            hidden so nothing could scroll to them. Here the mutation cannot
            reach a flex parent that owns the shell height, and shellGuard.js
            reverts it if a future unit tries again. */}
        {!isDesktop() && <AdSenseBanner className="sidebar-ad" />}
        </div>

        <div className={`settings ${settingsOpen ? 'open' : 'closed'}`}>
          <button className="settings-toggle" onClick={() => setSettingsOpen(v => !v)}
            aria-expanded={settingsOpen} aria-controls="settings-body">
            {/* Reads as "Settings" now. Labelling it with the provider name meant
                the only way into model, tools and keys was a row that looked like
                a status readout. The provider stays visible as a subtitle, and the
                dot keeps its at-a-glance connection state. */}
            <span className="settings-toggle-main">
              <Sliders size={12} />
              <span className="settings-toggle-label">Settings</span>
              <span className="settings-toggle-sub">{models[provider]?.name || provider}</span>
              <span className={`conn-dot conn-dot-inline conn-${providerStatus[provider]?.state === 'failed' ? 'failed' : (verifying ? 'testing' : 'connected')}`} />
            </span>
            <ChevronDown size={14} className={settingsOpen ? 'chev open' : 'chev'} />
          </button>

          <div className="settings-body" id="settings-body" hidden={!settingsOpen}>
          <button
            className="small-btn primary wide settings-center-trigger"
            style={{
              margin: '8px 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '8px 12px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#fff', fontWeight: 600, borderRadius: 8, border: 0, boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
            }}
            onClick={() => { setSettingsModalTab('providers'); setShowSettingsModal(true); }}
          >
            <Sliders size={13} /> Open Settings Center
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <label style={{ margin: 0 }}><Sparkles size={12} /> Persona</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(conv?.persona || activeTemplate).startsWith('tmpl-') && (
                <button className="small-btn delete-persona-btn" style={{ padding: '2px 6px', fontSize: '10px', color: '#ff6b6b', height: 'auto', background: 'rgba(255,107,107,0.1)', border: 'none', borderRadius: '3px', cursor: 'pointer' }} onClick={() =>
                  showConfirm('Delete this custom persona?', async () => {
                    await deleteTemplate(conv?.persona || activeTemplate)
                    setPersona('default')
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
          <select value={conv?.persona || activeTemplate} aria-label="Persona" onChange={e => setPersona(e.target.value)}>
            {promptTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.icon ? `${t.icon} ` : ''}{t.name}</option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <label style={{ margin: 0 }}>Provider</label>
            <button className="small-btn" onClick={() => setShowProviderModal(true)} title="Add custom API">
              <Plus size={11} /> Custom
            </button>
          </div>
          <select value={conv?.provider || provider} aria-label="Provider" onChange={e => {
            const nextProvider = e.target.value
            setProvider(nextProvider)
          }}>
            {providerEntries.map(([key, val]) => (
              <option key={key} value={key}>
                {val.name || key}
              </option>
            ))}
          </select>

          {(() => {
            const curProv = conv?.provider || provider
            const st = providerStatus[curProv] || {}
            const isFailed = st.state === 'failed'
            const label = verifying ? 'Checking model…' : (isFailed ? 'Not working' : (st.state === 'connected' ? 'Ready' : (st.state === 'untested' ? 'Ready (Testing…)' : 'Ready')))
            return (
              <div className={`conn-status conn-${verifying ? 'testing' : (isFailed ? 'failed' : 'connected')}`}>
                <span className="conn-dot" />
                <span className="conn-label">{label}</span>
                {!verifying && st.latencyMs != null && (
                  <span className="conn-meta">
                    {formatLatency(st.latencyMs)}
                    {st.latencyMs > 15000 ? ' — very slow' : ''}
                  </span>
                )}
                {st.hasKey && (
                  <button className="small-btn" onClick={() => retestProvider(curProv)}
                    disabled={savingApiKey === curProv || verifying} aria-label="Re-check this model">
                    Retest
                  </button>
                )}
              </div>
            )
          })()}
          {providerStatus[conv?.provider || provider]?.error && (
            <div className="conn-error">{providerStatus[conv?.provider || provider].error}</div>
          )}

          {(conv?.provider || provider) === 'local' ? (
            <React.Suspense fallback={null}>
              <LocalModelPanel
                model={conv?.model || model || DEFAULT_LOCAL_MODEL}
                onModelChange={(m) => chooseModel(m, 'local')}
                onReady={(m) => { chooseModel(m, 'local'); refreshModels() }} />
            </React.Suspense>
          ) : (
            <>
              <label>API Key {models[conv?.provider || provider]?.key_url && <a href={models[conv?.provider || provider].key_url} target="_blank" rel="noopener" style={{fontSize:10,color:'var(--accent)'}}>(get the key)</a>}</label>
              {keyInfo[conv?.provider || provider]?.saved ? (
            <div className="key-saved">
              <div className="key-saved-row">
                <Key size={12} />
                <code>{keyInfo[conv?.provider || provider].masked}</code>
                <button className="link-btn" onClick={() => forgetKey(conv?.provider || provider)}>Forget</button>
              </div>
              <div className="key-where">
                <span title="Stored in this browser's IndexedDB">
                  <Smartphone size={10} /> This device
                </span>
                <span title={keyInfo[conv?.provider || provider].syncedAt
                  ? 'Encrypted and synced to your account'
                  : 'Not uploaded anywhere'}>
                  {keyInfo[conv?.provider || provider].syncedAt
                    ? <><Cloud size={10} /> Cloud (encrypted)</>
                    : <><CloudOff size={10} /> Not in cloud</>}
                </span>
              </div>
            </div>
          ) : (
            <div className="key-none">No key stored for this provider.</div>
          )}

          <input type="password" aria-label={`API key for ${models[conv?.provider || provider]?.name || (conv?.provider || provider)}`}
            placeholder={keyInfo[conv?.provider || provider]?.saved ? 'Replace key…' : 'Enter API key...'}
            value={apiKeyInput[conv?.provider || provider] !== undefined ? apiKeyInput[conv?.provider || provider] : ''}
            onChange={e => setApiKeyInput({ ...apiKeyInput, [conv?.provider || provider]: e.target.value })}
            style={{ width:'100%',padding:'6px 8px',background:'var(--bg-input)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text-primary)',fontSize:'12px',marginBottom:'8px' }}
          />

          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            <button className="small-btn btn-primary" onClick={() => handleAddApiKey(conv?.provider || provider)} disabled={savingApiKey === (conv?.provider || provider)}>
              <Plus size={11} /> {savingApiKey === (conv?.provider || provider) ? 'Verifying...' : 'Add Key'}
            </button>
            <button className="small-btn" onClick={() => { setShowProviderModal(true); setEditingProvider(conv?.provider || provider) }} title="Edit provider details">
              <Plug size={11} /> Edit
            </button>
            <button className="small-btn" onClick={() => handleRemoveProvider(conv?.provider || provider)} title="Remove provider" style={{ color: '#ff4444' }}>
              <Trash2 size={11} /> Remove
            </button>
          </div>

          </>
          )}

          <div className="cloud-sync" hidden={(conv?.provider || provider) === 'local'}>
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
          <div className="sidebar-section-title">Model {(models[conv?.provider || provider]?.models || []).length > 0 && <span className="sidebar-count">{(models[conv?.provider || provider]?.models || []).length}</span>}</div>
          <ModelPicker
            models={models[conv?.provider || provider]?.models || []}
            value={conv?.model !== undefined ? conv.model : model}
            measured={measuredModels}
            formatLatency={formatLatency}
            disabled={!models[conv?.provider || provider]?.available}
            onChange={(m) => chooseModel(m, conv?.provider || provider)} />

          {/* How full the context window is — the user is paying for every
              token of it on their own key. Lives here rather than in the
              header: the header already overflows at 480px, and this reads the
              same limits table the agent compacts against. */}
          <div style={{ margin: '6px 0 2px' }}>
            <ContextMeter
              messages={conv?.messages || []}
              provider={conv?.provider || provider}
              model={conv?.model !== undefined ? conv.model : model} />
          </div>

          <button className="small-btn auto-pick wide" onClick={() => handleAutoPick(conv?.provider || provider)}
            disabled={autoPicking || !models[conv?.provider || provider]?.available}
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
          <label className="slider-label">Temperature <span className="sidebar-count">{conv?.temperature !== undefined ? conv.temperature : (temperature ?? 0.7)}</span></label>
          <input type="range" aria-label="Response randomness (temperature)" min="0" max="1" step="0.1" value={conv?.temperature !== undefined ? conv.temperature : (temperature ?? 0.7)} onChange={e => setTemperature(parseFloat(e.target.value))} />

          {/* ── Tools ─────────────────────────────────────────── */}
          <div className="sidebar-section-title">Tools</div>
          <div className="toggle-row">
            <label><Wrench size={12} /> AI Tools</label>
            <label className="toggle" aria-label="Toggle AI tools">
              <input type="checkbox" checked={conv?.tools !== undefined ? conv.tools : (tools ?? true)} onChange={e => setToolsEnabled(e.target.checked)} /><span className="slider" />
            </label>
          </div>
          {(conv?.tools !== undefined ? conv.tools : (tools ?? true)) && (
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
            <Compass size={12} /> Skills &amp; workflows
          </button>
          <div className="toggle-row">
            <label><Globe size={12} /> Web Research</label>
            <label className="toggle" aria-label="Toggle web research">
              <input type="checkbox" checked={conv?.webSearch !== undefined ? conv.webSearch : (webSearch ?? true)} disabled={!(conv?.tools !== undefined ? conv.tools : (tools ?? true))}
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
                  <button className="small-btn" style={{ padding: '4px 8px' }} onClick={() => setShowDataDashboard(true)}>
                    View & manage what Yogatik remembers about you
                  </button>
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

          <div className="diagnostics-row" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <AlertTriangle size={12} style={{ color: 'var(--accent)' }} /> Error Findings &amp; Diagnostics
              </label>
              <button
                className="small-btn info-btn"
                style={{ padding: '2px 6px', fontSize: 10, height: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 3, cursor: 'pointer', color: 'var(--text-color, inherit)' }}
                onClick={() => setShowDiagnosticsModal(true)}
              >
                Inspect Logs
              </button>
            </div>
            <span className="backup-note">
              On-device ring buffer of runtime failures, provider errors, and system health report.
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

        {/* Footer: identity, plus the cross-surface link. Both used to be
            elsewhere — identity above the chat list where it crowded navigation,
            and the desktop/web link only inside the hero, so it disappeared the
            moment a conversation existed. */}
        <div className="sidebar-footer">
          <button
            className="sidebar-footer-link"
            style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}
            onClick={() => setShowWhatsNew(true)}
            title="View latest app version and release updates"
          >
            <Sparkles size={13} style={{ color: 'var(--accent, #ff6b35)' }} />
            <span>What's New <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>v{APP_VERSION}</strong></span>
          </button>
          {isDesktop() ? (
            <a className="sidebar-footer-link" href="https://yogatik.web.app/" target="_blank" rel="noreferrer"
              title="Open the Yogatik web app in a browser on your mobile or tablet">
              <Smartphone size={13} /> <span>Use web app on mobile/tab</span>
            </a>
          ) : (
            <a className="sidebar-footer-link" href="/platforms" target="_blank" rel="noreferrer"
              title="Download the Yogatik desktop app for Windows, macOS or Linux">
              <Monitor size={13} /> <span>Get the desktop app</span>
            </a>
          )}
          {user ? (
            <div className="user-info">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
              ) : (
                <User size={14} />
              )}
              <span>{user.displayName || user.email}</span>
              <button className="icon-btn" onClick={() => { logout(); setUser(null); signOutEntitlement().then(setEnt); loadConversations() }} title="Sign out">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button className="auth-btn" onClick={requestSignIn} aria-label="Sign in">
              <LogIn size={14} /> Sign In
            </button>
          )}
        </div>
      </aside>

      {/* The workspace dock sits IN the flex row, between the sidebar and the
          chat — it narrows the conversation rather than covering it, which is
          the entire point: you watch the agent edit files while talking to it.
          Gated here, not inside the component, so the CodeMirror chunk is not
          fetched until it is actually opened. */}
      {showWorkspace && (
        <React.Suspense fallback={null}>
          <WorkspaceDock
            open={showWorkspace}
            onUpgrade={() => setShowUpgrade(true)}
            onClose={() => setShowWorkspace(false)}
            conversationId={conv?.clientId || conv?.id || null}
            dark={theme !== 'light'}
          />
        </React.Suspense>
      )}

      <main className="chat-area">
        <header className="chat-header">
          {/* minWidth was 0, and an inline value outranks the stylesheet: the
              action row took the full width on a phone and this block — the
              chat title AND the hamburger that is the only way to open the
              sidebar — collapsed to 0px, present and focusable but invisible.
              88px is a floor the h1 still ellipsizes inside. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 88, flex: 1, overflow: 'hidden' }}>
            {!sidebarOpen && <button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={18} /></button>}
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '420px' }}>
              {conv?.title || 'New Chat'}
            </h1>
          </div>
          <div className="header-actions">
            {/* Both builds can be installed side by side and confusing them is
                a real failure mode, so the personal one always says so. */}
            {isPersonalEdition() && <span className="edition-badge" title="Personal build — no licence check">Personal</span>}
            {/* Trial countdown / locked state. Silent while PRO: a paying user
                does not need a permanent reminder that they are paying. */}
            {isDesktop() && !isPersonalEdition() && (ent.state === 'trial' || ent.state === 'locked') && (
              <button
                className={`trial-chip${ent.state === 'locked' ? ' locked' : ent.daysLeft <= 5 ? ' urgent' : ''}`}
                onClick={() => setShowUpgrade(true)}
                title="Yogatik Pro"
              >
                {ent.state === 'locked'
                  ? 'Upgrade'
                  : `${ent.daysLeft}d trial`}
              </button>
            )}
            {isDesktop() && (
              <button
                className={`icon-btn${showTerminal ? ' active' : ''}`}
                style={{ position: 'relative' }}
                onClick={() => setShowTerminal(v => !v)}
                title="Terminal — watch what the assistant runs, or run your own (Ctrl+`)"
                aria-label="Toggle terminal"
                aria-pressed={showTerminal}
              >
                <TerminalSquare size={17} />
                {/* The reason to surface this at all: an agent command running
                    behind a closed drawer was previously invisible. */}
                {agentTerminalBusy && <span className="term-live-dot" aria-label="A command is running" />}
              </button>
            )}
            {isDesktop() && (
              <button
                className={`icon-btn${showWorkspace ? ' active' : ''}`}
                onClick={() => setShowWorkspace(v => !v)}
                title="Files, search and changes (Ctrl+B)"
                aria-label="Toggle workspace"
                aria-pressed={showWorkspace}
              >
                <PanelLeft size={17} />
              </button>
            )}
            <button
              className={`icon-btn${showActivity ? ' active' : ''}`}
              onClick={() => setShowActivity(v => !v)}
              title="Thinking & actions — what the model is reasoning and running"
              aria-label="Toggle thinking and actions panel"
              aria-pressed={showActivity}
            >
              <Activity size={17} />
            </button>
            {isDesktop() && (
              <>
              <div ref={rootsWrapRef} className="desktop-folder-indicator" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginRight: 8, color: 'var(--text-secondary)' }}>
                <Folder size={15} />
                <button
                  className="small-btn"
                  style={{ padding: '2px 8px', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => setRootsOpen(o => !o)}
                  title={chatRoots.length ? chatRoots.map(r => r.path).join('\n') : 'No working folder for this chat'}
                >
                  {chatRoots.length === 0
                    ? 'No folder'
                    : `${chatRoots[0].label}${chatRoots.length > 1 ? ` +${chatRoots.length - 1}` : ''}`}
                </button>
                {rootsOpen && (
                  <div className="roots-popover" role="dialog" aria-label="Working folders for this chat">
                    <div className="roots-popover-head">
                      <span className="roots-popover-title">Folders for this chat</span>
                      <button className="icon-btn" onClick={() => setRootsOpen(false)}
                        title="Close" aria-label="Close folders">
                        <X size={14} />
                      </button>
                    </div>
                    {chatRoots.length === 0 && <div className="roots-empty">No folder yet.</div>}
                    {chatRoots.map(r => (
                      <div key={r.id} className="roots-row">
                        <span className="roots-path" title={r.path}>{r.path}</span>
                        {r.primary
                          ? <span className="roots-badge">primary</span>
                          : <button className="small-btn" onClick={() => handleMakePrimary(r.id)}>Make primary</button>}
                        <button className="icon-btn" aria-label={`Remove ${r.label}`} onClick={() => handleRemoveFolder(r.id)}><Trash2 size={12} /></button>
                      </div>
                    ))}
                    {chatRoots.length > 0 && chatRoots[0].source !== 'chat' && (
                      <div className="roots-inherited">Inherited from {chatRoots[0].source}. Changing them here affects only this chat.</div>
                    )}
                    <button className="small-btn" onClick={handleAddFolder}>Add folder…</button>
                  </div>
                )}
              </div>
              </>
            )}
            <ActiveTimerIndicator onShowToast={showToast} />
            <div className="header-btn-group" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--bg-secondary, rgba(255,255,255,0.03))', padding: '2px 4px', borderRadius: 8, border: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
              <button
                className="icon-btn"
                onClick={() => setShowAgents(true)}
                title="Specialized Agents & Swarms (Researcher, Modeller, Director...)"
                aria-label="Specialized Agents"
              >
                <Bot size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setShowMcpModal(true)}
                title="MCP Connectors (Model Context Protocol)"
                aria-label="MCP Connectors"
              >
                <Plug size={17} />
              </button>
              <button className="icon-btn domain-hub-header-btn" onClick={() => setShowDomainHub(true)} title="Social Media & Domain Hub (Alt+D)" aria-label="Social Media & Domain Hub"><Globe size={17} /></button>
            </div>
            <div className="header-btn-group" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <button className="icon-btn" onClick={() => setShowPalette(true)} title="Universal Search & Commands (Ctrl+K)" aria-label="Universal Search"><Search size={17} /></button>
              {/* Must not be `onClick={handleExport}`: React would pass the click
                  event as the format argument. */}
              <button className="icon-btn" onClick={() => handleExport('md')} title="Export chat as Markdown (Ctrl+K for HTML / PDF)" aria-label="Export chat"><Download size={17} /></button>
              <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </div>
          </div>
        </header>

        <div className="messages" ref={scrollerRef} onScroll={onScroll}>
          {allMessages.length === 0 && !isStreamingHere && !arena ? (
            <div className="welcome">
              <h1
                onClick={() => setShowOverviewModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', cursor: 'pointer', userSelect: 'none' }}
                title="Click for App Overview & Workflow"
              >
                <YogatikLogo size={48} /> Yogatik
              </h1>
              <div className="hero-buttons">
                <button
                  className="hero-btn primary"
                  onClick={() => setShowDemoModal(true)}
                >
                  <PlayCircle size={16} /> Take a Quick Demo
                </button>
                <button
                  className="hero-btn accent"
                  onClick={() => setShowDomainHub(true)}
                  title="Explore YouTube, X, Instagram, TikTok, LinkedIn, Naukri & Indeed"
                >
                  <Globe size={16} /> Social &amp; Domain Hub
                </button>
                <button
                  className="hero-btn secondary"
                  onClick={installed ? handleShare : () => setShowDownloadModal(true)}
                  title={installed ? 'Share Yogatik with someone' : 'Install Yogatik as an app'}
                >
                  {installed
                    ? <><Share2 size={16} /> Share Yogatik</>
                    : <><Download size={16} /> Install App</>}
                </button>
                {/* The cross-surface link used to sit here as a fourth call to
                    action. It is redundant now: "Install App" opens the platform
                    modal, which already offers BOTH the desktop app and the PWA,
                    and the link itself is permanent in the sidebar footer rather
                    than only on an empty screen. Three actions, not four. */}
              </div>
              {/* Every tool at once was a ~60-badge wall: it out-weighed the starter
                  prompts below it, and a list that long is scanned by nobody. A
                  recognisable dozen makes the point ("this thing does a lot"), and
                  the rest stay one click away for anyone actually shopping. */}
              <div className="tool-badges">
                {heroTools.map(([name, Icon]) => (
                  <span key={name} className="tool-badge"><Icon size={14} /> {name.replace(/_/g, ' ')}</span>
                ))}
                {hiddenToolCount > 0 && (
                  <button
                    type="button"
                    className="tool-badge tool-badge-more"
                    onClick={() => setShowAllTools(v => !v)}
                    aria-expanded={showAllTools}
                  >
                    {showAllTools ? 'Show fewer' : `+${hiddenToolCount} more tools`}
                  </button>
                )}
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
                <>
                  <React.Suspense fallback={null}>
                    <StarterCards onSelectPrompt={(prompt) => sendRef.current?.(prompt)} />
                  </React.Suspense>
                  <div className="suggestions" hidden={!features.suggestions}>
                    {SUGGESTIONS.map((s, i) => {
                      const text = typeof s === 'string' ? s : (s.prompt || s.label)
                      const label = typeof s === 'string' ? s : s.label
                      const category = typeof s === 'object' ? s.category : null
                      return (
                        <div key={i} className="suggestion" onClick={() => sendRef.current?.(text)} title={text}>
                          {category && <span className="suggestion-category">{category}</span>}
                          <span className="suggestion-text">{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
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
                    onOpenArtifact={handleOpenArtifact}
                    onRegenerate={isLastAssistant && !isStreamingHere ? regenerate : undefined}
                    onContinue={isLastAssistant && !isStreamingHere ? continueTurn : undefined}
                    onEdit={!isStreamingHere ? (text) => editAndResend(absolute, text) : undefined}
                    onRetry={m.error && !isStreamingHere ? regenerate : undefined}
                    onOpenSettings={handleOpenSettings}
                    onAutoPick={handleAutoPick} />
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
              {isStreamingHere && hasStreamHere && (() => {
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
                  {((traceMapRef.current[activeClientId] || []).length > 0) && (
                    <details className="activity-trace" style={{ marginTop: 4 }}>
                      <summary>Steps, thoughts & actions taken ({(traceMapRef.current[activeClientId] || []).length} step{(traceMapRef.current[activeClientId] || []).length === 1 ? '' : 's'})</summary>
                      <ol>
                        {(traceMapRef.current[activeClientId] || []).map((s, i) => {
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
                  <StreamingMessage
                    key={activeClientId}
                    ref={streamViewRef}
                    bare
                    initialText={streamTextRef.current[activeClientId] || ''}
                    onGrow={followStream}
                  />
                </div>
                )
              })()}
              {isStreamingHere && !hasStreamHere && (() => {
                const { provider: useProvider = provider, model: useModel = model } = conv || {}
                // Build a friendly display name: prefer the real model ID, then provider name.
                const modelLabel = useModel
                  ? `${models[useProvider]?.name || useProvider} · ${String(useModel).split('/').pop()}`
                  : models[useProvider]?.name || useProvider
                return (
                  <div className="message assistant">
                    <div className="message-role">
                      <span className="message-who">Yogatik</span>
                      <span className="msg-model-badge" title={`Running: ${useProvider} / ${useModel || 'default'}`}>
                        {modelLabel}
                      </span>
                    </div>
                    {statusText && (
                      <div className="status-text" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 12px',
                        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.12), rgba(168, 85, 247, 0.12))',
                        border: '1px solid rgba(255, 107, 53, 0.25)',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-primary, #fff)',
                        marginBottom: '6px',
                        animation: 'fadeIn 0.25s ease'
                      }}>
                        {getStatusIcon(statusText)}
                        <span>{statusText}</span>
                      </div>
                    )}
                    {activeTools.length > 0 && (
                      <div className="active-tools">
                        {activeTools.map(t => {
                          const Icon = TOOL_ICONS[t] || Wrench
                          return <span key={t} className="tool-chip active"><Icon size={10} /> {t}</span>
                        })}
                      </div>
                    )}
                    {((traceMapRef.current[activeClientId] || []).length > 0) && (
                      <div className="live-trace-steps" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(traceMapRef.current[activeClientId] || []).map((s, i) => {
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
                    <div className="typing" style={{ marginTop: '4px' }}><span /><span /><span /></div>
                  </div>
                )
              })()}
              {arena && (
                <div className="arena-wrap">
                  <button className="small-btn arena-close" onClick={() => setArena(null)}
                    aria-label="Close comparison">
                    <X size={12} /> Close comparison
                  </button>
                  <React.Suspense fallback={null}>
                    <ArenaView arenaData={arena} onOpenArtifact={setActiveArtifact} onPickResponse={handlePickCompareResponse} onRetry={retryCompareSide} />
                  </React.Suspense>
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

        <A11yAnnouncer />
        {checkin && (
          <div className="checkin-chip" role="note">
            <button
              className="checkin-text"
              title="Start this check-in"
              onClick={() => { markCheckinShown(); const c = checkin; setCheckin(null); send(c.prompt) }}
            >
              💭 {checkin.text}
            </button>
            <button
              className="checkin-dismiss"
              aria-label="Dismiss check-in"
              title="Not now"
              onClick={() => { markCheckinShown(); setCheckin(null) }}
            >×</button>
          </div>
        )}
        <CrisisCard card={crisisCard} onDismiss={() => setCrisisCard(null)} />
        <ToolStatusPanel onRetry={(name) => send(`Please retry the ${name} tool.`)} />

        <div className={`input-area${dragOver ? ' drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}>
          <div className="composer-top-bar">
            <div className="persona-chips">
              <span className="persona-chip-label">Persona:</span>
              {promptTemplates.slice(0, 6).map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`persona-chip ${(conv?.persona || activeTemplate) === t.id ? 'active' : ''}`}
                  onClick={() => setPersona(t.id)}
                  title={t.system_prompt || t.name}
                >
                  {t.icon ? `${t.icon} ` : ''}{t.name}
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
              prefix={models[conv?.provider || provider]?.name || (conv?.provider || provider)}
              models={models[conv?.provider || provider]?.models || []}
              value={conv?.model !== undefined ? conv.model : model}
              measured={measuredModels}
              formatLatency={formatLatency}
              disabled={!models[conv?.provider || provider]?.available}
              onChange={(m) => chooseModel(m, conv?.provider || provider)} />
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
              <>
                <button className="small-btn btn-continue" onClick={continueTurn}
                  title="Continue from where the model stopped and execute remaining steps"
                  aria-label="Continue last response"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <Play size={12} /> Continue
                </button>
                <button className="small-btn" onClick={regenerate}
                  title="Regenerate last response" aria-label="Regenerate last response">
                  <RefreshCw size={12} /> Regenerate
                </button>
              </>
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
            <div className="offline-banner" role="status" style={
              (provider === 'ollama' || provider === 'local' || models[provider]?.is_ollama || models[provider]?.is_local)
                ? { background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }
                : {}
            }>
              {(provider === 'ollama' || provider === 'local' || models[provider]?.is_ollama || models[provider]?.is_local) ? (
                <>
                  <Zap size={12} /> Offline Mode Active — Local models &amp; Ollama run 100% offline on this machine.
                </>
              ) : (
                <>
                  <AlertTriangle size={12} /> Offline — Switch to Ollama (local) or On-device model to chat offline.
                </>
              )}
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
                    <Sparkles size={11} /> Switch to {typeof visionCandidate === 'string' ? visionCandidate.split('/').pop() : (visionCandidate?.name || visionCandidate?.id || 'vision model')}
                  </button>
                )}
                <button className="icon-btn" onClick={() => setAttachedImage(null)} title="Remove image" aria-label="Remove image"><X size={12} /></button>
              </div>
            )
          })()}
          {/* Queued Prompts Banner */}
          {(() => {
            const currentQueue = queuedMessagesMap[activeClientId] || []
            if (!currentQueue.length) return null
            return (
              <div className="queued-messages-container" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginBottom: '8px',
                width: '100%',
              }}>
                {currentQueue.map((item, qIdx) => (
                  <div
                    key={item.timestamp || qIdx}
                    className="queued-message-pill"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 107, 53, 0.12)',
                      border: '1px solid rgba(255, 107, 53, 0.3)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: 'var(--text-primary, #fff)',
                      animation: 'fadeIn 0.2s ease',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <Clock size={13} style={{ color: 'var(--accent-color, #ff6b35)', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: 'var(--accent-color, #ff6b35)', flexShrink: 0 }}>
                        {qIdx === 0 ? 'Next in Queue' : `Queued #${qIdx + 1}`}:
                      </span>
                      <span style={{
                        opacity: 0.9,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontStyle: 'italic'
                      }}>
                        "{item.text || (item.attachedFile ? `📎 ${item.attachedFile.name}` : 'Image prompt')}"
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit queued prompt"
                        aria-label="Edit queued prompt"
                        onClick={() => handleRestoreQueued(qIdx)}
                        style={{ padding: '3px 6px', fontSize: '11px', height: 'auto', display: 'flex', alignItems: 'center', gap: '2px' }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Cancel queued prompt"
                        aria-label="Cancel queued prompt"
                        onClick={() => handleRemoveQueued(qIdx)}
                        style={{ padding: '3px 6px', fontSize: '11px', height: 'auto', color: '#f87171', display: 'flex', alignItems: 'center' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          <div className="input-wrapper" style={{ position: 'relative' }}>
            {showSlashMenu && (
              <React.Suspense fallback={null}>
                <SlashCommandsMenu
                  filter={input}
                  selectedIndex={slashMenuIndex}
                  onSelect={handleSlashCommandSelect}
                  onClose={() => setShowSlashMenu(false)}
                />
              </React.Suspense>
            )}
            <textarea ref={textareaRef} aria-label="Message" value={input}
              onChange={e => {
                const val = e.target.value
                setInput(val)
                autoResize()
                if (val.startsWith('/')) {
                  setShowSlashMenu(true)
                } else if (showSlashMenu) {
                  setShowSlashMenu(false)
                }
              }}
              onKeyDown={handleKeyDown} onPaste={handlePaste}
              data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
              placeholder={attachedImage
                ? 'Ask about this image… (or just send)'
                : attachedFile ? `Describe what to do with ${attachedFile.name}...`
                : (isStreamingHere ? 'Ask another question… will queue and run automatically' : 'Ask anything… (type / for commands) paste or drop an image too')} rows={1} />
            {input.trim().length >= 3 && !isStreamingHere && (
              <button
                type="button"
                className={`enhance-prompt-btn ${isEnhancing ? 'enhancing' : ''}`}
                onClick={handleEnhancePrompt}
                title="✨ Enhance prompt with clear structure & constraints"
                aria-label="Enhance prompt"
                disabled={isEnhancing}
                style={{
                  background: 'transparent',
                  color: isEnhancing ? 'var(--accent-color, #ff6b35)' : 'var(--text-secondary, #a6adc8)',
                  border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 4, transition: 'all 0.2s ease',
                  opacity: isEnhancing ? 0.6 : 1,
                }}
              >
                <Sparkles size={16} />
              </button>
            )}
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
            {isStreamingHere ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {(input.trim() || attachedFile || attachedImage) && (
                  <button
                    type="button"
                    className="send-btn queue-btn"
                    aria-label="Queue message"
                    onClick={() => sendRef.current?.()}
                    title="Queue message to send automatically after current reply"
                    style={{
                      background: 'var(--accent-color, #ff6b35)',
                      color: '#fff',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(255, 107, 53, 0.3)',
                    }}
                  >
                    <ListPlus size={15} /> Queue
                  </button>
                )}
                <button
                  type="button"
                  className="stop-btn"
                  aria-label="Stop generating"
                  onClick={handleStop}
                  title="Stop generating"
                >
                  <Square size={13} fill="currentColor" /> Stop
                </button>
              </div>
            ) : (
              <button
                className="send-btn"
                aria-label="Send message"
                onClick={() => sendRef.current?.()}
                disabled={!input.trim() && !attachedFile && !attachedImage}
              >
                <Send size={18} />
              </button>
            )}
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

      <React.Suspense fallback={null}>
      {showProviderModal && <ProviderModal
        onClose={() => { setShowProviderModal(false); setEditingProvider(null) }}
        onSaved={() => { refreshModels(); setEditingProvider(null) }}
        editProvider={editingProvider ? { id: editingProvider, ...models[editingProvider] } : null}
      />}
      {showSettingsModal && (
        <SettingsModal
          initialTab={settingsModalTab}
          onClose={() => setShowSettingsModal(false)}
          providersData={models}
          keyInfo={keyInfo}
          activeProvider={conv?.provider || provider}
          activeModel={conv?.model !== undefined ? conv.model : model}
          onSelectProvider={(pid) => setProvider(pid)}
          onSelectModel={(m, pid) => chooseModel(m, pid)}
          onProviderSaved={() => refreshModels()}
          temperature={conv?.temperature !== undefined ? conv.temperature : (temperature ?? 0.7)}
          onTemperatureChange={(t) => setTemperature(t)}
          autoRoute={autoRoute}
          onAutoRouteToggle={(v) => setAutoRoute(v)}
          fallback={fallback}
          onFallbackToggle={(v) => setFallback(v)}
          webSearch={conv?.webSearch !== undefined ? conv.webSearch : (webSearch ?? true)}
          onWebSearchToggle={(v) => setWebSearch(v)}
          toolsEnabled={conv?.tools !== undefined ? conv.tools : (tools ?? true)}
          onToolsToggle={(v) => setToolsEnabled(v)}
          toolPrefs={toolPrefs}
          onToolPrefChange={(name, en) => toggleTool(name, en)}
          prefs={prefs}
          onPrefChange={(k, v) => updatePref(k, v)}
          theme={theme}
          onThemeChange={setTheme}
          user={user}
          onSignIn={requestSignIn}
        />
      )}
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
          onEnd={(handoff) => {
            if (handoff?.recapMarkdown && handoff?.transcripts?.length > 0) {
              setConversations(prev => prev.map((c, i) => i === activeIdx ? {
                ...c,
                messages: [
                  ...(c.messages || []),
                  { role: 'assistant', content: handoff.recapMarkdown, id: `live_recap_${Date.now()}` }
                ]
              } : c))
            }
            setLiveConfig(null)
          }}
        />
      )}
      {showSkills && (
        <SkillsPanel
          onClose={() => setShowSkills(false)}
          onRunWorkflow={runWorkflowNow}
        />
      )}
      {showAgents && (
        <AgentsPanel
          onClose={() => setShowAgents(false)}
          onToast={showToast}
        />
      )}
      {/* TerminalPanel manages its own visibility from `open`, so it is always
          mounted while showing — unlike the panels below, which take isOpen. */}
      {/* Gated at the render site, not inside the component. These are
          React.lazy: rendering one downloads its chunk immediately and the
          internal `if (!isOpen) return null` runs only after the module has
          landed. Nine panels were fetched during the first paint that way. */}
      {showScheduler && (
        <SchedulerPanel
          isOpen={showScheduler}
          onClose={() => setShowScheduler(false)}
          onToast={showToast}
        />
      )}
      {showSubAgents && (
        <SubAgentRunnerPanel
          isOpen={showSubAgents}
          onClose={() => setShowSubAgents(false)}
          onToast={showToast}
        />
      )}
      {showAutoSkills && (
        <AutoSkillsPanel
          isOpen={showAutoSkills}
          onClose={() => setShowAutoSkills(false)}
          onToast={showToast}
        />
      )}
      {showFileEditor && (
        <FileEditorModal
          isOpen={showFileEditor}
          onClose={() => setShowFileEditor(false)}
          onSave={(path) => showToast(`Saved ${path}`)}
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
      {showActivity && <ActivityPanel conversationId={conv?.clientId} onClose={() => setShowActivity(false)} />}
      {browserPanel && (
        <BrowserPanel
          conversationId={browserConvId}
          url={browserPanel.url}
          occluded={browserOccluded}
          onPopOut={() => {
            window.__YOGATIK_BROWSER__?.setMode({ conversationId: browserConvId, display: 'window' })
            updatePref('browser_display_mode', 'window')
            setBrowserPanel(null)
          }}
          onClose={() => {
            window.__YOGATIK_BROWSER__?.close({ conversationId: browserConvId })
            setBrowserPanel(null)
          }}
        />
      )}
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
      {showShareSheet && <ShareSheet onClose={() => setShowShareSheet(false)} />}
      {showDemoModal && <DemoModal onClose={() => setShowDemoModal(false)} />}
      {showUpgrade && (
        <React.Suspense fallback={null}>
          <UpgradeModal
            open={showUpgrade}
            onClose={() => setShowUpgrade(false)}
            idToken={user?.idToken || null}
            uid={user?.uid || user?.id || null}
            onUnlocked={setEnt}
          />
        </React.Suspense>
      )}

      {showTour && <Tour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
        onComplete={() => localStorage.setItem('yogatik_tour_seen', 'true')}
      />}
      {showWhatsNew && (
        <WhatsNewModal
          onClose={() => setShowWhatsNew(false)}
          onOpenSettings={() => {
            setShowWhatsNew(false)
            setSettingsModalTab?.('about')
            setShowSettingsModal(true)
          }}
        />
      )}
      {showOverviewModal && (
        <AppOverviewModal
          onClose={() => setShowOverviewModal(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDemo={() => setShowDemoModal(true)}
          onOpenTour={() => setShowTour(true)}
          onOpenDomainHub={() => setShowDomainHub(true)}
          onOpenMcp={() => setShowMcpModal(true)}
        />
      )}
      {showMcpModal && <McpModal
        isOpen={showMcpModal}
        onClose={() => setShowMcpModal(false)}
        onShowToast={showToast}
      />}
      {showDiagnosticsModal && <DiagnosticsModal onClose={() => setShowDiagnosticsModal(false)} />}
      {showShortcutsModal && <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />}
      {showDataDashboard && <DataDashboard onClose={() => setShowDataDashboard(false)} onExport={() => { downloadBackup().catch(() => {}); showToast('Backup exported') }} />}

      {/* Folder Assignment Modal */}
      {folderModalConv && (
        <Modal
          title="Organize Chat into Folder"
          icon={<Folder size={18} />}
          onClose={() => setFolderModalConv(null)}
        >
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Assign <strong>"{folderModalConv.conv?.title || 'this chat'}"</strong> to a folder for easy categorization.
            </p>

            {allFolders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Existing Folders:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {allFolders.map(f => (
                    <button
                      key={f}
                      type="button"
                      className="small-btn"
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        background: folderModalConv.folder === f ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.06)',
                        color: folderModalConv.folder === f ? '#fff' : 'inherit',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => setFolderModalConv(prev => ({ ...prev, folder: f }))}
                    >
                      <Folder size={12} /> {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Folder Name:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Work, Research, Personal, Projects..."
                value={folderModalConv.folder || ''}
                onChange={e => setFolderModalConv(prev => ({ ...prev, folder: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setConvFolder(folderModalConv.idx, folderModalConv.folder)
                    showToast(folderModalConv.folder ? `Moved to folder "${folderModalConv.folder}"` : 'Folder cleared')
                    setFolderModalConv(null)
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--bg-input, rgba(255,255,255,0.05))',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  borderRadius: '6px',
                  color: 'var(--text-primary, inherit)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
              {folderModalConv.conv?.folder && (
                <button
                  type="button"
                  className="small-btn"
                  style={{ color: '#ff6b6b' }}
                  onClick={() => {
                    setConvFolder(folderModalConv.idx, null)
                    showToast('Folder cleared')
                    setFolderModalConv(null)
                  }}
                >
                  Clear Folder
                </button>
              )}
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => setFolderModalConv(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="small-btn btn-primary"
                  onClick={() => {
                    setConvFolder(folderModalConv.idx, folderModalConv.folder)
                    showToast(folderModalConv.folder ? `Moved to folder "${folderModalConv.folder}"` : 'Folder cleared')
                    setFolderModalConv(null)
                  }}
                >
                  Save Folder
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Tag Assignment Modal */}
      {tagModalConv && (
        <Modal
          title="Manage Chat Tags"
          icon={<Tag size={18} />}
          onClose={() => setTagModalConv(null)}
        >
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Tag <strong>"{tagModalConv.conv?.title || 'this chat'}"</strong> for quick label-based filtering.
            </p>

            {/* Current active tags on this conversation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Active Tags:
              </label>
              {(tagModalConv.tags || []).length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  No tags added yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(tagModalConv.tags || []).map(t => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: 'var(--accent, #6366f1)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      #{t}
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onClick={() => {
                          setTagModalConv(prev => ({
                            ...prev,
                            tags: (prev.tags || []).filter(x => x !== t),
                          }))
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Suggested existing tags from other chats */}
            {allTags.filter(t => !(tagModalConv.tags || []).includes(t)).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Add from Existing Tags:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {allTags
                    .filter(t => !(tagModalConv.tags || []).includes(t))
                    .map(t => (
                      <button
                        key={t}
                        type="button"
                        className="small-btn"
                        style={{
                          padding: '3px 8px',
                          fontSize: '11px',
                          borderRadius: '12px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setTagModalConv(prev => ({
                            ...prev,
                            tags: [...(prev.tags || []), t],
                          }))
                        }}
                      >
                        + #{t}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Input to add new tags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Add New Tag:
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  id="new-tag-input"
                  type="text"
                  placeholder="e.g. priority, ai, draft, bug, feature..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const val = e.target.value.trim().replace(/^#/, '')
                      if (val && !(tagModalConv.tags || []).includes(val)) {
                        setTagModalConv(prev => ({
                          ...prev,
                          tags: [...(prev.tags || []), val],
                        }))
                        e.target.value = ''
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    background: 'var(--bg-input, rgba(255,255,255,0.05))',
                    border: '1px solid var(--border, rgba(255,255,255,0.15))',
                    borderRadius: '6px',
                    color: 'var(--text-primary, inherit)',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="button"
                  className="small-btn btn-primary"
                  onClick={() => {
                    const inputEl = document.getElementById('new-tag-input')
                    const val = inputEl?.value.trim().replace(/^#/, '')
                    if (val && !(tagModalConv.tags || []).includes(val)) {
                      setTagModalConv(prev => ({
                        ...prev,
                        tags: [...(prev.tags || []), val],
                      }))
                      if (inputEl) inputEl.value = ''
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                className="small-btn"
                onClick={() => setTagModalConv(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="small-btn btn-primary"
                onClick={() => {
                  setConvTags(tagModalConv.idx, tagModalConv.tags || [])
                  showToast('Tags updated')
                  setTagModalConv(null)
                }}
              >
                Save Tags
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Interactive Human-In-The-Loop AI Question Modal */}
      {userQuestionPrompt && (
        <Modal
          title="AI Needs Your Input"
          icon={<Bot size={18} style={{ color: 'var(--accent, #6366f1)' }} />}
          onClose={() => userQuestionPrompt.reject('User skipped prompt')}
        >
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(99,102,241,0.08)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Sparkles size={18} style={{ color: 'var(--accent, #6366f1)', marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: '13.5px', lineHeight: 1.5, fontWeight: 500 }}>
                {userQuestionPrompt.question}
              </div>
            </div>

            {/* Multiple Choice Options */}
            {userQuestionPrompt.options && userQuestionPrompt.options.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Select an Option:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                  {userQuestionPrompt.options.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="small-btn"
                      style={{
                        padding: '10px 14px',
                        fontSize: '13px',
                        textAlign: 'left',
                        borderRadius: '8px',
                        background: userQuestionAnswer === opt ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.05)',
                        color: userQuestionAnswer === opt ? '#fff' : 'inherit',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => {
                        userQuestionPrompt.resolve(opt)
                      }}
                    >
                      <span>{opt}</span>
                      <CheckCircle2 size={15} style={{ opacity: userQuestionAnswer === opt ? 1 : 0.3 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Input */}
            {userQuestionPrompt.allow_custom !== false && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  {userQuestionPrompt.options?.length ? 'Or Provide Custom Input:' : 'Your Response:'}
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder={userQuestionPrompt.placeholder || 'Type your instructions or response here...'}
                  value={userQuestionAnswer}
                  onChange={e => setUserQuestionAnswer(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (userQuestionAnswer.trim()) {
                        userQuestionPrompt.resolve(userQuestionAnswer.trim())
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-input, rgba(255,255,255,0.05))',
                    border: '1px solid var(--border, rgba(255,255,255,0.15))',
                    borderRadius: '6px',
                    color: 'var(--text-primary, inherit)',
                    fontSize: '13px',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                className="small-btn"
                onClick={() => userQuestionPrompt.reject('User skipped')}
              >
                Skip / Cancel
              </button>
              <button
                type="button"
                className="small-btn btn-primary"
                disabled={!userQuestionAnswer.trim()}
                onClick={() => {
                  if (userQuestionAnswer.trim()) {
                    userQuestionPrompt.resolve(userQuestionAnswer.trim())
                  }
                }}
              >
                Submit Response
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showOnboarding && (
        <OnboardingModal
          templates={promptTemplates}
          onSkip={() => { try { localStorage.setItem('yogatik_onboarded', '1') } catch {} setShowOnboarding(false) }}
          onComplete={async ({ persona, style, boundary }) => {
            try { localStorage.setItem('yogatik_onboarded', '1') } catch {}
            if (persona && persona !== 'default') setActiveTemplate(persona)
            // Seed procedural memory so turn 1 already reflects their choices.
            try {
              const { remember } = await import('./memory4')
              const styleText = style === 'concise' ? 'prefers concise replies' : style === 'detailed' ? 'prefers detailed, thorough replies' : 'likes a balance of brevity and detail'
              await remember({ store: 'procedural', text: styleText, importance: 0.7 })
              await remember({ store: 'procedural', text: boundary === 'companion' ? 'wants a warm, friendly companion tone' : 'wants a professional, task-focused assistant', importance: 0.6 })
            } catch { /* db not ready */ }
            setShowOnboarding(false)
          }}
        />
      )}
      {showDomainHub && <DomainHubModal
        isOpen={showDomainHub}
        onClose={() => setShowDomainHub(false)}
        onExecutePrompt={(p) => {
          setInput(p)
          sendRef.current?.(p)
        }}
      />}
      {showCitationGraph && <CitationGraphModal isOpen={showCitationGraph} onClose={() => setShowCitationGraph(false)} />}
      {showEvalDashboard && <EvalDashboard onClose={() => setShowEvalDashboard(false)} />}
      {showDownloadModal && <DownloadModal isOpen={showDownloadModal} onClose={() => setShowDownloadModal(false)} onInstallPwa={installPwa} showPwa={!!showPwaInstall} />}
      {activeArtifact && (
        <ArtifactCanvas
          isOpen={!!activeArtifact}
          onClose={() => setActiveArtifact(null)}
          {...activeArtifact}
        />
      )}
      </React.Suspense>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {/* Generic confirm modal — no more native confirm() dialogs */}
      {permRequest && (
        <div className="perm-overlay">
          <PermissionPrompt request={permRequest.request} onResolve={resolvePermission} />
        </div>
      )}

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
        <Modal
          title={typeof errorModalMsg === 'object' && errorModalMsg?.title ? errorModalMsg.title : "Notice"}
          icon={typeof errorModalMsg === 'object' && errorModalMsg?.isError === false ? <Sparkles size={18} /> : <AlertTriangle size={18} />}
          onClose={() => setErrorModalMsg(null)}
          labelledBy="error-title"
          footer={
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setErrorModalMsg(null)}>Got it</button>
            </div>
          }>
          <div style={{ padding: '16px 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {typeof errorModalMsg === 'object' && errorModalMsg?.msg ? errorModalMsg.msg : String(errorModalMsg)}
          </div>
        </Modal>
      )}
    </div>

      {/* Gated at the render site, not self-gated: rendering a React.lazy
          component downloads its chunk immediately. */}
      {showTerminal && (
        <React.Suspense fallback={null}>
          <TerminalDrawer
            open={showTerminal}
            onClose={() => setShowTerminal(false)}
            conversationId={conv?.clientId || conv?.id || null}
            onUpgrade={() => setShowUpgrade(true)}
          />
        </React.Suspense>
      )}
    </div>
  )
}
