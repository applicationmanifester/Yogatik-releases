const fs = require('fs');
const content = fs.readFileSync('frontend/src/tools/devTools.js', 'utf8');
const marker = '// ── background processes ────────────────────────────────────────────────────';
const newTools = `
// ── git worktree (parallel agent isolation) ──────────────────────────────────
export const gitWorktreeListTool = {
  schema: {
    description:
      'List all git worktrees for this chat\'s working folder. Use to see existing isolated workspaces. Read-only. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute(_args = {}, opts = {}) {
    return guard(async () => {
      const r = await invoke('git_worktree_list', {}, opts?.ctx)
      return r?.success ? ok({ tool: 'git_worktree_list', ...r }) : fail(r?.error || 'git worktree list failed')
    })
  },
}

export const gitWorktreeAddTool = {
  schema: {
    description:
      'Create a new git worktree at the given path, optionally creating a new branch. ' +
      'Each worktree is an isolated checkout — perfect for parallel agent tasks. ' +
      'The worktree path should be outside the main repo (e.g., ../repo-worktree-feature). Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path for the new worktree (relative to repo root or absolute).' },
        branch: { type: 'string', description: 'Branch to check out (or new branch name with createBranch).' },
        createBranch: { type: 'boolean', description: 'Create a new branch with this name (implies -b).' },
        detach: { type: 'boolean', description: 'Detach HEAD at current commit instead of checking out a branch.' },
      },
      required: ['path'],
    },
  },
  async execute({ path, branch, createBranch = false, detach = false } = {}, opts = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      const r = await invoke('git_worktree_add', { path, branch, createBranch, detach }, opts?.ctx)
      return r?.success ? ok({ tool: 'git_worktree_add', ...r }) : fail(r?.error || 'git worktree add failed')
    })
  },
}

export const gitWorktreeRemoveTool = {
  schema: {
    description:
      'Remove a git worktree. Use --force if the worktree has uncommitted changes. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of the worktree to remove.' },
        force: { type: 'boolean', description: 'Force removal even with uncommitted changes.' },
      },
      required: ['path'],
    },
  },
  async execute({ path, force = false } = {}, opts = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      const r = await invoke('git_worktree_remove', { path, force }, opts?.ctx)
      return r?.success ? ok({ tool: 'git_worktree_remove', ...r }) : fail(r?.error || 'git worktree remove failed')
    })
  },
}

export const gitWorktreePruneTool = {
  schema: {
    description: 'Prune stale worktree administrative files. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute(_args = {}, opts = {}) {
    return guard(async () => {
      const r = await invoke('git_worktree_prune', {}, opts?.ctx)
      return r?.success ? ok({ tool: 'git_worktree_prune', ...r }) : fail(r?.error || 'git worktree prune failed')
    })
  },
}

// ── background processes ────────────────────────────────────────────────────
`;
const newContent = content.replace(marker, newTools);
fs.writeFileSync('frontend/src/tools/devTools.js', newContent);
console.log('Done');