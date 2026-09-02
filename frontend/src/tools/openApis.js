/**
 * Free, open-source, keyless public APIs for AI reasoning & intelligence.
 * Sourced & verified from public-apis/public-apis and public-api-lists.
 *
 *   OpenFDA (api.fda.gov)              Prescription & OTC drug info, dosage, warnings
 *   Binance / Crypto (api.binance.com) Real-time crypto prices & 24h market stats
 *   PubChem (pubchem.ncbi.nlm.nih.gov) Molecular formulas, IUPAC names, chemical structures
 *   World Bank (api.worldbank.org)     Macroeconomic & demographic indicators (GDP, population)
 *   Nobel Prize (api.nobelprize.org)   Nobel laureates, citations, prize history
 *   WhereTheISS.at                     Real-time International Space Station orbit telemetry
 *   TVMaze (api.tvmaze.com)            TV show schedules, genres, cast, episode guides
 *   Open Trivia DB (opentdb.com)       Trivia questions across diverse categories & difficulties
 *   Zippopotam.us                      ZIP / Postal code to city, state, coordinates lookup
 */

const json = async (url) => {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${new URL(url).hostname}`)
  return r.json()
}

// ─── 1. OpenFDA Drug Intelligence ──────────────────────────────────────────
export const drugInfoTool = {
  schema: {
    description:
      'Look up official prescription and over-the-counter (OTC) drug information from the US Food & Drug Administration (FDA) database. ' +
      'Returns indications, active ingredients, dosage, contraindications, warnings, storage, and adverse reactions. ' +
      'Use when asked about medication uses, dosages, active ingredients, drug interactions, or safety warnings.',
    parameters: {
      type: 'object',
      properties: {
        drug_name: { type: 'string', description: 'Brand or generic drug name (e.g. "aspirin", "ibuprofen", "metformin", "amoxicillin")' },
        field: {
          type: 'string',
          enum: ['all', 'indications', 'dosage', 'warnings', 'active_ingredient', 'adverse_reactions'],
          description: 'Specific information field to focus on (default: "all")',
        },
      },
      required: ['drug_name'],
    },
  },
  async execute({ drug_name, field = 'all' } = {}) {
    if (!drug_name) return { success: false, error: 'drug_name is required' }
    try {
      const q = encodeURIComponent(`openfda.brand_name:"${drug_name}" OR openfda.generic_name:"${drug_name}" OR openfda.substance_name:"${drug_name}"`)
      const url = `https://api.fda.gov/drug/label.json?search=${q}&limit=1`
      const data = await json(url)
      const item = data.results?.[0]
      if (!item) return { success: false, error: `No FDA records found for "${drug_name}"` }

      const openfda = item.openfda || {}
      const res = {
        success: true,
        tool: 'drug_info',
        drug_name,
        brand_names: openfda.brand_name || [],
        generic_names: openfda.generic_name || [],
        manufacturer: openfda.manufacturer_name?.[0] || 'Unknown',
        route: openfda.route || [],
        substance: openfda.substance_name || [],
        indications: item.indications_and_usage?.[0]?.slice(0, 800) || item.purpose?.[0] || 'Not specified',
        dosage_and_administration: item.dosage_and_administration?.[0]?.slice(0, 800) || 'Refer to healthcare provider',
        active_ingredients: item.active_ingredient || openfda.substance_name || [],
        warnings: item.warnings?.[0]?.slice(0, 800) || item.do_not_use?.[0]?.slice(0, 500) || 'None listed',
        adverse_reactions: item.adverse_reactions?.[0]?.slice(0, 600) || 'None listed',
        storage: item.storage_and_handling?.[0]?.slice(0, 300) || undefined,
      }

      if (field === 'indications') return { success: true, drug_name, indications: res.indications }
      if (field === 'dosage') return { success: true, drug_name, dosage: res.dosage_and_administration }
      if (field === 'warnings') return { success: true, drug_name, warnings: res.warnings }
      if (field === 'active_ingredient') return { success: true, drug_name, active_ingredients: res.active_ingredients }
      if (field === 'adverse_reactions') return { success: true, drug_name, adverse_reactions: res.adverse_reactions }

      return res
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 2. Cryptocurrency Spot Prices & Market Stats ──────────────────────────
export const cryptoPriceTool = {
  schema: {
    description:
      'Look up live cryptocurrency prices, 24-hour price change percentage, 24h high/low, and trading volume. ' +
      'Covers Bitcoin (BTC), Ethereum (ETH), Solana (SOL), and hundreds of top crypto assets. ' +
      'Use when asked about crypto prices, market trends, 24h gainers/losers, or cryptocurrency values.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Cryptocurrency symbol or pair (e.g. "BTC", "ETH", "SOL", "BTCUSDT", "ETHUSDT"). Default: "BTC"' },
      },
      required: [],
    },
  },
  async execute({ symbol = 'BTC' } = {}) {
    try {
      let s = String(symbol || 'BTC').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!s.endsWith('USDT') && !s.endsWith('USD') && !s.endsWith('BUSD') && !s.endsWith('EUR')) {
        s = `${s}USDT`
      }
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`
      const d = await json(url)
      const lastPrice = parseFloat(d.lastPrice)
      const changePct = parseFloat(d.priceChangePercent)
      const high = parseFloat(d.highPrice)
      const low = parseFloat(d.lowPrice)
      const volume = parseFloat(d.volume)
      const quoteVolume = parseFloat(d.quoteVolume)

      return {
        success: true,
        tool: 'crypto_price',
        symbol: d.symbol,
        base_asset: symbol.toUpperCase(),
        price_usd: lastPrice,
        price_change_24h_percent: changePct,
        high_24h: high,
        low_24h: low,
        volume_24h: volume,
        volume_usd_24h: quoteVolume,
        formatted_price: `$${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`,
      }
    } catch (e) {
      return { success: false, error: `Failed to fetch price for ${symbol}: ${e.message}` }
    }
  },
}

// ─── 3. NIH PubChem Chemical & Molecule Intelligence ─────────────────────────
export const chemicalInfoTool = {
  schema: {
    description:
      'Look up chemical compound properties, molecular structures, and formulas from the National Institutes of Health (NIH) PubChem database. ' +
      'Returns molecular formula, molecular weight, IUPAC chemical name, Canonical SMILES, and InChIKey. ' +
      'Use when asked about chemical compounds, molecular formulas, molecular weights, or chemical structures.',
    parameters: {
      type: 'object',
      properties: {
        compound: { type: 'string', description: 'Name of the chemical compound (e.g. "caffeine", "aspirin", "water", "glucose", "dopamine")' },
      },
      required: ['compound'],
    },
  },
  async execute({ compound } = {}) {
    if (!compound) return { success: false, error: 'compound is required' }
    try {
      const q = encodeURIComponent(compound.trim())
      const props = 'MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES,InChIKey,ExactMass'
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${q}/property/${props}/JSON`
      const data = await json(url)
      const prop = data.PropertyTable?.Properties?.[0]
      if (!prop) return { success: false, error: `Compound "${compound}" not found in PubChem` }

      return {
        success: true,
        tool: 'chemical_info',
        compound,
        cid: prop.CID,
        molecular_formula: prop.MolecularFormula,
        molecular_weight: prop.MolecularWeight ? parseFloat(prop.MolecularWeight) : undefined,
        iupac_name: prop.IUPACName,
        canonical_smiles: prop.CanonicalSMILES,
        inchi_key: prop.InChIKey,
        exact_mass: prop.ExactMass ? parseFloat(prop.ExactMass) : undefined,
        pubchem_url: `https://pubchem.ncbi.nlm.nih.gov/compound/${prop.CID}`,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 4. World Bank Global Socio-Economic Statistics ─────────────────────────
const WB_INDICATOR_MAP = {
  gdp: 'NY.GDP.MKTP.CD', // GDP (current US$)
  gdp_growth: 'NY.GDP.MKTP.KD.ZG', // GDP growth (annual %)
  population: 'SP.POP.TOTL', // Population, total
  inflation: 'FP.CPI.TOTL.ZG', // Inflation, consumer prices (annual %)
  life_expectancy: 'SP.DYN.LE00.IN', // Life expectancy at birth (years)
  co2: 'EN.ATM.CO2E.PC', // CO2 emissions (metric tons per capita)
  poverty: 'SI.POV.NAHC', // Poverty headcount ratio
  unemployment: 'SL.UEM.TOTL.ZS', // Unemployment (% of total labor force)
}

export const worldBankTool = {
  schema: {
    description:
      'Retrieve official macroeconomic and developmental statistics from the World Bank Open Data catalog for 218+ countries. ' +
      'Indicators include: gdp, gdp_growth, population, inflation, life_expectancy, co2, poverty, and unemployment. ' +
      'Use when asked about country GDP, global population, economic trends, inflation rates, or international statistics.',
    parameters: {
      type: 'object',
      properties: {
        country: { type: 'string', description: '2-letter or 3-letter ISO country code (e.g. "US", "IN", "CN", "DE", "GB", "JP", "BR")' },
        indicator: {
          type: 'string',
          enum: ['gdp', 'gdp_growth', 'population', 'inflation', 'life_expectancy', 'co2', 'poverty', 'unemployment'],
          description: 'Indicator to look up (default: "gdp")',
        },
      },
      required: ['country'],
    },
  },
  async execute({ country, indicator = 'gdp' } = {}) {
    if (!country) return { success: false, error: 'country code is required' }
    const c = country.trim().toUpperCase()
    const indCode = WB_INDICATOR_MAP[indicator] || indicator
    try {
      const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(c)}/indicator/${encodeURIComponent(indCode)}?format=json&per_page=5`
      const data = await json(url)
      if (!Array.isArray(data) || data.length < 2 || !data[1] || data[1].length === 0) {
        return { success: false, error: `No data found for country "${country}" and indicator "${indicator}"` }
      }
      const records = data[1]
        .filter(r => r.value !== null)
        .slice(0, 3)
        .map(r => ({ year: r.date, value: r.value }))

      const latest = records[0] || {}
      const meta = data[1][0] || {}

      return {
        success: true,
        tool: 'world_bank',
        country: meta.country?.value || c,
        country_code: meta.countryiso3code || c,
        indicator_name: meta.indicator?.value || indicator,
        latest_year: latest.year,
        latest_value: latest.value,
        recent_years: records,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 5. Nobel Prize & Laureate Database ─────────────────────────────────────
export const nobelPrizeTool = {
  schema: {
    description:
      'Search the official Nobel Foundation database for Nobel Prize winners, categories, citations, and laureates. ' +
      'Categories include: physics (phy), chemistry (che), medicine (med), literature (lit), peace (pea), and economic sciences (eco). ' +
      'Use when asked who won a Nobel prize in a given year or category, or details of laureate citations.',
    parameters: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Year of the Nobel Prize (e.g. 2023, 2022, 1979)' },
        category: {
          type: 'string',
          enum: ['physics', 'chemistry', 'medicine', 'literature', 'peace', 'economics', 'phy', 'che', 'med', 'lit', 'pea', 'eco'],
          description: 'Category filter',
        },
      },
      required: [],
    },
  },
  async execute({ year, category } = {}) {
    try {
      const params = new URLSearchParams()
      if (year) params.set('nobelPrizeYear', String(year))
      if (category) {
        const catMap = {
          physics: 'phy', chemistry: 'che', medicine: 'med', literature: 'lit', peace: 'pea', economics: 'eco',
        }
        params.set('category', catMap[category.toLowerCase()] || category.toLowerCase())
      }
      params.set('limit', '5')
      const url = `https://api.nobelprize.org/2.1/nobelPrizes?${params.toString()}`
      const data = await json(url)
      const prizes = data.nobelPrizes || []

      if (prizes.length === 0) {
        return { success: false, error: `No Nobel Prizes found for year ${year || 'any'} / category ${category || 'any'}` }
      }

      const formatted = prizes.map(p => ({
        year: p.awardYear,
        category: p.categoryFullName?.en || p.category?.en,
        prize_amount: p.prizeAmount,
        laureates: (p.laureates || []).map(l => ({
          name: l.knownName?.en || l.fullName?.en || l.orgName?.en,
          portion: l.portion,
          motivation: l.motivation?.en,
        })),
      }))

      return {
        success: true,
        tool: 'nobel_prize',
        total: prizes.length,
        prizes: formatted,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 6. International Space Station (ISS) Telemetry ────────────────────────
export const issLocationTool = {
  schema: {
    description:
      'Track the real-time orbital location, latitude, longitude, altitude, velocity, and visibility of the International Space Station (ISS). ' +
      'Use when asked where the ISS is right now, how fast the space station travels, or its current orbit coordinates.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  async execute() {
    try {
      const url = 'https://api.wheretheiss.at/v1/satellites/25544'
      const d = await json(url)
      return {
        success: true,
        tool: 'iss_location',
        satellite: 'International Space Station (ISS)',
        latitude: d.latitude,
        longitude: d.longitude,
        altitude_km: Math.round(d.altitude * 100) / 100,
        velocity_kmh: Math.round(d.velocity * 100) / 100,
        visibility: d.visibility,
        units: d.units,
        timestamp: new Date(d.timestamp * 1000).toISOString(),
        google_maps_url: `https://www.google.com/maps?q=${d.latitude},${d.longitude}`,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 7. TVMaze TV Shows & Series Intelligence ──────────────────────────────
export const tvShowTool = {
  schema: {
    description:
      'Search television series and streaming show metadata from TVMaze. ' +
      'Returns show title, genres, ratings, status, premiere date, network/streaming platform, summary, and official site. ' +
      'Use when asked about TV shows, seasons, streaming series, genres, cast, or release dates.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name of the TV show or series (e.g. "Breaking Bad", "Stranger Things", "Succession")' },
      },
      required: ['query'],
    },
  },
  async execute({ query } = {}) {
    if (!query) return { success: false, error: 'query is required' }
    try {
      const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query.trim())}`
      const list = await json(url)
      if (!list || list.length === 0) return { success: false, error: `No TV shows found matching "${query}"` }

      const cleanHtml = (str) => (str || '').replace(/<[^>]+>/g, '').trim()

      const shows = list.slice(0, 4).map(item => {
        const s = item.show || {}
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          language: s.language,
          genres: s.genres || [],
          status: s.status,
          premiered: s.premiered,
          rating: s.rating?.average || 'N/A',
          network: s.network?.name || s.webChannel?.name || 'Unknown',
          summary: cleanHtml(s.summary).slice(0, 500),
          official_site: s.officialSite || s.url,
        }
      })

      return {
        success: true,
        tool: 'tv_shows',
        query,
        count: shows.length,
        results: shows,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 8. Open Trivia DB (OpenTDB) Quiz & Trivia Generator ───────────────────
export const triviaQuizTool = {
  schema: {
    description:
      'Generate verified trivia questions and answers across diverse categories (Science, Computers, Mathematics, History, Geography, Books, Film, General Knowledge). ' +
      'Use when asked for trivia, quiz questions, flashcards, knowledge tests, or study questions.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Number of questions (1–10, default: 3)' },
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: 'Question difficulty' },
        category_id: { type: 'number', description: 'Optional category ID: 9=General, 17=Science/Nature, 18=Computers, 19=Math, 21=Sports, 22=Geography, 23=History' },
      },
      required: [],
    },
  },
  async execute({ amount = 3, difficulty, category_id } = {}) {
    try {
      const n = Math.max(1, Math.min(10, Math.floor(amount) || 3))
      const params = new URLSearchParams({ amount: String(n), type: 'multiple' })
      if (difficulty) params.set('difficulty', difficulty)
      if (category_id) params.set('category', String(category_id))

      const url = `https://opentdb.com/api.php?${params.toString()}`
      const data = await json(url)

      const decodeHtml = (html) => {
        if (!html) return ''
        const map = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&rsquo;': "'", '&ldquo;': '"', '&rdquo;': '"' }
        return html.replace(/&[#\w]+;/g, m => map[m] || m)
      }

      const questions = (data.results || []).map(q => ({
        category: decodeHtml(q.category),
        difficulty: q.difficulty,
        question: decodeHtml(q.question),
        correct_answer: decodeHtml(q.correct_answer),
        incorrect_answers: (q.incorrect_answers || []).map(decodeHtml),
      }))

      return {
        success: true,
        tool: 'trivia_quiz',
        count: questions.length,
        questions,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 9. Zippopotam Global Postal & ZIP Code Intelligence ────────────────────
export const postalLookupTool = {
  schema: {
    description:
      'Look up geographic location, city, state, province, latitude, and longitude for any postal code or ZIP code worldwide across 60+ countries. ' +
      'Use when asked what city or area a ZIP/postal code belongs to, or to look up coordinates for a postal code.',
    parameters: {
      type: 'object',
      properties: {
        postal_code: { type: 'string', description: 'Postal code or ZIP code (e.g. "90210", "SW1A 1AA", "75008", "10001")' },
        country_code: { type: 'string', description: '2-letter ISO country code (e.g. "US", "GB", "FR", "DE", "CA", "IN", "JP"). Default: "US"' },
      },
      required: ['postal_code'],
    },
  },
  async execute({ postal_code, country_code = 'US' } = {}) {
    if (!postal_code) return { success: false, error: 'postal_code is required' }
    try {
      const c = country_code.trim().toLowerCase()
      const code = encodeURIComponent(postal_code.trim())
      const url = `https://api.zippopotam.us/${c}/${code}`
      const data = await json(url)
      const places = (data.places || []).map(p => ({
        place_name: p['place name'],
        state: p['state'],
        state_code: p['state abbreviation'],
        latitude: parseFloat(p['latitude']),
        longitude: parseFloat(p['longitude']),
      }))

      return {
        success: true,
        tool: 'postal_lookup',
        postal_code: data['post code'] || postal_code,
        country: data['country'] || country_code,
        country_code: data['country abbreviation'] || country_code.toUpperCase(),
        places,
      }
    } catch (e) {
      return { success: false, error: `Postal code "${postal_code}" not found for country "${country_code}": ${e.message}` }
    }
  },
}

// ─── 10. NASA Astronomy Picture of the Day (APOD) ──────────────────────────
export const nasaApodTool = {
  schema: {
    description:
      'Fetch NASA Astronomy Picture of the Day (APOD). Returns high-definition astronomical imagery/video, title, date, copyright, and expert astronomer explanation. ' +
      'Use when asked about astronomy photos, NASA daily space pictures, nebulae, galaxies, planets, or space imagery.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional date in YYYY-MM-DD format (e.g. "2024-05-15"). Defaults to today.' },
      },
      required: [],
    },
  },
  async execute({ date } = {}) {
    try {
      let url = 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY'
      if (date) url += `&date=${encodeURIComponent(date.trim())}`
      const d = await json(url)
      return {
        success: true,
        tool: 'nasa_apod',
        title: d.title,
        date: d.date,
        media_type: d.media_type,
        url: d.url,
        hdurl: d.hdurl || d.url,
        copyright: d.copyright || 'Public Domain / NASA',
        explanation: d.explanation,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 11. Apple iTunes Media Search ──────────────────────────────────────────
export const itunesSearchTool = {
  schema: {
    description:
      'Search Apple iTunes catalog for songs, music tracks, albums, artists, podcasts, and audiobooks. ' +
      'Returns track title, artist name, album, release year, genre, artwork, and 30-second audio stream preview URLs. ' +
      'Use when asked about songs, musicians, audio previews, podcast episodes, or album information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Artist, song, podcast, or album title (e.g. "Coldplay Yellow", "Huberman Lab")' },
        media: { type: 'string', enum: ['music', 'podcast', 'audiobook', 'all'], description: 'Media type (default: "music")' },
        limit: { type: 'number', description: 'Result count (1–10, default: 4)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, media = 'music', limit = 4 } = {}) {
    if (!query) return { success: false, error: 'query is required' }
    try {
      const n = Math.max(1, Math.min(10, Math.floor(limit) || 4))
      const med = media === 'all' ? undefined : media
      let url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&limit=${n}`
      if (med) url += `&media=${encodeURIComponent(med)}`
      const data = await json(url)
      const results = (data.results || []).map(r => ({
        track_name: r.trackName || r.collectionName,
        artist_name: r.artistName,
        collection_name: r.collectionName,
        kind: r.kind || r.wrapperType,
        genre: r.primaryGenreName,
        release_date: r.releaseDate ? r.releaseDate.slice(0, 10) : undefined,
        track_time_seconds: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : undefined,
        preview_url: r.previewUrl,
        artwork_url: r.artworkUrl100,
        itunes_url: r.trackViewUrl || r.collectionViewUrl,
      }))

      return {
        success: true,
        tool: 'itunes_search',
        query,
        count: results.length,
        results,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 12. Art Institute of Chicago Open Collection ───────────────────────────
export const artInstituteTool = {
  schema: {
    description:
      'Search 100,000+ world-class artworks from the Art Institute of Chicago collection. ' +
      'Returns artwork title, artist biography, date, medium, dimensions, and exhibition history. ' +
      'Use when asked about famous paintings, art history, painters (Monet, Van Gogh, Picasso), or museum artworks.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Artist name, art title, style, or movement (e.g. "Monet", "The Bedroom", "Impressionism")' },
        limit: { type: 'number', description: 'Number of artworks (1–5, default: 3)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, limit = 3 } = {}) {
    if (!query) return { success: false, error: 'query is required' }
    try {
      const n = Math.max(1, Math.min(5, Math.floor(limit) || 3))
      const fields = 'id,title,artist_display,date_display,medium_display,dimensions,place_of_origin,image_id'
      const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query.trim())}&limit=${n}&fields=${fields}`
      const data = await json(url)
      const artworks = (data.data || []).map(a => ({
        id: a.id,
        title: a.title,
        artist: a.artist_display,
        date: a.date_display,
        medium: a.medium_display,
        dimensions: a.dimensions,
        origin: a.place_of_origin,
        image_url: a.image_id ? `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg` : undefined,
        museum_page: `https://www.artic.edu/artworks/${a.id}`,
      }))

      return {
        success: true,
        tool: 'art_institute',
        query,
        count: artworks.length,
        results: artworks,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 13. Sunrise & Sunset Solar Calculator ──────────────────────────────────
export const solarTimesTool = {
  schema: {
    description:
      'Calculate precise astronomical and solar times for any latitude and longitude (or city location). ' +
      'Returns sunrise, sunset, solar noon, civil twilight (dawn/dusk), nautical twilight, golden hour, and day length. ' +
      'Use when asked when the sun rises or sets, golden hour photography times, or length of daylight.',
    parameters: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: 'Latitude in decimal degrees (-90 to 90)' },
        longitude: { type: 'number', description: 'Longitude in decimal degrees (-180 to 180)' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
      required: ['latitude', 'longitude'],
    },
  },
  async execute({ latitude, longitude, date } = {}) {
    if (latitude == null || longitude == null) return { success: false, error: 'latitude and longitude are required' }
    try {
      let url = `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&formatted=0`
      if (date) url += `&date=${encodeURIComponent(date.trim())}`
      const d = await json(url)
      if (d.status !== 'OK') return { success: false, error: d.status || 'Failed to calculate solar times' }
      const r = d.results || {}

      const secToHours = (s) => {
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        return `${h}h ${m}m`
      }

      return {
        success: true,
        tool: 'solar_times',
        latitude,
        longitude,
        sunrise_utc: r.sunrise,
        sunset_utc: r.sunset,
        solar_noon_utc: r.solar_noon,
        day_length: secToHours(r.day_length),
        day_length_seconds: r.day_length,
        civil_twilight_begin_utc: r.civil_twilight_begin,
        civil_twilight_end_utc: r.civil_twilight_end,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 14. DNS Record Lookup (DNS-over-HTTPS) ─────────────────────────────────
export const dnsLookupTool = {
  schema: {
    description:
      'Perform browser-native DNS lookups via Google and Cloudflare DNS-over-HTTPS. ' +
      'Query record types: A (IPv4), AAAA (IPv6), MX (Mail Exchange), TXT (SPF/verification), CNAME (Aliases), NS (Nameservers), SOA. ' +
      'Use when diagnosing domain name resolution, checking mail servers, finding IP addresses of hosts, or inspecting DNS configuration.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name to inspect (e.g. "github.com", "google.com", "openai.com")' },
        type: {
          type: 'string',
          enum: ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SOA'],
          description: 'DNS record type (default: "A")',
        },
      },
      required: ['domain'],
    },
  },
  async execute({ domain, type = 'A' } = {}) {
    if (!domain) return { success: false, error: 'domain is required' }
    const dom = domain.trim().replace(/^https?:\/\//i, '').split('/')[0]
    const recType = type.trim().toUpperCase()
    try {
      const url = `https://dns.google/resolve?name=${encodeURIComponent(dom)}&type=${encodeURIComponent(recType)}`
      const data = await json(url)
      const answers = (data.Answer || []).map(a => ({
        name: a.name,
        type: recType,
        ttl: a.TTL,
        data: a.data,
      }))

      return {
        success: true,
        tool: 'dns_lookup',
        domain: dom,
        record_type: recType,
        status: data.Status === 0 ? 'NOERROR' : `Status Code ${data.Status}`,
        answers,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 15. Activity & Boredom Buster Suggestions ──────────────────────────────
export const activitySuggestTool = {
  schema: {
    description:
      'Find curated activities and ideas to overcome boredom, learn a new hobby, or plan social events. ' +
      'Types: education, recreational, social, diy, charity, relaxation, music, busywork. ' +
      'Use when asked for things to do, weekend plans, hobby suggestions, or activity ideas.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['education', 'recreational', 'social', 'diy', 'charity', 'relaxation', 'music', 'busywork'],
          description: 'Category of activity',
        },
        participants: { type: 'number', description: 'Number of people participating (default: 1)' },
      },
      required: [],
    },
  },
  async execute({ type, participants } = {}) {
    try {
      let url = 'https://bored.api.lewagon.com/api/activity'
      const params = new URLSearchParams()
      if (type) params.set('type', type.toLowerCase())
      if (participants) params.set('participants', String(participants))
      if (params.toString()) url += `?${params.toString()}`

      const d = await json(url)
      if (d.error) return { success: false, error: d.error }

      return {
        success: true,
        tool: 'activity_suggest',
        activity: d.activity,
        type: d.type,
        participants: d.participants,
        price_level: d.price === 0 ? 'Free' : d.price < 0.3 ? 'Low Cost' : 'Moderate',
        accessibility: d.accessibility < 0.3 ? 'Very Easy' : d.accessibility < 0.6 ? 'Moderate' : 'Challenging',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 16. Programming & General Jokes ────────────────────────────────────────
export const jokesTool = {
  schema: {
    description:
      'Generate funny programming, developer, and general humor jokes with setups and punchlines. ' +
      'Categories: programming, general, knock-knock. ' +
      'Use when asked to tell a joke, cheer someone up, or share a programming pun.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['programming', 'general', 'knock-knock', 'random'], description: 'Joke category (default: "random")' },
      },
      required: [],
    },
  },
  async execute({ category = 'random' } = {}) {
    try {
      const cat = category.toLowerCase()
      const path = (cat === 'programming' || cat === 'general' || cat === 'knock-knock')
        ? `jokes/${cat}/random`
        : 'random_joke'
      const url = `https://official-joke-api.appspot.com/${path}`
      const d = await json(url)
      const joke = Array.isArray(d) ? d[0] : d

      return {
        success: true,
        tool: 'jokes',
        category: joke.type || category,
        setup: joke.setup,
        punchline: joke.punchline,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 17. Animal Facts & Breeds ──────────────────────────────────────────────
export const animalFactsTool = {
  schema: {
    description:
      'Get verified feline & canine animal facts, cat trivia, and dog breed intelligence. ' +
      'Use when asked about cat facts, dog breeds, or domestic animal trivia.',
    parameters: {
      type: 'object',
      properties: {
        animal: { type: 'string', enum: ['cat', 'dog'], description: 'Animal type (default: "cat")' },
      },
      required: [],
    },
  },
  async execute({ animal = 'cat' } = {}) {
    try {
      if (animal.toLowerCase() === 'dog') {
        const url = 'https://dog.ceo/api/breeds/list/all'
        const d = await json(url)
        const breeds = Object.keys(d.message || {})
        const randomBreed = breeds[Math.floor(Math.random() * breeds.length)]
        return {
          success: true,
          tool: 'animal_facts',
          animal: 'dog',
          total_breeds_known: breeds.length,
          featured_breed: randomBreed,
          sub_breeds: d.message[randomBreed] || [],
          popular_breeds: breeds.slice(0, 8),
        }
      }

      const url = 'https://catfact.ninja/fact'
      const d = await json(url)
      return {
        success: true,
        tool: 'animal_facts',
        animal: 'cat',
        fact: d.fact,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}


// ─── 19. TheCocktailDB Drinks & Mocktails ───────────────────────────────────
export const cocktailRecipeTool = {
  schema: {
    description:
      'Search drink recipes, cocktails, and non-alcoholic mocktails from TheCocktailDB. ' +
      'Returns ingredients, measurements, glassware recommendations, and preparation instructions. ' +
      'Use when asked for cocktail recipes, mocktail ideas, drink mixing guides, or party drinks.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cocktail or drink name (e.g. "mojito", "margarita", "virgin colada")' },
        non_alcoholic: { type: 'boolean', description: 'Filter only non-alcoholic drinks/mocktails' },
      },
      required: [],
    },
  },
  async execute({ query = '', non_alcoholic = false } = {}) {
    try {
      let url = 'https://www.thecocktaildb.com/api/json/v1/1/search.php?s='
      if (query.trim()) url += encodeURIComponent(query.trim())
      else if (non_alcoholic) url = 'https://www.thecocktaildb.com/api/json/v1/1/filter.php?a=Non_Alcoholic'
      else url = 'https://www.thecocktaildb.com/api/json/v1/1/random.php'

      const d = await json(url)
      let drinks = d.drinks || []
      if (drinks.length === 0) return { success: false, error: `No drink recipes found for "${query}"` }
      if (non_alcoholic) drinks = drinks.filter(dr => dr.strAlcoholic?.toLowerCase().includes('non'))

      const extractDrinkIngredients = (dr) => {
        const list = []
        for (let i = 1; i <= 15; i++) {
          const ing = dr[`strIngredient${i}`]
          const measure = dr[`strMeasure${i}`]
          if (ing && ing.trim()) {
            list.push(`${measure ? measure.trim() + ' ' : ''}${ing.trim()}`)
          }
        }
        return list
      }

      const results = drinks.slice(0, 3).map(dr => ({
        name: dr.strDrink,
        type: dr.strAlcoholic,
        category: dr.strCategory,
        glass: dr.strGlass,
        instructions: dr.strInstructions,
        ingredients: extractDrinkIngredients(dr),
        thumbnail: dr.strDrinkThumb,
      }))

      return {
        success: true,
        tool: 'cocktail_recipe',
        query: query || 'featured',
        count: results.length,
        drinks: results,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 20. Federal Register US Government Documents & Executive Orders ────────
export const federalRegisterTool = {
  schema: {
    description:
      'Search official US Government executive orders, presidential proclamations, federal agency regulations, and public rules from the Federal Register API. ' +
      'Use when asked about US government rules, presidential executive orders, federal agency policies, or government regulatory notices.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term, topic, agency, or policy keyword (e.g. "artificial intelligence", "cybersecurity", "clean energy")' },
        document_type: { type: 'string', enum: ['RULE', 'PRORULE', 'NOTICE', 'PRESDOCU'], description: 'Optional document type: RULE (Final Rule), PRORULE (Proposed Rule), NOTICE (Public Notice), PRESDOCU (Presidential Document/Executive Order)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, document_type } = {}) {
    if (!query) return { success: false, error: 'query is required' }
    try {
      let url = `https://www.federalregister.gov/api/v1/documents.json?conditions[term]=${encodeURIComponent(query.trim())}&per_page=3`
      if (document_type) url += `&conditions[type][]=${encodeURIComponent(document_type)}`

      const d = await json(url)
      const docs = (d.results || []).map(doc => ({
        title: doc.title,
        type: doc.type,
        agency_names: doc.agency_names || [],
        publication_date: doc.publication_date,
        document_number: doc.document_number,
        abstract: doc.abstract || 'No abstract provided.',
        citation: doc.citation,
        html_url: doc.html_url,
        pdf_url: doc.pdf_url,
      }))

      return {
        success: true,
        tool: 'federal_register',
        query,
        count: docs.length,
        documents: docs,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 21. Internet Archive Wayback Machine Snapshot Availability ────────────
export const waybackArchiveTool = {
  schema: {
    description:
      'Check if a website, article, or URL has historical snapshots archived on the Internet Archive Wayback Machine. ' +
      'Returns the archived snapshot URL, timestamp, and status. ' +
      'Use when checking archived versions of web pages, retrieving dead link backups, or researching web history.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The web page URL to check (e.g. "https://www.apple.com", "nytimes.com")' },
        timestamp: { type: 'string', description: 'Optional target date timestamp in YYYYMMDD format (e.g. "20150101")' },
      },
      required: ['url'],
    },
  },
  async execute({ url, timestamp } = {}) {
    if (!url) return { success: false, error: 'url is required' }
    try {
      let target = url.trim()
      if (!target.startsWith('http://') && !target.startsWith('https://')) target = `https://${target}`
      let apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(target)}`
      if (timestamp) apiUrl += `&timestamp=${encodeURIComponent(timestamp.trim())}`

      const d = await json(apiUrl)
      const closest = d.archived_snapshots?.closest

      if (!closest || !closest.available) {
        return {
          success: true,
          tool: 'wayback_archive',
          url: target,
          archived: false,
          message: 'No archived snapshot found on the Wayback Machine.',
        }
      }

      return {
        success: true,
        tool: 'wayback_archive',
        url: target,
        archived: true,
        snapshot_url: closest.url,
        snapshot_timestamp: closest.timestamp,
        status: closest.status,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 22. Random Realistic Persona / Mock User Profile Generator ─────────────
export const userProfileGenTool = {
  schema: {
    description:
      'Generate realistic mock user profiles, testing personas, and synthetic identity data (name, email, street address, city, country, phone, age, username, avatar photo). ' +
      'Use when creating test data, prototyping, generating customer personas, or building roleplay scenarios.',
    parameters: {
      type: 'object',
      properties: {
        gender: { type: 'string', enum: ['male', 'female', 'any'], description: 'Persona gender' },
        nat: { type: 'string', description: 'Nationality / country code (e.g. "US", "GB", "FR", "DE", "CA", "IN", "BR")' },
      },
      required: [],
    },
  },
  async execute({ gender = 'any', nat } = {}) {
    try {
      let url = 'https://randomuser.me/api/?results=1'
      if (gender && gender !== 'any') url += `&gender=${encodeURIComponent(gender.toLowerCase())}`
      if (nat) url += `&nat=${encodeURIComponent(nat.toUpperCase())}`

      const d = await json(url)
      const u = d.results?.[0]
      if (!u) return { success: false, error: 'Failed to generate profile' }

      return {
        success: true,
        tool: 'user_profile_gen',
        name: `${u.name?.title} ${u.name?.first} ${u.name?.last}`,
        gender: u.gender,
        age: u.dob?.age,
        email: u.email,
        phone: u.phone,
        cell: u.cell,
        username: u.login?.username,
        location: {
          street: `${u.location?.street?.number} ${u.location?.street?.name}`,
          city: u.location?.city,
          state: u.location?.state,
          country: u.location?.country,
          postcode: u.location?.postcode,
          coordinates: { latitude: u.location?.coordinates?.latitude, longitude: u.location?.coordinates?.longitude },
        },
        avatar_url: u.picture?.large,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 23. NASA NeoWs Near-Earth Asteroid Tracking ────────────────────────────
export const nasaAsteroidsTool = {
  schema: {
    description:
      'Track near-Earth asteroids and comets using NASA Near Earth Object Web Service (NeoWs). ' +
      'Returns asteroid name, estimated diameter (meters), close approach date, miss distance (km), velocity (km/h), and hazardous status. ' +
      'Use when asked about asteroids approaching Earth, near-Earth objects (NEOs), asteroid sizes, or close encounters.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
      required: [],
    },
  },
  async execute({ date } = {}) {
    try {
      const dStr = date ? date.trim() : new Date().toISOString().slice(0, 10)
      const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${dStr}&end_date=${dStr}&api_key=DEMO_KEY`
      const data = await json(url)
      const list = data.near_earth_objects?.[dStr] || []

      if (list.length === 0) return { success: true, tool: 'nasa_asteroids', date: dStr, count: 0, asteroids: [] }

      const asteroids = list.slice(0, 4).map(a => {
        const close = a.close_approach_data?.[0] || {}
        return {
          name: a.name,
          neo_reference_id: a.neo_reference_id,
          is_potentially_hazardous: a.is_potentially_hazardous_asteroid,
          estimated_diameter_meters: {
            min: Math.round(a.estimated_diameter?.meters?.estimated_diameter_min || 0),
            max: Math.round(a.estimated_diameter?.meters?.estimated_diameter_max || 0),
          },
          close_approach_date: close.close_approach_date_full || close.close_approach_date,
          velocity_kmh: close.relative_velocity?.kilometers_per_hour ? Math.round(parseFloat(close.relative_velocity.kilometers_per_hour)) : undefined,
          miss_distance_km: close.miss_distance?.kilometers ? Math.round(parseFloat(close.miss_distance.kilometers)) : undefined,
          nasa_jpl_url: a.nasa_jpl_url,
        }
      })

      return {
        success: true,
        tool: 'nasa_asteroids',
        date: dStr,
        total_tracked_today: data.element_count,
        count: asteroids.length,
        asteroids,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 24. Bible Scripture Passages & Translations ────────────────────────────
export const bibleScriptureTool = {
  schema: {
    description:
      'Look up Bible verses, passages, and chapters across multiple public translations (World English Bible, King James Version, etc.) via the Bible API. ' +
      'Use when asked to cite Bible verses, explain scripture references, or look up chapters (e.g. "John 3:16", "Psalm 23", "Romans 12:1-2").',
    parameters: {
      type: 'object',
      properties: {
        passage: { type: 'string', description: 'Scripture reference (e.g. "John 3:16", "Genesis 1:1", "Psalm 23:1-4", "1 Corinthians 13")' },
        translation: { type: 'string', enum: ['web', 'kjv', 'bbe', 'oeb-us'], description: 'Translation version (default: "web")' },
      },
      required: ['passage'],
    },
  },
  async execute({ passage, translation = 'web' } = {}) {
    if (!passage) return { success: false, error: 'passage is required' }
    try {
      const q = encodeURIComponent(passage.trim())
      const tr = encodeURIComponent(translation.trim().toLowerCase())
      const url = `https://bible-api.com/${q}?translation=${tr}`
      const d = await json(url)

      return {
        success: true,
        tool: 'bible_scripture',
        reference: d.reference,
        text: d.text?.trim(),
        translation_name: d.translation_name,
        verses_count: d.verses?.length || 1,
      }
    } catch (e) {
      return { success: false, error: `Failed to fetch passage "${passage}": ${e.message}` }
    }
  },
}

// ─── 25. Wikimedia Feed (Today in History & Featured Content) ───────────────
export const wikimediaFeedTool = {
  schema: {
    description:
      'Retrieve Wikipedia official featured content feed for today or any date: Today in History ("On this day" historical anniversaries), today\'s Featured Article, and Picture of the Day. ' +
      'Use when asked what happened today in history, daily historical events, or featured Wikipedia topics.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional date in YYYY/MM/DD format (e.g. "2024/08/15"). Defaults to today.' },
      },
      required: [],
    },
  },
  async execute({ date } = {}) {
    try {
      let dPath = date ? date.trim().replace(/-/g, '/') : ''
      if (!dPath) {
        const now = new Date()
        const y = now.getUTCFullYear()
        const m = String(now.getUTCMonth() + 1).padStart(2, '0')
        const d = String(now.getUTCDate()).padStart(2, '0')
        dPath = `${y}/${m}/${d}`
      }
      const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${dPath}`
      const d = await json(url)

      const featuredArticle = d.tfa ? {
        title: d.tfa.titles?.normalized || d.tfa.title,
        extract: d.tfa.extract,
        page_url: d.tfa.content_urls?.desktop?.page,
      } : undefined

      const onThisDay = (d.onthisday || []).slice(0, 4).map(item => ({
        year: item.year,
        text: item.text,
      }))

      return {
        success: true,
        tool: 'wikimedia_feed',
        date: dPath,
        featured_article: featuredArticle,
        on_this_day: onThisDay,
        news_events: (d.news || []).slice(0, 3).map(n => n.story ? n.story.replace(/<[^>]+>/g, '') : undefined).filter(Boolean),
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}



