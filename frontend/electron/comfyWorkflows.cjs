// comfyWorkflows.cjs — builds ComfyUI /prompt API-format node graphs.
//
// PURE. No require('electron'), no fs, no network — same split as rootsCore.cjs
// and entitlementCore.cjs, and for the same reason: vitest cannot load a module
// that reaches for electron, so the graph-building logic (the part with actual
// branches worth pinning) lives here where a test can reach it directly.
//
// ── WHAT THESE COVER, AND WHAT THEY DO NOT ─────────────────────────────────
// Two graphs only, both using nodes that ship in ComfyUI CORE (no custom-node
// install required):
//   txt2img  — CheckpointLoaderSimple → CLIPTextEncode(x2) → EmptyLatentImage
//              → KSampler → VAEDecode → SaveImage
//   img2vid  — ImageOnlyCheckpointLoader → SVD_img2vid_Conditioning → KSampler
//              → VAEDecode → SaveAnimatedWEBP
// img2vid needs an SVD checkpoint (e.g. svd_xt.safetensors) already placed in
// ComfyUI's checkpoints folder, and animates a STILL IMAGE — it is not
// text-to-video. It also outputs an animated WEBP, not MP4: MP4 muxing in
// ComfyUI needs the VideoHelperSuite custom node, which is not assumed to be
// installed. Overstating either would be the same mistake video_render's own
// docstring warns against — say what the tool cannot do, not just what it can.

const DEFAULTS = {
  txt2img: {
    width: 1024, height: 1024, steps: 20, cfg: 7, sampler: 'euler', scheduler: 'normal',
    denoise: 1,
  },
  img2vid: {
    width: 1024, height: 576, videoFrames: 25, motionBucketId: 127, fps: 6, augLevel: 0,
    steps: 20, cfg: 2.5, sampler: 'euler', scheduler: 'karras', minCfg: 1,
  },
}

function randomSeed() {
  // ComfyUI seeds are unsigned 64-bit in principle; Number stays exact up to
  // 2^53, which is more entropy than any sampler actually uses.
  return Math.floor(Math.random() * 4294967295)
}

/**
 * Build a txt2img API-format graph. Returns { graph, outputNodeId } — the
 * caller polls /history for outputNodeId's `images[]`.
 */
function buildTxt2ImgGraph(opts = {}) {
  const o = { ...DEFAULTS.txt2img, ...opts }
  if (!o.checkpoint) throw new Error('checkpoint is required (see comfy:status for the installed list)')
  if (!o.prompt || !String(o.prompt).trim()) throw new Error('prompt is required')

  const width = Math.max(64, Math.min(2048, Math.round(Number(o.width) || DEFAULTS.txt2img.width)))
  const height = Math.max(64, Math.min(2048, Math.round(Number(o.height) || DEFAULTS.txt2img.height)))
  const steps = Math.max(1, Math.min(150, Math.round(Number(o.steps) || DEFAULTS.txt2img.steps)))
  const cfg = Math.max(0, Math.min(30, Number(o.cfg) || DEFAULTS.txt2img.cfg))
  const seed = Number.isFinite(o.seed) ? Math.max(0, Math.round(o.seed)) : randomSeed()

  const graph = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: o.checkpoint } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: String(o.prompt), clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: String(o.negative || ''), clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed, steps, cfg,
        sampler_name: o.sampler || DEFAULTS.txt2img.sampler,
        scheduler: o.scheduler || DEFAULTS.txt2img.scheduler,
        denoise: o.denoise ?? DEFAULTS.txt2img.denoise,
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'yogatik' },
    },
  }

  return { graph, outputNodeId: '7', seed, width, height }
}

/**
 * Build an img2vid (Stable Video Diffusion) API-format graph. `imageName` is a
 * filename ComfyUI already has (uploaded via POST /upload/image first — the
 * caller's job, not this pure builder's).
 */
