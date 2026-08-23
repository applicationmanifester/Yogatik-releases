// RSS feed reader via CORS proxy
import { proxyFetch } from './http'

const PRESETS = {
  hackernews: 'https://hnrss.org/frontpage',
  bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
  techcrunch: 'https://techcrunch.com/feed/',
  reddit_tech: 'https://www.reddit.com/r/technology/.rss',
  arxiv_ai: 'https://export.arxiv.org/rss/cs.AI',
}

export const rssTool = {
  schema: {
    description: 'Read RSS/Atom feed (presets: hackernews, bbc, techcrunch, reddit_tech, arxiv_ai)',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'RSS feed URL or preset name' },
      count: { type: 'number', description: 'Number of items (default 5)' },
    }, required: ['url'] },
  },
  async execute({ url, count = 5 }) {
    if (typeof url !== 'string' || !url.trim()) return { success: false, error: 'url is required (a feed URL, or one of the preset names)' }
    const feedUrl = PRESETS[url.toLowerCase()] || url
    const resp = await proxyFetch(feedUrl)
    const text = await resp.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const items = [...doc.querySelectorAll('item, entry')].slice(0, count).map(item => ({
      title: item.querySelector('title')?.textContent || '',
      link: item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '',
      description: (item.querySelector('description, summary')?.textContent || '').replace(/<[^>]+>/g, '').slice(0, 200),
    }))
    // The card's header reads feed_title; without it every feed said "RSS Feed".
    const feed_title = doc.querySelector('channel > title, feed > title')?.textContent?.trim() || ''
    return { success: true, tool: 'rss_feed', source: feedUrl, feed_title, items }
  }
}
