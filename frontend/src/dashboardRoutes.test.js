import { describe, it, expect } from 'vitest'
import {
  dashboardPath,
  dashboardKeyFromPath,
  isValidRoute,
} from './dashboardRoutes'

describe('dashboardRoutes', () => {
  it('generates correct dashboard paths', () => {
    expect(dashboardPath('settings')).toBe('/app/settings')
    expect(dashboardPath('providers')).toBe('/app/providers')
  })

  it('parses valid dashboard paths', () => {
    expect(dashboardKeyFromPath('/app/settings')).toBe('settings')
    expect(dashboardKeyFromPath('/app/providers/')).toBe('providers')
    expect(dashboardKeyFromPath('#/app/settings')).toBe('settings')
    expect(dashboardKeyFromPath('#/app/providers/')).toBe('providers')
    expect(dashboardKeyFromPath('/app/unknown-tab')).toBeNull()
    expect(dashboardKeyFromPath('/settings')).toBeNull()
  })

  it('validates known routes', () => {
    expect(isValidRoute('')).toBe(true)
    expect(isValidRoute('/')).toBe(true)
    expect(isValidRoute('/live')).toBe(true)
    expect(isValidRoute('/app/settings')).toBe(true)
    expect(isValidRoute('/app/capabilities')).toBe(true)
    expect(isValidRoute('/guide')).toBe(true)
    expect(isValidRoute('/tools')).toBe(true)
    expect(isValidRoute('/billing')).toBe(true)
    expect(isValidRoute('/index.html')).toBe(true)
    expect(isValidRoute('/c:/users/bharg_4mtuttl/appdata/local/programs/yogatik/resources/app.asar/dist-electron/index.html')).toBe(true)
    expect(isValidRoute('/Applications/Yogatik.app/Contents/Resources/app.asar/dist-electron/index.html')).toBe(true)
    expect(isValidRoute('c:\\users\\app\\dist-electron\\index.html')).toBe(true)
  })

  it('rejects unknown routes', () => {
    expect(isValidRoute('/does-not-exist')).toBe(false)
    expect(isValidRoute('/random/page')).toBe(false)
    expect(isValidRoute('/app/fake-tab')).toBe(false)
    expect(isValidRoute('/admin')).toBe(false)
  })
})
