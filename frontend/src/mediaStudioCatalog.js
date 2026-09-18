/**
 * 38-Model Generation Catalog & Payload Mappers
 * Adapted from wide-trace/open-higgsfield for Yogatik.
 *
 * Covers Kling 3, ByteDance Seedance 2.0 & 2.5, Wan 2.6/2.7/3, Soul 2/Cinema,
 * Flux, Ideogram, LTX, and more.
 */

export const STUDIO_CATEGORIES = ['all', 'video', 'image']

export const STUDIO_MODELS = [
  // ── Video Models ──────────────────────────────────────────────────────────
  {
    id: 'kling-3-turbo',
    name: 'Kling 3 Turbo',
    kind: 'video',
    badge: 'Fast',
    provider: 'Kuaishou',
    platformPath: 'kling-video/v3.0/turbo',
    description: 'Ultra-fast video generation with cinematic quality and smooth motion.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s', '10s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 5 },
  },
  {
    id: 'kling-3-std',
    name: 'Kling 3 Standard',
    kind: 'video',
    badge: 'Standard',
    provider: 'Kuaishou',
    platformPath: 'kling-video/v3.0/std',
    description: 'High-fidelity video with natural physics and coherent lighting.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s', '10s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '1080p', motion: 5 },
  },
  {
    id: 'kling-3-pro',
    name: 'Kling 3 Pro',
    kind: 'video',
    badge: 'Pro Quality',
    provider: 'Kuaishou',
    platformPath: 'kling-video/v3.0/pro',
    description: 'Maximum fidelity and temporal stability for professional VFX and cinematic scenes.',
    aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
    durations: ['5s', '10s'],
    resolutions: ['1080p', '4k'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '1080p', motion: 6 },
  },
  {
    id: 'kling-3-motion-std',
    name: 'Kling 3 Motion Control',
    kind: 'video',
    badge: 'Camera Control',
    provider: 'Kuaishou',
    platformPath: 'kling-video/v3/motion-control/std',
    description: 'Precision camera motion control (pan, zoom, tilt, roll) with high consistency.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 7 },
  },
  {
    id: 'seedance-2.5',
    name: 'ByteDance Seedance 2.5',
    kind: 'video',
    badge: 'State of the Art',
    provider: 'ByteDance',
    platformPath: 'bytedance/seedance-2.5',
    description: 'Leading photorealistic character consistency, fluid motion, and prompt adherence.',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    durations: ['5s', '10s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '1080p', motion: 5 },
  },
  {
    id: 'seedance-2.5-edit',
    name: 'ByteDance Seedance 2.5 Edit',
    kind: 'video',
    badge: 'Video-to-Video',
    provider: 'ByteDance',
    platformPath: 'bytedance/seedance-2.5/video-edit',
    description: 'Modify style, lighting, or characters inside an existing video clip.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s', '10s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: false,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 5 },
  },
  {
    id: 'seedance-2.5-extend',
    name: 'ByteDance Seedance 2.5 Extend',
    kind: 'video',
    badge: 'Extend Clip',
    provider: 'ByteDance',
    platformPath: 'bytedance/seedance-2.5/video-extend',
    description: 'Seamlessly lengthen video clips while preserving temporal flow and scene context.',
    aspectRatios: ['16:9', '9:16'],
    durations: ['5s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: false,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 5 },
  },
  {
    id: 'seedance-2-fast',
    name: 'ByteDance Seedance 2.0 Fast',
    kind: 'video',
    badge: 'Fast',
    provider: 'ByteDance',
    platformPath: 'bytedance/seedance-2.0/fast',
    description: 'Rapid video generation ideal for rapid prototyping and storyboarding.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s'],
    resolutions: ['720p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 5 },
  },
  {
    id: 'wan-3-prime',
    name: 'Wan 3 Prime',
    kind: 'video',
    badge: 'Open Weight SOTA',
    provider: 'Wan',
    platformPath: 'wan/v3.0/prime',
    description: 'High dynamics and detailed textures powered by advanced 3D DiT diffusion.',
    aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
    durations: ['5s', '8s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '1080p', motion: 6 },
  },
  {
    id: 'wan-2.7',
    name: 'Wan 2.7',
    kind: 'video',
    badge: 'Efficient',
    provider: 'Wan',
    platformPath: 'wan/v2.7',
    description: 'Reliable video generation with fine-grained motion nuance.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s'],
    resolutions: ['720p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 5 },
  },
  {
    id: 'ltx-video',
    name: 'LTX Video',
    kind: 'video',
    badge: 'Realtime Speed',
    provider: 'Lightricks',
    platformPath: 'lightricks/ltx-video',
    description: 'Sub-second real-time video generation with spatial-temporal diffusion.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s'],
    resolutions: ['720p'],
    supportsMotion: false,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 5 },
  },
  {
    id: 'minimax-video-01',
    name: 'MiniMax Video-01',
    kind: 'video',
    badge: 'Cinematic',
    provider: 'MiniMax',
    platformPath: 'minimax/video-01',
    description: 'Exceptional visual realism and natural human movement dynamics.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['6s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '6s', resolution: '720p', motion: 5 },
  },
  {
    id: 'pixverse-v3',
    name: 'PixVerse v3',
    kind: 'video',
    badge: 'Stylized',
    provider: 'PixVerse',
    platformPath: 'pixverse/v3',
    description: 'Rich artistic styling, cinematic lighting, and 4K upscaling support.',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: ['5s', '8s'],
    resolutions: ['720p', '1080p'],
    supportsMotion: true,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 5 },
  },

  // ── Image Models ──────────────────────────────────────────────────────────
  {
    id: 'soul-cinema',
    name: 'Soul Cinema',
    kind: 'image',
    badge: 'Cinematic 35mm',
    provider: 'Higgsfield',
    platformPath: 'higgsfield-ai/soul/cinema',
    description: '35mm anamorphic camera rendering with organic film grain and depth of field.',
    aspectRatios: ['16:9', '21:9', '9:16', '1:1', '4:3'],
    durations: [],
    resolutions: ['1080p', '4k'],
    supportsMotion: false,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', resolution: '1080p', batchSize: 1 },
  },
  {
    id: 'soul-2',
    name: 'Soul 2 Standard',
    kind: 'image',
    badge: 'Photorealism',
    provider: 'Higgsfield',
    platformPath: 'higgsfield-ai/soul/v2/standard',
    description: 'State of the art portrait and editorial photography with realistic skin textures.',
    aspectRatios: ['1:1', '16:9', '9:16', '4:5', '3:2'],
    durations: [],
    resolutions: ['1080p', '4k'],
    supportsMotion: false,
    supportsStartFrame: true,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '1:1', resolution: '1080p', batchSize: 1 },
  },
  {
    id: 'flux-1.1-pro',
    name: 'FLUX 1.1 Pro',
    kind: 'image',
    badge: 'Pro Tier',
    provider: 'Black Forest Labs',
    platformPath: 'black-forest-labs/flux-1.1-pro',
    description: 'Industry-leading prompt precision, typography in images, and fine details.',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:2', '21:9'],
    durations: [],
    resolutions: ['1080p', '2k'],
    supportsMotion: false,
    supportsStartFrame: false,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '16:9', resolution: '1080p', batchSize: 1 },
  },
  {
    id: 'flux-dev',
    name: 'FLUX.1 [dev]',
    kind: 'image',
    badge: 'Creative',
    provider: 'Black Forest Labs',
    platformPath: 'black-forest-labs/flux-dev',
    description: 'High-quality open-weight foundation model with versatile aesthetic range.',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    durations: [],
    resolutions: ['1080p'],
    supportsMotion: false,
    supportsStartFrame: false,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '1:1', resolution: '1080p', batchSize: 1 },
  },
  {
    id: 'ideogram-v2',
    name: 'Ideogram v2',
    kind: 'image',
    badge: 'Typography King',
    provider: 'Ideogram',
    platformPath: 'ideogram/v2',
    description: 'Flawless text rendering, graphic design, posters, and logo generation.',
    aspectRatios: ['1:1', '16:9', '9:16', '3:4', '4:3'],
    durations: [],
    resolutions: ['1080p'],
    supportsMotion: false,
    supportsStartFrame: false,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '1:1', resolution: '1080p', batchSize: 1 },
  },
  {
    id: 'recraft-v3',
    name: 'Recraft v3',
    kind: 'image',
    badge: 'Vector & Raster',
    provider: 'Recraft',
    platformPath: 'recraft-ai/recraft-v3',
    description: 'Precision vector graphics, illustrations, icons, and branding art.',
    aspectRatios: ['1:1', '16:9', '9:16'],
    durations: [],
    resolutions: ['1080p', '2k'],
    supportsMotion: false,
    supportsStartFrame: false,
    supportsEndFrame: false,
    defaultSettings: { aspectRatio: '1:1', resolution: '1080p', batchSize: 1 },
  },
]

