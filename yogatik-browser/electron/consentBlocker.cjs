// Cookie banner auto-consent for Yogatik Browser.
//
// Injected into every http(s) tab on dom-ready. Auto-REJECTS non-essential
// cookies before most consent platforms finish rendering:
//
//   1. Clicks reject / decline / "only necessary" buttons on the major CMPs
//      (OneTrust, CookieBot, Quantcast, TrustArc, Iubenda, CookieYes,
//      tarteaucitron, CookiePro, Osano, Usercentrics).
//   2. Hides banner containers as a fallback so the page is usable.
//
// Never clicks accept — the privacy-first default is minimal data. Gated by
// the `cookieAutoReject` setting (default on).

const CONSENT_SCRIPT = `
(function () {
  if (window.__YOGATIK_CONSENT__) return;
  window.__YOGATIK_CONSENT__ = true;

  let attempts = 0;
  const maxAttempts = 40; // ~20s of polling — CMPs load at their own pace

  const REJECT_TEXT = /(^|\\s)(reject|decline|refuse|deny)\\b|only (the )?(necessary|essential)|essential only|reject all|deny all|do not sell/i;

  const CONSENT_SELECTORS = [
    // OneTrust / CookiePro
    '#onetrust-reject-all-handler', '#onetrust-consent-sdk .ot-pc-refuse-all-handler',
    // CookieBot / Cybot
    '#CybotCookiebotDialogBodyButtonDecline', '#cybot-cookiebotdialog-body-button-decline',
    // Quantcast
    '.qc-cmp2-summary-buttons button[mode="secondary"]', '#qc-cmp2-ui .qc-cmp2-reject-all',
    // TrustArc
    '.truste-ca-iframe .truste-button2 .reject', '.truste-buttons .truste-buttonreject',
    // Iubenda
    '.iubenda-cs-reject-btn', '#iubenda-cs-banner .iubenda-cs-reject-btn',
    // CookieYes
    '.cky-btn-reject', '#cookie_action_close_header_reject',
    // tarteaucitron
    '#tarteaucitronAllDenied', '.tarteaucitron-denied',
    // Osano / Usercentrics
    '.osano-cm-deny-all', '#usercentrics-root button[data-testid="uc-deny-all-button"]',
    // Generic
    '.cookie-reject', '#cookie-reject', '.cc-reject', '[aria-label*="reject" i]',
  ];

  function tryReject() {
    if (attempts++ > maxAttempts) { clearInterval(poller); return; }

    // 1. Known CMP reject buttons
    for (const sel of CONSENT_SELECTORS) {
      let el = null;
      try { el = document.querySelector(sel); } catch {}
      if (el && typeof el.click === 'function') {
        try { el.click(); } catch {}
      }
    }

    // 2. Text-matched reject buttons inside likely banner containers
    const candidates = document.querySelectorAll('button, a[role="button"], a');
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length > 48) continue;
      if (!REJECT_TEXT.test(text)) continue;
      // Only click if it sits inside something banner-like (fixed bottom/top).
      const container = el.closest('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="cmp" i]');
      if (container && typeof el.click === 'function') {
        try { el.click(); } catch {}
      }
    }

    // 3. Fallback: hide common banner containers so the page is usable
    if (attempts === maxAttempts) {
      const style = document.createElement('style');
      style.textContent = \`
        #cookie-banner, #cookie-notice, #cookie-consent, #cookieconsent,
        #onetrust-consent-sdk, #CybotCookiebotDialog, .cookie-banner,
        .cookie-consent, .cc-banner, [aria-label*="cookie" i][role="dialog"] {
          display: none !important;
        }
      \`;
      document.head.appendChild(style);
    }
  }

  const poller = setInterval(tryReject, 500);
  tryReject();
})();
`

async function injectConsentBlocker(wc) {
  if (!wc || wc.isDestroyed()) return false
  try {
    await wc.executeJavaScript(CONSENT_SCRIPT)
    return true
  } catch {
    return false
  }
}

module.exports = {
  injectConsentBlocker,
}
