// YouTube transcript extraction — uses free noembed API for metadata
// Transcript not accessible from browser due to CORS; provide video info instead
export const youtubeTool = {
  schema: {
    description: 'Get YouTube video information and metadata',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'YouTube video URL or ID' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    // Extract video ID
    const match = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/)
    const id = match?.[1] || url
    const resp = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
    if (!resp.ok) return { success: false, error: 'Failed to fetch video info' }
    const data = await resp.json()
    if (data.error) return { success: false, error: data.error }
    return {
      success: true, tool: 'youtube',
      title: data.title, author: data.author_name,
      thumbnail: data.thumbnail_url,
      url: `https://www.youtube.com/watch?v=${id}`,
    }
  }
}
