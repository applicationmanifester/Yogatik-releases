// On-device neural voice (Kokoro), with the browser synthesiser as fallback.
import { getSharedSpeaker } from '../live/voice'
import { DEFAULT_VOICE, VOICES } from '../video/speech'

export const ttsTool = {
  schema: {
    description:
      'Speak text aloud through the device speakers. ' +
      'ONLY call this when the user explicitly asks to hear something — "read that aloud", "say it", "speak this". ' +
      'NEVER call it to narrate, preview, or announce your own answer: the user reads your reply on screen and ' +
      'has a play button on every message. Calling this unasked interrupts them with unwanted audio.',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'Text to speak' },
      lang: { type: 'string', description: 'Language code (default en-US)' },
      rate: { type: 'number', description: 'Speech rate 0.6-1.5 (default 1)' },
      voice: { type: 'string', enum: Object.keys(VOICES), description: 'Voice id (default af_heart)' },
    }, required: ['text'] },
  },
  async execute({ text, lang = 'en-US', rate = 1, voice }) {
    // Same on-device neural voice the call uses; falls back to the system
    // synthesiser on its own if the model is unavailable.
    const speaker = getSharedSpeaker({ engine: 'neural', voice: voice || DEFAULT_VOICE, lang, rate })
    speaker.cancel()
    speaker.speak(text)
    return { success: true, tool: 'tts', text: text.slice(0, 100), lang, voice: voice || DEFAULT_VOICE }
  }
}
