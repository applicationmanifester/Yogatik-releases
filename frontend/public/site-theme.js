/**
 * site-theme.js — shared theme synchronisation for all static pages.
 *
 * Loaded as the FIRST script in <head> (before any CSS paint) so there is
 * zero flash-of-wrong-theme. The main app stores the user's preference in
 * localStorage under 'yogatik_theme'. This script:
 *   1. Reads that key and applies data-theme to <html> immediately.
 *   2. After DOMContentLoaded, inserts a ☀/🌙 toggle button into any
 *      <nav class="site"> or <nav> with id="main-nav" found on the page.
 *   3. On toggle, updates both localStorage and the <html> attribute so the
 *      main app and every static page always agree.
 */
;(function () {
  var STORAGE_KEY = 'yogatik_theme'

  function getTheme() {
    try { return localStorage.getItem(STORAGE_KEY) || 'dark' } catch (e) { return 'dark' }
  }

  function setTheme(t) {
    try { localStorage.setItem(STORAGE_KEY, t) } catch (e) {}
    document.documentElement.setAttribute('data-theme', t)
    // Keep any toggle buttons in sync
    document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
      btn.textContent = t === 'dark' ? '☀️' : '🌙'
      btn.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      btn.setAttribute('aria-label', btn.title)
    })
  }

  // Apply immediately — before any CSS paint
  document.documentElement.setAttribute('data-theme', getTheme())

  function injectToggle() {
    // Find the best nav to attach to
    var nav = document.querySelector('nav.site') || document.getElementById('main-nav')
    if (!nav) return

    var btn = document.createElement('button')
    btn.className = 'theme-toggle-btn'
    btn.type = 'button'
    var t = getTheme()
    btn.textContent = t === 'dark' ? '☀️' : '🌙'
    btn.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    btn.setAttribute('aria-label', btn.title)
    btn.addEventListener('click', function () {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark')
    })
    nav.appendChild(btn)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle)
  } else {
    injectToggle()
  }
})()
