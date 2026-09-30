// add_git_worktree.js
/**
 * Inserts git worktree tool definitions into devTools.js.
 * Safe to run multiple times without duplicating the inserted block.
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

// Resolve paths relative to this script’s folder (works regardless of cwd).
const SCRIPT_DIR = resolve();
const TOOLS_FILE = resolve(SCRIPT_DIR, 'frontend/src/tools/devTools.js');

// Exact marker we look for – must match the one in devTools.js.
const MARKER = '// ── background processes ────────────────────────────────────────────────────';

// Content to insert. NOTE: It deliberately does NOT contain the MARKER.
const NEW_TOOLS = `
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

async function main() {
  try {
    // Read the target file as UTF‑8 text.
    const data = await readFile(TOOLS_FILE, 'utf8');

    // Verify the marker exists exactly once.
    if (!data.includes(MARKER)) {
      throw new Error(`Marker not found in ${TOOLS_FILE}. Cannot proceed.`);
    }

    // Replace only the first occurrence of the marker.
    // Because NEW_TOOLS does NOT contain the marker, we guarantee no duplication.
    const updated = data.replace(MARKER, NEW_TOOLS);

    // Write the updated content back.
    await writeFile(TOOLS_FILE, updated, 'utf8');

    console.log(`✅ Successfully inserted git worktree tools into ${TOOLS_FILE}`);
  } catch (err) {
    console.error('❌ Failed to update devTools.js:', err.message);
    process.exit(1);
  }
}

// Execute the async main function.
main();
