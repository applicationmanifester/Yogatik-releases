import { describe, it, expect, beforeEach } from 'vitest'
import { WorkspaceTrie } from './workspaceTrie'

describe('WorkspaceTrie Indexer', () => {
  let trie

  beforeEach(() => {
    trie = new WorkspaceTrie()
    trie.insert('src/components/App.jsx')
    trie.insert('src/components/Button.jsx')
    trie.insert('src/tools/localFs.js')
    trie.insert('src/tools/fsPatch.js')
    trie.insert('package.json')
    trie.insert('docs/README.md')
  })

  it('indexes paths and reports correct size', () => {
    expect(trie.size).toBe(6)
  })

  it('finds files by prefix', () => {
    const componentFiles = trie.findPrefix('src/components')
    expect(componentFiles).toContain('src/components/App.jsx')
    expect(componentFiles).toContain('src/components/Button.jsx')
    expect(componentFiles).not.toContain('package.json')
  })

  it('finds files by extension instantly', () => {
    const jsxFiles = trie.findByExtension('jsx')
    expect(jsxFiles).toHaveLength(2)
    expect(jsxFiles).toContain('src/components/App.jsx')
    expect(jsxFiles).toContain('src/components/Button.jsx')

    const mdFiles = trie.findByExtension('.md')
    expect(mdFiles).toContain('docs/README.md')
  })

  it('performs fuzzy substring search', () => {
    const results = trie.fuzzySearch('Patch')
    expect(results).toContain('src/tools/fsPatch.js')
  })

  it('clears index cleanly', () => {
    trie.clear()
    expect(trie.size).toBe(0)
    expect(trie.getAllFiles()).toEqual([])
  })
})
