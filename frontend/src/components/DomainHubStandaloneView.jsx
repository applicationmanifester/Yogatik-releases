import React, { useEffect, useState, useCallback } from 'react'
import { DomainHubModal } from './DomainHubModal'

export default function DomainHubStandaloneView() {
  const [toastMsg, setToastMsg] = useState(null)

  useEffect(() => {
    document.title = 'Yogatik Domain & Social Intelligence Hub (YouTube, X, Jobs, Trends)'
    document.documentElement.setAttribute('data-domain-hub', '1')
    const theme = localStorage.getItem('yogatik_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    document.body.className = theme

    return () => {
      document.documentElement.removeAttribute('data-domain-hub')
    }
  }, [])

  const handleClose = () => {
    if (window.__YOGATIK_DESKTOP__?.closeDomainHub) {
      window.__YOGATIK_DESKTOP__.closeDomainHub()
    } else {
      window.close()
    }
  }

  const handleExecutePrompt = useCallback(async (promptText) => {
    if (window.__YOGATIK_DESKTOP__?.sendPromptToMain) {
      try {
        await window.__YOGATIK_DESKTOP__.sendPromptToMain(promptText)
        setToastMsg('Prompt sent to Yogatik AI in main chat window!')
        setTimeout(() => setToastMsg(null), 3000)
        return
      } catch (err) {
        console.warn('Failed to forward prompt to main window:', err)
      }
    }
    // Web fallback
    setToastMsg(`Copied query to clipboard: "${promptText.slice(0, 40)}..."`)
    navigator.clipboard?.writeText(promptText)
    setTimeout(() => setToastMsg(null), 3000)
  }, [])

  return (
    <div className="domain-hub-standalone-root">
      <DomainHubModal
        isOpen={true}
        isStandalone={true}
        onClose={handleClose}
        onExecutePrompt={handleExecutePrompt}
      />
      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#f8fafc',
          padding: '10px 18px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          fontSize: '13px',
          fontWeight: 500,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          zIndex: 99999,
          pointerEvents: 'none',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
