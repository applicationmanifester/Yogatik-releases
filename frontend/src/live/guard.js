/**
 * The blind-model trap (LIVE_ROADMAP Horizon 1a): a text-only model plus a
 * camera produces confident nonsense from OCR noise. The app must refuse to
 * turn the camera on for a text-only model — or auto-switch to a vision
 * model — with one line saying why. Pure so it is testable without a call.
 */

/**
 * @param {boolean|null|undefined} modelCanSee resolved vision capability
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function cameraGuard(modelCanSee) {
  if (modelCanSee === false) {
    return {
      allowed: false,
      reason: 'This model cannot see images — turn on the camera with a vision-capable model instead.',
    }
  }
  return { allowed: true, reason: null }
}

/**
 * Horizon 1's final open item (LIVE_ROADMAP 4a): the guard used to only stop
 * at BLOCK. Now, when the ACTIVE model is text-only, it also decides WHETHER
 * an auto-switch is possible — from a candidate list the caller resolved
 * cache-first with vision/capability.js's probe. The network stays in the
 * caller: this is the pure policy, and it gets to see the already-resolved
 * verdict of each candidate, never a pending one.
 *
 * @param {{
 *   canSee?: boolean|null,        // the ACTIVE model's resolved capability
 *   candidates?: Array<{          // resolved verdicts, preference order
 *     model: string,
 *     canSee: boolean|null|undefined,
 *   }>,
 *   allowSwitch?: boolean,        // the liveVisionAutoSwitch preference (default ON)
 * }} input
 * @returns {{ action: 'proceed'|'switch'|'block', model: string|null, reason: string|null }}
 */
export function resolveCameraAction({ canSee, candidates = [], allowSwitch = true } = {}) {
  // Not a KNOWN text-only model — cameraGuard's rule, unchanged: capability
  // unknown is treated as able (the model may still refuse a bad frame).
  if (canSee !== false) return { action: 'proceed', model: null, reason: null }
  // Switching is a preference. Kept OFF, the strict block stands even when a
  // candidate exists — the user asked to keep the guard's teeth.
  if (allowSwitch === false) {
    const block = cameraGuard(false)
    return { action: 'block', model: null, reason: block.reason }
  }
  // Cache-first: a candidate whose capability is already KNOWN (a stored
  // probe verdict, not a name guess) can be switched to with no network.
  const cached = candidates.find(c => c?.model && c.canSee === true)
  if (cached) {
    return { action: 'switch', model: cached.model, reason: null }
  }
  // No vision model reachable (no candidates, offline, or every probe came
  // back "cannot see") — the guard keeps its teeth, same one-line why.
  const block = cameraGuard(false)
  return { action: 'block', model: null, reason: block.reason }
}
