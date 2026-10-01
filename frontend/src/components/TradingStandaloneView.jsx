import React, { useEffect } from 'react'
import { TradingModal } from './TradingModal'

export default function TradingStandaloneView() {
  useEffect(() => {
    document.title = 'Yogatik Stock Trading Terminal (NSE / BSE & Paper Trading)'
    document.documentElement.setAttribute('data-stock-trading', '1')
    const theme = localStorage.getItem('yogatik_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    document.body.className = theme

    return () => {
      document.documentElement.removeAttribute('data-stock-trading')
    }
  }, [])

  const handleClose = () => {
    if (window.__YOGATIK_DESKTOP__?.closeTradingTerminal) {
      window.__YOGATIK_DESKTOP__.closeTradingTerminal()
    } else {
      window.close()
    }
  }

  return (
    <div className="trading-standalone-root">
      <TradingModal
        isOpen={true}
        isStandalone={true}
        onClose={handleClose}
      />
    </div>
  )
}
