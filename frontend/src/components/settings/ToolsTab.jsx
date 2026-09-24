import React from 'react'

export function ToolsTab({
  toolsEnabled = true,
  onToolsToggle,
  webSearch = true,
  onWebSearchToggle,
  features = {},
  onPrefChange,
  toolPrefs = [],
  onToolPrefChange,
}) {
  return (
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
              checked={Boolean(features.planMode)}
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
              checked={Boolean(features.planMode)}
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
  )
}
