import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AdSenseBanner, adsAvailable } from './AdSenseBanner'

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
})
