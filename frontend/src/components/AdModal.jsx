import React, { useState, useEffect, useRef } from 'react'

// ─── Ad Modal (Google AdSense interstitial) ───
function AdModal({ onClose }) {
  const [countdown, setCountdown] = useState(5)
  const adRef = useRef(null)

  useEffect(() => {
    // Push ad to AdSense slot
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={countdown <= 0 ? onClose : undefined}>
      <div className="modal ad-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, textAlign: 'center' }}>
        <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none', padding: '16px 16px 4px' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Yogatik is free — ads keep it running</span>
        </div>
        <div style={{ padding: '8px 16px 16px', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Google AdSense Ad Unit — replace data-ad-slot with your slot ID */}
          <ins className="adsbygoogle"
            ref={adRef}
            style={{ display: 'block', width: '100%', minHeight: 250 }}
            data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
            data-ad-slot="XXXXXXXXXX"
            data-ad-format="auto"
            data-full-width-responsive="true" />
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <button
            className="btn-primary"
            onClick={onClose}
            disabled={countdown > 0}
            style={{ width: '100%', padding: '10px', fontSize: 14, opacity: countdown > 0 ? 0.5 : 1 }}
          >
            {countdown > 0 ? `Continue in ${countdown}s` : 'Continue Chatting'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { AdModal }
