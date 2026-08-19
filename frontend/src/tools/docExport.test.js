/**
 * Field report: doc_export failed with "Cannot read properties of undefined
 * (reading 'replace')" and produced no document at all.
 *
 * Cause: execute() called filename.replace() and format.toLowerCase() before
 * validating anything, so a model that omitted either argument crashed the tool
 * instead of being told what was missing. Required-in-the-schema is not the same
 * as present-at-runtime.
 */
import { describe, it, expect } from 'vitest'
import { docExportTool } from './independentTools'

const MD = '# Title\n\nSome **content** here.'

describe('doc_export argument handling', () => {
  it('does not crash when filename is missing', async () => {
    const res = await docExportTool.execute({ format: 'doc', content: MD })
    expect(res).toBeDefined()
    expect(String(res.error || '')).not.toMatch(/reading 'replace'/)
  })

  it('does not crash when format is missing', async () => {
    const res = await docExportTool.execute({ filename: 'report.doc', content: MD })
    expect(res).toBeDefined()
    expect(String(res.error || '')).not.toMatch(/toLowerCase/)
  })

  it('does not crash when content is missing', async () => {
    const res = await docExportTool.execute({ filename: 'report.doc', format: 'doc' })
    expect(res).toBeDefined()
    expect(String(res.error || '')).not.toMatch(/undefined/)
  })

  it('does not crash when called with nothing at all', async () => {
    const res = await docExportTool.execute()
    expect(res).toBeDefined()
    expect(res.success).toBe(false)
  })

  it('says WHAT was missing rather than failing opaquely', async () => {
    const res = await docExportTool.execute({ format: 'doc' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/content/i)
  })

  it('infers the format from the filename when only the name is given', async () => {
    const res = await docExportTool.execute({ filename: 'notes.doc', content: MD })
    expect(res.success).toBe(true)
    expect(res.filename).toMatch(/\.doc$/)
  })

  it('still exports normally when everything is supplied', async () => {
    const res = await docExportTool.execute({ filename: 'report.doc', format: 'doc', content: MD })
    expect(res.success).toBe(true)
    expect(res.exported_text || res.content || '').toBeTruthy()
  })
})
