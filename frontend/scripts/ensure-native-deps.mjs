#!/usr/bin/env node
/**
 * Self-heals the exact failure this project's own CLAUDE.md history
 * documents dozens of times over: "Windows-only native rollup/esbuild
 * binaries in the mounted node_modules, and a scoped Linux install of them
 * timed out" / "the checked-out node_modules has Windows-platform rollup/
 * esbuild native binaries (@rollup/rollup-win32-x64-msvc, not
 * -linux-x64-gnu)". Every one of those entries ends the same way: real
 * verification was skipped, and a standalone hand-reproduction stood in for
 * `npm test`/`npm run build` actually running. This is the fix for the
 * ROOT CAUSE, not another workaround for its absence.
 *
 * Root cause is a well-known npm bug (npm/cli#4828): rollup and esbuild ship
 * their native binary as a per-platform OPTIONAL dependency, and when a
 * package-lock.json resolved on one OS/arch/libc is later installed against
 * (or node_modules is copied onto) a different one, npm's own optional-
 * dependency resolution can silently install the wrong platform's binary,
 * or none at all. `npm ci`/`npm install` still reports success — the
 * failure only shows up later, opaquely, the first time Vite/Vitest tries
 * to actually load the native module ("Cannot find module
 * @rollup/rollup-linux-x64-gnu. This is a known issue... you can try
 * `npm rebuild` or delete node_modules...").
 *
 * This runs as part of `postinstall`, right after the real install. It
 * checks whether THIS process's own platform/arch can actually resolve the
 * rollup and esbuild native package it needs, and if not, fetches exactly
 * that one package with a plain `npm install --no-save` — using the SAME
 * version already pinned for rollup/esbuild themselves, read at runtime, so
 * this can never drift from a future upgrade. It only ever ADDS the missing
 * platform package; it never removes or touches anything else, so running
 * it again on an already-healthy install is a fast no-op.
 *
 * This can fail (offline, a registry outage, a platform this file's map
 * does not know) — and MUST NEVER take `npm install` down with it. Every
 * failure here is a warning, never a thrown error or a non-zero exit.
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)

/** The version this project already pins for `pkgName`, read from whatever
 * copy actually resolves — never hand-typed, so it can't go stale. */
function pinnedVersion(pkgName) {
  try {
    return require(require.resolve(`${pkgName}/package.json`)).version
  } catch {
    return null
  }
}

/** Best-effort glibc/musl detection. Unknown or undetectable defaults to
 * glibc — overwhelmingly the common case — rather than guessing musl. */
function isMuslLibc() {
  try {
    const { familySync, MUSL } = require('detect-libc')
    return familySync?.() === MUSL
  } catch {
    return false
  }
}

/** Node's platform/arch → the exact optional-package suffix rollup and
 * esbuild each publish. Two different schemes: rollup encodes libc
 * (gnu/musl) on Linux, esbuild does not. */
function nativeTargets() {
  const key = `${process.platform}-${process.arch}`
  const musl = isMuslLibc()
  const rollupMap = {
    'linux-x64': musl ? 'linux-x64-musl' : 'linux-x64-gnu',
    'linux-arm64': musl ? 'linux-arm64-musl' : 'linux-arm64-gnu',
    'darwin-x64': 'darwin-x64',
    'darwin-arm64': 'darwin-arm64',
    'win32-x64': 'win32-x64-msvc',
    'win32-arm64': 'win32-arm64-msvc',
  }
  const esbuildMap = {
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
    'darwin-x64': 'darwin-x64',
    'darwin-arm64': 'darwin-arm64',
    'win32-x64': 'win32-x64',
    'win32-arm64': 'win32-arm64',
  }
  return {
    rollup: rollupMap[key] ? `@rollup/rollup-${rollupMap[key]}` : null,
    esbuild: esbuildMap[key] ? `@esbuild/${esbuildMap[key]}` : null,
  }
}

function isResolvable(pkgName) {
  try { require.resolve(pkgName); return true } catch { return false }
}

function npmBin() {
  // `execFileSync('npm', …)` fails on Windows: npm there is a .cmd/.ps1
  // shim, not a directly-executable file — the same class of platform trap
  // this whole script exists to route around.
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function run() {
  const targets = nativeTargets()
  const toInstall = []

  for (const [pkg, dep] of [[targets.rollup, 'rollup'], [targets.esbuild, 'esbuild']]) {
    if (!pkg || isResolvable(pkg)) continue
    const v = pinnedVersion(dep)
    toInstall.push(v ? `${pkg}@${v}` : pkg)
  }

  if (!toInstall.length) return // the common, healthy case — silent no-op

  console.log(
    `[ensure-native-deps] ${process.platform}-${process.arch} is missing: ${toInstall.join(', ')} ` +
    `(this is npm/cli#4828 — a lockfile resolved on a different platform). Installing…`
  )
  execFileSync(npmBin(), ['install', '--no-save', '--no-audit', '--no-fund', '--ignore-scripts', ...toInstall], { stdio: 'inherit' })
  console.log('[ensure-native-deps] Done.')
}

try {
  run()
} catch (e) {
  // Never fail the install over this — a missing native binary surfaces
  // clearly the moment `vite`/`vitest` actually runs, with npm's own actionable
  // error; this script is a best-effort head start on fixing it, not a gate.
  console.warn(`[ensure-native-deps] Skipped: ${e?.message || e}`)
  console.warn('[ensure-native-deps] If `npm test`/`npm run build` later fails with "Cannot find module @rollup/..." or "@esbuild/...",')
  console.warn('[ensure-native-deps] delete node_modules and package-lock.json and run `npm install` fresh on this machine.')
}
