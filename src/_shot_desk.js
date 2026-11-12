/* 桌面端选择器列表核验：grid-auto-rows 改动不影响两列布局 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_shots');
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(buf); });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
(async () => {
  const srv = await serve(path.join(ROOT, 'site'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  await p.evaluate(() => openPicker(state.nests[0]));
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => {
    const it = document.querySelector('.pitem');
    const list = document.getElementById('plist');
    return { pitemH: it.offsetHeight, cols: getComputedStyle(list).gridTemplateColumns.split(' ').length };
  });
  console.log('desktop pitemH:', info.pitemH, '| columns:', info.cols);
  const modal = await p.locator('#modal .dlg').boundingBox();
  await p.screenshot({ path: `${OUT}/R4-桌面选择器两列.png`, clip: { x: modal.x, y: modal.y, width: Math.min(modal.width, 1280), height: Math.min(modal.height, 900) } });
  console.log('pageerror:', errors.length);
  await browser.close(); srv.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
