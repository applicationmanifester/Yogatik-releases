import { describe, it, expect, beforeEach } from 'vitest'
import {
  getFavoriteLocations,
  addFavoriteLocation,
  removeFavoriteLocation,
  isFavoriteLocation,
  toggleFavoriteLocation,
  getRecentLocations,
  recordRecentLocation,
} from './favoriteLocations'

describe('favoriteLocations', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initially returns empty array', () => {
    expect(getFavoriteLocations()).toEqual([])
    expect(getRecentLocations()).toEqual([])
  })

  it('adds and verifies favorite location', () => {
    const list = addFavoriteLocation('C:\\Projects\\MyAwesomeApp', 'MyAwesomeApp')
    expect(list.length).toBe(1)
    expect(list[0].path).toBe('C:\\Projects\\MyAwesomeApp')
    expect(list[0].label).toBe('MyAwesomeApp')
    expect(isFavoriteLocation('C:\\Projects\\MyAwesomeApp')).toBe(true)
    expect(isFavoriteLocation('c:\\projects\\myawesomeapp')).toBe(true) // case-insensitive
  })

  it('removes favorite location by path or id', () => {
    addFavoriteLocation('C:\\Projects\\App1')
    addFavoriteLocation('C:\\Projects\\App2')
    expect(getFavoriteLocations().length).toBe(2)

    removeFavoriteLocation('C:\\Projects\\App1')
    expect(getFavoriteLocations().length).toBe(1)
    expect(isFavoriteLocation('C:\\Projects\\App1')).toBe(false)
    expect(isFavoriteLocation('C:\\Projects\\App2')).toBe(true)
  })

  it('toggles favorite location status', () => {
    toggleFavoriteLocation('C:\\Projects\\App1')
    expect(isFavoriteLocation('C:\\Projects\\App1')).toBe(true)

    toggleFavoriteLocation('C:\\Projects\\App1')
    expect(isFavoriteLocation('C:\\Projects\\App1')).toBe(false)
  })

  it('records recent locations up to max limit', () => {
    for (let i = 1; i <= 8; i++) {
      recordRecentLocation(`C:\\Projects\\Repo${i}`)
    }
    const recents = getRecentLocations()
    expect(recents.length).toBe(6)
    expect(recents[0].path).toBe('C:\\Projects\\Repo8')
  })
})
