/**
 * cast_to_tv — throw Yogatik's own generated media (or any http(s) video/image
 * URL) to a TV or receiver on the local network, using UPnP/DLNA AVTransport.
 *
 * WHY THIS EXISTS AND WHAT IT DELIBERATELY IS NOT: an earlier pass evaluated
 * porting a third-party CLI caster wholesale. That tool solves casting an
 * ARBITRARY browser tab, which needs capturing a live stream (CDP) and
 * transcoding it on the fly (ffmpeg) — a real new dependency this zero-backend
 * app does not otherwise need. What Yogatik actually has to cast is its OWN
 * already-rendered output: an MP4 muxed by video_render's WebCodecs pipeline,
 * or a PNG/JPEG from image_generate/local_image_generate — formats every
 * mainstream DLNA renderer already plays natively. So there is nothing to
 * transcode, and this needs no ffmpeg and no bundled app: UPnP AVTransport is
 * an open, stable protocol (unchanged since 2008) spoken over plain HTTP+XML,
 * implemented here from the spec (electron/castCore.cjs) using only Node's
 * own dgram/http — the same "write the small parser from the definitions"
 * choice this codebase already made for CSV, git-porcelain and RLE.
 *
 * NOTE ON NAMING: this casts over DLNA/UPnP, not Google's proprietary Cast
 * protocol — most smart TVs and many Chromecast-equipped devices expose a
 * DLNA renderer as a secondary interface, which is what discovery finds, but
 * a device that speaks ONLY Cast (no DLNA at all) will not show up.
 *
 * Desktop app only — needs a real UDP socket and a real local HTTP server,
 * neither of which the web build's sandbox allows.
 */

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_CAST__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Casting to a TV runs only in the Yogatik desktop app (it needs a real network socket).',
}

// Same chunked-base64 approach as local_image_generate/local_video_generate
// (tools/localGen.js) — kept local rather than imported, matching this
// codebase's convention of small tool files staying self-contained.
async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function fail(e) { return { success: false, error: typeof e === 'string' ? e : (e?.message || String(e)) } }

/** Resolves media_id/file_path/url into the args castTo's IPC call needs. */
async function resolveMediaArgs(args) {
  if (args.url) {
    return { url: args.url, filename: args.filename, title: args.title }
  }
  if (args.file_path) {
    return { filePath: args.file_path, filename: args.filename || args.file_path.split(/[\\/]/).pop(), title: args.title }
  }
  if (args.media_id) {
    const { getMedia } = await import('../db')
    const rec = await getMedia(args.media_id)
    if (!rec?.blob) throw new Error(`No stored media with id "${args.media_id}". It may have been pruned — this app keeps a limited history.`)
    const bytesBase64 = await blobToBase64(rec.blob)
    return { bytesBase64, mime: rec.mime, filename: rec.filename || args.title, title: args.title || rec.filename }
  }
  throw new Error('Provide media_id (something this app made — an image/video result carries one), file_path (an absolute path, e.g. from file_dialog), or url (a direct http(s) link).')
}

export const castToTvTool = {
  schema: {
    description:
      'Cast an image or video to a TV or receiver on the local network over UPnP/DLNA — no ffmpeg, no external app, nothing to install. ' +
      'Start with action "discover" to find devices (returns device_id for each) — try this again if a device you expect is missing, devices can take a moment to answer. ' +
      'Then action "cast" with device_id and ONE of: media_id (an image/video this app already produced — the result of image_generate/local_image_generate/video_render carries one), ' +
      'file_path (an absolute local path, e.g. from file_dialog), or url (a direct http(s) link to a video/image — cast straight from the source, nothing is downloaded through this app first). ' +
      'Use "pause"/"resume"/"stop" for transport control and "set_volume" (0-100) once something is casting — device_id can be omitted on these to mean "whatever is currently casting". ' +
      'Use "status" to check what a device is currently doing. ' +
      'This speaks DLNA/UPnP specifically — most smart TVs support it, but a device that ONLY speaks Google\'s proprietary Cast protocol will not be found. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['discover', 'list_devices', 'cast', 'pause', 'resume', 'stop', 'set_volume', 'status'],
          description: 'What to do.',
        },
        device_id: { type: 'string', description: 'A device id from "discover". Optional on pause/resume/stop/set_volume/status — defaults to whatever was last cast to.' },
        media_id: { type: 'string', description: 'Id of an image/video this app already produced.' },
        file_path: { type: 'string', description: 'Absolute local file path to cast (from file_dialog — do not invent one).' },
        url: { type: 'string', description: 'A direct http(s) URL to a video or image — cast straight from the source.' },
        title: { type: 'string', description: 'A display title for the device to show, if it shows one.' },
        volume: { type: 'number', description: '0-100. Required for set_volume.' },
        timeout_ms: { type: 'number', description: 'How long discover waits for replies. Default ~2.5s.' },
      },
      required: ['action'],
    },
  },

  async execute(args = {}) {
    const b = bridge()
    if (!b) return DESKTOP_ONLY
    const action = args.action

    try {
      switch (action) {
        case 'discover': {
          const res = await b.discover({ timeoutMs: args.timeout_ms })
          if (!res?.success) return fail(res?.error || 'discovery failed')
          if (!res.devices.length) {
            return { success: true, devices: [], note: 'No UPnP/DLNA renderers answered. Make sure the TV is on the same network and its DLNA/screen-share feature is on, then try again.' }
          }
          return { success: true, devices: res.devices }
        }
        case 'list_devices': {
          const res = await b.listDevices()
          return { success: true, devices: res?.devices || [] }
        }
        case 'cast': {
          if (!args.device_id) return fail('device_id is required — call discover first.')
          // resolveMediaArgs always includes `title` itself (falling back to
          // args.title or a sensible default per source), so it is not also
          // passed here — that would just be silently overwritten by the
          // spread below, which is confusing to read even though harmless.
          const media = await resolveMediaArgs(args)
          const res = await b.cast({ deviceId: args.device_id, ...media })
          if (!res?.success) return fail(res?.error || 'cast failed')
          return { success: true, device: res.device, casting: true }
        }
        case 'pause':
          return await b.pause({ deviceId: args.device_id })
        case 'resume':
          return await b.resume({ deviceId: args.device_id })
        case 'stop':
          return await b.stop({ deviceId: args.device_id })
        case 'set_volume': {
          if (args.volume == null) return fail('volume (0-100) is required')
          return await b.setVolume({ deviceId: args.device_id, volume: args.volume })
        }
        case 'status':
          return await b.status({ deviceId: args.device_id })
        default:
          return fail(`Unsupported action: ${action}. Valid actions: discover, list_devices, cast, pause, resume, stop, set_volume, status.`)
      }
    } catch (e) {
      return fail(e)
    }
  },
}
