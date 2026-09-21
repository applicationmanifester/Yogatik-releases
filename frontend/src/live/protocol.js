/**
 * Gemini Live API wire protocol — pure functions, no I/O.
 *
 * Stateful WSS session (BidiGenerateContent): audio in at 16kHz PCM16, video
 * frames as JPEG <=1fps, native audio out at 24kHz. Server-side VAD gives real
 * barge-in, which a STT->LLM->TTS chain cannot do.
 * Ref: ai.google.dev/api/live
 */

export const LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

/** Models with native-audio Live support. First is the default. */
export const LIVE_MODELS = [
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-native-audio',
  'gemini-live-2.5-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]

export function liveEndpoint(apiKey) {
  return `${LIVE_WS}?key=${encodeURIComponent(apiKey)}`
}

/** Gemini rejects JSON-Schema keywords it does not implement. */
const SCHEMA_DROP = new Set([
  '$schema', 'additionalProperties', 'default', 'examples', 'const',
  'exclusiveMinimum', 'exclusiveMaximum', 'patternProperties', 'definitions',
  '$ref', 'oneOf', 'allOf', 'not', 'title',
])

function cleanSchema(node) {
  if (Array.isArray(node)) return node.map(cleanSchema)
  if (!node || typeof node !== 'object') return node
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (SCHEMA_DROP.has(k)) continue
    // Recurse through everything: a dropped keyword can sit at any depth, and
    // `properties` children are keyed by arbitrary names, not schema keywords.
    out[k] = (v && typeof v === 'object') ? cleanSchema(v) : v
  }
  // An object with no properties makes the API 400; describe it as empty.
  if (out.type === 'object' && !out.properties) out.properties = {}
  return out
}

/**
 * OpenAI tool schemas -> Gemini functionDeclarations.
 * One Tool entry holding every declaration, which is what the API expects.
 */
export function toGeminiTools(schemas = []) {
  const decls = schemas.map((t) => {
    const fn = t.function || t
    const d = { name: fn.name, description: fn.description || '' }
    const params = cleanSchema(fn.parameters || {})
    // Parameterless tools must omit `parameters` entirely.
    if (params.properties && Object.keys(params.properties).length) {
      d.parameters = { type: 'object', ...params }
    }
    return d
  })
  return decls.length ? [{ functionDeclarations: decls }] : undefined
}

/**
 * First message on the socket. Cannot be changed while the socket is open.
 * @param {Object} o
 * @param {string} o.model
 * @param {string} o.systemInstruction
 * @param {Array}  o.schemas    OpenAI-shaped tool schemas
 * @param {string} o.voice      prebuilt voice name
 * @param {string} o.resume     session resumption handle from a prior connection
 */
export function buildSetup({ model, systemInstruction, schemas = [], voice = 'Puck', resume = null }) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        // Frames cost tokens; MEDIUM is enough to read a room, not a page of text.
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      },
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools: toGeminiTools(schemas),
      // Both transcripts so the conversation can be written into chat history.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
          endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
          prefixPaddingMs: 60,
          // Below ~400ms the model cuts in on natural pauses mid-sentence.
          silenceDurationMs: 400,
        },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        turnCoverage: 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO',
      },
      // Lets the model stay silent when you are talking to someone else.
      proactivity: { proactiveAudio: true },
      sessionResumption: resume ? { handle: resume } : {},
      // Sessions die at the context limit otherwise — this makes them open-ended.
      contextWindowCompression: { slidingWindow: {} },
    },
  }
}

export const audioChunk = (b64) => ({
  realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } },
})
export const videoFrame = (b64, mimeType = 'image/jpeg') => ({
  realtimeInput: { video: { data: b64, mimeType } },
})
export const textInput = (text) => ({ realtimeInput: { text } })
export const audioStreamEnd = () => ({ realtimeInput: { audioStreamEnd: true } })

export const toolResponse = (responses) => ({
  toolResponse: {
    functionResponses: responses.map(({ id, name, result }) => ({
      id, name, response: { result },
    })),
  },
})

/**
 * Flatten a server message into the events the UI cares about.
 * Order matters: interruption must be handled before queued audio.
 * @returns {Array<{type:string, ...}>}
 */
export function decodeServerMessage(msg) {
  const events = []
  if (!msg || typeof msg !== 'object') return events

  if (msg.setupComplete) events.push({ type: 'ready' })

  const sc = msg.serverContent
  if (sc) {
    if (sc.interrupted) events.push({ type: 'interrupted' })
    if (sc.inputTranscription?.text) {
      events.push({ type: 'transcript', role: 'user', text: sc.inputTranscription.text })
    }
    if (sc.outputTranscription?.text) {
      events.push({ type: 'transcript', role: 'assistant', text: sc.outputTranscription.text })
    }
    for (const part of sc.modelTurn?.parts || []) {
      if (part.inlineData?.data) {
        events.push({ type: 'audio', data: part.inlineData.data, mimeType: part.inlineData.mimeType })
      } else if (part.text) {
        events.push({ type: 'transcript', role: 'assistant', text: part.text })
      }
    }
    if (sc.generationComplete) events.push({ type: 'generationComplete' })
    if (sc.turnComplete) events.push({ type: 'turnComplete' })
  }

  if (msg.toolCall?.functionCalls?.length) {
    events.push({ type: 'toolCall', calls: msg.toolCall.functionCalls })
  }
  if (msg.toolCallCancellation?.ids?.length) {
    events.push({ type: 'toolCancel', ids: msg.toolCallCancellation.ids })
  }
  if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
    events.push({ type: 'resumeHandle', handle: msg.sessionResumptionUpdate.newHandle })
  }
  if (msg.goAway) events.push({ type: 'goAway', timeLeft: msg.goAway.timeLeft })
  if (msg.usageMetadata) {
    events.push({ type: 'usage', tokens: msg.usageMetadata.totalTokenCount || 0 })
  }
  return events
}

/** The audio mimeType carries the real rate: "audio/pcm;rate=24000". */
export function rateFromMime(mimeType, fallback = 24000) {
  const m = /rate=(\d+)/.exec(mimeType || '')
  return m ? Number(m[1]) : fallback
}
