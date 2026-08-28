// RETIRED — safe to delete this file.
//
// Superseded by components/TerminalDrawer.jsx + terminal/. The old panel:
//   • spawned its OWN private PTY, so it shared nothing with the agent and
//     could never show what the model had run;
//   • killed that PTY on close, throwing away the cwd, the environment and
//     anything still running in it;
//   • fell back to an in-browser "sandbox" of fake commands whenever node-pty
//     was absent, which is most installs.
//
// Its one part worth keeping — the ANSI parser — now lives in terminal/ansi.js
// and is re-exported here only so a stale import cannot break a build. Nothing
// in the app imports this module.
//
// Delete this file, its test, and electron/pty.cjs, then remove the entry from
// the orphan allowlist in buildGuards.test.js.

export { parseAnsiToSegments } from '../terminal/ansi'
