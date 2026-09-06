import React, { useState } from 'react'
import { Modal } from './Modal'
import { YogatikLogo } from './YogatikLogo'
import {
  Sparkles,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  ChevronRight,
  Gift,
  Flame,
  Clock,
  Tag,
} from 'lucide-react'
import { APP_VERSION, BUILD_DATE, APP_CODENAME, APP_RELEASES, markCurrentVersionAsSeen } from '../version'

export function WhatsNewModal({ onClose, onOpenSettings }) {
  const [selectedVersion, setSelectedVersion] = useState(APP_VERSION)
  const currentRelease = APP_RELEASES.find(r => r.version === selectedVersion) || APP_RELEASES[0]

  const handleClose = () => {
    markCurrentVersionAsSeen()
    onClose?.()
  }

  return (
    <Modal
      title="What's New & Updates"
      icon={<Gift size={16} style={{ color: 'var(--accent, #ff6b35)' }} />}
      onClose={handleClose}
    >
      <div className="whats-new-modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header Hero Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
            border: '1px solid rgba(255, 107, 53, 0.25)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <YogatikLogo size={36} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Yogatik v{currentRelease.version}
                </h3>
                {currentRelease.isLatest && (
                  <span
                    style={{
                      background: 'var(--accent, #ff6b35)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Latest Release
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={12} /> {currentRelease.date}
                </span>
                <span>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag size={12} /> {currentRelease.codename || currentRelease.title || APP_CODENAME}
                </span>
              </div>
            </div>
          </div>

          {/* Version Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Version:</span>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              style={{
                background: 'var(--bg-secondary, #1e1e24)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {APP_RELEASES.map(r => (
                <option key={r.version} value={r.version}>
                  v{r.version} {r.isLatest ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Release Subtitle */}
        <div style={{ padding: '0 4px' }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {currentRelease.title}
          </h4>
        </div>

        {/* Key Highlights */}
        {currentRelease.highlights && currentRelease.highlights.length > 0 && (
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              borderRadius: 10,
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--accent, #ff6b35)' }}>
              <Flame size={14} /> Release Highlights
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {currentRelease.highlights.map((hl, idx) => (
                <li key={idx} style={{ lineHeight: 1.4 }}>{hl}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
          {currentRelease.sections?.map((sec, sIdx) => (
            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {sec.category}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sec.items.map((item, iIdx) => (
                  <div
                    key={iIdx}
                    style={{
                      background: 'var(--bg-card, rgba(255, 255, 255, 0.02))',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      <CheckCircle2 size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                      <span>{item.title}</span>
                    </div>
                    <p style={{ margin: '4px 0 0 19px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Build: {BUILD_DATE} · Version {APP_VERSION}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {onOpenSettings && (
              <button
                className="settings-btn secondary sm"
                onClick={() => {
                  handleClose()
                  onOpenSettings()
                }}
              >
                Settings &amp; Keys
              </button>
            )}
            <button className="settings-btn primary sm" onClick={handleClose}>
              Got It
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
