export const diffTool = {
  schema: {
    description: 'Compare two texts and show differences',
    parameters: { type: 'object', properties: {
      text1: { type: 'string', description: 'First text' },
      text2: { type: 'string', description: 'Second text' },
    }, required: ['text1', 'text2'] },
  },
  async execute({ text1, text2 }) {
    if (typeof text1 !== 'string' || typeof text2 !== 'string') {
      return { success: false, error: 'text1 and text2 are both required' }
    }
    const lines1 = text1.split('\n'), lines2 = text2.split('\n')
    const diff = []
    const max = Math.max(lines1.length, lines2.length)
    for (let i = 0; i < max; i++) {
      if (i >= lines1.length) diff.push({ type: 'add', line: i + 1, content: lines2[i] })
      else if (i >= lines2.length) diff.push({ type: 'remove', line: i + 1, content: lines1[i] })
      else if (lines1[i] !== lines2[i]) diff.push({ type: 'change', line: i + 1, old: lines1[i], new: lines2[i] })
    }
    // Similarity ratio
    const common = lines1.filter(l => lines2.includes(l)).length
    const similarity = Math.round((common / max) * 100)
    return { success: true, tool: 'diff', changes: diff.length, similarity, diff: diff.slice(0, 50) }
  }
}
