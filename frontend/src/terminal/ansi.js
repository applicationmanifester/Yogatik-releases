// ANSI escape-sequence parsing for the terminal drawer.
//
// Lifted out of the old TerminalPanel when that component was retired: the
// parser is the one piece of it that was worth keeping, and leaving it inside a
// dead component would have made the component look alive.

const ANSI_COLOR_MAP = {
  30: '#4b5563', // black / gray
  31: '#ef4444', // red
  32: '#10b981', // green
  33: '#f59e0b', // yellow
  34: '#3b82f6', // blue
  35: '#a855f7', // magenta
  36: '#06b6d4', // cyan
  37: '#e5e7eb', // white
  90: '#6b7280', // bright black / gray
  91: '#f87171', // bright red
  92: '#34d399', // bright green
  93: '#fbbf24', // bright yellow
  94: '#60a5fa', // bright blue
  95: '#c084fc', // bright magenta
  96: '#22d3ee', // bright cyan
  97: '#ffffff', // bright white
}

export function parseAnsiToSegments(text) {
  if (typeof text !== 'string') text = String(text ?? '')
  if (!text.includes('\x1b')) {
    return [{ text, color: null, bold: false, dim: false, underline: false }]
  }

  const segments = []
  const regex = /\x1b\[([0-9;]*)m/g
  let lastIndex = 0
  let currentColor = null
  let currentBold = false
  let currentDim = false
  let currentUnderline = false

  let match
  while ((match = regex.exec(text)) !== null) {
    const rawMatch = match[0]
    const codesStr = match[1]
    const matchIndex = match.index

    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        color: currentColor,
        bold: currentBold,
        dim: currentDim,
        underline: currentUnderline,
      })
    }

    lastIndex = matchIndex + rawMatch.length

    const codes = codesStr ? codesStr.split(';').map(Number) : [0]
    for (const code of codes) {
      if (code === 0) {
        currentColor = null
        currentBold = false
        currentDim = false
        currentUnderline = false
      } else if (code === 1) {
        currentBold = true
      } else if (code === 2) {
        currentDim = true
      } else if (code === 4) {
        currentUnderline = true
      } else if (code === 22) {
        currentBold = false
        currentDim = false
      } else if (code === 24) {
        currentUnderline = false
      } else if (code === 39) {
        currentColor = null
      } else if (ANSI_COLOR_MAP[code]) {
        currentColor = ANSI_COLOR_MAP[code]
      }
    }
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      color: currentColor,
      bold: currentBold,
      dim: currentDim,
      underline: currentUnderline,
    })
  }

  return segments.length ? segments : [{ text: '', color: null }]
}
