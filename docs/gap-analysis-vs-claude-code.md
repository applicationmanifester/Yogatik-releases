# Where Claude Code beats Yogatik — and how to close each gap independently

**Date:** 2026-08-17
**Constraint:** every proposal below is implementable with open-source, self-hosted or
browser/Node-native code. Nothing depends on Claude Code, Anthropic tooling, or any paid
service. Yogatik keeps working with any provider, offline where possible.

Each gap is evidenced against this codebase, not assumed.

## Status (updated 2026-08-17)

| § | Gap | Status |
|---|---|---|
| 1 | Permission system | **Done** — `permissions.js`, 32 tests |
| 2 | Undo / journal | **Done** — `journalCore.cjs` + `fs_undo`, 12 tests |
| 3 | Diff preview | **Done** — `diffPreview.js`, 11 tests |
| 4 | Search fix | **Done** — `searchFilter.cjs`, 17 tests |
| 5 | Git awareness | **Done** — `gitCore.cjs`/`git.cjs`, 17 tests |
| 6 | Task tracking | **Done** — `todos.js` + `todo` tool, 15 tests |
| 7 | Context compaction | **Done** — `compaction.js`, 15 tests |
| 8 | Project instructions | **Done** — `projectInstructions.js`, 14 tests |
| 9 | MCP stdio | **Done** — `mcpStdioCore.cjs`/`mcpStdio.cjs`, 12 tests |
| 10 | Hooks | **Done (not enabled)** — config, matching, trust model and runner all exist (13 tests), but main wires an EMPTY trust list, so no hook can fire until a trust UI is added. Deliberate. |
| 11 | Background processes | **Done** — `procCore.cjs`/`processes.cjs`, 11 tests |
| 12 | File watching | **Done** — `watcher.cjs` (bare fs.watch, no chokidar) |
| 13 | Sub-agent isolation | **Done** — `agentIsolation.js`, 13 tests, opt-in |
| 14 | Repo commands | **Done** — `repoCommands.js`, 12 tests |

All fourteen implemented. Suite: **552 tests**, 0 lint errors, build clean.

**Everything Electron-side is unit-tested but has NOT been exercised in a running
app** — see the verification note at the end. That gap is now larger, not smaller.

---

## Tier 1 — Safety. These are the real gaps.

### 1. There is no permission system at all

**Claude Code:** every tool call is classified and gated. Destructive actions prompt;
decisions persist per project in `settings.json` as allow/deny/ask rules.

**Yogatik:** `disabled_tools` is a global on/off switch and nothing else. Once
`fs_delete` and `terminal_run` are enabled, the model can delete any tree inside the
granted folders and run **any** shell command with zero confirmation.

> Evidence: no approval code exists anywhere in `src/` (`requireApproval`, `pendingApproval`
> etc. return nothing). `terminal:exec` spawns immediately. `CLAUDE.md` describes
> "confirm-before-irreversible guidance injected via buildSystemPrompt" — that is **prompt
> text**, not enforcement. A model that ignores it is unopposed.

This is the single largest gap. It matters more now that folders are per-chat, because the
blast radius is a real project directory.

**Implementation — `src/permissions.js` + a broker in the agent loop**

1. Tool registry entries gain `risk: 'read' | 'write' | 'destructive'`.
   `fs_read`/`fs_list`/`fs_search` are read; `fs_write`/`fs_edit`/`fs_mkdir`/`fs_move` are
   write; `fs_delete`/`terminal_run` are destructive.
2. `executeTool()` in `agent.js` awaits `requestPermission(tool, args, ctx)` before running
   anything above the current auto-allow threshold.
3. The renderer resolves it with an inline card in the transcript: **Allow once / Allow for
   this chat / Always allow / Deny**, showing the exact command or path.
4. Rules persist in a Dexie `permissions` table keyed by `{tool, pattern, scope}` where
   scope is chat / project / global — mirroring Claude Code's layering.
