/**
 * Local Semantic Reflex Intercept (LSRI) Engine
 *
 * Provides sub-10ms instantaneous streaming responses for high-frequency
 * conversational turns (greetings, identity, status checks, courtesies)
 * without waiting for cloud LLM inference or round-trip network lag.
 *
 * For complex knowledge or tool questions, returns null so the full
 * LLM agent pipeline takes over.
 */

// Normalized pattern matchers for instant conversational reflexes
const GREETINGS = /^(?:hi|hey|hello|good\s+(?:morning|afternoon|evening|day)|greetings|yo)(?:\s+(?:there|everyone|yogatik))?\b[.!?, ]*$/i
const HOW_ARE_YOU = /^(?:how\s+are\s+you(?: doing)?|how(?:'s| is)\s+it\s+going|how\s+do\s+you\s+do|how\s+are\s+things)\b[.!?, ]*$/i
const WHO_ARE_YOU = /^(?:who\s+are\s+you|what\s+is\s+your\s+name|what\s+are\s+you|introduce\s+yourself)\b[.!?, ]*$/i
const CAN_YOU_HEAR_ME = /^(?:can\s+you\s+hear\s+me|are\s+you\s+there|you\s+there|mic\s+check|test\s+test|testing|can\s+you\s+hear)\b[.!?, ]*$/i
const THANKS = /^(?:thank\s+you(?: so much)?|thanks(?: a lot)?|appreciate\s+it|thx)\b[.!?, ]*$/i
const FAREWELL = /^(?:bye|goodbye|see\s+you(?: later)?|catch\s+you\s+later|take\s+care|talk\s+to\s+you\s+later)\b[.!?, ]*$/i
const COMPLIMENTS = /^(?:nice|great|awesome|cool|perfect|wonderful|excellent|sounds\s+good|got\s+it)\b[.!?, ]*$/i

const GREETING_RESPONSES = [
  "Hello! I'm here and listening. What's on your mind?",
  "Hey there! Ready when you are. How can I help?",
  "Hi! Good to hear from you. What would you like to explore today?",
]

const HOW_ARE_YOU_RESPONSES = [
  "I'm doing great, thank you! Ready to assist you with anything you need.",
  "All systems running smoothly! How can I help you today?",
  "Doing fantastic! How are you doing today?",
]

const WHO_ARE_YOU_RESPONSES = [
  "I am Yogatik, your intelligent AI companion. I'm right here with you in real time.",
  "I'm Yogatik, your AI copilot. I can see, speak, research, and build things with you.",
]

const CAN_YOU_HEAR_ME_RESPONSES = [
  "Loud and clear! I'm listening.",
  "Yes, I can hear you perfectly! Go right ahead.",
  "Crystal clear! How can I help?",
]

const THANKS_RESPONSES = [
  "You're very welcome! Let me know if you need anything else.",
  "Happy to help anytime!",
  "My pleasure! What would you like to do next?",
]

const FAREWELL_RESPONSES = [
  "Goodbye! Take care, and talk to you soon.",
  "See you later! Have a wonderful day ahead.",
]

const COMPLIMENT_RESPONSES = [
  "Glad to hear! Let me know what you'd like to do next.",
  "Great! What's next on our agenda?",
]

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * Checks if an utterance matches a known high-frequency reflex intent.
 * @param {string} text - User prompt
 * @returns {string|null} - The synthesized response or null if not a reflex match
 */
export function matchReflex(text = '') {
  const t = String(text || '').trim().toLowerCase()
  if (!t || t.length > 60) return null

  if (GREETINGS.test(t)) return pickRandom(GREETING_RESPONSES)
  if (HOW_ARE_YOU.test(t)) return pickRandom(HOW_ARE_YOU_RESPONSES)
  if (CAN_YOU_HEAR_ME.test(t)) return pickRandom(CAN_YOU_HEAR_ME_RESPONSES)
  if (WHO_ARE_YOU.test(t)) return pickRandom(WHO_ARE_YOU_RESPONSES)
  if (THANKS.test(t)) return pickRandom(THANKS_RESPONSES)
  if (FAREWELL.test(t)) return pickRandom(FAREWELL_RESPONSES)
  if (COMPLIMENTS.test(t)) return pickRandom(COMPLIMENT_RESPONSES)

  return null
}

/**
 * Streams a reflex response with natural conversational token cadence (~12ms per token burst).
 * @param {string} responseText - Text to stream
 * @param {Object} callbacks - onToken, onDone, signal
 * @returns {Promise<void>}
 */
export async function streamReflex(responseText, { onToken, onDone, signal } = {}) {
  const words = responseText.split(' ')
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) return
    const chunk = (i === 0 ? '' : ' ') + words[i]
    onToken?.(chunk)
    // Sub-15ms micro-pause to simulate smooth, natural streaming
    await new Promise(r => setTimeout(r, 12))
  }
  onDone?.({ content: responseText })
}
