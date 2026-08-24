import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import CompanionView from './components/CompanionView'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './hooks/useToast'
import { markAppHealthy } from './pwa'
import { installErrorLog } from './errorLog'
import { installShellGuard } from './shellGuard'
import './styles.css'

// Capture runtime errors/rejections to an on-device ring buffer for diagnostics.
installErrorLog()

// Third-party scripts (adsbygoogle) rewrite ancestor heights with inline
// !important, which no stylesheet can outrank. See shellGuard.js.
installShellGuard()

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
window.addEventListener('vite:preloadError', (event) => {
  event?.preventDefault?.()
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
})

// ?companion=1 is the floating always-on-top window. It is the SAME origin and
// the same bundle as the main app on purpose — that is what lets it share
// IndexedDB, the API keys, the agent and every tool. Routing here rather than
// inside App because App cannot early-return before its hooks.
const isCompanion = new URLSearchParams(window.location.search).get('companion') === '1'
if (isCompanion) document.documentElement.setAttribute('data-companion', '1')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ErrorBoundary>
        <React.Suspense fallback={null}>
          {isCompanion ? <CompanionView /> : <App />}
        </React.Suspense>
      </ErrorBoundary>
    </ToastProvider>
  </React.StrictMode>
)

// The app rendered, so any chunk-reload guard from a previous load can go.
markAppHealthy()