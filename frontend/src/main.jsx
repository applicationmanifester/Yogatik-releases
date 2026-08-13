import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
)

// The app rendered, so any chunk-reload guard from a previous load can go.
markAppHealthy()
