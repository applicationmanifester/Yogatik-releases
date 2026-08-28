// Regionalisation. The crisis-resource half of this file is the part that
// matters most: a wrong helpline number handed to someone in distress is worse
// than no number, because they will dial it and reach nothing.

import { describe, it, expect } from 'vitest'
import {
  resolveLocale, regionOf, regionFromTimeZone, measurementSystem, weatherUnits,
  textDirection, newsParams, localeSnapshot, languageName, DEFAULT_LOCALE,
} from './locale'
import {
  crisisResource, hasLocalLine, emergencyNumber, coveredRegions, DIRECTORY,
} from './crisisResources'
import { assessSafety } from './safety'

describe('locale resolution', () => {
  it('prefers navigator.languages, which is the ordered preference list', () => {
    expect(resolveLocale({ nav: { languages: ['de-DE', 'en'], language: 'en-US' } })).toBe('de-DE')
    expect(resolveLocale({ nav: { language: 'fr-CA' } })).toBe('fr-CA')
    expect(resolveLocale({ nav: null })).toBe(DEFAULT_LOCALE)
  })

  it('an explicit override wins, and "auto" is not an override', () => {
    expect(resolveLocale({ override: 'ja-JP', nav: { language: 'en-US' } })).toBe('ja-JP')
    expect(resolveLocale({ override: 'auto', nav: { language: 'en-GB' } })).toBe('en-GB')
  })

  it('pulls the region out of a tag, skipping the script subtag', () => {
    expect(regionOf('en-GB')).toBe('GB')
    expect(regionOf('zh-Hant-TW')).toBe('TW')   // Hant is a script, not a region
    expect(regionOf('pt_BR')).toBe('BR')        // underscore form
  })

  it('falls back to the TIMEZONE for a bare tag rather than assuming the US', () => {
    // This is the whole point: `de`, `en` and `fr` carry no region, and
    // defaulting those to the US is how an American helpline reaches Berlin.
    expect(regionOf('en', { timeZone: 'Asia/Kolkata' })).toBe('IN')
    expect(regionOf('de', { timeZone: 'Europe/Berlin' })).toBe('DE')
    expect(regionOf('en', { timeZone: 'America/New_York' })).toBe('US')
    expect(regionOf('en', { timeZone: 'Europe/London' })).toBe('GB')
  })

  it('returns null for an unknown zone instead of guessing', () => {
    expect(regionFromTimeZone('Antarctica/Troll')).toBe(null)
    expect(regionFromTimeZone('')).toBe(null)
    expect(regionOf('en', { timeZone: 'Antarctica/Troll' })).toBe(null)
  })
})

describe('measurement', () => {
  it('is metric everywhere except the three countries that are not', () => {
    expect(measurementSystem('US')).toBe('imperial')
    expect(measurementSystem('LR')).toBe('imperial')
    expect(measurementSystem('MM')).toBe('imperial')
    for (const r of ['GB', 'IN', 'DE', 'JP', 'AU', 'BR', 'ZA']) {
      expect(measurementSystem(r)).toBe('metric')
    }
  })

  it('an unknown region is metric, which is right for most of the world', () => {
    expect(measurementSystem(null)).toBe('metric')
  })

  it('weather units are not one imperial/metric switch — the UK proves it', () => {
    // Celsius, but wind in mph. A single toggle cannot express this, which is
    // why weatherUnits is separate from measurementSystem.
    expect(weatherUnits('GB')).toEqual({ temperature: 'celsius', wind: 'mph', precipitation: 'mm' })
    expect(weatherUnits('US')).toEqual({ temperature: 'fahrenheit', wind: 'mph', precipitation: 'inch' })
    expect(weatherUnits('DE')).toEqual({ temperature: 'celsius', wind: 'kmh', precipitation: 'mm' })
  })

  it('an explicit override beats the region', () => {
    expect(weatherUnits('DE', { override: 'imperial' }).temperature).toBe('fahrenheit')
    expect(weatherUnits('US', { override: 'metric' }).temperature).toBe('celsius')
  })
})

describe('direction', () => {
  it('detects right-to-left scripts', () => {
    for (const l of ['ar', 'ar-EG', 'he-IL', 'fa-IR', 'ur-PK']) {
      expect(textDirection(l)).toBe('rtl')
    }
  })
  it('everything else is left-to-right', () => {
    for (const l of ['en-US', 'de-DE', 'ja-JP', 'hi-IN', 'ru-RU']) {
      expect(textDirection(l)).toBe('ltr')
    }
  })
})

