import { describe, it, expect } from 'vitest'
import {
  formatVisualContextPrompt,
  buildVisualContextPackage,
  extractDetailCrops,
} from './visualContextPackage'

describe('visualContextPackage', () => {
  it('formats visual context into structured prompt for multimodal LLMs', () => {
    const pkg = {
      width: 1280,
      height: 720,
      layoutPattern: 'interactive_ui',
      objects: [
        { id: 1, type: 'button_or_pill', box_2d: [400, 200, 480, 350], area: 1200 },
        { id: 2, type: 'text_line', box_2d: [100, 50, 150, 600], area: 3000 },
      ],
      somTextMap: {
        '1': 'button_or_pill at [400, 200, 480, 350] (#007acc)',
        '2': 'text_line at [100, 50, 150, 600]',
      },
      extractedText: 'Sign In to Continue',
      detailCrops: [{ id: 1, type: 'button_or_pill' }],
    }

    const promptText = formatVisualContextPrompt(pkg)
    expect(promptText).toContain('VISUAL CONTEXT PACKAGE (Model-Agnostic Ground Truth)')
    expect(promptText).toContain('Mark [1]: button_or_pill at [400, 200, 480, 350]')
    expect(promptText).toContain('Sign In to Continue')
    expect(promptText).toContain('Detail Crops Attached: 1')
  })

  it('builds package from normalized image object', async () => {
    const mockNormalized = {
      canvas: null,
      dataUrl: 'data:image/jpeg;base64,mock',
      width: 800,
      height: 600,
    }

    const pkg = await buildVisualContextPackage(mockNormalized, {
      ocrResult: { text: 'Dashboard Overview' },
    })

    expect(pkg).toBeDefined()
    expect(pkg.image).toBe('data:image/jpeg;base64,mock')
    expect(pkg.extractedText).toBe('Dashboard Overview')
    expect(pkg.recommendedTier).toBeDefined()
  })

  it('safely handles detail crops on empty/null input', () => {
    expect(extractDetailCrops(null, [])).toEqual([])
    expect(extractDetailCrops({ width: 0, height: 0 }, [])).toEqual([])
  })
})
