import React from 'react'
import { ModelPicker } from '../ModelPicker'

export function ModelsTab({
  providers = {},
  activeProvider = 'nvidia',
  activeModel = '',
  onSelectProvider,
  onSelectModel,
  temperature = 1.0,
  onTemperatureChange,
  autoRoute = false,
  onAutoRouteToggle,
  fallback = true,
  onFallbackToggle,
  features = {},
  onPrefChange,
}) {
  const currentProviderDef = providers[activeProvider] || {}
  const currentModelList = currentProviderDef.models || []

  return (
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
              checked={Boolean(features.autoVision)}
              onChange={e => onPrefChange?.('features', { ...features, autoVision: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </div>
    </section>
  )
}
