// comfyWorkflows.cjs is pure (no require('electron')), so it is required
// directly the same way entitlement.test.js reaches entitlementCore.cjs —
// createRequire is what lets a vitest ESM test load a CommonJS module.
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require_ = createRequire(import.meta.url)
const wf = require_('../../electron/comfyWorkflows.cjs')

describe('buildTxt2ImgGraph', () => {
  it('requires a checkpoint and a prompt', () => {
    expect(() => wf.buildTxt2ImgGraph({ prompt: 'a cat' })).toThrow(/checkpoint/)
    expect(() => wf.buildTxt2ImgGraph({ checkpoint: 'sdxl.safetensors' })).toThrow(/prompt/)
  })

  it('wires the core node graph: checkpoint → clip x2 → latent → sampler → decode → save', () => {
    const { graph, outputNodeId } = wf.buildTxt2ImgGraph({
      checkpoint: 'sdxl.safetensors', prompt: 'a fox', negative: 'blurry',
    })
    expect(graph['1'].class_type).toBe('CheckpointLoaderSimple')
    expect(graph['1'].inputs.ckpt_name).toBe('sdxl.safetensors')
    expect(graph['2'].inputs.text).toBe('a fox')
    expect(graph['3'].inputs.text).toBe('blurry')
    // KSampler must reference the positive/negative encodes and the checkpoint's
    // own model/vae outputs, not swap them — a swapped positive/negative link
    // would compile fine and produce a wrong, hard-to-diagnose image.
    expect(graph['5'].inputs.positive).toEqual(['2', 0])
    expect(graph['5'].inputs.negative).toEqual(['3', 0])
    expect(graph['5'].inputs.model).toEqual(['1', 0])
    expect(graph['6'].inputs.vae).toEqual(['1', 2])
    expect(outputNodeId).toBe('7')
    expect(graph['7'].class_type).toBe('SaveImage')
  })

  it('clamps width/height/steps/cfg to sane ranges instead of passing garbage to ComfyUI', () => {
    const { graph, width, height } = wf.buildTxt2ImgGraph({
      checkpoint: 'x', prompt: 'y', width: 999999, height: -5, steps: 0, cfg: -1,
    })
    expect(width).toBeLessThanOrEqual(2048)
    expect(height).toBeGreaterThanOrEqual(64)
    expect(graph['5'].inputs.steps).toBeGreaterThanOrEqual(1)
    expect(graph['5'].inputs.cfg).toBeGreaterThanOrEqual(0)
  })

  it('uses an explicit seed when given, and a random one otherwise', () => {
    const explicit = wf.buildTxt2ImgGraph({ checkpoint: 'x', prompt: 'y', seed: 42 })
    expect(explicit.seed).toBe(42)
    const random = wf.buildTxt2ImgGraph({ checkpoint: 'x', prompt: 'y' })
    expect(typeof random.seed).toBe('number')
  })
})

describe('buildImg2VidGraph', () => {
  it('requires a checkpoint and an uploaded image name', () => {
    expect(() => wf.buildImg2VidGraph({ imageName: 'a.png' })).toThrow(/checkpoint/)
    expect(() => wf.buildImg2VidGraph({ checkpoint: 'svd_xt.safetensors' })).toThrow(/imageName/)
  })

  it('wires ImageOnlyCheckpointLoader → conditioning → sampler → decode → animated webp', () => {
    const { graph, outputNodeId } = wf.buildImg2VidGraph({
      checkpoint: 'svd_xt.safetensors', imageName: 'src.png',
    })
    expect(graph['1'].class_type).toBe('ImageOnlyCheckpointLoader')
    expect(graph['2'].class_type).toBe('LoadImage')
    expect(graph['2'].inputs.image).toBe('src.png')
    expect(graph['3'].class_type).toBe('SVD_img2vid_Conditioning')
    // The conditioning node's own positive/negative/latent outputs feed the
    // sampler — SVD's conditioning node is the split point, not CLIPTextEncode.
    expect(graph['4'].inputs.positive).toEqual(['3', 0])
    expect(graph['4'].inputs.negative).toEqual(['3', 1])
    expect(graph['4'].inputs.latent_image).toEqual(['3', 2])
    expect(outputNodeId).toBe('6')
    expect(graph['6'].class_type).toBe('SaveAnimatedWEBP')
  })

  it('clamps frame count, fps and motion bucket id', () => {
    const { graph } = wf.buildImg2VidGraph({
      checkpoint: 'x', imageName: 'a.png', videoFrames: 9999, fps: 0, motionBucketId: 9999,
    })
    expect(graph['3'].inputs.video_frames).toBeLessThanOrEqual(120)
    expect(graph['3'].inputs.fps).toBeGreaterThanOrEqual(1)
    expect(graph['3'].inputs.motion_bucket_id).toBeLessThanOrEqual(255)
  })
})

describe('parseObjectInfo', () => {
  it('reads each enum from its OWN node — CheckpointLoaderSimple and ImageOnlyCheckpointLoader must not be conflated', () => {
    const objectInfo = {
      CheckpointLoaderSimple: { input: { required: { ckpt_name: [['sd15.safetensors', 'sdxl.safetensors']] } } },
      ImageOnlyCheckpointLoader: { input: { required: { ckpt_name: [['svd_xt.safetensors']] } } },
      KSampler: { input: { required: { sampler_name: [['euler', 'dpmpp_2m']], scheduler: [['normal', 'karras']] } } },
    }
    const parsed = wf.parseObjectInfo(objectInfo)
    expect(parsed.checkpoints).toEqual(['sd15.safetensors', 'sdxl.safetensors'])
    expect(parsed.svdCheckpoints).toEqual(['svd_xt.safetensors'])
    expect(parsed.samplers).toEqual(['euler', 'dpmpp_2m'])
    expect(parsed.schedulers).toEqual(['normal', 'karras'])
  })

  it('never throws on missing or malformed object_info — a probe failure must not crash status', () => {
    for (const bad of [null, undefined, {}, { CheckpointLoaderSimple: {} }, 'not an object', 42]) {
      expect(() => wf.parseObjectInfo(bad)).not.toThrow()
      const r = wf.parseObjectInfo(bad)
      expect(r.checkpoints).toEqual([])
      expect(r.svdCheckpoints).toEqual([])
    }
  })
})
