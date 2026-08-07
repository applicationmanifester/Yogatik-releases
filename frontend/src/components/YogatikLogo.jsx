import React from 'react'

// ─── Logo ───
function YogatikLogo({ size = 24 }) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width={size} height={size} style={{ flexShrink: 0 }}>
      {!isDark ? <rect width="192" height="192" rx="40" fill="#ffffff"/> : null}
      <circle cx="96" cy="80" r="36" fill="none" stroke="#ff6b35" strokeWidth="6"/>
      <circle cx="82" cy="72" r="5" fill="#ff6b35"/>
      <circle cx="110" cy="72" r="5" fill="#ff6b35"/>
      <path d="M78 90 q18 16 36 0" fill="none" stroke="#ff6b35" strokeWidth="4" strokeLinecap="round"/>
      <rect x="60" y="130" width="72" height="8" rx="4" fill="#ff6b35" opacity="0.6"/>
      <rect x="72" y="146" width="48" height="6" rx="3" fill="#ff6b35" opacity="0.3"/>
    </svg>
  )
}

export { YogatikLogo }
