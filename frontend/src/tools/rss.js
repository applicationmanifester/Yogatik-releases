// RSS feed reader via CORS proxy
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
    const feedUrl = PRESETS[url.toLowerCase()] || url
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`
    const resp = await fetch(proxy)
    const text = await resp.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const items = [...doc.querySelectorAll('item, entry')].slice(0, count).map(item => ({
      title: item.querySelector('title')?.textContent || '',
      link: item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '',
      description: (item.querySelector('description, summary')?.textContent || '').replace(/<[^>]+>/g, '').slice(0, 200),
    }))
    return { success: true, tool: 'rss_feed', source: feedUrl, items }
  }
}
