// yogatik-browser/electron/readerMode.cjs
// Clean, distraction-free reader mode overlay injected directly into active tabs.

const READER_SCRIPT = `
(() => {
  const existing = document.getElementById('yogatik-reader-overlay');
  if (existing) {
    existing.remove();
    return { active: false };
  }

  // Extract primary content
  const title = document.title || 'Untitled';
  const h1 = document.querySelector('h1')?.innerText?.trim() || title;

  // Find author & date if present
  let author = '';
  const authorEl = document.querySelector('[rel="author"], .byline, .author, meta[name="author"]');
  if (authorEl) {
    author = authorEl.content || authorEl.innerText || '';
  }

  // Clone document body for clean extraction
  const clone = document.body.cloneNode(true);

  // Remove common noise
  const noiseSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'header', 'footer',
    'aside', '.ad', '.ads', '.advertisement', '.sidebar', '.comments', '.social-share',
    '.cookie-banner', '#cookie-notice', '[role="banner"]', '[role="navigation"]',
    '[role="complementary"]'
  ];
  clone.querySelectorAll(noiseSelectors.join(',')).forEach(el => el.remove());

  // Find article or main container
  let articleEl = clone.querySelector('article') || clone.querySelector('[role="main"]') || clone.querySelector('.post-content, .article-body, .entry-content, main');
  if (!articleEl) articleEl = clone;

  // Collect paragraphs and headings
  const elements = articleEl.querySelectorAll('p, h2, h3, h4, blockquote, ul, ol, img');
  const validNodes = [];
  let wordCount = 0;

  elements.forEach(el => {
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'img') {
      const src = el.getAttribute('src');
      if (src && !src.includes('avatar') && !src.includes('logo') && !src.includes('icon')) {
        const img = document.createElement('img');
        img.src = src;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        img.style.margin = '20px 0';
        validNodes.push(img.outerHTML);
      }
    } else {
      const text = el.innerText?.trim();
      if (text && text.length > 25) {
        wordCount += text.split(/\\s+/).length;
        validNodes.push('<' + tagName + '>' + el.innerHTML + '</' + tagName + '>');
      }
    }
  });

  const readTime = Math.max(1, Math.round(wordCount / 200));
  const contentHtml = validNodes.length > 0 ? validNodes.join('') : '<p>' + articleEl.innerText.slice(0, 10000) + '</p>';

  // Build Reader Overlay
  const overlay = document.createElement('div');
  overlay.id = 'yogatik-reader-overlay';
  overlay.setAttribute('data-theme', 'dark');

  overlay.innerHTML = \`
    <style>
      #yogatik-reader-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647;
        overflow-y: auto;
        padding: 40px 20px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Georgia, Cambria, serif;
        transition: background 0.2s, color 0.2s;
      }
      #yogatik-reader-overlay[data-theme="dark"] {
        background: #0f141c;
        color: #e2e8f0;
      }
      #yogatik-reader-overlay[data-theme="sepia"] {
        background: #fbf0d9;
        color: #5f4b32;
      }
      #yogatik-reader-overlay[data-theme="light"] {
        background: #ffffff;
        color: #1e293b;
      }

      .y-reader-toolbar {
        position: fixed;
        top: 16px;
        right: 24px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(20, 26, 38, 0.85);
        backdrop-filter: blur(12px);
        padding: 6px 12px;
        border-radius: 99px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        z-index: 2147483648;
      }
      #yogatik-reader-overlay[data-theme="sepia"] .y-reader-toolbar {
        background: rgba(240, 226, 202, 0.9);
        border-color: rgba(95, 75, 50, 0.2);
      }
      #yogatik-reader-overlay[data-theme="light"] .y-reader-toolbar {
        background: rgba(241, 245, 249, 0.9);
        border-color: rgba(0, 0, 0, 0.1);
      }

      .y-reader-btn {
        background: none;
        border: 0;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 13px;
        color: inherit;
        font-family: sans-serif;
        font-weight: 500;
      }
      .y-reader-btn:hover {
        background: rgba(255, 255, 255, 0.12);
      }

      .y-reader-article {
        max-width: 720px;
        margin: 40px auto;
        line-height: 1.8;
        font-size: 18px;
      }
      .y-reader-article h1 {
        font-size: 32px;
        font-weight: 800;
        line-height: 1.3;
        margin-bottom: 12px;
      }
      .y-reader-meta {
        font-size: 14px;
        opacity: 0.7;
        margin-bottom: 32px;
        font-family: sans-serif;
        display: flex;
        gap: 16px;
      }
      .y-reader-article p {
        margin-bottom: 24px;
      }
      .y-reader-article h2, .y-reader-article h3 {
        margin: 36px 0 16px;
        line-height: 1.4;
      }
      .y-reader-article blockquote {
        border-left: 3px solid #ff7a18;
        padding-left: 18px;
        margin: 24px 0;
        font-style: italic;
        opacity: 0.9;
      }
    </style>

    <div class="y-reader-toolbar">
      <button class="y-reader-btn" id="y-theme-dark" title="Dark Theme">🌙</button>
      <button class="y-reader-btn" id="y-theme-sepia" title="Sepia Theme">📜</button>
      <button class="y-reader-btn" id="y-theme-light" title="Light Theme">☀️</button>
      <span style="opacity:0.3;">|</span>
      <button class="y-reader-btn" id="y-font-down" title="Decrease Font Size">A-</button>
      <button class="y-reader-btn" id="y-font-up" title="Increase Font Size">A+</button>
      <span style="opacity:0.3;">|</span>
      <button class="y-reader-btn" id="y-reader-close" style="color:#ff7a18;font-weight:bold;">✕ Exit</button>
    </div>

    <div class="y-reader-article" id="y-article-body">
      <h1>\${h1}</h1>
      <div class="y-reader-meta">
        \${author ? '<span>By ' + author + '</span>' : ''}
        <span>🕒 \${readTime} min read</span>
        <span>📖 Yogatik Reader</span>
      </div>
      <div class="y-reader-content">
        \${contentHtml}
      </div>
    </div>
  \`;

  document.body.appendChild(overlay);

  // Attach event handlers
  document.getElementById('y-theme-dark').onclick = () => overlay.setAttribute('data-theme', 'dark');
  document.getElementById('y-theme-sepia').onclick = () => overlay.setAttribute('data-theme', 'sepia');
  document.getElementById('y-theme-light').onclick = () => overlay.setAttribute('data-theme', 'light');

  let currentFontSize = 18;
  const articleBody = document.getElementById('y-article-body');
  document.getElementById('y-font-up').onclick = () => {
    if (currentFontSize < 28) {
      currentFontSize += 2;
      articleBody.style.fontSize = currentFontSize + 'px';
    }
  };
  document.getElementById('y-font-down').onclick = () => {
    if (currentFontSize > 14) {
      currentFontSize -= 2;
      articleBody.style.fontSize = currentFontSize + 'px';
    }
  };

  const closeReader = () => overlay.remove();
  document.getElementById('y-reader-close').onclick = closeReader;

  window.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeReader();
      window.removeEventListener('keydown', escHandler);
    }
  });

  return { active: true, title: h1, readTime };
})()
`;

async function toggleReaderMode(webContents) {
  if (!webContents || webContents.isDestroyed()) return { active: false };
  try {
    return await webContents.executeJavaScript(READER_SCRIPT);
  } catch (err) {
    console.error('[ReaderMode] Failed to toggle:', err.message);
    return { active: false, error: err.message };
  }
}

module.exports = {
  toggleReaderMode,
};
