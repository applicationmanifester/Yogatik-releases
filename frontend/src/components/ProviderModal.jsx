import React, { useState } from 'react'
import { Plug, ExternalLink } from 'lucide-react'
import { Modal } from './Modal'
import { addProvider } from '../api'
import { KEY_STORAGE_DISCLOSURE } from '../crypto'

// ─── Provider Quick Templates ───────────────────────────────────────────────
const QUICK_TEMPLATES = {
  nvidia: {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [
      'meta/llama-3.3-70b-instruct',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'meta/llama-3.1-8b-instruct',
    ],
    default: 'meta/llama-3.3-70b-instruct',
    keyUrl: 'https://build.nvidia.com',
    note: 'Llama 3.3, Nemotron 70B & GPT-OSS models',
    needsProxy: true,
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
    note: 'Ultra-low latency LPU inference engine',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'deepseek/deepseek-r1:free',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
    ],
    default: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Unified multi-provider model routing',
  },
  anthropic_or: {
    name: 'Anthropic (Claude)',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4', 'anthropic/claude-opus-4'],
    default: 'anthropic/claude-sonnet-4',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Claude Sonnet 4, Haiku 4 & Opus 4',
  },
  openai: {
    name: 'OpenAI (ChatGPT)',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini', 'gpt-4.1'],
    default: 'gpt-4o',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Official OpenAI API • GPT-4o, o4-mini',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    default: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'DeepSeek-V3, R1 & Coder reasoning models',
  },
  mistral: {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    default: 'mistral-large-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'Mistral Large, Small & Codestral',
  },
  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    default: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    note: 'Open-source foundation models at scale',
  },
  anthropic_direct: {
    name: 'Anthropic (Direct)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'],
    default: 'claude-sonnet-4-5',
    keyUrl: 'https://console.anthropic.com/settings/api-keys',
    note: 'Direct Anthropic API • Claude Sonnet & Opus',
  },
  xai: {
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-3-mini', 'grok-3', 'grok-2-1212'],
    default: 'grok-3-mini',
    keyUrl: 'https://console.x.ai/',
    note: 'Elon Musk\'s Grok — web-aware models',
  },
  perplexity: {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    models: ['sonar', 'sonar-pro', 'sonar-reasoning'],
    default: 'sonar',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    note: 'Real-time web-grounded search models (Sonar)',
  },
  cohere: {
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    models: ['command-r-plus', 'command-r7b-12-2024'],
    default: 'command-r-plus',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    note: 'Command R+, Command R & Embeddings',
  },
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

  const [saveError, setSaveError] = useState('')

  const handleSave = async () => {
    if (!form.id || !form.name || !form.base_url) return
    setSaveError('')
    try {
      await addProvider({
        id: form.id.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        name: form.name, base_url: form.base_url, api_key: form.api_key,
        default_model: form.default_model,
        models: form.models ? form.models.split(',').map(s => s.trim()).filter(Boolean) : [],
      })
      onSaved()
      onClose()
    } catch (e) { setSaveError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit provider' : 'Add AI provider'} icon={<Plug size={18} />}
      onClose={onClose} labelledBy="provider-title">
        {!isEdit && (
          <div className="modal-tabs">
            <button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>Quick Add</button>
            <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Custom API</button>
          </div>
        )}
        {mode === 'template' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', minWidth: 0, overflowX: 'hidden' }}>
            <div className="template-grid">
              {Object.entries(QUICK_TEMPLATES).map(([key, t]) => (
                <div key={key} className="template-card" onClick={() => selectTemplate(key)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                    <div className="template-name">{t.name}</div>
                  </div>
                  <div className="template-url" style={{ marginBottom: 4 }}>{t.note}</div>
                  {t.keyUrl && (
                    <a href={t.keyUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: 'var(--accent, #38bdf8)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, width: 'fit-content' }}
                      onClick={e => e.stopPropagation()}>
                      Get API key <ExternalLink size={9} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {mode === 'custom' && (
          <div className="modal-form">
            <label>Provider ID</label>
            <input aria-label="Provider ID" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} placeholder="e.g. my-api" disabled={isEdit} style={isEdit ? { opacity: 0.5 } : {}} />
            <label>Display Name</label>
            <input aria-label="Display name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. My LLM Server" />
            <label>Base URL (OpenAI-compatible)</label>
            <input aria-label="Base URL" value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.example.com/v1" />
            <label>API Key</label>
            <input type="password" aria-label="API key" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="sk-..." />
            <p className="field-hint">{KEY_STORAGE_DISCLOSURE}</p>
            <label>Default Model</label>
            <input aria-label="Default model" value={form.default_model} onChange={e => setForm({ ...form, default_model: e.target.value })} placeholder="e.g. llama-3.1-70b" />
            <label>Models (comma-separated)</label>
            <input aria-label="Models, comma separated" value={form.models} onChange={e => setForm({ ...form, models: e.target.value })} placeholder="model-a, model-b" />
          </div>
        )}
        <div className="modal-actions" style={{ flexDirection: 'column', gap: 6 }}>
          {saveError && <div style={{ fontSize: 12, color: '#f87171', padding: '4px 0' }}>{saveError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={!form.id || !form.name || !form.base_url}>{isEdit ? 'Save Changes' : 'Add Provider'}</button>
          </div>
        </div>
    </Modal>
  )
}

export { ProviderModal }
