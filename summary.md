# Yogatik — Session Summary

Changes made this session, grouped by area. All new logic is covered by unit tests unless noted.

## Agents subsystem (all four types, one `runAgent` loop)
- **`agents.js`** — registry `{id,name,role,system,tools[],model?,provider?,canDelegate,subAgents[]}` with presets (General, Researcher, Coder, Writer, Analyst, Planner). Merged at read-time like Skills; active-agent per chat; `getAgentById(id|role|name)`, `agentDisabledTools` (allowlist), export/import.
- **Named preset agents** — pick a specialist per chat in the Agents panel; its role + tool scope apply to every message (parallel to Skills in `agent.js`).
- **Sub-agent delegation** — `tools/spawnAgents.js` `spawn_agents` tool: hands sub-tasks to specialists in capped parallel (3), each tool-scoped and blocked from re-delegating. Rendered as a result card. A failed sub-agent returns its error text instead of failing the batch.
- **Autonomous agent** — `autonomousAgent.js`: goal → plan → execute each step with prior context → synthesize. Pure core (`runAutonomousAgent`) is unit-tested; `parsePlan` handles numbered/bulleted, caps 12 steps.
- **Automatic delegation** — system prompt now instructs any model to call `spawn_agents` on its own for multi-part tasks (no user action needed), while answering single-step questions directly.
- **UI** — `components/AgentsPanel.jsx` (activate/CRUD/import-export + Autonomous goal runner with live plan/step status), sidebar entry + Ctrl+K.
- **Proactive assist** — `features.proactiveAgent` (off by default): quick-action row above the composer (Summarize / Next steps / Find issues / Go deeper).

## Reliability & data
- **Encrypted cloud sync (P0)** — `pushCloudData` / `pullCloudData` / `syncCloudData` in `api.js` + chunked Firestore vault in `firebaseAuth.js`. Reuses the tested `exportAll`/`importAll` merge and the account-derived AES-GCM secret. Opt-in toggle + "Sync now" + last-synced status in settings; best-effort push on tab hide. A wrong account cannot decrypt. Tested.
- **IndexedDB auto-recovery** — a hidden/backgrounded tab that closes IndexedDB no longer throws a bogus "sign-in failed" modal; `getSetting`/`setSetting` reopen-and-retry, and the DB reopens on visibility.
- **Offline outbound queue** — `offlineQueue.js`: messages typed offline are queued and replayed on reconnect (oldest-first, failed ones re-queued, no loop). Tested.

## Live mode
- **Echo-loop fix** — the assistant no longer answers its own voice. Added a 1.5s echo-tail window after speech ends (`cascade.js`) so the delayed final transcript of the synth audio is filtered instead of fed back.

## Tools & output
- **Generated files are downloadable** — `code_execute` now captures files the Python code writes (PDF, images, CSV, DOCX…) into the media store and returns them as real download buttons (`RenderedFiles` in `ToolResultCard`). The model is told to stop citing non-existent server/temp paths.
- **Copy feedback** — the 7 duplicated copy buttons became one reusable `CopyButton` (Copy→Check feedback).

## Answer depth
- Tool/refinement rounds are configurable (`chat_prefs.max_tool_rounds`, default 8, "Answer depth" slider), up from a hard 5. Hitting the cap now forces one final synthesized answer instead of a cut-off/empty reply.

## Accessibility
- `aria-live` status region announces when the assistant is responding / done; message log labelled `role="log"`. (Modals already had full focus-trap + restore.)

## Observability
- `errorLog.js` — on-device ring buffer (last 50) capturing runtime errors + unhandled rejections, plus a `diagnoseError` classifier (auth / quota / retired-model / context / network / WebGPU) and a copyable diagnostics report. No telemetry leaves the device. Tested.

## Security / dependencies
- `react-syntax-highlighter` → ^16.1.1 (the one vuln shipped in the bundle) and `electron-builder` → ^26 pinned in `package.json`.

## CI
- `.github/workflows/ci.yml` — lint + full vitest + production build on every push/PR, plus a (non-blocking) Playwright e2e job.

## Platforms page
- Windows download now points at the auto-published `Yogatik-Setup.exe` (stable `nsis.artifactName`) and auto-starts for Windows visitors; the build-from-source section was replaced with product info + a 3-step install guide.

---

### Deploy / follow-up notes
- Web changes go live only after a deploy (`deploy.bat` / `firebase deploy`); the `.exe` link resolves once the GitHub release build runs with the new artifact name.
- Dependency major upgrades (React 19 / Vite 8 / Vitest 4) and the Playwright e2e run need to be executed on your machine — the sandbox can't complete the npm install or run a real browser.
- Still open from the audit: full i18n, additional direct providers, device-passphrase local key encryption, and an in-app AI "app control" surface (change settings/features on request) — not yet built.
