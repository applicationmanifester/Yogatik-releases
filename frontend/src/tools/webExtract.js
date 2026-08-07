// Web content extraction via CORS proxy
import { proxyText } from './http'

export const webExtractTool = {
  schema: {
    description: 'Extract readable text content from a web page URL',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'Web page URL' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    const html = await proxyText(url)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    // Remove scripts, styles, nav, footer
    doc.querySelectorAll('script,style,nav,footer,header,aside,iframe').forEach(el => el.remove())
    // Try article first, then main, then body
    const content = doc.querySelector('article') || doc.querySelector('main') || doc.body
    const text = content?.innerText || content?.textContent || ''
    const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 5000)
    return {
      success: true, tool: 'web_extract', url,
      title: doc.querySelector('title')?.textContent || '',
      text: cleaned, length: cleaned.length,
    }
  }
}
