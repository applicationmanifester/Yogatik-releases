// Open-Meteo — free, no API key, CORS-friendly
import { getDeviceLocation, isCurrentLocation } from './geolocate'
import { localeSnapshot } from '../locale'

/**
 * Units follow the user's region unless they ask for something else.
 *
 * Open-Meteo defaults to Celsius, km/h and mm when no unit parameters are sent,
 * and none were — so American users were served metric weather with no way to
 * change it, the exact inverse of the US-hardcoding everywhere else in the app.
 * The GB row is why this is not one imperial/metric switch: Britain reports
 * temperature in Celsius and wind in mph.
 */
function resolveUnits(requested) {
  const snap = localeSnapshot()
  if (requested === 'metric' || requested === 'imperial') {
    const forced = localeSnapshot({ overrides: { units: requested } })
    return forced.weather
  }
  return snap.weather
}

const LABEL = {
  celsius: '°C', fahrenheit: '°F',
  kmh: 'km/h', mph: 'mph', ms: 'm/s', kn: 'kn',
  mm: 'mm', inch: 'in',
}

export const weatherTool = {
  schema: {
    description: 'Get current weather and 7-day forecast for a location. If location is omitted, "current", or "here", it uses the device GPS (browser geolocation), never IP.',
    parameters: { type: 'object', properties: {
      location: { type: 'string', description: 'City name, coordinates, or "current" for device GPS location' },
      units: { type: 'string', enum: ['auto', 'metric', 'imperial'], description: 'Unit system. Defaults to "auto", which follows the user\'s region (°F in the US, °C elsewhere; mph in the US and UK).' },
    }, required: [] },
  },
  async execute(args = {}) {
    const rawLoc = typeof args === 'string'
      ? args
      : (args?.location ?? args?.city ?? args?.place ?? args?.query ?? args?.address ?? 'current')
    const location = (typeof rawLoc === 'string' && rawLoc.trim()) ? rawLoc.trim() : 'current'
    let latitude = null
    let longitude = null
    let name = ''
    let country = ''

    const isCurrent = isCurrentLocation(location)

    if (isCurrent) {
      try {
        const pos = await getDeviceLocation()
        latitude = pos.lat
        longitude = pos.lon
        name = 'Your location'
        country = `(GPS ±${Math.round(pos.accuracy_m || 0)}m)`
      } catch (e) {
        // No IP fallback and no silent wrong-city default: ask for a place.
        return {
          success: false,
          error: `${e.message} Tell me a city or place name and I'll use that instead.`,
          needs_location: true,
        }
      }
    }

    if (latitude === null || longitude === null) {
      const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`)
      const geo = await geoResp.json()
      if (!geo.results?.length) return { success: false, error: `Location not found: ${location}` }
      latitude = geo.results[0].latitude
      longitude = geo.results[0].longitude
      name = geo.results[0].name
      country = geo.results[0].country
    }

    const units = resolveUnits(args?.units)
    const unitParams = `&temperature_unit=${units.temperature}&wind_speed_unit=${units.wind}&precipitation_unit=${units.precipitation}`
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto${unitParams}`
    const resp = await fetch(url)
    const data = await resp.json()
    const WMO = { 0:'Clear',1:'Mostly Clear',2:'Partly Cloudy',3:'Overcast',45:'Foggy',48:'Rime Fog',51:'Light Drizzle',53:'Drizzle',55:'Heavy Drizzle',61:'Light Rain',63:'Rain',65:'Heavy Rain',71:'Light Snow',73:'Snow',75:'Heavy Snow',80:'Light Showers',81:'Showers',82:'Heavy Showers',95:'Thunderstorm',96:'Hail Thunderstorm',99:'Heavy Hail Thunderstorm' }

    return {
      success: true, tool: 'weather',
      location: `${name}, ${country}`,
      // The card USED to print "°C" and "km/h" as literal text. The moment the
      // request stopped always being metric that became a lie, so the units
      // travel with the numbers. Adding a field a card reads means adding an
      // assertion to cardContract.test.js — that is what keeps this honest.
      units: { temperature: units.temperature, wind: units.wind, precipitation: units.precipitation },
      temperature_unit: LABEL[units.temperature] || '°C',
      wind_unit: LABEL[units.wind] || 'km/h',
      current: {
        temperature: Math.round(data.current.temperature_2m),
        feels_like: data.current.apparent_temperature != null ? Math.round(data.current.apparent_temperature) : Math.round(data.current.temperature_2m),
        humidity: data.current.relative_humidity_2m,
        wind_speed: Math.round(data.current.wind_speed_10m),
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
