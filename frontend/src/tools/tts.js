// Web Speech Synthesis API — built into all browsers, free
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
      rate: { type: 'number', description: 'Speech rate 0.1-10 (default 1)' },
    }, required: ['text'] },
  },
  async execute({ text, lang = 'en-US', rate = 1 }) {
    if (!('speechSynthesis' in window)) return { success: false, error: 'TTS not supported' }
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
    return { success: true, tool: 'tts', text: text.slice(0, 100), lang }
  }
}
