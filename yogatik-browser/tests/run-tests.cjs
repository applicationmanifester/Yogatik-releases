#!/usr/bin/env node
'use strict'

// Yogatik Browser — real test runner (replaces the "echo \"Tests passed\"" placeholder).
//
// Sections:
//   1. Syntax validation of every electron/*.cjs module via `node --check`
//   2. Unit tests for the settings store against an Electron stub:
//        - defaults load-through
//        - dot-path set()/get() persistence
//        - atomic-write residue check (no .tmp left behind)
//        - DEFAULTS-pollution regression guard
//        - reset() restores factory values after mutation

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const ELECTRON_DIR = path.join(ROOT, 'electron')

let failures = 0
let passes = 0

function pass(name) { passes++; console.log('  \u2714 ' + name) }
function fail(name, err) {
  failures++
  console.error('  \u2716 ' + name)
  console.error('      ' + (err && err.message ? err.message : String(err)))
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed') }

function section(title) {
  console.log('\n=== ' + title + ' ===')
}

// ── 1. Syntax validation ──────────────────────────────────────────────
function syntaxCheckAllModules() {
  section('1. Syntax validation (node --check)')
  const modules = fs.readdirSync(ELECTRON_DIR).filter((f) => f.endsWith('.cjs'))
  assert(modules.length >= 10, 'expected at least 10 electron/*.cjs modules, found ' + modules.length)
  for (const mod of modules) {
    const r = spawnSync(process.execPath, ['--check', path.join(ELECTRON_DIR, mod)], { encoding: 'utf-8' })
    if (r.status === 0) pass('node --check ' + mod)
    else fail('node --check ' + mod, (r.stderr || 'non-zero exit').trim())
  }
}

// ── 2. Settings store unit tests ──────────────────────────────────────
function runSettingsStoreTests() {
  section('2. Settings store unit tests (Electron stub)')

  // Isolated temp userData for this run — set BEFORE the stub module loads.
  process.env.YOGATIK_TEST_USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-test-'))

  // Redirect `require('electron')` to the stub before loading store.cjs.
  const Module = require('module')
  const STUB_PATH = path.join(__dirname, 'electron-stub.cjs')
  const origResolve = Module._resolveFilename
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'electron') return STUB_PATH
    return origResolve.call(this, request, parent, isMain, options)
  }

  const store = require('../electron/settings/store.cjs')
  const settingsFile = path.join(process.env.YOGATIK_TEST_USERDATA, 'settings.json')

  // 2a. Defaults load through when no settings file exists.
  try {
    const s = store.load()
    assert(s.theme === 'midnight', 'theme default should be midnight')
    assert(s.adBlocker && s.adBlocker.enabled === true, 'adBlocker.enabled default should be true')
    assert(s.privacy && s.privacy.isolateSessions === true, 'privacy.isolateSessions default should be true')
    pass('defaults load through when settings.json is absent')
  } catch (e) { fail('defaults load through when settings.json is absent', e) }

  // 2b. Dot-path set()/get() persists to disk.
  try {
    store.set('searchEngine', 'Brave')
    store.set('newTab.showClock', false)
    assert(store.get('searchEngine') === 'Brave', 'searchEngine should be Brave after set')
    assert(store.get('newTab.showClock') === false, 'newTab.showClock should be false after set')
    const onDisk = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
    assert(onDisk.searchEngine === 'Brave', 'searchEngine should be persisted to settings.json')
    assert(onDisk.newTab.showClock === false, 'newTab.showClock should be persisted to settings.json')
    pass('dot-path set()/get() persists to settings.json')
  } catch (e) { fail('dot-path set()/get() persists to settings.json', e) }

  // 2c. Atomic write leaves no .tmp residue.
  try {
    store.set('theme', 'ink')
    const residue = fs.readdirSync(process.env.YOGATIK_TEST_USERDATA).filter((f) => f.endsWith('.tmp'))
    assert(residue.length === 0, '.tmp residue found: ' + residue.join(', '))
    assert(fs.existsSync(settingsFile), 'settings.json should exist after atomic save')
    pass('atomic write leaves no .tmp residue')
  } catch (e) { fail('atomic write leaves no .tmp residue', e) }

  // 2d. DEFAULTS-pollution regression guard.
  try {
    const before = JSON.stringify(require('../electron/settings/defaults.json'))
    store.set('adBlocker.enabled', false)
    const after = JSON.stringify(require('../electron/settings/defaults.json'))
    assert(before === after, 'factory DEFAULTS were mutated by user settings changes (DEFAULTS pollution)')
    pass('user settings changes do not pollute factory DEFAULTS')
  } catch (e) { fail('user settings changes do not pollute factory DEFAULTS', e) }

  // Reset require cache so a fresh store loads in the next test.
  delete require.cache[require.resolve('../electron/settings/store.cjs')]

  // 2e. reset() restores factory values after mutation.
  try {
    const s2 = store.load()
    assert(s2.theme === 'ink', 'fresh store should load the persisted theme (ink) before reset')
    assert(s2.adBlocker.enabled === false, 'persisted adBlocker.enabled=false should be visible before reset')
    const resetResult = store.reset()
    assert(resetResult.theme === 'midnight', 'reset() should restore theme=midnight')
    assert(resetResult.adBlocker.enabled === true, 'reset() should restore adBlocker.enabled=true')
    assert(resetResult.newTab.showClock === true, 'reset() should restore newTab.showClock=true')
    assert(!fs.existsSync(settingsFile), 'reset() should delete settings.json')
    pass('reset() restores factory values and clears settings.json')
  } catch (e) { fail('reset() restores factory values and clears settings.json', e) }

  // Restore module resolution.
  Module._resolveFilename = origResolve
}

// ── Main ────────────────────────────────────────────────────────────────
syntaxCheckAllModules()
runSettingsStoreTests()

section('Summary')
console.log('Passed: ' + passes + '   Failed: ' + failures)
if (failures > 0) {
  console.error('\u2716 TEST SUITE FAILED')
  process.exit(1)
}
console.log('\u2714 TEST SUITE PASSED')
process.exit(0)
