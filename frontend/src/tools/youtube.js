// This file used to carry its own copy of the relay list and the worker URL,
// so it missed every improvement made to the shared one: no cooldown on a relay
// that just 403'd, no worker-first ordering, and jina (which returns markdown,
// useless for scraping captionTracks) tried before the proxies that return real
// HTML. One implementation, in http.js.
import { proxyText } from './http'

const fetchViaRelay = (url) => proxyText(url)

/**
 * Try the user's OWN connection first (their residential IP is not rate-limited
 * like the datacenter relays are), then fall back to the relay chain. Reading
 * youtube.com cross-origin is usually blocked by CORS since it sends no ACAO
 * header — but the timedtext/caption host sometimes does, and a direct hit
 * avoids the 429 wall entirely when it works. Costs one cheap failed fetch.
 */
async function fetchPage(url) {
  try {
    const r = await fetch(url, { credentials: 'omit' })
    if (r.ok) {
      const t = await r.text()
      if (t) return t
    }
  } catch {
    // CORS/network — expected for youtube.com; fall through to relays.
  }
  return fetchViaRelay(url)
}

function extractVideoId(url) {
  const match = String(url || '').match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/)
  return match?.[1] || String(url || '').trim()
}

function findCaptionTracks(html) {
  const match = html.match(/"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*(?:,\s*"translationLanguages"|\s*\])/)
  if (!match) return []
  try {
    return JSON.parse(match[1])
  } catch {
    return []
  }
}

function pickCaptionTrack(tracks) {
  if (!tracks.length) return null
  return tracks.find(t => /^en(-|$)/i.test(t.languageCode || '')) ||
    tracks.find(t => !t.kind && t.baseUrl) ||
    tracks.find(t => t.baseUrl) ||
    null
}

function parseTranscriptPayload(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed)
      if (Array.isArray(json.events)) {
        return json.events
          .flatMap(ev => ev.segs || [])
          .map(seg => seg.utf8 || '')
          .join('')
          .replace(/\s+\n/g, '\n')
          .replace(/[ \t]{2,}/g, ' ')
          .trim()
      }
    } catch {
      // Fall through to XML parsing.
    }
  }

  const doc = new DOMParser().parseFromString(trimmed, 'text/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) return ''
  const parts = [...doc.querySelectorAll('text')].map(node => node.textContent?.trim()).filter(Boolean)
  return parts.join(' ').replace(/[ \t]{2,}/g, ' ').trim()
}

export const youtubeTool = {
  schema: {
    description: 'Get YouTube video information and best-effort caption transcript when available',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'YouTube video URL or ID' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    const id = extractVideoId(url)
    const canonicalUrl = `https://www.youtube.com/watch?v=${id}`
    let data = null
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`)
      if (oembedRes.ok) {
        data = await oembedRes.json()
      }
    } catch {}

    if (!data || !data.title) {
      try {
        const noembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`)
        if (noembedRes.ok) {
          const d = await noembedRes.json()
          if (!d.error && d.title) data = d
        }
      } catch {}
    }

    if (!data) {
      data = { title: `YouTube Video (${id})`, author_name: 'YouTube' }
    }

    let transcript = ''
    let transcriptLanguage = ''
    let transcriptAvailable = false

    // Scrape captionTracks out of the watch page. Measured 2026-08-09: YouTube
    // answers 429 to every CORS relay and to our own Worker, the InnerTube WEB
    // client returns a response with captions stripped, video.google.com's
    // legacy timedtext returns an empty body, and the public Piped/Invidious
    // instances are 502/403. There is no keyless transcript route from a
    // datacenter IP today, so this is attempted once and allowed to fail.
    {
      try {
        const html = await fetchPage(canonicalUrl)
        const track = pickCaptionTrack(findCaptionTracks(html))
        if (track?.baseUrl) {
          const trackUrl = new URL(track.baseUrl)
          trackUrl.searchParams.set('fmt', 'json3')
          transcript = parseTranscriptPayload(await fetchPage(trackUrl.toString())).slice(0, 12000)
          transcriptLanguage = track.languageCode || ''
          transcriptAvailable = !!transcript
        }
      } catch {
        // Metadata alone is still useful; the caller is told why, so the model
        // says "no transcript" instead of inventing the video's contents.
      }
    }

    return {
      success: true, tool: 'youtube',
      title: data.title, author: data.author_name,
      thumbnail: data.thumbnail_url,
      url: canonicalUrl,
      transcript: transcript || undefined,
      text: transcript || undefined,
      transcript_language: transcriptLanguage || undefined,
      transcript_available: transcriptAvailable,
      transcript_note: transcriptAvailable ? undefined
        : 'No transcript available: YouTube refuses caption requests from this ' +
          'browser (CORS) and 429s every relay and the app proxy. Do NOT guess or ' +
          'infer what the video contains. Say the transcript could not be fetched, ' +
          'mention the title and channel, and offer to work from a transcript the ' +
          'user pastes in or uploads as a file.',
    }
  }
}
