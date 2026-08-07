# LinkedIn Post Drafts for Yogatik

---

## Option 1: High-Impact & Professional (Recommended)

Stop paying $20–$50/month subscriptions for locked-down AI chat interfaces.

I built **Yogatik** — a zero-subscription, privacy-first AI Assistant designed seamlessly for both **Desktop & Mobile web browsers**.

Instead of forcing you into monthly paywalls or storing your private chats on third-party servers, Yogatik puts total control back into your hands:

⚡ **No Subscriptions, Pay Only for What You Use**
Bring your own API key (Gemini, Groq, NVIDIA, OpenRouter, OpenAI) and pay raw API rates — pennies instead of $20/month.

💻 **Desktop Powerhouse**
Multi-window split interface, keyboard shortcuts (`Ctrl+Shift+O` for new chat), side-by-side artifact rendering, code execution sandbox, and instant document Q&A.

📱 **Native Mobile Experience (PWA)**
No 200MB app store downloads required. Install directly to your iOS or Android home screen in seconds (under 600KB). Fully responsive with touch-first controls.

🛠️ **32 Free Built-in Client-Side Tools**
- Live Web Research & Deep Investigation
- Image Generation & Canvas Editing
- Python WASM Code Execution
- Real-time Document Analysis (PDF & Text RAG)
- Browser-native Voice Input & Read-Aloud TTS
- Diagrams, Math, Unit Conversions, Data Transforms, and more.

🔒 **100% Privacy by Design**
Your chat history, documents, and API keys are stored strictly in your browser's local IndexedDB. There is zero middleman backend collecting your data.

👉 **Try it free right now in your browser**: https://yogatik.web.app

*How to install on mobile:*
• **Android**: Chrome Menu → "Add to Home screen"
• **iPhone**: Safari Share Button → "Add to Home Screen"

Built with React, Vite, WASM, and IndexedDB. Feedback & contributions are hugely welcome!

#AI #WebDevelopment #PWA #OpenSource #ReactJS #PrivacyFirst #TechInnovation

---

## Option 2: Problem & Solution Focused (Shorter)

Why are we paying $240/year for subscription AI apps when API calls cost fractions of a cent?

Meet **Yogatik** — a free, browser-native AI client built for both **Desktop & Mobile**.

It replaces locked-down subscription models by letting you connect top AI models (Gemini, Groq, NVIDIA NIM, OpenRouter) with your own API keys.

🔥 **Key Highlights:**
1. **Works Everywhere**: Seamless desktop experience + 1-click PWA installation on iOS & Android (no App Store needed).
2. **32 Integrated Tools**: Web Search, WASM Python Sandbox, Document Q&A, Image Gen, Voice Input/TTS & Diagramming built right in.
3. **Zero Data Retention**: Your keys, chats, and uploaded files stay in your browser's local storage — never sent to a central server.

Try it live: https://yogatik.web.app

#ArtificialIntelligence #SoftwareEngineering #Frontend #Privacy #Productivity

---

## Technical Fact Sheet (For Comment Defenses)

| Feature | Implementation / Proof |
|---|---|
| **Multi-Platform Support** | Responsive CSS layout + PWA `manifest.json` for Mobile & Desktop |
| **Subscription Replacement** | Direct client-side API calls to Gemini/Groq/NVIDIA/OpenRouter |
| **Zero Server Logging** | All persistence handled via browser `IndexedDB` (`db.js`) |
| **Client-Side WASM Tools** | Pyodide (Python), pdf.js (PDF RAG), Tesseract.js (OCR) run in browser |
| **Lightweight App Shell** | Production build payload ~570KB (160KB gzipped) |
