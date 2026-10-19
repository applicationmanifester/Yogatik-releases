/**
 * heavyLazy — one helper for keeping rarely-used heavy tools out of the
 * initial bundle.
 *
 * Pattern: schemas are small static data (safe to keep synchronous so
 * getToolSchemas/prioritizeToolSchemas never go async), while `execute`
 * dynamically imports the heavy module on first real use. Vite turns each
 * dynamic import into its own async chunk, so first paint never pays for a
 * Manim render, a schema nobody asked for, or a checkpoint nobody named.
 *
 * Verified by heavyTools.test.js's bundle gate: the heavy modules must be
 * reachable ONLY via dynamic import from the tool entry points that matter
 * (codeExec→worker, ocr→dynamic vision, videoRender→dynamic encode).
 */

/** Wrap a light schema with a lazily-loaded executor. */
export function lazyTool(schema, loadExecute) {
  if (!schema || typeof loadExecute !== 'function') throw new Error('lazyTool needs a schema and a loader')
  return {
    schema,
    async execute(args, ctx) {
      const mod = await loadExecute()
      const run = mod?.execute || mod?.default?.execute || mod?.default
      if (typeof run !== 'function') throw new Error('Lazy tool module has no execute()')
      return run(args, ctx)
    },
  }
}

/**
 * Tools whose execute path must stay async-chunked (never in the initial
 * bundle). The bundle gate test pins this list so a future static import
 * cannot silently re-bloat first paint.
 */
export const HEAVY_TOOL_MODULES = [
  'tools/codeExec',      // via /worker-pyodide.js (main thread holds no Pyodide)
  'tools/ocr',           // dynamic vision/* + tesseract, heavy worker preferred
  'tools/videoRender',   // dynamic video/* (draw/encode/Kokoro-90MB)
  'tools/docGenerator',  // docx/slides/invoice renderers
  'tools/localGen',      // ComfyUI diffusion payloads
  'tools/manimEngine',   // math animation renderer
]

/** Max initial-bundle cost we accept for any single async heavy chunk (KB). */
export const HEAVY_CHUNK_BUDGET_KB = 900
