// RETIRED — safe to delete this file.
//
// The PTY moved into terminalSession.cjs as "tier 2", so the interactive shell
// and the agent's commands share ONE per-chat timeline instead of living in two
// unrelated systems. main.cjs no longer registers this module, and the
// __YOGATIK_PTY__ bridge is gone from preload.cjs — a bridge whose handlers do
// not exist answers every call with "No handler registered", which is the
// shipped-dead failure this codebase has hit repeatedly (fs_find_files, the
// getGrantedRoot import that lived in this very file).
//
// The behaviour that mattered is preserved and improved in terminalSession:
//   • the session is keyed by CHAT and survives the drawer closing, where this
//     one was killed on unmount and lost the cwd, the environment and anything
//     still running;
//   • node-pty stays optional, and the UI now says which tier is live instead
//     of offering an interactive prompt that silently swallows keystrokes.

module.exports = {
  registerPty() { /* retired — see electron/terminalSession.cjs */ },
  killAllPty() { /* retired */ },
}
