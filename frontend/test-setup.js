import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
global.window = dom.window;
globalThis.window = dom.window;
global.document = dom.window.document;
globalThis.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
globalThis.DOMParser = dom.window.DOMParser;
global.Element = dom.window.Element;
globalThis.Element = dom.window.Element;
global.Node = dom.window.Node;
globalThis.Node = dom.window.Node;
global.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLElement = dom.window.HTMLElement;
global.HTMLAnchorElement = dom.window.HTMLAnchorElement;
globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement;

// Expose location for isLocalhost checks in llm.js
global.location = dom.window.location;
globalThis.location = dom.window.location;

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

// URL.createObjectURL is used by media/document preview flows
if (typeof URL === 'undefined' || !URL.createObjectURL) {
  globalThis.URL = globalThis.URL || { createObjectURL: () => '', revokeObjectURL: () => {} }
  globalThis.URL.createObjectURL ??= () => ''
  globalThis.URL.revokeObjectURL ??= () => {}
}

// HTMLAnchorElement.prototype.click is used by export/download flows
if (typeof HTMLAnchorElement !== 'undefined' && !HTMLAnchorElement.prototype.click) {
  HTMLAnchorElement.prototype.click = function () {}
}

// navigator.userAgent for provider detection
if (typeof navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'test', language: 'en', onLine: true }
}

// AbortSignal.any polyfill for older Node versions
if (typeof AbortSignal !== 'undefined' && !AbortSignal.any) {
  AbortSignal.any = (signals) => {
    return new Promise((resolve, reject) => {
      let settled = false
      const onAbort = () => { if (!settled) { settled = true; reject(new DOMException('Aborted', 'AbortError')) } }
      signals.forEach(s => { if (s.aborted) { onAbort() } else { s.addEventListener('abort', onAbort, { once: true }) } })
    })
  }
}
