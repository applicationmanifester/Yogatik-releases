import React from 'react'

/**
 * A single visually-hidden aria-live region for polite, occasional screen-reader
 * announcements ("Response ready", "Tool failed"). Deliberately NOT wired to the
 * streaming text — announcing every token floods a screen reader. Callers use the
 * module-level announce() for discrete events only (completion, errors).
 */
let _set = null
let _queued = null

/** Announce a short message politely. Safe before mount (queues the latest). */
export function announce(message) {
  const m = String(message || '')
  if (_set) _set(m)
  else _queued = m
}

export default function A11yAnnouncer() {
  const [msg, setMsg] = React.useState('')
  React.useEffect(() => {
    _set = setMsg
    if (_queued != null) { setMsg(_queued); _queued = null }
    return () => { _set = null }
  }, [])
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{msg}</div>
  )
}
