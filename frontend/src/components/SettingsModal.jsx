import React, { useState, useEffect } from 'react'
import {
  Sliders, Server, Cpu, Wrench, Palette, Volume2, Cloud, Activity,
  Compass, Sparkles
} from 'lucide-react'
import { Modal } from './Modal'
import { SearchEnginePanel } from './SearchEnginePanel'
import { ProvidersTab } from './settings/ProvidersTab'
import { ModelsTab } from './settings/ModelsTab'
import { ToolsTab } from './settings/ToolsTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { VoiceTab } from './settings/VoiceTab'
import { SyncTab } from './settings/SyncTab'
import { DiagnosticsTab } from './settings/DiagnosticsTab'
import { AboutTab } from './settings/AboutTab'
import { resolveFeatures } from '../features'
import { getModels } from '../api'
import { APP_VERSION } from '../version'

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
  temperature = 1.0,
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

  const features = resolveFeatures(prefs.features)

  useEffect(() => {
    getModels().then(setProviders).catch(() => {})
  }, [])

  const activeProviderCount = Object.values(providers).filter(p => p.available).length

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
            {activeProviderCount > 0 && (
              <span className="settings-badge green">{activeProviderCount} Active</span>
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
            className={`settings-nav-item ${activeTab === 'searchengine' ? 'active' : ''}`}
            onClick={() => setActiveTab('searchengine')}
          >
            <Compass size={15} />
            <span>Search &amp; Crawler</span>
            <span className="settings-badge green">Private</span>
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

        {/* Content Pane - Performance Optimized Conditional Tab Rendering */}
        <main className="settings-content">
          {activeTab === 'providers' && (
            <ProvidersTab
              providers={providers}
              setProviders={setProviders}
              activeProvider={activeProvider}
              activeModel={activeModel}
              onSelectProvider={onSelectProvider}
              onSelectModel={onSelectModel}
              onProviderSaved={onProviderSaved}
              temperature={temperature}
              onTemperatureChange={onTemperatureChange}
            />
          )}

          {activeTab === 'models' && (
            <ModelsTab
              providers={providers}
              activeProvider={activeProvider}
              activeModel={activeModel}
              onSelectProvider={onSelectProvider}
              onSelectModel={onSelectModel}
              temperature={temperature}
              onTemperatureChange={onTemperatureChange}
              autoRoute={autoRoute}
              onAutoRouteToggle={onAutoRouteToggle}
              fallback={fallback}
              onFallbackToggle={onFallbackToggle}
              features={features}
              onPrefChange={onPrefChange}
            />
          )}

          {activeTab === 'tools' && (
            <ToolsTab
              toolsEnabled={toolsEnabled}
              onToolsToggle={onToolsToggle}
              webSearch={webSearch}
              onWebSearchToggle={onWebSearchToggle}
              features={features}
              onPrefChange={onPrefChange}
              toolPrefs={toolPrefs}
              onToolPrefChange={onToolPrefChange}
            />
          )}

          {activeTab === 'appearance' && (
            <AppearanceTab
              theme={theme}
              onThemeChange={onThemeChange}
              features={features}
              onPrefChange={onPrefChange}
            />
          )}

          {activeTab === 'voice' && (
            <VoiceTab
              prefs={prefs}
              onPrefChange={onPrefChange}
            />
          )}

          {activeTab === 'sync' && (
            <SyncTab
              user={user}
              onSignIn={onSignIn}
              onProviderSaved={onProviderSaved}
            />
          )}

          {activeTab === 'searchengine' && (
            <SearchEnginePanel />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsTab
              activeProvider={activeProvider}
              activeModel={activeModel}
            />
          )}

          {activeTab === 'about' && (
            <AboutTab />
          )}
        </main>
      </div>
    </Modal>
  )
}
