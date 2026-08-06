# Yogatik — Project Knowledge

## Architecture (v2 — Serverless)
- **Frontend-only**: React 18 + Vite (PWA, mobile-first, zero backend)
- **DB**: IndexedDB via Dexie (conversations, settings, API keys — all in browser)
- **LLM**: Direct API calls to Groq/OpenRouter/OpenAI from browser
- **Agent**: OpenAI function-calling loop — LLM decides tools → browser executes → results → final answer
- **Tools**: 28 browser-native tools (Pyodide, Tesseract.js, Mermaid, Web Speech API, Canvas, etc.)
- **PWA**: Service worker, manifest, installable on mobile + desktop
- **Deploy**: Static site — Vercel/Netlify/GitHub Pages (free)

## File Structure
```
AI ChatBot/
├── frontend/
│   ├── public/
│   │   ├── manifest.json      # PWA manifest
│   │   ├── sw.js              # Service worker
│   │   └── icon-*.svg         # App icons
│   ├── src/
│   │   ├── App.jsx            # UI: chat, tools, voice, TTS, PWA install
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
│   │   │   ├── webExtract.js  # CORS proxy
│   │   │   └── ... (28 total)
│   │   └── components/
│   │       ├── CodeBlock.jsx
│   │       ├── ArtifactPanel.jsx
│   │       └── ArenaView.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/               # Legacy — kept for reference, not required
└── CLAUDE.md
```

## Agent Pipeline (browser-native)
User message → LLM (function calling) → tool execution (browser) → LLM (with results) → final response
- Max 5 tool rounds per message
- Sliding window context (20 msgs)

## LLM Providers (browser-direct)
- **groq**: Free tier, blazing fast — console.groq.com
- **openrouter**: 100+ models, pay-per-token — openrouter.ai
- **openai**: GPT-4o etc — platform.openai.com
- API key stored in IndexedDB (never leaves browser)

## Browser-Native Tools (28 — all free, no backend)
weather (Open-Meteo), calculator (Math.*), image_generate (Pollinations), code_execute (Pyodide WASM), tts (Web Speech), stt (Web Speech), translate (MyMemory), chart (Canvas), ocr (Tesseract.js), qr_generate/qr_read (qrcode/jsQR), pdf_extract (pdf.js), summarize (extractive), rss_feed (CORS proxy), hash (Web Crypto), regex (native), data_convert (native), color_palette (Canvas), whois (RDAP), diagram (Mermaid), audio_edit (Web Audio), image_info (Canvas), link_preview (CORS proxy), diff (native), unit_convert (native), ip_lookup (ip-api), md_to_pdf (html2pdf), web_extract (CORS proxy), youtube (noembed)

## Run
- Dev: `cd frontend && npm install && npm run dev`
- Build: `cd frontend && npm run build` (static files in dist/)
- Deploy: Upload `dist/` to Vercel/Netlify/GitHub Pages

## No backend required. No API keys required to start — user enters their own key in settings.
