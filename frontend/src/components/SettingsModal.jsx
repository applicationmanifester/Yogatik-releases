import React, { useState, useEffect, useMemo } from 'react'
import {
  Sliders, Server, Cpu, Wrench, Palette, Volume2, Cloud, Activity,
  Key, Plus, Trash2, Check, RefreshCw, Eye, EyeOff, ExternalLink,
  Shield, Zap, Globe, Sparkles, Download, Upload, AlertCircle, Copy,
  CheckCircle2, XCircle, HardDrive, HelpCircle, Sun, Moon, Monitor
} from 'lucide-react'
import { Modal } from './Modal'
import { ModelPicker } from './ModelPicker'
import { LocalModelPanel } from './LocalModelPanel'
import { ChromeAIPanel } from './ChromeAIPanel'
import { DEFAULT_LOCAL_MODEL } from '../localLLM'
import { FEATURES, resolveFeatures, FEATURE_DEFAULTS } from '../features'
import { VOICE_LABELS, DEFAULT_VOICE } from '../video/speech'
import { getModels, saveProviderApiKey, removeProvider, testProvider,
  addProvider, exportConversation, downloadBackup, restoreBackup,
  syncCloudKeys, pushCloudData, pullCloudData, cloudSyncStatus,
  requestTTS, stopTTS
} from '../api'
import { pullOllamaModel, cancelOllamaPull, listOllamaModels, startOllamaDaemon, isDesktopWithOllama, SUGGESTED_MODELS } from '../ollama'
import {
  getElevenLabsApiKey, saveElevenLabsApiKey, testElevenLabsKey,
  fetchElevenLabsVoices, DEFAULT_ELEVENLABS_VOICE
} from '../tools/elevenLabs'
import { getDiagnosticsReport, getErrorLog, clearErrorLog } from '../errorLog'
import { APP_VERSION, BUILD_DATE, APP_CODENAME, APP_RELEASES } from '../version'

const QUICK_TEMPLATES = {
  nvidia: {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'openai/gpt-oss-20b'],
    default: 'meta/llama-3.3-70b-instruct',
    keyUrl: 'https://build.nvidia.com',
    note: 'Llama 3.3, Nemotron 70B & GPT-OSS models',
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    default: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Gemini 2.5 Flash, 2.5 Pro & 2.0 Flash',
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
    default: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Ultra-low latency LPU inference',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen-2.5-72b-instruct', 'deepseek/deepseek-r1:free'],
    default: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Qwen, Claude, GPT-4, Llama, DeepSeek & more',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    default: 'claude-3-7-sonnet-20250219',
    keyUrl: 'https://console.anthropic.com/settings/api-keys',
    note: 'Official Claude Sonnet & Opus',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    default: 'gpt-4o',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Official OpenAI GPT-4o & Reasoning',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    default: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'DeepSeek V3 & R1 reasoning models',
  },
}

const GENDER = {
  female: ['af_heart', 'af_nova', 'bf_emma'],
  male: ['am_michael', 'am_puck', 'bm_george'],
}

