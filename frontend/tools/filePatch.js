import { fsFacade } from './fsFacade';
import { createHash } from 'crypto';
import { assertWithinWorkspace } from './pathGuard';

/**
 * Apply a transformation to a file in an idempotent way.
 * @param {string} filePath - Path relative to workspace root
 * @param {(original:string)=>string} transformerFn - Function that returns new content
 * @param {string} description - Human-readable description for audit log
 * @returns {{changed:boolean, hashBefore:string, hashAfter:string}}
 */
export async function applyPatch(filePath, transformerFn, description) {
  // Ensure path is safe
  const safePath = assertWithinWorkspace(filePath);

  // 1️⃣ Read current contents
  const { content: original } = await fsFacade.read(safePath);

  // 2️⃣ Compute hash before
  const hashBefore = createHash('sha256').update(original, 'utf8').digest('hex');

  // 3️⃣ Transform
  const updated = transformerFn(original);

  // 4️⃣ Early exit if nothing changed (idempotent)
  if (updated === original) {
    return { changed: false, hashBefore, hashAfter: hashBefore };
  }

  // 5️⃣ Write back
  await fsFacade.write(safePath, updated);

  // 6️⃣ Hash after write
  const hashAfter = createHash('sha256').update(updated, 'utf8').digest('hex');

  // 7️⃣ Append audit entry
  await fsFacade.append(
    './audit/file-changes.log',
    `[${new Date().toISOString()}] ${description}\n` +
      `  file: ${safePath}\n` +
      `  hashBefore: ${hashBefore}\n` +
      `  hashAfter:  ${hashAfter}\n\n`
  );

  return { changed: true, hashBefore, hashAfter };
}

/** Backup a file before destructive edit */
export async function backupFile(filePath) {
  const safePath = assertWithinWorkspace(filePath);
  const { content } = await fsFacade.read(safePath);
  const backupPath = `${safePath}.bak-${Date.now()}`;
  await fsFacade.write(backupPath, content);
  return backupPath;
}
