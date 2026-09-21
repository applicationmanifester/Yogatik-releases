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
const COMPLIMENTS = /^(?:nice|great|awesome|cool|perfect|wonderful|excellent|sounds\s+good|got\s+it)(?:\s+(?:job|work|one))?[.!?, ]*$/i
const ACKNOWLEDGMENTS = /^(?:yes|yeah|yep|yup|no|nope|nah|ok|okay|sure|right|correct|exactly|indeed|absolutely|definitely|of\s+course|alright|agreed|understood|roger|copy\s+that|affirmative)(?:\s+(?:sir|ma'am|please|thanks))?[.!?, ]*$/i
const CONTINUATIONS = /^(?:tell\s+me\s+more|go\s+on|continue|and\s+then|what\s+else|more\s+please|keep\s+going|elaborate|go\s+ahead|anything\s+else)(?:\s+(?:please|about\s+that))?[.!?, ]*$/i
const CONFUSED = /^(?:what|huh|sorry|excuse\s+me|pardon|i\s+didn'?t\s+(?:get|catch|hear|understand)\s+that|say\s+that\s+again|repeat\s+that|come\s+again|what\s+did\s+you\s+say)(?:\s+(?:again|please))?[.!?, ]*$/i
const FILLER_GREETINGS = /^(?:(?:hi|hey|hello)\s*){2,}[.!?, ]*$/i

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

const ACKNOWLEDGMENT_RESPONSES = [
  "Got it! What would you like to do next?",
  "Understood. Just say the word when you're ready.",
  "Alright! I'm here whenever you need me.",
]

const CONTINUATION_RESPONSES = [
  "Sure! What specific aspect would you like me to elaborate on?",
  "Of course. What part would you like me to dive deeper into?",
  "Happy to continue! What should I expand on?",
]

const CONFUSED_RESPONSES = [
  "No worries! Could you repeat that for me?",
  "Sorry about that! Try asking me again.",
  "I'm here, just say it again and I'll help.",
]


function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

const TIME_QUERY = /^(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:current\s+)?time(?:\s+now)?|what\s+time\s+is\s+it|tell\s+me\s+the\s+time|current\s+time)\b[.!?, ]*$/i
const DATE_QUERY = /^(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:today(?:'s)?\s+)?date|what\s+date\s+is\s+it|what\s+day\s+is\s+(?:it\s+)?today|today(?:'s)?\s+date)\b[.!?, ]*$/i
const CAPABILITIES = /^(?:what\s+can\s+you\s+do|what\s+are\s+your\s+capabilities|how\s+can\s+you\s+help\s+me)\b[.!?, ]*$/i
const STATUS_PING = /^(?:ping|status\s+check|system\s+status|are\s+you\s+online)\b[.!?, ]*$/i

function getFormattedTime() {
  const d = new Date()
  return `It's currently ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
}

function getFormattedDate() {
  const d = new Date()
  return `Today is ${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`
}

const CAPABILITY_RESPONSES = [
  "I can chat with you live, research the web, inspect your camera or shared screen, run code, and generate creative content.",
  "I can research real-time facts, analyze what you show me on camera or screen, write and execute code, and assist you hands-free.",
]

const STATUS_RESPONSES = [
  "All systems are online, connected, and operating at peak performance.",
  "Online and ready. Network, voice synthesis, and vision pipelines are active.",
]

function evaluateSimpleMath(text = '') {
  const match = text.match(/^(?:what(?:'s|\s+is)\s+)?(\d+(?:\.\d+)?)\s*([\+\-\*\/xX]|times|plus|minus|divided by)\s*(\d+(?:\.\d+)?)\??$/i)
  if (!match) return null
  const a = parseFloat(match[1])
  const op = match[2].toLowerCase()
  const b = parseFloat(match[3])
  if (isNaN(a) || isNaN(b)) return null
  let res, opWord
  if (op === '+' || op === 'plus') { res = a + b; opWord = 'plus' }
  else if (op === '-' || op === 'minus') { res = a - b; opWord = 'minus' }
  else if (op === '*' || op === 'x' || op === 'times') { res = a * b; opWord = 'times' }
  else if (op === '/' || op === 'divided by') {
    if (b === 0) return "Numbers cannot be divided by zero."
    res = Math.round((a / b) * 1000) / 1000
    opWord = 'divided by'
  }
  if (res === undefined) return null
  const cleanRes = Number.isInteger(res) ? res : res.toFixed(2).replace(/\.?0+$/, '')
  return `${a} ${opWord} ${b} is ${cleanRes}.`
}

function evaluateUnitConversion(text = '') {
  // Temperature: celsius to fahrenheit
  const cToF = text.match(/^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*(?:degrees?\s+)?celsius\s+(?:in|to)\s+fahrenheit\??$/i)
  if (cToF) {
    const c = parseFloat(cToF[1])
    const f = Math.round((c * 9 / 5 + 32) * 10) / 10
    return `${c} degrees Celsius is ${f} degrees Fahrenheit.`
  }
  // Temperature: fahrenheit to celsius
  const fToC = text.match(/^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*(?:degrees?\s+)?fahrenheit\s+(?:in|to)\s+celsius\??$/i)
  if (fToC) {
    const f = parseFloat(fToC[1])
    const c = Math.round(((f - 32) * 5 / 9) * 10) / 10
    return `${f} degrees Fahrenheit is ${c} degrees Celsius.`
  }
  // Distance: km to miles
  const kmToMi = text.match(/^(?:convert\s+|how\s+many\s+miles\s+(?:is|in)\s+)?(\d+(?:\.\d+)?)\s*(?:km|kilometers?)(?:\s+(?:in|to)\s+miles)?\??$/i)
  if (kmToMi && !text.includes('per hour')) {
    const km = parseFloat(kmToMi[1])
    const mi = Math.round((km * 0.621371) * 100) / 100
    return `${km} kilometers is approximately ${mi} miles.`
  }
  // Distance: miles to km
  const miToKm = text.match(/^(?:convert\s+|how\s+many\s+kilometers\s+(?:is|in)\s+)?(\d+(?:\.\d+)?)\s*miles(?:\s+(?:in|to)\s+(?:km|kilometers?))?\??$/i)
  if (miToKm && !text.includes('per hour')) {
    const mi = parseFloat(miToKm[1])
    const km = Math.round((mi * 1.60934) * 100) / 100
    return `${mi} miles is approximately ${km} kilometers.`
  }
  return null
}

/**
 * Checks if an utterance matches a known high-frequency reflex intent with structured metadata.
 * @param {string} text - User prompt
 * @returns {{response: string, confidence: number, intent: string}|null} - Structured reflex match or null
 */
export function matchReflexIntent(text = '') {
  const t = String(text || '').trim().toLowerCase()
  if (!t || t.length > 70) return null

  // Instant mathematical calculations and unit conversions
  const mathRes = evaluateSimpleMath(t)
  if (mathRes) return { response: mathRes, confidence: 1.0, intent: 'math' }
  const convRes = evaluateUnitConversion(t)
  if (convRes) return { response: convRes, confidence: 1.0, intent: 'unit_conversion' }

  // Dynamic real-time queries evaluated on-device
  if (TIME_QUERY.test(t)) return { response: getFormattedTime(), confidence: 1.0, intent: 'time' }
  if (DATE_QUERY.test(t)) return { response: getFormattedDate(), confidence: 1.0, intent: 'date' }
  if (CAPABILITIES.test(t)) return { response: pickRandom(CAPABILITY_RESPONSES), confidence: 0.95, intent: 'capabilities' }
  if (STATUS_PING.test(t)) return { response: pickRandom(STATUS_RESPONSES), confidence: 0.95, intent: 'status' }

  // Greeting variants with varying confidence
  if (GREETINGS.test(t)) return { response: pickRandom(GREETING_RESPONSES), confidence: 0.98, intent: 'greeting' }
  if (FILLER_GREETINGS.test(t)) return { response: pickRandom(GREETING_RESPONSES), confidence: 0.9, intent: 'filler_greeting' }
  if (HOW_ARE_YOU.test(t)) return { response: pickRandom(HOW_ARE_YOU_RESPONSES), confidence: 0.98, intent: 'how_are_you' }
  if (CAN_YOU_HEAR_ME.test(t)) return { response: pickRandom(CAN_YOU_HEAR_ME_RESPONSES), confidence: 0.95, intent: 'mic_check' }
  if (WHO_ARE_YOU.test(t)) return { response: pickRandom(WHO_ARE_YOU_RESPONSES), confidence: 0.95, intent: 'identity' }
  if (THANKS.test(t)) return { response: pickRandom(THANKS_RESPONSES), confidence: 0.98, intent: 'thanks' }
  if (FAREWELL.test(t)) return { response: pickRandom(FAREWELL_RESPONSES), confidence: 0.98, intent: 'farewell' }
  if (COMPLIMENTS.test(t)) return { response: pickRandom(COMPLIMENT_RESPONSES), confidence: 0.9, intent: 'compliment' }
  if (ACKNOWLEDGMENTS.test(t)) return { response: pickRandom(ACKNOWLEDGMENT_RESPONSES), confidence: 0.9, intent: 'acknowledgment' }
  if (CONTINUATIONS.test(t)) return { response: pickRandom(CONTINUATION_RESPONSES), confidence: 0.85, intent: 'continuation' }
  if (CONFUSED.test(t)) return { response: pickRandom(CONFUSED_RESPONSES), confidence: 0.9, intent: 'confused' }

  return null
}

/**
 * Checks if an utterance matches a known high-frequency reflex intent.
 * @param {string} text - User prompt
 * @returns {string|null} - The synthesized response or null if not a reflex match
 */
export function matchReflex(text = '') {
  return matchReflexIntent(text)?.response || null
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
