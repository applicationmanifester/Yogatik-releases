import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AdSenseBanner, adsAvailable } from './AdSenseBanner'

const APP_SRC = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'App.jsx'),
  'utf8',
)

let host = null
let root = null

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  window.adsbygoogle = []
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('AdSenseBanner Component', () => {
  it('renders ad wrapper when ads are available on web', () => {
    act(() => {
      root.render(<AdSenseBanner label="Test Sponsor" />)
    })

    if (adsAvailable) {
      expect(host.querySelector('.adsbygoogle')).toBeTruthy()
      expect(host.textContent).toContain('Test Sponsor')
    } else {
      expect(host.firstChild).toBeNull()
    }
  })

  it('does not ask for a full-width-responsive unit by default', () => {
    if (!adsAvailable) return
    act(() => { root.render(<AdSenseBanner />) })
    // Responsive is what makes adsbygoogle.js walk up the tree rewriting
    // ancestor heights with inline !important — see shellGuard.js.
    expect(host.querySelector('.adsbygoogle').getAttribute('data-full-width-responsive')).toBe('false')
  })

  it('is mounted in the sidebar scroll region, never inside the settings drawer', () => {
    const ad = APP_SRC.indexOf('<AdSenseBanner')
    const drawer = APP_SRC.indexOf('className={`settings ${settingsOpen')
    expect(ad, 'App.jsx no longer renders the banner').toBeGreaterThan(-1)
    expect(drawer).toBeGreaterThan(-1)
    // Inside .settings-body the ad script un-constrained #root/.app/.sidebar/
    // .settings and the drawer plus the whole footer fell off the viewport.
    expect(ad).toBeLessThan(drawer)
  })
})
