// WHOIS lookup via free API
import { proxyFetch } from './http'

export const whoisTool = {
  schema: {
    description: 'Lookup WHOIS information for a domain',
    parameters: { type: 'object', properties: {
      domain: { type: 'string', description: 'Domain name (e.g., google.com)' },
    }, required: ['domain'] },
  },
  async execute({ domain }) {
    const resp = await proxyFetch(`https://rdap.org/domain/${domain}`)
    if (!resp.ok) return { success: false, error: 'WHOIS lookup failed' }
    const data = await resp.json()
    return {
      success: true, tool: 'whois', domain,
      name: data.ldhName || domain,
      status: data.status || [],
      nameservers: (data.nameservers || []).map(ns => ns.ldhName),
      events: (data.events || []).map(e => ({ action: e.eventAction, date: e.eventDate })),
      registrar: data.entities?.find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'Unknown',
    }
  }
}
