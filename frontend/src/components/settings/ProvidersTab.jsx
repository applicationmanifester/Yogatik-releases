import React, { useState } from 'react'
import {
  Plus, Trash2, Key, Zap, RefreshCw, Eye, EyeOff, ExternalLink,
  Download, AlertCircle, CheckCircle2, XCircle
} from 'lucide-react'
import { LocalModelPanel } from '../LocalModelPanel'
import { ChromeAIPanel } from '../ChromeAIPanel'
import { KEY_STORAGE_DISCLOSURE } from '../../crypto'
import { DEFAULT_LOCAL_MODEL } from '../../localLLM'
import {
  getModels, saveProviderApiKey, removeProvider, testProvider,
  addProvider
} from '../../api'
import {
  pullOllamaModel, cancelOllamaPull, startOllamaDaemon,
  isDesktopWithOllama, SUGGESTED_MODELS
} from '../../ollama'

export const QUICK_TEMPLATES = {
  nvidia: {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'meta/llama-3.1-8b-instruct'],
    default: 'meta/llama-3.3-70b-instruct',
    keyUrl: 'https://build.nvidia.com',
    note: 'Llama 3.3, Nemotron 70B & Llama 3.1 8B',
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

export function ProvidersTab({
  providers = {},
  setProviders,
  activeProvider = 'nvidia',
  activeModel = '',
  onSelectProvider,
  onSelectModel,
  onProviderSaved,
  temperature = 1.0,
  onTemperatureChange,
}) {
  const [keyInputs, setKeyInputs] = useState({})
  const [showKey, setShowKey] = useState({})
  const [testingId, setTestingId] = useState(null)
  const [testResults, setTestResults] = useState({})
  const [savingKeyId, setSavingKeyId] = useState(null)

  // Custom provider form
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customForm, setCustomForm] = useState({ id: '', name: '', base_url: '', api_key: '', default_model: '', models: '' })
  const [customError, setCustomError] = useState('')

  const [refreshingOllama, setRefreshingOllama] = useState(false)
  const [pullState, setPullState] = useState({})
  const [localModelChoice, setLocalModelChoice] = useState(DEFAULT_LOCAL_MODEL)

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
      setProviders?.(updated)
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
      setProviders?.(updated)
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
      setProviders?.(updated)
      onProviderSaved?.()
    } catch (e) {
      setCustomError(e.message)
    }
  }

  return (
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

      {/* Sampling Temperature Setting */}
      <div className="settings-card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent, #ff6b35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
              <span>🌡️ Sampling Temperature</span>
              <span className="settings-badge" style={{ background: 'rgba(255, 107, 53, 0.15)', color: 'var(--accent, #ff6b35)', fontWeight: 600 }}>
                {Number(temperature ?? 1.0).toFixed(2)}
              </span>
            </h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', opacity: 0.8 }}>
              Controls randomness &amp; creativity for all providers. Range: 0.0 to 2.0. Higher values yield more creative/lateral answers; lower values yield deterministic code and math.
            </p>
          </div>
          <button
            className="settings-btn ghost"
            style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
            onClick={() => onTemperatureChange?.(1.0)}
            title="Reset to default (1.0)"
          >
            Reset to 1.0 (Default)
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={temperature ?? 1.0}
            onChange={e => onTemperatureChange?.(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent, #ff6b35)', cursor: 'pointer' }}
            aria-label="Model Sampling Temperature"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', opacity: 0.65, marginTop: 6 }}>
          <span>0.0 (Deterministic / Code)</span>
          <span style={{ fontWeight: (Number(temperature) >= 0.95 && Number(temperature) <= 1.05) ? 700 : 400, color: (Number(temperature) >= 0.95 && Number(temperature) <= 1.05) ? 'var(--accent, #ff6b35)' : 'inherit' }}>
            1.0 (Default / Balanced)
          </span>
          <span>2.0 (High Creativity / Random)</span>
        </div>
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
              <p className="field-hint">{KEY_STORAGE_DISCLOSURE}</p>
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
                  <p className="field-hint">{KEY_STORAGE_DISCLOSURE}</p>

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
                  <div className="provider-btns-row">
                    {!prov.available && (
                      <button
                        className="settings-btn primary sm"
                        disabled={refreshingOllama}
                        onClick={async () => {
                          setRefreshingOllama(true)
                          try {
                            await startOllamaDaemon()
                            const fresh = await getModels()
                            setProviders?.(fresh)
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
                          const { default: db } = await import('../../db')
                          await db.setSetting('models_ollama', null)
                          const fresh = await getModels()
                          setProviders?.(fresh)
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
                                      setProviders?.(fresh)
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

              {/* On-device providers (WebLLM `local`, Chrome's `chromeai`) */}
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
  )
}
