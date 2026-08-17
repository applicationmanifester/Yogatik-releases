/**
 * Optional features and personal touches.
 *
 * Everything here is small: a button someone never presses, a voice they do not
 * like, a buzz they find annoying. Individually trivial, collectively the
 * difference between an app that feels like yours and one that feels like a
 * demo. They live in one place so the UI has a single source of truth and the
 * defaults cannot drift apart between components.
 *
 * Anything switched off here is not hidden with CSS — it is not rendered, and
 * where relevant its tool is not offered to the model either.
 */

export const FEATURES = {
  compare: {
    label: 'Compare models',
    hint: 'Send one prompt to two models side by side',
    default: true,
  },
  live: {
    label: 'Live calls',
    hint: 'Face-to-face voice and video conversation',
    default: true,
  },
  artifacts: {
    label: 'Artifact panel',
    hint: 'Open generated code and documents in a side panel',
    default: true,
  },
  toolCards: {
    label: 'Tool result cards',
    hint: 'Show what each tool returned, not just the answer',
    default: true,
  },
  usage: {
    label: 'Usage meter',
    hint: 'Estimated tokens used today, per provider',
    default: true,
  },
  suggestions: {
    label: 'Starter suggestions',
    hint: 'Prompt ideas on an empty conversation',
    default: true,
  },
  enhance: {
    label: 'Enhance prompt',
    hint: 'Rewrite your draft before sending it',
    default: true,
  },
  haptics: {
    label: 'Haptic feedback',
    hint: 'Short vibration on call controls (phones only)',
    default: true,
  },
  liveCaptions: {
    label: 'Live captions',
    hint: 'Subtitles over the call',
    default: true,
  },
  localVision: {
    label: 'On-device vision',
    hint: 'Lets images work without a vision provider. Downloads ~230MB once',
    default: false,
  },
  autoScan: {
    label: 'Auto-scan in calls',
    hint: 'Periodically send a frame so the model keeps up with what changed',
    default: false,
  },
  liveWatchAlways: {
    label: 'Watch continuously in calls',
    hint: 'The model sees the camera/screen on every turn — even text-only models, described on-device',
    default: false,
  },
  semanticSearch: {
    label: 'Semantic document search',
    hint: 'Re-rank document search by meaning, not just keywords. Downloads ~23MB once',
    default: false,
  },
  planMode: {
    label: 'Plan mode',
    hint: 'For big multi-step tasks, lay out a plan and confirm before executing',
    default: false,
  },
  proactiveAgent: {
    label: 'Proactive assist',
    hint: 'Quick agent actions above the composer — summarize, next steps, find issues',
    default: false,
  },
  autoVision: {
    label: 'Auto-switch Vision model',
    hint: 'Automatically switch to a vision model when an image is attached',
    default: false,
  },
}

export const FEATURE_DEFAULTS = Object.fromEntries(
  Object.entries(FEATURES).map(([k, v]) => [k, v.default]),
)

/** Merge stored choices over the defaults — a new feature is on unless opted out. */
export function resolveFeatures(stored) {
  return { ...FEATURE_DEFAULTS, ...(stored || {}) }
}

export function isEnabled(features, name) {
  return resolveFeatures(features)[name] !== false
}

/** Vibrate only if the user kept haptics on and the device can. */
export function buzz(features, ms = 30) {
  if (isEnabled(features, 'haptics') && typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(ms)
  }
}
