# Yogatik — Project Knowledge

## Architecture (v3 — Serverless + edge proxy)
- **Frontend-only**: React 18 + Vite (PWA, mobile-first, zero backend)
- **DB**: IndexedDB via Dexie (conversations, settings, API keys — all in browser)
- **LLM**: Direct API calls to Groq/OpenRouter/OpenAI from browser
- **Agent**: OpenAI function-calling loop — LLM decides tools → browser executes → results → final answer
- **Tools**: 65 browser-native tools (Pyodide, Tesseract.js, Mermaid, Web Speech API, Canvas, etc.)
- **PWA**: Service worker, manifest, installable on mobile + desktop
- **Proxy**: Cloudflare Worker (cors-proxy/) for non-CORS providers (NVIDIA only). Vite plugin serves /api/llm-proxy in dev. Client picks via VITE_LLM_PROXY_BASE.
- **Auth**: Firebase (lazy-loaded; NOT loaded at startup unless a session/redirect exists). API keys sync to Firestore AES-GCM encrypted under an ACCOUNT-derived secret (crypto.js) — sign in on any device and the keys are there. No passphrase anywhere.
- **Deploy**: Firebase Hosting. `deploy-proxy.bat` (worker) then `deploy.bat` (build + hosting + rules)
- **Desktop (v3.8)**: Tauri v2 shell (`frontend/src-tauri/`). Wraps same Vite build. `build-desktop.bat` → `npm run desktop:build` → .exe/.msi in src-tauri/target/release/bundle/. Prereqs: Node, Rust, MSVC Build Tools, WebView2.

## Desktop Superpowers batch (v3.13) — web-impossible capabilities
Each capability = one electron/*.cjs main module (registers scoped IPC) + a window.__YOGATIK_*__
bridge in preload.cjs + a renderer tool in src/tools/ (registered in tools/index.js, gates on its
OWN bridge, honest "desktop only" fallback in the web build). Wired in main.cjs whenReady; cleaned up
in will-quit. Tests: tools/desktopCapabilities.test.js (15). All built-in Electron APIs — no native
deps — EXCEPT PTY.
- keychain.cjs (safeStorage / Windows DPAPI): OS-encrypted key vault. db.js getSetting/setSetting is
  the SINGLE choke point — apikey_* values are transparently sealed (`kc.v1:` prefix) at rest via
  src/desktopKeychain.js (sealKey/openKey, lazy-imported so web/tests pass through unchanged). Backward
  compatible: legacy plaintext + cloud-synced keys open untouched; a sealed value with no vault returns
  null (re-prompt, never leaks ciphertext); if safeStorage is unavailable it stores plaintext (=today).
  getAllSettings stays raw (only reads status_*, never apikey_). Backup already excludes apikey_.
- clipboardManager.cjs: clipboard read (text+image) + 50-entry rolling history (800ms poller captures
  copies from OTHER apps; there's no OS change-event) + write. Global hotkey Ctrl+Alt+C copies the
  foreground selection (SendKeys ^c on Windows) → relays 'clipboard-selection-hotkey' to renderer.
  Tool: clipboard_access. Events: 'clipboard-changed'.
- watcher.cjs: fs.watch SCOPED to the granted root (reuses fsBridge path guards: abs/.. rejected +
  realpath re-check), 300ms debounce, emits 'fs-changed' {id,type,path-relative-to-root}. Tool:
  watch_folder (start/stop/list/stop_all).
- power.cjs: powerMonitor suspend/resume/lock/ac/battery + getSystemIdleTime(). Suspend pauses the cron
  scheduler (stopScheduler), resume restarts it — wired via registerPower hooks in main. Tool: system_state.
- dialogs.cjs: native open/openMulti/save/pickFolder + read-picked (2MB cap) → REAL OS paths (browser
  <input type=file> gives opaque blobs). Lets the user hand a file OUTSIDE the grant for one-shot read.
  Tool: file_dialog.
- processes.cjs: tasklist/ps parse + guarded kill (PROTECTED_PIDS = self/0/4). Tool: process_manager —
  kill REFUSES without confirm:true (double guard: tool + main).
- notify.cjs (enhanced): { actions[], hasReply } → button/inline-reply notifications, emits
  'notification-action' {id,action,reply}. __YOGATIK_NOTIFY__ now takes (title,body) OR an options object.
- pty.cjs: interactive streaming shell (node-pty). NATIVE dep, lazy require in try/catch — NOT in
  package.json, so absent by default → pty:available=false and app falls back to one-shot terminal:exec.
  Enable: `npm i node-pty && npx electron-rebuild -f -w node-pty`. Bridge __YOGATIK_PTY__ only (no agent
  tool — streaming interactive doesn't fit one function-call return; it's for a future terminal panel).
- preload.cjs also exposes __YOGATIK_DND__.getPathForFile (webUtils) → real path for a dropped File.
- RE-AUDITED 2026-08-23: the "still unwired" list is obsolete — clipboard hotkey, watcher onChange,
  DND getPathForFile, notify actions and the menu are all consumed in App.jsx now. What was actually
  broken was one layer down, and silently:
  - pty.cjs and watcher.cjs both `require('./fsBridge.cjs').getGrantedRoot`, which fsBridge does NOT
    export. Every pty:spawn and watcher:start threw "getGrantedRoot is not a function", so the PTY and
    watch_folder had never worked. Both use rootPathsFor(ctx) from roots.cjs now, and pty refuses
    rather than falling back to process.cwd() (the app's own install dir).
  - TerminalPanel showed "PTY LIVE" whenever the bridge OBJECT existed (not when node-pty was
    installed), called a non-existent start(), and used write(text) against a write(id, data)
    signature — a shell that looked live and swallowed every keystroke. It spawns, keeps the session
    id, filters pty:data by id and kills on close.
  - A cross-check of every window.__YOGATIK_*__ call against preload and every preload channel against
    ipcMain.handle is worth re-running after any bridge change; it is what found these.

## Desktop app — Electron (v3.8, Node-only path)
- Modular main process: electron/main.cjs (thin orchestrator) + rootsCore.cjs/roots.cjs (PER-CHAT
  working folders — see below) + fsBridge.cjs (fs_* file OPS only; every handler takes
  ctx={conversationId,projectId} and delegates containment to roots) + cors.cjs (enableProviderCors)
  + menu.cjs (native menu/shortcuts) + windowState.cjs (remember size/pos/maximized in userData).
- Per-chat working folders (v3.9): rootsCore.cjs is PURE (imports no electron, so vitest reaches it
  under jsdom) — rootIdFor, resolveRootIds, resolveWithin, and the state transforms. roots.cjs adds
  JSON persistence (userData/workspace_roots.json), the native picker and the roots_* IPC. One
  registry of user-granted dirs + bindings chat:<id> → project:<id> → default; a chat may hold
  SEVERAL folders (Claude Code's /add-dir model). Mutations materialise the inherited list into an
  explicit chat binding first, so editing one chat never rewrites a project/global default.
  roots.test.js = 29 tests.
- Native menu (menu.cjs): File→New Chat (Ctrl+N), Settings (Ctrl+,), Grant Working Folder (Ctrl+O)
  send a 'menu' IPC action; View has reload/devtools/zoom/fullscreen roles; Help has web/Ollama links +
  About. preload exposes __YOGATIK_MENU__.on(cb) to relay the action, and App.jsx SUBSCRIBES to it
  (the File-menu items work). This was inert for a long time and the note here said so — verify with
  `grep -rn __YOGATIK_MENU__ frontend/src` before trusting either claim. Wiring them up is open work. Single-instance lock focuses the open window.
- frontend/electron/preload.cjs: contextBridge exposes window.__TAURI__.core.invoke → ipcRenderer, so
  tools/localFs.js + the folder chip work UNCHANGED under Electron (no frontend branching). Also sets
  window.__YOGATIK_ELECTRON__ and window.__YOGATIK_MENU__.
- CI (.github/workflows/electron-release.yml) passes optional VITE_LLM_PROXY_BASE/VITE_AUTH_DOMAIN/
  VITE_FIREBASE_API_KEY from repo secrets — but the .exe already works without them (desktop calls
  providers directly; Firebase apiKey has a hardcoded fallback + web keys aren't secret).
- Native extras: tray.cjs (tray icon: Open/New Chat/Quit; close hides to tray, app.isQuitting gates real
  quit), notify.cjs (ipcMain 'notify' → OS Notification; preload __YOGATIK_NOTIFY__(title,body); App fires
  it when a reply finishes while document.hidden; needs app.setAppUserModelId on Windows), updater.cjs
  (electron-updater checkForUpdatesAndNotify + manual checkForUpdates() with dialogs, fully guarded/no-op
  if unconfigured), globalShortcut Ctrl/Cmd+Shift+Y show/hide. package.json build.publish=[{github}]; CI
  uploads *.exe + *.blockmap + latest.yml so auto-update works. electron-updater is a devDep; try/caught.
- menu.cjs File menu: New Chat/Settings/Grant+Open Working Folder (shell.openPath getGrantedRoot)/Launch
  at Login (app.setLoginItemSettings checkbox); Help: Check for Updates… (onCheckUpdates callback). buildMenu
  takes {getRoot,onCheckUpdates}.

## Open utility tools (v3.8) — tools/moretools.js (7, keyless)
- Pure-client (never fail): uuid (v4), password_generate (password/passphrase + entropy), number_base
  (2–36, auto 0x/0b/0o), cron_next (5-field cron → next N run times), timezone (IANA convert / world clock
  via Intl offset trick). Network (keyless CORS via proxyJson): thesaurus (Datamuse rel_syn/ant/rhy/ml/sl),
  country_info (REST Countries v3.1). Registered in tools/index.js. moretools.test.js = 8 tests.
- Build is Node-only: `npm run electron:build` (= build:electron with --base=./ --outDir dist-electron,
  then electron-builder --win nsis → release-electron/*.exe). Relative base is REQUIRED: file:// breaks
  absolute /assets paths. electron-builder config in package.json "build" (appId, files, win nsis icon
  src-tauri/icons/icon.ico, runAfterFinish). build-electron.bat at repo root.
- CI: .github/workflows/electron-release.yml (windows-latest, no Rust) publishes the .exe to a Release.
- Both shells coexist; Electron is the easy path, Tauri the small one. desktop.test.js covers the shared
  bridge (window.__TAURI__ mock) so both are exercised.

## Desktop LLM networking (v3.8) — no CORS proxy on desktop
- NVIDIA (needsProxy) sends no CORS headers, so the web app routes it through the Cloudflare worker
  (VITE_LLM_PROXY_BASE, in .env which is GITIGNORED → a CI/shared .exe had no proxy URL → NVIDIA dead).
- Fix = native-desktop model: Electron main injects permissive CORS for provider hosts
  (enableProviderCors: onHeadersReceived ACAO* + force 200 on OPTIONS preflight; onBeforeSendHeaders
  sets localhost Origin for :11434/:1234). llm.js isElectron (window.__YOGATIK_ELECTRON__) → smartFetch
  skips the worker and fetches providers DIRECTLY. Desktop no longer needs the worker or a baked .env.
- Desktop defaults to Ollama, hides the WebLLM `local` provider: App provider initial state = ollama
  when isDesktop(); zero-key boot activates ollama (no 750MB WebLLM DL); getModels() skips isLocal on
  desktop; remove-provider fallback → ollama on desktop. Ollama available only when daemon answered.
- Ollama CORS from file:// origin is handled by the same enableProviderCors shim.

## Desktop app (Tauri v2 — v3.8)
- src-tauri/lib.rs: scoped local-FS commands (fs_grant/list/read/write/edit/search). ONE granted
  root — TAURI SHELL ONLY; the Electron shell is per-chat (see above). Native folder picker via
  tauri-plugin-dialog, every path resolved against it; `..`/absolute/symlink-escape rejected
  (resolve()). Browser build has no bridge → tools return "desktop only".
  The renderer's addRoot()/listRoots() call roots_* first and FALL BACK to fs_grant/fs_granted_root:
  Tauri rejects unknown commands, so calling roots_* unconditionally left folder-granting dead there.
- tauri.conf.json: withGlobalTauri:true (exposes window.__TAURI__.core.invoke, so NO npm @tauri dep in
  web bundle), csp:null (app calls many external APIs), targets nsis+msi, icons in src-tauri/icons/.
- capabilities/default.json grants core+dialog+shell. Icons generated from public/icon-1024.png
  (or `npm run desktop:icon`).
- Web side: tools/localFs.js (isDesktop() + fs_* tools, registered in tools/index.js). App welcome
  shows "Desktop app" link → /platforms when !isDesktop().
- Grant PERSISTS across restarts: Tauri writes the root to app_config_dir/granted_folder.txt;
  Electron persists the registry + bindings to userData/workspace_roots.json and MIGRATES an existing
  granted_folder.txt into the `default` binding on first run, so every pre-existing chat inherits the
  folder it already had. UI: desktop-only header chip (App.jsx, .roots-popover) lists THIS chat's
  folders with add/remove/make-primary and marks inherited ones; helpers addRoot/listRoots/
  removeRoot/setPrimaryRoot/rebindChatRoots in localFs.js. Single-instance plugin focuses the open
  window on a 2nd launch. desktop.test.js = 12 tests.
- Ollama availability is gated on the daemon actually answering: getModels() sets available =
  liveModels.length>0 for isOllama (else "Ready" but every message fails when the daemon is down);
  exposes is_ollama on the payload.
- Ollama provider (llm.js): `ollama`, baseUrl localhost:11434/v1 (VITE_OLLAMA_HOST override), noKey+
  publicModels, models live from /v1/models. Works in browser too if OLLAMA_ORIGINS allows the origin;
  desktop webview has no CORS issue. streamChat/chatComplete now omit Authorization for noKey providers.
- Landing page: public/platforms.html (perplexity-style, OS cards + build steps). firebase.json rewrite
  /platforms → /platforms.html (before SPA catch-all). desktop.test.js (6) covers provider + FS gating.

## File Structure
```
AI ChatBot/
├── frontend/
│   ├── public/
│   │   ├── manifest.json      # PWA manifest
│   │   ├── sw.js              # Service worker
│   │   └── icon-*.svg         # App icons
│   ├── src/
│   │   ├── App.jsx            # Shell only (~630 lines) — chat, voice, PWA
│   │   ├── crypto.js          # AES-GCM key encryption (WebCrypto)
│   │   ├── api.js             # API shim (IndexedDB + agent, no backend)
│   │   ├── db.js              # IndexedDB via Dexie
│   │   ├── llm.js             # Direct LLM API client (streaming + function calling)
│   │   ├── agent.js           # Agentic loop (LLM ↔ tools)
│   │   ├── styles.css         # Theme + mobile responsive + PWA
│   │   ├── main.jsx
│   │   ├── tools/             # 65 browser-native tools
│   │   │   ├── index.js       # Registry + schemas
│   │   │   ├── weather.js     # Open-Meteo (free, CORS)
│   │   │   ├── calculator.js  # Math.* safe eval
│   │   │   ├── imageGen.js    # Pollinations.ai (free)
│   │   │   ├── codeExec.js    # Pyodide (Python WASM)
│   │   │   ├── tts.js         # Web Speech Synthesis
│   │   │   ├── stt.js         # Web Speech Recognition
│   │   │   ├── translate.js   # MyMemory API (free)
│   │   │   ├── chart.js       # Canvas rendering
│   │   │   ├── ocr.js         # Tesseract.js (WASM)
│   │   │   ├── qr.js          # qrcode + jsQR
│   │   │   ├── pdfExtract.js  # pdf.js
│   │   │   ├── diagram.js     # Mermaid.js
│   │   │   ├── mdToPdf.js     # html2pdf.js
│   │   │   ├── webExtract.js  # via tools/http.js proxyFetch
│   │   │   ├── webSearch.js   # Brave / DuckDuckGo
│   │   │   ├── http.js        # shared proxyFetch (never relays credentials publicly)
│   │   │   ├── videoRender.js # WebCodecs MP4 + Kokoro narration (video/)
│   │   │   └── ... (65 total)
│   │   └── components/
│   │       ├── CodeBlock.jsx, ArtifactPanel.jsx, ArenaView.jsx
│   │       ├── ErrorBoundary.jsx, YogatikLogo.jsx
│   │       ├── ToolResultCard.jsx (+ TOOL_ICONS), MessageBubble.jsx
│   │       └── AuthModal.jsx, ProviderModal.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── cors-proxy/            # Cloudflare Worker (wrangler deploy)
└── CLAUDE.md
```

## Agent Pipeline (browser-native)
User message → LLM (function calling) → tools run **in parallel** per round → LLM (with results) → final response
- Tool rounds: chat_prefs.max_tool_rounds (default 8, clamp 1–20, Personalise "Answer depth"
  slider). Cap-hit no longer drops pending calls/ends empty: forces one final "answer now, no
  more tools" pass so the reply is always synthesized. system prompt injects date + research rules
- Sliding window context (20 msgs); sources deduped & surfaced via onSources
- webEnabled=false → prompt tells model web is off (UI toggle: Web Research)

## Retrieval (RAG replacement)
- retrieval.js: BM25 + light stemmer + boundary-aware chunking (1200/200). No embeddings by
  default — no download; beats vectors on small keyword-y corpora, runs in µs.
- OPT-IN semantic re-rank (semantic.js, features.semanticSearch): hybrid BM25→cosine over a
  widened shortlist. Off by default; ~23MB model downloads only on consent.
- Upload → extractText (pdf.js / text) → chunk → Dexie `documents` table
- ≤12k chars: injected inline into the prompt. >12k: doc_search retrieves top-k passages
- Verified 5/5 on a synthetic handbook Q&A set

## LLM Providers (browser-direct)
- **groq**: Free tier, blazing fast — console.groq.com
- **openrouter**: 100+ models, pay-per-token — openrouter.ai
- **openai**: GPT-4o etc — platform.openai.com
- API key stored in IndexedDB (never leaves browser)

## Browser-Native Tools (65 — all free, no backend)
web_search (Brave if apikey_brave set, else DuckDuckGo Lite via proxy), deep_research (search + parallel page reads, 1 call), doc_search/doc_list (BM25 over uploaded files), weather (Open-Meteo), calculator (Math.*), image_generate (Pollinations), code_execute (Pyodide WASM), tts (Web Speech), stt (Web Speech), translate (MyMemory), chart (Canvas), ocr (Tesseract.js), qr_generate/qr_read (qrcode/jsQR), pdf_extract (pdf.js), summarize (extractive), rss_feed (CORS proxy), hash (Web Crypto), regex (native), data_convert (native), color_palette (Canvas), whois (RDAP), diagram (Mermaid), audio_edit (Web Audio), image_info (Canvas), link_preview (CORS proxy), diff (native), unit_convert (native), ip_lookup (ip-api), md_to_pdf (html2pdf), web_extract (CORS proxy), youtube (noembed), video_render (WebCodecs MP4), air_quality (Open-Meteo AQI+pollen), grammar_check (LanguageTool, open source), js_execute (sandboxed Web Worker — JS counterpart to code_execute), memory (durable on-device user memory in IndexedDB), text_to_audio (Kokoro on-device → downloadable WAV narration)

## Run
- Dev: `cd frontend && npm install && npm run dev`
- Test: `cd frontend && npm test` (vitest, 1152 tests)
- Build: `cd frontend && npm run build` (static files in dist/)
- Deploy: Upload `dist/` to Vercel/Netlify/GitHub Pages

## No backend required. No API keys required to start — user enters their own key in settings.

## Finance & quant suite (2026-08-17) — all pure, all on-device
- finance.js: DCF (Gordon terminal value, net debt, per-share), NPV, IRR, CAGR, volatility,
  Sharpe, Sortino, max drawdown, historical VaR, expected shortfall.
- options.js: Black-Scholes-Merton, full Greeks, implied volatility, CRR binomial tree for
  AMERICAN exercise. Validated against the canonical case (S=K=100, r=5%, sigma=20%, T=1):
  call 10.4506, put 5.5735, ATM delta 0.6368, put-call parity to 1e-6.
- portfolio.js: covariance/correlation, Gauss-Jordan inverse, global min-variance, tangency
  (max-Sharpe), risk parity, per-asset risk contributions, efficient frontier, beta.
- indicators.js: SMA/EMA/RSI/MACD/Bollinger/ATR/stochastic. Series are ALIGNED to the input
  with null during warm-up — shifting arrays misaligns an indicator against its own prices.
- backtest.js: signals apply on the NEXT bar. Same-bar execution is lookahead bias and is the
  main reason a backtest looks great and loses money live. A test asserts a final-bar signal
  yields exactly zero return.
- marketData.js + tools/marketData.js: keyless history (Stooq CSV, Coinbase candles) and World
  Bank indicators, parsed by pure functions; only the thin fetch half is untested.
- Exposed as two tools: finance_analytics (dcf|npv|irr|cagr|analyze|var|option|implied_vol|
  portfolio|beta|indicators|backtest) and market_data (stock|crypto|indicator).
- LICENCE: inspired by FinceptTerminal's feature list, but NO code taken from it — that project
  is AGPL-3.0-or-later and copying would force this app (unlicensed/proprietary) to become AGPL
  including its network clause. Written from published equations, which are not copyrightable.

## Gotchas — finance
- Gordon growth is REFUSED when g >= r rather than returning a confident Infinity.
- Sharpe/Sortino return null, not Infinity, when there is no variation or no downside.
- IRR uses bisection (cannot diverge) and converges on the NPV VALUE, not just the interval —
  a loose interval check left a visible residual on large cash flows.
- Implied vol uses bisection too: vega collapses deep ITM/OTM and Newton diverges to a
  confident wrong number. Returns null when no vol reproduces the quote.
- Greeks are also reported in trader units (per 1% vol, per day, per 1% rate); the raw values
  are routinely misread by 100x or 365x.
- Portfolio weights are UNCONSTRAINED unless long_only is passed; silently clipping shorts
  would change the answer without saying so.
- Coinbase candles are [time, low, high, open, close, volume] — NOT intuitive OHLC. Swapping
  open/close there silently corrupts every downstream return. Pinned by a test.
- Stooq answers 200 with an HTML JavaScript browser check from datacenter IPs (measured
  2026-08-17), which parses to an empty series. isBotChallenge detects it so the user is not
  told their ticker is wrong. Same class as the YouTube datacenter note above.

## Tool result contract (audited 2026-08-23)
- ToolResultCard branches read FIELD NAMES the tool must actually return. Drift here is silent:
  best case an empty card, worst case React #31. Fixed: diff (array-of-objects rendered into a
  <pre> = crash + `similarity*100` double-scaled), unit_convert (formatted/output/formula/
  explanation never returned → empty result + empty Copy), translate (source_text/source_lang/
  target_lang vs original/source/target), whois (creation_date/expiration_date vs events[]),
  rss_feed (feed_title vs source), hash (input_length). Add a card branch => add the fields.
- terminal_exec invoked 'terminal_run' through the FS preload bridge, which whitelists only fs_*/
  roots_*/proc_* — every call died as "Unknown command". Shell goes through __YOGATIK_TERMINAL__.
