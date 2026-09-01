import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Sliders, DollarSign, AlertTriangle, Bot, Sparkles, Plug, Blocks, BarChart3, Wrench, X, Search, ArrowLeft, User, Key, ShieldCheck } from 'lucide-react'
import { YogatikLogo } from './YogatikLogo'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Account/Personalization/Providers/Privacy used to be one catch-all
// "Settings" page — a user chasing an API key field, a backup button, or a
// sign-in state each had to guess which of a dozen unrelated controls it was
// mixed in with. Split by what each one actually is, the same way Billing,
// Usage and Diagnostics already got their own pages instead of staying part
// of that one page.
export const DASHBOARD_SECTIONS = [
  { key: 'account', label: 'Account', blurb: 'Sign-in, plan & this device', icon: User, group: 'Account' },
  { key: 'providers', label: 'Providers & Keys', blurb: 'AI providers, API keys & model', icon: Key, group: 'Account' },
  { key: 'billing', label: 'Billing', blurb: 'Plan, invoices & payment history', icon: DollarSign, group: 'Account' },
  { key: 'settings', label: 'Personalization', blurb: 'Voice, tone, accessibility & region', icon: Sliders, group: 'Account' },
  { key: 'privacy', label: 'Privacy & Backup', blurb: 'Export, import & data policies', icon: ShieldCheck, group: 'Account' },
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
  }, [onClose, active]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (key) => { onNavigate?.(key) }

  if (typeof document === 'undefined') return null

  return (
    <div
      ref={ref}
      className="dash-shell"
      role="main"
      aria-labelledby="dash-title"
      tabIndex={-1}
    >
      <nav className="dash-rail" aria-label="Dashboard navigation">
        <div className="dash-rail-header">
          <div className="dash-rail-brand">
            <YogatikLogo size={24} />
            <span>Yogatik Settings</span>
          </div>
          <button
            type="button"
            className="dash-back-btn"
            onClick={onClose}
            title="Return to Chat Conversation"
            aria-label="Back to Chat"
          >
            <ArrowLeft size={14} />
            <span>Back to Chat</span>
          </button>
        </div>

        <div className="dash-rail-search">
          <Search size={13} className="dash-rail-search-icon" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search settings & tools…"
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

        <div className="dash-rail-scroll">
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
        </div>

        <div className="dash-rail-footer">
          <a href="/pricing" target="_blank" rel="noreferrer">Pricing &amp; Plans</a>
          <span>·</span>
          <a href="/guide" target="_blank" rel="noreferrer">User Guide</a>
          <span>·</span>
          <a href="/terms" target="_blank" rel="noreferrer">Terms</a>
        </div>
      </nav>

      <div className="dash-main">
        <div className="dash-topbar">
          <div className="dash-topbar-left">
            <span className="dash-topbar-icon"><section.icon size={18} /></span>
            <div className="dash-topbar-text">
              <h2 id="dash-title">{section.label}</h2>
              <span className="dash-topbar-blurb">{section.blurb}</span>
            </div>
          </div>
          <div className="dash-topbar-actions">
            <button
              type="button"
              className="dash-topbar-back-btn"
              onClick={onClose}
              title="Back to Chat (Esc)"
              aria-label="Back to Chat"
            >
              <ArrowLeft size={14} />
              <span>Back to Chat</span>
              <kbd>Esc</kbd>
            </button>
          </div>
        </div>
        <div className="dash-content">
          {children}
        </div>
      </div>
    </div>
  )
}
