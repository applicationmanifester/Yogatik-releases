import { describe, it, expect, beforeEach } from 'vitest'
import { turbovecTool, getTurboIndex } from './turbovec'

describe('TurboVec Vector Search Tool', () => {
  beforeEach(() => {
    const idx = getTurboIndex('test_idx')
    idx.clear()
  })

  it('indexes documents and performs Top-K semantic searches', async () => {
    const indexRes = await turbovecTool.execute({
      action: 'index',
      indexName: 'test_idx',
      items: [
        { id: 'auth_doc', text: 'OAuth2 and JWT authentication mechanisms for web security.', metadata: { topic: 'security' } },
        { id: 'db_doc', text: 'PostgreSQL database replication, indexing, and connection pooling.', metadata: { topic: 'database' } },
        { id: 'ui_doc', text: 'React components, Tailwind CSS styling, and client-side routing.', metadata: { topic: 'frontend' } },
      ],
    })

    expect(indexRes.success).toBe(true)
    expect(indexRes.indexedCount).toBe(3)
    expect(indexRes.totalVectors).toBe(3)

    // Search for security/auth
    const searchRes = await turbovecTool.execute({
      action: 'search',
      indexName: 'test_idx',
      query: 'OAuth authentication and tokens',
      topK: 2,
    })

    expect(searchRes.success).toBe(true)
    expect(searchRes.results.length).toBeGreaterThan(0)
    expect(searchRes.results[0].id).toBe('auth_doc')
  })

  it('retrieves index stats and memory compression metrics', async () => {
    await turbovecTool.execute({
      action: 'index',
      indexName: 'test_idx',
      items: [
        { id: 'd1', text: 'Vector quantization algorithms' },
        { id: 'd2', text: 'Fast Walsh Hadamard Transform' },
      ],
    })

    const statsRes = await turbovecTool.execute({
      action: 'stats',
      indexName: 'test_idx',
    })

    expect(statsRes.success).toBe(true)
    expect(statsRes.stats.vectorCount).toBe(2)
    expect(statsRes.stats.compressionRatio).toContain('x')
  })

  it('supports delete, clear, and list_indices operations', async () => {
    await turbovecTool.execute({
      action: 'index',
      indexName: 'test_idx',
      items: [{ id: 'delete_me', text: 'Temporary test passage' }],
    })

    const delRes = await turbovecTool.execute({
      action: 'delete',
      indexName: 'test_idx',
      id: 'delete_me',
    })
    expect(delRes.success).toBe(true)
    expect(delRes.deleted).toBe(true)

    const listRes = await turbovecTool.execute({ action: 'list_indices' })
    expect(listRes.success).toBe(true)
    expect(listRes.count).toBeGreaterThan(0)

    const clearRes = await turbovecTool.execute({
      action: 'clear',
      indexName: 'test_idx',
    })
    expect(clearRes.success).toBe(true)
    expect(clearRes.remaining).toBe(0)
  })

  it('validates required inputs gracefully', async () => {
    const badAction = await turbovecTool.execute({ action: 'unknown_op' })
    expect(badAction.success).toBe(false)

    const emptyIndex = await turbovecTool.execute({ action: 'index', items: [] })
    expect(emptyIndex.success).toBe(false)
  })
})
