/**
 * `segment` — isolate one object in an image, on device.
 *
 * The gap this fills is measurable and specific. The vision pipeline could
 * already say what KIND of image it is (imageStats), what things are in it
 * (DETR), what it resembles (CLIP), and what text it holds (OCR) — but it had
 * no way to say "just this thing, without the rest of the picture". That is
 * the difference between reading a pill imprint that fills the frame and
 * reading one that occupies 6% of a cluttered photo, which is the exact
 * failure `identify` and `pill_lookup` were built around.
 *
 * So the headline action is not "make a cutout", it is `read` — segment the
 * object, crop to it, and OCR the crop. The cutout is the by-product.
 */

import { segmentAt, renderMask, SEGMENTER } from '../vision/sam'
import { maskToRle } from '../vision/maskOps'
import { ocrTool } from './ocr'

const NEEDS_BROWSER = {
  success: false,
  error: 'Segmentation needs a browser canvas and is not available here.',
}

export const segmentTool = {
  schema: {
    description:
      'Isolate a single object in an image on-device and return a tight crop, a transparent cutout and its bounding box. '
      + 'Use action "read" to segment the object and OCR ONLY that region — that is how you read an imprint, serial, label '
      + 'or expiry that is small inside a busy photo, where plain ocr returns the surrounding clutter instead. '
      + 'Use "cutout" to remove the background, "locate" for just the box and area. '
      + 'Point at the object with x/y (image pixels); the centre is used if you do not. '
      + 'Runs entirely on the user\'s device (~40MB one-time download, requires on-device vision to be enabled).',
    parameters: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'Data URL or URL of the image to segment.' },
        action: {
          type: 'string',
          enum: ['read', 'cutout', 'locate', 'overlay'],
          description: 'read = crop to the object and OCR it (default). cutout = transparent background. locate = box only. overlay = highlight the object.',
        },
        x: { type: 'number', description: 'Point at the object, in image pixels. Defaults to the centre.' },
        y: { type: 'number', description: 'Point at the object, in image pixels. Defaults to the centre.' },
        exclude: {
          type: 'array',
          description: 'Optional points that must NOT be part of the object, as [x, y] pairs — use these to push the mask off a background the model keeps including.',
          items: { type: 'array', items: { type: 'number' } },
        },
        pad: { type: 'number', description: 'Pixels of context to keep around the crop (default 8).' },
      },
      required: ['image_url'],
    },
  },

  async execute({ image_url, action = 'read', x, y, exclude, pad = 8 } = {}) {
    if (!image_url) return { success: false, error: 'image_url is required' }
    if (typeof document === 'undefined') return NEEDS_BROWSER

    const points = []
    const labels = []
    if (typeof x === 'number' && typeof y === 'number') { points.push([x, y]); labels.push(1) }
    for (const p of Array.isArray(exclude) ? exclude : []) {
      if (Array.isArray(p) && p.length >= 2) { points.push([Number(p[0]), Number(p[1])]); labels.push(0) }
    }

    let seg
    try {
      seg = await segmentAt(image_url, { points, labels })
    } catch (e) {
      // A refused download is a normal, actionable result — not a crash. The
      // model tells the user what to switch on rather than the tool failing
      // with something they cannot act on.
      return { success: false, error: e?.message || 'Segmentation failed', model: SEGMENTER.label }
    }
    if (!seg.ok) return { success: false, error: seg.error }

    const geometry = {
      box: seg.bbox,
      area_px: seg.area,
      coverage: Number(seg.coverage.toFixed(4)),
      confidence: Number((seg.iou ?? 0).toFixed(3)),
      stability: Number((seg.stability ?? 0).toFixed(3)),
      image_size: { width: seg.width, height: seg.height },
      ran_on: seg.device,
    }

    if (action === 'locate') {
      return {
        success: true, tool: 'segment', action,
        ...geometry,
        // RLE rather than a million-entry array: a raw mask serialised into a
        // tool result is megabytes of digits in the model's context.
        mask_rle: maskToRle(seg.mask, seg.width, seg.height),
      }
    }

    let rendered
    try {
      rendered = await renderMask(image_url, seg, { pad })
    } catch (e) {
      return { success: false, error: `Could not render the mask: ${e?.message || e}`, ...geometry }
    }

    if (action === 'cutout') {
      return { success: true, tool: 'segment', action, image_url: rendered.cutout, ...geometry }
    }
    if (action === 'overlay') {
      return { success: true, tool: 'segment', action, image_url: rendered.overlay, ...geometry }
    }

    // action === 'read'
    let text = ''
    let ocrError = null
    try {
      const res = await ocrTool.execute({ image_url: rendered.crop })
      text = (res?.text || '').trim()
      if (res?.success === false) ocrError = res.error
    } catch (e) { ocrError = e?.message || String(e) }

    return {
      success: true,
      tool: 'segment',
      action,
      text,
      // Say what was read and from WHERE. "L484" with no indication that it
      // came from a crop covering 4% of the frame invites the model to treat a
      // misread as the whole picture's content.
      note: text
        ? `Read from the segmented object only (${Math.round(geometry.coverage * 100)}% of the frame), not the whole image.`
        : 'The object was isolated but no text was found in it.',
      ...(ocrError ? { ocr_error: ocrError } : {}),
      image_url: rendered.crop,
      ...geometry,
    }
  },
}
