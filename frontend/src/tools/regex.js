export const regexTool = {
  schema: {
    description: 'Test, find, or replace using regular expressions',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'Input text' },
      pattern: { type: 'string', description: 'Regex pattern' },
      operation: { type: 'string', enum: ['find', 'match', 'replace', 'split'], description: 'Operation' },
      replacement: { type: 'string', description: 'Replacement string (for replace)' },
      flags: { type: 'string', description: 'Regex flags (default gi)' },
    }, required: ['text', 'pattern', 'operation'] },
  },
  async execute({ text, pattern, operation, replacement = '', flags = 'gi' }) {
    try {
      const re = new RegExp(pattern, flags)
      let result
      if (operation === 'find') result = [...text.matchAll(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'))].map(m => ({ match: m[0], index: m.index, groups: m.groups }))
      else if (operation === 'match') result = re.test(text)
      else if (operation === 'replace') result = text.replace(re, replacement)
      else if (operation === 'split') result = text.split(re)
      return { success: true, tool: 'regex', result, pattern, operation }
    } catch (e) { return { success: false, error: e.message } }
  }
}
