/**
 * Shared device-location helper. Uses the browser Geolocation API (GPS / Wi-Fi /
 * device sensors) — NOT IP geolocation, which is coarse and often wrong. Prompts
 * the user for permission on first use; the OS/browser owns that consent.
 */
const CURRENT_WORDS = new Set([
  '', 'current', 'my location', 'here', 'me', 'auto', 'device', 'nearby', 'my area', 'where i am',
])

export function isCurrentLocation(location) {
  return CURRENT_WORDS.has(String(location ?? '').toLowerCase().trim())
}

/**
 * Resolve the device's coordinates via GPS. Rejects (never guesses) when
 * geolocation is unavailable or the user declines, so callers can ask for a
 * place name instead of silently reporting the wrong city.
 */
export function getDeviceLocation({ highAccuracy = true, timeout = 8000, maxAge = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not available in this environment.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      }),
      (err) => reject(new Error(
        err?.code === 1 ? 'Location permission was denied.'
          : err?.code === 3 ? 'Location request timed out.'
          : 'Could not determine device location.'
      )),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: maxAge },
    )
  })
}