export function SettingsModal({
  onClose,
  initialTab = 'providers',
  providersData = {},
  keyInfo = {},
  activeProvider = 'nvidia',
  activeModel = '',
  onSelectProvider,
  onSelectModel,
  onProviderSaved,
  temperature = 0.7,
  onTemperatureChange,
  autoRoute = false,
  onAutoRouteToggle,
  fallback = true,
  onFallbackToggle,
  webSearch = true,
  onWebSearchToggle,
  toolsEnabled = true,
  onToolsToggle,
  toolPrefs = [],
  onToolPrefChange,
  prefs = {},
  onPrefChange,
  theme = 'dark',
  onThemeChange,
  user = null,
  onSignIn,
}) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [providers, setProviders] = useState(providersData)
  const [keys, setKeys] = useState(keyInfo)
  const [keyInputs, setKeyInputs] = useState({})
  const [showKey, setShowKey] = useState({})
  const [testingId, setTestingId] = useState(null)
  const [testResults, setTestResults] = useState({})
  const [savingKeyId, setSavingKeyId] = useState(null)

  // Custom provider form
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customForm, setCustomForm] = useState({ id: '', name: '', base_url: '', api_key: '', default_model: '', models: '' })
  const [customError, setCustomError] = useState('')

  // Sync & Storage status
  const [syncState, setSyncState] = useState({ enabled: false, syncing: false, at: null })
  const [storageEstimate, setStorageEstimate] = useState(null)
  const [copiedReport, setCopiedReport] = useState(false)
  const [errorLogs, setErrorLogs] = useState([])
  const [refreshingOllama, setRefreshingOllama] = useState(false)
  // { [modelName]: { percent: number, status: string, pulling: bool } }
  const [pullState, setPullState] = useState({})
  // The WebLLM model picked inside the `local` provider's OWN card, before
  // that provider is even active. It must be separate from the app-wide
  // `activeModel`: chooseModel(m, pid) calls setModel(cleanModel) UNCONDITIONALLY
  // regardless of pid, so wiring this card's <select> straight to onSelectModel
  // while some other provider (e.g. nvidia) is still active would silently
  // overwrite the ACTIVE conversation's model with a WebLLM model id it cannot
  // use. This card stays purely local until the model actually finishes
  // loading (LocalModelPanel's onReady) or the user hits Select.
  const [localModelChoice, setLocalModelChoice] = useState(DEFAULT_LOCAL_MODEL)
  // Voice Preview
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const [elevenLabsKey, setElevenLabsKey] = useState('')
  const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState('')
  const [showElevenKey, setShowElevenKey] = useState(false)
  const [testingElevenLabs, setTestingElevenLabs] = useState(false)
  const [elevenLabsStatus, setElevenLabsStatus] = useState(null)
  const [elevenLabsVoices, setElevenLabsVoices] = useState([])

  const features = resolveFeatures(prefs.features)
  const voice = prefs.live_voice_local || DEFAULT_VOICE
  const neuralVoice = prefs.live_voice_engine !== 'system'
  const gender = GENDER.male.includes(voice) ? 'male' : 'female'

  useEffect(() => {
    getModels().then(setProviders).catch(() => {})
    if (navigator?.storage?.estimate) {
      navigator.storage.estimate().then(setStorageEstimate).catch(() => {})
    }
    cloudSyncStatus().then(st => setSyncState(s => ({ ...s, ...st }))).catch(() => {})
    setErrorLogs(getErrorLog().slice(0, 15))
    getElevenLabsApiKey().then(k => {
      setElevenLabsKey(k)
      if (k) {
        fetchElevenLabsVoices(k).then(setElevenLabsVoices).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const handleTestProvider = async (id) => {
    setTestingId(id)
    setTestResults(prev => ({ ...prev, [id]: null }))
    try {
      const res = await testProvider(id)
      setTestResults(prev => ({ ...prev, [id]: res }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, error: e.message } }))
    } finally {
      setTestingId(null)
    }
  }

  const handleSaveApiKey = async (id) => {
    const rawKey = keyInputs[id]?.trim()
    if (!rawKey) return
    setSavingKeyId(id)
    try {
      await saveProviderApiKey(id, rawKey)
      setKeyInputs(prev => ({ ...prev, [id]: '' }))
      const updated = await getModels()
      setProviders(updated)
      onProviderSaved?.()
      await handleTestProvider(id)
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, error: e.message } }))
    } finally {
      setSavingKeyId(null)
    }
  }

  const handleRemove = async (id) => {
    if (!window.confirm(`Remove provider ${providers[id]?.name || id}?`)) return
    try {
      await removeProvider(id)
      const updated = await getModels()
      setProviders(updated)
      onProviderSaved?.()
    } catch (e) {
      alert(`Could not remove: ${e.message}`)
    }
  }

  const handleAddCustomProvider = async () => {
    if (!customForm.id || !customForm.name || !customForm.base_url) {
      setCustomError('Please fill in Provider ID, Name, and Base URL.')
      return
    }
    setCustomError('')
    try {
      await addProvider({
        id: customForm.id.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        name: customForm.name,
        base_url: customForm.base_url,
        api_key: customForm.api_key,
        default_model: customForm.default_model,
        models: customForm.models ? customForm.models.split(',').map(s => s.trim()).filter(Boolean) : [],
      })
      setShowCustomForm(false)
      setCustomForm({ id: '', name: '', base_url: '', api_key: '', default_model: '', models: '' })
      const updated = await getModels()
      setProviders(updated)
      onProviderSaved?.()
    } catch (e) {
      setCustomError(e.message)
    }
  }

  const handleSyncNow = async () => {
    setSyncState(s => ({ ...s, syncing: true }))
    try {
      await syncCloudKeys()
      await pushCloudData()
      const st = await cloudSyncStatus()
      setSyncState(s => ({ ...s, ...st, syncing: false }))
    } catch {
      setSyncState(s => ({ ...s, syncing: false }))
    }
  }

  const handleCopyDiagnostics = () => {
    const report = getDiagnosticsReport()
    navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setCopiedReport(true)
    setTimeout(() => setCopiedReport(false), 2000)
  }

  const handleVoicePreview = async () => {
    if (previewingVoice) {
      stopTTS()
      setPreviewingVoice(false)
      return
    }
    setPreviewingVoice(true)
    try {
      await requestTTS('Welcome to Yogatik. Your high-performance AI workspace is active.', {
        onEnd: () => setPreviewingVoice(false)
      })
    } catch {
      setPreviewingVoice(false)
    }
  }

  const currentProviderDef = providers[activeProvider] || {}
  const currentModelList = currentProviderDef.models || []

  return (
    <Modal
      title="Settings & System Preferences"
      icon={<Sliders size={18} />}
      onClose={onClose}
      className="settings-modal"
    >
      <div className="settings-container">
        {/* Navigation Sidebar */}
        <nav className="settings-nav" aria-label="Settings Categories">
          <button
            className={`settings-nav-item ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}
          >
            <Server size={15} />
            <span>Providers &amp; Keys</span>
            {Object.values(providers).filter(p => p.available).length > 0 && (
              <span className="settings-badge green">{Object.values(providers).filter(p => p.available).length} Active</span>
            )}
          </button>

          <button
            className={`settings-nav-item ${activeTab === 'models' ? 'active' : ''}`}
            onClick={() => setActiveTab('models')}
          >
            <Cpu size={15} />
            <span>Model &amp; Inference</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === 'tools' ? 'active' : ''}`}
            onClick={() => setActiveTab('tools')}
          >
            <Wrench size={15} />
            <span>Tools &amp; Agents</span>
            {toolsEnabled && <span className="settings-badge blue">Enabled</span>}
          </button>

          <button
            className={`settings-nav-item ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Palette size={15} />
            <span>Appearance &amp; UX</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === 'voice' ? 'active' : ''}`}
            onClick={() => setActiveTab('voice')}
          >
            <Volume2 size={15} />
            <span>Voice &amp; Audio</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            <Cloud size={15} />
            <span>Privacy &amp; Sync</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === 'diagnostics' ? 'active' : ''}`}
            onClick={() => setActiveTab('diagnostics')}
          >
            <Activity size={15} />
            <span>Diagnostics &amp; Health</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            <Sparkles size={15} style={{ color: 'var(--accent, #ff6b35)' }} />
            <span>About &amp; Updates</span>
            <span className="settings-badge green">v{APP_VERSION}</span>
          </button>
        </nav>

        {/* Content Pane */}
        <main className="settings-content">
          {/* TAB 1: PROVIDERS & KEYS */}
          {activeTab === 'providers' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">AI Providers &amp; API Keys</h3>
                  <p className="settings-pane-subtitle">
                    Configure endpoints, connect API keys, or add custom OpenAI-compatible proxies. All keys are encrypted locally on your device.
                  </p>
                </div>
                <button className="settings-btn primary" onClick={() => setShowCustomForm(true)}>
                  <Plus size={13} /> Add Custom Provider
                </button>
              </div>

              {/* Custom Provider Modal Form */}
              {showCustomForm && (
                <div className="settings-card highlight" style={{ marginBottom: 16 }}>
                  <div className="settings-card-header">
                    <h4>Add Custom OpenAI-Compatible Endpoint</h4>
                    <button className="icon-btn" onClick={() => setShowCustomForm(false)}><XCircle size={14} /></button>
                  </div>
                  {customError && <div className="settings-alert error">{customError}</div>}
                  <div className="settings-form-grid">
                    <div>
                      <label>Provider ID</label>
                      <input
                        placeholder="e.g. together-ai, local-vllm"
                        value={customForm.id}
                        onChange={e => setCustomForm({ ...customForm, id: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Display Name</label>
                      <input
                        placeholder="e.g. Together AI, vLLM Local Server"
                        value={customForm.name}
                        onChange={e => setCustomForm({ ...customForm, name: e.target.value })}
                      />
                    </div>
                    <div className="span-2">
                      <label>Base URL (must support /chat/completions)</label>
                      <input
                        placeholder="https://api.together.xyz/v1 or http://localhost:8000/v1"
                        value={customForm.base_url}
                        onChange={e => setCustomForm({ ...customForm, base_url: e.target.value })}
                      />
                    </div>
                    <div className="span-2">
                      <label>API Key (Optional for local servers)</label>
                      <input
                        type="password"
                        placeholder="Bearer token or leave blank"
                        value={customForm.api_key}
                        onChange={e => setCustomForm({ ...customForm, api_key: e.target.value })}
                      />
                    </div>
                    <div className="span-2">
                      <label>Models (Comma-separated slugs)</label>
                      <input
                        placeholder="qwen/qwen-2.5-72b-instruct, meta-llama/Llama-3.3-70B-Instruct"
                        value={customForm.models}
                        onChange={e => setCustomForm({ ...customForm, models: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="settings-actions-row">
                    <button className="settings-btn secondary" onClick={() => setShowCustomForm(false)}>Cancel</button>
                    <button className="settings-btn primary" onClick={handleAddCustomProvider}>Save Provider</button>
                  </div>
                </div>
              )}

              {/* Provider List Grid */}
              <div className="settings-providers-grid">
                {Object.entries(providers).map(([id, prov]) => {
                  const tpl = QUICK_TEMPLATES[id]
                  const hasKey = prov.available
                  const testRes = testResults[id]
                  const isTesting = testingId === id
                  const isSaving = savingKeyId === id
                  const isCur = activeProvider === id

                  return (
                    <div key={id} className={`settings-provider-card ${isCur ? 'active-provider' : ''}`}>
                      <div className="settings-provider-header">
                        <div className="provider-info-meta">
                          <div className="provider-name-row">
                            <span className="provider-name">{prov.name || id}</span>
                            {isCur && <span className="settings-badge active-tag">In Use</span>}
                            {prov.is_ollama ? (
                              prov.available ? (
                                <span className="settings-badge green">Daemon Running</span>
                              ) : (
                                <span className="settings-badge red">No Daemon</span>
                              )
                            ) : prov.available ? (
                              <span className="settings-badge green">Ready</span>
                            ) : (
                              <span className="settings-badge gray">Key Needed</span>
                            )}
                          </div>
                          <span className="provider-model-count">
                            {(prov.models || []).length} models available
                          </span>
                        </div>

                        {tpl?.keyUrl && (
                          <a
                            href={tpl.keyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="get-key-link"
                            title="Get API Key from provider portal"
                          >
                            Get Key <ExternalLink size={10} />
                          </a>
                        )}
                      </div>

                      {/* API Key Input & Action Row */}
                      {!prov.isLocal && !prov.isOllama && (
                        <div className="provider-key-box">
                          <div className="key-input-wrapper">
                            <Key size={12} className="key-icon" />
                            <input
                              type={showKey[id] ? 'text' : 'password'}
                              placeholder={hasKey ? '•••••••••••••••• (Saved)' : 'Paste API key…'}
                              value={keyInputs[id] !== undefined ? keyInputs[id] : ''}
                              onChange={e => setKeyInputs({ ...keyInputs, [id]: e.target.value })}
                            />
                            <button
                              type="button"
                              className="key-peek-btn"
                              onClick={() => setShowKey(k => ({ ...k, [id]: !k[id] }))}
                              title={showKey[id] ? 'Hide' : 'Show'}
                            >
                              {showKey[id] ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          </div>

                          <div className="provider-btns-row">
                            {keyInputs[id] ? (
                              <button
                                className="settings-btn primary sm"
                                onClick={() => handleSaveApiKey(id)}
                                disabled={isSaving}
                              >
                                {isSaving ? 'Verifying…' : 'Save Key'}
                              </button>
                            ) : (
                              <button
                                className="settings-btn secondary sm"
                                onClick={() => handleTestProvider(id)}
                                disabled={isTesting || !hasKey}
                              >
                                <Zap size={11} /> {isTesting ? 'Testing…' : 'Test Latency'}
                              </button>
                            )}

                            {!isCur && (
                              <button
                                className="settings-btn ghost sm"
                                onClick={() => onSelectProvider?.(id)}
                              >
                                Select
                              </button>
                            )}

                            {!prov.builtin && (
                              <button
                                className="settings-btn danger-ghost sm"
                                onClick={() => handleRemove(id)}
                                title="Delete provider"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Ollama: Zero-touch daemon + model manager */}
                      {prov.is_ollama && (
                        <div className="provider-key-box" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                          {/* Row 1: status + action buttons */}
                          <div className="provider-btns-row">
                            {!prov.available && (
                              <button
                                className="settings-btn primary sm"
                                disabled={refreshingOllama}
                                onClick={async () => {
                                  setRefreshingOllama(true)
                                  try {
                                    await startOllamaDaemon()
                                    // Reload model list after daemon starts
                                    const fresh = await getModels()
                                    setProviders(fresh)
                                  } catch {} finally { setRefreshingOllama(false) }
                                }}
                              >
                                <Zap size={11} className={refreshingOllama ? 'spin' : ''} />
                                {refreshingOllama ? 'Starting…' : 'Start Daemon'}
                              </button>
                            )}
                            <button
                              className="settings-btn secondary sm"
                              disabled={refreshingOllama}
                              onClick={async () => {
                                setRefreshingOllama(true)
                                try {
                                  const { default: db } = await import('../db')
                                  await db.setSetting('models_ollama', null)
                                  const fresh = await getModels()
                                  setProviders(fresh)
                                } catch {} finally { setRefreshingOllama(false) }
                              }}
                            >
                              <RefreshCw size={11} className={refreshingOllama ? 'spin' : ''} />
                              {refreshingOllama ? 'Checking…' : 'Refresh'}
                            </button>
                            {!isCur && (
                              <button className="settings-btn ghost sm" onClick={() => onSelectProvider?.(id)}>Select</button>
                            )}
                          </div>

                          {/* Row 2: installed models */}
                          {(prov.models || []).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {(prov.models || []).map(m => (
                                <span key={m} style={{
                                  background: 'rgba(34,197,94,0.12)', color: '#4ade80',
                                  border: '1px solid rgba(34,197,94,0.25)',
                                  borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 600,
                                }}>✓ {m}</span>
                              ))}
                            </div>
                          )}

                          {/* Row 3: suggested models to pull (only if not already installed) */}
                          {isDesktopWithOllama() && (() => {
                            const installed = new Set(prov.models || [])
                            const suggestions = SUGGESTED_MODELS.filter(s => !installed.has(s.name))
                            if (!suggestions.length) return null
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>Available to download:</p>
                                {suggestions.map(s => {
                                  const ps = pullState[s.name]
                                  const isPulling = ps?.pulling
                                  return (
                                    <div key={s.name} style={{
                                      display: 'flex', alignItems: 'center', gap: '8px',
                                      background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                                      padding: '7px 10px',
                                    }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600 }}>{s.label}</div>
                                        <div style={{ fontSize: '10px', opacity: 0.55 }}>{s.size} · {s.note}</div>
                                        {isPulling && (
                                          <div style={{ marginTop: '4px' }}>
                                            <div style={{
                                              height: '3px', borderRadius: '2px',
                                              background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
                                            }}>
                                              <div style={{
                                                height: '100%', borderRadius: '2px',
                                                background: 'linear-gradient(90deg,#8b5cf6,#3b82f6)',
                                                width: `${ps.percent ?? 5}%`,
                                                transition: 'width 0.3s ease',
                                              }} />
                                            </div>
                                            <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '2px' }}>
                                              {ps.status || 'Downloading…'} {ps.percent != null ? `${ps.percent}%` : ''}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      {isPulling ? (
                                        <button
                                          className="settings-btn danger-ghost sm"
                                          style={{ whiteSpace: 'nowrap' }}
                                          onClick={() => {
                                            cancelOllamaPull(s.name)
                                            setPullState(p => { const n = {...p}; delete n[s.name]; return n })
                                          }}
                                        >Cancel</button>
                                      ) : (
                                        <button
                                          className="settings-btn primary sm"
                                          style={{ whiteSpace: 'nowrap' }}
                                          disabled={!prov.available}
                                          title={prov.available ? `Download ${s.name}` : 'Start daemon first'}
                                          onClick={async () => {
                                            if (!prov.available) {
                                              // auto-start daemon first then pull
                                              setRefreshingOllama(true)
                                              await startOllamaDaemon().catch(() => {})
                                              setRefreshingOllama(false)
                                            }
                                            setPullState(p => ({ ...p, [s.name]: { pulling: true, percent: 0, status: 'Starting…' } }))
                                            pullOllamaModel(s.name, ({ percent, status }) => {
                                              setPullState(p => ({ ...p, [s.name]: { pulling: true, percent, status } }))
                                            }).then(async () => {
                                              setPullState(p => { const n = {...p}; delete n[s.name]; return n })
                                              const fresh = await getModels()
                                              setProviders(fresh)
                                            }).catch(() => {
                                              setPullState(p => { const n = {...p}; delete n[s.name]; return n })
                                            })
                                          }}
                                        >
                                          <Download size={11} /> Download
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()}

                        </div>
                      )}

                      {/* On-device providers (WebLLM `local`, Chrome's `chromeai`): neither
                          needs a key, so the API-key box above is correctly skipped for both
                          (isLocal:true) — but nothing used to fill the gap that left, which is
                          how picking one from the quick-switch dropdown could silently start a
                          multi-hundred-MB download with zero consent UI in front of it. Each
                          provider's own consent-first panel goes here instead; a "Select"
                          button still lets the user activate it once they are ready, same as
                          every other card. */}
                      {prov.isLocal && !prov.is_ollama && (
                        <div className="provider-key-box" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {prov.isChromeAI ? (
                            <ChromeAIPanel onReady={() => onSelectProvider?.(id)} />
                          ) : (
                            <LocalModelPanel
                              model={isCur ? (activeModel || DEFAULT_LOCAL_MODEL) : localModelChoice}
                              onModelChange={(m) => (isCur ? onSelectModel?.(m, id) : setLocalModelChoice(m))}
                              onReady={(readyModel) => { onSelectProvider?.(id); onSelectModel?.(readyModel, id) }}
                            />
                          )}
                          {!isCur && (
                            <button
                              className="settings-btn ghost sm"
                              style={{ alignSelf: 'flex-start' }}
                              onClick={() => {
                                onSelectProvider?.(id)
                                if (!prov.isChromeAI) onSelectModel?.(localModelChoice, id)
                              }}
                            >
                              Select
                            </button>
                          )}
                        </div>
                      )}

                      {/* Test Result Message */}
                      {testRes && (
                        <div className={`provider-test-msg ${testRes.success ? 'success' : 'error'}`}>
                          {testRes.success ? (
                            <>
                              <CheckCircle2 size={12} /> Connected ({testRes.latencyMs}ms) · Model {testRes.model}
                            </>
                          ) : (
                            <>
                              <AlertCircle size={12} /> {testRes.error || 'Connection check failed'}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* TAB 2: MODEL & INFERENCE */}
          {activeTab === 'models' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">Model &amp; Generation Parameters</h3>
                  <p className="settings-pane-subtitle">
                    Control default models, temperature, multi-modal vision behavior, and intelligent routing.
                  </p>
                </div>
              </div>

              <div className="settings-section-card">
                <h4>Active Provider &amp; Model</h4>
                <div className="settings-form-grid">
                  <div>
                    <label>Default Provider</label>
                    <select
                      value={activeProvider}
                      onChange={e => onSelectProvider?.(e.target.value)}
                    >
                      {Object.entries(providers).map(([id, p]) => (
                        <option key={id} value={id}>
                          {p.name || id} {p.available ? '🟢' : '⚪'} ({(p.models || []).length} models)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Selected Model ({currentModelList.length} total in catalog)</label>
                    <ModelPicker
                      models={currentModelList}
                      value={activeModel}
                      onChange={m => onSelectModel?.(m, activeProvider)}
                    />
                  </div>
                </div>
              </div>

              <div className="settings-section-card">
                <h4>Sampling &amp; Creativity</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Temperature ({temperature})</span>
                    <span className="setting-desc">
                      {temperature <= 0.2 ? '🎯 Precise & Deterministic (Ideal for coding & structured data)' :
                       temperature <= 0.7 ? '⚖️ Balanced (Great for general conversation & analysis)' :
                       '🎨 Highly Creative (Best for brainstorming & creative writing)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={temperature}
                      onChange={e => onTemperatureChange?.(parseFloat(e.target.value))}
                      style={{ width: 140 }}
                    />
                    <span className="setting-val-pill">{temperature}</span>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Auto-Route Models</span>
                    <span className="setting-desc">Automatically route coding tasks to code-specialized models and quick queries to fast inference.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={autoRoute}
                      onChange={e => onAutoRouteToggle?.(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Provider Auto-Failover</span>
                    <span className="setting-desc">Automatically switch to a backup active provider if the primary endpoint rate-limits or times out.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={fallback}
                      onChange={e => onFallbackToggle?.(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Auto-switch Vision Model</span>
                    <span className="setting-desc">Automatically upgrade to a multimodal vision model when an image or screenshot is attached.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.autoVision}
                      onChange={e => onPrefChange?.('features', { ...features, autoVision: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* TAB 3: TOOLS & AGENTS */}
          {activeTab === 'tools' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">AI Tools &amp; Autonomous Agents</h3>
                  <p className="settings-pane-subtitle">
                    Enable system tools, web search engines, browser automation, and multi-agent coordination.
                  </p>
                </div>
              </div>

              <div className="settings-section-card">
                <h4>Master Tool Controls</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Enable Function Calling / AI Tools</span>
                    <span className="setting-desc">Allows models to run calculations, search the web, inspect code, and generate media.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={toolsEnabled}
                      onChange={e => onToolsToggle?.(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Deep Web Research</span>
                    <span className="setting-desc">Iterative 3-hop research with citation indexing, GitHub repos, and Academic paper parsing.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={webSearch}
                      disabled={!toolsEnabled}
                      onChange={e => onWebSearchToggle?.(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Plan &amp; Execution Gates (Plan Mode)</span>
                    <span className="setting-desc">For complex multi-step tasks, produce a verified architectural plan before touching files.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.planMode}
                      onChange={e => onPrefChange?.('features', { ...features, planMode: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              {/* Terminal Command Auto Execution Card */}
              <div className="settings-section-card">
                <h4>Terminal</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div>
                      <span className="setting-name" style={{ fontWeight: 600, fontSize: '13.5px' }}>Terminal Command Auto Execution</span>
                      <p className="setting-desc" style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>
                        Controls whether terminal commands require your approval before running.
                      </p>
                    </div>
                    <select
                      value={features.terminalApproval || 'auto'}
                      onChange={e => onPrefChange?.('features', { ...features, terminalApproval: e.target.value })}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--bg-input, rgba(255,255,255,0.08))',
                        border: '1px solid var(--border, rgba(255,255,255,0.15))',
                        borderRadius: '6px',
                        color: 'var(--text-primary, inherit)',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="auto">Always Proceed</option>
                      <option value="ask">Ask for Confirmation</option>
                      <option value="deny">Never Allow (Read Only)</option>
                    </select>
                  </div>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted, rgba(255,255,255,0.45))', margin: 0, lineHeight: 1.4 }}>
                    Note: A change to this setting will only apply to new messages sent to Agent. In-progress responses will use the previous setting value.
                  </p>
                </div>
              </div>

              {/* Execution & Queued Messages Card */}
              <div className="settings-section-card">
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Configure agent execution, queued message delivery, and permissions.
                </p>
                <h4>Execution</h4>
                <div className="setting-row" style={{ alignItems: 'flex-start' }}>
                  <div className="setting-info">
                    <span className="setting-name" style={{ fontWeight: 600, fontSize: '13.5px' }}>Queued Messages</span>
                    <span className="setting-desc">Configure when follow-up messages are sent.</span>
                    <span style={{ fontSize: '11px', color: 'var(--accent, #6366f1)', cursor: 'pointer', marginTop: '4px', display: 'inline-block' }}>
                      Keyboard shortcuts ⓘ
                    </span>
                  </div>
                  <div style={{ display: 'inline-flex', background: 'var(--bg-input, rgba(255,255,255,0.06))', borderRadius: '6px', padding: '2px', border: '1px solid var(--border, rgba(255,255,255,0.12))' }}>
                    <button
                      type="button"
                      onClick={() => onPrefChange?.('features', { ...features, queuedMessageMode: 'queue' })}
                      style={{
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        borderRadius: '4px',
                        border: 'none',
                        background: (features.queuedMessageMode || 'queue') === 'queue' ? 'var(--accent, #4f46e5)' : 'transparent',
                        color: (features.queuedMessageMode || 'queue') === 'queue' ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Queue
                    </button>
                    <button
                      type="button"
                      onClick={() => onPrefChange?.('features', { ...features, queuedMessageMode: 'immediate' })}
                      style={{
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        borderRadius: '4px',
                        border: 'none',
                        background: features.queuedMessageMode === 'immediate' ? 'var(--accent, #4f46e5)' : 'transparent',
                        color: features.queuedMessageMode === 'immediate' ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Send Immediately
                    </button>
                  </div>
                </div>
              </div>

              {/* Files & Workspace Card */}
              <div className="settings-section-card">
                <h4>Files &amp; Workspace</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name" style={{ fontWeight: 600, fontSize: '13.5px' }}>Auto-Open Edited Files</span>
                    <span className="setting-desc">Open files in the background if Agent creates or edits them</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.autoOpenEditedFiles !== false}
                      onChange={e => onPrefChange?.('features', { ...features, autoOpenEditedFiles: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              {/* Planning Section Card */}
              <div className="settings-section-card">
                <h4>Planning</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name" style={{ fontWeight: 600, fontSize: '13.5px' }}>Plan &amp; Execution Gates (Plan Mode)</span>
                    <span className="setting-desc">For complex multi-step tasks, produce a verified architectural plan before touching files.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.planMode}
                      onChange={e => onPrefChange?.('features', { ...features, planMode: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              <div className="settings-section-card">
                <h4>Tool Permission Policies ({toolPrefs.filter(t => t.enabled).length}/{toolPrefs.length} Enabled)</h4>
                <div className="tool-prefs-grid">
                  {toolPrefs.map((t, idx) => {
                    const toolKey = t.name || t.id || `tool-${idx}`
                    return (
                      <div key={toolKey} className="tool-pref-item">
                        <div className="tool-pref-info">
                          <span className="tool-pref-name">{t.name || t.id}</span>
                          <span className="tool-pref-desc">{t.description || 'System agent utility'}</span>
                        </div>
                        <label className="toggle sm">
                          <input
                            type="checkbox"
                            checked={t.enabled}
                            onChange={e => onToolPrefChange?.(toolKey, e.target.checked)}
                          />
                          <span className="slider" />
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          {/* TAB 4: APPEARANCE & UX */}
          {activeTab === 'appearance' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">Appearance &amp; User Experience</h3>
                  <p className="settings-pane-subtitle">
                    Personalize your interface aesthetics, starter suggestions, and artifact display panels.
                  </p>
                </div>
              </div>

              {/* Theme & Color Mode Card */}
              <div className="settings-section-card">
                <h4>Theme &amp; Visual Style</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div className="setting-info">
                      <span className="setting-name">Color Theme</span>
                      <span className="setting-desc">Choose between ultra-dark studio theme or high-contrast clean light mode.</span>
                    </div>

                    <div style={{ display: 'inline-flex', background: 'var(--bg-input, rgba(255,255,255,0.06))', borderRadius: '8px', padding: '3px', border: '1px solid var(--border, rgba(255,255,255,0.12))', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => onThemeChange?.('dark')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: 'none',
                          background: theme === 'dark' ? 'var(--accent, #4f46e5)' : 'transparent',
                          color: theme === 'dark' ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Moon size={13} /> Dark Theme
                      </button>
                      <button
                        type="button"
                        onClick={() => onThemeChange?.('light')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: 'none',
                          background: theme === 'light' ? 'var(--accent, #4f46e5)' : 'transparent',
                          color: theme === 'light' ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Sun size={13} /> Light Theme
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-section-card">
                <h4>Workspace Features</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Artifacts Side-Panel</span>
                    <span className="setting-desc">Open generated code, SVG diagrams, and markdown documents in an interactive split-view.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.artifacts}
                      onChange={e => onPrefChange?.('features', { ...features, artifacts: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Tool Execution Cards</span>
                    <span className="setting-desc">Display rich visual cards for tool inputs, live progress, and structured outputs.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.toolCards}
                      onChange={e => onPrefChange?.('features', { ...features, toolCards: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Starter Suggestions</span>
                    <span className="setting-desc">Show prompt starter inspiration cards on empty chats.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.suggestions}
                      onChange={e => onPrefChange?.('features', { ...features, suggestions: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Prompt Enhancer</span>
                    <span className="setting-desc">One-click button to polish and expand prompt instructions before sending.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={features.enhance}
                      onChange={e => onPrefChange?.('features', { ...features, enhance: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* TAB 5: VOICE & AUDIO */}
          {activeTab === 'voice' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">Voice &amp; Audio Synthesis</h3>
                  <p className="settings-pane-subtitle">
                    Configure local neural speech generation (Kokoro on-device) and live voice call audio.
                  </p>
                </div>
              </div>

              <div className="settings-section-card">
                <h4>Speech Engine</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Natural Neural Voice (On-Device)</span>
                    <span className="setting-desc">High-fidelity 24kHz neural synthesis. Runs 100% locally on your device without sending voice data to the cloud.</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={neuralVoice}
                      onChange={e => onPrefChange?.('live_voice_engine', e.target.checked ? 'neural' : 'system')}
                    />
                    <span className="slider" />
                  </label>
                </div>

                {neuralVoice && (
                  <>
                    <div className="setting-row">
                      <div className="setting-info">
                        <span className="setting-name">Voice Persona</span>
                        <span className="setting-desc">Select the vocal timbre and personality for text-to-speech.</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={voice}
                          onChange={e => onPrefChange?.('live_voice_local', e.target.value)}
                        >
                          {GENDER[gender].map(id => (
                            <option key={id} value={id}>{VOICE_LABELS[id] || id}</option>
                          ))}
                        </select>
                        <button className="settings-btn secondary sm" onClick={handleVoicePreview}>
                          {previewingVoice ? 'Stop' : 'Test Voice'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ElevenLabs Cloud Voices */}
              <div className="settings-section-card" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4>ElevenLabs Studio Voices (Cloud API)</h4>
                  <span className="settings-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                    Studio Quality
                  </span>
                </div>
                <p className="settings-pane-subtitle" style={{ marginTop: 4, marginBottom: 12 }}>
                  Use ElevenLabs proprietary neural voices and custom clones for ultra-realistic speech synthesis.
                </p>

                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">ElevenLabs API Key</span>
                    <span className="setting-desc">
                      {elevenLabsKey ? 'API key is securely stored in your local encrypted keychain.' : 'Add your xi-api-key from elevenlabs.io to unlock studio voices.'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showElevenKey ? 'text' : 'password'}
                        placeholder={elevenLabsKey ? '••••••••••••••••' : 'Enter xi-api-key...'}
                        value={elevenLabsKeyInput}
                        onChange={e => setElevenLabsKeyInput(e.target.value)}
                        style={{ paddingRight: 30, fontSize: 12, minWidth: 160 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowElevenKey(s => !s)}
                        style={{ position: 'absolute', right: 6, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2 }}
                        aria-label="Toggle key visibility"
                      >
                        {showElevenKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    {elevenLabsKeyInput.trim() && (
                      <button
                        className="settings-btn sm primary"
                        onClick={async () => {
                          await saveElevenLabsApiKey(elevenLabsKeyInput.trim())
                          setElevenLabsKey(elevenLabsKeyInput.trim())
                          setElevenLabsKeyInput('')
                          const v = await fetchElevenLabsVoices(elevenLabsKeyInput.trim())
                          setElevenLabsVoices(v)
                          setElevenLabsStatus({ success: true, message: 'Saved and verified!' })
                        }}
                      >
                        Save
                      </button>
                    )}
                    <button
                      className="settings-btn sm secondary"
                      disabled={testingElevenLabs || (!elevenLabsKey && !elevenLabsKeyInput.trim())}
                      onClick={async () => {
                        setTestingElevenLabs(true)
                        setElevenLabsStatus(null)
                        try {
                          const res = await testElevenLabsKey(elevenLabsKeyInput.trim() || elevenLabsKey)
                          setElevenLabsStatus({ success: true, message: `Connected (${res.tier} tier, ${res.characterCount.toLocaleString()} / ${res.characterLimit.toLocaleString()} chars)` })
                        } catch (e) {
                          setElevenLabsStatus({ success: false, message: e.message })
                        } finally {
                          setTestingElevenLabs(false)
                        }
                      }}
                    >
                      {testingElevenLabs ? 'Testing...' : 'Test Key'}
                    </button>
                  </div>
                </div>

                {elevenLabsStatus && (
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, fontSize: 11, background: elevenLabsStatus.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: elevenLabsStatus.success ? '#34d399' : '#f87171', border: elevenLabsStatus.success ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)' }}>
                    {elevenLabsStatus.message}
                  </div>
                )}

                {elevenLabsKey && (
                  <div className="setting-row" style={{ marginTop: 12 }}>
                    <div className="setting-info">
                      <span className="setting-name">Default ElevenLabs Voice</span>
                      <span className="setting-desc">Active cloud voice ID for text_to_audio and video narration.</span>
                    </div>
                    <select
                      value={prefs.voice_elevenlabs_id || DEFAULT_ELEVENLABS_VOICE}
                      onChange={e => onPrefChange?.('voice_elevenlabs_id', e.target.value)}
                    >
                      {(elevenLabsVoices.length > 0 ? elevenLabsVoices : [{ voice_id: DEFAULT_ELEVENLABS_VOICE, name: 'Rachel (Default)' }]).map(v => (
                        <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 6: PRIVACY & CLOUD SYNC */}
          {activeTab === 'sync' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">Privacy, Backup &amp; Encrypted Sync</h3>
                  <p className="settings-pane-subtitle">
                    Your chats, keys, and documents are stored locally in IndexedDB with zero telemetry.
                  </p>
                </div>
              </div>

              <div className="settings-section-card">
                <h4>End-to-End Encrypted Cloud Sync</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">Encrypted Sync</span>
                    <span className="setting-desc">
                      {user ? `Connected to ${user.email}. Keys and chats are client-side encrypted before syncing.` : 'Sign in to automatically sync keys and chats securely across your devices.'}
                    </span>
                  </div>
                  {user ? (
                    <button className="settings-btn primary sm" onClick={handleSyncNow} disabled={syncState.syncing}>
                      <RefreshCw size={12} className={syncState.syncing ? 'spinning' : ''} />
                      {syncState.syncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                  ) : (
                    <button className="settings-btn primary sm" onClick={onSignIn}>
                      Sign In to Sync
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-section-card">
                <h4>Local Storage &amp; Backup</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <span className="setting-name">On-Device Storage Footprint</span>
                    <span className="setting-desc">
                      {storageEstimate ? `Using approx ${(storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB of local storage.` : 'IndexedDB client-side database.'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="settings-btn secondary sm" onClick={() => downloadBackup()}>
                      <Download size={12} /> Backup All (.json)
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* TAB 7: DIAGNOSTICS & SYSTEM */}
          {activeTab === 'diagnostics' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">System Diagnostics &amp; Health</h3>
                  <p className="settings-pane-subtitle">
                    Inspect error logs, network latency reports, and export diagnostics for pairing &amp; troubleshooting.
                  </p>
                </div>
                <button className="settings-btn secondary" onClick={handleCopyDiagnostics}>
                  {copiedReport ? <Check size={13} /> : <Copy size={13} />}
                  {copiedReport ? 'Copied to Clipboard!' : 'Copy Diagnostics Report'}
                </button>
              </div>

              <div className="settings-section-card">
                <h4>Environment Status</h4>
                <div className="diagnostics-summary-grid">
                  <div className="diag-stat-card">
                    <span className="diag-stat-label">Platform</span>
                    <span className="diag-stat-val">Desktop (Electron)</span>
                  </div>
                  <div className="diag-stat-card">
                    <span className="diag-stat-label">Active Provider</span>
                    <span className="diag-stat-val">{activeProvider}</span>
                  </div>
                  <div className="diag-stat-card">
                    <span className="diag-stat-label">Active Model</span>
                    <span className="diag-stat-val" style={{ fontSize: 11 }}>{activeModel || 'Auto'}</span>
                  </div>
                  <div className="diag-stat-card">
                    <span className="diag-stat-label">System Health</span>
                    <span className="diag-stat-val text-green">Optimal</span>
                  </div>
                </div>
              </div>

              <div className="settings-section-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4>Recent Event &amp; Error Log</h4>
                  {errorLogs.length > 0 && (
                    <button className="settings-btn ghost sm" onClick={() => { clearErrorLog(); setErrorLogs([]) }}>
                      Clear Log
                    </button>
                  )}
                </div>
                {errorLogs.length === 0 ? (
                  <div className="settings-empty-logs">
                    <CheckCircle2 size={16} className="text-green" /> No errors recorded. System running smoothly.
                  </div>
                ) : (
                  <div className="settings-log-viewer">
                    {errorLogs.map((log, idx) => (
                      <div key={idx} className="settings-log-item">
                        <span className="log-time">{new Date(log.time || Date.now()).toLocaleTimeString()}</span>
                        <span className="log-msg">{log.message || JSON.stringify(log)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 8: ABOUT & UPDATES */}
          {activeTab === 'about' && (
            <section className="settings-pane">
              <div className="settings-pane-header">
                <div>
                  <h3 className="settings-pane-title">App Version &amp; Release Updates</h3>
                  <p className="settings-pane-subtitle">
                    Continuous improvements, performance tuning, and feature changelog.
                  </p>
                </div>
              </div>

              <div className="settings-section-card" style={{ background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)', border: '1px solid rgba(255, 107, 53, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Yogatik v{APP_VERSION}</h4>
                      <span className="settings-badge green">Active Release</span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      Codename: {APP_CODENAME} · Built {BUILD_DATE}
                    </p>
                  </div>
                </div>
              </div>

              {APP_RELEASES.map(rel => (
                <div key={rel.version} className="settings-section-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <h4 style={{ margin: 0, fontSize: 14 }}>
                      v{rel.version} — {rel.title}
                    </h4>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rel.date}</span>
                  </div>
                  {rel.highlights && (
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {rel.highlights.map((hl, hIdx) => (
                        <li key={hIdx}>{hl}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}
        </main>
      </div>
    </Modal>
  )
}
