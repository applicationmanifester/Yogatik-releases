/**
 * The clock shortcut answers WITHOUT calling the model, so a false positive
 * replaces the user's actual answer with the time. It is worth being strict.
 */
import { describe, it, expect, vi } from 'vitest'

import { isDirectTimeQuery } from './timeQuery'

describe('isDirectTimeQuery', () => {
  it('answers real clock questions', () => {
    for (const q of [
      'what is the time',
      "What's the time?",
      'what time is it',
      'what time is it now',
      'time',
      'time now',
      'the time please',
      'what is the date',
      'current date',
      'what day is it',
      'what day is it today',
      'current time',
      'time and date',
      'what is my timezone',
      'which timezone am i in',
      'what is the time in tokyo',
    ]) {
      expect(isDirectTimeQuery(q), q).toBe(true)
    }
  })

  it('does not hijack a question that merely contains a time word', () => {
    for (const q of [
      "Today's India news",                    // the bug: matched 'today'
      'Banglore news today',
      'what is happening now',
      'give me the latest update',             // 'date' inside 'update'
      'how do I date format in python',
      'best time management books',
      'summarize the news of today',
      'what is the time complexity of quicksort',
      'nowadays is javascript still popular',
      'what happened on this date in history',
    ]) {
      expect(isDirectTimeQuery(q), q).toBe(false)
    }
  })

  it('ignores empty and overlong input', () => {
    expect(isDirectTimeQuery('')).toBe(false)
    expect(isDirectTimeQuery(null)).toBe(false)
    expect(isDirectTimeQuery('what is the time '.repeat(5))).toBe(false)
  })
})
