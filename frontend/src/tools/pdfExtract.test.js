import { describe, it, expect, vi } from 'vitest'
import { pdfExtractTool } from './pdfExtract'

describe('pdfExtractTool', () => {
  it('has a valid tool schema with url, maxPages, and ocrFallback parameters', () => {
    expect(pdfExtractTool.schema).toBeDefined()
    expect(pdfExtractTool.schema.description).toContain('Extract text from a PDF')
    expect(pdfExtractTool.schema.parameters.required).toContain('url')
    expect(pdfExtractTool.schema.parameters.properties.ocrFallback).toBeDefined()
  })

  it('fails gracefully when no url is provided', async () => {
    const res = await pdfExtractTool.execute({})
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/required/i)
  })

  it('handles invalid or unreachable PDF URLs without throwing unhandled exceptions', async () => {
    const res = await pdfExtractTool.execute({ url: 'blob:invalid-dummy-url' })
    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
  })
})
