import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import CompanionView from './components/CompanionView'
import { ErrorBoundary } from './components/ErrorBoundary'
import { markAppHealthy } from './pwa'
import { installErrorLog } from './errorLog'
import './styles.css'

// Capture runtime errors/rejections to an on-device ring buffer for diagnostics.
installErrorLog()

// Filter out third-party browser extension message channel warnings
window.addEventListener('unhandledrejection', (event) => {
  if (
    event?.reason?.message?.includes('A listener indicated an asynchronous response') ||
    event?.reason?.message?.includes('message channel closed')
  ) {
    event.preventDefault()
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
    <ErrorBoundary>{isCompanion ? <CompanionView /> : <App />}</ErrorBoundary>
  </React.StrictMode>
)

// The app rendered, so any chunk-reload guard from a previous load can go.
markAppHealthy()
