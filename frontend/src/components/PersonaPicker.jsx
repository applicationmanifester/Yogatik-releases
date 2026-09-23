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
          background: 'var(--bg-input, rgba(127,127,127,0.12))',
          color: 'var(--text-primary, inherit)',
          border: '1px solid var(--border, rgba(127,127,127,0.25))',
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
          background: 'var(--bg-input, rgba(127,127,127,0.12))',
          color: 'var(--text-secondary, #777)',
          border: '1px solid var(--border, rgba(127,127,127,0.25))',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent, #ff6b35)'; e.currentTarget.style.borderColor = 'var(--accent, #ff6b35)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary, #777)'; e.currentTarget.style.borderColor = 'var(--border, rgba(127,127,127,0.25))' }}
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
          background: 'var(--bg-input, rgba(127,127,127,0.12))',
          color: 'var(--text-secondary, #777)',
          border: '1px solid var(--border, rgba(127,127,127,0.25))',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent, #ff6b35)'; e.currentTarget.style.borderColor = 'var(--accent, #ff6b35)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary, #777)'; e.currentTarget.style.borderColor = 'var(--border, rgba(127,127,127,0.25))' }}
      >
        <Plus size={13} />
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div
          role="listbox"
          className="persona-picker-popover"
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
            background: 'var(--bg-card, var(--bg-secondary, #1a1a24))',
            color: 'var(--text-primary, inherit)',
            border: '1px solid var(--border, rgba(127,127,127,0.25))',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}
        >
          {/* Search Box if more than 3 personas */}
          {personas.length > 3 && (
            <div
              className="persona-search-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                borderBottom: '1px solid var(--border, rgba(127,127,127,0.15))',
                background: 'var(--bg-tertiary, rgba(127,127,127,0.06))',
              }}
            >
              <Search size={12} style={{ opacity: 0.6, flexShrink: 0, color: 'var(--text-secondary, inherit)' }} />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Filter personas…"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary, inherit)',
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
                  className={`persona-item${isSelected ? ' selected' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '6px 8px',
                    fontSize: '12px',
                    borderRadius: '5px',
                    background: isSelected ? 'var(--accent-glow, rgba(255, 107, 53, 0.15))' : 'transparent',
                    color: isSelected ? 'var(--accent, #ff6b35)' : 'var(--text-primary, inherit)',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary, rgba(127,127,127,0.1))'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                  onClick={() => handleSelect(p.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1 }}>
                    <span style={{ fontSize: '15px', lineHeight: 1 }}>{p.icon || '🤖'}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
                      <span style={{ fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSelected ? 'var(--accent, #ff6b35)' : 'var(--text-primary, inherit)' }}>
                        {p.name}
                      </span>
                      {p.system_prompt && (
                        <span style={{ fontSize: '10px', color: isSelected ? 'var(--accent, #ff6b35)' : 'var(--text-secondary, #777)', opacity: isSelected ? 0.9 : 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                        color: 'var(--text-secondary, inherit)',
                        opacity: 0.6,
                        cursor: 'pointer',
                        padding: '3px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent, #ff6b35)'; e.currentTarget.style.background = 'var(--bg-tertiary, rgba(127,127,127,0.15))' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--text-secondary, inherit)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredPersonas.length === 0 && (
              <div style={{ padding: '12px', fontSize: '11px', textAlign: 'center', color: 'var(--text-muted, #777)' }}>
                No personas found
              </div>
            )}
          </div>

          {/* Footer: Create Persona */}
          <div
            className="persona-footer"
            style={{
              borderTop: '1px solid var(--border, rgba(127,127,127,0.15))',
              padding: '6px 8px',
              background: 'var(--bg-tertiary, rgba(127,127,127,0.06))',
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
                background: 'var(--accent-glow, rgba(255, 107, 53, 0.1))',
                border: '1px solid var(--accent-glow, rgba(255, 107, 53, 0.25))',
                borderRadius: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent, #ff6b35)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-glow, rgba(255, 107, 53, 0.1))'; e.currentTarget.style.color = 'var(--accent, #ff6b35)' }}
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
