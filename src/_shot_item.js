/* 放大核验 v2：clip 区域截图，避免 locator.screenshot 可见性问题 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_shots');

function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, buf) => {
        if (e) { res.writeHead(404); res.end('nf'); return; }
        res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve(path.join(ROOT, 'site'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => { openPicker(state.nests[0]); return { shown: document.getElementById('modal').classList.contains('show'), nests: state.nests.length }; });
  console.log('open:', JSON.stringify(st));
  await p.waitForTimeout(600);
  const info = await p.evaluate(() => {
    const it = document.querySelectorAll('.pitem');
    const first = it[0].getBoundingClientRect();
    const nopair = document.querySelector('.pitem.nopair');
    const npr = nopair ? nopair.getBoundingClientRect() : null;
    const dlg = document.querySelector('.dlg').getBoundingClientRect();
    const sample = it[0].outerHTML.slice(0, 300);
    return { count: it.length, first: { t: first.top, h: first.height, w: first.width }, nopairTop: npr ? npr.top : null, dlgTop: dlg.top, sample,
      firstVisible: getComputedStyle(it[0]).display + '/' + getComputedStyle(it[0]).visibility, nopairCount: document.querySelectorAll('.pitem.nopair').length };
  });
  console.log(JSON.stringify(info, null, 1));
  // 顶部 3 张卡片的区域（列表起点往下 320px）
  const top = Math.max(0, info.first.t);
  await p.screenshot({ path: `${OUT}/R1-列表顶部-手机.png`, clip: { x: 0, y: top - 8, width: 390, height: 330 } });
  await browser.close(); srv.close();
  console.log('pageerror:', errors.length);
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
