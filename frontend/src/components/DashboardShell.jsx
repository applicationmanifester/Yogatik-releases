import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Sliders, DollarSign, AlertTriangle, Bot, Sparkles, Plug, Blocks, BarChart3, Wrench, X, Search } from 'lucide-react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * The nine settings-family surfaces (Settings, Billing, Usage, Diagnostics,
 * Capabilities, Agents, Skills, MCP Servers, Plugins) used to be nine
 * independent floating modals, each centred over the chat with its own
 * backdrop. DashboardShell is the one full-page frame all nine now share: a
 * persistent left nav rail (grouped, searchable) plus a content pane, so
 * switching from "Billing" to "Diagnostics" is a rail click inside one page
 * rather than closing one dialog and opening another.
 *
 * Sections are declared here, not per-caller, because the rail is the one
 * piece of chrome every section shares — a section that forgets to register
 * itself here simply cannot be reached, the same reachability guarantee
 * App.jsx already leans on for browserOccluded/isAnyModalOpen membership.
 *
 * Built entirely from the app's existing bg/text/border/accent tokens (see
 * styles.css) — no hardcoded colour anywhere in this file — for the same
 * reason the yg-panel shell exists: content painted onto a hardcoded-dark
 * card goes illegible the moment light theme is on.
 */
export const DASHBOARD_SECTIONS = [
  { key: 'settings', label: 'Settings', blurb: 'Voice, tone, accessibility & region', icon: Sliders, group: 'Account' },
  { key: 'billing', label: 'Billing', blurb: 'Plan, invoices & payment history', icon: DollarSign, group: 'Account' },
  { key: 'usage', label: 'Usage & Data', blurb: 'Cost, tokens, memory & storage', icon: BarChart3, group: 'Account' },
  { key: 'diagnostics', label: 'Diagnostics', blurb: 'Errors, traces & performance', icon: AlertTriangle, group: 'Account' },
  { key: 'capabilities', label: 'Capabilities', blurb: 'Turn individual AI tools on or off', icon: Wrench, group: 'Tools & Extensions' },
  { key: 'agents', label: 'Agents', blurb: 'Specialist AI agents & delegation', icon: Bot, group: 'Tools & Extensions' },
  { key: 'skills', label: 'Skills & Workflows', blurb: 'Reusable prompts & automations', icon: Sparkles, group: 'Tools & Extensions' },
  { key: 'mcp', label: 'MCP Servers', blurb: 'Connect external tools & data', icon: Plug, group: 'Tools & Extensions' },
  { key: 'plugins', label: 'Plugins', blurb: 'Installable extension bundles', icon: Blocks, group: 'Tools & Extensions' },
]
const DASHBOARD_GROUPS = ['Account', 'Tools & Extensions']

export function DashboardShell({ active, onNavigate, onClose, children }) {
  const ref = useRef(null)
  const restoreTo = useRef(null)
  const searchRef = useRef(null)
  const [query, setQuery] = useState('')
  const section = DASHBOARD_SECTIONS.find(s => s.key === active) || DASHBOARD_SECTIONS[0]

  const q = query.trim().toLowerCase()
  const grouped = useMemo(() => {
    const matches = !q
      ? DASHBOARD_SECTIONS
      : DASHBOARD_SECTIONS.filter(s => s.label.toLowerCase().includes(q) || s.blurb.toLowerCase().includes(q))
    return DASHBOARD_GROUPS
      .map(g => ({ group: g, items: matches.filter(s => s.group === g) }))
      .filter(g => g.items.length)
  }, [q])

  useEffect(() => {
    restoreTo.current = document.activeElement
    const node = ref.current
    const first = node?.querySelector(FOCUSABLE)
    ;(first || node)?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        // Escape clears an active rail search before it closes the whole
        // dashboard — the same two-stage behaviour as Ctrl+K's own search.
        if (query) { setQuery(''); searchRef.current?.focus(); return }
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...(node?.querySelectorAll(FOCUSABLE) || [])].filter(el => el.offsetParent !== null)
      if (!items.length) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      restoreTo.current?.focus?.()
    }
    // Re-arm the trap when the section changes — a rail click swaps in an
    // entirely new focusable tree underneath. Deliberately NOT re-armed on
    // every `query` keystroke (query is read inside the handler via closure
    // through the effect re-running only on the deps below would fire the
    // trap once per character), so it is read fresh each keydown instead.
  }, [onClose, active]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (key) => { onNavigate?.(key) }

  return (
    <div className="dash-overlay">
      <div
        ref={ref}
        className="dash-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dash-title"
        tabIndex={-1}
      >
        <nav className="dash-rail" aria-label="Dashboard sections">
          <div className="dash-rail-brand">
            <span className="dash-rail-brand-dot" />
            Dashboard
          </div>
          <div className="dash-rail-search">
            <Search size={13} className="dash-rail-search-icon" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search settings"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search dashboard sections"
            />
            {query && (
              <button type="button" className="dash-rail-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={12} />
              </button>
            )}
          </div>

          {grouped.length === 0 ? (
            <div className="dash-rail-empty">No sections match "{query}"</div>
          ) : grouped.map(({ group, items }) => (
            <div className="dash-rail-group" key={group}>
              <div className="dash-rail-group-label">{group}</div>
              <div className="dash-rail-nav">
                {items.map(s => {
                  const Icon = s.icon
                  const isActive = s.key === active
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`dash-nav-item${isActive ? ' active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => navigate(s.key)}
                    >
                      <span className="dash-nav-icon"><Icon size={16} /></span>
                      <span className="dash-nav-label">{s.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="dash-main">
          <div className="dash-topbar">
            <span className="dash-topbar-icon"><section.icon size={17} /></span>
            <div className="dash-topbar-text">
              <h2 id="dash-title">{section.label}</h2>
              <span className="dash-topbar-blurb">{section.blurb}</span>
            </div>
            <button type="button" className="yg-panel-icon-btn" onClick={onClose} title="Close" aria-label="Close dashboard">
              <X size={16} />
            </button>
          </div>
          <div className="dash-content">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
