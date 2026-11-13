/*
 * safeRender.jsx — shared crash-containment utilities for React rendering.
 *
 * Provides:
 *  - safe(value, fallback) — coerces any value to a React-safe renderable,
 *    never throwing on undefined/null/Objects/Arrays/etc.
 *  - SafeBranch({ children, fallback, onError }) — wraps a render branch in
 *    try/catch so a single bad tool result cannot kill the whole message bubble.
 */

import React from 'react'

export function safe(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (value && value.$$typeof || (value && React.isValidElement && React.isValidElement(value))) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => safe(v, fallback))
  }
  if (t === 'object') {
    try {
      const keys = Object.keys(value)
      if (keys.length === 0) return '{}'
      const hasFn = keys.some(k => typeof value[k] === 'function')
      if (!hasFn) {
        return JSON.stringify(value, null, 2)
      }
      return '[Object ' + (value.constructor ? value.constructor.name : 'Object') + ']'
    } catch {
      return '[Object ' + (value.constructor ? value.constructor.name : 'Object') + ']'
    }
  }
  return String(value)
}

export class SafeBranch extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    if (this.props.onError) {
      try { this.props.onError(error, errorInfo) } catch {}
    }
  }

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error)
      }
      return this.props.fallback || (
        <div style={{ padding: 8, color: '#ef4444', fontSize: 11, border: '1px solid #fca5a5', borderRadius: 4, background: '#fef2f2' }}>
          Render error: {this.state.error?.message || String(this.state.error)}
        </div>
      )
    }

    if (typeof this.props.children === 'function') {
      try {
        const rendered = this.props.children()
        return rendered === undefined || rendered === null ? (this.props.fallback || null) : rendered
      } catch (err) {
        if (this.props.onError) {
          try { this.props.onError(err) } catch {}
        }
        return this.props.fallback || null
      }
    }

    return this.props.children
  }
}

export function safeRender(renderFn, fallback = null) {
  try {
    const out = renderFn()
    return out === undefined || out === null ? fallback : out
  } catch (err) {
    return fallback
  }
}

export function safeText(value, fallback = '') {
  return safe(value, fallback)
}
