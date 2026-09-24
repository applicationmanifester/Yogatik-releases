import React from 'react'
import { Moon, Sun } from 'lucide-react'

export function AppearanceTab({
  theme = 'dark',
  onThemeChange,
  features = {},
  onPrefChange,
}) {
  return (
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
              checked={Boolean(features.artifacts)}
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
              checked={Boolean(features.toolCards)}
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
              checked={Boolean(features.suggestions)}
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
              checked={Boolean(features.enhance)}
              onChange={e => onPrefChange?.('features', { ...features, enhance: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </div>
    </section>
  )
}
