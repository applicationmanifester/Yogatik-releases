import React, { useEffect, useRef, useState } from 'react'
import { isDesktop } from '../tools/localFs'
import { isPro, onEntitlementChange } from '../entitlement'

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || 'ca-pub-8240433260986072'
const AD_SLOT = import.meta.env.VITE_ADSENSE_SLOT || '1098428395'
export const adsAvailable = !!AD_CLIENT && !isDesktop()

let scriptInjected = false

export function loadAdSenseWhenIdle() {
  // A paying customer's browser must never fetch the ad script at all. Hiding
  // the slot with CSS would still load Google's script, still let it set
  // cookies and still let it walk the DOM (see shellGuard.js) — "no ads" has
  // to mean no ad network, not an invisible one.
  if (!adsAvailable || isPro() || typeof window === 'undefined' || scriptInjected) return
  const inject = () => {
    if (scriptInjected || document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) {
      scriptInjected = true
      return
    }
    const script = document.createElement('script')
    script.async = true
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`
    script.crossOrigin = 'anonymous'
    document.head.appendChild(script)
    scriptInjected = true
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(inject, { timeout: 2500 })
  } else {
    setTimeout(inject, 1200)
  }
}

/**
 * Responsive Google AdSense Banner Component
 * Policy-compliant: Only renders on web (disabled on Electron native desktop),
 * handles ad blocker suppression, and fails silently without layout disruption.
 */
export function AdSenseBanner({
  slot = AD_SLOT,
  format = 'auto',
  // Full-width-responsive is what makes adsbygoogle.js walk up the tree
  // un-constraining ancestors so it can claim the page width. In a 272px
  // sidebar there is no width to claim, and the walk wrecked the shell
  // (see shellGuard.js), so it stays off unless a caller asks for it.
  responsive = false,
  height = 100,
  style = {},
  className = '',
  label = 'Advertisement',
}) {
  const [adLoaded, setAdLoaded] = useState(false)
  // No fill, an ad blocker or an offline first run all leave the slot empty.
  // Reserving 140px of a 272px sidebar for a labelled blank rectangle is worse
  // than showing nothing, so the whole wrapper folds away instead.
  const [unfilled, setUnfilled] = useState(false)
  const adRef = useRef(null)
  const pushedRef = useRef(false)
  // Re-read on change, not once at mount: entitlement resolves asynchronously
  // after sign-in, so a Pro user who lands on the page signed out would
  // otherwise keep the ad slot for the rest of the session.
  const [pro, setPro] = useState(() => isPro())
  useEffect(() => onEntitlementChange(() => setPro(isPro())), [])

  useEffect(() => {
    if (!adsAvailable || pro || pushedRef.current) return
    loadAdSenseWhenIdle()
    try {
      // Ask about THIS component's own <ins>, not a global query.
      //
      // MEASURED in the field: "TagError: adsbygoogle.push() error: All 'ins'
      // elements in the DOM with class=adsbygoogle already have ads in them."
      // A document-wide `querySelectorAll` answers about somebody else's slot,
      // so an already-filled banner elsewhere let this one push again — and one
      // push({}) fills exactly ONE ins, so a page with two slots and two
      // pushes double-fills the first and starves the second.
      //
      // The rule AdSense actually wants: one push per <ins>, after that <ins>
      // is in the DOM, never twice for the same one.
      const el = adRef.current
      if (typeof window !== 'undefined' && el && !el.getAttribute('data-adsbygoogle-status')) {
        // Claim the slot BEFORE pushing. React 18 StrictMode double-invokes
        // effects in development, and the second invocation would otherwise
        // race the first and throw this exact TagError.
        pushedRef.current = true
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
        setAdLoaded(true)
      }
    } catch {
      // An ad blocker, a duplicate tag, or a script that never loaded. None of
      // them is worth a crash; the slot folds away below if it stays unfilled.
    }
    // AdSense stamps data-ad-status="filled" | "unfilled" once it has decided.
    const t = setTimeout(() => {
      const status = adRef.current?.getAttribute('data-ad-status')
      if (status !== 'filled') setUnfilled(true)
    }, 4000)
    return () => clearTimeout(t)
  }, [pro])

  if (!adsAvailable || !AD_CLIENT || pro || unfilled) return null

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
        // A hard box: whatever the ad decides to be, it cannot push the
        // surrounding layout around.
        overflow: 'hidden',
        contain: 'layout paint',
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
        style={{ display: 'block', width: '100%', height, minHeight: 60 }}
        data-ad-client={AD_CLIENT}
        {...(slot ? { 'data-ad-slot': slot } : {})}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </div>
  )
}

export default AdSenseBanner
