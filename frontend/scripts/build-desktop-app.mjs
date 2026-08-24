import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendRoot = path.resolve(__dirname, '..')

console.log('🚀 Step 1/3: Building web assets for Electron runtime...')
execSync('npm run build:electron', { cwd: frontendRoot, stdio: 'inherit' })

const releaseDir = path.join(frontendRoot, 'release-electron')
const unpackedDir = path.join(releaseDir, 'win-unpacked')
const electronDistDir = path.join(frontendRoot, 'node_modules', 'electron', 'dist')
const targetExe = path.join(unpackedDir, 'Yogatik.exe')

if (!fs.existsSync(electronDistDir)) {
  console.error(`❌ Error: Electron runtime dist not found at ${electronDistDir}`)
  process.exit(1)
}

console.log('📦 Step 2/3: Checking native desktop runtime binaries...')
fs.mkdirSync(unpackedDir, { recursive: true })

if (!fs.existsSync(targetExe)) {
  console.log('📦 Copying Electron runtime binaries...')
  fs.cpSync(electronDistDir, unpackedDir, { recursive: true })
  const defaultExe = path.join(unpackedDir, 'electron.exe')
  if (fs.existsSync(defaultExe)) {
    fs.renameSync(defaultExe, targetExe)
  }
}

console.log('📄 Step 3/3: Bundling application code into resources/app...')
const appDestDir = path.join(unpackedDir, 'resources', 'app')
fs.mkdirSync(appDestDir, { recursive: true })

// Copy dist-electron
fs.cpSync(path.join(frontendRoot, 'dist-electron'), path.join(appDestDir, 'dist-electron'), { recursive: true })

// Copy electron directory
fs.cpSync(path.join(frontendRoot, 'electron'), path.join(appDestDir, 'electron'), { recursive: true })

// Create minimal package.json for runtime
const minimalPkg = {
  name: 'yogatik',
  version: '3.11.0',
  main: 'electron/main.cjs',
  type: 'module',
}
fs.writeFileSync(path.join(appDestDir, 'package.json'), JSON.stringify(minimalPkg, null, 2))

console.log('🕒 Step 4/4: Updating file modification timestamps to current build time...')
function touchDirectory(dir, date) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      try {
        fs.utimesSync(fullPath, date, date)
      } catch {}
      if (entry.isDirectory()) {
        touchDirectory(fullPath, date)
      }
    }
  } catch {}
}
const now = new Date()
touchDirectory(unpackedDir, now)
try {
  fs.utimesSync(targetExe, now, now)
} catch {}

console.log('✅ Desktop App Build Complete!')
console.log(`🎉 Direct Executable is ready at: ${targetExe}`)
