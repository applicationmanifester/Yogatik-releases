import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildWorkspaceContextPrompt,
  getGrokInputInjectionScript,
  getGrokCodeExtractionScript,
  injectTextIntoGrok,
  extractLatestCodeFromGrok,
} from './grokBridge'

describe('grokBridge', () => {
  describe('buildWorkspaceContextPrompt', () => {
    it('formats workspace metadata, file list, and active file', () => {
      const prompt = buildWorkspaceContextPrompt({
        projectName: 'AI ChatBot',
        rootPath: '/Users/test/chatbot',
        files: ['src/App.jsx', 'src/llm.js', 'package.json'],
        activeFileName: 'src/App.jsx',
        activeFileContent: 'console.log("hello world")',
        gitBranch: 'main',
        gitStatus: 'clean',
      })

      expect(prompt).toContain('Local Workspace Context: AI ChatBot')
      expect(prompt).toContain('/Users/test/chatbot')
      expect(prompt).toContain('`main` (clean)')
      expect(prompt).toContain('- src/App.jsx')
      expect(prompt).toContain('Active File: `src/App.jsx`')
      expect(prompt).toContain('console.log("hello world")')
    })

    it('works with minimal options', () => {
      const prompt = buildWorkspaceContextPrompt()
      expect(prompt).toContain('Local Workspace Context: Workspace')
      expect(prompt).toContain('Please review this codebase context')
    })
  })

  describe('getGrokInputInjectionScript', () => {
    it('escapes text properly and returns valid evaluation JS', () => {
      const script = getGrokInputInjectionScript('const x = "hello" && y > 10;')
      expect(script).toContain('const x = \\"hello\\" && y > 10;')
      expect(script).toContain('textarea')
      expect(script).toContain('dispatchEvent')
    })
  })

  describe('getGrokCodeExtractionScript', () => {
    it('returns a script that searches for pre and code blocks', () => {
      const script = getGrokCodeExtractionScript()
      expect(script).toContain('querySelectorAll(\'pre\')')
      expect(script).toContain('codeBlocks')
      expect(script).toContain('language-')
    })
  })

  describe('injectTextIntoGrok / extractLatestCodeFromGrok', () => {
    const originalBrowser = window.__YOGATIK_BROWSER__

    beforeEach(() => {
      delete window.__YOGATIK_BROWSER__
    })

    afterEach(() => {
      window.__YOGATIK_BROWSER__ = originalBrowser
    })

    it('throws descriptive error if desktop browser bridge is unavailable', async () => {
      await expect(injectTextIntoGrok('conv-1', 'test')).rejects.toThrow(
        /Desktop browser bridge is not available/
      )
      await expect(extractLatestCodeFromGrok('conv-1')).rejects.toThrow(
        /Desktop browser bridge is not available/
      )
    })

    it('delegates to __YOGATIK_BROWSER__.evaluate when available', async () => {
      const evaluateMock = vi.fn().mockResolvedValue({ success: true, targetType: 'textarea' })
      window.__YOGATIK_BROWSER__ = { evaluate: evaluateMock }

      const res = await injectTextIntoGrok('conv-123', 'Hello Grok')
      expect(evaluateMock).toHaveBeenCalledTimes(1)
      expect(evaluateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-123',
        })
      )
      expect(res.success).toBe(true)
    })
  })
})
