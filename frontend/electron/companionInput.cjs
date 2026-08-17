// Precise cross-app input for the AI companion — mouse click / move / scroll and
// named key presses. This turns the companion from "type + hotkey" into real
// computer-use: it can click a button, scroll a page, or focus a field in ANY
// app. Windows only (PowerShell + user32); other platforms return an honest
// "not supported".
//
// Injection-safe by construction: coordinates are coerced to integers and key
// combos are assembled ONLY from a fixed vocabulary (see buildSendKeys) — no raw
// user string is ever interpolated into the shell. (Separate from
// desktop:executeAction on purpose.)
//
// Renderer bridge: window.__YOGATIK_COMPANION_INPUT__.{click,move,scroll,key}

const { ipcMain } = require('electron')
const { exec } = require('child_process')

const isWin = process.platform === 'win32'

// Named keys → SendKeys tokens. Only these are emittable.
const KEYS = {
  enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', escape: '{ESC}', esc: '{ESC}',
  space: ' ', backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}',
  up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
  f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}', f6: '{F6}',
  f7: '{F7}', f8: '{F8}', f9: '{F9}', f10: '{F10}', f11: '{F11}', f12: '{F12}',
}
const MODS = { ctrl: '^', control: '^', alt: '%', shift: '+', win: '^{ESC}' }

/**
 * Turn "ctrl+shift+a" / "enter" into a SendKeys string using ONLY the known
 * vocabulary. Returns null if any token is unknown — the caller then refuses,
 * so no arbitrary text can reach the shell.
 */
function buildSendKeys(combo) {
  const parts = String(combo || '').toLowerCase().split('+').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return null
  let prefix = ''
  let key = ''
  for (const p of parts) {
    if (MODS[p] && p !== 'win') { prefix += MODS[p]; continue }
    if (KEYS[p]) { key = KEYS[p]; continue }
    if (/^[a-z0-9]$/.test(p)) { key = p; continue } // single alphanumeric
    return null // unknown token → reject
  }
  return key ? prefix + key : null
}

function psUser32(body, timeout = 4000) {
  return new Promise((resolve) => {
    const script = `
      $s = @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
'@
      Add-Type -MemberDefinition $s -Name U -Namespace W -ErrorAction SilentlyContinue
      ${body}
    `.replace(/\r?\n/g, ' ')
    exec(`powershell -NoProfile -NonInteractive -Command "${script}"`, { timeout, windowsHide: true },
      (err) => resolve(!err))
  })
}

const int = (v) => Math.round(Number(v) || 0)

function registerCompanionInput() {
  ipcMain.handle('companion:move', async (_e, { x, y } = {}) => {
    if (!isWin) return { success: false, error: 'Mouse control is Windows-only in this build.' }
    const ok = await psUser32(`[W.U]::SetCursorPos(${int(x)}, ${int(y)})`)
    return { success: ok, x: int(x), y: int(y) }
  })

  ipcMain.handle('companion:click', async (_e, { x, y, button = 'left', double = false } = {}) => {
    if (!isWin) return { success: false, error: 'Mouse control is Windows-only in this build.' }
    // left down/up 0x02/0x04, right 0x08/0x10.
    const [down, up] = button === 'right' ? ['0x08', '0x10'] : ['0x02', '0x04']
    const move = (x != null && y != null) ? `[W.U]::SetCursorPos(${int(x)}, ${int(y)}); ` : ''
    const clickOnce = `[W.U]::mouse_event(${down},0,0,0,0); [W.U]::mouse_event(${up},0,0,0,0); `
    const ok = await psUser32(move + clickOnce + (double ? clickOnce : ''))
    return { success: ok, button, double: !!double }
  })

  ipcMain.handle('companion:scroll', async (_e, { amount = -3 } = {}) => {
    if (!isWin) return { success: false, error: 'Scroll control is Windows-only in this build.' }
    // WHEEL 0x0800; positive = up. One notch = 120.
    const delta = int(amount) * 120
    const ok = await psUser32(`[W.U]::mouse_event(0x0800,0,0,[uint32]${delta >>> 0},0)`)
    return { success: ok, amount: int(amount) }
  })

  ipcMain.handle('companion:key', async (_e, combo) => {
    if (!isWin) return { success: false, error: 'Key control is Windows-only in this build.' }
    const keys = buildSendKeys(combo)
    if (!keys) return { success: false, error: `Unsupported key combo: ${combo}` }
    return new Promise((resolve) => {
      // keys comes only from the fixed vocabulary above — safe to interpolate.
      exec(`powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`,
        { timeout: 4000, windowsHide: true }, (err) => resolve({ success: !err, combo }))
    })
  })
}

module.exports = { registerCompanionInput, buildSendKeys }
