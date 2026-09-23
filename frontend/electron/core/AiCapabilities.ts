/**
 * AiCapabilities — Hardware capability probe for maximum AI utilization
 *
 * What it answers (and why): the AI agent and the local-inference daemons
 * cannot size their work to the machine they run on until somebody measures
 * it. Ollama defaults to CPU inference unless told how many layers fit in
 * VRAM; ComfyUI defaults to conservative resolutions; the renderer's heap was
 * a hardcoded 8GB even on a 4GB machine, which swap-thrashes.
 *
 * This module probes ONCE (cached with a TTL — the numbers do not change
 * mid-session, but a resume-from-sleep can) and exposes:
 *
 *   - GPU adapter name + vendor (app.getGPUInfo)
 *   - WebGPU support (the renderer's AI canvas path)
 *   - CPU cores + model, total/free memory
 *   - SMART DEFAULTS: num_gpu layers + num_thread for Ollama, resolution/steps
 *     ceiling for ComfyUI, heap size for the renderer
 *
 * Every estimate is deliberately CONSERVATIVE and documented: a wrong-guess
 * OOM in a local model is a crash the user experiences, while a
 * lower-than-possible layer count is only a slower token rate.
 */

import { app } from 'electron'
import * as os from 'os'

export interface GpuAdapter {
  vendor: string
  renderer: string
  /** VRAM in bytes where the OS reports it, else null (estimate used instead). */
  vramBytes: number | null
}

export interface AiCapabilities {
  cpu: {
    cores: number
    model: string
    arch: string
  }
  memory: {
    totalBytes: number
    freeBytes: number
  }
  gpu: {
    available: boolean
    adapters: GpuAdapter[]
    /** Best-effort VRAM estimate in bytes across adapters, else null. */
    vramBytesEstimate: number | null
    webgpuSupported: boolean
  }
  /** Inference defaults derived from the hardware above. */
  inference: {
    /** Ollama: how many model layers to offload to GPU. 0 = CPU-only. */
    ollamaNumGpuLayers: number
    /** Ollama: CPU thread count (≈ physical cores, capped). */
    ollamaNumThread: number
    /** ComfyUI: max sensible SDXL-class resolution per side. */
    comfyMaxResolution: number
    /** ComfyUI: max sensible steps for a 512-class checkpoint. */
    comfyMaxSteps: number
    /** Renderer heap: --max-old-space-size in MB, proportional to RAM. */
    rendererHeapMb: number
  }
  probedAt: number
}