5. Denial returns a normal tool result (`{success:false, error:'User denied…'}`) so the model
   adapts instead of hanging.

Zero dependencies. ~250 lines plus a card component.

### 2. File edits are irreversible

**Claude Code:** you can rewind, and edits are shown before they land.

**Yogatik:** `fs_write` calls `writeFile` straight over the old contents; `fs_delete` with
`recursive:true` calls `fs.rm` on a tree. There is no backup, no journal, no undo.

> Evidence: `frontend/electron/fsBridge.cjs` — the `fs_write` and `fs_delete` handlers. The
> only "snapshot"/"checkpoint" strings in `src/` belong to **cloud DB sync** (`api.js:96`),
> not files.

**Implementation — a shadow journal in main**

Before any mutating fs op, `roots.cjs` (or a new `journal.cjs`) copies the prior bytes to
`userData/yogatik-journal/<chatId>/<contenthash>` and appends a JSONL record
`{ts, chat, op, path, before, after}`. Then:

- `fs_undo` tool + a **Revert this file** / **Revert this turn** button on the tool card.
- Retention capped by size and age (e.g. 200 MB / 14 days), pruned on startup.
- Deleted trees are journalled as a tar-less directory copy, or refuse `recursive` deletes
  over N files without explicit approval.

Pure Node `fs`. The natural companion to the permission broker: *approve* before, *undo*
after.

### 3. No diff preview before writing

**Claude Code:** shows the patch and asks.

**Yogatik:** the model writes; you find out afterwards.

**Implementation:** `fs_write`/`fs_edit` compute a unified diff against current contents and
return it **with the permission request**, so the approval card renders the patch. The diff
algorithm already exists in `src/tools/diff.js` — this is wiring, not new logic.

---

## Tier 2 — Agent competence

### 4. Search is naive enough to hang on a real repo

**Claude Code:** ripgrep — gitignore-aware, binary-skipping, parallel, fast.

**Yogatik:** `fs_search` walks up to 20 000 entries then `readFile`s **every file as UTF-8**,
with no `.gitignore` handling, no binary detection, and no size cap.

> Evidence: `frontend/electron/fsBridge.cjs` `fs_search`; `grep gitignore electron/fsBridge.cjs`
> → no matches.

Point this at a repo containing `node_modules` or a `.git` directory and it reads hundreds of
megabytes of binary data into strings. It is the most likely thing to make the app appear frozen.

**Implementation (staged, all open source):**

1. **Cheap wins first:** skip `.git`, `node_modules`, `dist`, `target` by default; sniff for a
   NUL byte in the first 8 KB and skip binaries; cap per-file size at ~2 MB; stream by line
   instead of `split('\n')` on the whole file.
2. **Respect `.gitignore`** with the `ignore` package (MIT, dependency-free) or ~60 lines of
   hand-rolled glob matching.
3. **Optional fast path:** vendor `@vscode/ripgrep` (MIT, ships prebuilt binaries per
   platform) and shell out when present, falling back to the JS path. Vendoring an
   MIT-licensed binary is self-contained — no external app or service.

### 5. No git awareness

**Claude Code:** reads status/diff/log, makes commits and branches, understands what changed.

**Yogatik:** `src/tools/diff.js` is a *text* diff utility. There is no git tool at all.

**Implementation:** `isomorphic-git` (MIT, pure JavaScript, no native binary, works in Node
*and* the browser) gives `git_status`, `git_diff`, `git_log`, `git_branch`, `git_commit`
without requiring git to be installed. Prefer it over shelling out precisely because it keeps
the app independent. Route commits through the permission broker.

This pairs naturally with the journal in §2 — git becomes the durable undo where a repo exists.

### 6. No structured task tracking

**Claude Code:** a live todo list keeps multi-step work on track and visible to the user.

**Yogatik:** nothing. `grep todo src/tools/index.js` → no matches. Long tasks drift.

