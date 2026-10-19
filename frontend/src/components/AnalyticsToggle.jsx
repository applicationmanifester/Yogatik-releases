import React, { useState, useEffect } from 'react'
import { isAnalyticsConsented, getAnalyticsConfig, setAnalyticsConsent } from '../analyticsConsent'
import { isAnalyticsEnabled } from '../analytics'

/**
 * Transparent opt-in analytics toggle for Settings → Privacy & Sync.
 * Default OFF. Labels exactly what is collected (counts/timings only).
 */
export function AnalyticsToggle() {
  const [consented, setConsented] = useState(() => isAnalyticsConsented())
  const [host, setHost] = useState(() => getAnalyticsConfig().host || '')
  const [projectKey, setProjectKey] = useState(() => getAnalyticsConfig().projectKey || '')
  const [active, setActive] = useState(() => isAnalyticsEnabled())
  const [saving, setSaving] = useState(false)

  useEffect(() => { setActive(isAnalyticsEnabled()) }, [consented])

  const onToggle = async (e) => {
    const next = e.target.checked
    setSaving(true)
    try {
      const on = await setAnalyticsConsent(next, { host, projectKey })
      setConsented(next)
      setActive(on)
    } finally { setSaving(false) }
  }

  const onSaveEndpoint = async () => {
    if (!consented) return
    setSaving(true)
    try { setActive(await setAnalyticsConsent(true, { host, projectKey })) }
    finally { setSaving(false) }
  }

  return (
    <div className="settings-section-card">
      <h4>Usage Analytics (opt-in)</h4>
      <div className="setting-row">
        <div className="setting-info">
          <span className="setting-name">Anonymous usage analytics</span>
          <span className="setting-desc">
            Off by default. When on, Yogatik sends only anonymised counts and
            timings — tool name, success/failure, bucketed latency
            (&lt;250ms…&gt;10s), provider, feature. Never message content, URLs,
            keys, or your text. Self-hosted PostHog endpoint; no SDK loads
            until you opt in.
          </span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={consented}
            onChange={onToggle}
            disabled={saving}
            aria-label="Anonymous usage analytics (opt-in, off by default)"
          />
          <span className="slider" />
        </label>
      </div>
      {consented && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>
            PostHog host
            <input
              type="url"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="https://posthog.example.com"
              aria-label="PostHog host"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Project key
            <input
              type="text"
              value={projectKey}
              onChange={e => setProjectKey(e.target.value)}
              placeholder="phc_…"
              aria-label="PostHog project key"
              autoComplete="off"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="settings-btn secondary sm" onClick={onSaveEndpoint} disabled={saving}>
              Save endpoint
            </button>
            <span style={{ fontSize: 11.5, opacity: 0.75 }} role="status">
              {active ? 'Active — sending anonymous counts only.' : 'Configured but inactive (needs host + key).'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
