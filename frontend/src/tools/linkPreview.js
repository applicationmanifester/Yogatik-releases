// Link preview via CORS proxy — extracts Open Graph meta tags
export const linkPreviewTool = {
  schema: {
    description: 'Get a link preview (title, description, image) for a URL',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'URL to preview' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const resp = await fetch(proxy)
    const html = await resp.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const meta = (name) => doc.querySelector(`meta[property="og:${name}"], meta[name="og:${name}"]`)?.getAttribute('content') || ''
    return {
      success: true, tool: 'link_preview', url,
      title: meta('title') || doc.querySelector('title')?.textContent || '',
      description: meta('description') || doc.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      image: meta('image'),
      site_name: meta('site_name'),
    }
  }
}
