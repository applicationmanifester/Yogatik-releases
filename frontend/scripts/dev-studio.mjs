#!/usr/bin/env node
// Run the desktop app in STUDIO mode against whatever is already in
// dist-electron (or the dev server, exactly as `npm run electron:dev` does).
// Everything unlocked, no sign-in, no licence, no network call.
//
//   npm run electron:dev:studio

import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const r = spawnSync('npx', ['electron', '.'], {
  cwd: root,
  env: { ...process.env, YOGATIK_EDITION: 'studio' },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(r.status ?? 0)
