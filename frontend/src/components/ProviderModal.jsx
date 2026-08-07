import React, { useState } from 'react'
import { X, Plug } from 'lucide-react'
import { addProvider } from '../api'

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
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
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

export { ProviderModal }
