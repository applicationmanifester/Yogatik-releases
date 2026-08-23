// WHOIS lookup via free API
import { proxyFetch } from './http'

// RDAP event actions vary ('registration' | 'created' | 'expiration'); match loosely.
const eventDate = (events, action) => {
  const e = (events || []).find(x => String(x.eventAction || '').toLowerCase().includes(action))
  if (!e?.eventDate) return ''
  const d = new Date(e.eventDate)
  return Number.isNaN(d.getTime()) ? e.eventDate : d.toISOString().slice(0, 10)
}

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
      // Flattened for the card, which showed "Created: undefined · Expires: undefined".
      creation_date: eventDate(data.events, 'registration') || eventDate(data.events, 'created') || 'Unknown',
      expiration_date: eventDate(data.events, 'expiration') || 'Unknown',
      registrar: data.entities?.find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'Unknown',
    }
  }
}