function buildImg2VidGraph(opts = {}) {
  const o = { ...DEFAULTS.img2vid, ...opts }
  if (!o.checkpoint) throw new Error('checkpoint is required (an SVD checkpoint, e.g. svd_xt.safetensors)')
  if (!o.imageName) throw new Error('imageName is required — upload the source image to ComfyUI first')

  const width = Math.max(64, Math.min(1280, Math.round(Number(o.width) || DEFAULTS.img2vid.width)))
  const height = Math.max(64, Math.min(1280, Math.round(Number(o.height) || DEFAULTS.img2vid.height)))
  const videoFrames = Math.max(2, Math.min(120, Math.round(Number(o.videoFrames) || DEFAULTS.img2vid.videoFrames)))
  const fps = Math.max(1, Math.min(30, Math.round(Number(o.fps) || DEFAULTS.img2vid.fps)))
  const motionBucketId = Math.max(1, Math.min(255, Math.round(Number(o.motionBucketId) || DEFAULTS.img2vid.motionBucketId)))
  const seed = Number.isFinite(o.seed) ? Math.max(0, Math.round(o.seed)) : randomSeed()

  const graph = {
    '1': { class_type: 'ImageOnlyCheckpointLoader', inputs: { ckpt_name: o.checkpoint } },
    '2': { class_type: 'LoadImage', inputs: { image: o.imageName } },
    '3': {
      class_type: 'SVD_img2vid_Conditioning',
      inputs: {
        width, height, video_frames: videoFrames, motion_bucket_id: motionBucketId,
        fps, augmentation_level: o.augLevel ?? DEFAULTS.img2vid.augLevel,
        clip_vision: ['1', 1], init_image: ['2', 0], vae: ['1', 2],
      },
    },
    '4': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: Math.max(1, Math.min(100, Math.round(Number(o.steps) || DEFAULTS.img2vid.steps))),
        cfg: Math.max(0, Math.min(15, Number(o.cfg) || DEFAULTS.img2vid.cfg)),
        sampler_name: o.sampler || DEFAULTS.img2vid.sampler,
        scheduler: o.scheduler || DEFAULTS.img2vid.scheduler,
        denoise: 1,
        model: ['1', 0], positive: ['3', 0], negative: ['3', 1], latent_image: ['3', 2],
      },
    },
    '5': { class_type: 'VAEDecode', inputs: { samples: ['4', 0], vae: ['1', 2] } },
    '6': {
      class_type: 'SaveAnimatedWEBP',
      inputs: { images: ['5', 0], filename_prefix: 'yogatik', fps, lossless: false, quality: 90, method: 'default' },
    },
  }

  return { graph, outputNodeId: '6', seed, width, height, fps, videoFrames }
}

/**
 * Pull the checkpoint / sampler / scheduler enums out of a raw GET /object_info
 * response. ComfyUI nests them as input.required.<field>[0] (an array whose
 * first element IS the enum list) — easy to misread as a value rather than a
 * list, which is why this is a named, tested function rather than inlined at
 * each call site.
 */
function parseObjectInfo(objectInfo) {
  const enumAt = (nodeClass, field) => {
    try {
      const arr = objectInfo?.[nodeClass]?.input?.required?.[field]?.[0]
      return Array.isArray(arr) ? arr : []
    } catch { return [] }
  }
  return {
    checkpoints: enumAt('CheckpointLoaderSimple', 'ckpt_name'),
    // SVD checkpoints are loaded through a DIFFERENT node with its own list —
    // conflating the two would offer an SD checkpoint where an SVD one is
    // required, and img2vid would fail opaquely mid-run instead of up front.
    svdCheckpoints: enumAt('ImageOnlyCheckpointLoader', 'ckpt_name'),
    samplers: enumAt('KSampler', 'sampler_name'),
    schedulers: enumAt('KSampler', 'scheduler'),
  }
}

module.exports = {
  DEFAULTS, buildTxt2ImgGraph, buildImg2VidGraph, parseObjectInfo, randomSeed,
}
