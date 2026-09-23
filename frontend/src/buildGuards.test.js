// @vitest-environment node
//
// Node, not jsdom: esbuild refuses to start when TextEncoder does not produce a
// real Uint8Array, which is exactly what jsdom's globals do to it.
/**
 * Guards for mistakes that only surface at BUILD time.
 *
 * vitest transforms each test's own import graph, so a file can be broken for
 * `vite build` and every test still passes. That is exactly what happened: a
 * hook holding JSX was saved as `.js` and imported from main.jsx, which made
 * `npm run build` (and `npm run dev`) fail outright while the suite stayed green.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname does not exist in an ES module (and the browser-env lint rules do
// not define it either).
const SRC = path.dirname(fileURLToPath(import.meta.url))

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

describe('reachability', () => {
  it('every component is imported by something', () => {
    // Five finished panels — the terminal, the scheduler, the sub-agent runner,
    // the auto-skills reviewer and the file editor — sat in the tree with no
    // import anywhere, so no user could open them. Their TOOLS were registered,
    // so the model could use each capability while the UI half stayed dark;
    // nothing failed, and no test noticed.
    const files = walk(SRC).filter(f => !f.includes('.test.'))
    const components = files.filter(f => f.includes(`${path.sep}components${path.sep}`) && f.endsWith('.jsx'))
    const corpus = files
      .filter(f => !components.includes(f))
      .map(f => fs.readFileSync(f, 'utf8'))
      .join('\n')
    const componentCorpus = components.map(f => ({ f, src: fs.readFileSync(f, 'utf8') }))

    // A bare substring is NOT evidence of an import. It let two finished
    // components through: StreamingMessage was "reached" by a code COMMENT
    // naming it, and Tour by the prose "Interactive Tour" in a button label.
    // Only an import of the module counts.
    const importsModule = (src, name) => {
      const spec = String.raw`['"][^'"]*\/${name}(?:\.jsx)?['"]`
      return new RegExp(String.raw`(?:from\s+${spec})|(?:import\s*\(\s*${spec}\s*\))|(?:require\(\s*${spec}\s*\))`).test(src)
    }

    const orphans = components.filter((file) => {
      const name = path.basename(file, '.jsx')
      if (importsModule(corpus, name)) return false
      // A component may be reached only through another component.
      return !componentCorpus.some(({ f, src }) => f !== file && importsModule(src, name))
    }).map(f => path.relative(SRC, f))

    // AdModal is deliberately not rendered: the AdSense interstitial is switched
    // off pending a decision about ads in the desktop build. Anything else in
    // this list is a feature the user cannot reach.
    // TerminalPanel.jsx is RETIRED, not merely unrendered: TerminalDrawer +
    // terminal/ replaced it. The file is a re-export stub so a stale import
    // cannot break a build, and it is listed here so its retirement is visible
    // rather than looking like a feature nobody can reach. Delete the file, its
    // test and electron/pty.cjs, then remove this entry.
    const allowed = new Set([
      path.join('components', 'AdModal.jsx'),
      path.join('components', 'TerminalPanel.jsx'),
      path.join('components', 'ContextMeter.jsx'),
      path.join('components', 'McpModal.jsx'),
      path.join('components', 'EmptyState.jsx'),
      path.join('components', 'EmptyStates.jsx'),
      path.join('components', 'OnboardingTour.jsx'),
      path.join('components', 'SkeletonLoaders.jsx'),
      path.join('components', 'ToastContainer.jsx'),
      // LivePill.jsx is an UNSHIPPED alternative Live HUD: 112 lines and 13
      // stylesheet rules, and nothing renders it, while the HUD that IS
      // rendered (LiveHudOverlay) styles itself inline. Either wire it or
      // delete it and its CSS — it is listed here so that choice stays visible
      // instead of looking like a feature nobody can reach.
      path.join('components', 'LivePill.jsx'),
      // ComfyPanel.jsx: removed from PersonalisePanel on request (it read as
      // depending on an "external API" — it does not, ComfyUI is a local
      // server on the user's own machine, but the confusion is the point:
      // an optional local-generation SETUP card in Personalise is not worth
      // that misreading). The component itself still works and is kept,
      // unrendered, the same way AdModal.jsx sits here — comfy.js and
      // tools/localGen.js's local_image_generate/local_video_generate tools
      // are unaffected and still configure themselves via comfyStatus() if
      // ComfyUI is already running on its default port.
      path.join('components', 'ComfyPanel.jsx'),
      path.join('components', 'FileBrowser.jsx'),
      path.join('components', 'FilePicker.jsx'),
    ])
    // ArtifactCanvas.jsx was listed here too. It is imported (App.jsx), so
    // allowlisting it did nothing except widen the hole this guard exists to
    // close: an entry for a reachable component silences the guard for that
    // name forever, and the next time someone stops rendering it nothing
    // says so.
    expect(orphans.filter(f => !allowed.has(f))).toEqual([])
  }, 30000)

  it('every module under src/ is reachable from main.jsx', async () => {
    // The check above only ever looked at components/, and it matched by
    // reading source text — so a plain .js module could die in total silence.
    // vision/macroEnhancer.js did exactly that: 81 lines of pixel maths, a
    // green test of its own, and not one importer anywhere in the app.
    //
    // This asks the real question instead of a textual approximation: bundle
    // the actual entry point and ask esbuild which files it reached. An import
    // that only appears in a comment, a string, or another dead module does not
    // count, which is the flaw that let StreamingMessage and Tour hide behind a
    // substring match for weeks.
    const esbuild = await import('esbuild')
    const result = await esbuild.build({
      entryPoints: [path.join(SRC, 'main.jsx')],
      bundle: true,
      write: false,
      // Nothing is written (write:false), but esbuild still refuses to resolve
      // main.jsx's `import './styles.css'` without somewhere to have put it.
      outdir: path.join(SRC, '..', '.guard-out'),
      metafile: true,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
      loader: { '.js': 'jsx' },
      define: { 'process.env.NODE_ENV': '"production"' },
    })

    const norm = (p) => p.split(path.sep).join('/')
    const root = norm(path.dirname(SRC)) + '/'
    const reached = new Set(
      Object.keys(result.metafile.inputs)
        .map(p => norm(path.resolve(path.dirname(SRC), p)))
        .filter(p => p.startsWith(norm(SRC) + '/'))
    )

    // A `new Worker(new URL('./x.js', import.meta.url))` is a real reference
    // that a plain bundle cannot follow. Resolve those by hand or every worker
    // reads as dead.
    const workerRefs = new Set()
    for (const f of walk(SRC).filter(f => /\.(js|jsx)$/.test(f) && !f.includes('.test.'))) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(/new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url/g)) {
        workerRefs.add(norm(path.resolve(path.dirname(f), m[1])))
      }
    }

    const all = walk(SRC)
      .filter(f => /\.(js|jsx)$/.test(f) && !f.includes('.test.'))
      .map(norm)

    const dead = all
      .filter(f => !reached.has(f) && !workerRefs.has(f))
      .map(f => f.slice(root.length))

    // Everything here is dead ON PURPOSE, and the reason is the point — an
    // entry with no reason is how an allowlist quietly becomes a graveyard.
    // The previous version of the components check had grown entries for
    // ArtifactCanvas and LiveHudOverlay, both of which ARE imported, which
    // silenced the guard for those names forever in exchange for nothing.
    const allowed = new Set([
      // RETIRED — a re-export stub kept so a stale import cannot break a build.
      // Delete the file, its test, and this line together.
      'src/components/TerminalPanel.jsx',   // → terminal/ + TerminalDrawer

      // Deliberately not rendered: the AdSense interstitial is switched off.
      'src/components/AdModal.jsx',

      // DELETED rather than listed, because a superseded duplicate is pure
      // maintenance the app pays for and nobody uses: Toast.jsx,
      // ToastContainer.jsx (hooks/useToast.jsx does this), EmptyState.jsx,
      // EmptyStates.jsx, SkeletonLoaders.jsx, OnboardingTour.jsx (Tour.jsx is
      // the one wired to the palette), computeWorker.js and both
      // workers/*.worker.js, promptEnhancer.js (api.enhancePromptText is what
      // the composer calls) and memoryPaging.js. The spawnSubagent and
      // macroEnhancer stubs went too — nothing imported them, and their tests
      // are renamed to name what they actually cover (toolRegistry, sharpen).
      // All were git-tracked, so `git show HEAD:<path>` brings any of them back.
      //
      // ContextMeter.jsx is NOT here any more: it is wired into the sidebar,
      // and it reads compaction.js's limits instead of keeping a second copy
      // that disagreed with the table the agent actually budgets against.
      //
      // tools/rebuffGuard.js was here too — a prompt-injection detector nothing
      // called. It is wired into agent.js now (guardExternal), so it must NOT
      // be listed: the reverse check below fails on an allowlist entry for a
      // reachable file, which is what keeps this list honest.

      // Kept only because each still has a test naming it, so deleting the
      // module means deciding about the test too:
      'src/downloadConsent.js',             // consent is the features.* toggle (setLocalVLMConsent / setSemanticConsent); enhancements.test.js covers it
      'src/analyticsSink.js',               // initAnalyticsFromSettings is never called, so analytics is inert (it is opt-in anyway)
      'src/experiments.js',                 // getVariant/trackOutcome called by nothing; phase1.test.js covers it
      'src/components/McpModal.jsx',        // retired wrapper: McpServers hosted directly in DashboardShell

      // BUILT, NEVER WIRED, and worth a decision:
      'src/tools/stagehandHealing.js',      // self-healing selector fallback — the browser tool refuses a stale ref outright instead
      'src/components/LivePill.jsx',        // an alternative Live HUD, 112 lines + 13 CSS rules; UNTRACKED, so deleting it is unrecoverable
      'src/components/ComfyPanel.jsx',      // removed from PersonalisePanel on request; comfy.js + local_image_generate/local_video_generate still work unattended
      'src/components/FileBrowser.jsx',     // modular workspace file browser
      'src/components/FilePicker.jsx',      // modular workspace file picker
      'src/tools/fsFacade.js',              // filesystem facade for workspace operations
      'src/responseCache.js',               // semantic response caching module
    ])

    expect(dead.filter(f => !allowed.has(f)).sort()).toEqual([])
    // And the reverse: an allowlist entry for a file that IS reachable is worse
    // than no entry, because it disables the guard for that name silently.
    expect([...allowed].filter(f => reached.has(root + f)).sort()).toEqual([])
  }, 120000)

  it('App does not hold in-flight streaming text in React state', () => {
    // This regressed once: App kept `streamingMap` and setState'd it on every
    // token, so each frame re-rendered the sidebar, the composer and all 40
    // MessageBubbles (each re-running ReactMarkdown) for text that only ever
    // appears in one div. The text belongs in a ref pushed into
    // <StreamingMessage/>; App state may hold only the has-text boolean.
    const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8')
    expect(app).toMatch(/from\s+['"]\.\/components\/StreamingMessage['"]/)
    expect(app).not.toMatch(/setStreamingMap/)
  })
})

describe('build guards', () => {
  it('every .js file parses as plain JS — JSX in a .js file breaks the build', async () => {
    // Parse with the same tool the build uses instead of pattern-matching for
    // "<": HTML inside template literals looks like JSX to a regex and does not
    // bother esbuild at all.
    const esbuild = await import('esbuild')
    const offenders = []
    for (const file of walk(SRC)) {
      if (!file.endsWith('.js')) continue
      const code = fs.readFileSync(file, 'utf8')
      try {
        esbuild.transformSync(code, { loader: 'js', format: 'esm' })
      } catch (e) {
        offenders.push(`${path.relative(SRC, file)}: ${String(e.message).split('\n')[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
