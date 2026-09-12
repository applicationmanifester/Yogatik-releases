import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidRoute } from './dashboardRoutes'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FRONTEND = path.resolve(ROOT, 'frontend')

describe('Audit Verification Suite', () => {
  it('verifies tool count is consistent (177 tools) in metadata and descriptions', () => {
    const indexHtml = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8')
    const manifestJson = fs.readFileSync(path.join(FRONTEND, 'public/manifest.json'), 'utf8')
    const platformsHtml = fs.readFileSync(path.join(FRONTEND, 'public/platforms.html'), 'utf8')

    // index.html
    expect(indexHtml).toContain('177 free browser-native tools')
    expect(indexHtml).not.toContain('65 free browser-native tools')

    // manifest.json
    expect(manifestJson).toContain('177 free tools')
    expect(manifestJson).not.toContain('32 free tools')

    // platforms.html
    expect(platformsHtml).toContain('177 free tools')
    expect(platformsHtml).toContain('177 built-in tools')
    expect(platformsHtml).not.toContain('65+ built-in tools')
  })

  it('verifies privacy wording is tightened and accurate above the fold', () => {
    const indexHtml = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8')
    const appJsx = fs.readFileSync(path.join(FRONTEND, 'src/App.jsx'), 'utf8')

    expect(indexHtml).toContain('transparent proxy')
    expect(indexHtml).toContain('Firebase')
    expect(appJsx).toContain('transparent developer proxy')
    expect(appJsx).toContain('Firebase')
  })

  it('verifies 404 route handling on server and client', () => {
    const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'))
    const fourOhFourHtml = fs.readFileSync(path.join(FRONTEND, 'public/404.html'), 'utf8')

    // firebase.json does not rewrite everything with **
    const rewrites = firebaseJson.hosting.rewrites
    const catchAll = rewrites.find(r => r.source === '**')
    expect(catchAll).toBeUndefined()

    // Scoped SPA rewrites are present
    const appRewrite = rewrites.find(r => r.source === '/app/**')
    expect(appRewrite).toBeDefined()
    expect(appRewrite.destination).toBe('/index.html')

    const liveRewrite = rewrites.find(r => r.source === '/live')
    expect(liveRewrite).toBeDefined()

    // 404.html contains noindex
    expect(fourOhFourHtml).toContain('noindex')
    expect(fourOhFourHtml).toContain('Page not found')

    // isValidRoute correctly classifies unknown URLs
    expect(isValidRoute('/does-not-exist')).toBe(false)
    expect(isValidRoute('/app/settings')).toBe(true)
    expect(isValidRoute('/')).toBe(true)
    expect(isValidRoute('/live')).toBe(true)
  })

  it('verifies Content-Security-Policy is enforced rather than Report-Only', () => {
    const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'))
    const globalHeaders = firebaseJson.hosting.headers.find(h => h.source === '**').headers

    const cspHeader = globalHeaders.find(h => h.key === 'Content-Security-Policy')
    const cspReportOnly = globalHeaders.find(h => h.key === 'Content-Security-Policy-Report-Only')

    expect(cspHeader).toBeDefined()
    expect(cspReportOnly).toBeUndefined()
    expect(cspHeader.value).toContain("default-src 'self'")
  })

  it('verifies first impression focuses on "Choose a provider or run locally"', () => {
    const appJsx = fs.readFileSync(path.join(FRONTEND, 'src/App.jsx'), 'utf8')

    expect(appJsx).toContain('Choose a provider or run locally')
    expect(appJsx).toContain('Connect an AI Provider')
    expect(appJsx).toContain('Run Locally on Device')
  })
})
