/**
 * Live session orchestrator: socket + mic + camera + tools, as one object the
 * UI can drive with start/stop/mute.
 *
 * Everything the model hears and says is streamed continuously; there are no
 * turns to wait for. Interruption is server-detected and lands here as an
 * `interrupted` event, which flushes the speaker queue mid-word.
 */

import {
  liveEndpoint, buildSetup, audioChunk, videoFrame, textInput, toolResponse,
  decodeServerMessage, rateFromMime, LIVE_MODELS,
} from './protocol'
import { createMicCapture, createPlayer, base64ToPcm16 } from './audio'
import { createCamera, createScreenCapture } from './video'
import { setSharedVisualSource, clearSharedVisualSource } from '../vision/source'
import { executeTool, getToolSchemas } from '../tools/index'

const FRAME_MS = 1000        // API ceiling is 1fps
const RECONNECT_MAX = 3

/**
 * @param {Object} o
 * @param {string} o.apiKey        Gemini API key
 * @param {string} [o.model]
 * @param {string} [o.voice]
 * @param {string} [o.persona]     appended to the system instruction
 * @param {string[]} [o.disabledTools]
 * @param {boolean} [o.camera]     start with video on
 * @param {Function} o.onEvent     ({type, ...}) => void
 */
export function createLiveSession({
  apiKey, model = LIVE_MODELS[0], voice = 'Puck', persona = null,
  disabledTools = [], camera = true, onEvent = () => {},
}) {
  let ws = null
  let mic = null
  let cam = null
  let screen = null
  let player = null
  let frameTimer = null
  let screenTimer = null
  let resumeHandle = null
  let reconnects = 0
  let closed = false
  let ready = false
  const pending = []           // messages queued before setupComplete

  const emit = (e) => { if (!closed) onEvent(e) }

  const send = (obj) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!ready && !obj.setup) { pending.push(obj); return }
    ws.send(JSON.stringify(obj))
  }

  const systemInstruction = () => `You are Yogatik, talking with the user face to face over live video and voice.

You can see them through their camera and hear them through their microphone. Behave like a person in the room, not a chatbot:
- Speak in short, natural sentences. This is speech, not prose — no markdown, no bullet points, no lists, no headings.
- React to what you actually see. If they hold something up, look at it. If they gesture, respond to it. If they look confused, check in.
- Describe people by what is visible — clothing, expression, what they are doing. Do not guess anyone's name, age, ethnicity, or identity from their face, and do not claim to recognise anyone.
- Never narrate what you are doing ("I am now looking at the image"). Just respond.
- If you did not catch something, say so briefly and ask, the way a person would.
- Let them interrupt you. If they start talking, stop.
- Use a tool only when you truly need outside information; say something short first so the silence is not dead air.${persona ? `\n\nStyle the user chose — follow it for tone, not for the rules above:\n${persona}` : ''}`

  async function runToolCalls(calls) {
    emit({ type: 'tools', names: calls.map(c => c.name) })
    const responses = await Promise.all(calls.map(async (c) => {
      try {
        return { id: c.id, name: c.name, result: await executeTool(c.name, c.args || {}) }
      } catch (e) {
        return { id: c.id, name: c.name, result: { error: e?.message || String(e) } }
      }
    }))
    for (const r of responses) emit({ type: 'toolResult', name: r.name, result: r.result })
    send(toolResponse(responses))
  }

  function handle(msg) {
    for (const ev of decodeServerMessage(msg)) {
      switch (ev.type) {
        case 'ready':
          ready = true
          reconnects = 0
          while (pending.length) ws.send(JSON.stringify(pending.shift()))
          emit({ type: 'ready' })
          break
        case 'audio':
          player?.push(base64ToPcm16(ev.data), rateFromMime(ev.mimeType))
          break
        case 'interrupted':
          player?.flush()
          emit({ type: 'interrupted' })
          break
        case 'toolCall':
          runToolCalls(ev.calls)
          break
        case 'resumeHandle':
          resumeHandle = ev.handle
          break
        case 'goAway':
          // The server is about to hang up; reconnect on the handle so the
          // conversation survives instead of restarting cold.
          reconnect()
          break
        default:
          emit(ev)
      }
    }
  }

  function open() {
    ready = false
    ws = new WebSocket(liveEndpoint(apiKey))
    ws.onopen = () => {
      ws.send(JSON.stringify(buildSetup({
        model,
        systemInstruction: systemInstruction(),
        schemas: getToolSchemas(disabledTools),
        voice,
        resume: resumeHandle,
      })))
      emit({ type: 'connected' })
    }
    ws.onmessage = async (e) => {
      // Browsers deliver these as Blob, not string.
      const raw = typeof e.data === 'string' ? e.data : await e.data.text()
      try { handle(JSON.parse(raw)) } catch { /* keepalive / non-JSON */ }
    }
    ws.onerror = () => emit({ type: 'error', message: 'Live connection failed. Check the Gemini key and that the model supports Live.' })
    ws.onclose = (e) => {
      if (closed) return
      if (e.code === 1008 || e.code === 1007) {
        emit({ type: 'error', message: `Live session rejected (${e.code}). ${e.reason || 'The key may lack Live API access.'}` })
        stop()
        return
      }
      reconnect()
    }
  }

  function reconnect() {
    if (closed) return
    try { ws?.close() } catch {}
    if (reconnects++ >= RECONNECT_MAX) {
      emit({ type: 'error', message: 'Lost the live connection.' })
      stop()
      return
    }
    emit({ type: 'reconnecting', attempt: reconnects })
    setTimeout(() => { if (!closed) open() }, 400 * reconnects)
  }

  async function start() {
    player = createPlayer({
      onLevel: (l) => emit({ type: 'level', who: 'assistant', value: l }),
      onSpeakingChange: (v) => emit({ type: 'speaking', value: v }),
    })
    await player.resume()          // must happen inside the click handler

    mic = await createMicCapture((b64) => send(audioChunk(b64)))
    emit({ type: 'mic', stream: mic.stream })

    if (camera) await enableCamera(true)
    open()
  }

  async function enableCamera(on) {
    if (on && !cam) {
      cam = await createCamera()
      // Let the `see` tool and the vision panel borrow this stream — a second
      // getUserMedia fails on most phones.
      setSharedVisualSource(cam)
      emit({ type: 'camera', stream: cam.stream, video: cam.video })
      let sinceForced = 0
      frameTimer = setInterval(() => {
        const force = ++sinceForced % 5 === 0
        const b64 = cam?.grab(force)
        if (b64) send(videoFrame(b64))
      }, FRAME_MS)
    } else if (!on && cam) {
      clearInterval(frameTimer); frameTimer = null
      clearSharedVisualSource(cam)
      cam.close(); cam = null
      emit({ type: 'camera', stream: null })
    }
  }

  async function enableScreenShare(on) {
    if (on && !screen) {
      try {
        screen = await createScreenCapture()
        setSharedVisualSource(screen)
        emit({ type: 'screen', stream: screen.stream, active: true })
        // Send screen frames at 1fps, same as camera
        let sinceForced = 0
        screenTimer = setInterval(() => {
          if (screen?.stopped) { enableScreenShare(false); return }
          const force = ++sinceForced % 5 === 0
          const b64 = screen?.grab(force)
          if (b64) send(videoFrame(b64))
        }, FRAME_MS)
        // Auto-stop when browser's "Stop sharing" is clicked
        screen.stream.getVideoTracks()[0].addEventListener('ended', () => enableScreenShare(false))
      } catch {
        emit({ type: 'error', message: 'Screen sharing was cancelled or not supported.' })
      }
    } else if (!on && screen) {
      clearInterval(screenTimer); screenTimer = null
      clearSharedVisualSource(screen)
      screen.close(); screen = null
      if (cam) setSharedVisualSource(cam)
      emit({ type: 'screen', stream: null, active: false })
    }
  }

  function stop() {
    if (closed) return
    closed = true
    clearInterval(frameTimer)
    clearInterval(screenTimer)
    try { ws?.close() } catch {}
    clearSharedVisualSource(cam)
    clearSharedVisualSource(screen)
    cam?.close()
    screen?.close()
    mic?.close()
    player?.close()
    ws = null; cam = null; screen = null; mic = null; player = null
    onEvent({ type: 'ended' })
  }

  return {
    start,
    stop,
    enableCamera,
    enableScreenShare,
    sendText: (t) => send(textInput(t)),
    /** Auto-scan tick: Gemini already streams frames, so force one now. */
    watch: () => {
      const b64 = (screen || cam)?.grab(true)
      if (b64) send(videoFrame(b64))
    },
    /** Current frame for the vision panel — never opens a second camera. */
    grabFrame: (profile) => (screen || cam)?.grab(true, profile) || null,
    setMuted: (v) => { mic?.setMuted(v); emit({ type: 'muted', value: v }) },
    isMuted: () => !!mic?.isMuted(),
    get cameraOn() { return !!cam },
    get screenOn() { return !!screen },
  }
}
