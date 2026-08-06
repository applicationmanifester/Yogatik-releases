// Web Speech Recognition API — built into Chrome/Edge, free
export const sttTool = {
  schema: {
    description: 'Transcribe speech from microphone',
    parameters: { type: 'object', properties: {
      lang: { type: 'string', description: 'Language code (default en-US)' },
    } },
  },
  async execute({ lang = 'en-US' }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return { success: false, error: 'Speech recognition not supported in this browser' }
    return new Promise((resolve) => {
      const r = new SR()
      r.lang = lang; r.continuous = false; r.interimResults = false
      r.onresult = (e) => resolve({ success: true, tool: 'stt', text: e.results[0][0].transcript, confidence: e.results[0][0].confidence })
      r.onerror = (e) => resolve({ success: false, error: e.error })
      r.start()
      setTimeout(() => { r.stop(); resolve({ success: false, error: 'Timeout' }) }, 15000)
    })
  }
}
