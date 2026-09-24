// @vitest-environment node
//
// SettingsModal.jsx pulls in ~20 modules (api, ollama, elevenLabs, errorLog,
// version, features…) that would need extensive mocking to mount for real —
// exactly the situation browserActions.test.js and schemaContract.test.js
// already handle by reading the SOURCE and asserting the wiring is really
// there, rather than risking a render test nobody can execute this session
// getting a mock wrong and pinning a false pass. What actually matters here
// is provable from the text: that the provider grid's "on-device" gap (see
// the entry this fix landed under) is genuinely closed, not merely that some
// JSX exists somewhere.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const modalSrc = fs.readFileSync(path.join(HERE, 'SettingsModal.jsx'), 'utf8')
const providersSrc = fs.readFileSync(path.join(HERE, 'settings', 'ProvidersTab.jsx'), 'utf8')
const src = providersSrc + '\n' + modalSrc

describe('SettingsModal wires up the on-device provider cards', () => {
  it('imports the real panels, not a re-implementation', () => {
    expect(src).toMatch(/import\s*\{\s*LocalModelPanel\s*\}\s*from\s*['"](\.\/|\.\.\/)LocalModelPanel['"]/)
    expect(src).toMatch(/import\s*\{\s*ChromeAIPanel\s*\}\s*from\s*['"](\.\/|\.\.\/)ChromeAIPanel['"]/)
  })

  it('renders a panel for every isLocal provider that is not Ollama (Ollama keeps its own daemon UI)', () => {
    expect(src).toMatch(/prov\.isLocal\s*&&\s*!prov\.is_ollama/)
  })

  it('picks ChromeAIPanel for chromeai and LocalModelPanel for everything else on that branch', () => {
    const branch = src.slice(src.indexOf('prov.isLocal && !prov.is_ollama'))
    const chromeIdx = branch.indexOf('prov.isChromeAI')
    const chromePanelIdx = branch.indexOf('<ChromeAIPanel')
    const localPanelIdx = branch.indexOf('<LocalModelPanel')
    expect(chromeIdx).toBeGreaterThan(-1)
    expect(chromePanelIdx).toBeGreaterThan(-1)
    expect(localPanelIdx).toBeGreaterThan(-1)
    // The ChromeAIPanel render must be inside the isChromeAI branch, ahead of
    // the LocalModelPanel fallback — swapped, every provider would get the
    // wrong download UI.
    expect(chromeIdx).toBeLessThan(chromePanelIdx)
    expect(chromePanelIdx).toBeLessThan(localPanelIdx)
  })

  it('never routes the on-device branch through the API-key box (isLocal is already excluded there)', () => {
    // The pre-existing key-box guard must still read `!prov.isLocal`, or a
    // provider could get BOTH an unusable key input and the new panel.
    expect(src).toMatch(/!prov\.isLocal\s*&&\s*!prov\.isOllama/)
  })

  it('does not silently overwrite the app-wide active model from a not-yet-selected card', () => {
    // localModelChoice is the guard: chooseModel(m, pid) calls setModel()
    // UNCONDITIONALLY regardless of pid, so the dropdown inside a provider
    // card that is not yet active must stay local until Select/onReady.
    expect(src).toMatch(/localModelChoice/)
    expect(src).toMatch(/isCur\s*\?\s*onSelectModel\?\.\(m,\s*id\)\s*:\s*setLocalModelChoice\(m\)/)
  })
})

describe('the dead LocalModelPanel import is gone from App.jsx', () => {
  it('App.jsx no longer declares an unreferenced lazy LocalModelPanel', () => {
    const appSrc = fs.readFileSync(path.join(HERE, '..', 'App.jsx'), 'utf8')
    expect(appSrc).not.toMatch(/const LocalModelPanel = safeLazy/)
  })

  it('Sampling Temperature is housed under Providers & Keys in SettingsModal and Dashboard, and removed from composer toolbar', () => {
    const appSrc = fs.readFileSync(path.join(HERE, '..', 'App.jsx'), 'utf8')
    // SettingsModal has temperature slider under Providers & Keys
    expect(src).toMatch(/temperature\s*=\s*1\.0/)
    expect(src).toMatch(/Sampling Temperature/)
    expect(src).toMatch(/max="2"/)
    // App.jsx composer toolbar no longer contains temp-control-pill
    expect(appSrc).not.toMatch(/className="temp-control-pill"/)
    // App.jsx Providers dashboard includes Sampling Temperature
    expect(appSrc).toMatch(/dash-card temp-settings-card/)
  })
})

