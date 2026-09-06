import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildWorkspaceContextPrompt,
  buildFolderFilesBundlePrompt,
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

  describe('buildFolderFilesBundlePrompt', () => {
    it('bundles multiple files with explicit anti-artifacts directive', () => {
      const prompt = buildFolderFilesBundlePrompt({
        projectName: 'MyProject',
        rootPath: 'C:/Users/test/MyProject',
        filesWithContent: [
          { path: 'src/index.js', content: 'console.log("start")' },
          { path: 'src/utils.js', content: 'export const add = (a, b) => a + b' },
        ],
      })

      expect(prompt).toContain('Local Windows Project Files Bundle: MyProject')
      expect(prompt).toContain('C:/Users/test/MyProject')
      expect(prompt).toContain('Do NOT execute shell commands looking in /home/workdir/artifacts')
      expect(prompt).toContain('--- FILE: `src/index.js` ---')
      expect(prompt).toContain('console.log("start")')
      expect(prompt).toContain('--- FILE: `src/utils.js` ---')
      expect(prompt).toContain('export const add = (a, b) => a + b')
    })
  })

  describe('getGrokInputInjectionScript', () => {
    it('escapes text properly and returns valid evaluation JS', () => {
      const script = getGrokInputInjectionScript('const x = "hello" && y > 10;')
      expect(script).toContain('const x = \\"hello\\" && y > 10;')
      expect(script).toContain('textarea')
      expect(script).toContain('dispatchEvent')
      expect(script).toContain('findInputDeep')
    })

    it('handles autoSubmit flag', () => {
      const scriptNoSubmit = getGrokInputInjectionScript('test', { autoSubmit: false })
      const scriptWithSubmit = getGrokInputInjectionScript('test', { autoSubmit: true })
      expect(scriptNoSubmit).toContain('if (false)')
      expect(scriptWithSubmit).toContain('if (true)')
      expect(scriptWithSubmit).toContain('btn.click()')
    })
  })

  describe('getGrokCodeExtractionScript', () => {
    it('returns a script that searches for pre and code blocks and strips copy buttons', () => {
      const script = getGrokCodeExtractionScript()
      expect(script).toContain('querySelectorAll(\'pre\')')
      expect(script).toContain('codeBlocks')
      expect(script).toContain('language-')
      expect(script).toContain('cloneNode(true)')
      expect(script).toContain('button, [aria-label*="Copy"]')
      expect(script).toContain('filepath:')
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
