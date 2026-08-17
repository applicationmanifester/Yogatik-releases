# Per-chat working folders (Yogatik desktop)

**Date:** 2026-08-17
**Status:** Approved, ready for implementation planning
**Scope:** Sub-project 1 of 2. Multi-window is a separate, later spec.

## Problem

The Electron desktop app grants exactly **one** working folder for the whole
application. `grantedRoot` is a module-level variable in `frontend/electron/fsBridge.cjs`,
persisted to a single `userData/granted_folder.txt`, and read by every `fs_*` handler
and by `terminal:exec`. Every conversation shares it.

A user working on two projects must re-pick the folder each time they switch chats,
and there is no way to have one chat on a repo while another is on a notes folder.

## Goal

A chat owns its working folders, the way a `claude` session owns the directory it was
launched in. Switching chats switches which folders the file tools and the terminal
operate on. A chat may hold several folders, mirroring Claude Code's `/add-dir`.

## Design decisions

These were settled during brainstorming and are not open questions:

| Decision | Choice |
|---|---|
| Scope unit | Per chat, inheriting from its project |
| Folders per chat | Several (Claude Code `/add-dir` model) |
| Path addressing | Real absolute paths, validated by containment |
| Who owns the bindings | The Electron main process |
| Who may add a folder | Only the human, via the native picker |
| Chats with no folder | Allowed; file tools return an honest error |
| Windows | Single window for now; design leaves the seam open |

### Why the main process owns everything

The renderer is influenced by model output. If the renderer could name a filesystem
path as "the root", the grant model would be worthless — the model could ask for `C:\`.
So the main process keeps the registry, and a directory enters it **only** through the
native folder picker, which a human must confirm. The renderer supplies an opaque
`conversationId` and a path; it never supplies a root path.

### Why absolute paths are now allowed

Today `resolveInRoot` rejects absolute paths outright. That was a shortcut that only
worked because there was exactly one root and every path could be relative to it. With
several roots per chat, the AI needs to say *which* file it means, and real absolute
paths are how Claude Code does it.

The rule that actually enforces safety is the containment check — resolve, then
`realpath`, then require the result to sit inside a bound root. That check stays and
now runs against the chat's bound set. Absolute paths *inside* a bound root are
accepted; absolute paths outside every bound root are refused exactly as before, as
are `..` escapes and symlink detours.

This is a deliberate, security-relevant relaxation and must be called out in the
implementation's commit message and in `CLAUDE.md`, whose Gotchas section currently
documents the old "abs/.. rejected" rule.

## Architecture

### New module: `frontend/electron/roots.cjs`

`fsBridge.cjs` currently does three jobs: grant persistence, path-escape guarding, and
nine file operations. The grant/guard halves move to `roots.cjs`; `fsBridge.cjs` keeps
only file operations and calls into it. This keeps both files focused.

State, persisted to `userData/workspace_roots.json`:

```jsonc
{
  "version": 1,
  "roots": {
    "<rootId>": { "path": "C:\\work\\repo", "label": "repo", "addedAt": 1755400000000 }
  },
  "bindings": {
    "chat:<conversationId>": ["<rootId>", "..."],
    "project:<projectId>":   ["<rootId>", "..."],
    "default":               ["<rootId>", "..."]
  }
}
```

- **`rootId`** is the first 12 hex characters of the SHA-256 of the directory's
  realpath, lower-cased on Windows before hashing. Stable, so re-granting the same
  folder reuses its entry rather than duplicating it — and `C:\Work\Repo` and
  `c:\work\repo` are correctly treated as one root on a case-insensitive filesystem.
- **`label`** is the directory basename, used for display only. Never used to address
  a file, so basename collisions are harmless.
- **Binding order within a list is meaningful.** The first entry is the chat's
  *primary* root: it is the terminal's working directory and the target for bare
  relative paths.

### Resolution

Two pure functions, exported for testing without Electron:

```
resolveRoots(bindings, { conversationId, projectId }) -> rootId[]
```

Returns the first non-empty of `chat:<conversationId>`, `project:<projectId>`,
`default`, else `[]`. Unknown ids in a binding list are dropped (a forged or stale id
can never widen access, because the registry is the authority).

```
resolveWithin(rootPaths, target) -> { absolutePath, rootPath }
```

1. If `rootPaths` is empty, throw `no folder granted`.
2. If `target` is relative, resolve it against `rootPaths[0]` (the primary).
3. If `target` is absolute, take it as given.
4. Normalise, then require the result to equal a root or start with `root + sep`.
5. `realpath` the target and the matching root and re-check. If the target does not
   exist yet (the `fs_write` / `fs_mkdir` case), walk up to its nearest existing
   ancestor and realpath-check that instead.
6. Throw if no root contains it; otherwise return the absolute path and its root.

Step 5's ancestor walk is what stops a symlinked parent directory from being used to
write outside a root — the current code only realpath-checks when the target itself
exists, which is a gap this design closes.

### IPC contract

Every existing `fs_*` handler and `terminal:exec` gains a context argument:

```js
ctx = { conversationId, projectId }
```

Handler names, argument shapes and return shapes are otherwise unchanged, so
`tools/localFs.js` changes in exactly one place.

New handlers:

| Handler | Behaviour |
|---|---|
| `roots_add(ctx)` | Native picker → register in `roots` → append to `chat:<id>` binding → return `{ id, path, label }`. Returns `null` if cancelled. |
| `roots_list(ctx)` | `[{ id, path, label, primary, source }]` where `source` is `chat` / `project` / `default`. |
| `roots_remove(ctx, rootId)` | Unbind from `chat:<id>`. Registry entry kept if any other binding still uses it. |
| `roots_set_primary(ctx, rootId)` | Move that id to position 0 of the chat's binding. |

**Materialisation rule.** `roots_add`, `roots_remove` and `roots_set_primary` all
mutate the **chat's own** binding. If the chat is currently inheriting (it has no
`chat:<id>` entry), the resolved inherited list is first copied into an explicit
`chat:<id>` binding, and the mutation is applied to that copy. Editing one chat's
folders therefore never silently rewrites a project default or the global default.
The only way to change a project or default binding is from the project UI.

`fs_grant`, `fs_granted_root` and `fs_clear_grant` remain for one release as thin
aliases: `fs_grant` → `roots_add`; `fs_granted_root` → the primary root's path from
`roots_list`, or `null` when the chat has none; `fs_clear_grant` → clear the chat's
binding entirely (following the materialisation rule, so it empties that chat rather
than the default). This preserves parity with the Tauri shell (`src-tauri/lib.rs`),
which is not being changed in this sub-project.

`terminal:exec` resolves its `cwd` through the same path, and continues to refuse when
the chat has no roots — never falling back to `process.cwd()`.

### Renderer

`frontend/src/tools/localFs.js`:

- A single `ctx()` helper reads the active conversation and project ids and injects
  them into every `invoke`. **No tool schema gains a parameter** — the AI never sees
  or supplies `conversationId`.
- `fsGrantTool` is renamed `fs_add_folder` in the model-facing registry, with identical
  behaviour: it opens the native picker, so a human always approves.
- Tool descriptions updated: paths may be absolute or relative to the primary folder;
  `fs_list` returns absolute paths.
- `getGrantedRoot` / `grantFolder` / `clearGrantedFolder` become
  `listRoots` / `addRoot` / `removeRoot`, taking the same ctx.

`frontend/src/App.jsx`:

- The existing `.work-folder-chip` becomes a popover for the active chat: lists its
  folders, marks the primary, and offers add / remove / make-primary. Inherited
  folders (source `project` or `default`) are shown as inherited, and adding a folder
  to a chat that is currently inheriting first copies the inherited set into an
  explicit `chat:` binding so the user does not silently edit their project default.

### Migration

On first run of the new build, `roots.cjs` checks for `granted_folder.txt`. If it
exists and still points at a live directory, that directory is registered as a root and
set as the `default` binding. Every existing chat therefore inherits exactly today's
folder and nothing changes for the user.

The old file is left in place for one release as a rollback path, and is only deleted
by an explicit "remove all folders" action.

## Error handling

| Condition | Message |
|---|---|
| Chat has no bound roots | `No working folder for this chat. Ask the user to add one.` |
| Path outside every bound root | `<path> is outside this chat's folders` plus the list of bound folders |
| Bound root gone (deleted / unmounted) | Drop the binding, report `Folder <label> is no longer available and has been removed from this chat` |
| Picker cancelled | `roots_add` returns `null`; the tool reports `User cancelled the folder picker.` |