**Implementation:** `todo_write` / `todo_read` tools backed by a Dexie table keyed by
conversation; render as a checklist panel beside the transcript. Inject the open items into
the system prompt each turn — `agent.js` already does exactly this for saved memories via
`memoryBlock()`, so copy that pattern.

### 7. Context is truncated, never compacted

**Claude Code:** auto-compacts — summarizes older turns and tells you it happened.

**Yogatik:** `windowHistory()` keeps a 24 000-character / 20-turn budget and **truncates the
oldest turn with an ellipsis**. Information is silently destroyed; a long session quietly
forgets its own beginning.

> Evidence: `frontend/src/agent.js:174` `HISTORY_BUDGET = 24000`, and the truncation branch
> at `:198`.

**Implementation:** when turns would fall out of the window, send that span to the *same*
provider with a summarization prompt, store the result as a `role:'summary'` pseudo-message in
Dexie, and inject it ahead of the window. Show a visible "compacted N turns" marker. Costs one
cheap call per compaction and is entirely local.

### 8. No project instructions file

**Claude Code:** reads `CLAUDE.md` from the project automatically, so guidance lives with the
repo and is shared by everyone who clones it.

**Yogatik:** has the `memory` tool (per-device Dexie) and skills (Dexie), but **nothing reads a
file from the working folder**. `grep -rl "AGENTS.md|CLAUDE.md" src/` → no matches.

**This is the best value-to-effort item on the list.** It is what makes an assistant
repo-aware instead of generic.

**Implementation:** on chat load and on root change, check each bound root for
`YOGATIK.md`, `AGENTS.md`, or `.yogatik/instructions.md`; read, cache by mtime, and prepend to
`systemBase` next to the existing skill/agent/memory blocks. Perhaps 40 lines. It also composes
with the per-chat folders just shipped: different chat, different repo, different instructions.

---

## Tier 3 — Extensibility

### 9. MCP is HTTP-only — the ecosystem is stdio

> Evidence: `src/mcp.js:8` — "stdio servers are not supported".

Most published MCP servers are `npx`-launched stdio processes. Yogatik can reach almost none
of them, and HTTP servers additionally must send CORS headers.

**Implementation:** in Electron main, spawn stdio MCP servers as child processes and bridge
JSON-RPC over IPC (`mcp_stdio_start` / `_send` / `_stop`). The existing `parseRpcBody` and
tool-namespacing logic is reusable as-is; only the transport changes. The browser build keeps
HTTP-only and says so. This unlocks the entire MCP ecosystem without any hosted service.

### 10. No hooks

**Claude Code:** runs user-defined shell commands on tool events (`PreToolUse`, `PostToolUse`),
which is how people wire in formatters, linters and guards.

**Yogatik:** none (`grep -rl "preToolUse|postToolUse" src/*.js` → nothing).

**Implementation:** `.yogatik/hooks.json` in the working root; main matches events against
tool-name globs and runs the command with the payload on stdin. Must sit **behind** the
permission broker — a hooks file is executable content arriving from a repository, so it needs
explicit opt-in per root, exactly the way the folder grant works.

### 11. No background or long-running processes

**Yogatik:** `terminal:exec` is fire-and-wait with a 30 s default timeout and returns output
only at the end. You cannot run a dev server, tail a log, or watch a test suite — which rules
out the core inner loop of real development.

**Implementation:** `terminal_start` returns a handle; stdout/stderr stream to the renderer as
IPC events; `terminal_output(handle)` lets the model poll, `terminal_stop(handle)` kills.
Keep a process registry per chat and kill on chat close. Same `spawn`, different lifecycle.

### 12. No file watching

Nothing notices external edits, so cached reads go stale.

**Implementation:** `chokidar` (MIT) or bare `fs.watch` in main, scoped to bound roots,
debounced, emitting invalidation events to the renderer.

### 13. Sub-agents share everything

