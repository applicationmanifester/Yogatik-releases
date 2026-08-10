import { JSDOM } from 'jsdom'
const dom = new JSDOM('')
global.DOMParser = dom.window.DOMParser
globalThis.DOMParser = dom.window.DOMParser

// jsdom implements neither of these; both are called on mount.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView ??= function () {}
  Element.prototype.scrollTo ??= function () {}
}
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = q => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  })
}
