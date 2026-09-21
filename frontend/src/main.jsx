import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import CompanionView from './components/CompanionView'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './hooks/useToast'
import { markAppHealthy } from './pwa'
import { installErrorLog } from './errorLog'
import { installShellGuard } from './shellGuard'
import { autoStartOllama } from './ollama'
import { preconnectProvider } from './live/latencyOptimizer'
import { prewarmNeuralVoice } from './live/voice'
import './styles.css'
import { applyDocumentLocale } from './locale'

// Capture runtime errors/rejections to an on-device ring buffer for diagnostics.
installErrorLog()

// Third-party scripts (adsbygoogle) rewrite ancestor heights with inline
// !important, which no stylesheet can outrank. See shellGuard.js.
installShellGuard()

// Auto-start Ollama daemon in the background (desktop-only; web no-op).
autoStartOllama().catch(() => {})

// Preconnect all AI provider origins at app load (not call start) — DNS + TLS + TCP warm.
// Eliminates 100-300ms cold-start latency when user begins a Live call.
const PROVIDER_ORIGINS = [
  'https://generativelanguage.googleapis.com',
  'https://api.groq.com',
  'https://api.openai.com',
  'https://openrouter.ai',
  'https://integrate.api.nvidia.com',
]
PROVIDER_ORIGINS.forEach(preconnectProvider)

// Pre-warm neural voice (Kokoro-82M) if cached — first clause won't be robotic.
prewarmNeuralVoice().catch(() => {})

// The tool registry (~195 tools) now loads as its own async chunk instead of
// blocking the initial bundle (see agent.js: toolRegistry()/warmToolRegistry).
// Kick it off once the page has painted, idle, so it's already resolved by
// the time a real chat turn needs it instead of adding latency to that turn.
const warmTools = () => import('./agent').then(m => m.warmToolRegistry?.()).catch(() => {})
const warmApex = () => import('./apexAgent').then(m => m.registerApexAgent?.()).catch(() => {})
if ('requestIdleCallback' in window) {
  requestIdleCallback(warmTools, { timeout: 4000 })
  requestIdleCallback(warmApex, { timeout: 5000 })
} else {
  setTimeout(warmTools, 2000)
  setTimeout(warmApex, 2500)
}

// Filter out third-party browser extension message channel warnings
window.addEventListener('unhandledrejection', (event) => {
  if (
    event?.reason?.message?.includes('A listener indicated an asynchronous response') ||
    event?.reason?.message?.includes('message channel closed')
  ) {
    event.preventDefault()
  }
})

// Automatically recover when Vite detects a new deployment with updated chunk hashes
function handleChunkReload() {
  const storageKey = 'yogatik_last_preload_reload'
  const lastReload = parseInt(sessionStorage.getItem(storageKey) || '0', 10)
  const now = Date.now()
  if (now - lastReload > 10000) {
    sessionStorage.setItem(storageKey, String(now))
    if ('caches' in window) {
      caches.keys()
        .then(ks => Promise.all(ks.filter(k => k.startsWith('yogatik-')).map(k => caches.delete(k))))
        .finally(() => window.location.reload())
    } else {
      window.location.reload()
    }
  }
}

window.addEventListener('vite:preloadError', (event) => {
  event?.preventDefault?.()
  handleChunkReload()
})

window.addEventListener('error', (event) => {
  const msg = event?.message || ''
  if (
    msg.includes('Failed to load module script') ||
    msg.includes('Strict MIME type checking is enforced') ||
    msg.includes('error loading dynamically imported module')
  ) {
    handleChunkReload()
  }
})

// ?companion=1 is the floating always-on-top window. It is the SAME origin and
// the same bundle as the main app on purpose — that is what lets it share
// IndexedDB, the API keys, the agent and every tool. Routing here rather than
// inside App because App cannot early-return before its hooks.
// lang/dir go on <html> BEFORE the first paint. Applied here rather than in an
// App effect because a right-to-left user would otherwise see one frame of a
// left-to-right layout, and the spellchecker and screen reader would start on
// the wrong language.
try { applyDocumentLocale() } catch { /* never block boot on this */ }

const isCompanion = new URLSearchParams(window.location.search).get('companion') === '1'
if (isCompanion) document.documentElement.setAttribute('data-companion', '1')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ErrorBoundary>
        <React.Suspense fallback={
          <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff6b35' }} />
              <span style={{ fontSize: 14 }}>Starting Yogatik…</span>
            </div>
          </div>
        }>
          {isCompanion ? <CompanionView /> : <App />}
        </React.Suspense>
      </ErrorBoundary>
    </ToastProvider>
  </React.StrictMode>
)

// The app rendered, so any chunk-reload guard from a previous load can go.
markAppHealthy()