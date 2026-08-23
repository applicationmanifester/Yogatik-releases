import React, { useEffect, useRef, useState } from 'react'
import { isDesktop } from '../tools/localFs'

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || 'ca-pub-8240433260986072'
const AD_SLOT = import.meta.env.VITE_ADSENSE_SLOT || '1098428395'
export const adsAvailable = !!AD_CLIENT && !isDesktop()

/**
 * Responsive Google AdSense Banner Component
 * Policy-compliant: Only renders on web (disabled on Electron native desktop),
 * handles ad blocker suppression, and fails silently without layout disruption.
 */
export function AdSenseBanner({
  slot = AD_SLOT,
  format = 'auto',
  responsive = true,
  style = {},
  className = '',
  label = 'Advertisement',
}) {
  const [adLoaded, setAdLoaded] = useState(false)
  const adRef = useRef(null)
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!adsAvailable || pushedRef.current) return
    try {
      if (typeof window !== 'undefined') {
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
        pushedRef.current = true
        setAdLoaded(true)
      }
    } catch {
      // Gracefully ignore ad blocker or network errors
    }
  }, [])

  if (!adsAvailable || !AD_CLIENT) return null

  return (
    <div
      className={`adsense-wrapper ${className}`}
      style={{
        width: '100%',
        margin: '12px 0',
        padding: '8px',
        borderRadius: 8,
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        textAlign: 'center',
        overflow: 'hidden',
        ...style,
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted, rgba(255, 255, 255, 0.35))',
            marginBottom: 4,
          }}
        >
          {label}
        </div>
      )}
      <ins
        className="adsbygoogle"
        ref={adRef}
        style={{ display: 'block', minHeight: 60 }}
        data-ad-client={AD_CLIENT}
        {...(slot ? { 'data-ad-slot': slot } : {})}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </div>
  )
}

export default AdSenseBanner