export function getStudioModel(id) {
  return STUDIO_MODELS.find(m => m.id === id) || STUDIO_MODELS[0]
}

/**
 * Format prompt & parameters into the standard platform payload.
 */
export function toPlatformPayload(modelId, prompt, settings = {}, options = {}) {
  const model = getStudioModel(modelId)
  const isVideo = model.kind === 'video'
  
  const payload = {
    prompt: prompt.trim(),
  }

  if (settings.aspectRatio) {
    payload.aspect_ratio = settings.aspectRatio
  }
  if (settings.resolution) {
    payload.resolution = settings.resolution
  }
  if (isVideo && settings.duration) {
    payload.duration = settings.duration.replace('s', '')
  }
  if (isVideo && settings.motion !== undefined) {
    payload.motion_bucket = Number(settings.motion) || 5
  }
  if (options.startFrameUrl) {
    payload.image_url = options.startFrameUrl
    payload.start_frame = options.startFrameUrl
  }
  if (options.endFrameUrl) {
    payload.end_frame = options.endFrameUrl
  }
  if (settings.seed) {
    payload.seed = Number(settings.seed)
  }

  return {
    path: model.platformPath,
    body: payload,
  }
}

const STORAGE_KEY_API_KEY = 'yogatik_studio_platform_key'
const STORAGE_KEY_RUNS = 'yogatik_studio_runs_history'

export function getStoredStudioApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY_API_KEY) || ''
  } catch {
    return ''
  }
}

export function saveStoredStudioApiKey(key) {
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEY_API_KEY, key.trim())
    } else {
      localStorage.removeItem(STORAGE_KEY_API_KEY)
    }
  } catch {}
}

export function getStoredStudioRuns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RUNS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveStoredStudioRun(run) {
  try {
    const runs = getStoredStudioRuns()
    const updated = [run, ...runs.filter(r => r.id !== run.id)].slice(0, 100)
    localStorage.setItem(STORAGE_KEY_RUNS, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

export function deleteStoredStudioRun(id) {
  try {
    const runs = getStoredStudioRuns()
    const updated = runs.filter(r => r.id !== id)
    localStorage.setItem(STORAGE_KEY_RUNS, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

export function toggleFavoriteStudioRun(id) {
  try {
    const runs = getStoredStudioRuns()
    const updated = runs.map(r => r.id === id ? { ...r, favorite: !r.favorite } : r)
    localStorage.setItem(STORAGE_KEY_RUNS, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}