**Claude Code:** a subagent can get its own context and even its own git worktree, so parallel
work cannot collide.

**Yogatik:** `spawnAgents` runs in-process against the same conversation and same folders.

**Implementation:** now cheap, because the roots subsystem exists. Give each spawned agent its
own `conversationId`-like binding key; optionally create a git worktree (via isomorphic-git or
system git) and bind *that* as the agent's root. Isolation becomes a binding, not a rewrite.

### 14. Skills live only in the database

**Claude Code:** `.claude/commands/*.md` — commands are files, so they are versioned, diffable
and shared by cloning.

**Yogatik:** skills and workflows exist only in Dexie, per device.

**Implementation:** read `.yogatik/commands/*.md` from bound roots and merge into
`getSkills()` at read time, flagged `fromRepo:true`. `skills.js` already merges
`PRESET_SKILLS` this way, so the merge pattern is established.

---

## Tier 4 — Quality of life

| Gap | Fix |
|---|---|
| Tool output isn't streamed (long tools look hung) | Emit progress events from `executeTool`; render on the tool card |
| Token usage is estimated from characters | Read real `usage` from provider responses where returned; keep the estimate labelled as fallback |
| No session fork/resume by id | Conversations already branch (`branchConversation`); expose it as an explicit "fork from here" |
| No thinking-budget control | Surface a per-chat reasoning-effort control for models that accept it |

---

## Suggested order

Do them in this order, because each makes the next safer or cheaper:

1. **§8 project instructions file** — smallest change, biggest immediate improvement in answer quality.
2. **§1 permission broker** — the safety floor. Everything destructive below depends on it.
3. **§2 journal + undo** and **§3 diff preview** — complete the safety story.
4. **§4 search fix** — removes the most likely "app is frozen" report.
5. **§7 compaction** and **§6 todos** — long-session competence.
6. **§5 git**, **§11 background processes** — the real development loop.
7. **§9 MCP stdio**, **§14 repo commands**, **§10 hooks** — extensibility.
8. **§13 agent isolation**, **§12 watching** — parallelism and freshness.

Items 1–4 are roughly the difference between "a chat app that can touch files" and "an
assistant you can trust with a repository".

## Honest note on scope

Every item here is a real gap, but they are not equal. §1, §2 and §4 are the ones that
would change day-to-day use most; §8 is the cheapest genuine win. Several items (§5, §9, §11)
are multi-day pieces of work that deserve their own spec-and-plan cycle rather than being
squeezed in.

---

## Verification status — read this before trusting any of it

The 494 unit tests are real and they pass, but they do **not** prove the desktop
app works. Nothing below has been exercised in a running Electron build:

- the permission modal actually rendering (the broker **fails closed**, so if the
  UI never mounts, every write is silently refused — worse than no gate)
- the journal's IPC round-trip and `fs_undo` against real files
- pruned `fs_search` inside the app rather than in a synthetic harness
- project instructions being picked up from a real working folder
- repo commands appearing in the skills list

Run this and exercise those five paths before building anything on top:

```
cd frontend && npm run electron:build
```

## Remaining work, honestly sized

- **§5 git** — `isomorphic-git` (MIT, pure JS, needs no installed git). Multi-day.
- **§9 MCP stdio** — spawn servers in main, bridge JSON-RPC over IPC. Multi-day;
  unlocks most of the MCP ecosystem.
- **§11 background processes** — `terminal_start`/`_output`/`_stop` with streaming.
  Multi-day, and the prerequisite for any real dev loop (dev servers, watch mode).
- **§10 hooks runner** — the parsing and trust model are done; the main-process
  executor still needs writing, gated on the permission broker.
- **§12 file watching**, **§13 sub-agent isolation** — smaller, and both benefit
  from §5 and §11 landing first.

Each of §5, §9 and §11 deserves its own spec → plan → implement cycle rather
than being squeezed into a batch.
