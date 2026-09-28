import React, { useState, useEffect } from 'react'
import {
  Plus, Settings, ToggleLeft, ToggleRight, Trash2, Download,
  Upload, Code2, Package, Check, X, ChevronDown, ChevronUp,
  AlertTriangle, Info, Zap, Shield, FileText
} from 'lucide-react'
import { Modal } from './Modal'
import { initializePlugins, getPluginManager, PluginCapability } from '../pluginSystem'

export function PluginManagerModal({ isOpen, onClose }) {
  const [plugins, setPlugins] = useState([])
  const [selectedPlugin, setSelectedPlugin] = useState(null)
  const [installModal, setInstallModal] = useState(false)
  const [installManifest, setInstallManifest] = useState('')
  const [installCode, setInstallCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadPlugins()
    }
  }, [isOpen])

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const manager = await initializePlugins()
      const data = manager.getAllPlugins()
      setPlugins(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const manifest = JSON.parse(installManifest)
      const manager = getPluginManager()
      await manager.installPlugin(manifest, installCode)
      setInstallModal(false)
      setInstallManifest('')
      setInstallCode('')
      loadPlugins()
    } catch (err) {
      setError(err.message)
    }
  }

  const togglePlugin = async (plugin) => {
    const manager = getPluginManager()
    if (plugin.enabled) {
      await manager.disablePlugin(plugin.id)
    } else {
      await manager.enablePlugin(plugin.id)
    }
    loadPlugins()
  }

  const handleUninstall = async (pluginId) => {
    if (!confirm(`Uninstall plugin ${pluginId}?`)) return
    const manager = getPluginManager()
    await manager.uninstallPlugin(pluginId)
    loadPlugins()
  }

  const capabilityDescriptions = {
    read_files: 'Read files in granted folders',
    write_files: 'Write files in granted folders',
    list_files: 'List directory contents',
    search_files: 'Search file contents',
    run_command: 'Execute terminal commands',
    start_process: 'Start background processes',
    fetch: 'Make HTTP requests',
    websocket: 'Open WebSocket connections',
    call_llm: 'Call LLM APIs',
    embeddings: 'Generate embeddings',
    image_gen: 'Generate images',
    show_notification: 'Show system notifications',
    open_modal: 'Open custom modals',
    add_sidebar_item: 'Add items to sidebar',
    clipboard_read: 'Read clipboard',
    clipboard_write: 'Write to clipboard',
    notifications: 'Send desktop notifications',
    install_plugin: 'Install other plugins',
    uninstall_plugin: 'Uninstall plugins',
  }

  if (!isOpen) return null

  return (
    <Modal
      title="Plugin Manager"
      onClose={onClose}
      className="plugin-manager-modal"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <button className="small-btn" onClick={() => setInstallModal(true)}>
            <Plus size={14} /> Install Plugin
          </button>
          <button className="small-btn btn-primary" onClick={onClose}>Done</button>
        </div>
      }
    >
      {error && (
        <div className="plugin-error" style={{ marginBottom: 16, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444' }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {installModal && (
        <div className="plugin-install-modal" style={{ marginBottom: 16, padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <h4>Install Plugin from Manifest</h4>
          <form onSubmit={handleInstall} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 500 }}>Manifest (JSON)</label>
              <textarea
                value={installManifest}
                onChange={(e) => setInstallManifest(e.target.value)}
                placeholder='{ "id": "my-plugin", "name": "My Plugin", "version": "1.0.0", "description": "...", "main": "index.js", "capabilities": ["read_files", "write_files"] }'
                style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12, padding: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 500 }}>Plugin Code (JavaScript)</label>
              <textarea
                value={installCode}
                onChange={(e) => setInstallCode(e.target.value)}
                placeholder='export default async function({ plugin }) { plugin.on("chat:message", async (msg) => { console.log("New message:", msg) }) }'
                style={{ width: '100%', minHeight: 150, fontFamily: 'monospace', fontSize: 12, padding: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="small-btn" onClick={() => setInstallModal(false)}>Cancel</button>
              <button type="submit" className="small-btn btn-primary">Install</button>
            </div>
          </form>
        </div>
      )}

      <div className="plugin-list">
        {loading ? (
          <div className="plugin-loading">Loading plugins...</div>
        ) : plugins.length === 0 ? (
          <div className="plugin-empty">
            <Package size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
            <h3>No plugins installed</h3>
            <p>Click "Install Plugin" to add your first plugin</p>
          </div>
        ) : (
          <div>
            {plugins.map(plugin => {
              const isSelected = selectedPlugin === plugin.id
              return (
                <div key={plugin.id} className={`plugin-card ${plugin.enabled ? 'enabled' : 'disabled'}`}>
                  <div className="plugin-header">
                    <div className="plugin-info">
                      <div className="plugin-name-row">
                        <h4>{plugin.manifest.name}</h4>
                        <span className="plugin-id">{plugin.manifest.id}</span>
                        <span className={`plugin-version ${plugin.enabled ? 'active' : 'inactive'}`}>
                          {plugin.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="plugin-description">{plugin.manifest.description || 'No description'}</p>
                      <div className="plugin-meta">
                        <span>v{plugin.manifest.version}</span>
                        {plugin.manifest.author && <span>by {plugin.manifest.author}</span>}
                        {plugin.manifest.homepage && (
                          <a href={plugin.manifest.homepage} target="_blank" rel="noopener noreferrer" className="plugin-link">
                            <FileText size={12} /> Homepage
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="plugin-actions">
                      <button
                        className={`plugin-toggle ${plugin.enabled ? 'on' : 'off'}`}
                        onClick={() => togglePlugin(plugin)}
                        title={plugin.enabled ? 'Disable' : 'Enable'}
                      >
                        {plugin.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <button
                        className="plugin-settings"
                        onClick={() => setSelectedPlugin(plugin.id === selectedPlugin ? null : plugin.id)}
                        title="Settings"
                      >
                        <Settings size={18} />
                      </button>
                      <button
                        className="plugin-uninstall"
                        onClick={() => handleUninstall(plugin.id)}
                        title="Uninstall"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {isSelected ? (
                    <div className="plugin-details">
                      <div className="plugin-section">
                        <h5>Capabilities</h5>
                        <div className="capability-list">
                          {(plugin.manifest.capabilities || []).map(cap => (
                            <div key={cap} className="capability-item">
                              <span className="capability-name">{cap.replace(/_/g, ' ')}</span>
                              <span className="capability-desc">{capabilityDescriptions[cap] || 'Custom capability'}</span>
                            </div>
                          ))}
                          {(plugin.manifest.capabilities || []).length === 0 && (
                            <span className="no-capabilities">No capabilities declared</span>
                          )}
                        </div>
                      </div>

                      {plugin.manifest.commands && plugin.manifest.commands.length > 0 && (
                        <div className="plugin-section">
                          <h5>Commands</h5>
                          <ul className="command-list">
                            {plugin.manifest.commands.map(cmd => (
                              <li key={cmd.name}>
                                <code>{cmd.name}</code>
                                {cmd.description && <span>{cmd.description}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {plugin.manifest.settings && Object.keys(plugin.manifest.settings).length > 0 && (
                        <div className="plugin-section">
                          <h5>Settings Schema</h5>
                          <pre>{JSON.stringify(plugin.manifest.settings, null, 2)}</pre>
                        </div>
                      )}

                      <div className="plugin-section">
                        <h5>Status</h5>
                        <div className="status-grid">
                          <div><strong>Installed:</strong> {new Date(plugin.installedAt).toLocaleString()}</div>
                          <div><strong>Updated:</strong> {plugin.updatedAt ? new Date(plugin.updatedAt).toLocaleString() : 'Never'}</div>
                          <div><strong>Enabled:</strong> {plugin.enabled ? 'Yes' : 'No'}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}