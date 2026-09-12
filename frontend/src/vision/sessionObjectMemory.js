/**
 * Session Object Memory for Live & Vision
 *
 * Implements Horizon 2 Item 6 from LIVE_ROADMAP.md:
 * Persistent object tracking across camera frames and turns so references like:
 * - "the one on the left"
 * - "the cup on the right"
 * - "what was next to the laptop?"
 * - "what did I look at earlier?"
 * resolve spatially and temporally to actual detected objects.
 */

import { describePosition } from './detect'

/**
 * Creates a stateful object memory container for a live session.
 * @param {Object} [options]
 * @param {number} [options.maxObjects=25]
 * @param {number} [options.ttlMs=180000] - 3-minute object memory retention
 * @returns {SessionObjectMemory}
 */
export function createSessionObjectMemory({ maxObjects = 25, ttlMs = 180000 } = {}) {
  return {
    objects: new Map(),
    history: [],
    maxObjects,
    ttlMs,
    nextId: 1,
  }
}

/**
 * Calculates Intersection-over-Union (IoU) between two bounding boxes.
 */
function boxIoU(a, b) {
  if (!a || !b) return 0
  const xminA = a.xmin ?? 0, yminA = a.ymin ?? 0, xmaxA = a.xmax ?? 0, ymaxA = a.ymax ?? 0
  const xminB = b.xmin ?? 0, yminB = b.ymin ?? 0, xmaxB = b.xmax ?? 0, ymaxB = b.ymax ?? 0

  const xOverlap = Math.max(0, Math.min(xmaxA, xmaxB) - Math.max(xminA, xminB))
  const yOverlap = Math.max(0, Math.min(ymaxA, ymaxB) - Math.max(yminA, yminB))
  const intersection = xOverlap * yOverlap
  if (intersection <= 0) return 0

  const areaA = Math.max(0, xmaxA - xminA) * Math.max(0, ymaxA - yminA)
  const areaB = Math.max(0, xmaxB - xminB) * Math.max(0, yminB - yminB)
  const union = areaA + areaB - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Ingests newly detected objects from a vision frame into session memory.
 * @param {SessionObjectMemory} memory
 * @param {Array<{label: string, score: number, box: Object}>} detectedObjects
 * @param {Object} [options]
 * @param {number} [options.timestamp=Date.now()]
 * @returns {Array<TrackedObject>} Current active tracked objects
 */
export function recordDetections(memory, detectedObjects = [], { timestamp = Date.now() } = {}) {
  if (!memory || !memory.objects) return []

  // 1. Prune expired objects
  for (const [id, obj] of memory.objects.entries()) {
    if (timestamp - obj.lastSeen > memory.ttlMs) {
      memory.objects.delete(id)
    }
  }

  // 2. Track / update objects
  const currentFrameItems = []
  for (const raw of detectedObjects) {
    if (!raw || !raw.label) continue
    const label = String(raw.label).toLowerCase().trim()
    const score = Number(raw.score) || 0
    const box = raw.box || { xmin: 0.5, ymin: 0.5, xmax: 0.5, ymax: 0.5 }

    const cx = ((box.xmin ?? 0) + (box.xmax ?? 0)) / 2
    const cy = ((box.ymin ?? 0) + (box.ymax ?? 0)) / 2
    const horizontal = cx < 0.33 ? 'left' : cx > 0.66 ? 'right' : 'centre'
    const vertical = cy < 0.33 ? 'top' : cy > 0.66 ? 'bottom' : 'middle'
    const position = describePosition(box) || `${vertical} ${horizontal}`

    // Find best match in existing memory
    let bestId = null
    let bestScore = 0

    for (const [id, existing] of memory.objects.entries()) {
      if (existing.label === label) {
        const iou = boxIoU(existing.box, box)
        const dist = Math.hypot(existing.cx - cx, existing.cy - cy)
        // Score based on IoU or centroid proximity
        const matchScore = iou > 0.3 ? iou : (dist < 0.2 ? 1 - dist : 0)
        if (matchScore > 0.4 && matchScore > bestScore) {
          bestScore = matchScore
          bestId = id
        }
      }
    }

    if (bestId) {
      const match = memory.objects.get(bestId)
      match.box = box
      match.cx = cx
      match.cy = cy
      match.horizontal = horizontal
      match.vertical = vertical
      match.position = position
      match.score = Math.max(match.score, score)
      match.lastSeen = timestamp
      match.seenCount = (match.seenCount || 1) + 1
      currentFrameItems.push(match)
    } else {
      const newObj = {
        id: `obj_${memory.nextId++}`,
        label,
        score,
        box,
        cx,
        cy,
        horizontal,
        vertical,
        position,
        firstSeen: timestamp,
        lastSeen: timestamp,
        seenCount: 1,
      }
      memory.objects.set(newObj.id, newObj)
      currentFrameItems.push(newObj)
    }
  }

  // 3. Keep size bounded
  if (memory.objects.size > memory.maxObjects) {
    const sorted = [...memory.objects.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)
    const toRemove = sorted.slice(0, memory.objects.size - memory.maxObjects)
    for (const [id] of toRemove) {
      memory.objects.delete(id)
    }
  }

  // 4. Save frame snapshot to history
  if (currentFrameItems.length) {
    memory.history.push({
      timestamp,
      objectIds: currentFrameItems.map(o => o.id),
    })
    if (memory.history.length > 20) memory.history.shift()
  }

  return getActiveObjects(memory)
}

/**
 * Returns all active tracked objects sorted by most recently seen.
 * @param {SessionObjectMemory} memory
 * @returns {Array<TrackedObject>}
 */
export function getActiveObjects(memory) {
  if (!memory || !memory.objects) return []
  return [...memory.objects.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}

/**
 * Resolves referential queries like "the one on the left" or "the cup in the center"
 * to a specific tracked object.
 * @param {SessionObjectMemory} memory
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.timestamp=Date.now()]
 * @returns {{ resolved: boolean, target: TrackedObject|null, confidence: number, cue?: string, explanation: string, candidates: Array<TrackedObject> }}
 */
export function resolveReference(memory, query = '', { timestamp = Date.now() } = {}) {
  const active = getActiveObjects(memory)
  if (!active.length) {
    return {
      resolved: false,
      target: null,
      confidence: 0,
      explanation: 'No objects currently tracked in session memory.',
      candidates: [],
    }
  }

  const q = String(query || '').toLowerCase()

  // 1. Check for spatial keywords
  const isLeft = /\b(left|leftmost|on the left|to the left|far left)\b/i.test(q)
  const isRight = /\b(right|rightmost|on the right|to the right|far right)\b/i.test(q)
  const isCenter = /\b(centre|center|middle|central|in the middle|in the center)\b/i.test(q)
  const isTop = /\b(top|above|upper|topmost|at the top)\b/i.test(q)
  const isBottom = /\b(bottom|below|lower|at the bottom)\b/i.test(q)
  const isEarlier = /\b(earlier|before|previously|first|what did i (see|look at)|past)\b/i.test(q)

  // 2. Check if a specific object label is mentioned
  let candidates = active.slice()
  let matchedLabel = null
  for (const obj of active) {
    const labelRegex = new RegExp(`\\b${obj.label}\\b`, 'i')
    if (labelRegex.test(q)) {
      matchedLabel = obj.label
      break
    }
  }

  if (matchedLabel) {
    candidates = candidates.filter(o => o.label === matchedLabel)
  }

  if (!candidates.length) candidates = active.slice()

  let target = null
  let cue = ''
  let confidence = 0.5

  if (isLeft) {
    // Leftmost has smallest cx
    target = candidates.reduce((min, o) => (o.cx < min.cx ? o : min), candidates[0])
    cue = 'left'
    confidence = target.horizontal === 'left' ? 0.95 : 0.75
  } else if (isRight) {
    // Rightmost has largest cx
    target = candidates.reduce((max, o) => (o.cx > max.cx ? o : max), candidates[0])
    cue = 'right'
    confidence = target.horizontal === 'right' ? 0.95 : 0.75
  } else if (isCenter) {
    // Closest to cx = 0.5
    target = candidates.reduce((best, o) => (Math.abs(o.cx - 0.5) < Math.abs(best.cx - 0.5) ? o : best), candidates[0])
    cue = 'centre'
    confidence = target.horizontal === 'centre' ? 0.95 : 0.75
  } else if (isTop) {
    target = candidates.reduce((min, o) => (o.cy < min.cy ? o : min), candidates[0])
    cue = 'top'
    confidence = target.vertical === 'top' ? 0.95 : 0.75
  } else if (isBottom) {
    target = candidates.reduce((max, o) => (o.cy > max.cy ? o : max), candidates[0])
    cue = 'bottom'
    confidence = target.vertical === 'bottom' ? 0.95 : 0.75
  } else if (isEarlier) {
    // Oldest firstSeen or item seen in earlier frame
    target = candidates.reduce((oldest, o) => (o.firstSeen < oldest.firstSeen ? o : oldest), candidates[0])
    cue = 'earlier'
    confidence = 0.8
  } else if (matchedLabel && candidates.length === 1) {
    target = candidates[0]
    cue = 'label'
    confidence = 0.9
  }

  if (target) {
    const elapsedSec = Math.max(0, Math.round((timestamp - target.lastSeen) / 1000))
    const recency = elapsedSec <= 1 ? 'just now' : `${elapsedSec}s ago`
    return {
      resolved: true,
      target,
      confidence,
      cue,
      explanation: `Resolved reference "${query.trim()}" to ${target.label} (${target.position}, detected ${recency}).`,
      candidates,
    }
  }

  return {
    resolved: false,
    target: null,
    confidence: 0,
    explanation: `Could not uniquely resolve spatial reference from "${query}".`,
    candidates,
  }
}

/**
 * Formats a concise spatial context block suitable for prompt injection or system status.
 * @param {SessionObjectMemory} memory
 * @param {Object} [options]
 * @param {number} [options.maxItems=6]
 * @param {number} [options.timestamp=Date.now()]
 * @returns {string}
 */
export function formatSpatialContext(memory, { maxItems = 6, timestamp = Date.now() } = {}) {
  const active = getActiveObjects(memory)
  if (!active.length) return ''

  const lines = active.slice(0, maxItems).map((o) => {
    const elapsedSec = Math.max(0, Math.round((timestamp - o.lastSeen) / 1000))
    const age = elapsedSec <= 1 ? 'just now' : `${elapsedSec}s ago`
    return `- ${o.label}: ${o.position} (seen ${age}, conf ${(o.score * 100).toFixed(0)}%)`
  })

  return `[SESSION OBJECT MEMORY (tracked in room/camera):\n${lines.join('\n')}]`
}

/**
 * Resets all tracked objects.
 * @param {SessionObjectMemory} memory
 */
export function clearSessionObjectMemory(memory) {
  if (!memory) return
  memory.objects.clear()
  memory.history = []
  memory.nextId = 1
}
