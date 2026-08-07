// ip-api.com — free, CORS-friendly
export const ipLookupTool = {
  schema: {
    description: 'Lookup geolocation data for an IP address',
    parameters: { type: 'object', properties: {
      ip: { type: 'string', description: 'IP address (leave empty for your own)' },
    } },
  },
  async execute({ ip } = {}) {
    // ip-api.com is http-only on the free tier: the browser blocks it as mixed
    // content on an https page, and its https endpoint returns 403.
    const url = ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : 'https://ipwho.is/'
    try {
      const resp = await fetch(url)
      if (!resp.ok) return { success: false, error: `Lookup failed (${resp.status})` }
      const d = await resp.json()
      if (d.success === false) return { success: false, error: d.message || 'Lookup failed' }
      return {
        success: true, tool: 'ip_lookup',
        ip: d.ip,
        city: d.city, region: d.region, country: d.country, countryCode: d.country_code,
        isp: d.connection?.isp || d.connection?.org,
        timezone: d.timezone?.id,
        lat: d.latitude, lon: d.longitude,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }
}
