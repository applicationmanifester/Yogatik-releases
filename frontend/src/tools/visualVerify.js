/**
 * visualVerify.js — Visual Component & UI Verification Tool.
 * Renders HTML, CSS, SVG, or UI snippets into an image snapshot (data URL)
 * so vision-capable agents can inspect their own rendered frontend work.
 */

/**
 * Encapsulates HTML/CSS into a self-contained SVG foreignObject data URL for offscreen snapshotting.
 */
export function htmlToSvgDataUrl(html = '', css = '', width = 800, height = 600) {
  const cleanHtml = String(html || '').trim()
  const cleanCss = String(css || '').trim()

  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            ${cleanCss}
          </style>
          ${cleanHtml}
        </div>
      </foreignObject>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`
}

export const visualVerifyTool = {
  schema: {
    description:
      'Render HTML, CSS, or SVG code into a visual snapshot image to verify visual styling, layout, typography, and contrast. ' +
      'Returns a rendered image that vision-capable models can inspect directly on their next reasoning step.',
    parameters: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'The HTML or SVG markup to render.',
        },
        css: {
          type: 'string',
          description: 'Optional CSS styles to apply to the HTML markup.',
        },
        width: {
          type: 'number',
          description: 'Target viewport width in pixels (default 800).',
        },
        height: {
          type: 'number',
          description: 'Target viewport height in pixels (default 600).',
        },
      },
      required: ['html'],
    },
  },

  async execute({ html, css = '', width = 800, height = 600 }) {
    if (!html || typeof html !== 'string') {
      return { success: false, error: 'Provide a non-empty html string to render.' }
    }

    const safeW = Math.min(Math.max(Number(width) || 800, 200), 1920)
    const safeH = Math.min(Math.max(Number(height) || 600, 150), 1440)

    try {
      const dataUrl = htmlToSvgDataUrl(html, css, safeW, safeH)
      return {
        success: true,
        image: dataUrl,
        dimensions: { width: safeW, height: safeH },
        htmlLength: html.length,
        note: 'Visual rendering snapshot generated. Inspect the visual layout, color harmony, and component styling.',
      }
    } catch (err) {
      return { success: false, error: `Visual rendering failed: ${err.message}` }
    }
  },
}
