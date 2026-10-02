const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../frontend/node_modules/jsdom');

const dist = path.join(__dirname, '..', 'frontend', 'dist');
const server = http.createServer((req, res) => {
  let p = path.join(dist, req.url.split('?')[0]);
  if (req.url === '/') p = path.join(dist, 'index.html');
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const ext = path.extname(p);
    const ct = ext === '.js' ? 'application/javascript' : ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    fs.createReadStream(p).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3456, async () => {
  try {
    const dom = await JSDOM.fromURL('http://localhost:3456/', {
      runScripts: 'dangerously',
      resources: 'usable',
      beforeParse(window) {
        window.electronAPI = { isDesktop: true, on: () => {}, send: () => {} };
        window.__YOGATIK_DESKTOP__ = { windowType: 'main' };
        window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
        window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        window.console.error = (...args) => {
          console.log('[BROWSER console.error]', ...args);
        };
      }
    });

    dom.window.addEventListener('error', (e) => {
      console.log('=== CAUGHT WINDOW ERROR ===');
      console.log(e.error ? e.error.stack || e.error.message : e.message);
    });

    setTimeout(() => {
      console.log('App root content:', dom.window.document.getElementById('root')?.innerHTML?.slice(0, 300));
      server.close();
      process.exit(0);
    }, 3000);
  } catch (err) {
    console.error('JSDOM Error:', err);
    server.close();
    process.exit(1);
  }
});
