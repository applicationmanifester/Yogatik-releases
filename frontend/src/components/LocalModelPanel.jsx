import React, { useState, useEffect } from 'react'
import { Cpu, Download, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  LOCAL_MODELS, DEFAULT_LOCAL_MODEL, webGpuDetails, loadLocalModel,
  isLocalReady, isLocalModelCached, clearLocalModelCache, unloadLocalModel,
} from '../localLLM'

/**
 * Consent-first download UI. The weights are hundreds of megabytes, so the
 * size, the source and the fact that it is one-time are stated before any
 * request is made — never an automatic background download.
 */
export function LocalModelPanel({ model = DEFAULT_LOCAL_MODEL, onModelChange, onReady }) {
  const [gpu, setGpu] = useState(null)
  const [cached, setCached] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(isLocalReady(model))
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Probe only. This panel is mounted (hidden) with the settings sidebar, so
  // anything heavier than a probe here is a download nobody asked for: it used
  // to "auto-preload", i.e. pull 350MB+ on page load.
  useEffect(() => {
    let live = true
    setReady(isLocalReady(model))
    webGpuDetails().then(async (g) => {
      if (!live) return
      setGpu(g)
      if (g?.available) {
        const isC = await isLocalModelCached()
        if (live) setCached(isC)
      }
    }).catch(() => {})
    return () => { live = false }
  }, [model])

  const info = LOCAL_MODELS[model] || LOCAL_MODELS[DEFAULT_LOCAL_MODEL]

  const start = async () => {
    setBusy(true); setError(''); setProgress({ progress: 0, text: 'Starting…' })
    try {
      await loadLocalModel(model, setProgress)
      setReady(true); setCached(true)
      onReady?.(model)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false); setProgress(null)
    }
  }

  const forget = async () => {
    await clearLocalModelCache()
    setCached(false); setReady(false); setConfirmDelete(false)
  }

  if (gpu && !gpu.available) {
    return (
      <div className="local-panel local-unavailable">
        <div className="local-head"><AlertTriangle size={13} /> On-device LLM needs a GPU</div>
        <p className="local-note">{gpu.reason}</p>
        <p className="local-note">
          This only affects the on-device <em>chat model</em> (it runs on WebGPU). Other on-device
          features still work on CPU: the Kokoro voice, Whisper transcription, semantic search and
          image reading. To enable the local LLM, turn on hardware acceleration in your browser
          settings and reload — or just add a free cloud provider key (Groq, Gemini, NVIDIA).
        </p>
      </div>
    )
  }

  return (
    <div className="local-panel">
      <div className="local-head">
        <Cpu size={13} /> On-device model
        {ready && <span className="local-badge ready"><CheckCircle2 size={11} /> loaded</span>}
        {!ready && cached && <span className="local-badge">downloaded</span>}
      </div>

      <select value={model} onChange={e => onModelChange?.(e.target.value)} disabled={busy}
        aria-label="On-device model">
        {Object.entries(LOCAL_MODELS).map(([id, m]) => (
          <option key={id} value={id}>{m.label} — {m.size}</option>
        ))}
      </select>
      <p className="local-note">{info.note}</p>

      {!ready && !busy && (
        <>
          <p className="local-consent">
            Downloads <strong>{info.size}</strong> of model files from the MLC/Hugging Face CDN,
            once. They are cached by your browser, so later sessions start instantly and work
            with <strong>no API key and no internet connection</strong>. Nothing you type is sent
            anywhere — the model runs on your GPU.
          </p>
          <button className="small-btn btn-primary local-download" onClick={start}>
            <Download size={12} /> {cached ? 'Load model' : `Download and run (${info.size})`}
          </button>
          {!cached && <span className="local-warn">Avoid this on mobile data.</span>}
        </>
      )}

      {busy && (
        <div className="local-progress">
          <div className="local-bar"><div className="local-bar-fill" style={{ width: `${Math.round((progress?.progress || 0) * 100)}%` }} /></div>
          <span className="local-progress-text">{progress?.text || 'Working…'}</span>
        </div>
      )}

      {ready && (
        <div className="local-actions">
          <button className="small-btn" onClick={() => { unloadLocalModel(); setReady(false) }}>
            Unload from memory
          </button>
          {confirmDelete ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Delete model files?</span>
              <button className="small-btn" style={{ color: '#ff6b6b' }} onClick={forget}>Yes, delete</button>
              <button className="small-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </span>
          ) : (
            <button className="small-btn" onClick={() => setConfirmDelete(true)} style={{ color: '#ff6b6b' }}>
              <Trash2 size={11} /> Delete files
            </button>
          )}
        </div>
      )}

      {error && <div className="local-error">{error}</div>}
    </div>
  )
}
