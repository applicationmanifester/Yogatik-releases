import React, { useState, useEffect } from 'react'
import { Sparkles, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getChromeAIAvailability, triggerChromeAIDownload } from '../chromeAI'

/**
 * Consent-first download/status UI for the `chromeai` provider (Chrome's
 * built-in Gemini Nano), mirroring LocalModelPanel's shape for WebLLM's
 * `local` provider — same reason: picking a provider from ProviderPicker's
 * quick-switch dropdown, or from SettingsModal's own provider grid, used to
 * activate it with NOTHING shown here, so the very first sign of a download
 * (WebLLM: 350MB-1.7GB; here: Chrome's own on-device weights, size undisclosed
 * by the Prompt API) was the chat's own small status line mid-turn — exactly
 * the "a download is a decision, not a fallback" rule this app applies
 * everywhere else, silently skipped for the one path a user actually takes
 * to switch providers. This panel is that missing decision point.
 *
 * Unlike WebLLM, Yogatik never fetches these weights itself — Chrome does,
 * outside this app's control — so there is no "delete files" affordance here:
 * managing that cache is Chrome's own settings, not this app's.
 */
export function ChromeAIPanel({ onReady }) {
  const [avail, setAvail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  // Probe only — getChromeAIAvailability() never creates a session, so
  // mounting this (even inside a provider card nobody has picked yet) can
  // never itself trigger a download.
  useEffect(() => {
    let live = true
    getChromeAIAvailability().then(a => { if (live) setAvail(a) }).catch(() => {})
    return () => { live = false }
  }, [])

  const start = async () => {
    setBusy(true); setError(''); setProgress(0)
    try {
      await triggerChromeAIDownload(setProgress)
      const fresh = await getChromeAIAvailability()
      setAvail(fresh)
      onReady?.()
    } catch (e) {
      setError(e?.message || 'Could not start Chrome’s on-device model.')
    } finally {
      setBusy(false)
    }
  }

  if (!avail) return null // probing — nothing to show yet, no flash of a wrong state

  if (avail.state === 'unsupported' || avail.state === 'unavailable' || avail.state === 'error') {
    return (
      <div className="local-panel local-unavailable">
        <div className="local-head"><AlertTriangle size={13} /> Chrome built-in AI isn&apos;t available here</div>
        <p className="local-note">{avail.reason}</p>
      </div>
    )
  }

  return (
    <div className="local-panel">
      <div className="local-head">
        <Sparkles size={13} /> Chrome built-in AI (Gemini Nano)
        {avail.state === 'available' && <span className="local-badge ready"><CheckCircle2 size={11} /> ready</span>}
      </div>

      {avail.state === 'available' && !busy && (
        <p className="local-note">
          Already on this device — Chrome manages it, so Yogatik fetched nothing to get here.
          Works offline, with no API key and nothing sent anywhere.
        </p>
      )}

      {(avail.state === 'downloadable' || avail.state === 'downloading') && !busy && (
        <>
          <p className="local-consent">
            Chrome hasn&apos;t downloaded its on-device model yet. It downloads once, managed and
            cached by Chrome itself (not by Yogatik) — later sessions and other sites that use it
            start instantly. Nothing you type is sent anywhere; it runs on this device.
          </p>
          <button className="small-btn btn-primary local-download" onClick={start}>
            <Download size={12} /> Download and enable
          </button>
        </>
      )}

      {busy && (
        <div className="local-progress">
          <div className="local-bar"><div className="local-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span className="local-progress-text">Downloading ({Math.round(progress * 100)}%)…</span>
        </div>
      )}

      {error && <div className="local-error">{error}</div>}
    </div>
  )
}
