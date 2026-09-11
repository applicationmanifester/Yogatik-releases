import { describe, it, expect } from 'vitest'
import { extractActionChips } from './actionChips'

describe('actionChips', () => {
  it('returns clean text and empty chips if no action chips present', () => {
    const raw = 'Here is the completed task. Let me know if you need anything else!'
    const { cleanText, chips } = extractActionChips(raw)
    expect(cleanText).toBe(raw)
    expect(chips).toEqual([])
  })

  it('extracts chips from json code block and removes markup', () => {
    const raw = `
I have created the new file.

\`\`\`action_chips
[
  {"label": "Run Tests", "prompt": "run npm test"},
  {"label": "Commit Changes", "prompt": "git commit -m 'feat: add file'"}
]
\`\`\`
`.trim()

    const { cleanText, chips } = extractActionChips(raw)
    expect(cleanText).toBe('I have created the new file.')
    expect(chips).toHaveLength(2)
    expect(chips[0].label).toBe('Run Tests')
    expect(chips[0].prompt).toBe('run npm test')
    expect(chips[1].label).toBe('Commit Changes')
  })

  it('extracts chips from inline [action: ...] syntax', () => {
    const raw = 'All changes are verified.\n\nNext steps:\n[action: Check Git Status | prompt: git status]\n[action: Build Production]'
    const { cleanText, chips } = extractActionChips(raw)
    expect(cleanText).toBe('All changes are verified.\n\nNext steps:')
    expect(chips).toHaveLength(2)
    expect(chips[0].label).toBe('Check Git Status')
    expect(chips[0].prompt).toBe('git status')
    expect(chips[1].label).toBe('Build Production')
    expect(chips[1].prompt).toBe('Build Production')
  })

  it('handles invalid or malformed JSON gracefully', () => {
    const raw = `
Done.
\`\`\`action_chips
- Deploy to Vercel
- Review Security Scan
\`\`\`
`.trim()

    const { cleanText, chips } = extractActionChips(raw)
    expect(cleanText).toBe('Done.')
    expect(chips).toHaveLength(2)
    expect(chips[0].label).toBe('Deploy to Vercel')
    expect(chips[1].label).toBe('Review Security Scan')
  })
})