- terminal:exec ignored the caller's env (CI/PAGER/GIT_TERMINAL_PROMPT), so commands could hang
  on a prompt until the 30s kill.
- A non-zero exit code is a RESULT, not a tool failure. terminal_run used to return success:false
  with no `error` field, which the error log printed as "terminal_run: Unknown error" — no working
  folder, a bad cwd and a failing test all looked identical. exitCode -1 (never started) is the
  only error case now.

- cardContract.test.js is the regression harness for the above (12). Adding a card branch means
  adding an assertion there, or the next drift is silent again.
- code_execute returns `output`, never `stdout`. The card hid `output` whenever stderr existed, so a
  script that printed an answer AND a warning showed only the warning. `stdout || String(result)`
  also threw away the returned value whenever anything was printed.
- spawn_agents: runAgentPool yields a bare `{ error }` slot for a sub-agent that threw. Rendered as-is
  that was an empty card and the model never learned which specialist failed — mapped to the normal
  {agent,role,result} shape now.
- journalCore list/prune sorted on `ts` alone. Several ops inside one millisecond share a ts and a
  stable sort then puts the OLDEST first: "newest first" returned the wrong entry. Tie-break on
  append order (_seq, assigned at read). prune() also REWROTE the index newest-first, inverting the
  file — it writes back in append order and strips _seq.
- translate.test.js used to hit the live MyMemory API: it failed offline, in CI and on quota. Stubbed.

- fs_find_files was registered, aliased five ways and scored 210 ("find files"/"glob"/"where is") but
  NO ipcMain handler existed and the preload whitelist rejected the name. It fell back to a full
  recursive fs_list that filtered on `f.isDir` while fs_list returns `is_dir` — so directories came
  back as matching files, and node_modules was walked. Real handler in fsBridge (name/glob/ext,
  gitignore-pruned, depth- and count-capped), name whitelisted, fallback filter fixed.
- walk() ignored opts.maxDepth (hardcoded 40); callers asking for a shallow scan got a full one.

## What the model is SHOWN about tools (audited 2026-08-23) — schemaContract.test.js (7)
- THREE schema shapes live in the registry: bare {description,parameters} (most), a full
  {type:'function',function:{…}} envelope (screen_inspect, desktop_action, browser_autopilot,
  browser_control), and FLAT {name,description,parameters} with no `schema` key at all
  (semantica_*, code_review_*). getToolSchemas spread all three blindly, so the last two reached
  the model as `{type:'function',function:{name, …nested}}` — a NAME WITH NO DESCRIPTION AND NO
  PARAMETERS. 12 tools, silently. That is why browser_autopilot kept winning over the real
  browser_control. toFunctionSchema() normalises all three; the test rejects a nested envelope,
  a missing description, a non-object parameters, and a `required` naming a missing property.
- A FOURTH shape appeared with local_inference/dspy_optimizer/haystack_rag/aider_copilot/
  langsmith_observability/langgraph_flow: {name, description, schema:<the PARAMETERS object>}.
  toFunctionSchema treated that `schema` as a wrapper, so the model got no description AND no
  arguments at all. Detected by "type:'object' + properties, but no description/parameters".
  schemaContract.test.js caught all six the moment they were added — that is what it is for.
- The activity stream's per-conversation Map is LRU-capped (MAX_TRACKED_CONVERSATIONS=24); the
  active chat and any RUNNING turn are never evicted, or the panel blanks mid-answer.
- ACTIVITY PANEL KEY: publishers use the conversation's clientId (as do loadingMap/streamingMap/
  traceMapRef). App used to subscribe with `conv.id || conv.clientId`, so the moment a chat was
  saved and had a database id the panel read one bucket while the turn wrote another — empty panel
  for every chat except a brand-new one. One key: clientId.
- TOOL BUDGET: all 178 schemas serialise to ~128KB ≈ 32k tokens, sent on EVERY turn — that alone
  overflows an 8k/16k context and exceeds OpenAI's 128-function request cap. prioritizeToolSchemas
  ranked but never truncated, so ranking changed nothing. It now caps at MAX_TOOLS_PER_REQUEST=64
  (~9.8k tokens) and agent.js always routes through it.
- CORE_TOOL_SCORES is the floor that makes the cap safe: keyword boosts only fire when the message
  mentions the thing, so a follow-up like "now do the same for the other file" would otherwise drop
  fs_*/terminal_run/browser_control/spawn_agents mid-task and the model would announce it has no
  file access while holding fs_read.
- An alias must never shadow a registered tool. `watch` was both (real tool in devTools + alias for
  watch_folder): the model read one description and reached a different tool with different actions.
  executeTool prefers a registered name over an alias now, and the alias is gone.

## Security + SW (audited 2026-08-23)
- sanitize.js scrub() ran `root.querySelectorAll('*')`, which NEVER matches the node it is called
  on. For sanitizeSvg the root IS the attacker-controlled element, so `<svg onload="…">` kept its
  handler and fired the moment it hit dangerouslySetInnerHTML. Scrubs [root, ...descendants] now;
  2 tests in enhancements.test.js. sanitizeHtml was unaffected (its root is our own <body>).
- Only ONE dangerouslySetInnerHTML sink exists (ToolResultCard diagram) and it is sanitised.
- sw.js navigate handler cached the response WITHOUT checking resp.ok, so a 404/503 during a deploy
  was stored as /index.html and every later offline navigation served the error page until the next
  deploy. swCache.test.js drives the real fetch handler for both cases (6 tests).
- cors-proxy: credentialed-host check is exact-match (no suffix trick), retry-after is copied AND
  exposed, credentials never reach an unvetted host. Verified, unchanged.
- react-hooks/exhaustive-deps is deliberately NOT enabled: the warnings are mount-only effects and
  ref-based reads (App branch/rename, ModelPicker snapshot-on-open). Checked, no stale-closure bug.

- MISSING-ARG BEHAVIOUR: 18 tools answered a call with a missing required argument by leaking a raw
  TypeError ("Cannot read properties of undefined (reading 'split')"). The model cannot act on that,
  so it retries the same broken call — and for code_execute/ocr/diagram/image_* it first paid a
  multi-MB WASM download to get there. Every tool names the missing argument now; schemaContract.test
  calls all 178 with {} and fails on a raw TypeError. Sweep time went 10.5s → 53ms.
- executeTool's catch used `err.message` alone: a thrown string, or an error object without
  `message`, produced error:undefined → another "Unknown error" in the log.
- A blanket schema-driven required-args guard was considered and REJECTED: ~13 tools legitimately
  succeed with no args (web_search returns {error} without success:false, mcp_* default their action,
  fs_find_files accepts pattern OR extension), so validation belongs in the tool.

## Crash containment (2026-08-23) — ToolResultCard.test.jsx (44)
- There was exactly ONE ErrorBoundary, at the root in main.jsx. A throw inside any tool card
  therefore unmounted the WHOLE APP — that is why a malformed diff result blanked a live chat
  rather than spoiling one card. CardBoundary now wraps each card: it logs the crash (never
  silent) and falls back to a "result could not be displayed" card holding the raw JSON.
- Rendering all 40 card branches with a result whose every field is an object crashed 34 of them.
  Hardening 34 branches individually was rejected as clutter; containment is the structural fix
  and the test feeds every branch that hostile result.
- diagram returned `null` when sanitizeSvg produced nothing: the tool reported success and the
  user saw NO card and no reason. It says so now.
- diagnoseError had no bucket for workspace/desktop refusals, so "No working folder for this chat"
  was reported as "Model Execution Failed — an unexpected response was received from the model
  provider", sending the user to re-enter an API key. New `workspace` bucket, checked late so a
  real 401/429/5xx still wins.
- TerminalPanel.test.jsx had ENCODED the broken PTY contract (start(), write(text)) — the test
  passed because it asserted the bug. It pins spawn()/write(id,data), id-filtered output, and
  "bridge present but node-pty missing ⇒ stay on the web sandbox".

