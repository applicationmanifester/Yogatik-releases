// Object detection via connected-component analysis — pure pixel maths, no model.
// Detects distinct foreground blobs with bounding boxes, areas, centroids.
// Best as a fast pre-filter before VLM/OCR, or standalone for UI diagrams.

import { connectedComponents, objectDensitySignal } from '../vision/objectScan'
import { loadImageData } from '../vision/imageStats'

export const objectScanTool = {
  schema: {
    name: 'object_scan',
    description:
      'Scan an image for distinct foreground objects using connected-component
       analysis. Returns bounding boxes, areas, centroids, and a density signal.
       Works on UI screenshots, diagrams, line art, and photos with separated
       subjects. No ML model required — runs in a few milliseconds.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Image URL or data URL to scan',
        },
        minArea: {
          type: 'number',
          description: 'Minimum blob area in pixels (default 100)',
        },
        maxBlobs: {
          type: 'number',
          description: 'Maximum blobs to return (default 50)',
        },
      },
      required: ['url'],
    },
  },

  async execute({ url, minArea = 100, maxBlobs = 50 } = {}) {
    if (typeof url !== 'string' || !url.trim()) {
      return { success: false, error: 'url is required' }
    }

    const loaded = await loadImageData(url)
    if (!loaded) {
      return { success: false, error: 'Could not load image (cross-origin or invalid URL)' }
    }

    const { rgba, width, height } = loaded
    const { blobs, count } = connectedComponents(rgba, width, height, {
      minArea,
      maxBlobs,
    })
    const density = objectDensitySignal(rgba, width, height)

    return {
      success: true,
      tool: 'object_scan',
      width,
      height,
      blobCount: count,
      densitySignal: density,
      objects: blobs.map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        area: b.area,
        centroid: [b.cx, b.cy],
        meanLuma: b.meanLuma,
      })),
      note:
        count === 0
          ? 'No distinct foreground objects detected — image may be a smooth gradient, solid colour, or low contrast.'
          : undefined,
    }
  },
}