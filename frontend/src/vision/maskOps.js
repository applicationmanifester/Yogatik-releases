/**
 * Binary-mask maths for on-device segmentation.
 *
 * PURE — no DOM, no model, no network — so it is unit-testable under node and
 * so the expensive half (a 40MB model download) is never required to reason
 * about the cheap half. Same split as imageStats/preprocess and rootsCore:
 * every time this codebase has mixed the two, the logic became untestable and
 * a bug hid in it for months.
 *
 * The operations are the ones SAM's own post-processing needs — stability
 * score, small-region removal, RLE, box-from-mask, IoU/NMS — written from the
 * definitions rather than ported, so nothing here inherits a licence or a
 * Python idiom. SAM itself is Apache-2.0, so a port would have been allowed;
 * it just would not have been better.
 *
 * A mask is a Uint8Array of 0/1, length width*height, row-major.
 */

/** Pixels set in the mask. */
export function maskArea(mask) {
  let n = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++
  return n
}

/**
 * Tight bounding box, or null for an empty mask.
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function maskBBox(mask, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Threshold a float logit map into a binary mask. */
export function thresholdMask(logits, threshold = 0) {
  const out = new Uint8Array(logits.length)
  for (let i = 0; i < logits.length; i++) out[i] = logits[i] > threshold ? 1 : 0
  return out
}

/**
 * How much the mask changes when the threshold is nudged.
 *
 * SAM's stability score: |mask at (t+d)| / |mask at (t-d)|. A confident mask
 * barely moves and scores near 1; a mask whose boundary sits in a smear of
 * near-threshold values collapses and scores low. It is the single cheapest
 * way to throw away a plausible-looking wrong answer, and it costs two passes
 * over the logits with no model involved.
 *
 * Returns 0 for a mask that is empty at the lower threshold — dividing by zero
 * there would report perfect stability for nothing at all.
 */
export function stabilityScore(logits, threshold = 0, delta = 1) {
  let high = 0
  let low = 0
  for (let i = 0; i < logits.length; i++) {
    const v = logits[i]
    if (v > threshold + delta) high++
    if (v > threshold - delta) low++
  }
  if (!low) return 0
  return high / low
}

/** Intersection over union of two masks of the same size. */
export function maskIoU(a, b) {
  let inter = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ? 1 : 0
    const y = b[i] ? 1 : 0
    if (x & y) inter++
    if (x | y) union++
  }
  return union ? inter / union : 0
}

/**
 * Connected components over 4-neighbours, iteratively.
 *
 * Iterative and not recursive on purpose: a mask that covers most of a
 * 1024x1024 image is a million-deep recursion and a blown stack, which is
 * exactly the shape of failure fsIndex's walk had before it was flattened.
 *
 * @returns {{labels:Int32Array, sizes:number[]}} labels are 1-based; 0 is background.
 */
export function connectedComponents(mask, width, height) {
  const labels = new Int32Array(mask.length)
  const sizes = []
  const stack = []
  let next = 0

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue
    next++
    let size = 0
    stack.push(start)
    labels[start] = next
    while (stack.length) {
      const i = stack.pop()
      size++
      const x = i % width
      const y = (i - x) / width
      if (x > 0 && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = next; stack.push(i - 1) }
      if (x < width - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = next; stack.push(i + 1) }
      if (y > 0 && mask[i - width] && !labels[i - width]) { labels[i - width] = next; stack.push(i - width) }
      if (y < height - 1 && mask[i + width] && !labels[i + width]) { labels[i + width] = next; stack.push(i + width) }
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

/**
 * Drop speckle and fill pinholes.
 *
 * A segmentation mask routinely comes back with a few dozen stray pixels
 * elsewhere in the frame and a scatter of holes inside the object. Cropping to
 * the bounding box of a mask with one stray pixel in the far corner gives you
 * the whole image back — which looks like the crop silently did nothing.
 *
 * @param {'islands'|'holes'|'both'} mode
 * @param {number} minArea pixels; components smaller than this are removed
 */
export function removeSmallRegions(mask, width, height, minArea = 32, mode = 'both') {
  let out = mask
  if (mode === 'islands' || mode === 'both') {
    out = filterComponents(out, width, height, minArea, 1)
  }
  if (mode === 'holes' || mode === 'both') {
    // Holes are islands of the INVERSE. Invert, drop the small ones, invert
    // back — no separate algorithm needed.
    const inv = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) inv[i] = out[i] ? 0 : 1
    const cleaned = filterComponents(inv, width, height, minArea, 1)
    const res = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) res[i] = cleaned[i] ? 0 : 1
    out = res
  }
  return out
}

