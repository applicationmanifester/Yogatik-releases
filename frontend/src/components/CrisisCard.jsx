import React from 'react'
import { Heart, X } from 'lucide-react'

/**
 * Soft, non-blocking crisis-support card. Surfaced when the on-device safety
 * screen (safety.js) flags distress — it sits above the composer alongside the
 * model's warm reply, never replacing it. Dismissible, calm styling, no alarm.
 *
 * @param {{title:string, body:string, type:string}} card
 * @param {() => void} onDismiss
 */
export default function CrisisCard({ card, onDismiss }) {
  if (!card) return null
  return (
    <div className="crisis-card" role="complementary" aria-label="Support resources">
      <div className="crisis-card-icon" aria-hidden="true"><Heart size={16} /></div>
      <div className="crisis-card-body">
        <div className="crisis-card-title">{card.title}</div>
        <div className="crisis-card-text">{card.body}</div>
      </div>
      <button className="crisis-card-dismiss" onClick={onDismiss} aria-label="Dismiss support resources" title="Dismiss">
        <X size={13} />
      </button>
    </div>
  )
}
