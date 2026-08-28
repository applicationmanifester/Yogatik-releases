// Git IPC. Runs the system git binary with an argument array (never a shell
// string) inside the calling chat's primary working folder.

const { ipcMain } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const core = require('./gitCore.cjs')

function runGit(cwd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('git', args, {
        cwd,
        windowsHide: true,
        env: {
          ...process.env,
          // Without these a fetch/pull/push against a repo needing credentials
          // blocks on a prompt that has no terminal to appear in, and the only
          // symptom is a button that spins until the kill timer. Failing with
          // "could not read Username" is a far better answer than hanging.
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: process.env.GIT_ASKPASS || '',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          LC_ALL: 'C.UTF-8',
        },
      })
    } catch (e) {
      return resolve({ ok: false, error: e.message })
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { try { child.kill() } catch { /* ignore */ } }, timeout)
    child.stdout.on('data', d => { stdout += d.toString('utf8') })
    child.stderr.on('data', d => { stderr += d.toString('utf8') })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        error: e.code === 'ENOENT'
          ? 'git is not installed or not on PATH.'
          : e.message,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, code, stdout, stderr: stderr.trim() })
    })
  })
}

function registerGitIpc({ rootPathsFor, snapshot = null }) {
  ipcMain.handle('git_run', async (_e, { ctx, args } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    if (!core.isSafeGitArgs(args)) {
      return { success: false, error: 'Only read-only git commands are allowed here.' }
    }
    const res = await runGit(roots[0], args)
    if (!res.ok && res.error) return { success: false, error: res.error }
    if (!res.ok) return { success: false, error: res.stderr || `git exited ${res.code}` }
    return { success: true, stdout: res.stdout }
  })

  ipcMain.handle('git_status', async (_e, { ctx } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }

    const gitDir = await runGit(roots[0], ['rev-parse', '--absolute-git-dir'])
    if (!gitDir.ok) {
      return {
        success: false,
        error: gitDir.error || 'This folder is not a git repository.',
      }
    }

    const [st, br, stash] = await Promise.all([
      // --no-optional-locks matters: without it, a status refresh takes the
      // index lock to write back stat information, and the panel polling every
      // second then fights the user's own editor and CLI for it.
      runGit(roots[0], ['--no-optional-locks', 'status', '--porcelain=v2', '-z', '--branch']),
      runGit(roots[0], ['branch']),
      runGit(roots[0], ['stash', 'list']),
    ])
    if (!st.ok) return { success: false, error: st.error || st.stderr }

    const { files, branch } = core.parseStatusV2(st.stdout)
    const branches = core.parseBranches(br.ok ? br.stdout : '')

    // Which marker files exist tells us whether a merge/rebase is half-done.
    let present = []
    try { present = await fs.promises.readdir(gitDir.stdout.trim()) } catch { /* not fatal */ }

    return {
      success: true,
      root: roots[0],
      branch: branch.head || branches.find(b => b.current)?.name || null,
      detached: branch.detached,
      upstream: branch.upstream || null,
      ahead: branch.ahead,
      behind: branch.behind,
      branches: branches.map(b => b.name).slice(0, 200),
      stashes: (stash.ok ? stash.stdout : '').split('\n').filter(Boolean).length,
      operation: core.operationInProgress(present),
      summary: core.summarizeStatus(files),
      files: files.slice(0, 300),
      truncated: files.length > 300,
    }
  })

  ipcMain.handle('git_log', async (_e, { ctx, limit = 20 } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    const fmt = ['%H', '%an', '%ad', '%s'].join(core.FIELD) + core.REC
    const res = await runGit(roots[0], [
      'log', `-${Math.min(Math.max(1, limit), 200)}`, '--date=short', `--format=${fmt}`,
    ])
    if (!res.ok) return { success: false, error: res.error || res.stderr }
    return { success: true, commits: core.parseLog(res.stdout) }
  })

  // History for ONE file, following it through renames. `git log -- <path>`
  // stops dead at a rename, which reads as "this file has no history" — the
  // most confusing possible answer for a file that has years of it.
  ipcMain.handle('git_file_history', async (_e, { ctx, path: file, limit = 30 } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    if (!file) return { success: false, error: 'A file path is required.' }
    const fmt = ['%H', '%an', '%ad', '%s'].join(core.FIELD) + core.REC
    const res = await runGit(roots[0], [
      'log', `-${Math.min(Math.max(1, limit), 200)}`, '--follow', '--date=short',
      `--format=${fmt}`, '--', String(file),
    ])
    if (!res.ok) return { success: false, error: res.error || res.stderr }
    return { success: true, path: String(file), commits: core.parseLog(res.stdout) }
  })

  // The contents of one file AT one commit — what a history entry has to open
  // into for the entry to be worth showing.
  ipcMain.handle('git_show_file', async (_e, { ctx, rev, path: file } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    const ref = String(rev || '')
    // A revision is data from the panel, but `show` takes `rev:path` as ONE
    // argument, so a rev containing a colon or a leading dash would change what
    // is read. Only a plain object name or ref is accepted.
    if (!/^[A-Za-z0-9._/-]{1,255}$/.test(ref) || ref.startsWith('-')) {
      return { success: false, error: 'Not a valid revision.' }
    }
    const res = await runGit(roots[0], ['show', `${ref}:${String(file || '')}`])
    if (!res.ok) return { success: false, error: res.error || res.stderr }
    return { success: true, rev: ref, path: String(file || ''), content: res.stdout.slice(0, 1000000) }
  })

  ipcMain.handle('git_diff', async (_e, { ctx, staged = false, path: file, rev = null } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    const args = ['diff']
    if (staged) args.push('--staged')
    if (rev) {
      if (!/^[A-Za-z0-9._/-]{1,255}$/.test(String(rev)) || String(rev).startsWith('-')) {
        return { success: false, error: 'Not a valid revision.' }
      }
      // `<rev>^!` is the commit against its parent, and works on a root commit
      // where `<rev>^..<rev>` does not.
      args.push(`${rev}^!`)
    }
    if (file) args.push('--', String(file))
    if (!core.isSafeGitArgs(args)) return { success: false, error: 'Unsafe git arguments.' }
    const res = await runGit(roots[0], args)
    if (!res.ok) return { success: false, error: res.error || res.stderr }
    return { success: true, diff: res.stdout.slice(0, 200000) }
  })

  // Source Control writes. The renderer names an OPERATION, never git flags —
  // see the note on buildWriteArgs. Nothing reachable from here can discard a
  // change: the destructive subcommands are simply not in the table.
  ipcMain.handle('git_write', async (_e, { ctx, op, paths, message, name, amend, confirm } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    const built = core.buildWriteArgs(String(op || ''), { paths, message, name, amend, confirm })
    // needsConfirm is not a failure — it is the panel's cue to ask. Reporting
    // it as an error would make a deliberate gate look like a broken button.
    if (built.error) return { success: false, error: built.error, needsConfirm: !!built.needsConfirm }

    // A destructive operation is snapshotted first, so `fs_undo` can still
    // recover the working tree that git is about to overwrite. This is the only
    // reason discard/reset are offered at all: git itself keeps no copy.
    if (built.destructive && typeof snapshot === 'function') {
      const targets = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && p)
      try {
        if (targets.length) for (const p of targets) snapshot(ctx, `git_${op}`, require('path').resolve(roots[0], p))
        else snapshot(ctx, `git_${op}`, roots[0])
      } catch { /* journalling must never block an operation the user approved */ }
    }

    const res = await runGit(roots[0], built.args, { timeout: /^(fetch|pull|push)/.test(op) ? 120000 : 20000 })
    if (!res.ok) {
      // A no-op commit exits 1 with a perfectly ordinary message. Reporting
      // that as a failure sends the user hunting for a problem that is just
      // "there was nothing staged".
      const out = `${res.stdout || ''}${res.stderr || ''}`
      if (/nothing to commit|no changes added/i.test(out)) {
        return { success: false, error: 'Nothing staged to commit.' }
      }
      return { success: false, error: res.error || res.stderr || `git exited ${res.code}` }
    }
    return { success: true, stdout: (res.stdout || '').slice(0, 20000) }
  })

  // Untracked files have no diff (git does not know them yet), so the panel
  // needs the file's own contents to show it as wholly added. Reading it here
  // keeps the panel on ONE bridge instead of interleaving fs_read calls whose
  // path resolution rules are subtly different.
  ipcMain.handle('git_show_untracked', async (_e, { ctx, path: rel } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    const args = ['ls-files', '--others', '--exclude-standard', '--', String(rel || '')]
    if (!core.isSafeGitArgs(args)) return { success: false, error: 'Unsafe git arguments.' }
    const listed = await runGit(roots[0], args)
    if (!listed.ok) return { success: false, error: listed.error || listed.stderr }
    if (!listed.stdout.trim()) return { success: false, error: 'Not an untracked file.' }
    try {
      const fs = require('fs')
      const path = require('path')
      const abs = path.resolve(roots[0], String(rel))
      const rootResolved = path.resolve(roots[0])
      if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
        return { success: false, error: 'Path escapes the repository.' }
      }
      const stat = await fs.promises.stat(abs)
      if (stat.size > 1000000) return { success: false, error: 'File is too large to preview.' }
      const buf = await fs.promises.readFile(abs)
      if (buf.includes(0)) return { success: true, binary: true, content: '' }
      return { success: true, binary: false, content: buf.toString('utf8') }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerGitIpc, runGit }
