/**
 * ElevenLabs Cloud Voice Integration.
 * 
 * Provides studio-grade text-to-speech synthesis using the ElevenLabs REST API.
 * Supports standard ElevenLabs models (eleven_multilingual_v2, eleven_turbo_v2_5, eleven_monolingual_v1),
 * custom voice cloning IDs, and custom voice parameters (stability, similarity_boost).
 * 
 * Securely stores API keys locally using Yogatik's keychain / IndexedDB settings.
 */

import { getSetting, setSetting } from '../db'

export const ELEVENLABS_API_KEY_SETTING = 'apikey_elevenlabs'
export const ELEVENLABS_VOICE_SETTING = 'voice_elevenlabs_id'
export const ELEVENLABS_MODEL_SETTING = 'voice_elevenlabs_model'

export const DEFAULT_ELEVENLABS_VOICE = '21m00Tcm4TlvDq8ikWAM' // Rachel
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_turbo_v2_5'

export const DEFAULT_ELEVENLABS_VOICES = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel — Calm & Natural (US)', category: 'premade' },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi — Strong & Engaging (US)', category: 'premade' },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella — Soft & Expressive (US)', category: 'premade' },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni — Warm & Polished (US)', category: 'premade' },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli — Dynamic & Friendly (US)', category: 'premade' },
  { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh — Deep & Narrative (US)', category: 'premade' },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold — Resonant & Crisp (US)', category: 'premade' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam — Smooth & Clear (US)', category: 'premade' },
  { voice_id: 'yoZ06aIUZZAproAlrnax', name: 'Harry — Warm & Sophisticated (UK)', category: 'premade' },
]

/**
 * Retrieve saved ElevenLabs API Key.
 */
export async function getElevenLabsApiKey() {
  try {
    return (await getSetting(ELEVENLABS_API_KEY_SETTING, '')) || ''
  } catch {
    return ''
  }
}

/**
 * Save ElevenLabs API Key.
 */
export async function saveElevenLabsApiKey(key) {
  try {
    await setSetting(ELEVENLABS_API_KEY_SETTING, (key || '').trim())
    return true
  } catch {
    return false
  }
}

/**
 * Test connectivity and fetch account info with the given API key.
 */
export async function testElevenLabsKey(apiKey) {
  const key = apiKey || (await getElevenLabsApiKey())
  if (!key) throw new Error('ElevenLabs API key is missing.')

  const res = await fetch('https://api.elevenlabs.io/v1/user', {
    headers: {
      'xi-api-key': key,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ElevenLabs authentication failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return {
    success: true,
    tier: data?.subscription?.tier || 'free',
    characterCount: data?.subscription?.character_count || 0,
    characterLimit: data?.subscription?.character_limit || 0,
  }
}

/**
 * Fetch available voices for the account (premade + user clones).
 */
export async function fetchElevenLabsVoices(apiKey) {
  const key = apiKey || (await getElevenLabsApiKey())
  if (!key) return DEFAULT_ELEVENLABS_VOICES

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
    })
    if (!res.ok) return DEFAULT_ELEVENLABS_VOICES
    const data = await res.json()
    if (Array.isArray(data?.voices) && data.voices.length > 0) {
      return data.voices.map(v => ({
        voice_id: v.voice_id,
        name: `${v.name}${v.category === 'cloned' ? ' (Custom Clone)' : ''}`,
        category: v.category || 'premade',
        preview_url: v.preview_url,
      }))
    }
    return DEFAULT_ELEVENLABS_VOICES
  } catch {
    return DEFAULT_ELEVENLABS_VOICES
  }
}

/**
 * Synthesize speech from text using ElevenLabs REST API.
 * @returns {Promise<{ blob: Blob, audioUrl: string, durationSec?: number }>}
 */
export async function synthesizeElevenLabs({
  text,
  voiceId = DEFAULT_ELEVENLABS_VOICE,
  modelId = DEFAULT_ELEVENLABS_MODEL,
  apiKey,
  stability = 0.5,
  similarityBoost = 0.75,
}) {
  const key = apiKey || (await getElevenLabsApiKey())
  if (!key) {
    throw new Error('ElevenLabs API key is required. Please configure it in Settings.')
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': key,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: Number(stability) || 0.5,
        similarity_boost: Number(similarityBoost) || 0.75,
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ElevenLabs TTS error (${res.status}): ${errText}`)
  }

  const blob = await res.blob()
  const audioUrl = URL.createObjectURL(blob)

  return {
    blob,
    audioUrl,
    mime: 'audio/mpeg',
  }
}
