# Yogatik Internal Technical Debt Register

_Last reviewed: 2 Oct 2026._

## Critical (P0) - Address in next 2 sprints
1. ~~**LiveHudOverlay removal residue**~~ **RESOLVED / STALE.** `LiveView.jsx` no longer imports or renders `LiveHudOverlay`; the component was retired to a stub (see `CLAUDE.md` line 229). A workspace-wide search confirms the only surviving references are explanatory comments in `buildGuards.test.js`. No re-render or leak path remains — safe to strike.
2. **ChromeAI tool visibility bug fix verification** - While fix is in place (agent.js, chromeAI.js), need to add automated test that verifies tool descriptions appear in messages[0] for prompted mode from start.
3. ~~**Object detection overlay performance**~~ **DONE (2 Oct 2026).** DETR/CLIP no longer receive the full-resolution live frame. `vision/detect.js` now downscales every image to a <=320px long edge (`INFERENCE_MAX_EDGE`, `fitInferenceDimensions`, `downscaleForInference`) before inference; boxes are percentage-based so positions still map to the full frame, and the helper is fail-safe (anything it cannot decode passes through untouched). Covered by 13 new assertions in `vision/detect.test.js`.

## High (P1) - Address in next 3 sprints
1. **Reflex Prefetch whitelist expansion** - Current whitelist is too conservative; add unit conversion, currency conversion, and basic factual queries (e.g., "height of Eiffel Tower").
2. **Browser download security** - The new wait_for_download tool saves files to disk; add virus scanning and file type validation before allowing fs_read access.
3. **Live voice engine switch latency** - Switching between Neural/System engines causes audible glitch; implement crossfade or buffer to prevent audio artifacts.

## Medium (P2) - Address in next 4 sprints
1. **Agent canary leak detection eviction policy** - The ACTIVE_CANARIES Map eviction is LRU but not size-aware; consider implementing size-based eviction for long sessions.
2. **Temporal buffer lifecycle (CORRECTED)** - The original note ("grows indefinitely") is inaccurate: `pushFrame` in `vision/temporalBuffer.js` is a bounded FIFO capped at `maxFrames` (default 6), so memory does not grow without limit. The REAL gap is lifecycle — the module-level `temporalVideoBuffer` singleton is never `clear()`ed when a Live session ends, so up to 6 stale base64 frames linger between sessions. Fix = call `temporalVideoBuffer.clear()` on Live teardown in `LiveView.jsx`.
3. **Electron build script duplication** - build-electron.bat and build-studio.bat share 90% identical code; extract common functions to a shared script.

## Low (P3) - Address as time permits
1. **CSS class deduplication** - Multiple files define similar LS-select and style-select classes; consolidate into shared CSS module.
2. **Commented-out code in vision/detect.js** - Remove obsolete DETR confidence threshold experiments.
3. **Logging inconsistency** - Mix of console.log and logError; standardize on structured logging with levels.
