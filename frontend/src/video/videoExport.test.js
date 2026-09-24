import { describe, it, expect } from 'vitest'
import { formatTime, parseTimeToSeconds } from './videoExport'

describe('videoExport utilities', () => {
  it('formats seconds to mm:ss.ms timecode', () => {
    expect(formatTime(0)).toBe('00:00.00')
    expect(formatTime(65.5)).toBe('01:05.50')
    expect(formatTime(120)).toBe('02:00.00')
    expect(formatTime(null)).toBe('00:00.00')
    expect(formatTime(NaN)).toBe('00:00.00')
  })

  it('parses time strings to seconds correctly', () => {
    expect(parseTimeToSeconds('00:10')).toBe(10)
    expect(parseTimeToSeconds('01:30')).toBe(90)
    expect(parseTimeToSeconds('01:05.50')).toBe(65.5)
    expect(parseTimeToSeconds('01:00:00')).toBe(3600)
    expect(parseTimeToSeconds('45')).toBe(45)
    expect(parseTimeToSeconds('')).toBe(0)
    expect(parseTimeToSeconds(null)).toBe(0)
  })
})
