import { describe, it, expect } from 'vitest'
import {
  applySearchReplacePatch,
  applyUnifiedDiff,
  generateConventionalCommit,
  validateCodeSyntax,
  aiderCopilotTool,
} from './aiderCopilot'

describe('Aider & Continue AI Coding Assistant Tool', () => {
  it('applies search-and-replace block patches', () => {
    const original = `function add(a, b) {\n  return a - b;\n}`
    const patch = `<<<<<<< SEARCH\n  return a - b;\n=======\n  return a + b;\n>>>>>>> REPLACE`

    const result = applySearchReplacePatch(original, patch)
    expect(result.success).toBe(true)
    expect(result.appliedBlocks).toBe(1)
    expect(result.content).toBe(`function add(a, b) {\n  return a + b;\n}`)
  })

  it('fails gracefully when SEARCH block does not match', () => {
    const original = `const x = 10;`
    const patch = `<<<<<<< SEARCH\nconst y = 20;\n=======\nconst y = 30;\n>>>>>>> REPLACE`

    const result = applySearchReplacePatch(original, patch)
    expect(result.success).toBe(false)
    expect(result.failedBlocks).toBe(1)
    expect(result.failures[0].reason).toContain('could not be found')
  })

  it('generates Conventional Commit messages with derived scope and type', () => {
    const commit = generateConventionalCommit({
      modifiedFiles: ['src/tools/weather.js'],
      description: 'Fix celsius to fahrenheit conversion bug',
    })

    expect(commit.type).toBe('fix')
    expect(commit.scope).toBe('(tools)')
    expect(commit.title).toContain('fix(tools): fix celsius to fahrenheit conversion bug')
    expect(commit.body).toContain('- Modified: src/tools/weather.js')
  })

  it('validates bracket balance in code syntax', () => {
    const validJs = `function test() { if (true) { return [1, 2, 3]; } }`
    const invalidJs = `function test() { if (true) { return [1, 2, 3; } }`

    expect(validateCodeSyntax(validJs).valid).toBe(true)
    const err = validateCodeSyntax(invalidJs)
    expect(err.valid).toBe(false)
    expect(err.error).toContain("Mismatched closing bracket '}'")
  })

  it('executes via aiderCopilotTool.execute', async () => {
    const res = await aiderCopilotTool.execute({
      action: 'generate_commit',
      diffSummary: {
        addedFiles: ['docs/README.md'],
        description: 'Update project installation instructions',
      },
    })

    expect(res.type).toBe('docs')
    expect(res.title).toContain('update project installation instructions')
  })
})
