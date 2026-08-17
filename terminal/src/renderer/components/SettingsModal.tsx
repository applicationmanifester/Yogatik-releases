import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Save, ChevronLeft, ChevronRight, Terminal, Type, Palette, Bell, Keyboard, Shield, Info, RotateCcw } from 'lucide-react';
import { CoreConfig, TerminalProfile, TerminalAction } from '@shared/types';

interface SettingsModalProps {
  onClose: () => void;
  config: CoreConfig;
  onConfigChange: (config: CoreConfig) => void;
}

const DEFAULT_PROFILE: TerminalProfile = {
  id: 'default',
  name: 'Default',
  shell: 'auto',
  env: {},
  cwd: 'home',
  cols: 120,
  rows: 32,
  scrollbackLines: 10000,
  font: {
    family: 'JetBrains Mono',
    size: 13,
    lineHeight: 1.4,
    letterSpacing: 0,
    ligatures: true,
    fallbackFamilies: ['Noto Color Emoji', 'Symbols Nerd Font Mono'],
  },
  theme: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    cursorAccent: '#1e1e2e',
    selection: '#45475a',
    ansi: {
      black: '#1e1e2e', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    },
    ansiBright: {
      black: '#6c7086', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#a6adc8',
    },
  },
  bell: { enabled: true, sound: 'system', visual: true, flashDuration: 100 },
  cursor: { style: 'block', blink: true, blinkRate: 530 },
  mouse: { enabled: true, protocol: 'sgr', hideWhenTyping: true },
  keybindings: [],
};

const FONT_FAMILIES = [
  'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro',
  'IBM Plex Mono', 'Monospace', 'Ubuntu Mono', 'Victor Mono',
  'Iosevka', 'Berkeley Mono', 'Geist Mono', 'Commit Mono',
];

const CURSOR_STYLES = ['block', 'underline', 'bar'] as const;
const MOUSE_PROTOCOLS = ['x10', 'utf8', 'sgr'] as const;

