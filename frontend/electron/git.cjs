// Git IPC. Runs the system git binary with an argument array (never a shell
// string) inside the calling chat's primary working folder.

const { ipcMain } = require('electron')
const { spawn } = require('child_process')
const core = require('./gitCore.cjs')

function runGit(cwd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('git', args, { cwd, windowsHide: true })
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

function registerGitIpc({ rootPathsFor }) {
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

    const inRepo = await runGit(roots[0], ['rev-parse', '--is-inside-work-tree'])
    if (!inRepo.ok) {
      return {
        success: false,
        error: inRepo.error || 'This folder is not a git repository.',
      }
    }

    const [st, br] = await Promise.all([
      runGit(roots[0], ['status', '--porcelain']),
      runGit(roots[0], ['branch']),
    ])
    if (!st.ok) return { success: false, error: st.error || st.stderr }

    const files = core.parseStatus(st.stdout)
    const branches = core.parseBranches(br.ok ? br.stdout : '')
    return {
      success: true,
      root: roots[0],
      branch: branches.find(b => b.current)?.name || null,
      summary: core.summarizeStatus(files),
      files: files.slice(0, 300),
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

  ipcMain.handle('git_diff', async (_e, { ctx, staged = false, path: file } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    const args = ['diff']
    if (staged) args.push('--staged')
    if (file) args.push('--', String(file))
    if (!core.isSafeGitArgs(args)) return { success: false, error: 'Unsafe git arguments.' }
    const res = await runGit(roots[0], args)
    if (!res.ok) return { success: false, error: res.error || res.stderr }
    return { success: true, diff: res.stdout.slice(0, 200000) }
  })
}

module.exports = { registerGitIpc, runGit }
