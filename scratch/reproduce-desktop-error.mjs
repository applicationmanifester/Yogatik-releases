import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../frontend/dist');

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split('?')[0];
  let filePath = path.join(distDir, cleanUrl);
  if (cleanUrl === '/' || !path.extname(cleanUrl)) {
    filePath = path.join(distDir, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = ext === '.js' ? 'application/javascript' : ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(4567, async () => {
  console.log('Static server listening on 4567');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Inject Electron desktop environment before script execution
  await context.addInitScript(() => {
    window.__YOGATIK_ELECTRON__ = true;
    window.__YOGATIK_DESKTOP__ = { windowType: 'main' };
    window.electronAPI = {
      isDesktop: true,
      on: () => {},
      send: () => {},
      invoke: () => Promise.resolve(null),
      execCommand: () => Promise.resolve({ stdout: '', stderr: '', code: 0 }),
      fsRead: () => Promise.resolve(''),
    };
  });

  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[PAGE ${msg.type()}]`, msg.text());
  });

  page.on('pageerror', err => {
    console.log('=== PAGE ERROR ===');
    console.log(err.stack || err.message);
  });

  try {
    await page.goto('http://localhost:4567/', { waitUntil: 'networkidle', timeout: 10000 });
  } catch (e) {
    console.log('Navigation ended / timed out:', e.message);
  }

  // Check if error boundary is rendered
  const errorText = await page.evaluate(() => {
    const el = document.querySelector('.error-boundary-pre');
    return el ? el.textContent : null;
  });

  console.log('ErrorBoundary message:', errorText);

  const fullText = await page.evaluate(() => document.body.innerText);
  console.log('Body text preview:', fullText.slice(0, 300));

  await browser.close();
  server.close();
  process.exit(0);
});
