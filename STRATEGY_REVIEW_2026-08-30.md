# Yogatik — CEO review, code audit, forecast

v3.22.0 · 30 Aug 2026 · 203 tools · ~1550 tests · 175 uncommitted files

---

## 1. The verdict in one paragraph

The engineering is better than the business. This codebase does things Cursor and
Claude Code do not — a real browser it drives, a floating screen companion, on-device
vision, live voice, per-chat working folders, an entitlement gate — and it does them
with an unusual discipline: nearly every hard-won bug is written down next to the code
that had it. What it does not have is a *sentence*. There is no one thing a stranger can
repeat to another stranger. 203 tools is not a positioning; it is the absence of one.
The next 90 days should remove surface area, not add it.

---

## 2. What the audit found

Every item below was reproduced, not inferred. Full app re-bundles clean after the fixes
(esbuild, 0 errors); pure logic re-verified by direct execution.

### Fixed

| # | Defect | Impact |
|---|---|---|
| 1 | `MAX_TOOLS_PER_REQUEST` 64 → `Infinity` | All 203 tool schemas (~36k tokens) sent every turn. **OpenAI hard-caps a request at 128 functions — this 400s the turn**, it does not merely cost more. Now 96. |
| 2 | `agentPool` limits → `Infinity`; `configureConcurrency` failed **open** on `0`/invalid | The one global semaphore protecting against provider 429s was disabled. A 40-item map_reduce fired 40 concurrent requests. Restored to 1–16 clamp, bad input clamps safe. |
| 3 | `max_tool_rounds`: `> 20 ? configured : Infinity` | **Backwards.** Every value ≤20 — including the default 8 and the whole shallow end of the "Answer depth" slider — became *unbounded*. Runaway loops on the user's own API key; the forced-final synthesis could never fire. |
| 4 | `spawn_subagent` | Shipped dead: `executeTool` never passes `opts.provider`, so every worker went to the `local` WebLLM provider regardless of the chat. Workers had **no tools** while the schema promised parallel search. Outside agentPool. Timeout never aborted the request. Retired to an alias of `spawn_agents`. |
| 5 | `getModelPricing` substring match in literal order | `gpt-4o-mini` billed as `gpt-4o` — **16.7x overstated**; `o1-mini` 5x. In every collision the *cheap* model is billed as the expensive one, steering users off the model they should pick. Sorted longest-first. |
| 6 | `onEnhanceMacro` vs `onEnhanceContrast` | Live HUD's Enhance button never rendered. Silent — the control is behind `{prop && …}`. |
| 7 | `vision/macroEnhancer.js` | Duplicate of `preprocess.js` maths, imported by nothing, with a passing test. Its unsharp mask (the thing that makes an *engraved* pill imprint legible) folded in as a real OCR variant. |
| 8 | `eval.yml` ran `npx vitest` | The documented-broken path — drops setupFiles, runs in the node env. It does not fail; it reports green on the wrong thing. Routed through `npm test --`. |
| 9 | `FRAME_MS` 750 vs documented 1fps API ceiling | Extra frames dropped server-side, still encoded and pushed locally. |
| 10 | buildGuards orphan allowlist | Covered two components that are actually imported, permanently silencing the guard for those names. |

### Fixed — second pass

| # | Defect | Impact |
|---|---|---|
| 11 | Orphan guard only covered `components/`, and matched by **source text** | Widened to a real esbuild-metafile reachability check from `main.jsx`. Result: **305 of 327 modules reachable — 21 dead**, 13 of which no previous guard could ever have seen. All allowlisted with a stated reason. |
| 12 | `chatExport.js` was in that dead set | The entire v3.8 md/html/pdf export was unreachable. App hand-rolled markdown instead and set `a.download = data.filename` — a field `exportConversation` has never returned, so **every saved chat downloaded as an extension-less file named "download"**. Now routed through `downloadChat`, with HTML and PDF in the palette. |
| 13 | Two usage meters called from **different** places | The primary streaming path wrote only the IndexedDB rollup; only the *fallback* path wrote the localStorage per-turn record. The cost dashboard was already showing the cost of the minority of turns that had failed over, labelled as the total. One `recordTurn()` choke point now writes both. |
| 14 | `src/tools/registry.ts` bare `new RegExp` on a model-supplied pattern | Catastrophic backtracking holds the thread — no timeout, AbortSignal or try/catch can rescue it. Structural guard added (mirroring `safeRegex.cjs`), plus input and match caps. Also fixed: `matchAll` throws without `g`, so `flags:'i'` surfaced as an opaque failure. |

