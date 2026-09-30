import React, { useState, useMemo } from 'react'
import { usePersonalization } from '../utils/personalization'
import { 
  themes, fontSizes, densities, languages, dateFormats, codeThemes
 } from '../utils/personalization'
import { Sun, Moon, Monitor, Type, Layout, Text, Globe, 
  Bell, Music, Save, Download, Upload, RefreshCw, 
  ChevronDown, ChevronUp, Eye, Code, Palette, 
  Slider, MousePointer, Zap, Shield, Key, Settings 
} from 'lucide-react'

// Settings sections
export const SETTINGS_SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: Type },
  { id: 'chat', label: 'Chat', icon: Layout },
  { id: 'accessibility', label: 'Accessibility', icon: Shield },
  { id: 'advanced', label: 'Advanced', icon: Settings }
]

function Settings() {
  const { preferences, computed, updatePreference, updatePreferences, resetPreferences, exportPreferences, importPreferences } = usePersonalization()
  const [activeSection, setActiveSection] = useState('appearance')
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importJson, setImportJson] = useState('')

  const handleImport = () => {
    try {
      importPreferences(importJson)
      setShowImportDialog(false)
      setImportJson('')
    } catch (e) {
      alert('Failed to import: ' + e.message)
    }
  }

  return (
    <div className="settings-panel" role="dialog" aria-labelledby="settings-title">
      <div className="settings-header">
        <h2 id="settings-title">Settings</h2>
        <div className="settings-actions">
          <button className="btn-secondary" onClick={() => {
            const blob = new Blob([exportPreferences()], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'chatbot-preferences.json'
            a.click()
            URL.revokeObjectURL(url)
          }}>
            <Download size={16} /> Export
          </button>
          <button className="btn-secondary" onClick={() => setShowImportDialog(true)}>
            <Upload size={16} /> Import
          </button>
          <button className="btn-secondary" onClick={resetPreferences}>
            <RefreshCw size={16} /> Reset
          </button>
        </div>
      </div>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(section => (
            <button
              key={section.id}
              className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <section.icon size={18} aria-hidden="true" />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content" role="tabpanel" aria-labelledby={`section-${activeSection}`}>
          {activeSection === 'appearance' && <AppearanceSection />}
          {activeSection === 'editor' && <EditorSection />}
          {activeSection === 'chat' && <ChatSection />}
          {activeSection === 'accessibility' && <AccessibilitySection />}
          {activeSection === 'advanced' && <AdvancedSection />}
        </div>
      </div>

      {showImportDialog && (
        <ImportDialog
          json={importJson}
          onChange={setImportJson}
          onImport={handleImport}
          onClose={() => setShowImportDialog(false)}
        />
      )}
    </div>
  )
}

// Appearance section
function AppearanceSection() {
  const { preferences, computed, updatePreference } = usePersonalization()

  return (
    <div className="settings-section">
      <h3 id="section-appearance">Appearance</h3>

      {/* Theme */}
      <div className="setting-group">
        <label className="setting-label">Theme</label>
        <div className="setting-control">
          <select
            value={preferences.theme}
            onChange={e => updatePreference('theme', e.target.value)}
            className="select"
          >
            <option value="system"><Monitor size={14} /> System</option>
            <option value="light"><Sun size={14} /> Light</option>
            <option value="dark"><Moon size={14} /> Dark</option>
          </select>
          <span className="setting-hint">Current: {computed.effectiveTheme}</span>
        </div>
      </div>

      {/* Density */}
      <div className="setting-group">
        <label className="setting-label">Density</label>
        <div className="setting-control">
          <div className="density-options" role="radiogroup" aria-label="Density">
            {Object.entries(densities).map(([key, value]) => (
              <label key={key} className={`density-option ${preferences.density === key ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="density"
                  value={key}
                  checked={preferences.density === key}
                  onChange={() => updatePreference('density', key)}
                />
                <span className="density-preview" style={{ padding: value.padding, gap: value.gap }}>
                  <div className="preview-item" />
                  <div className="preview-item" />
                  <div className="preview-item" />
                </span>
                <span className="density-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Font size */}
      <div className="setting-group">
        <label className="setting-label">Font Size</label>
        <div className="setting-control">
          <select
            value={preferences.fontSize}
            onChange={e => updatePreference('fontSize', e.target.value)}
            className="select"
          >
            {Object.entries(fontSizes).map(([key, value]) => (
              <option key={key} value={key} style={{ fontSize: value.base }}>
                {key.charAt(0).toUpperCase() + key.slice(1)} ({value.base})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Font family */}
      <div className="setting-group">
        <label className="setting-label">Font Family</label>
        <div className="setting-control">
          <select
            value={preferences.fontFamily}
            onChange={e => updatePreference('fontFamily', e.target.value)}
            className="select"
          >
            <option value="system">System Default</option>
            <option value="inter">Inter</option>
            <option value="roboto">Roboto</option>
            <option value="monospace">Monospace</option>
          </select>
        </div>
      </div>

      {/* Code theme */}
      <div className="setting-group">
        <label className="setting-label">Code Theme</label>
        <div className="setting-control">
          <select
            value={preferences.codeTheme}
            onChange={e => updatePreference('codeTheme', e.target.value)}
            className="select"
          >
            {codeThemes.map(theme => (
              <option key={theme.value} value={theme.value}>
                {theme.label} {theme.dark ? '(Dark)' : '(Light)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Animations */}
      <div className="setting-group">
        <label className="setting-label">Animations</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.animations}
              onChange={e => updatePreference('animations', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Enable UI animations and transitions</span>
        </div>
      </div>
    </div>
  )
}

// Editor section
function EditorSection() {
  const { preferences, updatePreference } = usePersonalization()

  return (
    <div className="settings-section">
      <h3 id="section-editor">Editor</h3>

      <div className="setting-group">
        <label className="setting-label">Enter to Send</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.enterToSend}
              onChange={e => updatePreference('enterToSend', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Press Enter to send, Shift+Enter for new line</span>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Stream Responses</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.streamResponses}
              onChange={e => updatePreference('streamResponses', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Show responses as they're generated</span>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Auto-save Drafts</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.autoSaveDrafts}
              onChange={e => updatePreference('autoSaveDrafts', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Automatically save unfinished messages</span>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Draft Retention</label>
        <div className="setting-control">
          <select
            value={preferences.draftRetentionDays}
            onChange={e => updatePreference('draftRetentionDays', parseInt(e.target.value))}
            className="select"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
            <option value={0}>Forever</option>
          </select>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Markdown Rendering</label>
        <div className="setting-control">
          <select
            value={preferences.markdownRendering}
            onChange={e => updatePreference('markdownRendering', e.target.value)}
            className="select"
          >
            <option value="full">Full (tables, code highlighting, math)</option>
            <option value="basic">Basic (bold, italic, code, links)</option>
            <option value="none">Plain text only</option>
          </select>
        </div>
      </div>
    </div>
  )
}

// Chat section
function ChatSection() {
  const { preferences, updatePreference } = usePersonalization()

  return (
    <div className="settings-section">
      <h3 id="section-chat">Chat</h3>

      <div className="setting-group">
        <label className="setting-label">Language</label>
        <div className="setting-control">
          <select
            value={preferences.language}
            onChange={e => updatePreference('language', e.target.value)}
            className="select"
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.name})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Date Format</label>
        <div className="setting-control">
          <select
            value={preferences.dateFormat}
            onChange={e => updatePreference('dateFormat', e.target.value)}
            className="select"
          >
            {dateFormats.map(fmt => (
              <option key={fmt.value} value={fmt.value}>
                {fmt.label} — {fmt.example}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Time Format</label>
        <div className="setting-control">
          <select
            value={preferences.timeFormat}
            onChange={e => updatePreference('timeFormat', e.target.value)}
            className="select"
          >
            <option value="12h">12-hour (3:30 PM)</option>
            <option value="24h">24-hour (15:30)</option>
          </select>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Show Timestamps</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.showTimestamps}
              onChange={e => updatePreference('showTimestamps', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Show Token Count</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.showTokenCount}
              onChange={e => updatePreference('showTokenCount', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Message Width</label>
        <div className="setting-control">
          <select
            value={preferences.messageWidth}
            onChange={e => updatePreference('messageWidth', e.target.value)}
            className="select"
          >
            <option value="narrow">Narrow (640px)</option>
            <option value="max">Maximum (960px)</option>
            <option value="wide">Wide (1200px)</option>
            <option value="full">Full width</option>
          </select>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Avatar Style</label>
        <div className="setting-control">
          <select
            value={preferences.avatarStyle}
            onChange={e => updatePreference('avatarStyle', e.target.value)}
            className="select"
          >
            <option value="default">Default</option>
            <option value="minimal">Minimal</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Auto-scroll</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.autoScroll}
              onChange={e => updatePreference('autoScroll', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Automatically scroll to new messages</span>
        </div>
      </div>
    </div>
  )
}

// Accessibility section
function AccessibilitySection() {
  const { preferences, computed, updatePreference } = usePersonalization()

  return (
    <div className="settings-section">
      <h3 id="section-accessibility">Accessibility</h3>

      <div className="setting-group">
        <label className="setting-label">High Contrast</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={computed.isHighContrast}
              disabled
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">{computed.isHighContrast ? 'Enabled by system' : 'Follows system preference'}</span>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Reduced Motion</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={computed.isReducedMotion}
              disabled
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">{computed.isReducedMotion ? 'Enabled by system or animations off' : 'Follows system preference'}</span>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Screen Reader Announcements</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences.animations}
              onChange={e => updatePreference('animations', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Announce streaming responses and actions</span>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Focus Indicators</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              defaultChecked={true}
              disabled
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Always visible (cannot be disabled)</span>
        </div>
      </div>
    </div>
  )
}

// Advanced section
function AdvancedSection() {
  const { preferences, updatePreference, exportPreferences, importPreferences } = usePersonalization()
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importJson, setImportJson] = useState('')

  const handleImport = () => {
    try {
      importPreferences(importJson)
      setShowImportDialog(false)
      setImportJson('')
    } catch (e) {
      alert('Failed to import: ' + e.message)
    }
  }

  return (
    <div className="settings-section">
      <h3 id="section-advanced">Advanced</h3>

      <div className="setting-group">
        <label className="setting-label">Data Export</label>
        <div className="setting-control">
          <button className="btn-secondary" onClick={() => {
            const blob = new Blob([exportPreferences()], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'chatbot-preferences.json'
            a.click()
            URL.revokeObjectURL(url)
          }}>
            <Download size={16} /> Export Preferences
          </button>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Data Import</label>
        <div className="setting-control">
          <button className="btn-secondary" onClick={() => setShowImportDialog(true)}>
            <Upload size={16} /> Import Preferences
          </button>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Reset to Defaults</label>
        <div className="setting-control">
          <button className="btn-danger" onClick={() => {
            if (confirm('Reset all preferences to defaults?')) {
              updatePreference('theme', 'system')
              updatePreference('density', 'comfortable')
              updatePreference('fontSize', 'medium')
              updatePreference('fontFamily', 'system')
              updatePreference('language', 'en')
              updatePreference('dateFormat', 'relative')
              updatePreference('timeFormat', '24h')
              updatePreference('animations', true)
              updatePreference('sounds', true)
              updatePreference('autoScroll', true)
              updatePreference('showTimestamps', true)
              updatePreference('showTokenCount', false)
              updatePreference('streamResponses', true)
              updatePreference('enterToSend', true)
              updatePreference('codeTheme', 'github-dark')
              updatePreference('sidebarWidth', 280)
              updatePreference('messageWidth', 'max')
              updatePreference('avatarStyle', 'default')
              updatePreference('markdownRendering', 'full')
              updatePreference('notifications', true)
              updatePreference('notificationSound', 'default')
              updatePreference('autoSaveDrafts', true)
              updatePreference('draftRetentionDays', 30)
            }
          }}>
            <RefreshCw size={16} /> Reset All Settings
          </button>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Debug Mode</label>
        <div className="setting-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={false}
              onChange={e => console.log('Debug mode:', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
          <span className="setting-hint">Enable debug logging and dev tools</span>
        </div>
      </div>

      {showImportDialog && (
        <div className="import-dialog-overlay" onClick={() => setShowImportDialog(false)}>
          <div className="import-dialog" onClick={e => e.stopPropagation()}>
            <h4>Import Preferences</h4>
            <p>Paste JSON preferences below:</p>
            <textarea
              value={importJson}
              onChange={e => setImportJson(e.target.value)}
              placeholder="{\"theme\": \"dark\", ...}"
              rows={10}
              className="import-textarea"
            />
            <div className="import-actions">
              <button className="btn-secondary" onClick={() => setShowImportDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleImport}>Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Import dialog component
function ImportDialog({ json, onChange, onImport, onClose }) {
  return (
    <div className="import-dialog-overlay" onClick={onClose}>
      <div className="import-dialog" onClick={e => e.stopPropagation()}>
        <h4>Import Preferences</h4>
        <p>Paste JSON preferences below:</p>
        <textarea
          value={json}
          onChange={e => onChange(e.target.value)}
          placeholder="{\"theme\": \"dark\", ...}"
          rows={10}
          className="import-textarea"
        />
        <div className="import-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onImport}>Import</button>
        </div>
      </div>
    </div>
  )
}

export default Settings
export { Settings }