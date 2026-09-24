/**
 * Favorite and Recent Project Locations Manager
 *
 * Persists bookmarked project folders so users don't have to repeatedly browse
 * or search for their repository/workspace directories across chats.
 */

const FAVORITES_KEY = 'yogatik_favorite_folders'
const RECENTS_KEY = 'yogatik_recent_folders'
const MAX_RECENTS = 6

function safeParse(key, fallback = []) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function safeSave(key, data) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data))
    }
  } catch { /* storage quota or privacy mode */ }
}

function normalisePath(p) {
  if (!p) return ''
  return String(p).trim().replace(/[/\\]+$/, '')
}

function deriveLabel(p) {
  if (!p) return 'Folder'
  const parts = normalisePath(p).split(/[/\\]/).filter(Boolean)
  return parts.pop() || p
}

export function getFavoriteLocations() {
  return safeParse(FAVORITES_KEY, [])
}

export function isFavoriteLocation(p) {
  if (!p) return false
  const target = normalisePath(p).toLowerCase()
  const favs = getFavoriteLocations()
  return favs.some(f => normalisePath(f.path).toLowerCase() === target)
}

export function addFavoriteLocation(p, label) {
  if (!p) return getFavoriteLocations()
  const norm = normalisePath(p)
  const favs = getFavoriteLocations()
  const filtered = favs.filter(f => normalisePath(f.path).toLowerCase() !== norm.toLowerCase())
  const item = {
    id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    path: norm,
    label: label || deriveLabel(norm),
    addedAt: Date.now(),
  }
  const next = [item, ...filtered]
  safeSave(FAVORITES_KEY, next)
  return next
}

export function removeFavoriteLocation(p) {
  if (!p) return getFavoriteLocations()
  const norm = normalisePath(p).toLowerCase()
  const favs = getFavoriteLocations()
  const next = favs.filter(f => normalisePath(f.path).toLowerCase() !== norm && f.id !== p)
  safeSave(FAVORITES_KEY, next)
  return next
}

export function toggleFavoriteLocation(p, label) {
  if (isFavoriteLocation(p)) {
    return removeFavoriteLocation(p)
  }
  return addFavoriteLocation(p, label)
}

export function getRecentLocations() {
  return safeParse(RECENTS_KEY, [])
}

export function recordRecentLocation(p, label) {
  if (!p) return getRecentLocations()
  const norm = normalisePath(p)
  const recents = getRecentLocations()
  const filtered = recents.filter(r => normalisePath(r.path).toLowerCase() !== norm.toLowerCase())
  const item = {
    id: `recent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    path: norm,
    label: label || deriveLabel(norm),
    lastUsed: Date.now(),
  }
  const next = [item, ...filtered].slice(0, MAX_RECENTS)
  safeSave(RECENTS_KEY, next)
  return next
}

export function clearRecentLocations() {
  safeSave(RECENTS_KEY, [])
  return []
}