### Fixed — third pass

| # | Defect | Impact |
|---|---|---|
| 15 | `tools/rebuffGuard.js` reached by nothing | A prompt-injection detector and canary-leak check that **had never run**. Now wired at the correct seam — the last point before untrusted bytes become context, on both the native `role:'tool'` path and the prompted replay. Non-blocking: a matched directive is replaced with a visible marker and the model is told the guard ran. Local tools (`fs_*`, `terminal_run`, `code_execute`) are excluded — that output is the user's own machine, and marking it up would corrupt real file contents. |
| 16 | 9 dead modules with no test and no importer | Deleted (all git-tracked, so `git show HEAD:<path>` recovers any): `Toast`, `ToastContainer`, `EmptyState`, `EmptyStates`, `SkeletonLoaders`, `OnboardingTour`, `computeWorker`, and both `workers/*.worker.js`. Dead list is 21 → 12. |
| 17 | `askUserTool.execute({...})` had no `= {}` on the parameter | A no-argument call threw `Cannot destructure property 'question' of undefined` — a raw TypeError the model can't act on, so it retries the same broken call. Every other tool in the registry is total on missing args. |

Also cross-checked and **clean**: all 158 `ipcMain.handle` channels appear in `preload.cjs`
*and* in the entitlement capability matrix; no bridge is called from `src/` without being
exposed. (Note the matrix uses bare object keys, so a naive grep for quoted strings reports
50 false positives — it is fine.)

### Fixed — browser automation pass

The browser subsystem is the strongest thing in the product, so it got its own audit.
Seven defects and one missing capability:

| # | Defect | Impact |
|---|---|---|
| 18 | **`<select>` could not be set at all** | A native dropdown is an OS-level popup `sendInputEvent` cannot reach, so `type` at one did nothing *and returned success*. Every form with a country, quantity or date dropdown was silently unfillable. New `select` action wired end to end; matches by value → label → case-insensitive label → index, and on no match returns the real options. |
| 19 | `hover` fell back to `click` | Hover is the *read-only* action. Substituting a click can navigate, submit or buy — and it reported success. Never substitute a side-effecting action for a safe one. |
| 20 | `type` appended instead of replacing | Re-using a search box produced `"londonnew york"` with no error. Now clears by default when a ref names the field — via select-all + Delete, because a controlled React input ignores a programmatic `.value` assignment. |
| 21 | `submit` sent keyDown without keyUp | "Type and press Enter" worked on some forms and silently did nothing on others. |
| 22 | `evaluate` retried on **any** rejection | `document.querySelector('#buy').click()` that threw after clicking **ran twice**. Retries only on a SyntaxError now. Result also capped at 100k chars — `document.body.innerHTML` is megabytes, all of it landing in context. |
| 23 | `fill_form` always returned `success: true` | A form where every field failed read as filled, and the model went on to submit it. |
| 24 | `run_script` had no depth guard | A step whose action was `run_script` recursed until the stack blew. A model writing a nested pipeline is doing the obvious thing. |
| 25 | `storage` read the store name from `text` | `{action:'storage', type:'session'}` silently returned localStorage and the model reported it as fact. |

Cross-checked clean afterwards: 28 browser channels, all present in main, preload and the
entitlement matrix; every `b.<method>()` the tool calls exists on the bridge; the action
list agrees across `VALID_ACTIONS`, the schema enum and the switch; no alias shadows a real
action (notably `select` vs `select_tab`).

### Fixed — dead-code pass

| # | Defect | Impact |
|---|---|---|
| 26 | **A third context-limits table** | `ContextMeter.jsx` kept its own copy, independent of `compaction.js` — the table `agent.js` actually budgets and compacts against. They agreed everywhere except `local`: 8192 vs 4096. A wired meter would have shown **twice the headroom the user had** while the agent compacted their history away. Now reads compaction.js; a test asserts the two agree per provider. |
| 27 | ContextMeter was never rendered | Now wired into the sidebar under the model picker (not the header — that already overflows at 480px), memoised so walking every message and stringifying every tool result doesn't happen per keystroke. |
| 28 | A stale ref cost two extra turns | Refusing is right, but refusing *alone* means one turn to re-read and one to retry. Click/type/select now return `page_after_reload` — the freshly-read tree — with the refusal. Only on `stale`, never on an ordinary failure. |
| 29 | 14 more dead modules | Deleted with their tests: `promptEnhancer` (superseded by `api.enhancePromptText`), `memoryPaging`, and the two retirement stubs. Dead list **21 → 7**. |

