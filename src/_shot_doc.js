/* 截图核验：规则说明区两块重构后的 note 排版（桌面 + 手机视口） */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_shots');
const MIME = { '.html': 'text/html; charset=utf-8' };

function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, buf) => {
        if (e) { res.writeHead(404); res.end('nf'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve(path.join(ROOT, 'site'));
  const port = srv.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const shoot = async (name, vp, clipSel) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
    // 滚到规则说明区并截图整卡
    await p.locator('.note.howto').scrollIntoViewIfNeeded();
    await p.waitForTimeout(200);
    if (clipSel) {
      const card = p.locator(clipSel).first();
      await card.screenshot({ path: `${OUT}/${name}.png` });
    } else {
      await p.screenshot({ path: `${OUT}/${name}.png` });
    }
    console.log(name, 'ok');
    await ctx.close();
  };
  await shoot('Q1-说明区重排-桌面', { width: 1280, height: 900 }, '.card:has(.note.howto)');
  await shoot('Q2-说明区重排-手机', { width: 390, height: 844 }, '.card:has(.note.howto)');
  await browser.close();
  srv.close();
  console.log('pageerror:', errors.length, errors.slice(0, 3));
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
