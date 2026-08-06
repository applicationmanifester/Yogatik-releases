// Client-side extractive summarization — sentence scoring by word frequency
export const summarizeTool = {
  schema: {
    description: 'Summarize a block of text into key sentences',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'Text to summarize' },
      sentences: { type: 'number', description: 'Number of sentences (default 3)' },
    }, required: ['text'] },
  },
  async execute({ text, sentences = 3 }) {
    const stops = new Set('the a an and or but in on at to for of is it this that with as by from'.split(' '))
    const sents = text.match(/[^.!?]+[.!?]+/g) || [text]
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stops.has(w))
    const freq = {}
    words.forEach(w => freq[w] = (freq[w] || 0) + 1)
    const scored = sents.map((s, i) => {
      const sWords = s.toLowerCase().split(/\W+/)
      const score = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0) / (sWords.length || 1)
      return { text: s.trim(), score, index: i }
    })
    const top = scored.sort((a, b) => b.score - a.score).slice(0, sentences).sort((a, b) => a.index - b.index)
    return { success: true, tool: 'summarize', summary: top.map(s => s.text).join(' '), original_length: text.length }
  }
}
