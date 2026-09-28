import React, { useEffect, useState } from 'react'

// ─── Logo ───
// Geometry is shared with public/icon-192.svg, icon-512.svg and icon-light.svg.
// Change one, change all four, or the favicon stops matching the app.
//
// The face and bars were scaled up ~1.28x: the artwork previously spanned
// y 44-152 of a 192 viewBox, so it read small and floaty at the 24-28px sizes
// it is actually used at. It now fills y 27-165, optically centred.
//
// NOTE: Theme detection uses a MutationObserver so the logo re-renders when the
// user switches themes, and is safe in packaged Electron builds where
// document.documentElement may not have the attribute set on first synchronous
// render.
function getThemeIsDark() {
  try {
    return document.documentElement.getAttribute('data-theme') !== 'light'
  } catch {
    return true // default dark in Electron / SSR contexts
  }
}

function YogatikLogo({ size = 24 }) {
  const [isDark, setIsDark] = useState(getThemeIsDark)

  useEffect(() => {
    // Re-read immediately in case the attribute was set between the initial
    // synchronous call above and the first effect flush.
    setIsDark(getThemeIsDark())

    const observer = new MutationObserver(() => setIsDark(getThemeIsDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width={size} height={size} style={{ flexShrink: 0 }}>
      {!isDark ? <rect width="192" height="192" rx="40" fill="#ffffff"/> : null}
      <circle cx="96" cy="76" r="46" fill="none" stroke="#ff6b35" strokeWidth="7"/>
      <circle cx="78" cy="64" r="6.5" fill="#ff6b35"/>
      <circle cx="114" cy="64" r="6.5" fill="#ff6b35"/>
      <path d="M73 87 q23 20 46 0" fill="none" stroke="#ff6b35" strokeWidth="5" strokeLinecap="round"/>
      <rect x="48" y="134" width="96" height="11" rx="5.5" fill="#ff6b35" opacity="0.6"/>
      <rect x="66" y="156" width="60" height="9" rx="4.5" fill="#ff6b35" opacity="0.3"/>
    </svg>
  )
}

export { YogatikLogo }
