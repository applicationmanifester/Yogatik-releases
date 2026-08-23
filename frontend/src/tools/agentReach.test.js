import { describe, it, expect } from 'vitest'
import {
  detectPlatform,
  searchPlatform,
  fetchPost,
  extractVideoInfo,
  agentReachTool,
  SUPPORTED_PLATFORMS,
} from './agentReach'

describe('Agent-Reach Multi-Platform Intelligence Suite', () => {
  it('supports 13+ content, code, video, and social platforms', () => {
    expect(SUPPORTED_PLATFORMS.length).toBeGreaterThanOrEqual(13)
    const ids = SUPPORTED_PLATFORMS.map(p => p.id)
    expect(ids).toContain('twitter')
    expect(ids).toContain('reddit')
    expect(ids).toContain('youtube')
    expect(ids).toContain('github')
    expect(ids).toContain('hackernews')
    expect(ids).toContain('xiaohongshu')
    expect(ids).toContain('bilibili')
  })

  it('detects platform correctly from various URLs', () => {
    expect(detectPlatform('https://twitter.com/OpenAI/status/12345')).toBe('twitter')
    expect(detectPlatform('https://x.com/perplexity_ai')).toBe('twitter')
    expect(detectPlatform('https://www.reddit.com/r/MachineLearning/comments/xyz')).toBe('reddit')
    expect(detectPlatform('https://github.com/Panniantong/Agent-Reach')).toBe('github')
    expect(detectPlatform('https://news.ycombinator.com/item?id=45678')).toBe('hackernews')
    expect(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube')
    expect(detectPlatform('https://example.com/page')).toBe('web')
  })

  it('searches platforms and returns structured results', async () => {
    const result = await searchPlatform('hackernews', 'AI agents', 3)
    expect(result.platform).toBe('hackernews')
    expect(result.query).toBe('AI agents')
    expect(Array.isArray(result.results)).toBe(true)
  })

  it('extracts YouTube video metadata and thumbnail', async () => {
    const video = await extractVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(video.success).toBe(true)
    expect(video.platform).toBe('youtube')
    expect(video.videoId).toBe('dQw4w9WgXcQ')
    expect(video.thumbnailUrl).toContain('dQw4w9WgXcQ')
  })

  it('agentReachTool executes platform search, post fetch, and platform listing', async () => {
    const listRes = await agentReachTool.execute({ action: 'list_platforms' })
    expect(listRes.success).toBe(true)
    expect(listRes.totalPlatforms).toBeGreaterThanOrEqual(13)

    const searchRes = await agentReachTool.execute({
      action: 'search_platform',
      platform: 'reddit',
      query: 'deep learning',
      limit: 2,
    })
    expect(searchRes.success).toBe(true)
    expect(searchRes.platform).toBe('reddit')

    const videoRes = await agentReachTool.execute({
      action: 'extract_video',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    })
    expect(videoRes.success).toBe(true)
    expect(videoRes.videoId).toBe('dQw4w9WgXcQ')
  })
})