### Still open — deliberately

Seven modules remain dead, each with a stated reason in the guard:

- **`LivePill.jsx`** — 112 lines + 13 stylesheet rules. **Untracked in git**, so deleting it
  is unrecoverable. Wire it or delete it yourself.
- **`AdModal.jsx`** — ads are deliberately off. **`TerminalPanel.jsx`** — retirement stub.
- **`downloadConsent`, `analyticsSink`, `experiments`** — each still has a test naming it,
  so removing the module means deciding about the test too. All three are inert by design
  (consent runs through the feature toggles; analytics is opt-in and unconfigured).
- **`stagehandHealing.js`** — self-healing selector fallback. The stale-ref fix above covers
  the case it was written for, so it is now redundant rather than missing.

### One pattern, five times now

`agentPool.test.js` had been rewritten to assert `configureConcurrency(0) === Infinity` —
it pinned a rate-limit guard *failing open*. That is the fifth instance in this repo's own
notes: the TerminalPanel PTY mock, the `startLine/endLine` fs mock, the `/988/` crisis
assertion, the old `spawnSubagent` mock, and now this. **A test written after the code, from
the code, tests nothing.** The four that caught real bugs (`schemaContract`, `dbContract`,
`cardContract`, `gitWriteGuard`) were all written to assert an *invariant a human stated*,
mechanically, across every case. Keep writing that kind and stop writing the other kind.

---

## 3. CEO read

### The moat is real but unnamed

Three things here are genuinely hard to copy:

1. **BYOK + local-first.** No backend, no inference margin, no data leaving the device.
   Cursor/Windsurf are $20/mo *because* they resell tokens. You structurally cannot be
   undercut on that axis.
2. **The desktop capability surface.** A driven browser with ref-stable element targeting,
   a shared agent/human terminal, per-chat working folders, OS keychain sealing, a journal
   that makes destructive ops reversible. Most BYOK chat apps (Jan, LM Studio, AnythingLLM)
   are a text box.
3. **The written failure record.** CLAUDE.md is the highest-value asset in the repo and it
   is not a product. It is why a solo founder can still move fast at 500 files.

### The problem is that all three are invisible

"203 browser-native tools" is a feature list, and a feature list is what you write when you
have not chosen. Competitors have one sentence each: Cursor is *the AI code editor*, Claude
Code is *the terminal agent*, Jan is *fully offline and open source*, LM Studio is *run a
model locally with a nice UI*. Yogatik is currently *all of them, slightly*.

### Pick one wedge

Judged on defensibility, willingness to pay, and how much of what you've built it uses:

| Wedge | For | Uses | Risk |
|---|---|---|---|
| **Private desktop agent for regulated work** (law, health, finance, gov) | People who cannot send documents to a vendor cloud | Local vault, BYOK, journal, desktop FS, entitlement | Slow sales cycle; needs one credible reference customer |
| **The screen companion** | Anyone doing repetitive on-screen work | Companion window, vision pipeline, computer_control | Ambitious; the hardest to make reliable |
| **BYOK power-user desktop** | Devs who already pay per-token and resent $20/mo | Everything already built | Crowded; low willingness to pay |

**Recommendation: the first.** It is the only one where "no backend, nothing leaves the
device, and here is a reversible journal of every file the agent touched" is not a nice
property but the *entire purchase reason* — and it is the only one where ₹99/$2 is
obviously underpriced rather than obviously cheap.

### Pricing

₹99/₹999 and $2/$12 is priced against *the effort to crack it*, which the monetization doc
argues correctly. But it also prices against nothing else. At $2/mo you need ~50,000 paying
users to reach $1.2M ARR; at $20/mo you need 5,000. For a solo founder, 5,000 customers is
a reachable number and 50,000 is a company. The BYOK story means the buyer's *total* cost is
already lower than Cursor even at $15 — they are paying tokens either way.

- Keep the ₹99 India tier. It is right for that market and the geographic split is already built.
- Raise international to **$12/mo, $99/yr**, once the wedge above is chosen. Do not raise it
  while the pitch is still "203 tools".
- The 30-day trial is right. Do not shorten it; the value here takes a week to become obvious.

### Forecast — 12 months, the honest version

- **Most likely (~60%):** the product stays excellent and stays unknown. Revenue in the low
  four figures. Not a product problem; a distribution problem. The single highest-leverage
  hour you can spend this quarter is not on code.
- **Upside (~25%):** the wedge lands, one vertical adopts, $8–15k MRR. Requires saying no to
  four out of every five feature ideas.