interface GpuInfoNode {
  renderer_info?: Array<{ vendor_id?: string; device_id?: string; vendor_string?: string; renderer_string?: string }>
  gpu_devices?: Array<{ vendor_id?: string; device_id?: string; active?: boolean; total_memory_bytes?: number; vendor_string?: string; renderer_string?: string }>
  machine_model?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000

// Known vendor IDs (PCI SIG registry) — adapter strings are the more readable
// path, but some drivers report only the id.
const VENDOR_NAMES: Record<string, string> = {
  '0x10de': 'NVIDIA',
  '0x8086': 'Intel',
  '0x1002': 'AMD',
  '0x1414': 'Microsoft Basic Render',
  '0x15ad': 'VMware',
}

let _cache: AiCapabilities | null = null
let _probing: Promise<AiCapabilities> | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Pure tuning logic (testable without Electron — `inputs` are explicit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive Ollama's num_gpu from an estimated VRAM budget.
 *
 * Conservative model: a 7B-class Q4_K_M model is ~4.5GB; each layer is
 * ~1/32 of the model. The GPU must also hold the KV cache + the OS's own
 * share, so only ~70% of estimated VRAM is usable. 0 layers = CPU-only.
 */
export function tuneOllamaNumGpuLayers(vramBytes: number | null): number {
  if (!vramBytes || vramBytes <= 0) return 0
  const usableBytes = vramBytes * 0.7
  const MODEL_BYTES_FOR_7B_Q4 = 4.5 * 1024 * 1024 * 1024
  const LAYERS = 32
  if (usableBytes < 1.5 * 1024 * 1024 * 1024) return 0 // too small to matter
  const fitLayers = Math.floor((usableBytes / MODEL_BYTES_FOR_7B_Q4) * LAYERS)
  return Math.max(0, Math.min(LAYERS, fitLayers))
}

/**
 * CPU thread count for Ollama: physical cores beat logical (hyperthreading
 * hurts token latency for compute-bound matmuls). os.cpus() cannot separate
 * physical from logical on every platform, so ≈ half the logical count is the
 * safe estimate, clamped to [1, 16].
 */
export function tuneOllamaNumThread(logicalCores: number): number {
  const estimate = Math.max(1, Math.floor(logicalCores / 2))
  return Math.min(16, estimate)
}

/**
 * ComfyUI resolution ceiling: SDXL-class models OOM above ~1536px per side on
 * 8GB; 512-class models OOM above ~768px on 4GB. Steps beyond ~30 add seconds
 * with diminishing returns for a 512-class checkpoint.
 */
export function tuneComfyLimits(vramBytes: number | null): { maxResolution: number; maxSteps: number } {
  if (!vramBytes || vramBytes <= 0) return { maxResolution: 512, maxSteps: 20 }
  const gb = vramBytes / (1024 * 1024 * 1024)
  if (gb >= 16) return { maxResolution: 2048, maxSteps: 40 }
  if (gb >= 8) return { maxResolution: 1536, maxSteps: 35 }
  if (gb >= 4) return { maxResolution: 1024, maxSteps: 30 }
  return { maxResolution: 512, maxSteps: 20 }
}

/**
 * Renderer heap: proportional to physical RAM, capped. A fixed 8192MB heap on
 * a 4GB machine makes the OS swap; on a 32GB machine it starves the model
 * runtimes of headroom. 25% of RAM, clamped to [512, 16384] MB.
 */
export function tuneRendererHeapMb(totalRamBytes: number): number {
  const pct = Math.floor((totalRamBytes * 0.25) / (1024 * 1024))
  return Math.max(512, Math.min(16384, pct))
}

// ─────────────────────────────────────────────────────────────────────────────
// Probe (cached)
// ─────────────────────────────────────────────────────────────────────────────

function vramFromDevices(info: GpuInfoNode): number | null {
  const devices = info.gpu_devices
  if (!Array.isArray(devices) || !devices.length) return null
  const totals = devices
    .map(d => Number(d.total_memory_bytes) || 0)
    .filter(b => b > 0)
  if (!totals.length) return null
  // Sum the active devices' VRAM — a laptop with an iGPU + dGPU reports both.
  return totals.reduce((a, b) => a + b, 0)
}

function adaptersFromInfo(info: GpuInfoNode): GpuAdapter[] {
  const renderers = Array.isArray(info.renderer_info) ? info.renderer_info : []
  const devices = Array.isArray(info.gpu_devices) ? info.gpu_devices : []

  const fromRenderers: GpuAdapter[] = renderers.map(r => {
    const vendorId = (r.vendor_id || '').toLowerCase()
    const vendorString = r.vendor_string || ''
    return {
      vendor: vendorString || VENDOR_NAMES[vendorId] || 'Unknown',
      renderer: r.renderer_string || 'Unknown renderer',
      vramBytes: null,
    }
  })

  // Attach per-device VRAM to the first adapter entry that lacks one.
  let deviceIdx = 0
  for (const adapter of fromRenderers) {
    if (adapter.vramBytes == null && deviceIdx < devices.length) {
      const bytes = Number(devices[deviceIdx].total_memory_bytes) || 0
      adapter.vramBytes = bytes > 0 ? bytes : null
      if (devices[deviceIdx].vendor_string && adapter.vendor === 'Unknown') {
        adapter.vendor = devices[deviceIdx].vendor_string!
      }
      deviceIdx++
    }
  }

  return fromRenderers
}

/**
 * Probe the machine. Cached with a TTL; concurrent calls share one probe.
 * A failed getGPUInfo (rare, but an early-boot driver hiccup happens) returns
 * CPU-only capabilities rather than throwing — the caller must still work.
 */
export async function probeAiCapabilities(force = false): Promise<AiCapabilities> {
  const now = Date.now()
  if (_cache && !force && now - _cache.probedAt < CACHE_TTL_MS) return _cache
  if (_probing) return _probing

  _probing = (async () => {
    let gpuInfo: GpuInfoNode = {}
    let gpuAvailable = false
    try {
      // 'complete' carries renderer_info + gpu_devices; 'basic' does not.
      gpuInfo = (await app.getGPUInfo('complete')) as GpuInfoNode
      gpuAvailable = adaptersFromInfo(gpuInfo).length > 0
    } catch {
      gpuAvailable = false
    }

    const adapters = adaptersFromInfo(gpuInfo)
    const vramEstimate = vramFromDevices(gpuInfo)
    const cpus = os.cpus()

    const caps: AiCapabilities = {
      cpu: {
        cores: cpus?.length || 1,
        model: cpus?.[0]?.model || 'Unknown CPU',
        arch: process.arch,
      },
      memory: {
        totalBytes: os.totalmem(),
        freeBytes: os.freemem(),
      },
      gpu: {
        available: gpuAvailable,
        adapters,
        vramBytesEstimate: vramEstimate,
        // WebGPU is the renderer's AI-canvas path; the feature switch in
        // main enables it, and a working adapter makes it usable.
        webgpuSupported: gpuAvailable,
      },
      inference: {
        ollamaNumGpuLayers: tuneOllamaNumGpuLayers(vramEstimate),
        ollamaNumThread: tuneOllamaNumThread(cpus?.length || 1),
        comfyMaxResolution: tuneComfyLimits(vramEstimate).maxResolution,
        comfyMaxSteps: tuneComfyLimits(vramEstimate).maxSteps,
        rendererHeapMb: tuneRendererHeapMb(os.totalmem()),
      },
      probedAt: now,
    }

    _cache = caps
    return caps
  })()

  try {
    return await _probing
  } finally {
    _probing = null
  }
}

/** Reset the cache (for tests). */
export function resetCache(): void {
  _cache = null
  _probing = null
}