// Pure workspace-root logic. Deliberately imports NO electron: vitest runs these
// under jsdom where require('electron') throws, and this is the security-critical
// half, so it must be unit-testable.

const path = require('path')
const crypto = require('crypto')

const isWin = process.platform === 'win32'

/** Case-folded on Windows so C:\Work and c:\work are one root. */
function normaliseForId(p) {
  const n = path.resolve(p)
  return isWin ? n.toLowerCase() : n
}

/** Stable short id for a directory, so re-granting reuses the entry. */
function rootIdFor(p) {
  return crypto.createHash('sha256').update(normaliseForId(p)).digest('hex').slice(0, 12)
}

module.exports = { rootIdFor }
