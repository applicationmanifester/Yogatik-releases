import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getGeminiInputInjectionScript,
  getGeminiCodeExtractionScript,
  injectTextIntoGemini,
  extractLatestCodeFromGemini,
} from './geminiBridge'

describe('geminiBridge', () => {
  describe('getGeminiInputInjectionScript', () => {
    it('generates valid script targeting rich-text / ql-editor / contenteditable elements', () => {
      const script = getGeminiInputInjectionScript('Analyze my Python function')
      expect(script).toContain('.ql-editor')
      expect(script).toContain('rich-textarea')
      expect(script).toContain('Analyze my Python function')
      expect(script).toContain('dispatchEvent')
    })
  })

  describe('getGeminiCodeExtractionScript', () => {
    it('returns a script searching for pre, code-block, and pre code elements', () => {
      const script = getGeminiCodeExtractionScript()
      expect(script).toContain('querySelectorAll(\'pre, code-block, .code-block\')')
      expect(script).toContain('codeBlocks')
      expect(script).toContain('language-')
    })
  })

  describe('injectTextIntoGemini & extractLatestCodeFromGemini', () => {
    const originalBrowser = window.__YOGATIK_BROWSER__

    beforeEach(() => {
      delete window.__YOGATIK_BROWSER__
    })

    afterEach(() => {
      window.__YOGATIK_BROWSER__ = originalBrowser
    })

    it('throws when browser bridge is missing', async () => {
      await expect(injectTextIntoGemini('gemini-dock', 'test')).rejects.toThrow(
        /Desktop browser bridge is not available/
      )
      await expect(extractLatestCodeFromGemini('gemini-dock')).rejects.toThrow(
        /Desktop browser bridge is not available/
      )
    })

    it('invokes evaluate when desktop bridge is present', async () => {
      const evaluateMock = vi.fn().mockResolvedValue({ success: true, targetType: 'div' })
      window.__YOGATIK_BROWSER__ = { evaluate: evaluateMock }

      const res = await injectTextIntoGemini('gemini-dock', 'Hello Gemini')
      expect(evaluateMock).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'gemini-dock' })
      )
      expect(res.success).toBe(true)
    })
  })
})
