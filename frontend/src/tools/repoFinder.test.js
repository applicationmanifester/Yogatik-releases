import { describe, it, expect } from 'vitest'
import {
  findSimilarRepos,
  inspectRepoHealth,
  repoFinderTool,
  CURATED_REPO_CATEGORIES,
} from './repoFinder'

describe('GitHub Repo Finder & Discovery Suite', () => {
  it('contains curated open-source repositories across cutting-edge domains', () => {
    expect(Object.keys(CURATED_REPO_CATEGORIES).length).toBeGreaterThanOrEqual(7)
    expect(CURATED_REPO_CATEGORIES.ai_agents).toBeDefined()
    expect(CURATED_REPO_CATEGORIES.security_defense).toBeDefined()
    expect(CURATED_REPO_CATEGORIES.vector_rag).toBeDefined()
    expect(CURATED_REPO_CATEGORIES.embedded_aerospace).toBeDefined()
  })

  it('matches curated categories when searching for known topics', async () => {
    const res = await findSimilarRepos('turbovec')
    expect(res.matchedCategory).toBe('vector_rag')
    expect(res.repositories.some(r => r.name === 'ryancodrai/turbovec')).toBe(true)
  })

  it('returns specific category repositories when requested', async () => {
    const res = await findSimilarRepos('', 'embedded_aerospace')
    expect(res.category).toBe('embedded_aerospace')
    expect(res.repositories.some(r => r.name === 'nasa/fprime')).toBe(true)
  })

  it('repoFinderTool executes explore_trending, list_categories, and find_similar', async () => {
    const listRes = await repoFinderTool.execute({ action: 'list_categories' })
    expect(listRes.success).toBe(true)
    expect(listRes.totalCategories).toBeGreaterThanOrEqual(7)

    const trendingRes = await repoFinderTool.execute({
      action: 'explore_trending',
      category: 'security_defense',
    })
    expect(trendingRes.success).toBe(true)
    expect(trendingRes.repositories.some(r => r.name.includes('numbat') || r.name.includes('deepsec'))).toBe(true)

    const inspectRes = await repoFinderTool.execute({
      action: 'inspect_repo',
      repo: 'nasa/fprime',
    })
    expect(inspectRes.success).toBe(true)
    expect(inspectRes.name).toContain('nasa/fprime')
  })
})
