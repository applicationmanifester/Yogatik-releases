import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Send, Plus, Sun, Moon, Upload, Menu, X, Globe, Database,
  Trash2, Copy, Check, Plug, TestTube, LogIn, LogOut, User,
  Square, Download, Sparkles, Mic, MicOff, Volume2, VolumeX,
  Wrench, Image, Code, CloudSun, Calculator, Languages, Youtube, Link,
  ScanLine, QrCode, FileText, AudioLines, Hash, Regex, ArrowLeftRight,
  Palette, Search, GitCompare, Ruler, MapPin, Rss, Eye, FileDown,
  Smartphone, AlertTriangle
} from 'lucide-react'
import {
  streamMessage, stopGeneration, uploadDocument, getModels, getProviders,
  addProvider, removeProvider, testProvider, loginWithGoogle, saveProviderApiKey, logout,
  isLoggedIn, getMe, getConversations, getConversation, deleteConversation,
  exportConversation, getTemplates, requestTTS, getTools
} from './api'
import { CodeBlock } from './components/CodeBlock'
import { ArtifactPanel } from './components/ArtifactPanel'
import { ArenaView } from './components/ArenaView'

const API_BASE = 'http://localhost:8000'

const SUGGESTIONS = [
  "What's the weather in New York?",
  "Generate an image of a futuristic city",
  "Translate 'hello world' to Japanese",
  "Calculate the square root of 144",
  "Search for today's AI news",
  "Summarize this YouTube video",
]

const TOOL_ICONS = {
  weather: CloudSun, image_generate: Image, code_execute: Code,
  calculator: Calculator, translate: Languages, youtube: Youtube,
  web_extract: Link, chart: Image, tts: Volume2,
  ocr: ScanLine, qr_generate: QrCode, qr_read: QrCode,
  pdf_extract: FileText, stt: AudioLines, summarize: FileText,
  rss_feed: Rss, hash: Hash, regex: Regex, data_convert: ArrowLeftRight,
  color_palette: Palette, whois: Search, diagram: GitCompare,
  audio_edit: AudioLines, image_info: Eye, link_preview: Link,
  diff: GitCompare, unit_convert: Ruler, ip_lookup: MapPin,
  md_to_pdf: FileDown,
}

// ─── Logo ───
function YogatikLogo({ size = 24 }) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width={size} height={size} style={{ flexShrink: 0 }}>
      {!isDark ? <rect width="192" height="192" rx="40" fill="#ffffff"/> : null}
      <circle cx="96" cy="80" r="36" fill="none" stroke="#ff6b35" strokeWidth="6"/>
      <circle cx="82" cy="72" r="5" fill="#ff6b35"/>
      <circle cx="110" cy="72" r="5" fill="#ff6b35"/>
      <path d="M78 90 q18 16 36 0" fill="none" stroke="#ff6b35" strokeWidth="4" strokeLinecap="round"/>
      <rect x="60" y="130" width="72" height="8" rx="4" fill="#ff6b35" opacity="0.6"/>
      <rect x="72" y="146" width="48" height="6" rx="3" fill="#ff6b35" opacity="0.3"/>
    </svg>
  )
}

