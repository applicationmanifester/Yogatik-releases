import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { normalizeImprint, pillLookupTool } from './pillLookup'
import * as httpModule from './http'

describe('pillLookupTool', () => {
  describe('normalizeImprint', () => {
    it('cleans up imprint strings by removing extraneous symbols', () => {
      expect(normalizeImprint('L 484')).toBe('L 484')
      expect(normalizeImprint('M-367')).toBe('M-367')
      expect(normalizeImprint('IP/109')).toBe('IP/109')
      expect(normalizeImprint('  v_4812!! ')).toBe('V4812')
    })
  })

  describe('execute', () => {
    it('returns validation error when no imprint and no drug name is supplied', async () => {
      const res = await pillLookupTool.execute({})
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/either an engraved imprint code/i)
    })

    it('identifies pill using mocked RxNav and OpenFDA data', async () => {
      vi.spyOn(httpModule, 'proxyJson').mockImplementation(async (url) => {
        if (url.includes('approximateTerm')) {
          return { approximateGroup: { candidate: [{ rxcui: '209459', score: '100' }] } }
        }
        if (url.includes('allProperties')) {
          return { propConceptGroup: { propConcept: [{ propName: 'RxNorm Name', propValue: 'Acetaminophen 500 MG Oral Tablet' }] } }
        }
        if (url.includes('api.fda.gov')) {
          return {
            results: [{
              openfda: { brand_name: ['Tylenol Extra Strength'], generic_name: ['Acetaminophen'] },
              purpose: ['Pain reliever/fever reducer'],
              warnings: ['Liver warning: This product contains acetaminophen.'],
            }],
          }
        }
        return {}
      })

      const res = await pillLookupTool.execute({ imprint: 'L484', color: 'white', shape: 'capsule' })
      expect(res.success).toBe(true)
      expect(res.tool).toBe('pill_lookup')
      expect(res.query.imprint).toBe('L484')
      expect(res.matches[0].name).toContain('Acetaminophen')
      expect(res.fda_facts.brand_name).toBe('Tylenol Extra Strength')
      expect(res.disclaimer).toMatch(/pharmacist/i)

      vi.restoreAllMocks()
    })
  })
})
