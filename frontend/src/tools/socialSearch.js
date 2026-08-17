/**
 * Social Media Search & Intelligence Tool
 * Queries and aggregates discussions, posts, tweets, threads, and trends
 * across X (Twitter), LinkedIn, Reddit, Instagram, TikTok, Facebook, YouTube, and Threads.
 */

import { webSearchTool } from './webSearch'

const PLATFORM_SITES = {
  x: 'twitter.com OR x.com',
  twitter: 'twitter.com OR x.com',
  linkedin: 'linkedin.com/posts OR linkedin.com/pulse OR linkedin.com/feed',
  reddit: 'reddit.com',
  instagram: 'instagram.com/p/ OR instagram.com/reel/ OR instagram.com/explore OR instagram.com',
  tiktok: 'tiktok.com',
  facebook: 'facebook.com',
  threads: 'threads.net',
  youtube: 'youtube.com/watch OR youtube.com/shorts OR youtube.com',
  github: 'github.com',
  pinterest: 'pinterest.com/pin/ OR pinterest.com',
  bluesky: 'bsky.app',
  mastodon: 'mastodon.social',
  producthunt: 'producthunt.com',
  medium: 'medium.com',
  substack: 'substack.com',
  discord: 'discord.com OR discord.gg',
  telegram: 't.me',
}

const PLATFORM_NAMES = {
  x: 'X (Twitter)',
  twitter: 'X (Twitter)',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  threads: 'Threads',
  youtube: 'YouTube',
  github: 'GitHub',
  pinterest: 'Pinterest',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  producthunt: 'Product Hunt',
  medium: 'Medium',
  substack: 'Substack',
  discord: 'Discord',
  telegram: 'Telegram',
}

function detectPlatformFromUrl(url = '') {
  const u = String(url).toLowerCase()
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x'
  if (u.includes('linkedin.com')) return 'linkedin'
  if (u.includes('reddit.com')) return 'reddit'
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('facebook.com')) return 'facebook'
  if (u.includes('threads.net')) return 'threads'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('github.com')) return 'github'
  if (u.includes('pinterest.com')) return 'pinterest'
  if (u.includes('bsky.app')) return 'bluesky'
  if (u.includes('mastodon.social') || u.includes('mastodon.')) return 'mastodon'
  if (u.includes('producthunt.com')) return 'producthunt'
  if (u.includes('medium.com')) return 'medium'
  if (u.includes('substack.com')) return 'substack'
  if (u.includes('discord.com') || u.includes('discord.gg')) return 'discord'
  if (u.includes('t.me')) return 'telegram'
  return 'social'
}

export const socialSearchTool = {
  schema: {
    description:
      'Search live posts, tweets, threads, discussions, and creators across social media platforms. ' +
      'Supported platforms: "x" (Twitter), "linkedin", "reddit", "instagram", "tiktok", "facebook", "threads", "youtube", "pinterest", "bluesky", "producthunt", "medium", "substack", "github", or "all". ' +
      'Examples: "viral instagram posts", "search x for latest ai announcements", "find linkedin posts on product management", "search reddit for best keyboards".',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search topic, keyword, hashtag, or handle to search for',
        },
        platform: {
          type: 'string',
          enum: ['all', 'x', 'twitter', 'linkedin', 'reddit', 'instagram', 'tiktok', 'facebook', 'threads', 'youtube', 'github', 'pinterest', 'bluesky', 'mastodon', 'producthunt', 'medium', 'substack', 'discord', 'telegram'],
          description: 'Specific platform to target, or "all" to aggregate across platforms (default "all")',
        },
        recency: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year'],
          description: 'Time filter for recent content (default "week")',
        },
        max_results: {
          type: 'number',
          description: 'Number of results to return (default 8, max 15)',
        },
      },
      required: ['query'],
    },
  },

  async execute(args = {}) {
    const rawQuery = args?.query || args?.topic || args?.search || ''
    if (!rawQuery.trim()) {
      return { success: false, error: 'Please provide a search query.' }
    }

    const platform = (args?.platform || 'all').toLowerCase()
    const recency = args?.recency || 'week'
    const maxResults = Math.min(15, Math.max(1, args?.max_results || 8))

    let siteFilter = ''
    if (platform !== 'all' && PLATFORM_SITES[platform]) {
      siteFilter = PLATFORM_SITES[platform]
    } else if (platform === 'all') {
      siteFilter = 'twitter.com OR linkedin.com OR reddit.com OR instagram.com OR tiktok.com'
    }

    const searchQuery = `${rawQuery.trim()} (${siteFilter})`

    try {
      const searchRes = await webSearchTool.execute({
        query: searchQuery,
        recency,
        max_results: maxResults,
      })

      if (!searchRes || !searchRes.results || !searchRes.results.length) {
        // Fallback without strict site query in case of narrow matches
        const broadRes = await webSearchTool.execute({
          query: `${rawQuery.trim()} ${platform !== 'all' ? PLATFORM_NAMES[platform] || platform : 'social media'}`,
          recency,
          max_results: maxResults,
        })

        const broadResults = (broadRes?.results || []).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          platform: detectPlatformFromUrl(r.url),
          platformName: PLATFORM_NAMES[detectPlatformFromUrl(r.url)] || 'Social Media',
          published: r.published,
        }))

        return {
          success: true,
          tool: 'social_search',
          query: rawQuery,
          platform: platform,
          platformName: PLATFORM_NAMES[platform] || 'All Platforms',
          count: broadResults.length,
          results: broadResults,
        }
      }

      const results = searchRes.results.map(r => {
        const detected = detectPlatformFromUrl(r.url)
        return {
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          platform: detected,
          platformName: PLATFORM_NAMES[detected] || 'Social Media',
          published: r.published,
        }
      })

      return {
        success: true,
        tool: 'social_search',
        query: rawQuery,
        platform: platform,
        platformName: PLATFORM_NAMES[platform] || 'All Platforms',
        count: results.length,
        results,
      }
    } catch (err) {
      return { success: false, error: err.message || 'Social media search failed.' }
    }
  },
}
