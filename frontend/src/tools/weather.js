// Open-Meteo — free, no API key, CORS-friendly
export const weatherTool = {
  schema: {
    description: 'Get current weather and 7-day forecast for a location',
    parameters: { type: 'object', properties: {
      location: { type: 'string', description: 'City name or coordinates' },
    }, required: ['location'] },
  },
  async execute({ location }) {
    // Geocode
    const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`)
    const geo = await geoResp.json()
    if (!geo.results?.length) return { success: false, error: `Location not found: ${location}` }
    const { latitude, longitude, name, country } = geo.results[0]

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
    const resp = await fetch(url)
    const data = await resp.json()
    const WMO = { 0:'Clear',1:'Mostly Clear',2:'Partly Cloudy',3:'Overcast',45:'Foggy',48:'Rime Fog',51:'Light Drizzle',53:'Drizzle',55:'Heavy Drizzle',61:'Light Rain',63:'Rain',65:'Heavy Rain',71:'Light Snow',73:'Snow',75:'Heavy Snow',80:'Light Showers',81:'Showers',82:'Heavy Showers',95:'Thunderstorm',96:'Hail Thunderstorm',99:'Heavy Hail Thunderstorm' }

    return {
      success: true, tool: 'weather',
      location: `${name}, ${country}`,
      current: {
        temperature: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        wind_speed: data.current.wind_speed_10m,
        condition: WMO[data.current.weather_code] || 'Unknown',
      },
      forecast: data.daily.time.map((d, i) => ({
        date: d, high: data.daily.temperature_2m_max[i],
        low: data.daily.temperature_2m_min[i],
        condition: WMO[data.daily.weather_code[i]] || 'Unknown',
      })),
    }
  }
}