## The build is not covered by the tests (2026-08-23) — buildGuards.test.js
- `src/hooks/useToast.js` held JSX in a `.js` file and main.jsx imported it, so `npm run build`
  AND `npm run dev` failed outright — while all 1400+ tests passed, because vitest transforms
  each test's own import graph and never builds the app. Renamed to .jsx (Vite resolves the
  extensionless import unchanged).
- buildGuards.test.js parses every src/**/*.js with ESBUILD, the same tool the build uses. A regex
  for "<" does not work: HTML inside template literals (docGenerator, chatExport, threeui) looks
  exactly like JSX and is perfectly valid JS. The file runs under `// @vitest-environment node` —
  esbuild refuses to start when jsdom's TextEncoder does not return a real Uint8Array.
- RUN A REAL BUILD before believing a green suite. `npx vite build` in a Linux checkout is the
  cheapest way; the main chunk is ~1.23MB (395KB gzip) and rollup warns about it.

## CSP is enforced in index.html (2026-08-23) — cspGuard.test.js (4)
- index.html carries an ENFORCED <meta> CSP; firebase.json serves the same policy Report-Only.
  BOTH apply and a browser intersects them, so the meta is the strict one that actually blocks.
- The revision added at 11:53 allowlisted connect-src and broke the app on the web: it named
  `api.nvidia.com` while llm.js dials `integrate.api.nvidia.com`, and omitted the Cloudflare proxy
  worker, huggingface.co, pollinations, open-meteo, mymemory, every open-data API and every public
  relay. script-src also omitted https://esm.run, which ten modules dynamic-import (WebLLM,
  Transformers.js, Kokoro, mermaid, qrcode, html2pdf). A CSP refusal is opaque: the app cannot
  catch it, report it, or fall back — the tool just fails.
- connect-src CANNOT be an allowlist here. The user configures their own provider, tools call
  dozens of keyless hosts, and desktop talks to localhost daemons. It is `https: wss: blob: data:`,
  matching firebase.json. The directives that do the real hardening (object-src none,
  frame-ancestors none, base-uri self, form-action self) are kept.
- cspGuard.test.js parses the meta out of index.html and cross-checks every provider baseUrl in
  llm.js against connect-src. Nothing else in the suite loads index.html at all.

## Coverage added where it was structurally missing (2026-08-23)
- ONE shell tool now. terminal_exec was a near-duplicate of terminal_run — same IPC bridge, same job,
  both scored ~200 for shell phrasing, so the model chose between two near-identical descriptions
  every turn and one wasted a slot in the 64-tool budget. Its extras (non-interactive env, ANSI
  stripping, durationMs) are folded into terminalRun.js; `terminal_exec` is an alias. PRESETS must
  use canonical names, not aliases: agents.js listed terminal_exec, which agents.test caught.
- llmTransport.test.js (15): agent.test.js drives the loop with a fake streamChat, so SSE parsing,
  retry/backoff, abort, the tools-rejected fallback and provider body shaping were untested. Pins
  the documented invariants: an AbortError still fires onDone; a 400 naming a missing MODEL is a
  model error, not "tools rejected"; onToolsRejected must also call onDone or the agent hangs;
  NVIDIA gets no tool_choice; Anthropic hoists `system` and uses x-api-key (its target host rides
  in X-Target-URL because it is proxied).
- electronFsBridge.test.js (12): drives the REAL fs_* handlers against a REAL temp dir through the
  REAL roots registry. vitest hands .cjs to Node's CJS loader, so neither vi.mock nor a Vite alias
  reaches `require('electron')` — the test patches Module._load and loads the modules with
  createRequire (an ESM import would give fsBridge a SECOND copy of roots.cjs with unloaded state,
  and every handler would answer "no folder granted"). test/electron-stub.cjs records ipcMain
  handlers. It immediately found a real bug: `Number(maxDepth) || 10` swallowed a deliberate
  maxDepth:0, so "this folder only" walked ten levels.
- ci.yml e2e is no longer continue-on-error. It is the only job that BUILDS the app the way a user
  loads it, and it sat green for months while running a script that did not exist.

## Finished UI that nothing imported (2026-08-23) — buildGuards.test.js reachability
- App.jsx wired 34 components; FIVE complete panels were never imported by anything, so no user
  could open them: TerminalPanel (reachable only via TerminalTrigger, which nothing imported),
  SchedulerPanel, SubAgentRunnerPanel, AutoSkillsPanel, FileEditorModal. In every case the TOOL was
  registered — the model could use the capability while the human-facing half stayed dark. All five
  are now in the command palette under Tools, with state in App.
- New panels MUST be added to browserOccluded and isAnyModalOpen. A WebContentsView composites above
  the DOM, so a panel that is not in browserOccluded is painted UNDER the docked browser.
- AutoSkillsPanel was inert even once mounted: every handler dispatched a CustomEvent
  ('yogatik:auto-skills:*') with an onResult callback and NOTHING listened, and loadData was gated
  on __YOGATIK_SCHEDULER__ — an unrelated bridge. It calls autoSkills.js directly now.
- Scheduler/SubAgent panels silently did nothing on the web (no bridge, no message). Both say so.
- PermissionModal was a dead duplicate of the wired PermissionPrompt, and read `diff.deleted` where
  diffPreview produces `removed`, so its counter always showed 0. Deleted with its test; if the
  "Always for Workspace" scope is wanted, port it into PermissionPrompt (permissions.js already
  accepts remember: 'chat' | 'project' | 'global').
- The reachability guard allows ONE orphan, AdModal, because ads are deliberately switched off.

## The vision pipeline threw the picture away (2026-08-24) — vision/imageStats, preprocess, detect
- SYMPTOM: a dark-mode video-player screenshot reached a text-only model as the string
  "10 » | 41 PLEY", and it correctly said it could identify nothing. That looked like a model
  failure and was a pipeline failure.
- THREE causes, all in a 26-line ocr.js:
  - NO PREPROCESSING. Tesseract is trained on dark ink / light page / ~300dpi. It was handed
    white glyphs on black at UI scale — the inverse of everything it knows.
  - NO CONFIDENCE FILTER. The garbage came back success:true and agent.js inserted it as THE
    CONTENT OF THE IMAGE.
  - A NEW WORKER PER CALL, re-downloading ~15MB of traineddata every time.
- describeWithoutModel picked exactly ONE source (OCR or the VLM) and returned it alone. It now
  FUSES structure + zero-shot labels + object detection + VLM + OCR, in parallel, and labels an
  untrusted OCR reading as noise rather than as content.
- vision/imageStats.js is free (no model, no download, no network): colour count, edge density,
  luma profile, horizontal-projection text bands, dominant palette → photo | ui | document |
  diagram + darkMode. Colour count is the single strongest discriminator — a photo has thousands,
  an interface has dozens. A dark image drawn from <900 colours is classified `ui` DIRECTLY: the
  edge-density branch called a mostly-flat video player a "diagram", which sends the model
  looking for the wrong thing.
- vision/preprocess.js builds candidate renderings and OCR tries them best-first: grayscale +
  contrast stretch, INVERTED when darkMode (this is the actual fix for the screenshot, not a
  fallback), and Sauvola local thresholding. Global thresholding turns a screenshot with a light
  panel beside a dark one into half solid black; local thresholding is the only correct choice
  on a UI. Small images are upscaled to ~1000px so glyphs reach a trained height.
- vision/detect.js: CLIP zero-shot (~90MB) and DETR detection (~40MB) via Transformers.js, gated
  behind the SAME `localVision` consent as the VLM — a download is a decision, not a fallback.
  DEFAULT_LABELS deliberately covers software surfaces, not just photo subjects.
- tools/identify.js is the tool that can actually answer "what series is this": reading the image
  harder never could, because the series name is on the internet and the frame holds an episode
  number and a timestamp. describe → extractIdentifiers → buildQueries → web_search → evidence.
- isLikelyMisreadChrome() matches UI chrome by EDIT DISTANCE 1, not equality: OCR produced "PLEY"
  for a play button, which passes every other filter (4 letters, caps, not a stopword, not
  numeric) and searches as confident nonsense. Filter the word OCR THOUGHT it saw, not the word
  the button says. identify.test.js pins the real fragment as yielding zero queries.

## The desktop FS bridge lost data five ways (2026-08-24) — electron/fsCore.cjs
- All five MEASURED by driving the REAL handlers against a REAL temp dir, not by reading code:
  - `fs_edit({oldString:'', replaceAll:true})` turned "hello" into "hXeXlXlXo" — new_string
    inserted between every character, no error. `applyEdit` refuses an empty old_string now.
  - `fs_read` sliced at maxBytes and returned a BARE STRING: a 4MB file arrived as its first
    500KB, indistinguishable from a whole one, and the model then rewrote the file from it. It
    returns {content,truncated,bytes,lines,hash,encoding,eol,note} and cuts on a LINE boundary
    (a byte slice also split codepoints). offset/limit do ranged reads — the tool advertised
    start_line/end_line and sent startLine/endLine, which the handler never read.
  - `fs_write` wrote 'utf8' always: a CRLF file came back LF, so a one-line change rewrote every
    line. Encoding + BOM + EOL are detected on read and restored on write.
  - `fs_move` renamed onto an existing file and destroyed it silently, and journalled the SOURCE
    — the side that survived. Refuses without overwrite:true; journals the DESTINATION; falls
    back to copy+delete on EXDEV (any C:→D: move).
  - `writeFile` is O_TRUNC: a crash mid-write leaves a truncated file with no copy. All writes
    go through writeFileAtomic (sibling temp + fsync + rename, mode preserved).
- Lost updates are WARN-BUT-PROCEED by the user's choice: fs_read returns a hash, fs_write/
  fs_edit take expectedHash and report `stale` + a warning. That is only defensible because the
  journal snapshots the CURRENT bytes first, so the other program's edit is recoverable via
  fs_undo. electronFsBridge.test.js asserts the journal entry exists.
- THREE tools did one job and two could destroy a file: fs_replace_content and fs_multi_replace
  both did fs_read(5MB cap) → replace → fs_write, so on a larger file they wrote the TRUNCATED
  head back and deleted the remainder. Both delegate to the bridge handlers now; fs_multi_edit
  applies N edits in memory and writes ONCE or touches nothing. fs_file_info read up to 5MB to
  report a size (and called characters "bytes") — one fs_stat now.
- desktop.test.js had ENCODED the broken contract (mock answered startLine/endLine), so the
  feature was dead and the test green. Same class as the TerminalPanel PTY mock.
- A handler not named in preload.cjs's FS_COMMANDS is rejected as "Unknown command". Every new
  fs_* handler must be added there or it is unreachable — that is how fs_find_files shipped.

## Reader/writer field drift is now caught mechanically (2026-08-24) — dbContract.test.js
- FOUR bugs in this codebase have had one shape: a consumer reading a property the writer never
  put on the row. `f.isDir` vs `is_dir`; `startLine/endLine` vs `offset/limit`; `doc.text` vs
  `doc.chunks`; `c.messages` vs the messages table. None threw — `undefined` reads as "absent",
  not "broken", so the feature degrades into an honest-looking empty answer and every test stays
  green.
- dbContract.test.js round-trips every persisted row type through the REAL helpers and a REAL
  IndexedDB (fake-indexeddb), asserting each field a consumer depends on survives. The contract
  map names the CONSUMER per field, not just the key, so nobody "cleans up" one that looks
  unused: `at: 'recencyWeight — NOT createdAt, which is what a reader would guess'`.
- It also pins the assumption that emptied the vault: a conversation ROW must NOT carry
  `messages`, and getConversation() must join them. Stating it as an expectation means the next
  reader is told rather than left to guess.
- VERIFIED NON-VACUOUS: deleting `chunks` from addDocument's write makes it fail with
  "document.chunks is missing after a real round trip — breaks: retrieval.searchLocalVault +
  doc_search — the ONLY place document text lives". A green contract test that cannot fail is
  worse than none.
- A sweep of the remaining tables (memories, media, projects) after the vault fix found them
  internally consistent — memory4 reads `at`/`importance`/`refCount`/`text`/`store`, all written.

## local_vault_search searched NOTHING, and said so as a fact (2026-08-24) — retrieval.js
- PROVEN with a real Dexie (fake-indexeddb): a vault holding 1 document and 2 messages returned
  `{results: [], note: 'No local documents or chat history stored in IndexedDB.'}`. It told the
  user their vault was empty while it was full, never threw, and nothing noticed.
- TWO independent dead reads, either of which alone would have halved it:
  - `doc.text` — api.js stores an upload as `chunks` and DELIBERATELY without the full text
    ("keeping the full text too doubled IndexedDB usage"), so `if (doc.text)` was never true.
  - `c.messages` — read off a conversation ROW. That field has never existed: messages live in
    their own table and getConversation() joins them in. Same class as the `is_dir` vs `isDir`
    and `startLine` vs `offset` drifts — a field name that was never on the object.
- Consequence beyond the tool: local_vault_search is a core tool of the Knowledge Librarian
  preset agent, whose system prompt tells it to "say clearly when the vault does not contain the
  answer rather than guessing". That agent was structurally incapable of finding anything and
  confidently reported so, every time.
- Now reads doc.chunks (falling back to doc.text for legacy rows), queries db.messages directly
  and joins conversation titles, and builds through buildIndexAsync so a large vault cannot
  freeze the UI. vaultSearch.test.js drives the real db and asserts a non-empty corpus.
- LESSON, third time now: a read of a field that does not exist fails SILENTLY and looks like an
  honest empty result. Grep the writer before trusting the reader.

## Ctrl+K froze the app as history grew (2026-08-24) — chatSearch.js, retrieval.js
- chatSearch built its BM25 index over `db.messages.toArray()` — EVERY message ever stored —
  synchronously, on the thread that paints the UI. MEASURED: 2000 msgs 87ms, 8000 msgs 392ms,
  20,000 msgs **1089ms**. The command palette is the app's primary navigation, so the cost fell
  on the most common interaction and grew with use.
- Worse, a Dexie `creating` hook invalidated the index on EVERY message write, so searching
  during an active conversation rebuilt the whole history after each reply: 1151ms, per reply.
- retrieval.appendToIndex() grows the index in O(the new message) — the index is only
  {tf[], df, len[], n, avgLen}, so there was never a reason to throw it away. avgLen is kept as a
  running mean; recomputing it from the array would put the O(n) straight back. MEASURED after:
  **0ms per reply**.
- retrieval.buildIndexAsync() yields every 400 documents. Same total work, but the longest
  uninterrupted block on a 20,000-message first build is **25ms instead of 1089ms** — one dropped
  frame rather than a hang.
- chatSearch keeps a `maxId` high-water mark and catchUp()s incrementally (`++id` is monotonic,
  so anything above it is exactly what has not been seen). `creating` on messages no longer
  invalidates; DELETE and UPDATE still do, because they change rows the index already holds.
- An in-flight build is shared (`building`), so a burst of keystrokes cannot start several passes.

## Desktop boot did work the window was waiting on (2026-08-24) — electron/main.cjs
- whenReady ran ~25 register*() calls BEFORE createWindow(). Every one of them registers IPC the
  RENDERER calls, and the renderer cannot call anything until its bundle has loaded — hundreds of
  ms away. The window was delayed by the sum of all of it for no benefit. Now: roots + journal +
  fsBridge (the workspace chip reads them on mount), then createWindow(), then the rest in a
  setImmediate — on screen and painting while they run, still long before the renderer is up.
