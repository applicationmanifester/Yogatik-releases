import React from 'react'
import { AlertOctagon, RefreshCw, Trash2, Copy, Check, ShieldCheck } from 'lucide-react'
import { getDiagnosticsReport, logError } from '../errorLog'

/** Catches render/lifecycle errors so one bad component can't blank the app. */
export class ErrorBoundary extends React.Component {
  state = { error: null, copied: false }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('Yogatik crash caught:', error, info?.componentStack)
    logError('crash', error?.message || 'Component Crash', info?.componentStack)
  }

  reset = () => this.setState({ error: null })

  reload = () => {
    // A stale cached bundle is a common cause — clear cache before reloading.
    if ('caches' in window) {
      caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).finally(() => location.reload())
    } else {
      location.reload()
    }
  }

  copyReport = async () => {
    try {
      const dump = `Yogatik Crash Report:\nError: ${this.state.error?.message}\nStack: ${this.state.error?.stack}\n\nFull Diagnostics:\n${getDiagnosticsReport()}`
      await navigator.clipboard.writeText(dump)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-icon">
          <AlertOctagon size={42} />
        </div>
        <h2>An unexpected error occurred</h2>
        <p className="error-boundary-desc">
          Yogatik caught a render error. Your conversations and settings are stored locally in IndexedDB and remain completely safe.
        </p>

        <pre className="error-boundary-pre">{this.state.error.message || String(this.state.error)}</pre>

        <div className="error-boundary-actions">
          <button className="btn-primary" onClick={this.reset}>
            <RefreshCw size={14} /> Try to Recover
          </button>
          <button className="small-btn" onClick={this.reload}>
            <Trash2 size={14} /> Clear Cache &amp; Reload
          </button>
          <button className="small-btn" onClick={this.copyReport}>
            {this.state.copied ? <Check size={14} /> : <Copy size={14} />}
            {this.state.copied ? 'Diagnostics Copied' : 'Copy Diagnostics Report'}
          </button>
        </div>

        <div className="error-boundary-footer">
          <ShieldCheck size={14} />
          <span>Local storage &amp; offline conversations intact</span>
        </div>
      </div>
    )
  }
}
