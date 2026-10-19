import React, { useEffect, useRef } from 'react'
import { Command, X, Keyboard } from 'lucide-react'

/**
 * Documented shortcut map (Sprint 3). Single source of truth for the
 * keyboard cheat sheet AND the global handler in App.jsx. `?` (Shift+/)
 * toggles this modal when focus is not in a text field; Ctrl+/ always works.
 */
export const SHORTCUT_MAP = [
  { keys: ['?'], action: 'toggle-shortcuts', desc: 'Open/close this shortcut map' },
  { keys: ['ctrl+/'], action: 'toggle-shortcuts', desc: 'Open Keyboard Shortcuts cheat sheet' },
  { keys: ['ctrl+n'], action: 'new-conversation', desc: 'New conversation' },
  { keys: ['ctrl+b'], action: 'toggle-sidebar', desc: 'Toggle conversations sidebar' },
  { keys: ['ctrl+k', 'ctrl+p'], action: 'command-palette', desc: 'Open Command Palette & Tools' },
  { keys: ['ctrl+`'], action: 'toggle-terminal', desc: 'Toggle PTY Terminal panel' },
  { keys: ['ctrl+shift+d'], action: 'open-diagnostics', desc: 'Open Error Diagnostics & Tool Traces' },
  { keys: ['ctrl+shift+s'], action: 'open-skills', desc: 'Open Autonomous Skills library' },
  { keys: ['ctrl+shift+p'], action: 'open-personalise', desc: 'Open Personalise & Model Settings' },
  { keys: ['enter'], action: 'send', desc: 'Send prompt' },
  { keys: ['shift+enter'], action: 'newline', desc: 'Insert new line in composer' },
  { keys: ['esc'], action: 'close-modal', desc: 'Close active modal / popover' },
]

const SHORTCUT_GROUPS = [
  {
    title: 'General & Navigation',
    shortcuts: [
      { key: '?', desc: 'Open/close this shortcut map' },
      { key: 'Ctrl + N', desc: 'New conversation' },
      { key: 'Ctrl + B', desc: 'Toggle conversations sidebar' },
      { key: 'Ctrl + K / Ctrl + P', desc: 'Open Command Palette & Tools' },
      { key: 'Ctrl + /', desc: 'Open Keyboard Shortcuts cheat sheet' },
      { key: 'Esc', desc: 'Close active modal / popover' },
    ]
  },
  {
    title: 'Workspace & Tools',
    shortcuts: [
      { key: 'Ctrl + `', desc: 'Toggle PTY Terminal panel' },
      { key: 'Ctrl + Shift + D', desc: 'Open Error Diagnostics & Tool Traces' },
      { key: 'Ctrl + Shift + S', desc: 'Open Autonomous Skills library' },
      { key: 'Ctrl + Shift + P', desc: 'Open Personalise & Model Settings' },
    ]
  },
  {
    title: 'Chat & Editing',
    shortcuts: [
      { key: 'Enter', desc: 'Send prompt' },
      { key: 'Shift + Enter', desc: 'Insert new line in composer' },
      { key: 'Up Arrow (empty input)', desc: 'Edit last sent user message' },
    ]
  }
]

export function ShortcutsModal({ onClose }) {
  const closeRef = useRef(null)
  // Focus the Close control on mount and close on Escape; focus returns to
  // the invoker via Modal-style restore (App re-focuses the composer).
  // Axe checklist: dialog has aria-modal + accessible name, all controls
  // are labelled buttons, kbd text has ≥4.5:1 contrast in both themes.
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        style={{ width: 'min(640px, 95%)', maxHeight: '82vh' }}
      >
        <div className="palette-input-bar" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Keyboard size={18} style={{ color: 'var(--accent, #6366f1)' }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #f4f4f5)' }}>
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="palette-clear-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="palette-list" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SHORTCUT_GROUPS.map((grp, gIdx) => (
            <div key={gIdx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent, #6366f1)' }}>
                {grp.title}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {grp.shortcuts.map((sc, sIdx) => (
                  <div
                    key={sIdx}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                      borderRadius: 6, padding: '8px 10px', fontSize: 12
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary, #cbd5e1)' }}>{sc.desc}</span>
                    <kbd style={{
                      background: 'var(--bg-input, rgba(0,0,0,0.3))',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                      borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600,
                      color: 'var(--text-primary, #f4f4f5)', fontFamily: 'inherit'
                    }}>
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="palette-footer" style={{ padding: '10px 18px' }}>
          <span>Press <strong>Esc</strong> anytime to dismiss this overlay.</span>
          <button className="small-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
