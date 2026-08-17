/**
 * video_edit — trim, speed-change and re-encode an EXISTING video.
 *
 * Previously the app could only create video from scenes; nothing could touch a
 * file you already had. This decodes the source by seeking an off-screen
 * <video> and repaints frames into the existing WebCodecs encoder.
 *
 * Says plainly what it cannot do (audio, mainly) rather than returning a silent
 * clip and letting the user discover it.
 */

import { openVideo, seekTo } from '../video/decode'
import { encodeVideo } from '../video/encode'
import { planTrim, planSpeed, formatTimecode, fitDimensions } from '../video/edit'
import { saveMedia } from '../db'

function fail(e) { return { success: false, error: typeof e === 'string' ? e : (e?.message || String(e)) } }

/** Resolve a source reference to something a <video> can load. */
async function resolveSource(args) {
  if (args.url) return args.url
  if (args.media_id) {
    const { getMedia } = await import('../db')
    const rec = await getMedia(args.media_id)
    if (!rec?.blob) throw new Error(`No stored media with id "${args.media_id}".`)
    return URL.createObjectURL(rec.blob)
  }
  throw new Error('Provide media_id (a video this app made) or url.')
}

export const videoEditTool = {
  schema: {
    description:
      'Edit an EXISTING video: trim to a time range, change speed, resize or re-encode at a ' +
      'different quality. Give it media_id (a video this app produced) or a url. ' +
      'Note: the edited clip has NO AUDIO — the source audio track is not carried over. ' +
      'To create a video from scratch instead, use video_render.',
    parameters: {
      type: 'object',
      properties: {
        media_id: { type: 'string', description: 'Id of a video previously produced by this app.' },
        url: { type: 'string', description: 'Direct URL to a video the browser can play (MP4/H.264 or WebM).' },
        start: { type: 'string', description: 'Trim start as seconds or m:ss, e.g. "0:05". Default the beginning.' },
        end: { type: 'string', description: 'Trim end as seconds or m:ss, e.g. "0:20". Default the end.' },
        speed: { type: 'number', description: 'Playback speed, 0.25–8. 2 = twice as fast. Default 1.' },
        fps: { type: 'number', description: 'Output frames per second. Default 30.' },
        width: { type: 'number', description: 'Output width. Defaults to the source width, capped by quality.' },
        height: { type: 'number', description: 'Output height.' },
        quality: { type: 'string', description: "draft | standard | high | max. Use 'high' for text or fine detail." },
      },
      required: [],
    },
  },

  async execute(args = {}) {
    let objectUrl = null
    try {
      if (typeof document === 'undefined') return fail('Video editing runs in the app, not in this environment.')

      const src = await resolveSource(args)
      if (src.startsWith('blob:')) objectUrl = src

      const { video, duration, width: sw, height: sh } = await openVideo(src)

      const fps = Math.max(1, Math.min(60, Math.floor(Number(args.fps) || 30)))
      const speedPlan = planSpeed(1, args.speed ?? 1)          // validates + clamps the factor
      const trim = planTrim(duration, { start: args.start, end: args.end, fps })

      // Output length shrinks with speed: 10s at 2x is 5s.
      const outSeconds = trim.durationSec / speedPlan.factor
      const totalFrames = Math.max(1, Math.round(outSeconds * fps))
      if (totalFrames > 60 * 60 * 10) return fail('That edit would be too long to render here. Trim it further.')

      const dims = fitDimensions(args.width || sw, args.height || sh, args.quality)
      const canvas = document.createElement('canvas')
      canvas.width = dims.width
      canvas.height = dims.height
      const ctx = canvas.getContext('2d')

      const startedAt = Date.now()
      const result = await encodeVideo({
        canvas,
        totalFrames,
        fps,
        quality: args.quality,
        drawFrame: async (i) => {
          const t = trim.startSec + (i / fps) * speedPlan.factor
          await seekTo(video, Math.min(t, trim.endSec))
          ctx.drawImage(video, 0, 0, dims.width, dims.height)
        },
      })

      // encodeVideo returns { blob, mime }; saveMedia wants { blob, mime, filename }.
      const blob = result?.blob
      if (!blob) return fail('The encoder produced no video data.')
      const mediaId = await saveMedia({
        blob, mime: result.mime, filename: `edited-${Date.now()}.mp4`,
      }).catch(() => null)

      return {
        success: true,
        tool: 'video_edit',
        media_id: mediaId,
        video_url: URL.createObjectURL(blob),
        source: { duration: formatTimecode(duration), width: sw, height: sh },
        output: {
          duration: formatTimecode(outSeconds),
          from: formatTimecode(trim.startSec),
          to: formatTimecode(trim.endSec),
          speed: speedPlan.factor,
          fps,
          resolution: `${dims.width}x${dims.height}`,
          frames: totalFrames,
        },
        elapsed_ms: Date.now() - startedAt,
        // Stated every time, because a silent clip is otherwise discovered on playback.
        note: 'The edited clip has no audio — the source audio track is not carried over. ' +
          (speedPlan.clamped ? 'The speed was clamped to the supported range. ' : '') +
          'Rendering seeks the source frame by frame, so long clips take a while.',
      }
    } catch (e) {
      return fail(e)
    } finally {
      if (objectUrl) { try { URL.revokeObjectURL(objectUrl) } catch { /* ignore */ } }
    }
  },
}
