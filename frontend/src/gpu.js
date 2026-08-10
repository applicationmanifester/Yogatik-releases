/**
 * WebGPU availability, established by asking for an adapter rather than by
 * checking that `navigator.gpu` exists.
 *
 * The presence of the object proves the API is compiled in, not that a device
 * can be obtained: headless Chrome, blocklisted drivers, Linux without Vulkan
 * and remote desktops all expose `navigator.gpu` and then refuse the adapter.
 * Trusting the property picked a GPU dtype that the runtime could not honour,
 * and the model load failed outright instead of quietly running on wasm.
 */

let cached = null

export async function webgpuDevice() {
  if (cached !== null) return cached
  cached = 'wasm'
  try {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter) cached = 'webgpu'
    }
  } catch { /* no adapter: wasm it is */ }
  return cached
}

/** Forget the probe — only useful in tests. */
export function resetGpuProbe() { cached = null }
