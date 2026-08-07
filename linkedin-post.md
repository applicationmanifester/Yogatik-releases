# LinkedIn post — Yogatik

## Option A: mobile-first framing (recommended)

I built an AI assistant that installs on your phone in about a second — and has no backend at all.

Not "serverless." No server. Yogatik runs entirely inside your browser, on your device.

Add it to your home screen and it behaves like a native app: full screen, its own icon, no app store, no 200MB download, no permissions to accept. The whole thing is under 600KB.

Which means your phone is doing the work:

→ **Your data never leaves it.** Chats, uploaded documents and API keys live in your phone's local storage. Nothing syncs to a server I control, because there isn't one. I couldn't read your conversations if I wanted to.

→ **Bring your own key.** You pay Groq, NVIDIA, Gemini or OpenAI directly at their prices. No subscription, no markup. Several have free tiers.

→ **32 tools running on-device.** Python execution (via WebAssembly), PDF text extraction, OCR, Mermaid diagrams, charts, QR codes, image generation. On your phone, in a browser tab.

→ **Ask questions about your own PDFs.** Upload one and query it. I used BM25 retrieval rather than vector embeddings — no 25MB model to download over mobile data, and on small document sets it matches the vector approach for keyword-style questions while running in microseconds.

→ **Live web research with citations.** It searches, reads the top results in parallel, and tells you where each claim came from.

→ **It picks the model for you.** One provider offers 79 models; most people just guess. Yogatik times them and selects the fastest that actually responds, then routes by question type — code questions to a code model, quick ones to a fast model.

→ **Talk to it.** Voice input and read-aloud are built into the browser, so they cost nothing extra.

Free, no signup: https://yogatik.web.app
On Android: Chrome menu → Add to Home screen. On iPhone: Share → Add to Home Screen.

Honest caveat: you need your own API key. That's the trade for no subscription and no one else holding your data.

React, Vite, IndexedDB, a Cloudflare Worker. Critical feedback especially welcome.

#AI #PWA #MobileFirst #PrivacyByDesign #WebDevelopment #React

---

## Option B: shorter, problem-first

Every AI app wants you to trust it with your conversations. And to install 200MB to have them.

So I built one that does neither.

Yogatik is an AI assistant that installs to your phone's home screen from the browser — under 600KB, no app store — and runs entirely on your device. Your chats, your documents, your API keys stay in your phone's storage. There's no server holding them, because there's no server.

On your phone it will:

• Run Python, extract text from PDFs, do OCR, generate images and draw diagrams — on-device
• Answer questions about your own documents, with retrieval running locally
• Search the live web and cite its sources
• Benchmark the available models and pick the fastest one that works, then route each question to the right one
• Take voice input and read answers back

You bring your own API key from Groq, NVIDIA, Gemini or OpenAI — most have free tiers — and pay them directly. No subscription, no markup, no middleman reading your data.

https://yogatik.web.app
Android: Chrome → Add to Home screen · iPhone: Share → Add to Home Screen

#AI #PWA #PrivacyByDesign #MobileFirst #WebDev

---

## Verified claims (so you can defend them in the comments)

| Claim | Basis |
|---|---|
| under 600KB | 574 kB eager payload measured from the production build (161 kB gzipped) |
| installs to home screen | `manifest.json` with `display: standalone`, 192/512 icons, service worker |
| no backend | IndexedDB only; the sole server-side piece is a stateless CORS proxy that stores nothing |
| on-device Python/OCR/PDF | Pyodide, Tesseract.js and pdf.js all run as WASM in the browser |
| BM25 not embeddings | `retrieval.js` — verified 5/5 on a synthetic document Q&A set |
| model auto-selection | probes candidates in parallel, stores measured latency, picks fastest working |
| voice in/out | Web Speech API — no third-party service |

**Don't claim** offline chat — the app shell loads offline but answering needs the provider. And don't claim camera-to-OCR from the attach button; image upload isn't wired to OCR yet.

## Before you post

1. **Deploy the worker** — `deploy-proxy.bat`. Web research returns 403 in production until you do, and it's a headline feature.
2. **Record a phone screen capture**, 15–20 seconds: home screen icon → tap → ask something → sources appear. Mobile footage of a web app installing like a native one is the whole hook, and LinkedIn's reach for video beats text heavily.
3. **Test the install flow on a real phone**, both Android and iPhone, before you invite an audience.
4. Post Tuesday–Thursday morning, and answer every comment in the first hour.
