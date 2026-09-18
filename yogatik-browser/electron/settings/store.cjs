// Settings store for Yogatik Browser
// Reads and writes to <userData>/settings.json, falling back to defaults.json

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let SETTINGS_FILE = null
const DEFAULTS = require('./defaults.json')

let cache = null

function getSettingsFile() {
  if (!SETTINGS_FILE) {
    try {
      SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')
    } catch {
      // Fallback if called before app ready or outside Electron
      SETTINGS_FILE = path.join(__dirname, 'settings.json')
    }
  }
  return SETTINGS_FILE
}

function load() {
  if (cache) return cache
  const file = getSettingsFile()
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      cache = deepMerge({ ...DEFAULTS }, JSON.parse(raw))
    } else {
      cache = { ...DEFAULTS }
    }
  } catch (err) {
    console.warn('[settings/store] Failed to read settings, using defaults:', err.message)
    cache = { ...DEFAULTS }
  }
  return cache
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {}
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
  return target
}

function save(settings) {
  cache = deepMerge({ ...load() }, settings || {})
  const file = getSettingsFile()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    console.error('[settings/store] Failed to write settings:', err.message)
  }
  return cache
}

function get(key) {
  if (!key) return load()
  const keys = key.split('.')
  let obj = load()
  for (const k of keys) {
    if (obj === undefined || obj === null) return undefined
    obj = obj[k]
  }
  return obj
}

function set(key, value) {
  if (!key) return load()
  const keys = key.split('.')
  const current = load()
  let obj = current
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (!obj[k] || typeof obj[k] !== 'object') obj[k] = {}
    obj = obj[k]
  }
  obj[keys[keys.length - 1]] = value
  return save(current)
}

function reset() {
  cache = { ...DEFAULTS }
  const file = getSettingsFile()
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch {}
  return cache
}

module.exports = { load, save, get, set, reset, DEFAULTS }
