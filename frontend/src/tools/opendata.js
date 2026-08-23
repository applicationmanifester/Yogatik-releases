/**
 * Open, independent data sources — second batch. Each endpoint was probed for
 * status and CORS before inclusion; all are keyless and browser-callable.
 *
 *   npm registry / PyPI / GitHub   package + repo metadata, CORS
 *   Project Gutenberg (Gutendex)   public-domain full texts, CORS
 *   Photon (Komoot, OSM data)      geocoding without an API key, CORS
 *   Frankfurter (ECB rates)        open-source FX service, CORS
 *   USGS                           earthquake feed, CORS
 *   Open-Meteo Air Quality         AQI / particulates / pollen, keyless, CORS
 *   LanguageTool (open source)     grammar + spell proofreading, CORS *
 *
 * Rejected after testing: OpenAQ (now requires a key), MusicBrainz (throttles
 * non-identifying user agents), Zenodo (403), Nominatim (403 without a UA policy).
 */

import { getDeviceLocation } from './geolocate'

const json = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).hostname}`)
  return r.json()
}

// ─── Software packages ───────────────────────────────────────────────────────
export const packageTool = {
  schema: {
    description:
      'Look up a software package or repository: current version, licence, dependencies, ' +
      'maintenance status and links. Covers npm, PyPI and GitHub. ' +
      'Use when asked about a library, "is X maintained", or which version is current — the answer changes constantly and cannot come from memory.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Package name, or owner/repo for GitHub' },
        registry: { type: 'string', enum: ['npm', 'pypi', 'github'], description: 'Where to look' },
      },
      required: ['name', 'registry'],
    },
  },
  async execute({ name, registry }) {
    if (typeof name !== 'string' || !name.trim()) return { success: false, error: 'name is required (the package name)' }
    try {
      if (registry === 'npm') {
        const d = await json(`https://registry.npmjs.org/${encodeURIComponent(name)}`)
        const latest = d['dist-tags']?.latest
        const v = d.versions?.[latest] || {}
        const published = d.time?.[latest]
        return {
          success: true, tool: 'package', registry: 'npm',
          name: d.name,
          version: latest,
          published,
          // Staleness is usually the real question behind "is this maintained".
          months_since_release: published
            ? Math.round((Date.now() - new Date(published)) / 2.6e9) : undefined,
          description: d.description,
          license: v.license,
          homepage: d.homepage,
          repository: typeof d.repository === 'object' ? d.repository.url : d.repository,
          dependencies: Object.keys(v.dependencies || {}),
          versions_published: Object.keys(d.versions || {}).length,
          url: `https://www.npmjs.com/package/${d.name}`,
        }
      }

      if (registry === 'pypi') {
        const d = await json(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`)
        const i = d.info || {}
        const files = d.urls || []
        return {
          success: true, tool: 'package', registry: 'pypi',
          name: i.name,
          version: i.version,
          published: files[0]?.upload_time_iso_8601,
          description: i.summary,
          license: i.license || i.classifiers?.find(c => c.startsWith('License ::')),
          homepage: i.home_page || i.project_urls?.Homepage,
          requires_python: i.requires_python,
          dependencies: (i.requires_dist || []).slice(0, 20),
          url: i.package_url,
        }
      }

      const repo = name.includes('/') ? name : null
      if (repo) {
        const d = await json(`https://api.github.com/repos/${repo}`)
        return {
          success: true, tool: 'package', registry: 'github',
          name: d.full_name,
          description: d.description,
          stars: d.stargazers_count,
          forks: d.forks_count,
          open_issues: d.open_issues_count,
          language: d.language,
          license: d.license?.spdx_id,
          last_push: d.pushed_at,
          archived: d.archived,
          months_since_push: Math.round((Date.now() - new Date(d.pushed_at)) / 2.6e9),
          url: d.html_url,
        }
      }

      const d = await json(`https://api.github.com/search/repositories?q=${encodeURIComponent(name)}&per_page=5`)
      return {
        success: true, tool: 'package', registry: 'github', query: name,
        repos: (d.items || []).map(r => ({
          name: r.full_name, description: r.description, stars: r.stargazers_count,
          language: r.language, license: r.license?.spdx_id, url: r.html_url,
          last_push: r.pushed_at,
        })),
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Public-domain books, full text ──────────────────────────────────────────
export const gutenbergTool = {
  schema: {
    description:
      'Search Project Gutenberg for public-domain books and optionally fetch the full text. ' +
      'Use for classic literature, historical documents, or when the user wants to quote or analyse a public-domain work.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title or author' },
        fetch_text: { type: 'boolean', description: 'Download the full text of the top match (can be long)' },
        max_chars: { type: 'number', description: 'Cap on returned text (default 20000)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, fetch_text = false, max_chars = 20000 }) {
    try {
      const d = await json(`https://gutendex.com/books?search=${encodeURIComponent(query)}`)
      const books = (d.results || []).slice(0, 5).map(b => ({
        id: b.id,
        title: b.title,
        authors: (b.authors || []).map(a => a.name),
        downloads: b.download_count,
        subjects: (b.subjects || []).slice(0, 4),
        url: `https://www.gutenberg.org/ebooks/${b.id}`,
      }))
      if (!books.length) return { success: false, error: `No public-domain book matches "${query}"` }

      if (!fetch_text) return { success: true, tool: 'gutenberg', query, books }

      const top = d.results[0]
      const txtUrl = Object.entries(top.formats || {})
        .find(([k]) => k.startsWith('text/plain'))?.[1]
      if (!txtUrl) return { success: true, tool: 'gutenberg', query, books, note: 'No plain-text edition available.' }

      const r = await fetch(txtUrl)
      let text = await r.text()
      // Strip the licence header/footer Gutenberg wraps around every work.
      const start = text.indexOf('*** START OF')
      const end = text.indexOf('*** END OF')
      if (start > -1) text = text.slice(text.indexOf('\n', start) + 1)
      if (end > -1) text = text.slice(0, text.lastIndexOf('*** END OF'))

      const cap = Math.min(Math.max(1000, max_chars | 0), 60000)
      return {
        success: true, tool: 'gutenberg', query, books,
        text: text.trim().slice(0, cap),
        truncated: text.length > cap,
        chars_total: text.length,
        source: books[0].url,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Geocoding (OpenStreetMap data) ──────────────────────────────────────────
export const geocodeTool = {
  schema: {
    description:
      'Convert a place name into coordinates and structured address data using OpenStreetMap, or reverse a coordinate pair into a place. ' +
      'Useful before a weather lookup, or for "where is X" and distance questions.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'Place name or address' },
        lat: { type: 'number', description: 'Latitude for reverse lookup' },
        lon: { type: 'number', description: 'Longitude for reverse lookup' },
      },
    },
  },
  async execute({ place, lat, lon }) {
    try {
      const url = place
        ? `https://photon.komoot.io/api/?q=${encodeURIComponent(place)}&limit=5`
        : `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`
      if (!place && (lat == null || lon == null)) {
        return { success: false, error: 'Give either a place name or lat and lon.' }
      }
      const d = await json(url)
      const places = (d.features || []).map(f => ({
        name: f.properties.name,
        type: f.properties.osm_value || f.properties.type,
        city: f.properties.city,
        state: f.properties.state,
        country: f.properties.country,
        postcode: f.properties.postcode,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      }))
      if (!places.length) return { success: false, error: 'No matching place found.' }
      return { success: true, tool: 'geocode', places, attribution: 'OpenStreetMap contributors (ODbL)' }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Currency (European Central Bank rates) ──────────────────────────────────
export const currencyTool = {
  schema: {
    description:
      'Convert between currencies at European Central Bank reference rates, or list rates. Supports historical dates. ' +
      'Rates change daily, so never answer this from memory.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Currency code, e.g. USD' },
        to: { type: 'string', description: 'Currency code, e.g. INR' },
        amount: { type: 'number', description: 'Amount to convert (default 1)' },
        date: { type: 'string', description: 'YYYY-MM-DD for a historical rate' },
      },
      required: ['from', 'to'],
    },
  },
  async execute({ from, to, amount = 1, date }) {
    if (typeof from !== 'string' || typeof to !== 'string' || !from.trim() || !to.trim()) {
      return { success: false, error: 'from and to currency codes are required, e.g. {from: "USD", to: "INR"}' }
    }
    try {
      const when = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'latest'
      const d = await json(
        `https://api.frankfurter.app/${when}?from=${encodeURIComponent(from.toUpperCase())}&to=${encodeURIComponent(to.toUpperCase())}`
      )
      const rate = d.rates?.[to.toUpperCase()]
      if (rate == null) return { success: false, error: `No rate for ${from} → ${to}` }
      return {
        success: true, tool: 'currency',
        from: from.toUpperCase(), to: to.toUpperCase(),
        rate, amount,
        result: Number((amount * rate).toFixed(4)),
        date: d.date,
        source: 'European Central Bank via Frankfurter',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Earthquakes (USGS) ──────────────────────────────────────────────────────
export const earthquakeTool = {
  schema: {
    description: 'Recent earthquakes from the USGS feed, optionally near a location. Use for "was there an earthquake" and seismic activity questions.',
    parameters: {
      type: 'object',
      properties: {
        min_magnitude: { type: 'number', description: 'Minimum magnitude (default 4.5)' },
        days: { type: 'number', description: 'How many days back (default 1, max 30)' },
        lat: { type: 'number', description: 'Centre latitude for a radius search' },
        lon: { type: 'number', description: 'Centre longitude' },
        radius_km: { type: 'number', description: 'Radius in km (default 500)' },
      },
    },
  },
  async execute({ min_magnitude = 4.5, days = 1, lat, lon, radius_km = 500 }) {
    try {
      const start = new Date(Date.now() - Math.min(Math.max(1, days), 30) * 86400000)
        .toISOString().slice(0, 10)
      let url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}` +
        `&minmagnitude=${min_magnitude}&orderby=time&limit=20`
      if (lat != null && lon != null) url += `&latitude=${lat}&longitude=${lon}&maxradiuskm=${radius_km}`

      const d = await json(url)
      const quakes = (d.features || []).map(f => ({
        magnitude: f.properties.mag,
        place: f.properties.place,
        time: new Date(f.properties.time).toISOString(),
        depth_km: f.geometry.coordinates[2],
        tsunami: !!f.properties.tsunami,
        url: f.properties.url,
      }))
      return {
        success: true, tool: 'earthquake',
        count: quakes.length,
        quakes,
        note: quakes.length ? undefined : `No earthquakes above magnitude ${min_magnitude} in that period.`,
        source: 'United States Geological Survey',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Air quality + pollen (Open-Meteo, same source as weather) ────────────────
const AQI_BANDS = [ // US AQI category from the composite index
  [50, 'Good'], [100, 'Moderate'], [150, 'Unhealthy for sensitive groups'],
  [200, 'Unhealthy'], [300, 'Very unhealthy'], [Infinity, 'Hazardous'],
]
export const airQualityTool = {
  schema: {
    description:
      'Current air quality (US + European AQI, PM2.5, PM10, ozone, NO₂, CO) and pollen for a location. ' +
      'Omit coordinates to use the device GPS; otherwise give lat/lon (geocode a place name first). ' +
      'Air quality changes hourly — never answer from memory.',
    parameters: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude (omit to use device GPS)' },
        lon: { type: 'number', description: 'Longitude (omit to use device GPS)' },
      },
    },
  },
  async execute({ lat, lon } = {}) {
    try {
      if (lat == null || lon == null) {
        try {
          const pos = await getDeviceLocation()
          lat = pos.lat; lon = pos.lon
        } catch (e) {
          return { success: false, needs_location: true, error: `${e.message} Give a place name and I'll use that.` }
        }
      }
      const fields = 'us_aqi,european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,' +
        'alder_pollen,birch_pollen,grass_pollen,ragweed_pollen'
      const d = await json(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=${fields}&timezone=auto`
      )
      const c = d.current || {}
      const aqi = c.us_aqi
      const category = aqi != null ? AQI_BANDS.find(([hi]) => aqi <= hi)[1] : undefined
      return {
        success: true, tool: 'air_quality',
        time: c.time,
        us_aqi: aqi, category, european_aqi: c.european_aqi,
        pollutants_ugm3: {
          pm2_5: c.pm2_5, pm10: c.pm10, ozone: c.ozone,
          nitrogen_dioxide: c.nitrogen_dioxide, sulphur_dioxide: c.sulphur_dioxide,
          carbon_monoxide: c.carbon_monoxide,
        },
        pollen_grains_m3: {
          alder: c.alder_pollen, birch: c.birch_pollen,
          grass: c.grass_pollen, ragweed: c.ragweed_pollen,
        },
        source: 'Open-Meteo Air Quality (CAMS)',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Grammar + spelling proofreader (LanguageTool, open source) ───────────────
export const grammarTool = {
  schema: {
    description:
      'Proofread text for grammar, spelling, punctuation and style using LanguageTool. ' +
      'Returns each issue with its position, message and suggested replacements, plus a corrected version. ' +
      'Use when the user asks to check, proofread, fix or improve the correctness of a piece of writing.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to proofread' },
        language: { type: 'string', description: 'Language code (default en-US). Use "auto" to detect.' },
      },
      required: ['text'],
    },
  },
  async execute({ text, language = 'en-US' }) {
    try {
      if (!text?.trim()) return { success: false, error: 'No text to check.' }
      const body = new URLSearchParams({ text: text.slice(0, 20000), language })
      const r = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!r.ok) throw new Error(`${r.status} from LanguageTool`)
      const d = await r.json()
      // Apply replacements back-to-front so earlier offsets stay valid.
      let corrected = text
      const matches = (d.matches || [])
        .filter(m => m.replacements?.length)
        .sort((a, b) => b.offset - a.offset)
      for (const m of matches) {
        corrected = corrected.slice(0, m.offset) + m.replacements[0].value +
          corrected.slice(m.offset + m.length)
      }
      return {
        success: true, tool: 'grammar_check',
        issue_count: d.matches?.length || 0,
        detected_language: d.language?.name,
        corrected,
        issues: (d.matches || []).slice(0, 40).map(m => ({
          message: m.message,
          context: m.context?.text,
          bad: text.substr(m.offset, m.length),
          suggestions: (m.replacements || []).slice(0, 3).map(x => x.value),
          type: m.rule?.category?.name,
        })),
        source: 'LanguageTool (open source)',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}
