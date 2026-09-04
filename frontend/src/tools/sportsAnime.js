/**
 * Sports scores/schedules + anime/manga lookup — both keyless, both CORS-verified
 * live before being added (curl, with an Origin header, 2026-09-04):
 *
 *   TheSportsDB (thesportsdb.com)   access-control-allow-origin: *
 *   Jikan v4 (api.jikan.moe)        access-control-allow-origin: *
 *
 * TheSportsDB note: since their 2023 policy change, a real per-app key needs a
 * Patreon subscription. The free path is their own documented shared TEST key
 * "3" — intentionally public, rate-limited across every app using it (not just
 * this one). Fine for occasional lookups; do not build anything here that polls.
 *
 * Jikan note: it proxies MyAnimeList, which is occasionally slow/down — its
 * /anime search endpoint returned a live 504 ("Jikan failed to connect to
 * MyAnimeList") during verification while /top/anime and a by-id lookup both
 * returned 200 moments later. That is upstream flakiness, not a CORS or key
 * problem, and the tool surfaces the real error rather than retrying blindly —
 * same as this codebase's Stooq bot-check and YouTube datacenter-IP notes.
 */

const SPORTSDB_KEY = '3' // TheSportsDB's own public test key — see note above
const SPORTSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`

const json = async (url) => {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${new URL(url).hostname}`)
  return r.json()
}

// ─── Sports scores & schedules (TheSportsDB) ─────────────────────────────────
function mapEvent(e) {
  return {
    id: e.idEvent,
    event: e.strEvent,
    league: e.strLeague,
    season: e.strSeason,
    date: e.dateEvent,
    time: e.strTime || undefined,
    home_team: e.strHomeTeam,
    away_team: e.strAwayTeam,
    home_score: e.intHomeScore != null ? Number(e.intHomeScore) : undefined,
    away_score: e.intAwayScore != null ? Number(e.intAwayScore) : undefined,
    venue: e.strVenue || undefined,
    status: e.strStatus || (e.intHomeScore != null ? 'Finished' : 'Scheduled'),
  }
}

