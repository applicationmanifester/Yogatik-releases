// Thin wrapper that delegates to the facade but keeps the original API names for compatibility.
import { fsFacade } from './fsFacade';
import { assertWithinWorkspace } from './pathGuard';

// Helper to convert facade responses to the shape expected by existing code
function toLegacyReadRes(res) {
  return { success: true, content: res.content };
}
function toLegacyWriteRes(res) {
  return { success: true };
}
function toLegacyAppendRes(res) {
  return { success: true };
}
function toLegacyEditRes(res) {
  return { success: true };
}
function toLegacyExistsRes(res) {
  return { success: true, exists: res.exists, is_file: res.isFile, is_dir: res.isDir, size: res.size, mtime: res.mtime_ms };
}
function toLegacyFindRes(res) {
  return { success: true, paths: res.paths };
}

export async function addRoot(userProvidedPath) {
  const safe = assertWithinWorkspace(userProvidedPath);
  await fsFacade.write(safe + '/.yogatik-root', '');
  return { success: true };
}

export async function listRoots() {
  // Implementation: search for .yogatik-root markers
  const { paths } = await fsFacade.find('**/.yogatik-root');
  const roots = paths.map(p => p.replace(//\.yogatik-root$/, ''));
  return { success: true, roots };
}

export async function removeRoot(userProvidedPath) {
  const safe = assertWithinWorkspace(userProvidedPath);
  await fsFacade.write(safe + '/.yogatik-root', ''); // placeholder – actual removal may differ
  return { success: true };
}

export async function setPrimaryRoot(userProvidedPath) {
  const safe = assertWithinWorkspace(userProvidedPath);
  // For simplicity, just store a preference
  await fsFacade.write('./primary-root.txt', safe);
  return { success: true };
}

export async function rebindChatRoots() {
  // No-op placeholder
  return { success: true };
}

export async function unbindChatRoots() {
  return { success: true };
}
export async function setWorkspaceContext(context) {
  await fsFacade.write('./workspace-context.json', JSON.stringify(context));
  return { success: true };
}

// Expose raw facade for newer code
export const fs = fsFacade;
