import { afterEach, describe, it, expect, vi } from 'vitest'
import { parseUnifiedDiff, applyPatchToText, fsPatchTool } from './fsPatch'

afterEach(() => vi.unstubAllGlobals())

describe('fsPatch Engine', () => {
  it('parses unified diff hunks correctly', () => {
    const diff = `
--- a/file.js
+++ b/file.js
@@ -1,4 +1,4 @@
 const x = 1
-const y = 2
+const y = 20
 const z = 3
`
    const hunks = parseUnifiedDiff(diff)
    expect(hunks.length).toBe(1)
    expect(hunks[0].oldStart).toBe(1)
    expect(hunks[0].oldLines).toBe(4)
    expect(hunks[0].newStart).toBe(1)
    expect(hunks[0].newLines).toBe(4)
    expect(hunks[0].lines.length).toBeGreaterThan(0)
  })

  it('applies exact unified diff patch cleanly', () => {
    const original = `const x = 1\nconst y = 2\nconst z = 3\nconst w = 4`
    const diff = `@@ -1,4 +1,4 @@\n const x = 1\n-const y = 2\n+const y = 42\n const z = 3`
    const hunks = parseUnifiedDiff(diff)
    const res = applyPatchToText(original, hunks)
    expect(res.success).toBe(true)
    expect(res.appliedHunks).toBe(1)
    expect(res.text).toBe(`const x = 1\nconst y = 42\nconst z = 3\nconst w = 4`)
  })

  it('applies multiple sequential hunks with offset tracking', () => {
    const original = `line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8`
    const diff = `@@ -2,2 +2,3 @@\n-line2\n+line2_a\n+line2_b\n line3\n@@ -6,2 +7,2 @@\n-line6\n+line6_mod\n line7`
    const hunks = parseUnifiedDiff(diff)
    const res = applyPatchToText(original, hunks)
    expect(res.success).toBe(true)
    expect(res.appliedHunks).toBe(2)
    expect(res.text).toContain('line2_a')
    expect(res.text).toContain('line2_b')
    expect(res.text).toContain('line6_mod')
  })

  it('tolerates minor whitespace variations with fuzzy matching', () => {
    const original = `  function test() {\n    const a = 1;\n    return a;\n  }`
    const diff = `@@ -1,3 +1,3 @@\nfunction test() {\n- const a = 1;\n+ const a = 99;\n return a;`
    const hunks = parseUnifiedDiff(diff)
    const res = applyPatchToText(original, hunks, { fuzzy: true })
    expect(res.success).toBe(true)
    expect(res.text).toContain('99')
  })

  it('rejects completely mismatched hunk without modifying original', () => {
    const original = `alpha\nbeta\ngamma`
    const diff = `@@ -1,2 +1,2 @@\n-foo\n+bar\n baz`
    const hunks = parseUnifiedDiff(diff)
    const res = applyPatchToText(original, hunks)
    expect(res.success).toBe(false)
    expect(res.text).toBe(original)
    expect(res.error).toBeDefined()
  })

  it('fsPatchTool schema validation', async () => {
    const res = await fsPatchTool.execute({ path: 'test.js', patch: '@@ -1,1 +1,1 @@\n-a\n+b' })
    expect(res.tool).toBe('fs_patch')
    expect(res.hunksCount).toBe(1)
    expect(res.success).toBe(false)
  })

  it('reads and writes through the scoped filesystem bridge instead of fabricating success', async () => {
    const invoke = vi.fn(async (command, args) => {
      if (command === 'fs_read') {
        return { content: 'const value = 1\n', bytes: 16, binary: false, hash: 'before' }
      }
      if (command === 'fs_write') {
        expect(args.content).toBe('const value = 2\n')
        expect(args.expectedHash).toBe('before')
        return { bytes: 16, hash: 'after', stale: false, encoding: 'utf8' }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('window', { __TAURI__: { core: { invoke } } })

    const res = await fsPatchTool.execute({
      path: 'fixture.js',
      patch: '@@ -1,1 +1,1 @@\n-const value = 1\n+const value = 2',
    })

    expect(res).toMatchObject({ success: true, path: 'fixture.js', hash: 'after', appliedHunks: 1 })
    expect(invoke).toHaveBeenCalledWith('fs_read', expect.objectContaining({ path: 'fixture.js' }))
    expect(invoke).toHaveBeenCalledWith('fs_write', expect.objectContaining({ path: 'fixture.js' }))
  })
})
