import { fs_read, fs_write, fs_write_append, fs_edit, fs_exists, fs_find_files } from 'yogatik/fs';

/** Safe wrapper that throws a descriptive error on failure */
async function safeCall(fn, description) {
  const res = await fn();
  if (!res.success) {
    const err = new Error(`${description}: ${res.error || 'unknown error'}`);
    err.code = res.error; // preserve original code if present
    throw err;
  }
  return res;
}

export const fsFacade = {
  read: (path, { offset, limit } = {}) =>
    safeCall(() => fs_read({ path, offset, limit }), `fs_read ${path}`),
  write: (path, content) =>
    safeCall(() => fs_write({ path, content }), `fs_write ${path}`),
  append: (path, content) =>
    safeCall(() => fs_write_append({ path, content }), `fs_write_append ${path}`),
  edit: (path, oldString, newString) =>
    safeCall(() => fs_edit({ path, oldString, newString }), `fs_edit ${path}`),
  exists: path =>
    safeCall(() => fs_exists({ path }), `fs_exists ${path}`),
  find: (pattern, { path = '.' } = {}) =>
    safeCall(() => fs_find_files({ pattern, path }), `fs_find_files ${pattern}`)
};
