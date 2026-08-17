import React, { useState, useEffect, useRef } from 'react'

// Configure in frontend/.env to enable ads:
//   VITE_ADSENSE_CLIENT=ca-pub-1234567890123456
//   VITE_ADSENSE_SLOT=1234567890
// Left unset, the interstitial never renders. Requesting a placeholder slot
// made AdSense return 410 Gone and showed the user an empty box.
const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || 'ca-pub-8240433260986072'
const AD_SLOT = import.meta.env.VITE_ADSENSE_SLOT || '1098428395'
export const adsConfigured = !!AD_CLIENT && !!AD_SLOT

// ─── Ad Modal (Google AdSense interstitial) ───
function AdModal({ onClose }) {
  const [countdown, setCountdown] = useState(5)
  const adRef = useRef(null)

  useEffect(() => {
    if (!adsConfigured) return
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // Nothing to show without a real slot. Guard sits after the hooks so the
  // hook order stays identical on every render.
  if (!adsConfigured) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={countdown <= 0 ? onClose : undefined}>
      <div className="modal ad-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, textAlign: 'center', background: 'var(--bg-surface, #181825)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, overflow: 'hidden' }}>
        <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none', padding: '16px 16px 4px' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Yogatik is free — ads keep it running</span>
        </div>
        <div style={{ padding: '8px 16px 16px', minHeight: 260, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Background Placeholder when AdSense is pending approval or loading */}
          <div style={{
            position: 'absolute', inset: '8px 16px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 0,
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(255,107,53,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Google AdSense</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', maxWidth: 280 }}>
              {AD_SLOT ? 'Loading advertisement…' : 'Ads will display here once your AdSense slot is active & approved.'}
            </div>
          </div>

          {/* Google AdSense Ad Unit */}
          <ins className="adsbygoogle"
            ref={adRef}
            style={{ display: 'block', width: '100%', minHeight: 250, position: 'relative', zIndex: 1 }}
            data-ad-client={AD_CLIENT}
            {...(AD_SLOT ? { 'data-ad-slot': AD_SLOT } : {})}
            data-ad-format="auto"
            data-full-width-responsive="true" />
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <button
            className="btn-primary"
            onClick={onClose}
            disabled={countdown > 0}
            style={{ width: '100%', padding: '10px', fontSize: 14, opacity: countdown > 0 ? 0.6 : 1, transition: 'all 0.2s' }}
          >
            {countdown > 0 ? `Continue in ${countdown}s` : 'Continue Chatting'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { AdModal }
