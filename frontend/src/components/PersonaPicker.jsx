import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Check, Edit2, Plus, Sparkles } from 'lucide-react'

/**
 * Persona dropdown component positioned above the chat composer.
 * Allows quick switching of system personas/prompts and provides direct
 * access to edit or create personas with icons.
 */
export function PersonaPicker({
  personas = [],
  activePersonaId = 'default',
  onSelect,
  onEdit,
  onCreate,
  disabled = false,
  compact = true,
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const activePersona = useMemo(() => {
    return personas.find(p => p.id === activePersonaId) || personas[0] || {
      id: 'default',
      name: 'Default',
      icon: '🤖',
      system_prompt: 'You are a helpful AI assistant.',
    }
  }, [personas, activePersonaId])

  const filteredPersonas = useMemo(() => {
    if (!q.trim()) return personas
    const query = q.trim().toLowerCase()
    return personas.filter(p =>
      (p.name || '').toLowerCase().includes(query) ||
      (p.system_prompt || '').toLowerCase().includes(query)
    )
  }, [personas, q])

  useEffect(() => {
    if (!open) return
    setQ('')
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const handleSelect = (id) => {
    onSelect?.(id)
    setOpen(false)
  }

  return (
    <div className={`persona-picker-container${compact ? ' compact' : ''}`} ref={boxRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {/* Persona Dropdown Trigger Button */}
      <button
        type="button"
        className="persona-picker-trigger"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current Persona: ${activePersona.name}. Click to switch persona`}
        title={`Persona: ${activePersona.name} (click to switch)`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          background: 'var(--bg-input, rgba(255,255,255,0.06))',
          color: 'var(--text-primary, #eee)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          maxWidth: '170px',
        }}
      >
        <span style={{ fontSize: '13px', lineHeight: 1 }}>{activePersona.icon || '🤖'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
          {activePersona.name || 'Default'}
        </span>
        <ChevronDown size={12} style={{ opacity: 0.6, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {/* Edit Active Persona Icon Button */}
      <button
        type="button"
        className="persona-action-btn edit-persona-btn"
        onClick={() => onEdit?.(activePersona)}
        disabled={disabled}
        title={`Edit ${activePersona.name} persona`}
        aria-label={`Edit ${activePersona.name} persona`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          padding: 0,
          borderRadius: '6px',
          background: 'var(--bg-input, rgba(255,255,255,0.06))',
          color: 'var(--text-secondary, #aaa)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent, #ff6b35)'; e.currentTarget.style.borderColor = 'var(--accent, #ff6b35)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary, #aaa)'; e.currentTarget.style.borderColor = 'var(--border, rgba(255,255,255,0.12))' }}
      >
        <Edit2 size={12} />
      </button>

      {/* Create New Persona Icon Button */}
      <button
        type="button"
        className="persona-action-btn create-persona-btn"
        onClick={() => onCreate?.()}
        disabled={disabled}
        title="Create new persona (+)"
        aria-label="Create new persona"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          padding: 0,
          borderRadius: '6px',
          background: 'var(--bg-input, rgba(255,255,255,0.06))',
          color: 'var(--text-secondary, #aaa)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent, #ff6b35)'; e.currentTarget.style.borderColor = 'var(--accent, #ff6b35)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary, #aaa)'; e.currentTarget.style.borderColor = 'var(--border, rgba(255,255,255,0.12))' }}
      >
        <Plus size={13} />
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            zIndex: 1000,
            minWidth: '240px',
            maxWidth: '300px',
            maxHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-card, #1a1a24)',
            border: '1px solid var(--border, rgba(255,255,255,0.15))',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Search Box if more than 3 personas */}
          {personas.length > 3 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))',
                background: 'rgba(0,0,0,0.2)',
              }}
            >
              <Search size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Filter personas…"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'inherit',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            </div>
          )}

          {/* Persona List */}
          <div style={{ overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredPersonas.map((p) => {
              const isSelected = p.id === activePersonaId
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '6px 8px',
                    fontSize: '12px',
                    borderRadius: '5px',
                    background: isSelected ? 'rgba(255, 107, 53, 0.15)' : 'transparent',
                    color: isSelected ? 'var(--accent, #ff6b35)' : 'var(--text-primary, #ddd)',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                  onClick={() => handleSelect(p.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1 }}>
                    <span style={{ fontSize: '15px', lineHeight: 1 }}>{p.icon || '🤖'}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
                      <span style={{ fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                      {p.system_prompt && (
                        <span style={{ fontSize: '10px', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.system_prompt.slice(0, 45)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {isSelected && <Check size={13} style={{ color: 'var(--accent, #ff6b35)' }} />}
                    {/* Edit icon for this specific persona */}
                    <button
                      type="button"
                      title={`Edit ${p.name}`}
                      aria-label={`Edit ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen(false)
                        onEdit?.(p)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                        opacity: 0.6,
                        cursor: 'pointer',
                        padding: '3px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredPersonas.length === 0 && (
              <div style={{ padding: '12px', fontSize: '11px', textAlign: 'center', opacity: 0.6 }}>
                No personas found
              </div>
            )}
          </div>

          {/* Footer: Create Persona */}
          <div
            style={{
              borderTop: '1px solid var(--border, rgba(255,255,255,0.1))',
              padding: '6px 8px',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onCreate?.()
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '5px 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent, #ff6b35)',
                background: 'rgba(255, 107, 53, 0.1)',
                border: '1px solid rgba(255, 107, 53, 0.25)',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              <Plus size={12} />
              <span>Create Custom Persona</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
