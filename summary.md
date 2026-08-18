# Yogatik — Session Summary

Started with a 404 on the desktop download page. Ended with a working
three-platform release pipeline, two releases published automatically, and a
long tail of bugs found while looking for something else.

26 commits (plus this one) · 49 files · +2551 / −327 · **1121 tests across 88 files, 0 lint errors**

*(This file is replaced each session. The previous copy described per-chat
desktop folders, the safety layer and the finance suite — see git history
before `109d228` if you need it.)*

---

## The release pipeline

`/platforms` 404'd for every visitor. The cause was not one thing but four,
each hidden behind the last, and every one of them failed **silently** — green
jobs, working downloads, nothing in the UI to suggest a problem.

**1. The workflow could not have published even with everything else right**
(`109d228`)

- `electron:build:mac/linux` lacked `--publish never` while `GH_TOKEN` was set.
  electron-builder defaults to `onTagOrDraft`, so both jobs would have tried to
  upload to the *mirror* using the *source* repo's token — a 403 mid-build.
  Windows was safe only by accident of already passing the flag.
- `desktop-release.yml` had **never been valid YAML**: `releaseName` closed its
  single-quoted scalar at the first inner quote. GitHub rejected the whole file.
- The legacy Tauri workflow fired on the same `v*` tag, publishing a second
  release into the *private* repo whose assets nobody can download.
- Three jobs raced to create one release → `max-parallel: 1`.

**2. A Tailwind ghost broke every CI build** (`d6aabc2`) — the real blocker.

`frontend/` had no PostCSS config, so Vite walked **up** and found one at the
repo root declaring a `tailwindcss` plugin. Tailwind was never a dependency of
either `package.json`; it resolved on the dev machine only from
`C:\Users\<user>\node_modules`, **outside the repo entirely**. That is why local
builds passed while all three runners died at `Cannot find module 'tailwindcss'`.

Tailwind was never used — not one `@tailwind` or `@apply` directive, and its
content globs pointed at a `./src` that does not exist at the root. Both root
configs deleted. `autoprefixer` kept and made a real devDependency: `styles.css`
hand-writes `-webkit-backdrop-filter` in only 8 of 19 `backdrop-filter` rules,
so dropping it would have quietly killed blur on Safari.

**3. `RELEASE_TOKEN` was granted "repository advisories", not Contents.**
A fine-grained PAT scoped to the right repo with the wrong permission. The
publish step 403'd while every job stayed green.

**4. The tag predated its own fix.** `v3.9.1` pointed 14 commits back and still
contained the broken config, so "re-run the tag build" would have failed
identically. Cut `v3.9.2` from `main` instead.

**Result:** `v3.9.2` and `v3.9.3` both published end to end — Windows, macOS
(universal), Linux (AppImage + deb), with `latest*.yml` for auto-update on all
three. Verified anonymously, not from an authenticated session.

### Known issue — needs one action

`v3.9.3`'s `latest-mac.yml` and `latest-linux.yml` report **3.9.2** while
`latest.yml` reports 3.9.3. Downloads work on every platform; **auto-update is
stalled on macOS and Linux** because the updater reads its own version back.

Caused by the `tag` input added in `48fc97d`: a `workflow_dispatch` builds the
*branch*, not the tag, so a dispatch started before the version bump produced
3.9.2 binaries filed under `v3.9.3`. `99591a8` now fails such a run immediately
with both versions named. **Fix: re-run the TAG-triggered `v3.9.3` build** (not
the "Run workflow" button) so the correct manifests overwrite the wrong ones.

---

## Bugs found while looking for something else

**The service worker was deleting users' downloaded AI models** (`a7897db`).
`activate()` swept every cache whose name differed from the app shell's:

```js
keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
```

The Cache API is origin-wide, so that deleted `webllm/model`, `webllm/wasm`,
`webllm/config` and `transformers-cache` — **up to ~1.7GB of consented download,
on every deploy.** Worse, WebLLM memoises its Cache handle, so a worker
activating mid-download deleted the store underneath an in-flight `add()`,
surfacing as the opaque `Failed to execute 'add' on 'Cache': Request failed`
that started the investigation. Eviction is now scoped to a `yogatik-` prefix.
`ErrorBoundary`'s reload had the same blanket sweep.

**Disk-full reported as a provider rate limit** (`b86a6d1`). `diagnoseError`
matched bare `quota`, so running out of space mid-download produced "Rate Limit
or Quota Exceeded" and offered Auto-Pick — an action that cannot free disk, for
a failure no provider was involved in.

**`clone()` silently wiped hook trust** (`1247101`). It rebuilt only
`{version, roots, bindings}`, dropping every other top-level key — and
`roots.cjs` assigns the result back over live state, so any add/remove of a root
revoked `trustedHookRoots` with no user action.