describe('news regionalisation', () => {
  it('follows the user instead of the hardcoded US parameters', () => {
    expect(newsParams('de-DE', 'DE')).toEqual({ hl: 'de-DE', gl: 'DE', ceid: 'DE:de' })
    expect(newsParams('en-IN', 'IN')).toEqual({ hl: 'en-IN', gl: 'IN', ceid: 'IN:en' })
    expect(newsParams('ja-JP', 'JP')).toEqual({ hl: 'ja-JP', gl: 'JP', ceid: 'JP:ja' })
  })

  it('builds a full hl tag from a bare language plus a known region', () => {
    expect(newsParams('en', 'GB')).toEqual({ hl: 'en-GB', gl: 'GB', ceid: 'GB:en' })
  })
})

describe('crisis resources — region-appropriate, never invented', () => {
  it('names the verified line for regions we cover', () => {
    expect(crisisResource('self_harm', 'US')).toContain('988')
    expect(crisisResource('self_harm', 'GB')).toContain('116 123')
    expect(crisisResource('self_harm', 'IN')).toContain('14416')
    expect(crisisResource('self_harm', 'AU')).toContain('13 11 14')
    expect(crisisResource('self_harm', 'NZ')).toContain('1737')
  })

  it('NEVER gives an American number to a non-American user', () => {
    // The bug this whole file exists to fix.
    for (const r of ['IN', 'DE', 'GB', 'AU', 'JP', 'BR', 'NG', 'ZZ', null]) {
      expect(crisisResource('self_harm', r)).not.toContain('988')
      expect(crisisResource('violence', r)).not.toContain('911')
    }
  })

  it('invents nothing for an unknown region — the directory instead', () => {
    const unknown = crisisResource('self_harm', 'ZZ')
    expect(unknown).toContain(DIRECTORY)
    // No phone number at all: any digits here would be fabricated.
    expect(unknown).not.toMatch(/\b\d{3,}\b/)
  })

  it('always includes the international directory, whatever the region', () => {
    for (const r of [...coveredRegions(), 'ZZ', null, 'DE']) {
      expect(crisisResource('self_harm', r)).toContain(DIRECTORY)
      expect(crisisResource('eating_disorder', r)).toContain(DIRECTORY)
    }
  })

  it('uses the local emergency number, not 911', () => {
    expect(crisisResource('violence', 'GB')).toContain('999')
    expect(crisisResource('violence', 'DE')).toContain('112')
    expect(crisisResource('violence', 'AU')).toContain('000')
    expect(crisisResource('violence', 'IN')).toContain('112')
    expect(crisisResource('violence', 'US')).toContain('911')
  })

  it('says "your local emergency services" when it does not know the number', () => {
    expect(crisisResource('violence', 'ZZ')).toMatch(/local emergency services/i)
    expect(emergencyNumber('ZZ')).toBe(null)
  })

  it('offers 116 123 in Europe only as a number that operates in many countries', () => {
    const de = crisisResource('self_harm', 'DE')
    expect(de).toContain('116 123')
    expect(de).toMatch(/many countries/)   // hedged, because it is not universal
    expect(hasLocalLine('suicide', 'DE')).toBe(true)
    expect(hasLocalLine('suicide', 'ZZ')).toBe(false)
  })

  it('does not name NEDA, which is disconnected', () => {
    for (const r of [...coveredRegions(), 'ZZ']) {
      expect(crisisResource('eating_disorder', r)).not.toMatch(/\bNEDA\b/)
    }
  })
})

describe('safety screen carries the region through', () => {
  const CRY = 'i want to kill myself'

  it('an Indian user is given the Indian line, not the American one', () => {
    const v = assessSafety(CRY, { region: 'IN' })
    expect(v.crisis?.type).toBe('self_harm')
    expect(v.crisis.resource).toContain('14416')
    expect(v.crisis.resource).not.toContain('988')
    expect(v.systemDirective).toContain('14416')
  })

  it('still detects the crisis when the region is unknown', () => {
    const v = assessSafety(CRY, {})
    expect(v.hasConcern).toBe(true)
    expect(v.crisis.resource).toContain(DIRECTORY)
  })
})

describe('snapshot', () => {
  it('assembles a coherent picture for a German user', () => {
    const s = localeSnapshot({ nav: { languages: ['de-DE'] }, overrides: {} })
    expect(s.region).toBe('DE')
    expect(s.measurement).toBe('metric')
    expect(s.direction).toBe('ltr')
    expect(languageName('de-DE')).toMatch(/German/i)
  })

  it('an override reaches every derived value', () => {
    const s = localeSnapshot({ nav: { languages: ['en-GB'] }, overrides: { region: 'US', units: 'imperial' } })
    expect(s.region).toBe('US')
    expect(s.measurement).toBe('imperial')
    expect(s.weather.temperature).toBe('fahrenheit')
  })
})
