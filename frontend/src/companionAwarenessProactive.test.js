import { describe, it, expect } from 'vitest'
import {
  screenHashDiffers,
  shouldOfferChips,
  generateProactiveActionChips,
  CHIPS_COOLDOWN_MS,
} from './companionAwareness'

describe('Companion Proactive Screen Intelligence & Action Chips', () => {
  describe('screenHashDiffers', () => {
    it('returns false when hashes are identical', () => {
      expect(screenHashDiffers('abcdef1234567890', 'abcdef1234567890')).toBe(false)
    })

    it('returns true when hash changes substantially', () => {
      expect(screenHashDiffers('0000000000000000', 'ffffffffffffffff')).toBe(true)
    })

    it('tolerates small sub-threshold anti-aliasing variations', () => {
      // 1 char difference out of 16 = 6.25% (< 8% default threshold)
      expect(screenHashDiffers('abcdef1234567890', 'abcdeg1234567890')).toBe(false)
    })

    it('detects when one hash is present and the other is null', () => {
      expect(screenHashDiffers(null, 'abcdef1234567890')).toBe(true)
      expect(screenHashDiffers('abcdef1234567890', null)).toBe(true)
      expect(screenHashDiffers(null, null)).toBe(false)
    })
  })

  describe('shouldOfferChips', () => {
    const T = 500000

    it('offers chips when screen changed and user is idle', () => {
      expect(
        shouldOfferChips({
          screenChanged: true,
          userIdleMs: 3000,
          lastChipsAt: null,
          now: T,
        })
      ).toBe(true)
    })

    it('suppresses chips if screen did not change', () => {
      expect(
        shouldOfferChips({
          screenChanged: false,
          userIdleMs: 5000,
          now: T,
        })
      ).toBe(false)
    })

    it('suppresses chips if user is actively interacting (not idle)', () => {
      expect(
        shouldOfferChips({
          screenChanged: true,
          userIdleMs: 500, // active
          now: T,
        })
      ).toBe(false)
    })

    it('respects cooldown window', () => {
      expect(
        shouldOfferChips({
          screenChanged: true,
          userIdleMs: 4000,
          lastChipsAt: T - 10000, // only 10s ago
          now: T,
          cooldownMs: CHIPS_COOLDOWN_MS,
        })
      ).toBe(false)

      expect(
        shouldOfferChips({
          screenChanged: true,
          userIdleMs: 4000,
          lastChipsAt: T - (CHIPS_COOLDOWN_MS + 1000), // cooldown expired
          now: T,
          cooldownMs: CHIPS_COOLDOWN_MS,
        })
      ).toBe(true)
    })
  })

  describe('generateProactiveActionChips', () => {
    it('generates error diagnosis chip on compiler/test failure', () => {
      const chips = generateProactiveActionChips({
        appName: 'VS Code',
        screenText: 'TypeError: Cannot read properties of undefined (reading "execute")',
      })

      expect(chips.some(c => c.id === 'chip_fix_error')).toBe(true)
      expect(chips.some(c => c.id === 'chip_run_tests')).toBe(true)
    })

    it('generates contract review chip on legal text', () => {
      const chips = generateProactiveActionChips({
        appName: 'Acrobat Reader',
        title: 'Master Service Agreement v4.pdf',
        screenText: 'This Non-Disclosure Agreement and confidentiality clause...',
      })

      expect(chips.some(c => c.id === 'chip_summarize_risks')).toBe(true)
    })

    it('generates web page summary chip in browser', () => {
      const chips = generateProactiveActionChips({
        appName: 'Google Chrome',
        title: 'Quarterly Earnings Report',
      })

      expect(chips.some(c => c.id === 'chip_summarize_page')).toBe(true)
    })

    it('caps output at 3 chips maximum to prevent screen clutter', () => {
      const chips = generateProactiveActionChips({
        appName: 'Chrome',
        screenText: 'TypeError occurred in contract agreement terms...',
      })

      expect(chips.length).toBeLessThanOrEqual(3)
    })
  })
})
