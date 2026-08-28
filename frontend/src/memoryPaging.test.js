import { describe, it, expect } from 'vitest'
import { MemoryPagingManager } from './memoryPaging'

describe('MemGPT Virtual Memory Paging Suite', () => {
  it('manages working RAM context and stores core facts', () => {
    const mem = new MemoryPagingManager({ maxWorkingTokens: 50 })
    mem.setCoreFact('User Name', 'Bhargav')
    mem.setCoreFact('Preferred Language', 'TypeScript')

    const active = mem.renderActiveContext()
    expect(active.coreFactsBlock).toContain('User Name: Bhargav')
    expect(active.coreFactsBlock).toContain('Preferred Language: TypeScript')
  })

  it('pages out older turns into archival storage when token threshold is exceeded', () => {
    const mem = new MemoryPagingManager({ maxWorkingTokens: 30 })

    mem.pushTurn({ role: 'user', content: 'Turn 1: Project kickoff for autonomous agent system' })
    mem.pushTurn({ role: 'assistant', content: 'Turn 2: Acknowledged, setting up architecture' })
    mem.pushTurn({ role: 'user', content: 'Turn 3: We need to use IndexedDB for local persistence' })
    mem.pushTurn({ role: 'assistant', content: 'Turn 4: Using Dexie.js for IndexedDB tables' })
    mem.pushTurn({ role: 'user', content: 'Turn 5: Latest message in flight' })

    const active = mem.renderActiveContext()
    expect(active.archivedPageCount).toBeGreaterThan(0)
  })

  it('recovers historical facts via Page Fault mechanism', () => {
    const mem = new MemoryPagingManager({ maxWorkingTokens: 20 })

    mem.pushTurn({ role: 'user', content: 'The secret deployment code is ALPHA-990.' })
    mem.pushTurn({ role: 'assistant', content: 'Got it, saved.' })
    mem.pushTurn({ role: 'user', content: 'Message 3 fill fill fill fill fill fill' })
    mem.pushTurn({ role: 'assistant', content: 'Message 4 fill fill fill fill fill fill' })

    const faultHits = mem.pageFault('ALPHA-990')
    expect(faultHits.length).toBeGreaterThan(0)
    expect(faultHits[0].content).toContain('ALPHA-990')
  })
})