- `await startSearchSidecar()` sat in front of every remaining ipcMain.handle, so a slow or
  hanging sidecar left desktop:getSystemInfo and the window controls unregistered for as long as
  it took, and the renderer got "no handler" for a reason unrelated to what it asked for. Fired
  and forgotten now.
- createJournal() called prune() SYNCHRONOUSLY — readIndex plus a statSync per blob — and
  main.cjs calls it before createWindow(). MEASURED: 17ms for 2000 entries, 64ms for 8000, on a
  Linux tmpfs; NTFS with a scanner in the path is far worse. Deferred 5s and unref'd. Nothing
  depends on a pruned store: the caps are housekeeping, not correctness.
- The rule this establishes: NOTHING goes before createWindow() unless the first paint reads it.

## A model-written regex could hard-lock the app (2026-08-24) — electron/safeRegex.cjs
- MEASURED in a bare Node process: `new RegExp('(a+)+$').test('a'.repeat(40)+'!')` did NOT return,
  and a setTimeout scheduled BEFORE it never fired. The engine holds the thread through
  backtracking, so the event loop stops entirely.
- fs_search did `regex ? new RegExp(query) : null` with a query the MODEL wrote, on the process
  that also composites the window. One catastrophic pattern = the whole desktop app frozen, no
  dialog, no cancel, no timeout possible, Task Manager the only exit. This is NOT fixable with a
  timeout: a runaway regex cannot be interrupted from inside, only TERMINATED from outside.
- Two layers, because neither suffices alone. safeRegex.assessPattern rejects the shapes
  (a quantifier inside a quantified group; a repeated group of overlapping alternatives) before
  compiling; searchWorker.cjs runs whatever survives on a worker_thread that fsBridge kills at
  15s. A rejected pattern falls back to a LITERAL search — returning "no results" for a pattern
  that was never executed would be a lie.
- globToRegExp moved into safeRegex and was wrong before: `*` → `.*` matched across `/`, so
  `src/*.js` matched `src/deep/nested.js`, and `**` was not handled at all. `*` is `[^/]*`,
  `**/` is `(?:.*/)?` (so it matches zero directories too), and `{js,ts}` braces work.
- watcher.cjs now calls fsIndex.invalidate() on every debounced change: fsBridge invalidates on
  its OWN mutations, but an edit from the user's editor, a build step or a git checkout arrives
  only through the watcher, and without it the index served a 5-second-stale directory.
- walk() and gitignoreMatcherFor() in fsBridge were dead once fsIndex took over traversal; dead
  code that still looks authoritative is worse than none.
- fs_batch_write threw out of its own loop on the first failure, so `guard` returned a bare error
  and the caller could not tell WHICH files had already been written — the worst answer for a
  half-applied batch. Per-file results now, with `partial: true`.

## The main process froze on every search (2026-08-24) — electron/fsIndex.cjs
- `walk` was recursive readdirSync up to 20,000 entries ON THE MAIN PROCESS, which also
  composites the window: every fs_search / fs_find_files froze the whole app. Nothing was
  cached either, so three questions about one repo paid for three full traversals plus three
  reads of .gitignore.
- fsIndex is async, ITERATIVE (a deep tree used to be bounded only by the JS stack), yields to
  the event loop every 500 entries, honours NESTED .gitignore files (only the root one was read
  before), and caches per root with a 5s TTL. Every mutation calls invalidate() from snapshot()
  — miss that and a file the app just wrote is invisible to its own next fs_find_files.
- journalCore.record() copyTree'd whatever it was given, synchronously: deleting a node_modules
  copied gigabytes before the delete started, froze the window, blew the 200MB cap and filled
  the disk. measureTree() bails early past maxSnapshotBytes (64MB) and the entry is marked
  `skipped:'too-large'` so revert() says so instead of pretending.
- fs_batch_read Promise.all'd every path at once (EMFILE on Windows); rolling window of 16.
- fs_file_tree collected 2000 entries and filtered by depth AFTERWARDS, so one deep directory
  ate the budget and shallow siblings vanished from a "complete" tree. Depth bounds the WALK,
  and it draws real ├──/└──/│ connectors rather than └── on every line.

## Web companion was a HUD wired to nothing (2026-08-24) — companion/
- The popped-out Document-PiP window rendered as a BLACK BOX. The panel roots itself with
  `position:fixed` at `top/left` derived from the MAIN window (`innerWidth - 400`), i.e. ~1520px
  across, inside a 380px PiP document — entirely off-screen. `isPip` now fills the window
  (static/100%/no radius/no drag) and App portals into `#pip-root` (which the injected base
  stylesheet gives a height) via getPipMount(), not a bare <body>.
- `autoWatch` and `ambient` were useState with NO loop behind them, and companionAwareness's
  shouldObserve/shouldSpeak/contextChanged/buildObservationPrompt were imported and never called
  once. The switches lit up and nothing looked at anything. Every message it sent went to
  `onSendPrompt` → whatever chat happened to be open in the main window.
- NEW, all injectable and DOM-free where it matters:
  - `companion/adaptive.js` — cadence breathes: floor 6s, ×1.6 per idle round, ceiling 120s, snaps
    back to the floor on a change or while the user is engaged.
  - `companion/liveWatch.js` — the loop. capture+hash every round (local, free); watch.js gates the
    MODEL call on time/change/budget. Never overlaps a slow turn (`inFlight`), treats a null hash as
    UNKNOWN not "unchanged", advances lastHash on skipped rounds so slow drift still trips the gate,
    and enforces maxPerHour even against a forced look (shouldLook honours `force` BEFORE the budget
    check — the loop must not). `poll()` = a normal round, `look()` = the user pressed the button.
  - `companion/companionChat.js` — one durable pinned conversation (`companion_conversation_id`),
    recreated if the user deletes the row; `SILENCE`/`isSilence` so an ambient look can decline to
    speak. The sentinel is stripped from the window, or the model learns that silence is the style.
  - `companion/runtime.js` — one turn runner, channel 'companion', own history (12 turns), own
    system prompt. Ambient turns run with tools OFF: a background glance must not start shell
    commands or web searches.
  - `companion/useCompanionBrain.js` / `useCompanionVoice.js` — the React seam. Vision follows the
    same 3-tier policy as the camera (model image_url → on-device OCR/VLM → honest note). Voice
    reuses live/cascade's echo guard, wake word, noise gate, command grammar and adaptive
    endpointing; the old companion mic had no echo guard and answered its own replies.
- Heavy deps (Tesseract, VLM, 90MB narrator) are imported lazily and only when a capability is
  switched on. liveWatch.test.js = 17.

## First visit downloaded the whole app TWICE (2026-08-24)
- MEASURED in headless Chromium: 40 requests / 4604KB before first render. sw.js calls
  clients.claim() on activate, so the first worker claims a page that loaded uncontrolled →
  controllerchange → `navigator.serviceWorker.controller` is non-null → the reload guard let it
  through → full reload, index.html and all 20 chunks again. The page was already running exactly
  the code that worker had just cached.
- The test must be "was this page controlled WHEN IT LOADED" (`hadControllerAtLoad`, captured before
  registration), not "is there a controller now" — by the time the event fires there always is.
- vendor-markdown was 862KB and eager on an empty chat. manualChunks lumped react-syntax-highlighter/
  prismjs/refractor in with react-markdown, so CodeBlock's deliberate React.lazy resolved to an
  already-downloaded chunk: the lazy import was decorative. Splitting it out is NOT enough — Vite
  emits `<link rel="modulepreload">` for every manual chunk the entry graph touches, so a named
  `vendor-prism` still arrived during first paint. manualChunks returns undefined for it now, leaving
  it in the async chunk Rollup makes for the import() itself.
- Nine React.lazy panels (TerminalPanel, Tour, McpModal, DomainHubModal, DownloadModal…) were
  rendered UNCONDITIONALLY and self-gated with an internal `if (!isOpen) return null` — which runs
  only after the chunk has downloaded. Gate lazy components at the render site.
- Result: 40 req/4604KB → 12 req/1813KB, FCP 576ms. Re-measure with frontend/perf-style profiling
  before believing any bundle claim; `npm run build` output alone does not show what is FETCHED.

## The ad script owned the app's height (2026-08-24) — shellGuard.js
- MEASURED in headless Chromium at 1440x900: `.sidebar` rendered **2129px tall**, so the
  settings drawer, the sidebar footer and Sign In were all below an overflow:hidden edge with
  no scrollbar anywhere that could reach them. `#root`, `.app`, `.sidebar` and `.settings` all
  carried `style="height:auto !important; min-height:0 !important"`.
- Nothing in our source writes that. adsbygoogle.js walks up from its `<ins>` un-constraining
  every ancestor so a responsive unit can claim the page width. An INLINE !important beats
  every author rule, so no CSS fix exists — the declaration has to be taken back off.
- `<AdSenseBanner/>` was mounted INSIDE `.settings-body`, i.e. the walk went straight through
  the whole shell. It lives in `.sidebar-scroll` now (`.sidebar-ad`, max-height 140px), where a
  growing ad cannot reflow anything, and defaults to `data-full-width-responsive="false"` with
  an explicit height so the walk is not triggered at all.
- src/shellGuard.js (installed in main.jsx) is the structural fix: a MutationObserver on
  `style` that strips height/min-height/max-height from `#root, .app, .sidebar, .settings` only.
  Any third-party script gets the same treatment. shellGuard.test.js (6) replays the real
  ancestor walk; AdSenseBanner.test asserts the banner is not back inside the drawer.
- The slot folds away entirely when `data-ad-status !== 'filled'` after 4s — a labelled blank
  rectangle eating 140px of a 272px sidebar is worse than no slot.
- CSP frame-src was missing `*.adtrafficquality.google`, so the ad's own verification frames
  were refused on every load. A CSP refusal is opaque; the console error was the only signal.

## Mobile header collapsed the title AND the hamburger (2026-08-24)
- `.hero-actions, .header-actions { flex-wrap: wrap }` at ≤480px (added for the hero row) let
  nine 40px icon buttons wrap to a second row, take the full width, and squeeze the title block
  to **0x40** — the chat title and the ONLY control that opens the sidebar were rendered,
  focusable and invisible. Header was 119px tall. `.header-actions` scrolls sideways now.
- The title block's `minWidth: 0` was INLINE in App.jsx and therefore unbeatable from the
  stylesheet; it is `minWidth: 88` (the h1 still ellipsizes inside it).
- The composer textarea was 46px with scrollHeight 63: at the 16px iOS-no-zoom size the
  placeholder wraps to two lines and the second was cut in half. 64px at ≤480px.
- `.settings.open { min-height: 140px }` is `min(140px, 20vh)` — a flat floor pushed the footer
  out of an overflow:hidden sidebar on a short window.
- `.modal-content` (SchedulerPanel's log viewer) had NO rule; it painted unstyled onto the
  backdrop. Aliased to `.modal`. Verify UI claims with a real browser: the whole suite (1558
  tests) was green through every one of these.

## Gotchas (learned the hard way)
- Working folders are PER CHAT on Electron (v3.9). Absolute paths are ALLOWED now — safety is the
  realpath containment check against that chat's bound roots, not a ban on absolute paths. The old
  "abs/.. rejected" rule only worked because there was exactly one root.
- resolveWithin anchors its realpath re-check on the nearest EXISTING ancestor. Checking only when
  the target already existed let a symlinked parent dir be used to fs_write OUTSIDE a root.
- The renderer NEVER sends a filesystem path as "the root". It sends an opaque conversationId and
  main looks up the binding. Model output influences the renderer, so a renderer-supplied root would
  make the whole grant model meaningless. ctx is injected in localFs.invoke, never a tool parameter.
- terminal:exec requires a folder bound to the CALLING chat. It must never fall back to process.cwd()
  — that is the app's own install directory.
- rootsCore.cjs must not `require('electron')`: vitest only collects src/**/*.test.js under jsdom,
  where that throws. That split is the only reason the containment logic is testable at all.
- sw.js must skip non-GET + cross-origin, else it caches POSTs and fakes 408s
- Never copy upstream content-length when re-streaming (truncates SSE)
- Agent: ONE assistant msg with all tool_calls, then tool msgs (NVIDIA 400s otherwise)
- NVIDIA /v1/models is public (no key); models cached 6h in IndexedDB, SWR
- proxyFetch order: OUR worker first (real bytes, may carry credentials), then allorigins /
  corsproxy, then r.jina.ai LAST — jina returns markdown, so HTML parsers found nothing when
  it was first. Public relays are never given credentials. A relay that fails is skipped 60s
  instead of being retried on every call (corsproxy 403s were per-call noise).
- The worker must copy retry-after AND expose it via Access-Control-Expose-Headers, else CORS
  hides it and every 429 degrades to blind backoff.
- The worker sets `X-Yogatik-Proxy: upstream` on anything it merely relayed. DuckDuckGo and
  YouTube 429 datacenter IPs, and without that header the client benched its OWN proxy for
  the target's decision. Relayed 4xx/429 => no cooldown, just fall through to a public relay.
- youtube.js had a SECOND copy of the relay list + worker URL, so it missed the ordering, the
  cooldown and the jina-is-markdown rule. Tools must go through tools/http.js, never their own.
- A host that beats EVERY relay (youtube.com: datacenter IPs are refused outright) is skipped
  for 5 min — otherwise each call reprints four CORS failures and costs a second.
- YOUTUBE TRANSCRIPTS ARE UNOBTAINABLE keylessly from a datacenter (measured 2026-08-09):
  watch page 429 to our worker AND every relay, InnerTube WEB 200 but captions stripped (bot
  check), InnerTube ANDROID 400, video.google.com legacy timedtext 200-empty, Piped 502,
  Invidious 403/401. Same worker returns 200 for example.com and DuckDuckGo, so it is not the
  proxy. The tool returns metadata + transcript_note telling the model to say so and offer to
  use a pasted/uploaded transcript. Do not "fix" this with another relay — none of them have
  a residential IP.
- The clock shortcut in App.jsx answers WITHOUT the model, so isDirectTimeQuery matches whole
  questions via anchored regexes. Substring matching on 'today'/'now' answered "Today's India
  news" with the time (hit 2026-08-09). 3 tests in timeQuery.test.jsx.
- 429/5xx retried w/ backoff + Retry-After in llm.js fetchWithRetry
- Lint: npx eslint@9 w/ no-undef catches extraction mistakes vite build won't. It has
  caught real ReferenceErrors twice (PUBLIC_RELAYS, research.js `search`) that only blow
  up at runtime — run it before every deploy.
- qrcode 1.5.x has NO /build browser bundle; the 404 page loaded as a script is refused by
  ORB. Use the esm.run ESM build. Script onerror gives an Event — reject with an Error or
  the failure surfaces as "undefined".
- NEVER `await import('jsdom')` as a DOMParser fallback: Vite bundles it statically anyway —
  it shipped a 2.86MB dead chunk (build was 3351 modules / ~5.1MB, now 2228 / ~2.3MB).
  DOMParser is a browser global; tests get it from test-setup.js.
- WebGPU: `!!navigator.gpu` is not availability. requestAdapter() can still return null
  (headless, blocklisted drivers, VMs) — gpu.js probes properly and everything falls back
  to wasm.

## Model 400s + weak models (2026-08-10)
- NVIDIA renames/withdraws models with a 400 "The model X does not exist" (NOT 410/404).
  isRetiredModelError now matches that phrasing so pruneRetiredModel drops it + clears the
  selection. streamChat surfaces a model-gone 400 as an error instead of misrouting it into
  the prompted-tools retry (which 400s again on the same dead model = the double-400).
- Weak models (e.g. nemotron-mini-4b) ACCEPT a tools array + emit a call, then 400 when the
  tool RESULT is sent back (they reject role:"tool" history). The native→prompted fallback
  was only checked after the FIRST call; now the tool loop checks rejectedTools every round
  and calls demoteToPrompted(), which rewrites the native tool turns already in `messages`
  (assistant.tool_calls → plain assistant, role:tool → user "TOOL_RESULTS …") before retrying.
  Without the rewrite the retry re-sends role:tool and 400s again.
- candidateScore parses the param count and gives sub-5B models / "mini" a -6 so auto-pick
  stops landing on a 4B model that can't drive tools. 7–15B is the responsive sweet spot.
- MessageBubble: long assistant replies (>500 chars) defaulted to COLLAPSED — the whole
  answer hid behind "Show more" (worse with reasoning models whose <think> preview renders
  blank). isExpanded now defaults true.

## Reliability + capability upgrades (2026-08-10)
- MessageBubble.splitReasoning() pulls <think>…</think> (incl. an unclosed one mid-stream)
  into a collapsible "Thinking" panel; the answer renders plainly. A successful turn with an
  empty answer now shows an explicit note instead of a blank bubble. Errors already surface
  via msg.error; the gap was reasoning-only/empty replies.
- youtube.js fetchPage() tries the user's OWN connection first (residential IP dodges the
  datacenter 429) then the relay chain. youtube.com is still usually CORS-blocked (no ACAO),
  so this is best-effort; the transcript_note is the real fallback.
