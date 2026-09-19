import { path as nodePath } from 'path';
import { getWorkspaceRoot } from './workspaceInfo';

export function assertWithinWorkspace(userPath) {
  const absolute = nodePath.resolve(getWorkspaceRoot(), userPath);
  if (!absolute.startsWith(getWorkspaceRoot())) {
    throw new Error(`Path traversal detected: ${userPath}`);
  }
  // Optional: reject certain dangerous filenames
  const basename = nodePath.basename(absolute);
  if (basename.startsWith('.') && basename !== '.gitkeep') {
    // disallow hidden files unless explicitly allowed
    throw new Error(`Hidden file not allowed: ${basename}`);
  }
  return absolute; // return the normalized absolute path for downstream use
}
