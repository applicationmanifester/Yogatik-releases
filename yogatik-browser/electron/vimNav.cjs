// Vim-style keyboard navigation for Yogatik Browser.
//
// Opt-in (the `vimNavEnabled` setting) so normal users are never surprised —
// power users toggle it from the command palette. Wire into a tab's
// webContents; guards against input focus so typing is never swallowed.
//
//   j / k   — scroll down / up
//   g / G   — jump to top / bottom
//   h / l   — history back / forward (body focus only)
//   f       — link hints: letter labels over clickable elements; type the
//             letters to click, Esc to cancel (the vimium killer feature)

const VIM_KEYDOWN_SRC = `
(function (key) {
  // Never swallow typing.
  const ae = document.activeElement;
  const aeTag = ae ? ae.tagName.toLowerCase() : '';
  if (aeTag === 'input' || aeTag === 'textarea' || aeTag === 'select' || (ae && ae.isContentEditable)) {
    return { handled: false, reason: 'typing' };
  }

  const scrollBy = (px) => {
    window.scrollBy({ top: px, behavior: 'auto' });
    return { handled: true };
  };

  switch (key) {
    case 'j': return scrollBy(80);
    case 'k': return scrollBy(-80);
    case 'g': window.scrollTo({ top: 0 }); return { handled: true };
    case 'G': window.scrollTo({ top: document.body.scrollHeight }); return { handled: true };
    case 'h': history.back(); return { handled: true };
    case 'l': history.forward(); return { handled: true };
    default: return { handled: false };
  }
})
`

// Link hints overlay: f → letter labels on clickable elements → type to click.
const VIM_HINTS_SRC = `
(function () {
  // Toggle off if already open.
  const existing = document.getElementById('yogatik-vim-hints');
  if (existing) { existing.remove(); return { active: false, toggled: 'off' }; }

  const HINT_KEYS = 'asdfjklqwerzxc'.split('');
  const candidates = Array.from(document.querySelectorAll(
    'a[href], button, [role="button"], input[type="submit"], input[type="button"], [onclick], summary'
  )).filter(el => {
    if (!el.offsetParent && el.getClientRects().length === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }).slice(0, 40);

  if (!candidates.length) return { active: false, empty: true };

  const overlay = document.createElement('div');
  overlay.id = 'yogatik-vim-hints';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';

  const labels = [];
  candidates.forEach((el, i) => {
    if (i >= HINT_KEYS.length) return;
    const key = HINT_KEYS[i];
    const r = el.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.textContent = key.toUpperCase();
    badge.style.cssText = [
      'position:absolute',
      'left:' + Math.max(0, r.left) + 'px',
      'top:' + Math.max(0, r.top) + 'px',
      'background:#ff7a18',
      'color:#0a0e14',
      'font:700 11px/1 system-ui, sans-serif',
      'padding:3px 5px',
      'border-radius:4px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
      'pointer-events:none',
    ].join(';');
    overlay.appendChild(badge);
    labels.push({ key, el });
  });

  const cancelStyle = document.createElement('div');
  cancelStyle.textContent = 'Type a letter to open · ESC to cancel';
  cancelStyle.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(13,17,23,0.92);color:#e2e8f0;font:600 11px/1 system-ui;padding:6px 12px;border-radius:99px;border:1px solid rgba(255,122,24,0.35);pointer-events:none;';
  overlay.appendChild(cancelStyle);
  document.body.appendChild(overlay);

  const finish = (el) => {
    overlay.remove();
    document.removeEventListener('keydown', handler, true);
    if (el) {
      try { el.scrollIntoView({ block: 'center' }); } catch {}
      try { el.click(); } catch {}
    }
    window.__vimHintsActive = false;
  };

  let typed = '';
  const handler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(null); return; }
    const k = e.key.toLowerCase();
    if (typed) {
      // Two-letter combos beyond the first 14 — not needed for the capped set.
      finish(null);
      return;
    }
    const hit = labels.find(l => l.key === k);
    if (hit) { e.preventDefault(); finish(hit.el); }
  };
  document.addEventListener('keydown', handler, true);
  window.__vimHintsActive = true;

  return { active: true, count: labels.length };
})
`

async function applyVimKeydown(wc, key) {
  if (!wc || wc.isDestroyed()) return { handled: false }
  try {
    return await wc.executeJavaScript(`${VIM_KEYDOWN_SRC}(${JSON.stringify(String(key || ''))})`)
  } catch {
    return { handled: false }
  }
}

async function toggleVimHints(wc) {
  if (!wc || wc.isDestroyed()) return { active: false }
  try {
    return await wc.executeJavaScript(VIM_HINTS_SRC)
  } catch {
    return { active: false }
  }
}

module.exports = {
  applyVimKeydown,
  toggleVimHints,
}
