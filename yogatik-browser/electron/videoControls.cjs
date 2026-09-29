// Universal video controls for Yogatik Browser.
//
// The YouTube skipper handles ads; this handles PLAYBACK on any video site —
// a floating, draggable control pill injected into any http(s) page that has
// a <video> element:
//
//   - Speed buttons: 1× / 1.5× / 2× / 3×
//   - Seek: -10s / +10s
//   - Skip Silence: real-time RMS-based fast-forward through quiet stretches
//     (lectures, podcasts, streams) — the feature YouTube skipper only
//     dreams about on other sites.
//
// Gated by the `videoControlsEnabled` setting (default on). Draggable so it
// never sits on top of site controls the user actually wants.

const VIDEO_CONTROLS_SCRIPT = `
(function () {
  if (window.__YOGATIK_VIDEO_CONTROLS__) return;
  window.__YOGATIK_VIDEO_CONTROLS__ = true;

  const pill = document.createElement('div');
  pill.id = 'yogatik-videopill';
  pill.innerHTML = \`
    <style>
      #yogatik-videopill {
        position: fixed;
        bottom: 18px;
        right: 18px;
        z-index: 2147483647;
        background: rgba(13, 17, 23, 0.92);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 122, 24, 0.35);
        border-radius: 14px;
        padding: 6px 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        color: #e2e8f0;
        box-shadow: 0 12px 32px rgba(0,0,0,0.45);
        user-select: none;
        transition: opacity 0.2s;
      }
      #yogatik-videopill:hover { opacity: 1; }
      #yogatik-videopill[data-dim="1"] { opacity: 0.25; }
      #yogatik-videopill button {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.09);
        color: inherit;
        border-radius: 8px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        font-family: inherit;
        transition: all 0.15s;
      }
      #yogatik-videopill button:hover { background: rgba(255,255,255,0.14); }
      #yogatik-videopill button.speed.active {
        background: rgba(255, 122, 24, 0.2);
        border-color: rgba(255, 122, 24, 0.5);
        color: #ff9933;
      }
      #yogatik-videopill button.silence.active {
        background: rgba(16, 185, 129, 0.18);
        border-color: rgba(16, 185, 129, 0.45);
        color: #10b981;
      }
      #yogatik-videopill .grip {
        cursor: grab;
        color: #64748b;
        padding: 0 4px;
        font-size: 13px;
      }
      #yogatik-videopill .speed-label {
        min-width: 26px;
        text-align: center;
        color: #ff9933;
        font-weight: 700;
        font-size: 11px;
      }
    </style>
    <span class="grip" title="Drag to move">⠿</span>
    <button data-seek="-10" title="Back 10s">−10s</button>
    <button data-seek="10" title="Forward 10s">+10s</button>
    <span class="speed-label" id="yogatik-speed-label">1×</span>
    <button class="speed" data-speed="1" title="Normal speed">1×</button>
    <button class="speed" data-speed="1.5" title="1.5× speed">1.5×</button>
    <button class="speed" data-speed="2" title="2× speed">2×</button>
    <button class="speed" data-speed="3" title="3× speed">3×</button>
    <button class="silence" id="yogatik-silence-btn" title="Fast-forward through silent stretches (lectures, podcasts)">🤫 Skip Silence</button>
  \`;
  document.body.appendChild(pill);

  const currentVideo = () => {
    const vids = document.querySelectorAll('video');
    // Prefer the largest visible video (the main player).
    let best = null, bestArea = 0;
    for (const v of vids) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = v; }
    }
    return best;
  };

  // ── Seek & speed ──
  pill.querySelectorAll('button[data-seek]').forEach(b => {
    b.onclick = () => {
      const v = currentVideo();
      if (v) v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + Number(b.dataset.seek)));
    };
  });
  const speedLabel = pill.querySelector('#yogatik-speed-label');
  const setSpeed = (rate) => {
    const v = currentVideo();
    if (v) v.playbackRate = rate;
    speedLabel.textContent = rate + '×';
    pill.querySelectorAll('button.speed').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.speed) === rate);
    });
  };
  pill.querySelectorAll('button.speed').forEach(b => {
    b.onclick = () => setSpeed(Number(b.dataset.speed));
  });

  // ── Skip Silence (RMS-based) ──
  let audioCtx = null;
  let analyser = null;
  let silenceTimer = null;
  let silenceActive = false;

  const startSilenceSkip = () => {
    const v = currentVideo();
    if (!v) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(v);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      silenceActive = true;
      const buf = new Float32Array(analyser.fftSize);
      let quietMs = 0;
      silenceTimer = setInterval(() => {
        if (!silenceActive || !currentVideo()) return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (rms < 0.012) {
          quietMs += 250;
          // Quiet for over a second: fast-forward in 2s hops.
          if (quietMs >= 1000) {
            const v2 = currentVideo();
            if (v2 && v2.duration && v2.currentTime < v2.duration - 1) {
              v2.currentTime = Math.min(v2.duration - 0.2, v2.currentTime + 2);
            }
          }
        } else {
          quietMs = 0;
        }
      }, 250);
    } catch {}
  };

  const stopSilenceSkip = () => {
    silenceActive = false;
    if (silenceTimer) clearInterval(silenceTimer);
    silenceTimer = null;
  };

  const silenceBtn = pill.querySelector('#yogatik-silence-btn');
  silenceBtn.onclick = () => {
    silenceActive ? stopSilenceSkip() : startSilenceSkip();
    silenceBtn.classList.toggle('active', silenceActive);
  };

  // ── Drag to move ──
  const grip = pill.querySelector('.grip');
  let dragging = false, dx = 0, dy = 0;
  grip.addEventListener('mousedown', (e) => {
    dragging = true;
    const r = pill.getBoundingClientRect();
    dx = e.clientX - r.left; dy = e.clientY - r.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    pill.style.left = Math.max(0, e.clientX - dx) + 'px';
    pill.style.top = Math.max(0, e.clientY - dy) + 'px';
    pill.style.right = 'auto';
    pill.style.bottom = 'auto';
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  // Dim when the mouse leaves it for a while.
  let dimTimer = null;
  pill.addEventListener('mouseleave', () => {
    clearTimeout(dimTimer);
    dimTimer = setTimeout(() => pill.setAttribute('data-dim', '1'), 2500);
  });
  pill.addEventListener('mouseenter', () => {
    clearTimeout(dimTimer);
    pill.removeAttribute('data-dim');
  });

  return { injected: true };
})();
`

async function injectVideoControls(wc) {
  if (!wc || wc.isDestroyed()) return false
  try {
    const hasVideo = await wc.executeJavaScript('!!document.querySelector("video")').catch(() => false)
    if (!hasVideo) return false
    await wc.executeJavaScript(VIDEO_CONTROLS_SCRIPT)
    return true
  } catch {
    return false
  }
}

module.exports = {
  injectVideoControls,
}
