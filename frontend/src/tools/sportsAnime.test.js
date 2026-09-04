import { describe, it, expect, vi, afterEach } from 'vitest'
import { sportsTool, animeTool } from './sportsAnime'

describe('sports_scores (TheSportsDB)', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('requires a valid action', async () => {
    const res = await sportsTool.execute({ action: 'nonsense' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Unknown action/)
  })

  it('search_team requires team', async () => {
    const res = await sportsTool.execute({ action: 'search_team' })
    expect(res.success).toBe(false)
  })

  it('search_team maps teams from the real response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        teams: [{ idTeam: '133604', strTeam: 'Arsenal', strSport: 'Soccer', strLeague: 'English Premier League', idLeague: '4328', intFormedYear: '1892' }],
      }),
    })
    const res = await sportsTool.execute({ action: 'search_team', team: 'Arsenal' })
    expect(res.success).toBe(true)
    expect(res.teams[0]).toMatchObject({ id: '133604', name: 'Arsenal', league_id: '4328' })
  })

  it('next_events requires team_id', async () => {
    const res = await sportsTool.execute({ action: 'next_events' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/team_id/)
  })

  it('next_events maps fixtures, including scores when present', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [{
          idEvent: '1', strEvent: 'Arsenal vs Chelsea', strLeague: 'EPL', dateEvent: '2026-09-06',
          strTime: '15:30:00', strHomeTeam: 'Arsenal', strAwayTeam: 'Chelsea', intHomeScore: null, intAwayScore: null,
        }],
      }),
    })
    const res = await sportsTool.execute({ action: 'next_events', team_id: '133604' })
    expect(res.success).toBe(true)
    expect(res.events[0]).toMatchObject({ home_team: 'Arsenal', away_team: 'Chelsea', status: 'Scheduled' })
  })

  it('events_day defaults to today and reports no-events honestly', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: null }) })
    const res = await sportsTool.execute({ action: 'events_day' })
    expect(res.success).toBe(true)
    expect(res.count).toBe(0)
    expect(res.note).toMatch(/No events found/)
  })

  it('table requires league_id', async () => {
    const res = await sportsTool.execute({ action: 'table' })
    expect(res.success).toBe(false)
  })

  it('table maps standings with numeric fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        table: [{ intRank: '1', strTeam: 'Arsenal', intPlayed: '38', intWin: '26', intDraw: '7', intLoss: '5', intGoalDifference: '44', intPoints: '85', strForm: 'WWWWW' }],
      }),
    })
    const res = await sportsTool.execute({ action: 'table', league_id: '4328', season: '2025-2026' })
    expect(res.success).toBe(true)
    expect(res.table[0]).toMatchObject({ rank: 1, team: 'Arsenal', points: 85 })
  })

  it('surfaces a real fetch failure rather than throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
    const res = await sportsTool.execute({ action: 'search_team', team: 'Arsenal' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/503/)
  })
})

describe('anime_lookup (Jikan)', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('searches anime by title', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          mal_id: 20, title: 'Naruto', type: 'TV', episodes: 220, status: 'Finished Airing',
          score: 7.99, genres: [{ name: 'Action' }], synopsis: 'A ninja...', images: { jpg: { image_url: 'https://x/y.jpg' } }, url: 'https://myanimelist.net/anime/20',
        }],
      }),
    })
    const res = await animeTool.execute({ query: 'naruto' })
    expect(res.success).toBe(true)
    expect(res.results[0]).toMatchObject({ id: 20, title: 'Naruto', episodes: 220 })
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/v4/anime?q=naruto'), expect.any(Object))
  })

  it('falls back to top/anime when no query is given', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ mal_id: 5, title: 'Cowboy Bebop', type: 'TV' }] }) })
    const res = await animeTool.execute({})
    expect(res.success).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/v4/top/anime'), expect.any(Object))
  })

  it('routes manga queries to the manga endpoint and mapper', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ mal_id: 2, title: 'Berserk', type: 'Manga', chapters: null, volumes: null, status: 'Publishing' }] }),
    })
    const res = await animeTool.execute({ query: 'berserk', kind: 'manga' })
    expect(res.success).toBe(true)
    expect(res.results[0]).toMatchObject({ title: 'Berserk', type: 'Manga' })
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/v4/manga?q=berserk'), expect.any(Object))
  })

  it('reports empty results honestly rather than an empty success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    const res = await animeTool.execute({ query: 'zzzznonexistentzzzz' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/No anime found/)
  })

  it('surfaces upstream flakiness (observed live: Jikan 504s while proxying MAL) as a real error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 504, statusText: 'Gateway Timeout' })
    const res = await animeTool.execute({ query: 'naruto' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/504/)
  })
})
