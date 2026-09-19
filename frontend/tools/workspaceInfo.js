// In a real app this might come from an environment variable or main process.
// For now we assume the workspace root is the current working directory.
export function getWorkspaceRoot() {
  return process.cwd();
}
