// Extension & User-Script system for Yogatik Browser
// Loads manifests and scripts from <userData>/extensions/

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let EXTENSIONS_DIR = null

function getExtensionsDir() {
  if (!EXTENSIONS_DIR) {
    try {
      EXTENSIONS_DIR = path.join(app.getPath('userData'), 'extensions')
    } catch {
      EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions')
    }
  }
  return EXTENSIONS_DIR
}

function ensureExtensionsDir() {
  const dir = getExtensionsDir()
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      // Create a starter sample extension (Night Reading Booster)
      createSampleExtension(dir)
    } catch (err) {
      console.warn('[extensions] Could not create extensions dir:', err.message)
    }
  }
  return dir
}

function createSampleExtension(baseDir) {
  const sampleDir = path.join(baseDir, 'sample-reader-enhancer')
  if (fs.existsSync(sampleDir)) return
  try {
    fs.mkdirSync(sampleDir, { recursive: true })
    fs.writeFileSync(path.join(sampleDir, 'manifest.json'), JSON.stringify({
      name: 'Yogatik Smooth Reader',
      version: '1.0.0',
      description: 'Enhances article typography and smooth scrolling on news and blogs.',
      matches: ['*://*/*'],
      css: ['styles.css'],
      js: ['script.js'],
    }, null, 2), 'utf-8')

    fs.writeFileSync(path.join(sampleDir, 'styles.css'), `/* Yogatik Smooth Reader Sample Extension */
html {
  scroll-behavior: smooth !important;
}
`, 'utf-8')

    fs.writeFileSync(path.join(sampleDir, 'script.js'), `// Yogatik Smooth Reader
console.info('[Yogatik Extension] Smooth Reader active');
`, 'utf-8')
  } catch (err) {
    console.warn('[extensions] Failed to scaffold sample extension:', err.message)
  }
}

function matchPattern(pattern, url) {
  if (!pattern || !url) return false
  if (pattern === '<all_urls>') return true
  try {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    const regex = new RegExp(`^${escaped}$`, 'i')
    return regex.test(url)
  } catch {
    return false
  }
}

function loadExtensions() {
  const dir = ensureExtensionsDir()
  let dirs = []
  try {
    dirs = fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch {
    return []
  }

  const extensions = []
  for (const name of dirs) {
    const extDir = path.join(dir, name)
    const manifestPath = path.join(extDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      extensions.push({
        id: name,
        name: manifest.name || name,
        version: manifest.version || '1.0.0',
        description: manifest.description || '',
        matches: Array.isArray(manifest.matches) ? manifest.matches : ['<all_urls>'],
        js: Array.isArray(manifest.js) ? manifest.js : [],
        css: Array.isArray(manifest.css) ? manifest.css : [],
        enabled: manifest.enabled !== false,
        dir: extDir,
      })
    } catch (err) {
      console.warn(`[extensions] Failed parsing manifest for ${name}:`, err.message)
    }
  }
  return extensions
}

async function injectExtensions(webContents, url) {
  if (!webContents || webContents.isDestroyed() || !url) return
  if (!url.startsWith('http://') && !url.startsWith('https://')) return

  const extensions = loadExtensions()
  for (const ext of extensions) {
    if (!ext.enabled) continue
    const matches = ext.matches.some(pattern => matchPattern(pattern, url))
    if (!matches) continue

    for (const cssFile of ext.css) {
      const filePath = path.join(ext.dir, cssFile)
      if (fs.existsSync(filePath)) {
        try {
          const css = fs.readFileSync(filePath, 'utf-8')
          await webContents.insertCSS(css)
        } catch {}
      }
    }

    for (const jsFile of ext.js) {
      const filePath = path.join(ext.dir, jsFile)
      if (fs.existsSync(filePath)) {
        try {
          const js = fs.readFileSync(filePath, 'utf-8')
          await webContents.executeJavaScript(js)
        } catch {}
      }
    }
  }
}

module.exports = {
  getExtensionsDir,
  ensureExtensionsDir,
  loadExtensions,
  injectExtensions,
  matchPattern,
}