function filterComponents(mask, width, height, minArea, keepValue) {
  const { labels, sizes } = connectedComponents(mask, width, height)
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) {
    const l = labels[i]
    if (l && sizes[l - 1] >= minArea) out[i] = keepValue
  }
  return out
}

/** Keep only the largest connected component. */
export function largestComponent(mask, width, height) {
  const { labels, sizes } = connectedComponents(mask, width, height)
  if (!sizes.length) return new Uint8Array(mask.length)
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i
  const want = best + 1
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) if (labels[i] === want) out[i] = 1
  return out
}

/**
 * COCO-style run-length encoding, column-major, starting with a run of zeros.
 *
 * Column-major because that is what COCO RLE is, and a mask exported in the
 * wrong axis order decodes to noise that still has the right pixel count — so
 * it passes every size check and fails only visually.
 */
export function maskToRle(mask, width, height) {
  const counts = []
  let run = 0
  let current = 0
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const v = mask[y * width + x] ? 1 : 0
      if (v === current) { run++ } else { counts.push(run); run = 1; current = v }
    }
  }
  counts.push(run)
  return { size: [height, width], counts }
}

/** Inverse of maskToRle. */
export function rleToMask({ size, counts }) {
  const [height, width] = size
  const mask = new Uint8Array(width * height)
  let i = 0
  let value = 0
  for (const count of counts) {
    for (let n = 0; n < count; n++, i++) {
      if (value) {
        const x = Math.floor(i / height)
        const y = i % height
        mask[y * width + x] = 1
      }
    }
    value = value ? 0 : 1
  }
  return mask
}

/**
 * Greedy non-maximum suppression over masks.
 * SAM returns several candidate masks per prompt (whole object / part /
 * sub-part) and they overlap heavily; without this the caller gets three
 * spellings of the same answer.
 */
export function maskNms(candidates, iouThreshold = 0.7) {
  const kept = []
  for (const c of [...candidates].sort((a, b) => (b.score || 0) - (a.score || 0))) {
    if (kept.some(k => maskIoU(k.mask, c.mask) > iouThreshold)) continue
    kept.push(c)
  }
  return kept
}

/**
 * Choose the best of SAM's candidate masks.
 *
 * The model's own predicted IoU is the headline number, but it is only its
 * opinion — a mask can score well and still be a smear. Blending it with the
 * measured stability score, and refusing anything that covers essentially the
 * whole frame or essentially nothing, is what stops "segment the pill" from
 * returning the entire photo.
 */
export function pickBestMask(candidates, { width, height, minCoverage = 0.0005, maxCoverage = 0.95 } = {}) {
  const total = width * height
  let best = null
  for (const c of candidates) {
    const area = c.area != null ? c.area : maskArea(c.mask)
    const coverage = area / total
    if (coverage < minCoverage || coverage > maxCoverage) continue
    const score = 0.6 * (c.iou ?? 0) + 0.4 * (c.stability ?? 0)
    if (!best || score > best.score) best = { ...c, area, coverage, score }
  }
  return best
}

/** Expand a box by `pad` pixels, clamped to the image. */
export function padBox(box, pad, width, height) {
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  return {
    x,
    y,
    width: Math.min(width - x, box.width + pad * 2),
    height: Math.min(height - y, box.height + pad * 2),
  }
}