// ─── Tool Result Display ───
function ToolResultCard({ tool, result }) {
  const Icon = TOOL_ICONS[tool] || Wrench
  if (!result || result.success === false) {
    return (
      <div className="tool-result-card error">
        <div className="tool-result-header"><Icon size={14} /> {tool} — Failed</div>
        <p className="tool-error">{result?.error || 'Unknown error'}</p>
      </div>
    )
  }

  if (tool === 'image_generate' && result.filename) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Image size={14} /> Generated Image</div>
        <img src={`${API_BASE}/tools/image/${result.filename}`} alt={result.prompt}
          className="generated-image" loading="lazy" />
        <p className="tool-prompt">Prompt: "{result.prompt}"</p>
      </div>
    )
  }

  if (tool === 'chart' && result.filename) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Image size={14} /> Chart</div>
        <img src={`${API_BASE}/tools/image/${result.filename}`} alt="Chart"
          className="generated-image" loading="lazy" />
      </div>
    )
  }

  if (tool === 'code_execute') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Code size={14} /> Code Output</div>
        {result.stdout && <pre className="code-output">{result.stdout}</pre>}
        {result.stderr && <pre className="code-output error">{result.stderr}</pre>}
        {result.charts?.map((f, i) => (
          <img key={i} src={`${API_BASE}/tools/code-output/${f}`} alt="Chart" className="generated-image" />
        ))}
      </div>
    )
  }

  if (tool === 'weather' && result.current) {
    const c = result.current
    return (
      <div className="tool-result-card weather-card">
        <div className="tool-result-header"><CloudSun size={14} /> {result.location}</div>
        <div className="weather-current">
          <span className="weather-temp">{c.temperature}°C</span>
          <span className="weather-condition">{c.condition}</span>
        </div>
        <div className="weather-details">
          Feels like {c.feels_like}°C · Humidity {c.humidity}% · Wind {c.wind_speed} km/h
        </div>
        {result.forecast && (
          <div className="weather-forecast">
            {result.forecast.slice(0, 5).map((f, i) => (
              <div key={i} className="forecast-day">
                <span className="forecast-date">{new Date(f.date).toLocaleDateString('en', { weekday: 'short' })}</span>
                <span>{f.low}°–{f.high}°</span>
                <span className="forecast-cond">{f.condition}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (tool === 'calculator') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Calculator size={14} /> Calculator</div>
        <div className="calc-result">{result.formatted || String(result.result)}</div>
      </div>
    )
  }

  if (tool === 'translate') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Languages size={14} /> Translation ({result.source_lang} → {result.target_lang})</div>
        <p className="translation-result">{result.translated}</p>
      </div>
    )
  }

  if (tool === 'unit_convert') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Ruler size={14} /> Unit Conversion</div>
        <div className="calc-result">{result.formatted || result.output}</div>
      </div>
    )
  }

  if (tool === 'hash') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Hash size={14} /> {result.algorithm?.toUpperCase()}</div>
        <pre className="code-output" style={{ wordBreak: 'break-all' }}>{result.result}</pre>
      </div>
    )
  }

  if (tool === 'ip_lookup' && result.ip) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><MapPin size={14} /> IP Lookup: {result.ip}</div>
        <div className="tool-detail">{result.city}, {result.region}, {result.country}</div>
        <div className="tool-detail">ISP: {result.isp} · TZ: {result.timezone}</div>
      </div>
    )
  }

  if (tool === 'whois' && result.domain) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Search size={14} /> WHOIS: {result.domain}</div>
        <div className="tool-detail">Registrar: {result.registrar}</div>
        <div className="tool-detail">Created: {result.creation_date} · Expires: {result.expiration_date}</div>
      </div>
    )
  }

  if (tool === 'rss_feed' && result.items) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Rss size={14} /> {result.feed_title || 'RSS Feed'}</div>
        {result.items.slice(0, 5).map((item, i) => (
          <div key={i} className="tool-detail">
            <a href={item.link} target="_blank" rel="noopener">{item.title}</a>
          </div>
        ))}
      </div>
    )
  }

  if (tool === 'qr_generate' && result.filename) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><QrCode size={14} /> QR Code</div>
        <img src={`${API_BASE}/tools/image/${result.filename}`} alt="QR Code" className="generated-image" style={{ maxWidth: 200 }} />
      </div>
    )
  }

  if (tool === 'summarize' && result.summary) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><FileText size={14} /> Summary</div>
        <p className="translation-result">{result.summary}</p>
      </div>
    )
  }

  if (tool === 'diagram' && result.filename) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><GitCompare size={14} /> Diagram</div>
        <img src={`${API_BASE}/tools/image/${result.filename}`} alt="Diagram" className="generated-image" />
      </div>
    )
  }

  if (tool === 'diff') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><GitCompare size={14} /> Diff — {(result.similarity * 100).toFixed(1)}% similar</div>
        <pre className="code-output">{result.diff}</pre>
      </div>
    )
  }

  if (tool === 'link_preview' && result.title) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Link size={14} /> Link Preview</div>
        {result.image && <img src={result.image} alt="" className="generated-image" style={{ maxHeight: 150 }} />}
        <div className="tool-detail"><strong>{result.title}</strong></div>
        {result.description && <div className="tool-detail">{result.description}</div>}
      </div>
    )
  }

  // Generic fallback for other tools
  if (result && result.success !== false) {
    const Icon = TOOL_ICONS[tool] || Wrench
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Icon size={14} /> {tool.replace(/_/g, ' ')}</div>
        <pre className="code-output">{JSON.stringify(result, null, 2)}</pre>
      </div>
    )
  }

  return null
}