Messages are written to be actionable by the model, not just by a human — the "no
folder" case explicitly tells it to ask the user, so it calls `fs_add_folder` rather
than retrying blindly.

## Testing

A new `frontend/src/roots.test.js` covers the pure functions with no Electron import:

- `resolveRoots` order: chat wins over project, project over default, empty when none
- unknown / forged rootId in a binding is dropped and never widens access
- containment: relative path, absolute inside a root, absolute outside every root,
  `..` escape, symlink escape
- symlinked parent of a *non-existent* target is refused (the ancestor-walk case)
- two roots containing the same relative filename resolve to the primary
- migration: `granted_folder.txt` becomes the `default` binding; a stale path is ignored

`frontend/src/desktop.test.js` is extended for the bridge-level behaviour, using the
existing `window.__TAURI__` mock:

- every `fs_*` tool forwards ctx and works against a multi-root chat
- `terminal:exec` refuses with no roots and contains `cwd` to the primary root

## Out of scope

- **Multi-window.** Deliberately deferred. Because main resolves roots from
  `conversationId` and never from the sender `BrowserWindow`, N windows require no IPC
  change. The remaining work for that cycle is window lifecycle, cross-window Dexie
  synchronisation (all windows share one origin and therefore one IndexedDB), and
  menu / tray / notification targeting.
- **Tauri parity for the new handlers.** `src-tauri/lib.rs` keeps the single-root model
  and continues to work through the compatibility aliases.
- **Per-folder permission rules** (read-only roots, per-root tool allowlists).

## Consequences for existing docs

`CLAUDE.md` needs updating in the same change:

- The Electron section's description of `fsBridge.cjs` ("scoped `fs_*` IPC, grant
  persistence, path-escape guards: abs/.. rejected") no longer describes the system.
- The Tauri section's "ONE granted root" and "Grant PERSISTS across restarts" notes
  need to distinguish the Electron shell from the Tauri shell.
