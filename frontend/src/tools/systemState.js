/**
 * system_state — report desktop power/idle state (idle seconds, on battery vs
 * AC). Desktop app only. Complements the existing screen_inspect / system-info
 * capabilities with live power awareness the browser cannot see.
 */

function powerBridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_POWER__) || null
}
function desktopBridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_DESKTOP__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'System power/idle state is available only in the Yogatik desktop app.',
}

export const systemStateTool = {
  schema: {
    description:
      'Report the desktop machine’s power and idle state: how long the user has been idle, and whether the device is on battery or AC power. ' +
      'Use for "am I idle", "how long since I touched the computer", or battery-aware behaviour. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    const p = powerBridge()
    if (!p) return DESKTOP_ONLY
    try {
      const state = await p.getState()
      let system
      const d = desktopBridge()
      if (d?.getSystemInfo) {
        try { system = await d.getSystemInfo() } catch { /* optional */ }
      }
      return {
        success: true,
        idleSeconds: state?.idleSeconds ?? null,
        idleMinutes: state?.idleSeconds != null ? Math.round(state.idleSeconds / 60) : null,
        onBattery: state?.onBattery ?? null,
        system,
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
