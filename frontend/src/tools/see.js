/**
 * `see` — let any model look through the camera (or at the last uploaded image).
 *
 * Three fallbacks, tried in order, so vision is never a single vendor's feature:
 *   1. the active model, if it can take images  -> the frame is handed to it directly
 *   2. the on-device VLM (SmolVLM, WebGPU)      -> returns a text observation
 *   3. an honest error
 *
 * Path 1 is decided by the agent, not here: this tool returns the frame and the
 * agent attaches it to the next turn when the model can see.
 */

import { createCamera } from '../live/video'
import { askLocalVLM, isLocalVLMReady, DEFAULT_LOCAL_VLM } from '../vision/localVLM'

let camera = null
let idleTimer = null

/** One shared camera; opening a second stream fails on most phones. */
async function getCamera(facingMode) {
  if (!camera) camera = await createCamera({ facingMode })
  clearTimeout(idleTimer)
  // Release the camera (and its light) when nobody has looked for a while.
  idleTimer = setTimeout(releaseCamera, 60000)
  return camera
}

export function releaseCamera() {
  clearTimeout(idleTimer)
  camera?.close()
  camera = null
}

/** Set by the app when the user attaches an image, so `see` can read that instead. */
let pendingImage = null
export function setPendingImage(dataUrl) { pendingImage = dataUrl || null }
export function getPendingImage() { return pendingImage }

/**
 * Runtime context the agent injects: whether the chat model itself can see.
 * Module-level because executeTool's signature is (name, args) everywhere else
 * and widening it would touch all 44 tools.
 */
let ctx = { modelCanSee: false, allowLocal: true }
export function setVisionContext(next) { ctx = { ...ctx, ...next } }

export const seeTool = {
  schema: {
    description:
      'Look through the user\'s camera and answer a question about what is visible. ' +
      'Use for "what am I holding", "what does this say", "how do I look", "what is in front of me". ' +
      'Asks permission the first time. Do not call it for questions that are not about the here and now.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'What you want to know about the scene' },
        camera: { type: 'string', enum: ['front', 'back'], description: 'Which camera to use. Default front.' },
      },
      required: ['question'],
    },
  },

  async execute({ question, camera: which = 'front' }) {
    let image = pendingImage
    if (!image) {
      try {
        const cam = await getCamera(which === 'back' ? 'environment' : 'user')
        // force: an explicit request must always produce a frame, even if the
        // scene has not changed since the last look.
        const b64 = cam.grab(true)
        if (!b64) return { success: false, error: 'The camera returned no frame. It may still be warming up — try once more.' }
        image = `data:image/jpeg;base64,${b64}`
      } catch (e) {
        return {
          success: false,
          error: e?.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in the browser address bar to let me see.'
            : `Could not open the camera: ${e?.message || e}`,
        }
      }
    }

    // Path 1 — the chat model can see it itself. Hand the pixels up.
    if (ctx.modelCanSee) {
      return {
        success: true, tool: 'see', via: 'model',
        image,
        question,
        note: 'Image captured — answer the question from the image that follows.',
      }
    }

    // Path 2 — describe it on-device and pass text up instead.
    if (ctx.allowLocal) {
      try {
        const observation = await askLocalVLM(image, question)
        return {
          success: true, tool: 'see', via: 'local-vlm',
          image, question, observation,
          model: DEFAULT_LOCAL_VLM,
          note: isLocalVLMReady()
            ? 'Observed by the on-device vision model. It is small — trust the broad description more than fine detail.'
            : 'On-device vision model loaded for this answer.',
        }
      } catch (e) {
        return {
          success: false, image,
          error: `The active model cannot see images, and the on-device vision model failed to run: ${e?.message || e}`,
        }
      }
    }

    return {
      success: false, image,
      error: 'No vision available: the current model cannot take images and on-device vision is turned off.',
    }
  },
}
