/**
 * Document Picture-in-Picture & Web Screen Monitoring Module
 *
 * Allows the Yogatik web application (in Chrome / Edge 116+) to pop out
 * an always-on-top floating HTML companion window on the user's desktop,
 * and capture real-time frames from any browser tab, window, or monitor.
 */

/** Check if the browser supports the Document Picture-in-Picture API */
export function isDocumentPipSupported() {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

/** Check if the browser supports screen/tab capture */
export function isScreenCaptureSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)
}

let activePipWindow = null
let activeMediaStream = null
let hiddenVideoElement = null

/**
 * Copies all active stylesheets from the main window into the PiP window head.
 */
function copyStylesToPip(pipDoc) {
  // 1. Copy linked stylesheets
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const newLink = pipDoc.createElement('link')
    newLink.rel = 'stylesheet'
    newLink.href = link.href
    pipDoc.head.appendChild(newLink)
  })

  // 2. Copy inline styles
  document.querySelectorAll('style').forEach((style) => {
    const newStyle = pipDoc.createElement('style')
    newStyle.textContent = style.textContent
    pipDoc.head.appendChild(newStyle)
  })

  // 3. Inject base dark background & reset styles for the companion window
  const baseStyle = pipDoc.createElement('style')
  baseStyle.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #0a0e14;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }
    * { box-sizing: border-box; }
  `
  pipDoc.head.appendChild(baseStyle)
}

/**
 * Open a native Document Picture-in-Picture window.
 * Returns the PiP window object where React can render via ReactDOM.createPortal or DOM mount.
 */
export async function openDocumentPip({ width = 380, height = 620, onClosed } = {}) {
  if (!isDocumentPipSupported()) {
    throw new Error('Document Picture-in-Picture is not supported in this browser. Use Chrome or Edge 116+ or the Yogatik Desktop app.')
  }

  // If already open, focus it
  if (activePipWindow && !activePipWindow.closed) {
    activePipWindow.focus()
    return activePipWindow
  }

  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width,
      height,
    })

    activePipWindow = pipWindow
    copyStylesToPip(pipWindow.document)

    pipWindow.addEventListener('pagehide', () => {
      activePipWindow = null
      onClosed?.()
    })

    return pipWindow
  } catch (err) {
    activePipWindow = null
    throw err
  }
}

/**
 * Close active Document PiP window if open
 */
export function closeDocumentPip() {
  if (activePipWindow && !activePipWindow.closed) {
    activePipWindow.close()
    activePipWindow = null
  }
}

export function getActivePipWindow() {
  return activePipWindow && !activePipWindow.closed ? activePipWindow : null
}

/**
 * Start or retrieve a live screen/tab capture stream in the browser.
 */
export async function requestWebScreenStream() {
  if (!isScreenCaptureSupported()) {
    throw new Error('Screen capture is not supported in this browser environment.')
  }

  if (activeMediaStream && activeMediaStream.active) {
    return activeMediaStream
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'browser', // default hint
      },
      audio: false,
    })

    activeMediaStream = stream

    // Prepare hidden video element to read frames onto canvas
    if (!hiddenVideoElement) {
      hiddenVideoElement = document.createElement('video')
      hiddenVideoElement.autoplay = true
      hiddenVideoElement.muted = true
      hiddenVideoElement.playsInline = true
      hiddenVideoElement.style.display = 'none'
      document.body.appendChild(hiddenVideoElement)
    }

    hiddenVideoElement.srcObject = stream
    await hiddenVideoElement.play().catch(() => {})

    stream.getVideoTracks()[0].addEventListener('ended', () => {
      activeMediaStream = null
      if (hiddenVideoElement) hiddenVideoElement.srcObject = null
    })

    return stream
  } catch (err) {
    activeMediaStream = null
    throw err
  }
}

/**
 * Grab a snapshot frame from the active browser screen/tab stream.
 * Returns a high-res base64 JPEG dataUrl.
 */
export async function captureWebScreenFrame() {
  let stream = activeMediaStream
  if (!stream || !stream.active) {
    stream = await requestWebScreenStream()
  }

  if (!hiddenVideoElement || hiddenVideoElement.readyState < 2) {
    // Wait a brief tick for video frame to be available
    await new Promise(r => setTimeout(r, 200))
  }

  const width = hiddenVideoElement.videoWidth || 1920
  const height = hiddenVideoElement.videoHeight || 1080

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(hiddenVideoElement, 0, 0, width, height)

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
  const track = stream.getVideoTracks()[0]
  const trackLabel = track?.label || 'Web Screen / Tab'

  return {
    success: true,
    dataUrl,
    width,
    height,
    sourceLabel: trackLabel,
  }
}

/**
 * Stop active screen capture stream
 */
export function stopWebScreenStream() {
  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach(t => t.stop())
    activeMediaStream = null
  }
  if (hiddenVideoElement) {
    hiddenVideoElement.srcObject = null
  }
}