// ─── Message ───
function MessageBubble({ msg, onTTS, onOpenArtifact }) {
  return (
    <div className={`message ${msg.role}`}>
      <div className="message-role">
        {msg.role === 'user' ? 'You' : 'Yogatik'}
        {msg.role === 'assistant' && (
          <button className="icon-btn tts-btn" onClick={() => onTTS(msg.content)} title="Read aloud">
            <Volume2 size={12} />
          </button>
        )}
      </div>
      {msg.toolResults && Object.keys(msg.toolResults).length > 0 && (
        <div className="tool-results">
          {Object.entries(msg.toolResults).map(([tool, result]) => (
            <ToolResultCard key={tool} tool={tool} result={result} />
          ))}
        </div>
      )}
      {msg.toolsUsed?.length > 0 && (
        <div className="tools-used">
          {msg.toolsUsed.map(t => {
            const Icon = TOOL_ICONS[t] || Wrench
            return <span key={t} className="tool-chip"><Icon size={10} /> {t}</span>
          })}
        </div>
      )}
      <div className="message-content">
        <ReactMarkdown components={{
          code({ node, inline, className, children, ...props }) {
            return !inline ? (
              <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{children}</CodeBlock>
            ) : (
              <code className={className} {...props}>{children}</code>
            )
          }
        }}>{msg.content}</ReactMarkdown>
      </div>
      {msg.sources?.length > 0 && (
        <div className="sources">
          <div className="sources-title">Sources</div>
          {msg.sources.filter(s => s.url).map((s, i) => (
            <div key={i} className="source-item">
              <a href={s.url} target="_blank" rel="noopener">{s.title || s.url}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Auth Modal ───
function AuthModal({ onClose, onAuth }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      const user = await loginWithGoogle()
      onAuth(user)
      onClose()
    } catch (err) {
      setError(err.message || 'Google Sign-In failed')
    }
    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><User size={18} /> Sign In to Yogatik</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Sign in with Google to sync your conversation history and back up your custom Provider API Keys to your account.
          </p>
          <button
            className="new-chat-btn"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
              <path fill="#FBBC05" d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/>
              <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/>
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
        {error && <div className="test-result error">{error}</div>}
      </div>
    </div>
  )
}

// ─── Provider Modal ───
const QUICK_TEMPLATES = {
  together: { name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'], default: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', keyUrl: 'https://api.together.xyz/settings/api-keys' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'], default: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  mistral: { name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'], default: 'mistral-large-latest', keyUrl: 'https://console.mistral.ai/api-keys' },
  anthropic_or: { name: 'Anthropic (via OpenRouter)', baseUrl: 'https://openrouter.ai/api/v1', models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4'], default: 'anthropic/claude-sonnet-4', keyUrl: 'https://openrouter.ai/keys' },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-flash', 'gemini-2.5-pro'], default: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
}

function ProviderModal({ onClose, onSaved, editProvider }) {
  const isEdit = !!editProvider
  const [mode, setMode] = useState(isEdit ? 'custom' : 'template')
  const [form, setForm] = useState(() => {
    if (editProvider) {
      return { id: editProvider.id, name: editProvider.name || '', base_url: editProvider.base_url || editProvider.baseUrl || '', api_key: '', default_model: editProvider.default_model || editProvider.default || '', models: (editProvider.models || []).join(', ') }
    }
    return { id: '', name: '', base_url: '', api_key: '', default_model: '', models: '' }
  })

  const selectTemplate = (key) => {
    const t = QUICK_TEMPLATES[key]
    setForm({ id: key, name: t.name, base_url: t.baseUrl, api_key: '', default_model: t.default, models: t.models.join(', ') })
    setMode('custom')
  }

  const handleSave = async () => {
    if (!form.id || !form.name || !form.base_url) return
    try {
      await addProvider({
        id: form.id.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        name: form.name, base_url: form.base_url, api_key: form.api_key,
        default_model: form.default_model,
        models: form.models ? form.models.split(',').map(s => s.trim()).filter(Boolean) : [],
      })
      onSaved()
      onClose()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Plug size={18} /> {isEdit ? 'Edit Provider' : 'Add Custom Provider'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {!isEdit && (
          <div className="modal-tabs">
            <button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>Quick Add</button>
            <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Custom API</button>
          </div>
        )}
        {mode === 'template' && (
          <div className="template-grid">
            {Object.entries(QUICK_TEMPLATES).map(([key, t]) => (
              <div key={key} className="template-card" onClick={() => selectTemplate(key)}>
                <div className="template-name">{t.name}</div>
                <div className="template-url">{t.baseUrl}</div>
              </div>
            ))}
          </div>
        )}
        {mode === 'custom' && (
          <div className="modal-form">
            <label>Provider ID</label>
            <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} placeholder="e.g. my-api" disabled={isEdit} style={isEdit ? { opacity: 0.5 } : {}} />
            <label>Display Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. My LLM Server" />
            <label>Base URL (OpenAI-compatible)</label>
            <input value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.example.com/v1" />
            <label>API Key</label>
            <input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="sk-..." />
            <label>Default Model</label>
            <input value={form.default_model} onChange={e => setForm({ ...form, default_model: e.target.value })} placeholder="e.g. llama-3.1-70b" />
            <label>Models (comma-separated)</label>
            <input value={form.models} onChange={e => setForm({ ...form, models: e.target.value })} placeholder="model-a, model-b" />
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={!form.id || !form.name || !form.base_url}>{isEdit ? 'Save Changes' : 'Add Provider'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Ad Modal (Google AdSense interstitial) ───
function AdModal({ onClose }) {
  const [countdown, setCountdown] = useState(5)
  const adRef = useRef(null)

  useEffect(() => {
    // Push ad to AdSense slot
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={countdown <= 0 ? onClose : undefined}>
      <div className="modal ad-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, textAlign: 'center' }}>
        <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none', padding: '16px 16px 4px' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Yogatik is free — ads keep it running</span>
        </div>
        <div style={{ padding: '8px 16px 16px', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Google AdSense Ad Unit — replace data-ad-slot with your slot ID */}
          <ins className="adsbygoogle"
            ref={adRef}
            style={{ display: 'block', width: '100%', minHeight: 250 }}
            data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
            data-ad-slot="XXXXXXXXXX"
            data-ad-format="auto"
            data-full-width-responsive="true" />
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <button
            className="btn-primary"
            onClick={onClose}
            disabled={countdown > 0}
            style={{ width: '100%', padding: '10px', fontSize: 14, opacity: countdown > 0 ? 0.5 : 1 }}
          >
            {countdown > 0 ? `Continue in ${countdown}s` : 'Continue Chatting'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const [rag, setRag] = useState(true)
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('bgkai_theme', theme)
  }, [theme])
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [conv?.messages, streamingContent])

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
    if (ttsPlaying && audioRef.current) { audioRef.current.pause(); setTtsPlaying(false); return }
    try {
      const result = await requestTTS(text.slice(0, 5000))
      if (result.success) {
        const audio = new Audio(`${API_BASE}/tools/audio/${result.filename}`)
        audioRef.current = audio
        audio.onplay = () => setTtsPlaying(true)
        audio.onended = () => setTtsPlaying(false)
        audio.onerror = () => setTtsPlaying(false)
        audio.play()
      }
    } catch { console.error('TTS failed') }
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
      setStatusText('Uploading file...')
      try {
        const result = await uploadDocument(attachedFile)
        if (result.type === 'media') {
          fileContext = `[Attached file: ${result.filename}, path: ${result.path}] `
        } else {
          fileContext = `[Uploaded document: ${result.filename}, ${result.chunks_created} chunks indexed] `
        }
      } catch (err) {
        fileContext = `[File upload failed: ${err.message}] `
      }
      setAttachedFile(null)
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
      { message: finalText, messages: updated.messages, tools, temperature, model: model || undefined },
      (token) => { content += token; setStreamingContent(content); setStatusText('') },
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
          <button className="icon-btn" onClick={() => setSidebarOpen(false)}><X size={16} /></button>
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
            <button className="auth-btn" onClick={() => setShowAuthModal(true)}>
              <LogIn size={14} /> Sign In
            </button>
          )}
        </div>

        <button className="new-chat-btn" onClick={newChat}><Plus size={14} /> New Chat</button>
        <div className="conversation-list">
          {conversations.map((c, i) => (
            <div key={i} className={`conversation-item ${i === activeIdx ? 'active' : ''}`} onClick={() => switchChat(i)}>
              <span className="conv-title">{c.title}</span>
              {i === activeIdx && (
                <button className="icon-btn conv-delete" onClick={e => { e.stopPropagation(); deleteChat(i) }}>
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
          {/* Web search + RAG handled by LLM natively in serverless mode */}
          <div className="toggle-row">
            <label><Wrench size={12} /> AI Tools</label>
            <label className="toggle"><input type="checkbox" checked={tools} onChange={e => setToolsEnabled(e.target.checked)} /><span className="slider" /></label>
          </div>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!sidebarOpen && <button className="icon-btn" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>}
            <h1>{conv?.title || 'New Chat'}</h1>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={handleExport} title="Export chat"><Download size={18} /></button>
            <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
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
            <button className={`small-btn ${isEnhancing ? 'pulsing' : ''}`} onClick={handleEnhancePrompt} disabled={!input.trim() || isEnhancing} title="Enhance prompt with AI">
              <Sparkles size={12} /> {isEnhancing ? 'Enhancing...' : 'Enhance'}
            </button>
            {recognitionRef.current && (
              <button className={`voice-btn ${isListening ? 'listening' : ''}`} onClick={toggleVoice} title={isListening ? 'Stop listening' : 'Voice input'}>
                {isListening ? <MicOff size={12} /> : <Mic size={12} />}
                {isListening ? 'Stop' : 'Voice'}
              </button>
            )}
            {loading && (
              <button className="stop-btn" onClick={handleStop} title="Stop generation (Esc)">
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
            <button className="send-btn" onClick={() => send()} disabled={loading || (!input.trim() && !attachedFile)}>
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
              <button className="icon-btn" onClick={() => setErrorModalMsg(null)}><X size={18} /></button>
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
