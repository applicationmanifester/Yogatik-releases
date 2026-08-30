import { describe, it, expect } from 'vitest'
import { normalizeBarcode, barcodeLookupTool } from './barcodeLookup'

describe('barcodeLookupTool', () => {
  describe('normalizeBarcode', () => {
    it('strips non-digits from barcode inputs', () => {
      expect(normalizeBarcode('030045-044914-7')).toBe('0300450449147')
      expect(normalizeBarcode('  737628064502 ')).toBe('737628064502')
    })
  })

  describe('execute', () => {
    it('rejects invalid or too short barcodes', async () => {
      const res = await barcodeLookupTool.execute({ barcode: '123' })
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/at least 8 numeric digits/i)
    })
  })
})
