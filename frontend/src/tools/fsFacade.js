// fsFacade.js – Centralized filesystem access with safe error handling
import { invoke } from './localFs.js';

/** Wrap a Tauri invoke call and throw on failure */
async function safeInvoke(cmd, args, description) {
  const result = await invoke(cmd, args);
  if (!result.success) {
    const err = new Error(`${description}: ${result.error || 'unknown error'}`);
    err.code = result.error;
    throw err;
  }
  return result;
}

// Low‑level filesystem operations
/** Read a file (optionally with offset/limit) */
export async function read(path, { offset, limit } = {}) {
  const res = await safeInvoke('fs_read', { path, offset, limit }, `fs_read ${path}`);
  return { content: res.content };
}

/** Write a file (overwrites) */
export async function write(path, content) {
  await safeInvoke('fs_write', { path, content }, `fs_write ${path}`);
}

/** Append to a file */
export async function writeAppend(path, content) {
  await safeInvoke('fs_write_append', { path, content }, `fs_write_append ${path}`);
}

/** Edit a file – replace first occurrence of oldString with newString */
export async function edit(path, oldString, newString) {
  await safeInvoke('fs_edit', { path, oldString, newString }, `fs_edit ${path}`);
}

/** Check if a path exists */
export async function exists(path) {
  return await safeInvoke('fs_exists', { path }, `fs_exists ${path}`);
}

/** Find files matching a glob pattern */
export async function find(pattern, { path = '.' } = {}) {
  const res = await safeInvoke('fs_find_files', { pattern, path }, `fs_find_files ${pattern}`);
  return { paths: res.paths };
}

// Re‑export higher‑level workspace helpers for convenience
export * from './localFs.js';