**Ollama was hidden from the desktop picker** (`e270458`). `getModels()` skipped
`desktop && p.isLocal` to hide the 750MB WebLLM provider, but Ollama carries
`isLocal` too. The comment directly above said *"Ollama is the local path
there"* and the code removed it. A second guard was needed on the sibling
branch, or unhiding it would have listed WebLLM's weights instead of the
daemon's.

**A download button that had been 404 for every user** (`bc18ca9`). The modal
linked to `github.com/yogatik/yogatik` — a repo that does not exist. Deleted
rather than corrected: `/platforms` owns those links in one place now.

**11 undefined CSS tokens pinning the light theme dark** (`e9483d1`).
`var(--bg-elevated, #12161f)` and ten siblings were used but never defined, so
the hardcoded *dark* fallback always won. Anything using them ignored the theme
— the folder popover was just the one that got opened.

**The crisis card fired on "purge the cache"** (`7031b47`). The eating-disorder
pattern matched bare `purge`/`purging` — everyday technical vocabulary, right
down to this repo's own `backup-before-purge` branch. Now requires real context
(purging *after a meal*, or *oneself*). A card that cries wolf on routine words
teaches the user to dismiss it, which costs precisely the moment it exists for.

**Live speech could never work offline** (`5897c7c`). Web Speech is a *cloud*
service; cascade classed `network` as transient and retried forever, so a
desktop install running a local Ollama model had everything on-device except the
ear. `whisper.js` had existed since v3.6 but only triggered when Web Speech was
*absent*, never when it *failed*. Two failures now hand off to on-device Whisper
with silence-segmented capture, routed through the same `handleUtterance` so the
echo guard still stops it answering its own voice.

---

## Requested work

- **Default working folder** (`1247101`) — `Documents/Yogatik` created on first
  launch and bound as the global default, so a fresh install can do file work
  without granting anything. A real grant always wins; removal is never undone.
- **Sidebar** (`1f6b5b4`) — two search inputs collapsed to one, identity moved
  to a footer, chats grouped by recency, the settings disclosure relabelled from
  a provider-status readout to "Settings".
- **Welcome screen** (`bc18ca9`) — 72 tool badges → 12 with "+60 more", four
  CTAs → three.
- **Logo** (`5b30a4c`) — face and bars scaled ~1.28×, filling 72% of the viewBox
  instead of 56%, across all eight assets. Rasters rendered from the same SVG so
  they cannot drift; the `.ico` rebuilt as a 6-entry PNG container (11KB vs the
  old 143KB).
- **`/platforms`** (`ebb797d`, `578cb2f`, `96408fa`) — cards read the release's
  real asset list and default to *pending*, so a missing build is never offered
  as a download; they promote themselves when assets land. Version pill reads
  from the same lookup. A test rejects any hardcoded `vN.N` in the markup.
- **Share sheet** (`0835701`) — Electron exposes no `navigator.share` and
  Windows has no Share-charm API, so "Share Yogatik" silently copied a link.
  Six targets plus a visible, selectable link with Copy.
- **Desktop notifications** (`3f6be7f`) — `notify.cjs` had supported action
  buttons and inline reply since v3.13 with **zero callers**. A finished turn
  now notifies when the window is hidden or unfocused, and the inline reply
  routes into `send()`.
- **Companion** (`eafe012`, `a2578e5`) — 74 hardcoded colours → shared tokens
  (it was Tailwind's slate/sky palette, which is why it looked like a different
  product); chips follow the detected context (4 instead of 12); opt-in ambient
  awareness where noticing is cheap and frequent but speaking must clear every
  gate — settle time, cooldown, session cap, not while typing — and the prompt
  licenses silence explicitly.

---

## Outstanding

1. **Re-run the tag-triggered `v3.9.3` build** to fix the macOS/Linux update
   manifests (see Known issue above).
2. **Rotate the `RELEASE_TOKEN` PAT** — it was pasted into the session
   transcript. Everything it was needed for is published.
3. Desktop users need `v3.9.3` (or the re-run) for any of the desktop-only
   fixes; the web deploy carries the code but installers lag the tag.

## Notes for next time

- **"Works locally" was never evidence.** The Tailwind ghost resolved from a
  directory outside the repo. A local build proves nothing about CI.
- **Green does not mean published.** Three separate failures this session were
  invisible in the Actions tab: the skipped publish step, the 403, and the
  version-mismatched manifests. Check the *assets*.
- **CSS colour transitions defeat script-based checks.** Three times a
  `getComputedStyle` read returned a mid-transition value and looked like a
  theme bug; twice it nearly caused a "fix" to working code. Create the probe
  element *after* setting the theme, and wait past the transition.
- **Read a file before overwriting it.** `share.test.js` was clobbered with
  `cat >` and only caught because the test count fell by one.