- autoPickModel probes prov.preferred (curated known-good, tool-capable) FIRST, intersected
  with the live catalog, then the heuristic ranking — a fresh key never lands on a weak 4B.
  It also probes the winner's tool mode once (tiny tools array) and caches toolmode_<p>::<m>
  so the first real chat never pays the native→prompted 400. Runtime demoteToPrompted still
  handles models that accept the call but 400 the RESULT, and caches the mode too.
- Opt-in semantic retrieval (features.semanticSearch, default off; ~23MB Xenova/all-MiniLM
  q8 via esm.run, consent-gated like localVLM). semantic.js.semanticRerank blends cosine with
  BM25 over a widened BM25 shortlist in doc_search — no persisted vectors, falls back to BM25
  order on any failure so BM25 stays the safety net. semantic.test.js covers the fallback.

## Images + memory + audio (2026-08-10)
- imageGen.js fetchImage(): ONE global rate-gate (900ms min-gap, serialised chain) + backoff
  honouring Retry-After. Pollinations 429s a 5-image video round instantly; both image tools
  AND videoRender.loadImage (for pollinations hosts) go through it so nothing bursts.
- agent.js memoryBlock(): the `memory` tool's saved facts are auto-injected into the system
  prompt each turn (systemBase, reused by the prompted-mode rebuild) so the model recalls them
  without a tool call. Capped at last 20.
- text_to_audio: on-device Kokoro (video/speech.js) → sentence-chunked synth → Float32 concat →
  pure-JS 16-bit WAV → Dexie media. ToolResultCard.RenderedAudio plays it (media_id recovery
  like video). The FILE counterpart to tts (which only plays, returns nothing to hold).

## Generation quality (2026-08-10)
- dataConvert: RFC-4180 CSV — csvCell quotes/doubles, toCsv adds UTF-8 BOM + CRLF (Excel-safe),
  parseCsv is a real quoted-field parser (was split(',')). generation.test.js round-trips it.
- mdToPdf.mdToHtml: proper block Markdown (headings/lists/tables/code/blockquote/hr/paragraphs,
  HTML-escaped) + print CSS + html2canvas scale:2 (crisp text) + css pagebreaks. Reused by
  independentTools doc/html export so Word/.doc/HTML render real formatting, not <br> soup.
- imageGen.pollinationsUrl: model=flux + enhance=true + nofeed + default negative prompt; sticker
  too. Markedly better images. video/encode.bitrateFor bpp 0.09→0.13 (cap 16M) for sharper text.
- textToAudio: peak-normalise to −1 dBFS so narration loudness is consistent.

## Reliability + retrieval + SW (2026-08-10)
- promptedTools.parseToolCalls: repairJson (trailing commas, Python True/False/None, smart quotes)
  + <think> strip (reasoning-then-format) + FENCED captures the WHOLE fenced body (non-greedy to
  first } truncated nested JSON). Returns malformed:true so agent.harvestOrRepair() reprompts ONCE
  for valid JSON. promptedTools.test.js is the weak-model regression harness (13 cases).
- semantic.rrfFuse: Reciprocal Rank Fusion (1/(k+rank)) of BM25 + semantic order — rank-based, no
  score-scale tuning; replaces the linear blend. semanticRerank uses it. semantic.test.js covers it.
- sw.js: navigation preload enabled in activate + used via e.preloadResponse in the navigate
  handler (parallelises fetch with SW boot). HTML still network-first, assets still SWR.
- Perf: all heavy deps (pyodide/tesseract/transformers/kokoro/mp4-muxer/mermaid/pdfjs/webllm/prism)
  are lazy — only firebaseAuth is static and it defers the SDK. No bundle work needed.

## Skills + Workflows + variables (2026-08-10)
- Built-in preset skills (skills.js PRESET_SKILLS): Writing Polish, Deep Researcher, Dev Utilities,
  Data Analyst, Ethical Hacking & CTF (education/authorised only — refuses working malware/exploits),
  Vision & Scan. Merged into getSkills() at read time (builtin:true, not persisted); editing stores an
  override under the same id; deleting a preset adds it to `hidden_presets`. upsert/delete operate on
  storedSkills() only. skills.test.js asserts every preset tool is a real registered tool.
- Skills (skills.js): saveable bundles {id,name,description,system,tools[],starters[]} in db `skills`.
  Active skill (db `active_skill`) → agent appends skill.system to systemBase AND scopes tools via
  skillDisabledTools (allowlist → disable the rest). Export/import as JSON (parseSkill validates).
- Workflows (workflows.js): db `workflows`, ordered {steps:[{prompt}]}. runWorkflow is PURE
  orchestration (takes a runStep fn) so it's testable; App.runWorkflowNow sends each filled step
  and waits on loadingRef between turns (steps chain via conversation history + {{last}}).
- Variables (template.js): {{name}} placeholders shared by skills starters + workflow steps.
  extractVars/fillTemplate/userVars; workflow built-ins {{last}}/{{stepN}} excluded from prompts.
- UI: components/SkillsPanel.jsx (sidebar "Skills & workflows" + Ctrl+K). skills.test.js (8).

## Concurrent multi-agent execution (v3.13) — shared pool + same-agent instances
- agentPool.js: ONE global concurrency semaphore shared by EVERY sub-agent runner (spawn_agents,
  crew_orchestrator, map_reduce, best_of_n) so total concurrent LLM calls can't storm provider rate
  limits, no matter how many orchestrations run at once. Rolling window (a finished slot starts the
  next task immediately — NOT batch-of-N), order-preserving, error-isolating (a thrown worker yields
  {error} in its slot, never sinks the batch). Concurrency is AUTO by default = one slot per task
  ("as many as necessary"), capped by MAX_LIMIT=16 (providers 429 past that); an explicit
  chat_prefs.max_parallel_agents (clamp 1–16) overrides. getAgentConcurrency() returns null for auto;
  runAgentPool computes min(items.length, 16); configureConcurrency() wakes queued waiters when raised.
  runAgentPool(items, worker) is the entry point. DOM-free; agentPool.test.js (10) tracks peak
  concurrency, order, error isolation, clamp, slot-release-on-throw. _resetAgentPool for tests.
- spawnAgents.js: dropped the batch-of-3 loop (a slow sub-agent stalled the next batch) → runAgentPool.
  crewRunner.js: hierarchical Promise.all was UNCAPPED → runAgentPool. Both now share the global budget.
- Two new crew workflows = genuine same-agent concurrency: "map_reduce" (run one agent over items[] in
  parallel, then a reducer agent merges — fastest for per-item work) and "best_of_n" (race N=2–5
  instances of one generator on the SAME task, then a critic picks/merges the best — quality over
  tokens). crew_orchestrator schema/execute expose them (params items[], n).
- 6 new preset agents (agents.js), all referencing only real registered tools (agents.test asserts):
  Desktop Operator (clipboard/file_dialog/watch_folder/process_manager/terminal_run/system_state/
  screen_inspect — desktop tools, degrade gracefully on web), Data Engineer (ETL: code_execute/
  data_convert/data_stats/chart/fs_*), Knowledge Librarian (RAG over vault: doc_search/local_vault_
  search/memory/pdf_extract), Media Producer (image/video/audio/diagram), Weather & Geo Analyst
  (weather/air_quality/geocode/solar_times/earthquake/iss), and Orchestrator (manager: canDelegate,
  drives spawn_agents + crew concurrently). All added to General's subAgents list. Presets appear
  in AgentsPanel automatically (getAgents merges).
- Concurrency defaults to auto (as many as the batch needs, ≤16); chat_prefs.max_parallel_agents
  overrides. No UI slider yet — an optional PersonalisePanel control is the remaining follow-up.
  Total tests 490.

## Agents subsystem (2026-08-11) — all 4 agent types on one runAgent loop
- agents.js: registry {id,name,role,system,tools[],model?,provider?,canDelegate,subAgents[]} +
  PRESET_AGENTS (General/Researcher/Coder/Writer/Analyst/Planner). Merged at read like skills;
  getActiveAgent/setActiveAgent, getAgentById(id|role|name), agentDisabledTools (allowlist),
  export/parseAgent. Active agent = "named preset agent" picked per chat.
- agent.js: activeAgent (or agentOverride param) appends agentBlock to systemBase AND folds its
  tool allowlist into effectiveDisabled, parallel to activeSkill. api.streamMessage passes
  body.disabledTools (merged) + body.agent_override → runAgent.
- Sub-agent delegation: tools/spawnAgents.js `spawn_agents` tool (registered in tools/index.js).
  Runs specialists in capped-parallel (3) via lazy import('../api').streamMessage, each tool-scoped
  to its agent + spawn_agents disabled (no recursion). ToolResultCard renders results (Users icon).
- Autonomous: autonomousAgent.js. runAutonomousAgent is PURE (inject plan/runStep/review) →
  testable; autonomousAgent() wires it to streamMessage (Planner→execute each step w/ prior
  context→synthesize). parsePlan handles numbered/bulleted, caps 12 steps.
- UI: components/AgentsPanel.jsx (Agents tab: activate/CRUD/import-export; Autonomous tab: goal→
  live plan/step status→final report w/ CopyButton). App sidebar "Agents & autonomous" + Ctrl+K +
  showAgents. Proactive: features.proactiveAgent (default off) → quick-action row above composer
  (Summarize/Next steps/Find issues/Go deeper → send(prompt)).
- Tests: agents.test.js (10). Total 303.