export function SettingsModal({ onClose, config, onConfigChange }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<'general' | 'profiles' | 'appearance' | 'keybindings' | 'advanced'>('general');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<Partial<TerminalProfile>>({});
  const [keybindingQuery, setKeybindingQuery] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  const profiles = Object.entries(config.profiles);
  const editingProfile = editingProfileId ? config.profiles[editingProfileId] : null;

  const updateConfig = useCallback((updates: Partial<CoreConfig>) => {
    onConfigChange({ ...config, ...updates });
  }, [config, onConfigChange]);

  const updateProfile = useCallback((profileId: string, updates: Partial<TerminalProfile>) => {
    const newProfiles = { ...config.profiles };
    newProfiles[profileId] = { ...newProfiles[profileId], ...updates };
    updateConfig({ profiles: newProfiles });
  }, [config.profiles, updateConfig]);

  const handleProfileChange = (field: keyof TerminalProfile, value: any) => {
    if (editingProfileId) {
      setProfileForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const saveProfile = () => {
    if (editingProfileId) {
      updateProfile(editingProfileId, profileForm);
      setEditingProfileId(null);
      setProfileForm({});
    }
  };

  const addProfile = () => {
    const newId = `profile_${Date.now()}`;
    const newProfile = { ...DEFAULT_PROFILE, id: newId, name: `Profile ${profiles.length + 1}` };
    updateConfig({ profiles: { ...config.profiles, [newId]: newProfile } });
    setEditingProfileId(newId);
    setProfileForm(newProfile);
  };

  const deleteProfile = (profileId: string) => {
    if (profileId === 'default' || Object.keys(config.profiles).length <= 1) return;
    const newProfiles = { ...config.profiles };
    delete newProfiles[profileId];
    if (config.defaultProfile === profileId) {
      updateConfig({ profiles: newProfiles, defaultProfile: Object.keys(newProfiles)[0] });
    } else {
      updateConfig({ profiles: newProfiles });
    }
  };

  const filteredKeybindings = Object.entries(config.keybindings).filter(([key, action]) => 
    key.toLowerCase().includes(keybindingQuery.toLowerCase()) ||
    action.toLowerCase().includes(keybindingQuery.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sections = [
    { id: 'general', label: 'General', icon: <Terminal size={18} /> },
    { id: 'profiles', label: 'Profiles', icon: <Terminal size={18} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
    { id: 'keybindings', label: 'Keybindings', icon: <Keyboard size={18} /> },
    { id: 'advanced', label: 'Advanced', icon: <Shield size={18} /> },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" ref={modalRef} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <nav className="settings-sidebar" aria-label="Settings sections">
            {sections.map(section => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id as any)}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {activeSection === 'general' && <GeneralSettings config={config} onChange={updateConfig} />}
            {activeSection === 'profiles' && (
              <ProfilesSettings
                profiles={profiles}
                editingProfileId={editingProfileId}
                editingProfile={editingProfile}
                profileForm={profileForm}
                onEditProfile={setEditingProfileId}
                onProfileChange={handleProfileChange}
                onSaveProfile={saveProfile}
                onAddProfile={addProfile}
                onDeleteProfile={deleteProfile}
                defaultProfile={config.defaultProfile}
                onDefaultProfileChange={(id) => updateConfig({ defaultProfile: id })}
              />
            )}
            {activeSection === 'appearance' && <AppearanceSettings config={config} onChange={updateConfig} />}
            {activeSection === 'keybindings' && <KeybindingsSettings config={config} query={keybindingQuery} onQueryChange={setKeybindingQuery} onChange={updateConfig} />}
            {activeSection === 'advanced' && <AdvancedSettings config={config} onChange={updateConfig} />}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function GeneralSettings({ config, onChange }: { config: CoreConfig; onChange: (updates: Partial<CoreConfig>) => void }) {
  return (
    <div className="settings-section">
      <h3>General</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.confirmClose}
            onChange={e => onChange({ confirmClose: e.target.checked })}
          />
          Confirm before closing window
        </label>
      </div>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.confirmMultipleTabs}
            onChange={e => onChange({ confirmMultipleTabs: e.target.checked })}
          />
          Confirm when closing multiple tabs
        </label>
      </div>

      <div className="setting-group">
        <label>
          Startup behavior:
          <select
            value={config.startupMode}
            onChange={e => onChange({ startupMode: e.target.value as any })}
          >
            <option value="new">New window</option>
            <option value="restore">Restore previous session</option>
            <option value="last">Open last used profile</option>
          </select>
        </label>
      </div>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.checkUpdates}
            onChange={e => onChange({ checkUpdates: e.target.checked })}
          />
          Check for updates automatically
        </label>
      </div>

      <div className="setting-group">
        <h4>Rendering</h4>
        <label>
          Renderer:
          <select
            value={config.rendering.renderer}
            onChange={e => onChange({ rendering: { ...config.rendering, renderer: e.target.value as any } })}
          >
            <option value="auto">Auto</option>
            <option value="webgl">WebGL</option>
            <option value="canvas">Canvas 2D</option>
          </select>
        </label>
      </div>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.rendering.gpuAcceleration}
            onChange={e => onChange({ rendering: { ...config.rendering, gpuAcceleration: e.target.checked } })}
          />
          GPU acceleration
        </label>
      </div>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.rendering.vsync}
            onChange={e => onChange({ rendering: { ...config.rendering, vsync: e.target.checked } })}
          />
          VSync
        </label>
      </div>

      <div className="setting-group">
        <label>
          Max FPS:
          <input
            type="number"
            value={config.rendering.maxFps}
            min={30}
            max={144}
            onChange={e => onChange({ rendering: { ...config.rendering, maxFps: parseInt(e.target.value) } })}
          />
        </label>
      </div>
    </div>
  );
}

function ProfilesSettings({
  profiles,
  editingProfileId,
  editingProfile,
  profileForm,
  onEditProfile,
  onProfileChange,
  onSaveProfile,
  onAddProfile,
  onDeleteProfile,
  defaultProfile,
  onDefaultProfileChange,
}: any) {
  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>Profiles</h3>
        <button className="btn btn-secondary" onClick={onAddProfile}>
          <Plus size={16} /> New Profile
        </button>
      </div>

      <div className="profiles-list">
        {profiles.map(([id, profile]: [string, any]) => (
          <div key={id} className={`profile-item ${editingProfileId === id ? 'editing' : ''} ${defaultProfile === id ? 'default' : ''}`}>
            {editingProfileId === id ? (
              <ProfileEditor
                profile={profile}
                form={profileForm}
                onChange={onProfileChange}
                onSave={onSaveProfile}
                onCancel={() => onEditProfile(null)}
              />
            ) : (
              <div className="profile-summary" onClick={() => onEditProfile(id)}>
                <div className="profile-info">
                  <span className="profile-name">{profile.name}</span>
                  <span className="profile-shell">{profile.shell === 'auto' ? 'Auto-detect' : profile.shell.path}</span>
                </div>
                <div className="profile-actions">
                  {defaultProfile !== id && (
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDefaultProfileChange(id); }} title="Set as default">
                      <ChevronRight size={14} />
                    </button>
                  )}
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDeleteProfile(id); }} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileEditor({ profile, form, onChange, onSave, onCancel }: any) {
  return (
    <div className="profile-editor">
      <div className="editor-row">
        <label>Name: <input value={form.name || profile.name} onChange={e => onChange('name', e.target.value)} /></label>
        <label>Columns: <input type="number" value={form.cols || profile.cols} onChange={e => onChange('cols', parseInt(e.target.value))} /></label>
        <label>Rows: <input type="number" value={form.rows || profile.rows} onChange={e => onChange('rows', parseInt(e.target.value))} /></label>
      </div>
      <div className="editor-row">
        <label>
          Shell:
          <select value={form.shell === 'auto' ? 'auto' : 'custom'} onChange={e => onChange('shell', e.target.value === 'auto' ? 'auto' : { path: '', args: [], name: 'custom' })}>
            <option value="auto">Auto-detect</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {form.shell !== 'auto' && (
          <label>Path: <input value={form.shell?.path || ''} onChange={e => onChange('shell', { ...form.shell, path: e.target.value })} /></label>
        )}
      </div>
      <div className="editor-row">
        <label>Font: <input value={form.font?.family || profile.font.family} onChange={e => onChange('font', { ...form.font, family: e.target.value })} /></label>
        <label>Size: <input type="number" value={form.font?.size || profile.font.size} onChange={e => onChange('font', { ...form.font, size: parseInt(e.target.value) })} /></label>
        <label>Line Height: <input type="number" step="0.1" value={form.font?.lineHeight || profile.font.lineHeight} onChange={e => onChange('font', { ...form.font, lineHeight: parseFloat(e.target.value) })} /></label>
      </div>
      <div className="editor-actions">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

function AppearanceSettings({ config, onChange }: { config: CoreConfig; onChange: (updates: Partial<CoreConfig>) => void }) {
  const defaultProfile = config.profiles.default;
  
  return (
    <div className="settings-section">
      <h3>Appearance</h3>
      <p className="settings-hint">Changes apply to the default profile. Other profiles can be customized individually.</p>

      <div className="setting-group">
        <label>
          Font Family:
          <select value={defaultProfile.font.family} onChange={e => onChange({ profiles: { ...config.profiles, default: { ...defaultProfile, font: { ...defaultProfile.font, family: e.target.value } } } })}>
            {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>

      <div className="setting-group">
        <label>
          Font Size: {defaultProfile.font.size}px
          <input type="range" min="8" max="24" value={defaultProfile.font.size} onChange={e => onChange({ profiles: { ...config.profiles, default: { ...defaultProfile, font: { ...defaultProfile.font, size: parseInt(e.target.value) } } } })} />
        </label>
      </div>

      <div className="setting-group">
        <label>
          Line Height: {defaultProfile.font.lineHeight}
          <input type="range" min="1" max="2" step="0.1" value={defaultProfile.font.lineHeight} onChange={e => onChange({ profiles: { ...config.profiles, default: { ...defaultProfile, font: { ...defaultProfile.font, lineHeight: parseFloat(e.target.value) } } } })} />
        </label>
      </div>

      <div className="setting-group">
        <label>
          <input type="checkbox" checked={defaultProfile.font.ligatures} onChange={e => onChange({ profiles: { ...config.profiles, default: { ...defaultProfile, font: { ...defaultProfile.font, ligatures: e.target.checked } } } })} />
          Font Ligatures
        </label>
      </div>

      <h4>Colors</h4>
      <div className="color-grid">
        {[
          ['Background', 'background'],
          ['Foreground', 'foreground'],
          ['Cursor', 'cursor'],
          ['Selection', 'selection'],
        ].map(([label, key]) => (
          <div key={key} className="color-picker">
            <label>{label}: <input type="color" value={defaultProfile.theme[key]} onChange={e => onChange({ profiles: { ...config.profiles, default: { ...defaultProfile, theme: { ...defaultProfile.theme, [key]: e.target.value } } } })} /></label>
          </div>
        ))}
      </div>

      <h4>ANSI Colors</h4>
      <div className="color-grid ansi-grid">
        {Object.entries(defaultProfile.theme.ansi).map(([name, value]) => (
          <div key={name} className="color-picker">
            <label>
              {name}: 
              <input 
                type="color" 
                value={value} 
                onChange={e => {
                  const newAnsi = { ...defaultProfile.theme.ansi, [name]: e.target.value };
                  const newTheme = { ...defaultProfile.theme, ansi: newAnsi };
                  const newProfile = { ...defaultProfile, theme: newTheme };
                  onChange({ profiles: { ...config.profiles, default: newProfile } });
                }} 
              />
            </label>
          </div>
        ))}
      </div>

      <h4>Bright ANSI Colors</h4>
      <div className="color-grid ansi-grid">
        {Object.entries(defaultProfile.theme.ansiBright).map(([name, value]) => (
          <div key={name} className="color-picker">
            <label>
              {name}: 
              <input 
                type="color" 
                value={value} 
                onChange={e => {
                  const newAnsiBright = { ...defaultProfile.theme.ansiBright, [name]: e.target.value };
                  const newTheme = { ...defaultProfile.theme, ansiBright: newAnsiBright };
                  const newProfile = { ...defaultProfile, theme: newTheme };
                  onChange({ profiles: { ...config.profiles, default: newProfile } });
                }} 
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeybindingsSettings({ config, query, onQueryChange, onChange }: { config: CoreConfig; query: string; onQueryChange: (q: string) => void; onChange: (updates: Partial<CoreConfig>) => void }) {
  const allActions: TerminalAction[] = [
    'newTab', 'closeTab', 'nextTab', 'prevTab', 'moveTabLeft', 'moveTabRight',
    'splitHorizontal', 'splitVertical', 'focusPaneLeft', 'focusPaneRight', 'focusPaneUp', 'focusPaneDown',
    'resizePaneLeft', 'resizePaneRight', 'resizePaneUp', 'resizePaneDown',
    'copy', 'paste', 'pasteFromClipboard', 'selectAll', 'clearScrollback',
    'find', 'findNext', 'findPrev', 'scrollUp', 'scrollDown', 'scrollPageUp', 'scrollPageDown',
    'scrollTop', 'scrollBottom', 'increaseFontSize', 'decreaseFontSize', 'resetFontSize',
    'toggleFullscreen', 'toggleMaximized', 'sendEscape', 'sendHex', 'openConfig',
  ];

  const reverseBindings: Record<string, string> = {};
  for (const [key, action] of Object.entries(config.keybindings)) {
    reverseBindings[action] = key;
  }

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>Keybindings</h3>
        <input
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search keybindings..."
          className="search-input"
        />
      </div>

      <div className="keybindings-table">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Keybinding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allActions
              .filter(action => 
                action.toLowerCase().includes(query.toLowerCase()) ||
                (reverseBindings[action] || '').toLowerCase().includes(query.toLowerCase())
              )
              .map(action => (
                <tr key={action}>
                  <td>{action.replace(/([A-Z])/g, ' $1').trim()}</td>
                  <td>
                    <kbd className="keybinding-display">{reverseBindings[action] || '—'}</kbd>
                  </td>
                  <td>
                    <button className="btn-icon" title="Edit">✎</button>
                    <button className="btn-icon" title="Remove">×</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdvancedSettings({ config, onChange }: { config: CoreConfig; onChange: (updates: Partial<CoreConfig>) => void }) {
  return (
    <div className="settings-section">
      <h3>Advanced</h3>

      <div className="setting-group">
        <h4>Shell Integration</h4>
        <label>
          <input type="checkbox" checked={config.shellIntegration.enabled} onChange={e => onChange({ shellIntegration: { ...config.shellIntegration, enabled: e.target.checked } })} />
          Enable shell integration
        </label>
        <label>
          <input type="checkbox" checked={config.shellIntegration.autoInject} onChange={e => onChange({ shellIntegration: { ...config.shellIntegration, autoInject: e.target.checked } })} />
          Auto-inject integration scripts
        </label>
        <label>
          <input type="checkbox" checked={config.shellIntegration.osc7} onChange={e => onChange({ shellIntegration: { ...config.shellIntegration, osc7: e.target.checked } })} />
          OSC 7 (Working directory)
        </label>
        <label>
          <input type="checkbox" checked={config.shellIntegration.osc133} onChange={e => onChange({ shellIntegration: { ...config.shellIntegration, osc133: e.target.checked } })} />
          OSC 133 (Prompt markers)
        </label>
        <label>
          <input type="checkbox" checked={config.shellIntegration.bracketPaste} onChange={e => onChange({ shellIntegration: { ...config.shellIntegration, bracketPaste: e.target.checked } })} />
          Bracketed paste mode
        </label>
      </div>

      <div className="setting-group">
        <h4>Security</h4>
        <label>
          <input type="checkbox" checked={config.security.ptySandbox} onChange={e => onChange({ security: { ...config.security, ptySandbox: e.target.checked } })} />
          PTY sandbox
        </label>
        <label>
          <input type="checkbox" checked={config.security.osc52WriteRequiresGesture} onChange={e => onChange({ security: { ...config.security, osc52WriteRequiresGesture: e.target.checked } })} />
          Require user gesture for clipboard write
        </label>
        <label>
          <input type="checkbox" checked={config.security.denyFileUris} onChange={e => onChange({ security: { ...config.security, denyFileUris: e.target.checked } })} />
          Block file:// URIs in hyperlinks
        </label>
      </div>

      <div className="setting-group">
        <h4>Experimental</h4>
        <label>
          <input type="checkbox" checked={config.advanced.experimentalKittyGraphics} onChange={e => onChange({ advanced: { ...config.advanced, experimentalKittyGraphics: e.target.checked } })} />
          Kitty graphics protocol
        </label>
        <label>
          <input type="checkbox" checked={config.advanced.experimentalSixel} onChange={e => onChange({ advanced: { ...config.advanced, experimentalSixel: e.target.checked } })} />
          Sixel graphics
        </label>
        <label>
          <input type="checkbox" checked={config.advanced.logPtyTraffic} onChange={e => onChange({ advanced: { ...config.advanced, logPtyTraffic: e.target.checked } })} />
          Log PTY traffic
        </label>
        <label>
          <input type="checkbox" checked={config.advanced.auditLog} onChange={e => onChange({ advanced: { ...config.advanced, auditLog: e.target.checked } })} />
          Audit logging
        </label>
      </div>

      <div className="setting-group danger-zone">
        <h4>Danger Zone</h4>
        <button className="btn btn-danger" onClick={() => {
          if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            onChange({}); // Will trigger reset via config hook
          }
        }}>
          <RotateCcw size={16} /> Reset to Defaults
        </button>
      </div>
    </div>
  );
}