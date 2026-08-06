// Web Audio API — get audio info/duration
export const audioTool = {
  schema: {
    description: 'Get audio file information (duration, channels, sample rate)',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'Audio file URL or data URL' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const resp = await fetch(url)
    const buffer = await resp.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(buffer)
    ctx.close()
    return {
      success: true, tool: 'audio_edit',
      duration: Math.round(audioBuffer.duration * 100) / 100,
      channels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      length: audioBuffer.length,
    }
  }
}
