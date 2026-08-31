import React, { useCallback, useEffect, useState } from 'react'
import { Camera, Mic, RefreshCw, Check, X } from 'lucide-react'
import { enumerate, onDeviceChange, primeDeviceLabels, canFlipCamera } from '../live/devices'

/**
 * Choose which camera and microphone the call uses.
 *
 * Two things this has to get right, both of which are invisible when wrong:
 *
 *  - Device LABELS are empty until the user has granted permission at least
 *    once, so a picker opened before that shows a list of blanks. It asks for
 *    permission and releases the stream immediately rather than listing
 *    "Camera 1 / Camera 2".
 *  - A headset unplugged mid-call silently moves the microphone, so the list
 *    subscribes to `devicechange` instead of being read once on open.
 *
 * Sized for a phone first: full-width rows with a 44px touch target, and it
 * docks to the bottom of the screen rather than floating in the middle where a
 * thumb cannot reach it.
 */
export function LiveDevicePicker({ open, onClose, onPick, currentCameraId, currentMicId, micSwitchable = true }) {
  const [devices, setDevices] = useState({ cameras: [], mics: [], needsPermission: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const refresh = useCallback(async () => {
    const d = await enumerate()
    setDevices(d)
    return d
  }, [])

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    ;(async () => {
      const d = await refresh()
      // Only prompt when the list is genuinely unreadable — asking every time
      // the sheet opens would flash the recording indicator for no reason.
      if (alive && d.needsPermission) {
        await primeDeviceLabels({ video: true, audio: true })
        if (alive) await refresh()
      }
    })()
    const off = onDeviceChange((d) => { if (alive) setDevices(d) })
    return () => { alive = false; off() }
  }, [open, refresh])

  const pick = async (kind, deviceId) => {
    setBusy(true); setErr(null)
    try {
      const res = await onPick?.(kind, deviceId)
      // A refusal is a RESULT — cascade cannot switch mics at all, and saying
      // nothing there looks exactly like a switch that did not take.
      if (res && res.success === false) setErr(res.error || 'Could not switch device.')
    } catch (e) {
      setErr(e?.message || 'Could not switch device.')
    } finally { setBusy(false) }
  }

  if (!open) return null

  const row = (d, kind, currentId) => (
    <button
      key={`${kind}-${d.deviceId || d.label}`}
      className={`ldp-row${d.deviceId && d.deviceId === currentId ? ' active' : ''}`}
      onClick={() => pick(kind, d.deviceId)}
      disabled={busy}
    >
      <span className="ldp-label">{d.label}</span>
      {d.facing === 'environment' && <span className="ldp-tag">Back</span>}
      {d.facing === 'user' && <span className="ldp-tag">Front</span>}
      {d.deviceId && d.deviceId === currentId && <Check size={15} className="ldp-check" />}
    </button>
  )

  return (
    <div className="ldp-backdrop" onClick={onClose} role="presentation">
      <div className="ldp-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Camera and microphone">
        <div className="ldp-head">
          <span>Camera &amp; microphone</span>
          <div className="ldp-head-actions">
            <button className="icon-btn" onClick={refresh} title="Rescan devices" aria-label="Rescan devices">
              <RefreshCw size={15} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="ldp-group">
          <div className="ldp-group-title"><Camera size={13} /> Camera</div>
          {devices.cameras.length
            ? devices.cameras.map(d => row(d, 'camera', currentCameraId))
            : <p className="ldp-empty">No camera found.</p>}
        </div>

        <div className="ldp-group">
          <div className="ldp-group-title"><Mic size={13} /> Microphone</div>
          {!micSwitchable && (
            <p className="ldp-empty">
              This engine uses your system default microphone — browser speech recognition
              cannot be pointed at a specific device.
            </p>
          )}
          {micSwitchable && (devices.mics.length
            ? devices.mics.map(d => row(d, 'mic', currentMicId))
            : <p className="ldp-empty">No microphone found.</p>)}
        </div>

        {err && <p className="ldp-error">{err}</p>}
      </div>
    </div>
  )
}

export { canFlipCamera }
