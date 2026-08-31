import React, { useState, useEffect, useCallback } from 'react'
import { Cpu, FolderOpen, Play, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { comfyStatus, setComfyRoot, startComfy, isDesktopWithComfy } from '../comfy'

/**
 * Local generation status card. Desktop-only — renders nothing on web, same
 * as the rest of Personalise's desktop-gated sections. Mirrors LocalModelPanel's
 * consent-first, probe-only-on-mount shape (no auto-download, no auto-spawn
 * without a folder the user picked).
 */
export function ComfyPanel() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const s = await comfyStatus()
    setStatus(s)
    return s
  }, [])

  useEffect(() => {
    if (!isDesktopWithComfy()) return
    refresh()
  }, [refresh])

  if (!isDesktopWithComfy()) return null

  const pickFolder = async () => {
    const d = window.__YOGATIK_DIALOG__
    if (!d) return
    setBusy(true); setError('')
    try {
      const picked = await d.pickFolder({ title: 'Select your ComfyUI folder' })
      if (!picked?.success) return
      const r = await setComfyRoot(picked.path)
      if (!r.ok) { setError(r.error || 'That folder does not look like a ComfyUI install.'); return }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    setBusy(true); setError('')
    try {
      const r = await startComfy()
      if (!r.ok) { setError(r.error || 'Could not start ComfyUI.'); return }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const s = status
  const checkpointCount = (s?.checkpoints?.length || 0) + (s?.svdCheckpoints?.length || 0)

  return (
    <div className="local-panel">
      <div className="local-head">
        <Cpu size={13} /> Local generation (ComfyUI)
        {s?.running && <span className="local-badge ready"><CheckCircle2 size={11} /> running</span>}
        {!s?.running && s?.root && <span className="local-badge">configured</span>}
      </div>

      <p className="local-note">
        Optional. Point Yogatik at a ComfyUI install to generate images and image-to-video clips
        with your own local checkpoints, entirely on your GPU — no API key, nothing leaves this
        machine. image_generate and video_render keep working with no setup either way.{' '}
        {!s?.root && <a href="https://www.comfy.org" target="_blank" rel="noopener noreferrer">Get ComfyUI</a>}
      </p>

      {s?.root && (
        <p className="local-note" style={{ opacity: 0.8, wordBreak: 'break-all' }}>
          Folder: <code>{s.root}</code>
        </p>
      )}

      {s?.running && (
        <p className="local-note">
          {checkpointCount
            ? `${s.checkpoints.length} checkpoint${s.checkpoints.length === 1 ? '' : 's'} for images, ${s.svdCheckpoints.length} SVD checkpoint${s.svdCheckpoints.length === 1 ? '' : 's'} for image-to-video.`
            : 'Running, but no checkpoints found — place model files in ComfyUI\'s models/checkpoints folder.'}
        </p>
      )}

      <div className="local-actions">
        <button className="small-btn" onClick={pickFolder} disabled={busy}>
          <FolderOpen size={12} /> {s?.root ? 'Change folder' : 'Point at ComfyUI folder'}
        </button>
        {s?.root && !s?.running && (
          <button className="small-btn btn-primary" onClick={start} disabled={busy}>
            <Play size={12} /> Start ComfyUI
          </button>
        )}
        <button className="small-btn" onClick={refresh} disabled={busy} title="Re-check status">
          <RefreshCw size={12} />
        </button>
      </div>

      {error && <div className="local-error"><AlertTriangle size={11} /> {error}</div>}
    </div>
  )
}
