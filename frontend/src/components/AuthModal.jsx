import React, { useState, useEffect } from 'react'
import { User, RefreshCw, ExternalLink } from 'lucide-react'
import { Modal } from './Modal'
import { loginWithGoogle, preloadAuth } from '../api'

// ─── Auth Modal ───
function AuthModal({ onClose, onAuth }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    // Warm up Firebase Auth so user gesture isn't lost to lazy dynamic imports
    preloadAuth().catch(() => {})
  }, [])

  const handleGoogleSignIn = async (options = {}) => {
    setError('')
    setSlow(false)
    setLoading(true)
    if (options.preferRedirect) {
      setRedirecting(true)
    }
    // Never leave the user staring at "Signing in…" with no way out.
    const slowTimer = setTimeout(() => setSlow(true), 12000)
    const hardTimer = setTimeout(() => {
      setLoading(false)
      setSlow(true)
      setError('Sign-in is taking longer than expected. You can retry or switch to full-page sign-in.')
    }, 45000)
    try {
      const user = await loginWithGoogle(options)
      if (!user) {
        // Redirect flow: this page is about to be replaced by Google's.
        setRedirecting(true)
        return
      }
      onAuth(user)
      onClose()
    } catch (err) {
      console.error('[AuthModal] Google Sign-In failed:', err)
      setError(err.message || 'Google Sign-In failed')
    } finally {
      clearTimeout(slowTimer)
      clearTimeout(hardTimer)
      setLoading(false)
    }
  }

  return (
    <Modal title="Sign in to Yogatik" icon={<User size={18} />} onClose={onClose} labelledBy="auth-title">
        <div className="modal-body" style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Sign in with Google to sync your conversation history and back up your custom Provider API Keys to your account.
          </p>
          <button
            className="new-chat-btn"
            onClick={() => handleGoogleSignIn()}
            disabled={loading && !slow}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', minHeight: '44px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
              <path fill="#FBBC05" d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/>
              <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/>
            </svg>
            {redirecting ? 'Opening Google…' : (loading && !slow) ? 'Signing in…' : slow ? 'Retry Sign in with Google' : 'Sign in with Google'}
          </button>
          {slow && !redirecting && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                Still waiting on Google. If popup was blocked or closed:
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleGoogleSignIn({ preferRedirect: true })}
                style={{ width: '100%', fontSize: '12px', padding: '10px 14px', minHeight: '40px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <ExternalLink size={14} /> Try Full-Page Sign-In (Redirect)
              </button>
            </div>
          )}
          {redirecting && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px' }}>
              Taking you to Google. You will come back here signed in — keep this tab open.
            </p>
          )}
        </div>
        {error && <div className="test-result error">{error}</div>}
    </Modal>
  )
}

export { AuthModal }