## Companion OUT of the app (2026-08-24) — the floating window is the product
- electron/companionWindow.cjs loads the SAME renderer with ?companion=1 (main.jsx routes to
  CompanionView before App's hooks). Same origin = same IndexedDB, keys, agent and 65 tools.
  Ctrl+Shift+Space toggles it; it is frameless/transparent/alwaysOnTop 'floating' and visible
  on full-screen spaces.
- THE WATCHER WAS NOT GATED. CompanionView called shouldLook({ hash: null }) — watch.js's
  "no fingerprint available" branch — and noteLook() with no hash, so lastHash stayed null
  forever. Every one of the change-gating pieces (aHash, diffThreshold, hammingDistance) was
  dead code and an untouched desktop spent its whole 40/hour vision budget. companion/
  screenHash.js now hashes the captured frame (8x8 average hash → 64-char '0'/'1' string, the
  shape hammingDistance compares) and the tick captures locally FIRST, then only asks the model
  when the screen actually moved. A null hash still means "look" — unknown must not read as
  unchanged. screenHash.test.js (6, node env — the maths is pure).
- Window height is NOT persisted, by design: it follows the content (ResizeObserver on a
  wrapper INSIDE .companion-body — the body itself is flex-sized to the window, so observing
  it reports the height it already has). Only x/y/width are remembered (userData/
  companion-window.json), and a position on a display that no longer exists is discarded.
  minHeight 108 = bar + input: an idle companion is a strip, not a transparent slab parked
  over the user's other app swallowing their clicks.
- The header button used to shrink the MAIN window into an in-app panel, i.e. keep the user
  inside Yogatik — the opposite of the point. On desktop it toggles the real window
  (__YOGATIK_COMPANION_WIN__.toggle); the in-app panel is the web fallback. Tray gained a
  "Floating Companion" entry (the hotkey alone is not discoverable).
- Ctrl+Alt+C (act on my selection) relays to the COMPANION when it is visible, and only falls
  back to raising the main window otherwise. It fills the composer and focuses it — it does
  NOT auto-send: a stray selection must not become a paid turn, or an autopilot action.
- On the web CompanionView has no bridge: the pin/hide buttons are not rendered and the watch
  toggle is disabled with a desktop-only reason, instead of looking live and doing nothing.

## AI companion — real computer use (v3.15)
- electron/companionInput.cjs: precise cross-app input via PowerShell + user32 — SetCursorPos +
  mouse_event for click/double/right-click, pointer move, wheel scroll (notch*120), plus named key
  presses. Windows-only; other platforms return an honest "not supported". Registered in main.cjs
  (registerCompanionInput); bridge __YOGATIK_COMPANION_INPUT__.{move,click,scroll,key}.
- INJECTION-SAFE BY CONSTRUCTION (deliberately separate from desktop:executeAction): coordinates are
  coerced with Math.round(Number(v)), and buildSendKeys() assembles combos ONLY from fixed KEYS/MODS
  tables — any unknown token returns null and the call is refused, so no raw user/model string is ever
  interpolated into the shell. computerControl.test.js locks this (a quote-escape payload → null).
- tools/computerControl.js → `computer_control` (click/double_click/right_click/move/scroll/key),
  registered in tools/index.js. This is the gap desktop_action left: it could only type/hotkey/copy/
  launch, never click a coordinate. Aliases computer_use/click_screen/mouse_click/scroll/press_key now
  route here (type_text still → desktop_action). Schema tells the model to screen_inspect FIRST, then
  act, and to confirm before anything that submits/sends/deletes/purchases.
- Desktop Operator agent gained computer_control + a look-then-act system prompt.
- Tests: computerControl.test.js (9). Total 519.

## Reliability fixes (v3.10.0 release)
- agent.js NEVER ends a turn empty. The cap-hit path already forced a synthesis pass; the same failure
  with the cap NOT reached was unguarded, so a model that fell silent after tool results produced a
  blank bubble ("The model returned an empty response"). runAgent checks visibleAnswer(fullContent)
  — reasoning stripped, since <think> alone is not an answer — asks once for plain prose, then falls
  back to summarising the tool results it already has. forcedFinal is shared with the cap path so a
  model that only ever emits tool calls still costs at most initial + 8 rounds + 1.
- agent.js buildSystemPrompt now STATES THE RUNTIME (platformBlock()). It used to open with "access to
  powerful browser-native tools" on every surface and never consulted isDesktop, so the desktop build
  refused real work — "I have no shell/terminal access, no Node.js runtime" — while holding
  terminal_run, proc_start, fs_*, browser_control and computer_control. It was believing the prompt.
  Desktop: told it has a real shell/filesystem/browser and must ask for a working folder rather than
  declare a task impossible. Web: told desktop-only tools WILL REFUSE, so say so plainly.
- code_execute's description now says what it CANNOT do (no files, no OS commands, no servers) and
  names terminal_run/proc_start/fs_read instead; terminal_run says it WAITS and times out at 30s, so
  proc_start is the tool for dev servers. The model was reaching for the Pyodide sandbox for real work.
- video/timeline.js normalizeSpec REJECTS a scene with neither a type nor content. It used to default
  to an empty "text" scene, which rendered BLANK and reported success — a model guessing the shape got
  no signal and retried ten times with worse arguments before telling the user to run ffmpeg. The error
  names the invented field back ("Unknown field: elements") and shows a real scene.
- electron-updater moved devDependencies → dependencies. electron-builder never packages devDeps, so
  require('electron-updater') threw in every shipped build and updater.cjs's guard swallowed it:
  auto-update was a silent no-op in production while working in dev. Verify after packaging by parsing
  release-electron/win-unpacked/resources/app.asar — do NOT trust a truncated string scan of the file.
- .sidebar is overflow:hidden, and `.sidebar > .settings { flex-shrink: 0 }` (meant for the CLOSED
  toggle) pinned the OPEN panel at max-height 58vh. On a short window that plus the fixed chrome
  exceeded the sidebar, .sidebar-scroll collapsed to 0 and the footer's last child — Sign In — was
  clipped with no scrollbar to reach it. 58vh is now a cap, not a floor.

## e2e (npm run e2e) — Playwright, 4 smoke specs
- frontend/playwright.config.js + frontend/e2e/. The config BUILDS and serves dist/ itself, so CI runs
  nothing but `npm run e2e`. The job in ci.yml existed since before this and had NEVER passed: it
  installed a browser then ran a script that did not exist (no @playwright/test, no config, no specs).
- Covers what vitest structurally cannot: it mounts App under jsdom, so a broken build output, a chunk
  that 404s, or a module that only explodes in a real browser all pass there. Specs assert a keyless
  first run boots with no uncaught errors, the composer accepts input, the manifest is served, and a
  reload keeps the shell.
- Console-error assertions ignore favicon/service-worker/Firebase/WebGPU noise, which a keyless offline
  CI browser always emits — without that filter this becomes a flake generator, and the job is
  continue-on-error so a flake would rot silently.
- getByLabel('Message') matches THREE elements (routing toggle, textarea, send button). Use
  getByRole('textbox', { name: 'Message', exact: true }).

## Real browser control (v3.16) — desktop only
- THE GAP THIS FILLS: the web build cannot drive a page at all. Cross-origin iframes are refused by
  X-Frame-Options on most real sites and are opaque to the parent even when allowed, and there is no
  web API to screenshot or click inside another origin. web_extract/web_search/browser_autopilot only
  fetch static HTML. A WebContentsView is a genuine top-level browsing context, so the desktop app can.
- electron/browserTree.cjs is PURE (no require('electron'), so vitest reaches it under jsdom):
  walkerSource/refResolverSource (the injected page scripts), simplify/assignRefs/buildTree/formatTree,
  parseRef/isStaleRef. Same split as rootsCore.cjs — it is the only reason the tree logic is testable.
  Both injected sources interpolate ONLY Number()-coerced values, locked by a test like companionInput.
  browserTree.test.js = 25.
- electron/browserControl.cjs owns per-conversation sessions of WebContentsView tabs. ONE set of views,
  TWO surfaces: window mode parents them to a dedicated BrowserWindow (browserWindow.html tab strip +
  browserWindowPreload.cjs, a one-channel preload so the tab buttons actually do something),
  panel mode parents the SAME views to the main window. setMode RE-PARENTS; it never rebuilds, so tabs,
  cookies, history and refs survive a switch.
- A WebContentsView composites ABOVE the renderer DOM — z-index does not apply. BrowserPanel.jsx is
  therefore chrome around a hole: it reports its content rect via browser:set-bounds and main positions
  the view to match. Any overlay that should cover the panel would be painted UNDER it, so App computes
  browserOccluded (settingsOpen matters most — that drawer docks exactly where the panel does) and the
  panel calls browser:set-detached. Renderer-supplied BOUNDS are safe (a rectangle escapes nothing);
  this is NOT an exception to "the renderer never names a filesystem root".
- Refs are epoch-tagged (ref_<epoch>_<n>); the epoch bumps on main-frame navigation and on every read.
  The ref->element map lives in the PAGE (window.__yogatikRefs__); main stores only the epoch and
  re-measures at action time, so a moved-but-present element is still clicked correctly. A stale ref
  returns {stale:true} and is NEVER downgraded to a coordinate click — clicking the wrong element looks
  exactly like success, which is the whole failure the tree exists to prevent.
- Refs are numbered BEFORE truncation: a ref printed in the visible slice must resolve to the element
  the page registered, and the page registers every interactive node it saw, not just the printed ones.
- Sessions are keyed by conversationId (injected via getWorkspaceCtx, never a tool parameter) and
  destroyed on chat switch: an authenticated tab must not follow the user into an unrelated chat.
- navigate() resolves on a 30s timeout with whatever rendered rather than hanging the turn, and ignores
  did-fail-load code -3 (ERR_ABORTED), which same-page redirects raise routinely.
- Surface = the model's display param > chat_prefs.browser_display_mode > 'window'. PersonalisePanel
  sets the default; the panel pop-out button also writes it, so the user's last physical choice wins.
- browser_autopilot is NOT a browser: it is proxyFetch + regex tag-stripping (a web_extract duplicate).
  Its description used to claim it "navigates to a URL... like Strawberry Browser", which would make the
  model pick it over the real tool; it now says plainly that it does not run JavaScript. The browse/
  open_url/web_browse aliases point at browser_control, never at it.
- NEVER destroy a BrowserWindow while its WebContentsViews are still alive: the views are orphaned and
  closing one later crashes the process NATIVELY (uncatchable). setMode and the last-tab path therefore
  HIDE the window; destroySession is the only place it is destroyed, and it closes every view first.
- capturePage throws UnknownVizError on a view that has not been composited yet (cold capture right
  after the surface is created). screenshot() shows the surface, waits, and retries once.
- Tests: browserTree.test.js (25) + 6 browser cases in desktopCapabilities.test.js. The Electron glue
  is covered by `npm run test:browser` (electron/browserHarness/run.cjs, 28 checks) — a real Electron
  app driving real tabs against a local fixture, asserting that a click by ref FIRES the page handler,
  typed text lands in the real input, and a stale ref is refused. It caught both crashes above.

## MCP overhaul + plugin system (v3.15)
- mcp.js is now transport-aware: 'http' (Streamable HTTP/SSE via fetch, CORS-gated) OR 'stdio'
  (LOCAL servers spawned by the desktop app). transportRpc() routes; _servers/_sessions maps hold
  routing + session state. Reliability: isSessionError() + reconnect-once on 401/403/404/expired in
  callMcpTool/readMcpResource/getMcpPrompt; refreshMcpTools records per-server latencyMs + transport.
- MCP resources & prompts are now USABLE by the agent: tools/mcpResources.js → mcp_resource
  (list/read by uri) + mcp_prompt (list/get by name → messages), registered in tools/index.js. They
  were discovered before but unreachable from chat.
- Local/stdio MCP (desktop): electron/mcpStdio.cjs spawns a child process and speaks
  newline-delimited JSON-RPC over stdin/stdout (pending-by-id map, 30s timeout). preload bridge
  __YOGATIK_MCP_STDIO__.{start,rpc,notify,stop}; wired in main.cjs (registerMcpStdio + killAllMcpStdio).
  McpServers.jsx gained a desktop-only "Local (stdio) server" add row (command + args) + a 'local'
  badge + latency in status. Server entry shape: { id, name, transport:'stdio', command, args, env?, cwd? }.
- Plugin/extension system: plugins.js — installable JSON bundles that contribute agents / skills /
  mcpServers / starters. install/uninstall/enable/disable/import/export; parsePlugin validates;
  collectContributions (pure) gathers ENABLED plugins' items. NO arbitrary code runs — a plugin only
  composes existing sandboxed building blocks. Merged at READ time: agents.js getAgents +
  skills.js getSkills + mcp.js getMcpServers each dynamic-import plugins.js and fold in enabled
  contributions (tagged fromPlugin/_plugin, deduped by id). UI: components/PluginsManager.jsx in the
  Personalise panel (paste JSON / import file / toggle / export). db key 'plugins'.
- Tests: plugins.test.js (6), mcp.test.js (5). Total 510.

## Agent-layer additions (2026-08-10)
- MCP client (mcp.js): browser JSON-RPC over Streamable HTTP. connectMcpServer → initialize +
  notifications/initialized + tools/list; parseRpcBody handles application/json AND text/event-
  stream (last data: frame). Discovered tools cached in _tools, namespaced mcp__<server>__<tool>;
  getToolSchemas() appends getMcpSchemas(), executeTool() routes isMcpTool()→callMcpTool().
  Servers stored in db `mcp_servers`, managed in components/McpServers.jsx (Personalise panel),
  refreshed at App startup. LIMIT: server must send CORS headers (no stdio, no non-CORS hosts).
- code_execute is now a STATEFUL Pyodide kernel: globals/imports/installed pkgs persist across
  calls; loadPackagesFromImports auto-loads numpy/pandas; packages[] → micropip install;
  runPythonAsync (top-level await); reset:true clears globals; captures stdout+stderr.
- Plan mode (features.planMode, default off) + always-on self-check/reflection + confirm-before-
  irreversible guidance injected via buildSystemPrompt({planMode}). agent reads chat_prefs.
- memory `recall` does semantic re-rank when features.semanticSearch is on (semanticRerank over
  saved memories), else keyword; auto-recall via memoryBlock() unchanged.
- On-device Whisper STT (whisper.js, Xenova/whisper-base via transformers.js): stt falls back to
  MediaRecorder→blobToPcm(16k mono)→transcribe when Web Speech is absent (Firefox/Safari).

## Location (tools/geolocate.js)
- weather + air_quality resolve "current/here/my area" via the browser Geolocation API
  (GPS/Wi-Fi, enableHighAccuracy) — NEVER IP (coarse + wrong). getDeviceLocation() REJECTS on
  denial/timeout so the tool asks for a place name (needs_location:true) instead of silently
  reporting London (the old fallback). air_quality with no lat/lon also uses GPS.

## Auth on mobile
- authDomain = VITE_AUTH_DOMAIN || yogatik.firebaseapp.com. A same-origin handler
  (yogatik.web.app/__/auth/handler) is what makes signInWithRedirect survive Safari 16.1 /
  Chrome storage partitioning — cross-origin drops the credential, getRedirectResult -> null,
  user returns looking signed out. BUT the handler URL must be an Authorized redirect URI on
  the project's OAuth client; only firebaseapp.com is there by default, and .web.app without
  it = Error 400 redirect_uri_mismatch (hit on 2026-08-09). Add the URI in Cloud console
  -> Credentials -> Web client, THEN set VITE_AUTH_DOMAIN=yogatik.web.app. Popup works either
  way; only the redirect path (installed PWA / blocked popup) needs same-origin.
- REDIRECT on phones (UA or pointer:coarse) + installed PWA; popup only on desktop, and it
  races a 90s deadline. signInWithPopup on Android Chrome opens a TAB: the opener link is
  fragile and when it breaks the promise never settles — the button sat on "Signing in…"
  forever (verified 2026-08-09, redirect fixed it). AuthModal shows an escape hatch at 15s. `localStorage yogatik.authRedirect` marks a redirect in flight.
- checkRedirectResult falls back to auth.currentUser / one onAuthStateChanged (8s cap):
  the session often arrives via persistence with a null redirect result.
- checkGoogleRedirect returns early (no SDK fetch, ~170KB gz) when there is no pending
  redirect and no stored user. App must NOT swallow its error — a silent catch is why a
  failed sign-in looked like nothing happening.
- AuthModal: loginWithGoogle resolving null means "redirecting", not "failed". Calling
  onAuth(null)+onClose there wiped the session that was about to arrive.

## Image attachments (vision/attach.js) — v3.7
- Paste, drop or pick an image and it is SENT, not indexed: extractText found no text in a
  PNG so attaching a screenshot used to answer "File appears to be empty".
- prepareImage() downscales once: 1280px q0.9 JPEG for the model/OCR, 320px thumb for the
  stored message. A 6MB phone photo in every history row would fill IndexedDB in a day.
- agent.js userImage follows the same 3-tier policy as the camera: image_url part when
  modelCanSee, else describeWithoutModel (OCR for text, local VLM otherwise) injected as
  text, else an explicit "could not be read" note. Never silently dropped.
- The composer says "will be read on-device" BEFORE sending when getVisionStatus says the
  model is blind (cache + name heuristic only — no probe round-trip per keystroke).

## Durability + deploys (storage.js, pwa.js) — v3.7
- navigator.storage.persist() at startup: without it the whole origin is "best-effort" and
  the browser may evict every chat, document and key with no warning. Settings shows
  used/quota + protected|best-effort.
- sw.js must NOT skipWaiting() on install. Taking over mid-session leaves the open page
  pointing at the previous build's hashed chunks, so every later lazy import (Prism,
  Firebase, pdf.js, WebLLM) 404s. The new worker waits; the UI offers "Reload".
- retryImport() wraps lazy imports: retry once, then reload ONCE (sessionStorage guard, or a
  broken build becomes a reload loop). controllerchange -> single reload.

## Chat search (chatSearch.js) — v3.7
- Ctrl+K searched conversation TITLES only; message bodies were unreachable. Same BM25 index
  as documents, one hit per conversation, 60s cache invalidated by Dexie hooks.
- Multimodal turns are arrays: only their text parts are indexed.

## Render performance (2026-08-11)
- Streaming text lives in components/StreamingMessage.jsx (imperative ref, own rAF
  coalescing), NOT App state. While it was App state every frame of every answer
  re-rendered the whole shell — sidebar, composer and all 40 MessageBubbles, each
  re-running ReactMarkdown. App now only tracks `hasStreamText` (flips once/turn).
- MessageBubble is React.memo'd, but was passed inline arrows (`onOpenArtifact`,
  `onEdit`) and plain function consts, so memo NEVER held. Stable wrappers now read
  from a `latest` ref refreshed each render; MessageBubble takes `index` so onEdit
  can stay identity-stable. Do not reintroduce inline props here.
- Scroll-follow is imperative (`followStream` + `atBottomRef`); keying it on the
  streaming text would restore the re-render the split exists to remove.
- ToolResultCard is memo'd too — results are immutable once produced.
- THIS REGRESSED and was restored 2026-08-24: App had grown a `streamingMap` state
  written once per token (`pushStreamContent`), rendering ReactMarkdown inline in App —
  i.e. exactly the pre-split behaviour — and StreamingMessage.jsx had become an orphan.
  Now: `streamTextRef` (ref, per clientId) + `streamViewRef` + `hasStreamMap` (boolean
  state, flips once per turn). `setStreamText(clientId, txt)` is the ONE choke point.
  StreamingMessage takes `initialText` (read once at mount — the first token is always
  pushed BEFORE the component exists, keyed by clientId so a chat switch rehydrates) and
  `bare` (App draws the model badge / tool chips / trace chrome around it).
  Companion mode replaces the whole shell, so it keeps a plain `companionStreamText`
  state — there is no shell there to protect.
- buildGuards has a guard for it: App.jsx must import StreamingMessage and must contain
  no `setStreamingMap`.

