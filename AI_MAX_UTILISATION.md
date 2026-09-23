# AI Max Utilisation — v10.4

**App:** Yogatik (frontend/ — Electron main process + local model runtimes)
**Date:** 2026-09-23

---

## 1. The problem this solves

The app shipped Ollama and ComfyUI daemons and a block of GPU feature
switches, but nothing ever MEASURED the machine:

| Gap | Consequence |
|-----|-------------|
| `--max-old-space-size=8192` unconditional | 8GB heap on a 4GB machine = OS swap thrash; on 32GB = starves model runtimes |
| No `app.getGPUInfo` probe anywhere | The app never knows what GPU (or how much VRAM) it has |
| Ollama never tuned (`num_gpu`/`num_thread`) | Defaults to CPU inference — GPU sits idle during chat |
| ComfyUI defaults conservative | Small renders on a 24GB card; OOM on a 4GB card |
| No capability channel for the agent | The AI cannot size its own work to the hardware |

## 2. What was added

| File | Change |
|------|--------|
| `electron/core/AiCapabilities.ts` *(new)* | Hardware probe: GPU adapter + VRAM (`app.getGPUInfo('complete')`), cores, memory, WebGPU support. Cached with a 5-min TTL; concurrent calls share one probe. Pure tuning functions (testable without Electron). |
| `electron/core/AiCapabilities.test.ts` *(new)* | 14 tests: layer monotonicity + cap, thread clamps, Comfy limits per VRAM tier, heap scaling (asserts the old unconditional 8192 is gone on 4GB). |
| `electron/core/IpcRegistration.ts` | `desktop:getAiCapabilities` channel (cached, 10s timeout). |
| `electron/core/ServiceRegistry.ts` | Boot-time warm probe (first renderer call is instant; Ollama defaults ready before the model is invoked) + structured log of what was found. |
| `electron/core/Application.ts` | Heap SCALED: 25% of RAM clamped [512, 16384] MB, replacing the hardcoded 8192. `ignore-gpu-blocklist` kept but documented as the first switch to drop on rendering corruption. |
| `electron/ollamaDaemon.cjs` | `ollama:status` now returns `inference: { numGpuLayers, numThread, vramBytesEstimate, gpuAvailable }`. Fail-open null across packaging layouts — a missing probe module never breaks the Ollama card. |
| `electron/preload.ts` | `desktop.getAiCapabilities(force?)`; local channel list replaced with the SHARED `IPC_COMMANDS` from `ipcTypes.ts` (a local duplicate could drift out of sync). |
| `electron/ipcTypes.ts` | Channel + payload contract for `desktop:getAiCapabilities`. |

**No new dependencies.** Native `vm`-era: the probe uses Electron's own
`app.getGPUInfo` — no third-party hardware library.

## 3. The tuning model (deliberately conservative)

Every estimate errs toward SAFETY: a wrong-guess OOM in a local model is a
crash the user experiences, while a lower-than-possible layer count is only a
slower token rate.

| Derived default | Rule | Why |
|-----------------|------|-----|
| `ollamaNumGpuLayers` | 70% of est. VRAM ÷ (4.5GB ÷ 32 layers), clamped [0, 32]; 0 if < 1.5GB usable | 7B Q4_K_M ≈ 4.5GB; GPU must also hold KV cache + OS share |
| `ollamaNumThread` | ½ logical cores, clamped [1, 16] | Physical beats logical for compute-bound matmuls (hyperthreading hurts token latency) |
| `comfyMaxResolution` | 512 / 1024 / 1536 / 2048 per VRAM tier (<4 / ≥4 / ≥8 / ≥16 GB) | SDXL OOM ceilings per card class |
| `comfyMaxSteps` | 20 / 30 / 35 / 40 per tier | Steps beyond ~30 add seconds with diminishing returns |
| `rendererHeapMb` | 25% of RAM, clamped [512, 16384] | Fixed 8192 swap-thrashes a 4GB machine and starves a 32GB one |

## 4. How the pieces consume it

1. **Renderer / AI agent:** `window.yogatik.desktop.getAiCapabilities()` —
   the agent can read `inference.*` and pass `num_gpu`/`num_thread` in its
   Ollama API requests, or size canvas work to `gpu.vramBytesEstimate`.
2. **Ollama card:** `ollama:status` carries `inference` in the SAME response —
   no second round trip.
3. **Main process:** the boot-time probe result is logged on startup
   (`[main] AI capabilities probed { gpuAvailable, vramEstimateGb, ... }`), so
   a support ticket can be triaged from the log alone.
4. **Renderer heap:** set once at boot from `tuneRendererHeapMb`.

## 5. Testing

- 14 new unit tests (pure tuning logic, no Electron needed) — all pass
  alongside the 7 IpcRouter tests: **21 total** under
  `npx vitest run --config vitest.electron.config.js`.
- `tsc -p tsconfig.electron.json --noEmit` clean.
- Recommended UAT: on a machine with a dGPU, confirm the startup log reports
  `gpuAvailable: true` and a plausible VRAM estimate; confirm an Ollama chat
  offloads to GPU (ollama ps shows "100% GPU"); confirm a 4GB machine boots
  without swap pressure.

## 6. Trade-offs

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| 5-min TTL cache | A resume-from-sleep may see stale free-memory | GPU/cores never change mid-session; freeBytes is the only volatile field and is not used for sizing decisions |
| Conservative estimates | Slower-than-possible inference on big cards | OOM crash >> slow token rate |
| Fail-open in ollamaDaemon | Defaults may be null in some packaging layouts | Broken card >> missing tuning hint |
| Shared IPC channel list | ipcTypes.ts is a new leaf module | Preload/main drift caused "not allowed" errors that had nothing to do with the channel |
| Half-logical-cores estimate | Underuses SMT on some CPUs | os.cpus() cannot separate physical from logical on every platform; over-subscription hurts more |
