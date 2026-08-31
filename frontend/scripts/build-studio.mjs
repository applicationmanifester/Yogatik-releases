#!/usr/bin/env node
// Build the YOGATIK STUDIO edition: 100% unrestricted, local agentic execution engine.
//
//   npm run electron:build:studio   →  release-studio/Yogatik-Studio-Setup.exe
//                                  →  release-studio/win-unpacked/Yogatik Studio.exe

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env, YOGATIK_EDITION: 'studio', VITE_YOGATIK_EDITION: 'studio' }

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  if (r.status !== 0) {
    console.error(`\n[studio] FAILED: ${cmd} ${args.join(' ')}`)
    process.exit(r.status ?? 1)
  }
  return r
}

function tryRun(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  return r.status === 0
}

const dist = path.join(root, 'dist-electron')
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true, force: true })

// Write edition.json marker
const editionConfig = JSON.stringify({ edition: 'studio', productName: 'Yogatik Studio' }, null, 2)
fs.writeFileSync(path.join(root, 'electron', 'edition.json'), editionConfig)

// Step 0: Compile search-sidecar (Go binary)
console.log('🔨 Step 0/4: [studio] compiling search-sidecar…')
const sidecarDir = path.join(root, 'bin', 'search-sidecar')
const sidecarMain = path.join(sidecarDir, 'main.go')
const sidecarOutput = path.join(sidecarDir, 'search-sidecar' + (process.platform === 'win32' ? '.exe' : ''))
if (fs.existsSync(sidecarMain)) {
  if (tryRun('go', ['build', '-o', path.basename(sidecarOutput), 'main.go'], { cwd: sidecarDir })) {
    console.log('✅ Search sidecar compiled successfully')
  } else {
    console.warn('⚠️ Go not found or build failed, skipping search-sidecar. Install Go 1.22+ to enable.')
  }
} else {
  console.warn('⚠️ search-sidecar/main.go not found, skipping.')
}

console.log('🚀 Step 1/4: [studio] building renderer (YOGATIK_EDITION=studio)…')
run('npx', ['vite', '--configLoader', 'runner', 'build', '--base=./', '--outDir', 'dist-electron'])

console.log('🔨 Step 2/4: [studio] compiling TypeScript main process (optional)…')
if (fs.existsSync(path.join(root, 'tsconfig.main.json'))) {
  if (tryRun('npx', ['tsc', '-p', 'tsconfig.main.json'])) {
    console.log('✅ Main process TypeScript compiled')
  } else {
    console.warn('⚠️ TypeScript compilation skipped (using .cjs main process).')
  }
} else {
  console.log('ℹ️ tsconfig.main.json not found, using .cjs main process.')
}

console.log('📦 Step 3/4: [studio] packaging installer with electron-builder…')
const releaseDir = path.join(root, 'release-studio')
const unpackedDir = path.join(releaseDir, 'win-unpacked')
const targetExe = path.join(unpackedDir, 'Yogatik Studio.exe')

try {
  const oldSetup = path.join(releaseDir, 'Yogatik-Studio-Setup.exe')
  if (fs.existsSync(oldSetup)) fs.rmSync(oldSetup, { force: true })
} catch {}

let builderSucceeded = false
try {
  run('npx', ['electron-builder', '--config', 'electron-builder.studio.json', '--win', 'nsis', '--publish', 'never'])
  builderSucceeded = true
} catch (e) {
  console.warn('[studio] electron-builder encountered an issue, falling back to manual portable assembly...')
}

if (!builderSucceeded || !fs.existsSync(targetExe)) {
  console.log('📦 Step 4/4: [studio] assembling portable unpacked executable fallback…')
  const electronDistDir = path.join(root, 'node_modules', 'electron', 'dist')
  fs.mkdirSync(unpackedDir, { recursive: true })
  if (fs.existsSync(electronDistDir)) {
    fs.cpSync(electronDistDir, unpackedDir, { recursive: true })
    const defaultExe = path.join(unpackedDir, 'electron.exe')
    if (fs.existsSync(defaultExe)) {
      if (fs.existsSync(targetExe)) fs.rmSync(targetExe, { force: true })
      fs.renameSync(defaultExe, targetExe)
    }
  }

  const appDestDir = path.join(unpackedDir, 'resources', 'app')
  if (fs.existsSync(appDestDir)) fs.rmSync(appDestDir, { recursive: true, force: true })
  fs.mkdirSync(appDestDir, { recursive: true })
  fs.cpSync(dist, path.join(appDestDir, 'dist-electron'), { recursive: true })
  fs.cpSync(path.join(root, 'electron'), path.join(appDestDir, 'electron'), { recursive: true })
  fs.writeFileSync(path.join(appDestDir, 'edition.json'), editionConfig)
  fs.writeFileSync(path.join(unpackedDir, 'edition.json'), editionConfig)

  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const minimalPkg = {
    name: 'yogatik-studio',
    productName: 'Yogatik Studio',
    yogatikEdition: 'studio',
    version: pkgJson.version || '3.20.0',
    main: 'electron/main.cjs',
    type: 'module',
  }
  fs.writeFileSync(path.join(appDestDir, 'package.json'), JSON.stringify(minimalPkg, null, 2))
}

console.log(`\n✅ [studio] Yogatik Studio Build Complete!
   Unpacked Standalone Executable: ${targetExe}
   Setup Installer:                ${path.join(releaseDir, 'Yogatik-Studio-Setup.exe')}

   Features:
   - 100% Unrestricted Studio Edition (Zero license key, zero subscription prompt, all developer tools unlocked)
   - Independent Isolated Profile (Runs alongside other builds)
`)