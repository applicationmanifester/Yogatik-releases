// Vitest has no --configLoader flag and its default (esbuild) loader cannot run
// here — it leaves vitest.config.js.timestamp-*.mjs turds behind. So the config
// is imported directly and handed to vitest with config:false.
// It must NOT be re-declared inline: the old copy dropped setupFiles, so global
// DOMParser was missing under `npm test` only, and the search parsers silently
// fell back to bundling jsdom into the browser build.
import { startVitest } from 'vitest/node'
import config from '../vitest.config.js'

const args = process.argv.slice(2)
const watch = args.includes('--watch') || args.includes('-w')
const filters = args.filter(a => !a.startsWith('-'))

// The config goes in as viteOverrides: `test` inside CLI options is ignored, so
// the old inline copy silently ran every test in the NODE environment.
const vitest = await startVitest('test', filters, { config: false, watch, run: !watch }, config)
if (!watch) process.exit(vitest?.state?.getCountOfFailedTests() ? 1 : 0)
