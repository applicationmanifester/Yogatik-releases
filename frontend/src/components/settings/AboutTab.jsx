import React from 'react'
import { APP_VERSION, BUILD_DATE, APP_CODENAME, APP_RELEASES } from '../../version'

export function AboutTab() {
  return (
    <section className="settings-pane">
      <div className="settings-pane-header">
        <div>
          <h3 className="settings-pane-title">App Version &amp; Release Updates</h3>
          <p className="settings-pane-subtitle">
            Continuous improvements, performance tuning, and feature changelog.
          </p>
        </div>
      </div>

      <div className="settings-section-card" style={{ background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)', border: '1px solid rgba(255, 107, 53, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Yogatik v{APP_VERSION}</h4>
              <span className="settings-badge green">Active Release</span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Codename: {APP_CODENAME} · Built {BUILD_DATE}
            </p>
          </div>
        </div>
      </div>

      {APP_RELEASES.map(rel => (
        <div key={rel.version} className="settings-section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>
              v{rel.version} — {rel.title}
            </h4>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rel.date}</span>
          </div>
          {rel.highlights && (
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rel.highlights.map((hl, hIdx) => (
                <li key={hIdx}>{hl}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}
