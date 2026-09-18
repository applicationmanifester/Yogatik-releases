# Yogatik Internal Technical Debt Register

## Critical (P0) - Address in next 2 sprints
1. **LiveHudOverlay removal residue** - components/LiveView.jsx still imports and renders LiveHudOverlay in some code paths (see CLAUDE.md line 229). This causes unnecessary re-renders and potential memory leaks.
2. **ChromeAI tool visibility bug fix verification** - While fix is in place (agent.js, chromeAI.js), need to add automated test that verifies tool descriptions appear in messages[0] for prompted mode from start.
3. **Object detection overlay performance** - The Live object-detection overlay (components/LiveView.jsx) runs DETR on every frame; consider downscaling to 320px max edge to reduce GPU load.

## High (P1) - Address in next 3 sprints
1. **Reflex Prefetch whitelist expansion** - Current whitelist is too conservative; add unit conversion, currency conversion, and basic factual queries (e.g., "height of Eiffel Tower").
2. **Browser download security** - The new wait_for_download tool saves files to disk; add virus scanning and file type validation before allowing fs_read access.
3. **Live voice engine switch latency** - Switching between Neural/System engines causes audible glitch; implement crossfade or buffer to prevent audio artifacts.

## Medium (P2) - Address in next 4 sprints
1. **Agent canary leak detection eviction policy** - The ACTIVE_CANARIES Map eviction is LRU but not size-aware; consider implementing size-based eviction for long sessions.
2. **Temporal buffer memory growth** - The temporalVideoBuffer in live/video.js grows indefinitely; add maximum frame limit based on session duration.
3. **Electron build script duplication** - build-electron.bat and build-studio.bat share 90% identical code; extract common functions to a shared script.

## Low (P3) - Address as time permits
1. **CSS class deduplication** - Multiple files define similar LS-select and style-select classes; consolidate into shared CSS module.
2. **Commented-out code in vision/detect.js** - Remove obsolete DETR confidence threshold experiments.
3. **Logging inconsistency** - Mix of console.log and logError; standardize on structured logging with levels.