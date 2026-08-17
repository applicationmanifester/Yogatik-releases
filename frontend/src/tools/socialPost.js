/**
 * Social Media Content & Post Creator Tool
 * Generates platform-optimized content tailored for X (Twitter), LinkedIn,
 * Instagram, TikTok, YouTube Shorts, and Facebook with character counts and structure.
 */

const PLATFORM_CONFIG = {
  x: { name: 'X (Twitter)', maxLen: 280, supportsThread: true, defaultTone: 'punchy and concise' },
  twitter: { name: 'X (Twitter)', maxLen: 280, supportsThread: true, defaultTone: 'punchy and concise' },
  linkedin: { name: 'LinkedIn', maxLen: 3000, supportsThread: false, defaultTone: 'professional and insightful' },
  instagram: { name: 'Instagram', maxLen: 2200, supportsThread: false, defaultTone: 'engaging, visual with emojis' },
  tiktok: { name: 'TikTok / Shorts', maxLen: 2200, supportsThread: false, defaultTone: 'high energy script format' },
  facebook: { name: 'Facebook', maxLen: 5000, supportsThread: false, defaultTone: 'community-focused storytelling' },
}

export const socialPostTool = {
  schema: {
    description:
      'Format and structure high-converting social media posts and scripts. ' +
      'Tailors layout, character limits, hooks, hashtags, and script timestamps for "x" (Twitter), "linkedin", "instagram", "tiktok", or "facebook". ' +
      'Examples: "write an X thread about AI agents", "create a LinkedIn post about career growth", "generate a TikTok script for productivity tips".',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['x', 'twitter', 'linkedin', 'instagram', 'tiktok', 'facebook'],
          description: 'Target social media platform (required)',
        },
        topic: {
          type: 'string',
          description: 'Topic, concept, or announcement to write about (required)',
        },
        content_type: {
          type: 'string',
          enum: ['single_post', 'thread', 'video_script', 'carousel_text'],
          description: 'Type of content format (default "single_post", or "thread" for X, "video_script" for TikTok)',
        },
        tone: {
          type: 'string',
          description: 'Tone of voice (e.g. "educational", "inspirational", "humorous", "provocative", "professional")',
        },
        target_audience: {
          type: 'string',
          description: 'Target audience (e.g. "tech founders", "job seekers", "students", "creators")',
        },
        include_hashtags: {
          type: 'boolean',
          description: 'Whether to generate curated hashtags (default true)',
        },
      },
      required: ['platform', 'topic'],
    },
  },

  async execute(args = {}) {
    const rawPlatform = (args?.platform || 'x').toLowerCase()
    const topic = (args?.topic || args?.prompt || '').trim()

    if (!topic) {
      return { success: false, error: 'Please provide a topic or message for the post.' }
    }

    const config = PLATFORM_CONFIG[rawPlatform] || PLATFORM_CONFIG.x
    const contentType = args?.content_type || (rawPlatform === 'tiktok' ? 'video_script' : (rawPlatform === 'x' && topic.length > 250 ? 'thread' : 'single_post'))
    const tone = args?.tone || config.defaultTone
    const audience = args?.target_audience || 'general audience'
    const includeHashtags = args?.include_hashtags !== false

    return {
      success: true,
      tool: 'social_post_generator',
      platform: rawPlatform,
      platformName: config.name,
      contentType,
      topic,
      tone,
      audience,
      characterLimit: config.maxLen,
      includeHashtags,
      guidelines: {
        x: 'Keep tweets under 280 characters. Use strong opening hooks and clear CTAs.',
        linkedin: 'Use 1-2 sentence paragraphs with line breaks. Add a thought-provoking closing question.',
        instagram: 'Open with an intriguing line before the "more" fold. Include 15-25 relevant niche hashtags.',
        tiktok: 'Structure into [Hook 0-3s], [Problem 3-15s], [Value/Steps 15-45s], and [CTA 45-60s].',
        facebook: 'Focus on relatable storytelling and encourage discussion in comments.',
      }[rawPlatform] || 'Deliver high value and clear formatting.',
    }
  },
}