export const sportsTool = {
  schema: {
    description:
      'Sports scores, schedules and standings (TheSportsDB — football/soccer, basketball, American football, baseball, hockey and more). ' +
      'action="search_team" finds a team and its id/league; "next_events"/"last_events" need a team_id (from search_team) and list upcoming/recent ' +
      'fixtures with scores; "events_day" lists all events on a given date (optionally filtered by sport); "table" needs a league_id and season and ' +
      'returns the standings. Always search_team first if you only have a team name. Scores change constantly — never answer from memory.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search_team', 'next_events', 'last_events', 'events_day', 'table'],
          description: 'What to look up.',
        },
        team: { type: 'string', description: 'Team name, for action="search_team".' },
        team_id: { type: 'string', description: 'TheSportsDB team id (from search_team), for next_events/last_events.' },
        date: { type: 'string', description: 'YYYY-MM-DD, for action="events_day". Defaults to today.' },
        sport: { type: 'string', description: 'Optional sport filter for events_day, e.g. "Soccer", "Basketball".' },
        league_id: { type: 'string', description: 'TheSportsDB league id, for action="table".' },
        season: { type: 'string', description: 'Season string for action="table", e.g. "2025-2026".' },
      },
      required: ['action'],
    },
  },
  async execute({ action, team, team_id, date, sport, league_id, season } = {}) {
    try {
      if (action === 'search_team') {
        if (!team) return { success: false, error: 'team is required for search_team' }
        const d = await json(`${SPORTSDB_BASE}/searchteams.php?t=${encodeURIComponent(team.trim())}`)
        const teams = (d.teams || []).slice(0, 5).map(t => ({
          id: t.idTeam, name: t.strTeam, sport: t.strSport, league: t.strLeague,
          league_id: t.idLeague, founded: t.intFormedYear, badge: t.strTeamBadge,
        }))
        if (!teams.length) return { success: false, error: `No team found matching "${team}"` }
        return { success: true, tool: 'sports_scores', action, teams }
      }

      if (action === 'next_events' || action === 'last_events') {
        if (!team_id) return { success: false, error: `team_id is required for ${action} — run search_team first` }
        const path = action === 'next_events' ? 'eventsnext.php' : 'eventspast.php'
        const d = await json(`${SPORTSDB_BASE}/${path}?id=${encodeURIComponent(team_id)}`)
        const events = (d.events || []).map(mapEvent)
        return {
          success: true, tool: 'sports_scores', action, team_id, count: events.length, events,
          note: events.length ? undefined : 'No fixtures found for this team right now.',
        }
      }

      if (action === 'events_day') {
        const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10)
        let url = `${SPORTSDB_BASE}/eventsday.php?d=${d}`
        if (sport) url += `&s=${encodeURIComponent(sport)}`
        const data = await json(url)
        const events = (data.events || []).map(mapEvent)
        return {
          success: true, tool: 'sports_scores', action, date: d, sport: sport || 'all', count: events.length, events,
          note: events.length ? undefined : `No events found on ${d}${sport ? ` for ${sport}` : ''}.`,
        }
      }

      if (action === 'table') {
        if (!league_id) return { success: false, error: 'league_id is required for action="table"' }
        let url = `${SPORTSDB_BASE}/lookuptable.php?l=${encodeURIComponent(league_id)}`
        if (season) url += `&s=${encodeURIComponent(season)}`
        const d = await json(url)
        const table = (d.table || []).map(r => ({
          rank: Number(r.intRank), team: r.strTeam, played: Number(r.intPlayed),
          win: Number(r.intWin), draw: Number(r.intDraw), loss: Number(r.intLoss),
          goal_diff: Number(r.intGoalDifference), points: Number(r.intPoints), form: r.strForm || undefined,
        }))
        if (!table.length) return { success: false, error: 'No standings found for that league/season.' }
        return { success: true, tool: 'sports_scores', action, league_id, season: season || table[0]?.strSeason, table }
      }

      return { success: false, error: `Unknown action "${action}". Use search_team, next_events, last_events, events_day or table.` }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Anime / manga lookup (Jikan / MyAnimeList) ──────────────────────────────
function mapAnime(a) {
  return {
    id: a.mal_id,
    title: a.title,
    title_english: a.title_english || undefined,
    type: a.type,
    episodes: a.episodes ?? undefined,
    status: a.status,
    aired: a.aired?.string,
    score: a.score ?? undefined,
    rank: a.rank ?? undefined,
    genres: (a.genres || []).map(g => g.name),
    synopsis: a.synopsis ? a.synopsis.replace(/\s+/g, ' ').slice(0, 600) : undefined,
    image: a.images?.jpg?.image_url,
    url: a.url,
  }
}
function mapManga(m) {
  return {
    id: m.mal_id,
    title: m.title,
    title_english: m.title_english || undefined,
    type: m.type,
    chapters: m.chapters ?? undefined,
    volumes: m.volumes ?? undefined,
    status: m.status,
    score: m.score ?? undefined,
    genres: (m.genres || []).map(g => g.name),
    synopsis: m.synopsis ? m.synopsis.replace(/\s+/g, ' ').slice(0, 600) : undefined,
    image: m.images?.jpg?.image_url,
    url: m.url,
  }
}

export const animeTool = {
  schema: {
    description:
      'Search for anime or manga (MyAnimeList via Jikan): title, type, episode/chapter count, airing status, score, genres and synopsis. ' +
      'Omit query to get the current top-ranked anime instead. MyAnimeList data is user-maintained and can lag real-world release news by a day or two.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title to search for. Omit to list top-ranked anime.' },
        kind: { type: 'string', enum: ['anime', 'manga'], description: 'Default anime.' },
        limit: { type: 'number', description: 'How many results (1-10, default 5).' },
      },
      required: [],
    },
  },
  async execute({ query, kind = 'anime', limit = 5 } = {}) {
    const n = Math.max(1, Math.min(10, Math.floor(limit) || 5))
    const path = kind === 'manga' ? 'manga' : 'anime'
    try {
      const url = query
        ? `https://api.jikan.moe/v4/${path}?q=${encodeURIComponent(query.trim())}&limit=${n}`
        : `https://api.jikan.moe/v4/top/${path}?limit=${n}`
      const d = await json(url)
      const list = d.data || []
      if (!list.length) return { success: false, error: query ? `No ${kind} found matching "${query}"` : `Could not load top ${kind}.` }
      const results = list.map(kind === 'manga' ? mapManga : mapAnime)
      return { success: true, tool: 'anime_lookup', kind, query: query || `top ${kind}`, count: results.length, results }
    } catch (e) {
      return { success: false, error: `${e.message} — MyAnimeList/Jikan is occasionally slow; try again shortly.` }
    }
  },
}
