import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  drugInfoTool,
  cryptoPriceTool,
  chemicalInfoTool,
  worldBankTool,
  nobelPrizeTool,
  issLocationTool,
  tvShowTool,
  triviaQuizTool,
  postalLookupTool,
  nasaApodTool,
  itunesSearchTool,
  artInstituteTool,
  solarTimesTool,
  dnsLookupTool,
  activitySuggestTool,
  jokesTool,
  animalFactsTool,
  mealRecipeTool,
  cocktailRecipeTool,
  federalRegisterTool,
  waybackArchiveTool,
  userProfileGenTool,
  nasaAsteroidsTool,
  bibleScriptureTool,
  wikimediaFeedTool,
} from './openApis'

describe('Open Public APIs Tools', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('drug_info (OpenFDA)', () => {
    it('has valid schema definition', () => {
      expect(drugInfoTool.schema.description).toContain('FDA')
      expect(drugInfoTool.schema.parameters.required).toContain('drug_name')
    })

    it('returns drug information on successful fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{
            openfda: {
              brand_name: ['Advil'],
              generic_name: ['Ibuprofen'],
              manufacturer_name: ['Pfizer'],
              substance_name: ['IBUPROFEN'],
            },
            indications_and_usage: ['Temporarily relieves minor aches and pains.'],
            dosage_and_administration: ['Take 1 tablet every 4 to 6 hours.'],
            warnings: ['Stomach bleeding warning.'],
            adverse_reactions: ['Nausea, dizziness.'],
          }],
        }),
      })

      const res = await drugInfoTool.execute({ drug_name: 'ibuprofen' })
      expect(res.success).toBe(true)
      expect(res.tool).toBe('drug_info')
      expect(res.brand_names).toContain('Advil')
      expect(res.generic_names).toContain('Ibuprofen')
      expect(res.indications).toContain('minor aches')
    })

    it('handles not found / missing parameters gracefully', async () => {
      const errRes = await drugInfoTool.execute({})
      expect(errRes.success).toBe(false)
      expect(errRes.error).toContain('drug_name is required')
    })
  })

  describe('crypto_price (Binance)', () => {
    it('has valid schema definition', () => {
      expect(cryptoPriceTool.schema.description).toContain('cryptocurrency')
    })

    it('fetches real-time crypto ticker stats', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          symbol: 'BTCUSDT',
          lastPrice: '63500.50',
          priceChangePercent: '2.45',
          highPrice: '64000.00',
          lowPrice: '62000.00',
          volume: '15420.5',
          quoteVolume: '980000000',
        }),
      })

      const res = await cryptoPriceTool.execute({ symbol: 'BTC' })
      expect(res.success).toBe(true)
      expect(res.symbol).toBe('BTCUSDT')
      expect(res.price_usd).toBe(63500.50)
      expect(res.price_change_24h_percent).toBe(2.45)
      expect(res.formatted_price).toBe('$63,500.50')
    })
  })

  describe('chemical_info (PubChem)', () => {
    it('has valid schema definition', () => {
      expect(chemicalInfoTool.schema.description).toContain('PubChem')
      expect(chemicalInfoTool.schema.parameters.required).toContain('compound')
    })

    it('extracts molecular structure and properties', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          PropertyTable: {
            Properties: [{
              CID: 2244,
              MolecularFormula: 'C9H8O4',
              MolecularWeight: '180.16',
              IUPACName: '2-acetyloxybenzoic acid',
              CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
              InChIKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
              ExactMass: '180.042259',
            }],
          },
        }),
      })

      const res = await chemicalInfoTool.execute({ compound: 'aspirin' })
      expect(res.success).toBe(true)
      expect(res.cid).toBe(2244)
      expect(res.molecular_formula).toBe('C9H8O4')
      expect(res.molecular_weight).toBe(180.16)
      expect(res.iupac_name).toBe('2-acetyloxybenzoic acid')
      expect(res.canonical_smiles).toBe('CC(=O)OC1=CC=CC=C1C(=O)O')
    })
  })

  describe('world_bank', () => {
    it('has valid schema definition', () => {
      expect(worldBankTool.schema.description).toContain('World Bank')
      expect(worldBankTool.schema.parameters.required).toContain('country')
    })

    it('extracts indicator records', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { page: 1, total: 5 },
          [
            { indicator: { value: 'GDP (current US$)' }, country: { value: 'United States' }, countryiso3code: 'USA', date: '2023', value: 27360935000000 },
            { indicator: { value: 'GDP (current US$)' }, country: { value: 'United States' }, countryiso3code: 'USA', date: '2022', value: 25744108000000 },
          ],
        ],
      })

      const res = await worldBankTool.execute({ country: 'US', indicator: 'gdp' })
      expect(res.success).toBe(true)
      expect(res.country).toBe('United States')
      expect(res.latest_value).toBe(27360935000000)
    })
  })

  describe('nobel_prize', () => {
    it('fetches laureates and citations', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          nobelPrizes: [{
            awardYear: '2023',
            categoryFullName: { en: 'The Nobel Prize in Physics' },
            prizeAmount: 11000000,
            laureates: [{
              knownName: { en: 'Pierre Agostini' },
              portion: '1/3',
              motivation: { en: 'for experimental methods that generate attosecond pulses' },
            }],
          }],
        }),
      })

      const res = await nobelPrizeTool.execute({ year: 2023, category: 'physics' })
      expect(res.success).toBe(true)
      expect(res.total).toBe(1)
      expect(res.prizes[0].laureates[0].name).toBe('Pierre Agostini')
    })
  })

  describe('iss_location', () => {
    it('returns real-time ISS telemetry', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'iss',
          latitude: 51.2,
          longitude: -0.1,
          altitude: 418.5,
          velocity: 27600.2,
          visibility: 'daylight',
          units: 'kilometers',
          timestamp: 1712000000,
        }),
      })

      const res = await issLocationTool.execute()
      expect(res.success).toBe(true)
      expect(res.satellite).toContain('ISS')
      expect(res.latitude).toBe(51.2)
      expect(res.altitude_km).toBe(418.5)
      expect(res.google_maps_url).toContain('51.2')
    })
  })

  describe('tv_shows', () => {
    it('searches and formats TV show metadata', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{
          show: {
            id: 169,
            name: 'Breaking Bad',
            genres: ['Drama', 'Crime', 'Thriller'],
            status: 'Ended',
            premiered: '2008-01-20',
            rating: { average: 9.2 },
            network: { name: 'AMC' },
            summary: '<p>A chemistry teacher diagnosed with terminal lung cancer...</p>',
            url: 'https://www.tvmaze.com/shows/169/breaking-bad',
          },
        }],
      })

      const res = await tvShowTool.execute({ query: 'Breaking Bad' })
      expect(res.success).toBe(true)
      expect(res.count).toBe(1)
      expect(res.results[0].name).toBe('Breaking Bad')
      expect(res.results[0].rating).toBe(9.2)
      expect(res.results[0].summary).toBe('A chemistry teacher diagnosed with terminal lung cancer...')
    })
  })

  describe('trivia_quiz', () => {
    it('generates decoded trivia questions', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{
            category: 'Science &amp; Nature',
            difficulty: 'easy',
            question: 'What is the chemical symbol for Gold?',
            correct_answer: 'Au',
            incorrect_answers: ['Ag', 'Fe', 'Cu'],
          }],
        }),
      })

      const res = await triviaQuizTool.execute({ amount: 1 })
      expect(res.success).toBe(true)
      expect(res.questions[0].category).toBe('Science & Nature')
      expect(res.questions[0].correct_answer).toBe('Au')
    })
  })

  describe('postal_lookup', () => {
    it('resolves ZIP code to city and state coordinates', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          'post code': '90210',
          country: 'United States',
          'country abbreviation': 'US',
          places: [{
            'place name': 'Beverly Hills',
            state: 'California',
            'state abbreviation': 'CA',
            latitude: '34.0901',
            longitude: '-118.4065',
          }],
        }),
      })

      const res = await postalLookupTool.execute({ postal_code: '90210', country_code: 'US' })
      expect(res.success).toBe(true)
      expect(res.postal_code).toBe('90210')
      expect(res.places[0].place_name).toBe('Beverly Hills')
      expect(res.places[0].latitude).toBe(34.0901)
    })
  })

  describe('nasa_apod', () => {
    it('fetches NASA APOD data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: 'Perseids Meteor',
          date: '2024-08-15',
          media_type: 'image',
          url: 'https://apod.nasa.gov/image.jpg',
          explanation: 'Perseids over lake.',
        }),
      })

      const res = await nasaApodTool.execute()
      expect(res.success).toBe(true)
      expect(res.title).toBe('Perseids Meteor')
      expect(res.url).toContain('image.jpg')
    })
  })

  describe('itunes_search', () => {
    it('searches tracks and audio previews', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{
            trackName: 'Yellow',
            artistName: 'Coldplay',
            collectionName: 'Parachutes',
            primaryGenreName: 'Alternative',
            previewUrl: 'https://audio.itunes.apple.com/preview.m4a',
          }],
        }),
      })

      const res = await itunesSearchTool.execute({ query: 'Coldplay' })
      expect(res.success).toBe(true)
      expect(res.count).toBe(1)
      expect(res.results[0].track_name).toBe('Yellow')
      expect(res.results[0].preview_url).toContain('preview.m4a')
    })
  })

  describe('art_institute', () => {
    it('searches museum artworks', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{
            id: 28560,
            title: 'The Bedroom',
            artist_display: 'Vincent van Gogh',
            date_display: '1889',
            medium_display: 'Oil on canvas',
            image_id: 'abc-123',
          }],
        }),
      })

      const res = await artInstituteTool.execute({ query: 'van gogh' })
      expect(res.success).toBe(true)
      expect(res.results[0].title).toBe('The Bedroom')
      expect(res.results[0].image_url).toContain('abc-123')
    })
  })

  describe('solar_times', () => {
    it('calculates sunrise, sunset and day length', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: {
            sunrise: '2024-08-15T10:00:00+00:00',
            sunset: '2024-08-15T23:50:00+00:00',
            solar_noon: '2024-08-15T16:55:00+00:00',
            day_length: 49800,
          },
        }),
      })

      const res = await solarTimesTool.execute({ latitude: 40.7128, longitude: -74.006 })
      expect(res.success).toBe(true)
      expect(res.day_length).toBe('13h 50m')
      expect(res.sunrise_utc).toContain('2024-08-15')
    })
  })

  describe('dns_lookup', () => {
    it('queries DNS records via DNS-over-HTTPS', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Status: 0,
          Answer: [{ name: 'wikipedia.org.', type: 1, TTL: 300, data: '103.102.166.224' }],
        }),
      })

      const res = await dnsLookupTool.execute({ domain: 'wikipedia.org', type: 'A' })
      expect(res.success).toBe(true)
      expect(res.domain).toBe('wikipedia.org')
      expect(res.answers[0].data).toBe('103.102.166.224')
    })
  })

  describe('activity_suggest', () => {
    it('suggests activities for boredom busting', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          activity: 'Learn calligraphy',
          type: 'education',
          participants: 1,
          price: 0.1,
          accessibility: 0.2,
        }),
      })

      const res = await activitySuggestTool.execute({ type: 'education' })
      expect(res.success).toBe(true)
      expect(res.activity).toBe('Learn calligraphy')
      expect(res.price_level).toBe('Low Cost')
    })
  })

  describe('jokes', () => {
    it('fetches humor jokes with punchlines', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 'programming',
          setup: 'Why do programmers prefer dark mode?',
          punchline: 'Because light attracts bugs.',
        }),
      })

      const res = await jokesTool.execute({ category: 'programming' })
      expect(res.success).toBe(true)
      expect(res.setup).toContain('dark mode')
      expect(res.punchline).toContain('bugs')
    })
  })

  describe('animal_facts', () => {
    it('fetches cat facts and dog breed info', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fact: 'Cats have 32 muscles in each ear.',
        }),
      })

      const res = await animalFactsTool.execute({ animal: 'cat' })
      expect(res.success).toBe(true)
      expect(res.fact).toContain('32 muscles')
    })
  })

  describe('meal_recipe', () => {
    it('searches recipes with ingredients and instructions', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          meals: [{
            strMeal: 'Lasagna',
            strCategory: 'Pasta',
            strArea: 'Italian',
            strInstructions: 'Bake at 375F.',
            strIngredient1: 'Pasta sheets',
            strMeasure1: '1 pack',
            strIngredient2: 'Tomato sauce',
            strMeasure2: '2 cups',
          }],
        }),
      })

      const res = await mealRecipeTool.execute({ query: 'lasagna' })
      expect(res.success).toBe(true)
      expect(res.count).toBe(1)
      expect(res.recipes[0].meal).toBe('Lasagna')
      expect(res.recipes[0].cuisine).toBe('Italian')
      expect(res.recipes[0].ingredients).toContain('1 pack Pasta sheets')
    })
  })

  describe('cocktail_recipe', () => {
    it('searches cocktail & mocktail recipes', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          drinks: [{
            strDrink: 'Mojito',
            strAlcoholic: 'Alcoholic',
            strGlass: 'Highball glass',
            strInstructions: 'Muddle mint with sugar.',
            strIngredient1: 'White Rum',
            strMeasure1: '2 oz',
            strIngredient2: 'Fresh lime juice',
            strMeasure2: '1 oz',
          }],
        }),
      })

      const res = await cocktailRecipeTool.execute({ query: 'mojito' })
      expect(res.success).toBe(true)
      expect(res.count).toBe(1)
      expect(res.drinks[0].name).toBe('Mojito')
      expect(res.drinks[0].glass).toBe('Highball glass')
    })
  })

  describe('federal_register', () => {
    it('searches federal regulations and executive documents', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{
            title: 'Artificial Intelligence in Transportation',
            type: 'RULE',
            agency_names: ['Department of Transportation'],
            publication_date: '2024-05-01',
            abstract: 'New safety standards for AI navigation systems.',
          }],
        }),
      })

      const res = await federalRegisterTool.execute({ query: 'artificial intelligence' })
      expect(res.success).toBe(true)
      expect(res.count).toBe(1)
      expect(res.documents[0].title).toContain('Artificial Intelligence')
      expect(res.documents[0].type).toBe('RULE')
    })
  })

  describe('wayback_archive', () => {
    it('checks historical snapshot availability on Internet Archive', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          archived_snapshots: {
            closest: {
              available: true,
              url: 'http://web.archive.org/web/20240101/https://example.com',
              timestamp: '20240101120000',
              status: '200',
            },
          },
        }),
      })

      const res = await waybackArchiveTool.execute({ url: 'example.com' })
      expect(res.success).toBe(true)
      expect(res.archived).toBe(true)
      expect(res.snapshot_url).toContain('web.archive.org')
      expect(res.snapshot_timestamp).toBe('20240101120000')
    })
  })

  describe('user_profile_gen', () => {
    it('generates realistic mock user personas', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{
            name: { title: 'Ms', first: 'Jane', last: 'Doe' },
            gender: 'female',
            email: 'jane.doe@example.com',
            phone: '555-0199',
            location: {
              street: { number: 123, name: 'Main St' },
              city: 'Seattle',
              state: 'Washington',
              country: 'United States',
              postcode: 98101,
            },
            dob: { age: 32 },
            picture: { large: 'https://randomuser.me/api/portraits/women/1.jpg' },
          }],
        }),
      })

      const res = await userProfileGenTool.execute({ gender: 'female', nat: 'US' })
      expect(res.success).toBe(true)
      expect(res.name).toBe('Ms Jane Doe')
      expect(res.gender).toBe('female')
      expect(res.email).toBe('jane.doe@example.com')
      expect(res.location.city).toBe('Seattle')
    })
  })

  describe('nasa_asteroids', () => {
    it('tracks near-Earth objects with diameter and velocity', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          element_count: 1,
          near_earth_objects: {
            '2026-08-15': [{
              name: '2026 Asteroid A',
              neo_reference_id: '12345',
              is_potentially_hazardous_asteroid: false,
              estimated_diameter: { meters: { estimated_diameter_min: 50, estimated_diameter_max: 120 } },
              close_approach_data: [{
                close_approach_date_full: '2026-Aug-15 12:00',
                relative_velocity: { kilometers_per_hour: '45000' },
                miss_distance: { kilometers: '2500000' },
              }],
            }],
          },
        }),
      })

      const res = await nasaAsteroidsTool.execute({ date: '2026-08-15' })
      expect(res.success).toBe(true)
      expect(res.count).toBe(1)
      expect(res.asteroids[0].name).toBe('2026 Asteroid A')
      expect(res.asteroids[0].estimated_diameter_meters.max).toBe(120)
    })
  })

  describe('bible_scripture', () => {
    it('looks up scripture verses and translations', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          reference: 'John 3:16',
          text: 'For God so loved the world...',
          translation_name: 'World English Bible',
          verses: [{ verse: 16, text: 'For God so loved the world...' }],
        }),
      })

      const res = await bibleScriptureTool.execute({ passage: 'John 3:16' })
      expect(res.success).toBe(true)
      expect(res.reference).toBe('John 3:16')
      expect(res.text).toContain('For God so loved')
    })
  })

  describe('wikimedia_feed', () => {
    it('fetches featured article and on-this-day historical events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tfa: {
            title: 'Apollo 11',
            extract: 'First crewed mission to land on the Moon.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Apollo_11' } },
          },
          onthisday: [{ year: 1969, text: 'Apollo 11 landed on the Moon.' }],
          news: [{ story: 'Major historical anniversary celebrated worldwide.' }],
        }),
      })

      const res = await wikimediaFeedTool.execute({ date: '2026/08/15' })
      expect(res.success).toBe(true)
      expect(res.featured_article.title).toBe('Apollo 11')
      expect(res.on_this_day[0].year).toBe(1969)
    })
  })
})
