# Yogatik Browser — Improvement Session Log

**Date:** October 3, 2026
**Scope:** yogatik-browser/ (standalone Electron browser v12.4.0)
**Verification:** node tests/run-tests.cjs → 19 passed, 0 failed

## Security Fixes

1. **browserControl.cjs (~line 274)** — secondary window-mode BrowserWindow ran with sandbox:false; flipped to sandbox:true. The chrome preload only uses contextBridge + ipcRenderer, both sandbox-compatible. A Select-String sweep confirmed every other window already used sandbox:true.
2. **browserWindowPreload.cjs** — __downloadAction validated only the id type and forwarded ANY action string to browser:tab-action, bypassing VALID_ACTIONS entirely; now gated by a strict DOWNLOAD_ACTIONS whitelist (cancel-download, open-download, show-download).

## Reliability Fixes

3. **settings/store.cjs — DEFAULTS pollution** — deepMerge with a shallow spread shared nested objects with module-level DEFAULTS; user changes corrupted factory defaults and reset() could not restore them. All four sites now use structuredClone(DEFAULTS): load merge, load else-branch, load catch-branch, reset.
4. **settings/store.cjs — atomic writes** — plain writeFileSync could truncate settings.json on a crash mid-write; now temp file + renameSync (verified: zero .tmp residue).
5. **main.cjs — off-screen restore** — saved x/y from window-state.json had no display validation; now validated against screen.getAllDisplays() work areas (40px tolerance); invalid coordinates are dropped so the window centers on a visible display.

## Behavior Fix

6. **main.cjs — HTTPS-First method gating** — onBeforeRequest redirected every http method; redirected POSTs can be re-issued as GET by the redirect layer (silently corrupting form submissions/logins). Now upgrades only idempotent GET/HEAD/OPTIONS, mirroring Chrome HTTPS-First Mode.

## Testing

7. **tests/run-tests.cjs + tests/electron-stub.cjs (NEW)** — real suite replacing the echo placeholder test script: node --check on every electron/*.cjs module plus 5 settings-store unit tests (defaults load-through, dot-path persistence, atomic-write residue, DEFAULTS-pollution regression guard, reset-restores-factory) running against an Electron stub injected via Module._resolveFilename.
8. **package.json** — test script now runs node tests/run-tests.cjs.

## Dead Code Removal

9. **browserConfig.cjs + browserConfig.js DELETED** — zero references across all .cjs modules AND .html files (Select-String verified); files tracked in git, fully recoverable.

## Verification Trail

- node --check on all edited modules: ALL_SYNTAX_OK
- Full suite after cleanup: 19 passed / 0 failed
- git status snapshot: 4 modified electron files + package.json + new tests/ directory
- Probe artifacts (.yogatik-write-probe.txt, .yogatik-append-probe.txt) deleted and confirmed gone via Test-Path
