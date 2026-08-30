/**
 * Memory-based proactive check-ins. Turns durable episodic memory into a gentle,
 * optional prompt ("A year ago you started your new job — how's it going?"). The
 * payoff of the four-store memory framework: the companion remembers and follows
 * up, rather than waiting to be asked.
 *
 * Pure suggestion-building (buildCheckin) is separated from storage access
 * (getProactiveCheckin) so it stays testable. Shows at most one per day, is
 * dismissible, and never auto-sends — the user chooses.
 */
import { dueMilestones } from './memory4'

const SEEN_KEY = 'yogatik.proactive.seen' // date-string of last shown check-in
const DAY = 24 * 60 * 60 * 1000

/** Pure: given episodic + emotional items + now, return a check-in suggestion or null. */
export function buildCheckin(episodic = [], emotional = [], now = Date.now()) {
  // If only 2 arguments and 2nd argument is a timestamp:
  if (typeof emotional === 'number') {
    now = emotional
    emotional = []
  }

  const milestones = dueMilestones(episodic, now)
  if (milestones.length) {
    const m = milestones[0]
    const yr = m.years === 1 ? 'A year' : `${m.years} years`
    return {
      kind: 'milestone',
      text: `${yr} ago: "${m.text}". Want to reflect on how that's going?`,
      prompt: `${yr} ago I noted: "${m.text}". Let's check in on how that has gone since then.`,
    }
  }

  // High-salience emotional context (within 5 days) → gentle check-in
  const emo = (emotional || [])
    .filter(e => e.at && (now - e.at) < 5 * DAY && (e.importance ?? 0.5) >= 0.7)
    .sort((a, b) => b.at - a.at)[0]
  if (emo) {
    return {
      kind: 'emotional_followup',
      text: `Thinking back to "${emo.text}" — how are you feeling about that today?`,
      prompt: `Regarding "${emo.text}" — how is that going now?`,
    }
  }

  // Recent high-salience episodic event (within a week) → light follow-up.
  const recent = (episodic || [])
    .filter(e => e.at && (now - e.at) < 7 * DAY && (e.importance ?? 0.5) >= 0.6)
    .sort((a, b) => b.at - a.at)[0]
  if (recent) {
    return {
      kind: 'followup',
      text: `Earlier you mentioned "${recent.text}". Want to talk about it?`,
      prompt: `Earlier I mentioned "${recent.text}". Can we pick that back up?`,
    }
  }
  return null
}

function shownToday(now = Date.now()) {
  try {
    const last = localStorage.getItem(SEEN_KEY)
    return last && (now - Number(last)) < DAY
  } catch { return false }
}
export function markCheckinShown(now = Date.now()) {
  try { localStorage.setItem(SEEN_KEY, String(now)) } catch { /* private */ }
}

/**
 * Storage-backed: returns a check-in suggestion for the UI, or null if there is
 * nothing due or one was already shown today. Never throws.
 */
export async function getProactiveCheckin() {
  if (shownToday()) return null
  try {
    const { allMemories } = await import('./memory4')
    const episodic = await allMemories('episodic')
    const emotional = await allMemories('emotional')
    return buildCheckin(episodic, emotional)
  } catch { return null }
}
