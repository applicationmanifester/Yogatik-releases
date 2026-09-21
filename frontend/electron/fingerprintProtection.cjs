// frontend/electron/fingerprintProtection.cjs
// ------------------------------------------------
// Injects a tiny JS snippet that randomises common fingerprinting
// vectors (navigator.plugins, languages, devicePixelRatio, etc.).
// ------------------------------------------------

const FINGERPRINT_SCRIPT = `(() => {
  // Randomise navigator.plugins
  Object.defineProperty(navigator, 'plugins', {
    get() { return Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, i) => ({ name: 'Plugin ' + i })) },
    configurable: true,
    enumerable: true
  });

  // Randomise languages
  Object.defineProperty(navigator, 'languages', {
    get() { return ['en-US', 'en-GB', 'fr-FR'].sort(() => Math.random() - 0.5) },
    configurable: true,
    enumerable: true
  });

  // Randomise devicePixelRatio
  Object.defineProperty(window, 'devicePixelRatio', {
    get() { return Math.round(Math.random() * 3) + 1 },
    configurable: true,
    enumerable: true
  });

  // Randomise canvas fingerprint
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px 'Arial'';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125,1,62,20);
  ctx.fillStyle = '#069';
  ctx.fillText('Electron Fingerprint', 2, 15);
  ctx.fillStyle = '#f60';
  ctx.fillText('Electron Fingerprint', 4, 17);
  const data = canvas.toDataURL();
  window.__fingerprint__ = data;
})();`;

function injectFingerprintProtection(tabView) {
  tabView.webContents.executeJavaScript(FINGERPRINT_SCRIPT).catch(() => {})
}

module.exports = { injectFingerprintProtection }
