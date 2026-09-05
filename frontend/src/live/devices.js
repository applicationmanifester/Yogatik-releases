/**
 * Camera and microphone selection for Live.
 *
 * The whole module was missing: `createCamera({ facingMode })` hardcoded the
 * front camera and `createMicCapture()` took whatever the OS called default.
 * On a phone that means the one camera you usually do NOT want — you point the
 * back camera at a thing to ask about it — and no way to change either without
 * ending the call.
 *
 * The list/labelling/choosing logic is PURE and lives here so it can be tested
 * without a browser; only `enumerate()` and the getUserMedia calls touch the
 * platform. Same split as maskOps/sam and rootsCore/roots.
 */

/**
 * DEVICE LABELS ARE EMPTY UNTIL PERMISSION IS GRANTED.
 *
 * Browsers return `deviceId: ''` and `label: ''` for every device until the
 * user has allowed camera/mic at least once — it is a fingerprinting defence.
 * So a picker built before the first grant shows a list of blanks, and code
 * that keys off deviceId gets one empty string for every device and treats
 * them as the same device. Both are silent.
 *
 * @param {MediaDeviceInfo[]} devices
 * @returns {{cameras: object[], mics: object[], speakers: object[], needsPermission: boolean}}
 */
export function groupDevices(devices = []) {
  const list = Array.isArray(devices) ? devices : []
  const of = (kind) => list
    .filter(d => d.kind === kind)
    .map((d, i) => ({
      deviceId: d.deviceId || '',
      groupId: d.groupId || '',
      // A blank label is the un-permissioned case; numbering keeps them
      // distinguishable in the UI instead of showing three identical rows.
      label: (d.label || '').trim() || `${defaultName(kind)} ${i + 1}`,
      hasLabel: !!(d.label || '').trim(),
      facing: kind === 'videoinput' ? guessFacing(d.label) : null,
    }))
  const cameras = of('videoinput')
  const mics = of('audioinput')
  return {
    cameras,
    mics,
    speakers: of('audiooutput'),
    // If anything was found but nothing is labelled, permission has not been
    // granted yet — the caller should ask before drawing a picker.
    needsPermission: (cameras.length + mics.length) > 0
      && ![...cameras, ...mics].some(d => d.hasLabel),
  }
}

function defaultName(kind) {
  if (kind === 'videoinput') return 'Camera'
  if (kind === 'audioinput') return 'Microphone'
  return 'Speaker'
}

/**
 * Which way a camera points, from its label.
 *
 * `facingMode` is the reliable signal but it is a CONSTRAINT, not something
 * enumerateDevices reports — so on the device list the label is all there is.
 * Vendors are inconsistent ("front", "user facing", "Facetime HD"), hence a
 * list rather than one regex, and `null` when it genuinely cannot be told
 * rather than a guess that flips the wrong camera on.
 */
export function guessFacing(label = '') {
  const l = String(label).toLowerCase()
  if (/\b(back|rear|environment|world|wide|ultra ?wide|telephoto)\b/.test(l)) return 'environment'
  if (/\b(front|user|selfie|face ?time|facing)\b/.test(l)) return 'user'
  return null
}

/** True when the device has more than one camera worth flipping between. */
export function canFlipCamera(cameras = []) {
  if (cameras.length < 2) return false
  const facings = new Set(cameras.map(c => c.facing).filter(Boolean))
  // Two cameras that both face the same way (a phone's wide and telephoto) are
  // a CHOICE, not a flip. Offering "flip" there moves between two back cameras
  // and looks broken.
  return facings.has('user') && facings.has('environment')
}

/**
 * The camera to switch to when the user taps flip.
 * Falls back to "the next one in the list" when facings are unknown, which is
 * what a user expects from a flip button on a two-camera device even if the
 * labels told us nothing.
 */
export function nextCamera(cameras = [], currentId = '') {
  if (!cameras.length) return null
  const current = cameras.find(c => c.deviceId === currentId) || cameras[0]
  const want = current.facing === 'environment' ? 'user' : 'environment'
  const opposite = cameras.find(c => c.facing === want && c.deviceId !== current.deviceId)
  if (opposite) return opposite
  const i = cameras.indexOf(current)
  return cameras[(i + 1) % cameras.length] || null
}

/**
 * Build a getUserMedia video constraint.
 *
 * An exact deviceId is right once the user has PICKED one, but wrong as an
 * opening move: a saved deviceId from a previous session may name a webcam
 * that is now unplugged, and `exact` fails the whole call with
 * OverconstrainedError rather than falling back. So a remembered id is offered
 * as `ideal`, and only an explicit in-session choice is `exact`.
 */
export function videoConstraints({ deviceId, facingMode, exact = false, width = 1280, height = 720 } = {}) {
  const video = { width: { ideal: width }, height: { ideal: height } }
  if (deviceId) {
    video.deviceId = exact ? { exact: deviceId } : { ideal: deviceId }
  } else if (facingMode) {
    // `ideal` here too: a laptop has no environment camera, and `exact` would
    // simply fail instead of using the one camera it has.
    video.facingMode = { ideal: facingMode }
  }
  return { video, audio: false }
}

/** Build a getUserMedia audio constraint, keeping the echo guards. */
export function audioConstraints({ deviceId, exact = false, noiseSuppression = true } = {}) {
  const audio = {
    // Never negotiable: the model's own voice comes out of the speakers, and
    // without these the session hears itself and interrupts itself forever.
    echoCancellation: true,
    noiseSuppression: noiseSuppression !== false,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 16000,
  }
  if (deviceId) audio.deviceId = exact ? { exact: deviceId } : { ideal: deviceId }
  return { audio }
}

/** Remembered choices survive a reload; a missing device must not break boot. */
const KEY = 'yogatik.live.devices'
export function loadPreferredDevices() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { cameraId: raw.cameraId || '', micId: raw.micId || '', facing: raw.facing || '' }
  } catch { return { cameraId: '', micId: '', facing: '' } }
}
export function savePreferredDevices(next = {}) {
  try {
    const cur = loadPreferredDevices()
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...next }))
  } catch { /* private mode — the choice just does not persist */ }
}

/* ── platform half ────────────────────────────────────────────────────────── */

/** List cameras and microphones. Returns empty groups where unsupported. */
export async function enumerate() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return groupDevices([])
  }
  try {
    return groupDevices(await navigator.mediaDevices.enumerateDevices())
  } catch {
    return groupDevices([])
  }
}

/**
 * Subscribe to devices being plugged in or removed.
 * A headset unplugged mid-call silently moves the microphone; the picker has
 * to notice or it lists hardware that is no longer there.
 */
export function onDeviceChange(fn) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return () => {}
  const handler = () => { enumerate().then(fn).catch(() => {}) }
  navigator.mediaDevices.addEventListener('devicechange', handler)
  return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
}

/**
 * Ask for permission ONCE so labels become readable, then release.
 *
 * Without this the picker can only show "Camera 1 / Camera 2". The stream is
 * stopped immediately — holding it would light the recording indicator for a
 * user who only opened a menu.
 */
export async function primeDeviceLabels({ video = true, audio = true } = {}) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio })
    stream.getTracks().forEach(t => t.stop())
    return true
  } catch {
    return false
  }
}
