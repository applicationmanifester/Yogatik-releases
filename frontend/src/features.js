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
  soundCues: {
    label: 'Sound cues',
    // OFF by default. An app that starts making noise unprompted is one people
    // mute at the OS level, after which they hear nothing from it ever again.
    hint: 'A soft tone when a reply arrives while you are in another window',
    default: false,
  },
  liveCaptions: {
    label: 'Live captions',
    hint: 'Subtitles over the call',
    default: true,
  },
  liveObjectDetection: {
    label: 'Object detection overlay',
    // Purely a local, on-screen HUD — boxes are drawn client-side and never
    // sent to the model or turned into a turn, so it costs nothing beyond the
    // one-time download and the local inference itself.
    hint: 'Draws boxes around what the camera sees during a call, on-device. Downloads ~40MB once',
    default: false,
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
  liveTextOnly: {
    label: 'Silent Live (Text/Transcript Only)',
    hint: 'Mute AI voice output. Fast mic-in, instant streaming text-out with zero audio synthesis or playback delay',
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
  terminalApproval: {
    label: 'Terminal Command Auto Execution',
    hint: 'Controls whether terminal commands require your approval before running',
    default: 'auto', // 'auto' | 'ask' | 'deny'
  },
  fileWriteApproval: {
    label: 'Autonomous File Edit & Write',
    hint: 'Autonomously allow file creation, editing, and batch writes in active workspace without interrupting for permission',
    default: 'auto', // 'auto' | 'ask' | 'deny'
  },
  queuedMessageMode: {
    label: 'Queued Messages',
    hint: 'Configure when follow-up messages are sent',
    default: 'queue', // 'queue' | 'immediate'
  },
  autoOpenEditedFiles: {
    label: 'Auto-Open Edited Files',
    hint: 'Open files in the background if Agent creates or edits them',
    default: true,
  },
  smartRouter: {
    label: 'Smart Intent Router',
    hint: 'Suggests or routes queries to the optimal provider (Speed, Code, Reasoning, or Vision)',
    default: true,
  },
  relentlessExecution: {
    label: 'Relentless Retry, Reconnect & Rework',
    hint: 'Autonomously retries network blips, reconnects dropped streams, and reworks failed builds or tests until task succeeds',
    default: true,
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
