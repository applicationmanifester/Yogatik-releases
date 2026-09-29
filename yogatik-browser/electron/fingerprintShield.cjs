// Fingerprint randomization for Yogatik Browser.
//
// Tier 3 of the privacy roadmap. Brave-style "farbling": per-session subtle
// noise so canvas/WebGL fingerprints differ from every other Yogatik Browser
// and every previous session — trackers can no longer build a stable ID.
//
// Injected at dom-ready (before most page scripts read fingerprints).
// Gated by the `fingerprintRandomize` setting (default on).
//
// Farbles:
//   - Canvas 2D getImageData/toDataURL — pixel-level noise seeded per session
//   - WebGL vendor/renderer — randomized from a realistic vendor pool
//   - navigator.hardwareConcurrency / deviceMemory — jittered
//   - AudioContext fingerprint — per-session noise on sample reads

const FINGERPRINT_SCRIPT = `
(function () {
  if (window.__YOGATIK_FARBLE__) return;
  window.__YOGATIK_FARBLE__ = true;

  // Per-session seed — same within the session (pages still work), different
  // across sessions and installs.
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const rand = (n) => {
    // xorshift — deterministic within the session from the seed.
    let x = seed ^ n;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0xffffffff;
  };

  // ── Canvas 2D farbling ──
  try {
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      const imageData = origGetImageData.apply(this, args);
      const d = imageData.data;
      // Subtle noise on a sparse subset — invisible to humans, breaks hashes.
      for (let i = 0; i < d.length; i += 397) {
        const noise = (rand(i) * 3) | 0; // 0..2
        d[i] = Math.min(255, d[i] + noise);
      }
      return imageData;
    };
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      try {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = origGetImageData.call(ctx, 0, 0, Math.min(this.width, 64), Math.min(this.height, 64));
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 397) {
            d[i] = Math.min(255, d[i] + ((rand(i) * 3) | 0));
          }
          ctx.putImageData(imageData, 0, 0);
        }
      } catch {}
      return origToDataURL.apply(this, args);
    };
  } catch {}

  // ── WebGL vendor/renderer farbling ──
  try {
    const vendors = ['Intel Inc.', 'Google Inc. (Intel)', 'Google Inc. (NVIDIA)', 'Google Inc. (AMD)'];
    const renderers = [
      'Intel Iris OpenGL Engine',
      'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (AMD, AMD Radeon Graphics Direct3D11 vs_5_0 ps_5_0)',
    ];
    const pick = (rand(1) * vendors.length) | 0;
    const patch = (proto) => {
      const orig = proto.getParameter;
      proto.getParameter = function (param) {
        if (param === 37445) return vendors[pick];        // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return renderers[pick];      // UNMASKED_RENDERER_WEBGL
        return orig.apply(this, arguments);
      };
    };
    if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
  } catch {}

  // ── Hardware jitter ──
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => [4, 8, 8, 12, 16][(rand(2) * 5) | 0],
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => [4, 8, 8, 16][(rand(3) * 4) | 0],
    });
  } catch {}

  // ── AudioContext farbling ──
  try {
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (...args) {
      const data = origGetChannelData.apply(this, args);
      for (let i = 0; i < data.length; i += 997) {
        data[i] = data[i] + (rand(i) - 0.5) * 1e-7;
      }
      return data;
    };
  } catch {}
})();
`

async function injectFingerprintShield(wc) {
  if (!wc || wc.isDestroyed()) return false
  try {
    await wc.executeJavaScript(FINGERPRINT_SCRIPT)
    return true
  } catch {
    return false
  }
}

module.exports = {
  injectFingerprintShield,
}