- **Downside (~15%):** the frontier vendors ship the desktop capability surface for free
  (Anthropic and OpenAI both already ship desktop apps with file and computer access), and
  BYOK stops being a differentiator because their bundled pricing is cheaper than tokens.
  **This is the real risk and the clock is running.** The defence is the vertical, not more
  tools — a vendor will never ship "runs entirely on your machine and touches no cloud."

### The thing to fix that is not code

Seven parallel trees: `frontend/`, `src/`, `apps/`, `packages/`, `monorepo/`,
`electron-app/`, `web-app/`, `electron-web-monorepo/`, `terminal/`. `frontend/src` has 520
files; everything else combined has ~200 and includes a *second* tool registry with its own
regex bug. One of these is the product. The rest are drafts that will each demand a share of
every future fix. Delete or archive them this week — it is the cheapest velocity you will buy
all quarter.

---

## 4. Next 90 days

**Weeks 1–2 — stop the bleeding**
1. Run `npm test` locally and get to green (see §5 — the audit sandbox could not run it).
2. Commit the 175 outstanding files in reviewable chunks. A 21,000-line uncommitted diff is
   an outage waiting for a bad night.
3. Delete or archive the six dead trees.
4. Decide the two-usage-meters question; fix the `registry.ts` regex or delete that tree.

**Weeks 3–6 — choose and cut**
5. Write the one sentence. Put it on the landing page and in `buildSystemPrompt`.
6. Cut the tool registry from 203 toward ~120. With a 96 cap, tools past the ranking are
   already invisible most turns — they cost maintenance and buy nothing. Rank by actual
   invocation counts (you have `usageAnalytics`; start recording tool names).
7. Widen the orphan guard to `src/**/*.js`. Every dead module found is a maintenance refund.

**Weeks 7–12 — distribution**
8. Ship the licence server (Blaze plan, keypair, provider accounts — §11 of MONETIZATION).
   Until then there is no revenue path at all, only a paywall with nothing behind it.
9. Ten conversations with people in the chosen vertical, before any more features.
10. One public artifact — the journal-backed reversible agent demo is the most striking
    thing here and nobody outside this repo has seen it.

---

## 5. Verification status — read this

The audit sandbox mounts the repo over a network filesystem; `npm test` did not emit a single
result in 15 minutes and `du` on `node_modules` timed out at 175s. **The full suite has not
been run against these changes.** What was verified:

- Full app re-bundles with esbuild: **0 errors**, every import resolves.
- Every edited file parses, `registry.ts` included.
- `getModelPricing`: 9 cases executed directly — all pass.
- `sharpen`/`stretchContrast`: 6 cases executed directly — all pass.
- `agentPool` clamp + peak-concurrency: 8 cases executed directly — all pass.
- Regex safety check: 7 cases executed directly — `(a+)+$`, `(a|ab)+`, `(\d+)*` and an
  invalid pattern refused; email, phone and URL patterns allowed.
- Injection guard: 5 cases executed directly — attack rewritten with surrounding content
  intact, benign text byte-identical, `null` safe, canary leak detected and scrubbed.
- The new reachability guard was executed against the real tree: **0 unlisted dead files,
  0 stale allowlist entries — passes.**
- A single consolidated run of **45 assertions** across all of the above passes.
- Browser tool: **21 assertions** driven through the real tool with a mock bridge — hover
  refuses rather than clicking, type clears only when a ref names the field, `fill_form`
  reports failure, nested `run_script` is refused, `storage` honours `type`, `select`
  validates and routes.
- Stale-ref recovery: **7 assertions** — the refusal still fails, the page is re-read exactly
  once, an ordinary failure spends no read, and a bridge without `read` still refuses cleanly.
- ContextMeter: **9 assertions**, including that its limits equal `compaction.js`'s for every
  provider it knows.
- The injected `<select>` page script is rendered exactly as the handler builds it, then
  parsed and run against a fake DOM: **8 assertions**, including that `/^\d+$/` survives
  templating. Kept as `frontend/scripts/check-select-script.mjs` — a mistake inside a
  template literal is invisible to `node --check`.
- `MAX_TOOLS_PER_REQUEST = 96`, the `spawn_subagent → spawn_agents` alias, and
  `chatExport` now being reachable all confirmed against the built bundle.

Run `cd frontend && npm test` before shipping. Note that a Linux CI will need
`@rollup/rollup-linux-x64-gnu` and `@esbuild/linux-x64` present — they were missing from this
`node_modules` and had to be installed.