## Reachability guard was substring-based (2026-08-24)
- buildGuards' orphan check asked `corpus.includes(name)`, which passes on ANY mention.
  Two finished components slipped through for weeks: StreamingMessage was "reached" by a
  code COMMENT in ActivityPanel.jsx, and Tour.jsx by the prose "Interactive Tour" in an
  AppOverviewModal button label. It matches a real import specifier now
  (`from '…/Name'`, `import('…/Name')`, `require('…/Name')`).
- Tour.jsx (guided walkthrough that highlights real DOM targets) was unreachable: the
  "Interactive Tour" button called onOpenDemo → DemoModal. Wired: App `showTour` state,
  command palette "Guided tour of the interface", a separate onOpenTour button in
  AppOverviewModal (the demo button is now "Quick Demo"), and showTour added to
  browserOccluded + isAnyModalOpen. Its onComplete fired on OPEN (marking the tour done
  before step 1); it fires on finish now.

## Mobile
- Prism/react-syntax-highlighter (616KB / 225KB gz) is React.lazy inside CodeBlock, with a
  plain <pre> fallback — most chats have no code block and phones paid for it on first paint.
- viewport: no user-scalable=no (a11y), plus interactive-widget=resizes-content so the
  Android keyboard resizes the layout instead of covering the composer. dvh + safe-area
  insets already handled in styles.css.

## Persistence
- Conversations/messages saved to IndexedDB as they stream (createConversation/saveMessage
  in api.js). Local-device storage — NOT gated on sign-in.
- Regenerate rewinds via trimConversationFrom(id, index) then re-sends the last user msg.
- Context window: budget-based (24k chars / 20 turns), keeps recent msgs whole.
  Never blanket-truncate — that shredded inlined docs on turn 2.
- Message list renders last 40 turns; "Load earlier" pages back.

## Provider / tools config
- Active provider+model persisted in IndexedDB (`provider`, `model_<id>`) — agent reads
  these, so React-only state meant every msg went to the stored default (was 'nvidia').
- Default when unset: first provider with a key (or noKey) that doesn't need a proxy, else
  groq. getActiveProvider returned 'local' — a fresh install pointed at a 750MB download
  with tools+web force-disabled. local is never a default.
- getSetting(key, fallback) returns the fallback for a row holding null too (false/0 kept):
  `getSetting(k, '')` yielding null put null into controlled inputs.
- testProvider does a REAL 1-token chatComplete through the same path chat uses
  (incl. proxy) and stores `status_<id>`; UI shows dot + latency + friendly error.
- Per-tool on/off in `disabled_tools` (stores DISABLED names so new tools default on);
  getToolSchemas(disabled) filters what the model ever sees.

## Model selection (v3.1)
- ModelPicker also sits in the COMPOSER (compact variant: prefix = provider name, panel opens
  UPWARDS, fixed full-width sheet under 768px). Which model answers is a per-message choice;
  it was only reachable inside the settings drawer.
- Editing an earlier turn BRANCHES (api.branchConversation): messages before it are copied to
  a new conversation and the original is left intact. Only the last turn rewinds in place —
  there is nothing after it to lose.
- `status_<provider>::<model>` — per-MODEL probe result (success, latencyMs, at). 30 min TTL.
- `autoPickModel(p)` probes top-4 candidates in parallel (name heuristics: flash/nano/8b up,
  70b/large/ultra down), picks fastest that answers. Runs automatically after a key verifies.
