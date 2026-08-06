// ip-api.com — free, CORS-friendly
export const ipLookupTool = {
  schema: {
    description: 'Lookup geolocation data for an IP address',
    parameters: { type: 'object', properties: {
      ip: { type: 'string', description: 'IP address (leave empty for your own)' },
    } },
  },
  async execute({ ip = '' }) {
    const url = ip ? `http://ip-api.com/json/${ip}` : 'http://ip-api.com/json/'
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status === 'fail') return { success: false, error: data.message }
    return { success: true, tool: 'ip_lookup', ...data }
  }
}
