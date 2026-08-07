import React from 'react'

/** Catches render/lifecycle errors so one bad component can't blank the app. */
export class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('Yogatik crashed:', error, info?.componentStack)
  }

  reset = () => this.setState({ error: null })

  reload = () => {
    // A stale cached bundle is a common cause — clear it before reloading.
    if ('caches' in window) caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).finally(() => location.reload())
    else location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-boundary" role="alert">
        <h2>Something broke</h2>
        <pre>{this.state.error.message}</pre>
        <div className="error-boundary-actions">
          <button onClick={this.reset}>Try again</button>
          <button onClick={this.reload}>Clear cache &amp; reload</button>
        </div>
        <p>Your conversations are stored locally and were not affected.</p>
      </div>
    )
  }
}
