import React from 'react'

/**
 * A visually-hidden aria-live region for screen-reader announcements.
 *
 * Two regions:
 *   - **polite** (aria-live="polite"): "Response ready", "Tool completed"
 *   - **assertive** (aria-live="assertive"): Errors, permission prompts, critical failures
 *
 * Deliberately NOT wired to the streaming text — announcing every token floods
 * a screen reader. Callers use the module-level announce() / announceAssertive()
 * for discrete events only (completion, errors).
 */
let _set = null
let _queued = null
let _setAssertive = null
let _queuedAssertive = null

/** Announce a short message politely. Safe before mount (queues the latest). */
export function announce(message) {
  const m = String(message || '')
  if (_set) _set(m)
  else _queued = m
}

/** Announce a high-priority message assertively (errors, permission denials). */
export function announceAssertive(message) {
  const m = String(message || '')
  if (_setAssertive) _setAssertive(m)
  else _queuedAssertive = m
}

export default function A11yAnnouncer() {
  const [msg, setMsg] = React.useState('')
  const [assertiveMsg, setAssertiveMsg] = React.useState('')
  React.useEffect(() => {
    _set = setMsg
    _setAssertive = setAssertiveMsg
    if (_queued != null) { setMsg(_queued); _queued = null }
    if (_queuedAssertive != null) { setAssertiveMsg(_queuedAssertive); _queuedAssertive = null }
    return () => { _set = null; _setAssertive = null }
  }, [])
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{msg}</div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{assertiveMsg}</div>
    </>
  )
}