- `routeModel(p, msg)` per-message routing when `chat_prefs.auto_route`: classifyQuery →
  code|reasoning|writing|quick, picks fastest MEASURED-OK model in that class. Never routes
  to an unmeasured model (that's how you land on a 5-minute one).
- `getFallbackChain(p)` — on 429/5xx/timeout the chat retries the next provider that has a key
  and needs no proxy. Only before any token is shown (never splices two models' output).
- Model probes use timeoutMs 20s + retries 0 — chat budget (120s x3) made "Verifying…" hang.
- Providers retire models without notice: 410 → `pruneRetiredModel` drops it from cache +
  clears selection (deepseek-v4-flash EOL'd mid-session on 2026-08-07).

## Keys & backup
- Key UI shows masked value (first4…last4) + where it lives (device / cloud).
- Sync is automatic and unconditional once signed in: `accountSecret(uid)` seals every key
  (AES-GCM), saveProviderApiKey pushes, sign-in/redirect-return runs syncCloudKeys() both
  ways. Nothing to type — a passphrase nobody remembers protects a key nobody can use.
  Encryption at rest, NOT zero knowledge; Firestore rules scope the doc to its owner uid.
- getUserApiKeys(...secrets) tries each: an entry sealed under an older scheme still opens,
  and one that cannot is skipped (never surfaced as garbage) then healed on the next push.
- `downloadBackup()` / `restoreBackup(file, 'merge'|'replace')` — chats + docs + settings.
  API keys are excluded from backup files by design.

## Prompted tool calling (promptedTools.js)
- Models that 400 on a `tools` array (many NVIDIA free-tier, base models) don't lose tools:
  llm.js fires `onToolsRejected` -> agent switches toolMode 'native'->'prompted', appends
  compact tool list to the system prompt, asks for ```json {"tool_calls":[...]}```.
- Prompted mode buffers tokens (the reply may BE a call) and replays results as plain
  assistant/user turns (`TOOL_RESULTS ...`) — no tool_calls/role:'tool'.
- Mode cached in `toolmode_<provider>::<model>` so the rejected request is paid once.
- onToolsRejected MUST still fire onDone, else the agent's promise hangs.

## Vision — provider-independent (vision/, tools/see.js)
- Three paths, tried in order: (1) active model if it takes images, (2) on-device VLM,
  (3) honest error. Vision is an app capability, not one vendor's feature.
- capability.js: name heuristic (YES/NO regex, NO wins) + real 1x1-pixel probe via
  chatComplete; verdict cached `vision_<p>::<m>` 7d. Only a 400 is evidence of "cannot
  see" — 429/network must NOT poison the cache.
- localVLM.js: SmolVLM-256M/500M ONNX via Transformers.js @esm.run, WebGPU (wasm+q8
  fallback). ~230MB, consent-gated download. Zero key, offline after first load.
- Consent is REAL now: loadLocalVLM throws unless features.localVision is on (App mirrors
  it via setLocalVLMConsent) or the weights are already cached. The blind-model fallback
  used to pull 230MB with nothing on screen saying so.
- tools/see.js: one shared camera (2nd getUserMedia fails on phones), 60s idle release.
  Returns `{image}` when the model can see (agent attaches it as an image_url part) or
  `{observation}` from the local VLM when it cannot.
- agent.js: `stripImage()` before JSON.stringify (else ~50KB base64 becomes prompt text);
  `pruneOldImages()` keeps 1 frame (~1.1k tokens each); windowHistory must NOT stringify
  array content.

## Vision policy (vision/source.js) — v3.3
- ONE shared stream: Live registers its camera/screen via setSharedVisualSource; `see`
  and the vision panel borrow it. A 2nd getUserMedia fails on phones (see used to be
  dead inside a call).
- Frames are sent only when isVisualQuestion(utterance) — a frame is ~1.1k tokens and
  cascade used to attach one to EVERY turn.
- captureProfile(): text questions 1280px/q0.92/centre-crop 0.75; scenes 768/q0.7.
  768@0.7 cannot read a serial number.
- needsMotion() -> two frames (previousFrame() + now); agent flattens result.images.
- Fallback chain when the model is blind: OCR (Tesseract) for text questions, on-device
  VLM otherwise, each falling back to the other. describeWithoutModel().
- pendingImage is consumed once — leaving it set made every later look answer from the
  same stale picture.

## Response Styles + Chat export (v3.8)
- styles.js: BUILT_IN_STYLES (Default/Concise/Formal/Explanatory/ELI5/Bullet) + custom, one active
  (db active_style, default 'default'). getActiveStyleBlock() appends "RESPONSE STYLE — …" to agent
  systemBase (after skillBlock, before memoryBlock). UI: <select className=style-select> in the sidebar
  Response section; App state styles/activeStyleId + chooseStyle.
- chatExport.js (pure builders, tested): conversationToMarkdown / conversationToHtml (self-contained,
  minimal md→html, escapes, code blocks, drops system). downloadChat(conv,'md'|'html'|'pdf') — pdf via
  html2pdf.js @esm.run. Toolbar Download button → .export-menu dropdown; command-palette md/html/pdf.
- Live camera honesty (cascade persona): vision models are told frames are attached; NON-vision models
  are told they cannot see, a "[Live view (described on-device): …]" text is inserted when relevant, and
  to NEVER invent/fetch image URLs (was hallucinating example.com/*.jpg on gpt-oss-20b). describeIfVisual
  supplies the on-device OCR/VLM description. Text-only models still can't see natively — use a vision model.

## Live mode — tools + media + universal vision (v3.8)
- Live cascade already runs the full agent (toolsEnabled). Tool RESULTS now render richly in the
  transcript panel: LiveView passes the raw result object to <ToolResultCard tool result/> (was a
  120-char string), so generated images/videos/audio/files/code output appear in-call. A result with
  media (image_url/url/video_url/media_id/exported_text/images) auto-opens the transcript panel.
- Non-vision models now SEE a shared camera/screen: cascade.describeIfVisual() — when !modelCanSee and
  isVisualQuestion and a source is live, grabs a frame and describeWithoutModel() (OCR/on-device VLM),
  injecting "[Live view (described on-device): …]" into the turn. Vision models still get real image
  parts via visualParts(). Persona tells the model it can generate media/run code/tests + read the view.

## Live cascade upgrades (v3.14) — any-model vision, hands-free, latency, noise
- Vision for ANY model (headline): createCascadeSession takes visionMode 'auto'|'always'|'off'.
  visualParts (vision models) AND describeIfVisual (non-vision → on-device OCR/VLM injected as
  "[Live view (described on-device): …]") both honour it: 'always' looks EVERY turn while a
  camera/screen is live, so even a text-only model "sees" the feed continuously; 'auto' looks on a
  visual question or an auto-scan scene change. LiveView has a watch toggle (Eye/EyeOff, cycles
  auto↔always) + setVisionMode()/getVisionMode(); awareness badge shows "Watching"/"Can see
  (on-device)". Default persists via the liveWatchAlways feature toggle (features.js → Personalise
  panel, default off).
- Adaptive endpointing: endpointDelay(text) replaces the fixed 700ms — a finished-sounding sentence
  commits at 350ms, a long phrase 450ms, a short fragment 850ms. Lower perceived latency, no chop.
- Hands-free voice commands (voiceCommands, default on): parseVoiceCommand recognises WHOLE-utterance
  controls (stop/pause/resume/repeat/faster/slower/"speak in <lang>"), handled locally, never sent to
  the model. Commands bypass the wake word so "stop" always interrupts. Wake word (wakeWord, opt-in):
  stripWakeWord gates content — an utterance must start with the phrase; it's stripped, the rest runs.
- Reliability: shouldRejectNoise drops short low-confidence finals (TV/chatter) but treats Chrome's
  confidence-0 finals as unknown (never dropped). trimHistoryPairs keeps the context window aligned to
  a user turn (no bare leading assistant that some providers reject).
- Session setters for mid-call UI: setVisionMode/setWakeWord/setRate/setLang (rate/lang via
  speaker.configure + recog.lang). Persona now nudges parallel delegation (spawn_agents/crew).
- Pure helpers exported + tested in cascade.test.js (12 new: endpoint/commands/wake/noise/pairs).

## Live mode — face-to-face (live/)
- Two engines, one UI (components/LiveView.jsx picks via `engine`):
  **gemini** — realtime WSS, native audio, ~0.8s, server-side barge-in.
  **cascade** (live/cascade.js) — Web Speech recognition -> runAgent -> speechSynthesis
  for ANY other provider incl. on-device. ~1.5-2.5s; barge-in is manual (cancel + abort).
  Sentence-chunked TTS, else nothing is spoken until the whole reply lands.
  recog.onend MUST restart it — it self-stops on silence and the call goes deaf.
  Restart is backed off + skipped on not-allowed (a denied mic spun forever), and
  re-armed on visibilitychange (backgrounding kills it).
- cascade turn queue: two finals landing during a turn used to run two agents at once.
  enqueue() serialises; queued utterances merge.
- Endpointing fires ~700ms after interim speech stops — Chrome sits on isFinal ~1s.
- First TTS chunk breaks at a clause, later chunks at sentences (~400ms sooner to speak).
- Echo guard (isEcho, exported + tested): the mic hears speechSynthesis; treating that
  as barge-in made the model cut itself off in a loop.
- getLiveConfig() picks: gemini key -> realtime, else active provider -> cascade.
- live/voice.js: ONE speaker interface, two engines. `system` = speechSynthesis (instant,
  robotic). `neural` = Kokoro on-device (video/speech.js) through an AudioContext.
  Neural is the DEFAULT (chat_prefs.live_voice_engine='system' opts out); voice id in
  live_voice_local (live_voice is Gemini's namespace, they do not overlap).
  Cold start (~90MB): speaks on the system voice and upgrades mid-call. Warm
  (localStorage flag yogatik.narrator.cached): the first clause WAITS up to 6s so the
  robot is never heard at all. Blocking a cold first answer on 90MB would be worse.
- requestTTS / the `tts` tool use the same shared speaker, split into ~200-char sentence
  chunks so playback starts immediately. stopTTS cancels it.
- speak() queues: clauses must be heard in order, never overlapped. cancel() rebuilds the
  chain so the old .finally cannot resurrect `speaking` on the next turn.
- spokenAloud is recorded BEFORE playback — the echo guard needs to know what the room is
  about to hear, not what it finished hearing.
- Cascade carries its own fallback chain (getLiveConfig.fallbacks): a 429 ten minutes into
  a call switches provider and retries the utterance, but only if no token was spoken yet.
- lang follows navigator.language (defaultLang()), not a hardcoded en-US.
- protocol.js: pure wire layer (setup/audio/video/toolResponse builders, decodeServerMessage).
  audio.js: AudioWorklet capture @16k PCM16 -> base64; 24k scheduled playback queue + flush.
  video.js: JPEG <=1fps, 768px, aHash-gated (skips unchanged scenes; forced frame every 5s).
  session.js: socket + mic + cam + tool bridge. components/LiveView.jsx: full-screen call UI.
- Barge-in is server-side (START_OF_ACTIVITY_INTERRUPTS) -> `interrupted` flushes playback.
  Do NOT build STT->LLM->TTS; it cannot interrupt and lands ~2.5s vs ~0.8s.
- echoCancellation is mandatory: without it the session hears its own voice and loops.
- Gemini 400s on JSON-Schema extras (additionalProperties/$schema/default/title) and on
  `parameters` with zero properties — toGeminiTools() strips them, recursively.
- goAway/close -> reconnect on `sessionResumptionUpdate.newHandle`; contextWindowCompression
  slidingWindow keeps sessions open-ended.
- Transcripts (input+output) saved to their own conversation, `Live — <time>`.
- Entry: composer "Live" button, `/?live=1`, PWA shortcut. Never streams video to a
  chat-completions model — 1 frame ~1.1k tokens.
- No face recognition by design: identity claims are prompted against; the model describes
  people, never names them (BIPA/GDPR Art.9 — a bystander cannot consent via the T&C).

## Video (video/, tools/videoRender.js) — v3.4
- `video_render`: real MP4 made on-device. No key, no backend, no cost.
- timeline.js is PURE (spec -> frames/scene/progress) => unit-testable + offline encode:
  timestamps are computed, never sampled from the clock.
- encode.js: WebCodecs VideoEncoder + mp4-muxer@5.2.2 (esm.run, not bundled). Codec is
  probed via isConfigSupported over an avc1 candidate list — hardware refuses silently.
  Backpressure at encodeQueueSize>8 or the GPU runs out of memory on long videos.
  Fallback MediaRecorder/WebM is REALTIME (60s video = 60s) — WebCodecs is the fast path.
- Dimensions forced even (H.264 chroma), fps 12-60, 180s cap, 40 scenes.
- Images: crossOrigin='anonymous' first, else re-fetch through the proxy as a blob.
  A tainted canvas kills the encode with an opaque SecurityError.
- Scene types: title/outro, text (staggered bullets), image (Ken Burns), bars (animated).

## Narration (video/speech.js, video/audio.js) — v3.5
- speechSynthesis is a DEAD END for video: it writes to the audio device and exposes no
  MediaStream/buffer. You cannot mux a sound you are not allowed to hold.
- Narrator = Kokoro-82M ONNX via kokoro-js@1.2.1 (esm.run), WebGPU fp32 / wasm q8, ~90MB
  cached after first render. Returns Float32 PCM @24k — exactly what AudioEncoder wants.
- Scene durations are decided BY the voice: synthesize first, then planNarration() grows
  each scene to lead+speech+tail (never shrinks it). Fixed durations cut lines in half.
- Audio is encoded to chunks BEFORE the muxer is constructed: mp4-muxer must be told up
  front whether a track exists, and a declared-but-empty track = corrupt MP4. So a TTS
  failure degrades to a silent video, never a broken one.
- AAC (mp4a.40.2) first, Opus fallback — Opus-in-MP4 is legal but players still refuse it.
- Burnt-in subtitles (captionCues, weighted by sentence length): the MP4 has no subtitle
  track, and a spoken video is useless muted.
- audio.js is pure Float32 maths (no AudioContext) => unit-testable; all clips share one
  sample rate so mixing is a copy at an offset, no resampling.
- MediaRecorder fallback plays the PCM through a MediaStreamDestination (realtime anyway).
- Output is a blob: URL (dies on reload) AND the bytes go to Dexie `media` (db v4,
  newest 10 kept). The card re-creates a URL from media_id, so videos survive a refresh.
- agent.js strips video_url from the model's view: given a blob: URL the model pastes it
  into the reply as a link that is dead one refresh later.
- NEVER setTimeout inside the encode loop: background tabs clamp timers to ~1/s, which
  turned a 5s render into 268s when the user switched tabs. yieldToLoop() uses
  MessageChannel (unthrottled). 720p30, 150 frames ≈ 2.1s measured.
- Result carries `timings: {narration_ms, images_ms, encode_ms}` — the phases have wildly
  different costs and guessing which one is slow wastes an afternoon.

## Personalise (features.js, components/PersonalisePanel.jsx) — v3.6
- ONE registry (FEATURES) of optional UI + the small preferences. resolveFeatures()
  merges stored over defaults, so a NEW feature ships on and an old opt-out survives.
- Only an explicit `false` disables — undefined must not read as off.
- Off = not rendered (and haptics/captions not fired), never CSS-hidden.
- Voice picker splits male/female and keeps the list POSITION when switching sides.
- autoScan defaults OFF: it spends tokens. Its tick calls session.watch(), which grabs
  a frame only if the scene CHANGED (grab(force=false)) and attaches it to the next
  turn — no spontaneous speech, no per-second frame cost.
- Prefs live in chat_prefs; App holds one `prefs` object + updatePref(key, value).

## Stop / abort
- llm.js swallowed AbortError without firing onDone -> processStream never settled and
  the whole turn (plus the UI's loading state) hung. AbortError MUST call onDone.
- agent.js checks signal.aborted between rounds and RACES the tool round against abort:
  a 40s deep_research used to run to completion after Stop was pressed.
- executeTool(name, args, {signal}) sets an ambient signal (tools/http.js) so proxyFetch
  cancels the tool's own network calls. Ambient is skipped when 2 channels run at once
  (compare mode) — better to lose cancellation than cancel the other channel.
- Partial text is kept and rendered with `_[stopped]_` (App.jsx onDone meta.aborted).

## Test runner (scripts/run-vitest.mjs)
- Wrapper exists because vitest CLI has no --configLoader; config is IMPORTED and passed
  as **viteOverrides**. `test:` inside the CLI-options arg is IGNORED — the old inline copy
  meant every test ran in the `node` env with NO setupFiles (no DOMParser).
- It must exit(1) on failures: startVitest alone leaves code 0, so deploy.bat's test gate
  was decorative.
- Passes through filters + `--watch`.

## Tests (npm test — 1152)
- smoke.test.jsx mounts <App/> in jsdom with ./api stubbed: lint cannot catch a component
  that THROWS on first render. Config include covers *.test.{js,jsx}; test-setup.js stubs
  scrollIntoView/scrollTo/matchMedia (jsdom has none, all are called on mount).
  A vi.mock factory must not return a Proxy — vitest reads `then` on it and `await import`
  then waits on a promise that never settles (looks exactly like a hang in App).
- streaming render (6), retrieval (18), agent loop (32, incl. 3 stop paths), live protocol (19), vision heuristic (4), vision policy (8),
  cascade echo guard (3), live voice queue (7), tools (26), relay policy (8), zero-key boot (3),
  chat search (9), chunk-reload guard (4), image attach routing (6), agent image policy (4),
  key sync (5), search parsers (7), routing (11), crypto (11), migration (9), features (5), video timeline (13), video audio+speech (12),
  workspace roots (29: id hashing, chat→project→default resolution, containment incl. symlink escape
  on a not-yet-existing target, state transforms, legacy migration), desktop bridge (12)
- web_search is a METASEARCH: ddg+marginalia+wikipedia(+brave) merged. Tests must stub
  proxyJson too, or Wikipedia answers every query and "no results" can never happen.
  wikipediaSearch went through bare fetch — no timeout/retry, unmockable; now proxyJson.
- One engine dying returns `degraded: [...]`; only all-engines-failed returns `error`.
- Run with pool:forks singleFork — parallel jsdom envs starve the runner. That shares the
  module registry, so migration.test injects Dexie.dependencies.indexedDB itself: Dexie
  reads indexedDB once at import, and whichever file imported it first decides.
- `npm run lint` uses react/jsx-no-undef: plain no-undef does NOT catch `<Foo/>` with no
  import, which is how a ReactMarkdown crash reached production.

## v3.2 — on-device + workspace
- localLLM.js: WebLLM via esm.run CDN (no npm dep). Models: Llama-3.2-1B/3B, Qwen2.5-1.5B.
  Weights (~750MB+) download ONLY after explicit consent in LocalModelPanel. Cached by the
  browser => later sessions are offline. Provider id `local` (isLocal/noKey flags).
  Tools + web are force-disabled for local: 1B models call tools badly.
- Zero-key start (App): no stored provider AND no key AND WebGPU -> provider='local' and the
  SMALLEST model (Qwen 0.5B, ~350MB) downloads itself with a progress card in the empty state.
  A stored provider or any key wins — never override a real choice. 3 tests in smoke.test.jsx.
- Never in the fallback chain and never auto-selected as a FALLBACK (a 750MB download is not a
  fallback for a 429).
  LocalModelPanel is mounted (hidden) with the settings sidebar, so its mount effect may
  only PROBE — it used to "auto-preload", i.e. fetch 350MB on page load, and App separately
  force-set provider='local' whenever WebGPU existed. Both removed.
- streamLocal holds the engine it loaded; reading module-level _engine after an await let a
  concurrent model switch null it mid-turn. Loading a 2nd model unloads the 1st (GPU OOM).
- Projects (db v3): conversations + documents carry projectId; doc_search scopes to the
  active project so a work PDF can't answer inside a personal project.
- Compare mode revives ArenaView: one prompt, two models, channels `compare-A`/`compare-B`.
- Command palette Ctrl+K (fuzzy subsequence match over commands/models/chats).
- PWA share_target: Android share sheet -> query params consumed on startup; app shortcuts.
- Usage meter: `usage_<YYYY-MM-DD>` per provider; estimated from chars (~4/token), labelled
  approximate because streamed responses rarely carry usage data.
- Terms gate: TERMS_VERSION in TermsModal; sign-in blocked until accepted (scroll + tick).

## Tool status + standardised errors (v3.9)
- toolStatus.js: ephemeral pub/sub (beginTool/settleTool/subscribeToolStatus). DOM-free, testable.
  Failure = falsy | success:false | error (matches ToolResultCard). Forwards to errorLog + diagnoseError.
  Auto-prunes records (err 8s, ok 1.2s). isLongRunning >4s. _resetToolStatus for tests.
- agent.js round loop emits beginTool on start, settleTool on result (parallel to onToolStart/onToolResult).
- components/ToolStatusPanel.jsx: live ready/loading/failed, elapsed timer, Retry+Dismiss, aria-live. Idle=null.
  Mounted above composer in App.jsx; Retry → send().
- ToolResultCard error branch → ToolErrorCard: diagnoseError title+suggestion + collapsible View details + Copy.
- Tests: toolStatus.test.js (7). Total 322.

## Security + perf + sync + a11y batch (v3.10)
- cors-proxy/worker.js: credential headers (authorization/x-api-key/x-subscription-token) only forwarded to
  DEFAULT_CREDENTIALED_HOSTS (env.CREDENTIALED_HOSTS override); other HTTPS targets relayed WITHOUT creds.
  Coarse per-origin rate limit (RL_MAX 120/RL_WINDOW_MS), host-only console audit log.
- firebase.json: CSP-Report-Only (report-first; promote to CSP once clean) + X-Content-Type-Options,
  Referrer-Policy, X-Frame-Options on **.
- sanitize.js: sanitizeHtml/sanitizeSvg (DOMParser-based, no DOMPurify dep). ToolResultCard diagram uses it;
  old inline sanitizeDiagramSvg removed.
- crypto.js: model is ACCOUNT-derived (yogatik.account.v1.<uid>), NOT zero-knowledge — docstring fixed,
  params renamed passphrase→secret. KEY_STORAGE_DISCLOSURE shown in ProviderModal key field.
- computeWorker.js + workers/compute.worker.js: runInWorker(task,payload), lazy worker, idle-terminate 30s,
  inline fallback (TASKS shared) when Worker unavailable. Scaffold — tools opt in.
- syncMerge.js: conversationSignature (syncId else title+createdAt+first-msg) + selectIncoming (LWW: newer AND
  longer). api.pullCloudData('merge') filters incoming via selectIncoming BEFORE importAll — fixes the
  round-trip duplication (importAll always add()s). Preserves the yogatik-backup envelope.
- downloadConsent.js: ensureDownloadConsent(feature,{label,sizeMb}) size-labelled, remembered per feature;
  setConsentPrompter lets App supply a themed modal (default window.confirm).
- storage.js: shouldNudgeBackup({persisted,conversationCount,lastNudgeAt,lastBackupAt}) pure; markBackedUp/
  markBackupNudged/checkBackupNudge. No nudge when persisted.
- analytics.js: OPT-IN, hard no-op until enableAnalytics(sink{capture}). SAFE_KEYS allowlist drops any other
  prop (no content leak). latencyBucket coarse. toolStatus.settleTool → trackToolSettled.
- A11yAnnouncer.jsx: single polite aria-live; announce('Response ready') from App onDone (not per token).
  StreamingMessage container aria-busy. .sr-only utility in styles.css.
- Tests: syncMerge.test.js (6) + enhancements.test.js (13) + toolStatus.test.js (7). Total ~341.

## Companion Phase-0: safety + memory + measurement (v3.11)
- safety.js: pure on-device screen. assessSafety(text) → {crisis:{type,resource}|null,
  boundary:{domain,directive}|null, systemDirective, hasConcern}. Crisis = self_harm/
  eating_disorder/violence (high-recall regex) → resource (988 / Nat. Alliance for Eating
  Disorders 1-866-662-1235 / emergency). Boundary = medical/legal/financial → role-clarity.
  crisisResourceCard(v) for UI. agent.runAgent screens userMessage, appends systemDirective
  to systemBase, fires onSafety(verdict, card). Never blocks a turn (try/caught).
- memory4.js: four stores episodic/semantic/procedural/emotional. recencyWeight (half-life
  30/∞/90/14 days), salience (importance+refCount+recency), relevance (keyword overlap),
  selectForPrompt (relevance-gated, salience-ranked, perStoreCap), memoryPromptBlock,
  dueMilestones (anniversaries, importance≥0.6). Emotional store local-only. Pure; Dexie
  tables mirror shape (not yet added — memory tool still flat until migration).
- telemetry.js: startTurn({provider,model}) → {firstToken(),done()}. TTFB+total rings (200),
  percentile() nearest-rank, latencyReport() p50/p95. done() → analytics track('turn_latency').
  Wired in App.jsx main streaming path (_latTurn). _resetTelemetry for tests.
- evalHarness.js: GOLDEN_SET (crisis/boundary/quality/injection). gradeResponse (expect/reject/
  mustReferResource), gradeSafetyScreen (assessSafety regression), runEval(respond), 
  runSafetyScreenEval() model-free. summarize → {total,passed,passRate,byCategory,failures}.
- Tests: companion.test.js (18). Total ~359. Process items (interviews, hiring, A/B backend) NOT code.

## Memory persistence + observability (v3.11.1)
- db.js v5: `memories` table (++id, store, at). Flat user_memory blob retained.
- memory4.js persistence layer (lazy db import so pure tests stay db-free): remember (dedupe→
  refCount/importance bump), allMemories(store?), forget(id), recallForPrompt (usage bump),
  memoryBlockFromStores(query), salience prune at CAP 500.
- tools/memory.js save → also remember({store,text,importance}); schema adds store enum + importance.
- agent.memoryBlock(): structured stores (memoryBlockFromStores) supersede flat block when non-empty.
- DiagnosticsModal: Performance & Safety card — telemetry.latencyReport (TTFB/total P50/P95, green
  when total P95<2s) + evalHarness.runSafetyScreenEval golden-set pass rate.

## Phase 1/2: adaptation + experiments + transparency + onboarding (v3.12)
- adaptation.js: deriveProcedural/aggregateSignals (pure; MIN_SAMPLES=4 evidence gate) → procedural
  prefs from message length / tool usage / style / persona. recordTurn buffers (CAPTURE_EVERY=8) →
  captureBehaviour writes to procedural store. Wired in App main onDone (recordTurn).
- experiments.js: hashString (FNV-1a), assignVariant (deterministic weighted, stable per unit),
  getVariant (flag-gated, one-time exposure → analytics), trackOutcome. unitId in localStorage.
- analyticsSink.js: createPostHogSink({host,projectKey}) batched fetch sink; initAnalyticsFromSettings
  reads chat_prefs.analytics_enabled + analytics_config → enableAnalytics. No SDK dep.
- MessageBubble.explainReply(): "why did I say this" line in activity-trace (tools/sources/model).
- components/DataDashboard.jsx: four-store memory view, per-item/per-store delete, export (downloadBackup).
  Opened from storage-details button. components/OnboardingModal.jsx: 3-step first-run (persona/style/
  boundary/privacy) → seeds procedural memory + setActiveTemplate; gated by localStorage yogatik_onboarded.
- Tests: phase1.test.js (13). Total ~376. Premium billing + marketplace need backend (not built).
