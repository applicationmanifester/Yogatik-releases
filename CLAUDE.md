# Yogatik — Project Knowledge

## Architecture (v3 — Serverless + edge proxy)
- **Frontend-only**: React 18 + Vite (PWA, mobile-first, zero backend)
- **DB**: IndexedDB via Dexie (conversations, settings, API keys — all in browser)
- **LLM**: Direct API calls to Groq/OpenRouter/OpenAI from browser
- **Agent**: OpenAI function-calling loop — LLM decides tools → browser executes → results → final answer
- **Tools**: 28 browser-native tools (Pyodide, Tesseract.js, Mermaid, Web Speech API, Canvas, etc.)
- **PWA**: Service worker, manifest, installable on mobile + desktop
- **Proxy**: Cloudflare Worker (cors-proxy/) for non-CORS providers (NVIDIA only). Vite plugin serves /api/llm-proxy in dev. Client picks via VITE_LLM_PROXY_BASE.
- **Auth**: Firebase (lazy-loaded). API keys sync to Firestore AES-GCM encrypted (crypto.js, PBKDF2 passphrase, in-memory only). No passphrase = local-only.
- **Deploy**: Firebase Hosting. `deploy-proxy.bat` (worker) then `deploy.bat` (build + hosting + rules)

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
│   │   ├── tools/             # 28 browser-native tools
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
│   │   │   └── ... (28 total)
│   │   └── components/
│   │       ├── CodeBlock.jsx, ArtifactPanel.jsx, ArenaView.jsx
│   │       ├── ErrorBoundary.jsx, YogatikLogo.jsx
│   │       ├── ToolResultCard.jsx (+ TOOL_ICONS), MessageBubble.jsx
│   │       └── AuthModal.jsx, ProviderModal.jsx, AdModal.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── cors-proxy/            # Cloudflare Worker (wrangler deploy)
└── CLAUDE.md
```

## Agent Pipeline (browser-native)
User message → LLM (function calling) → tools run **in parallel** per round → LLM (with results) → final response
- Max 5 tool rounds; system prompt injects today's date + research rules
- Sliding window context (20 msgs); sources deduped & surfaced via onSources
- webEnabled=false → prompt tells model web is off (UI toggle: Web Research)

## Retrieval (RAG replacement)
- retrieval.js: BM25 + light stemmer + boundary-aware chunking (1200/200). No embeddings —
  no 25MB model download; beats vectors on small keyword-y corpora, runs in µs
- Upload → extractText (pdf.js / text) → chunk → Dexie `documents` table
- ≤12k chars: injected inline into the prompt. >12k: doc_search retrieves top-k passages
- Verified 5/5 on a synthetic handbook Q&A set

## LLM Providers (browser-direct)
- **groq**: Free tier, blazing fast — console.groq.com
- **openrouter**: 100+ models, pay-per-token — openrouter.ai
- **openai**: GPT-4o etc — platform.openai.com
- API key stored in IndexedDB (never leaves browser)

## Browser-Native Tools (32 — all free, no backend)
web_search (Brave if apikey_brave set, else DuckDuckGo Lite via proxy), deep_research (search + parallel page reads, 1 call), doc_search/doc_list (BM25 over uploaded files), weather (Open-Meteo), calculator (Math.*), image_generate (Pollinations), code_execute (Pyodide WASM), tts (Web Speech), stt (Web Speech), translate (MyMemory), chart (Canvas), ocr (Tesseract.js), qr_generate/qr_read (qrcode/jsQR), pdf_extract (pdf.js), summarize (extractive), rss_feed (CORS proxy), hash (Web Crypto), regex (native), data_convert (native), color_palette (Canvas), whois (RDAP), diagram (Mermaid), audio_edit (Web Audio), image_info (Canvas), link_preview (CORS proxy), diff (native), unit_convert (native), ip_lookup (ip-api), md_to_pdf (html2pdf), web_extract (CORS proxy), youtube (noembed)

## Run
- Dev: `cd frontend && npm install && npm run dev`
- Test: `cd frontend && npm test` (vitest: retrieval + search parsers, 24 tests)
- Build: `cd frontend && npm run build` (static files in dist/)
- Deploy: Upload `dist/` to Vercel/Netlify/GitHub Pages

## No backend required. No API keys required to start — user enters their own key in settings.

## Gotchas (learned the hard way)
- sw.js must skip non-GET + cross-origin, else it caches POSTs and fakes 408s
- Never copy upstream content-length when re-streaming (truncates SSE)
- Agent: ONE assistant msg with all tool_calls, then tool msgs (NVIDIA 400s otherwise)
- NVIDIA /v1/models is public (no key); models cached 6h in IndexedDB, SWR
- Public CORS relays only for credential-free requests — never with Authorization
- 429/5xx retried w/ backoff + Retry-After in llm.js fetchWithRetry
- Lint: npx eslint@9 w/ no-undef catches extraction mistakes vite build won't

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
- Default when unset: first provider with a key that doesn't need a proxy, else groq.
- testProvider does a REAL 1-token chatComplete through the same path chat uses
  (incl. proxy) and stores `status_<id>`; UI shows dot + latency + friendly error.
- Per-tool on/off in `disabled_tools` (stores DISABLED names so new tools default on);
  getToolSchemas(disabled) filters what the model ever sees.

## Model selection (v3.1)
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
- Cloud sync is opt-in: `enableCloudSync(passphrase)` AES-GCM encrypts every stored key.
  Passphrase is memory-only. NOTE: before this, sync silently never ran (no UI set it).
- `downloadBackup()` / `restoreBackup(file, 'merge'|'replace')` — chats + docs + settings.
  API keys are excluded from backup files by design.

## Tests (npm test — 65)
- retrieval (18), agent loop (19), search parsers (6), routing (11), crypto (11)
- Run with pool:forks singleFork — parallel jsdom envs starve the runner.
- `npm run lint` uses react/jsx-no-undef: plain no-undef does NOT catch `<Foo/>` with no
  import, which is how a ReactMarkdown crash reached production.
