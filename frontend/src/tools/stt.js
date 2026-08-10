// Speech-to-text. Web Speech API (Chrome/Edge, fast, cloud) with an on-device
// Whisper fallback so Firefox/Safari can dictate too — offline, no key.
export const sttTool = {
  schema: {
    description:
      'Record from the microphone and transcribe it. ' +
      'ONLY call when the user explicitly asks to dictate or capture audio. ' +
      'NEVER call it to ask the user a question or to wait for input — it opens the mic and blocks.',
    parameters: { type: 'object', properties: {
      lang: { type: 'string', description: 'Language code (default en-US)' },
      seconds: { type: 'number', description: 'Recording length for the Whisper fallback (default 8, max 30)' },
    } },
  },
  async execute({ lang = 'en-US', seconds = 8 }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      return new Promise((resolve) => {
        const r = new SR()
        r.lang = lang; r.continuous = false; r.interimResults = false
        r.onresult = (e) => resolve({ success: true, tool: 'stt', engine: 'web-speech', text: e.results[0][0].transcript, confidence: e.results[0][0].confidence })
        r.onerror = (e) => resolve({ success: false, error: e.error })
        r.start()
        setTimeout(() => { r.stop(); resolve({ success: false, error: 'Timeout' }) }, 15000)
      })
    }

    // No Web Speech (Firefox/Safari): record a clip and transcribe on-device.
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { success: false, error: 'Speech recognition is not available in this browser.' }
    }
    const dur = Math.min(Math.max(2, seconds | 0), 30)
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const blob = await new Promise((resolve, reject) => {
        const chunks = []
        const rec = new MediaRecorder(stream)
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
        rec.onerror = (e) => reject(e.error || new Error('Recording failed'))
        rec.start()
        setTimeout(() => rec.state !== 'inactive' && rec.stop(), dur * 1000)
      })
      const { transcribe } = await import('../whisper')
      const text = await transcribe(blob, { lang })
      return text
        ? { success: true, tool: 'stt', engine: 'whisper-on-device', text }
        : { success: false, error: 'Could not transcribe the audio.' }
    } catch (e) {
      return { success: false, error: `On-device transcription failed: ${e?.message || e}` }
    } finally {
      stream?.getTracks().forEach(t => t.stop())
    }
  },
}
