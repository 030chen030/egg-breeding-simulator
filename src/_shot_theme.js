/* v9 糖果马卡龙主题审阅：桌面 / 手机 / 弹窗多视图截图 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_shots');

function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, buf) => {
        if (e) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve(path.join(ROOT, 'site'));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- 桌面 ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('desk: ' + e));
  await p.goto(url, { waitUntil: 'networkidle' });
  await wait(900);

  const shell = await p.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    radius: getComputedStyle(document.getElementById('board').closest('.card')).borderRadius,
    statColors: [...document.querySelectorAll('.stat b')].map(b => getComputedStyle(b).color),
    barColors: [...document.querySelectorAll('.stat')].map(s => getComputedStyle(s, '::after').backgroundColor),
    btnRadius: getComputedStyle(document.getElementById('open-save')).borderRadius,
    nestCount: document.querySelectorAll('.nest').length
  }));
  console.log('桌面 token 落地:', JSON.stringify(shell));

  await p.screenshot({ path: `${OUT}/T1-桌面-首屏.png` });
  await p.evaluate(() => document.getElementById("pairgrid").scrollIntoView({ block: 'start' }));
  await wait(700);
  await p.screenshot({ path: `${OUT}/T2-桌面-报告区.png` });

  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#open-save');
  await wait(600);
  await p.screenshot({ path: `${OUT}/T3-桌面-存档面板.png` });
  await p.evaluate(() => closeSave());
  await wait(400);

  await p.evaluate(() => openPicker(state.nests[0]));
  await wait(700);
  await p.screenshot({ path: `${OUT}/T4-桌面-精灵选择器.png` });
  await p.evaluate(() => closePicker());
  await wait(300);

  /* ---------- 手机 ---------- */
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e));
  await m.goto(url, { waitUntil: 'networkidle' });
  await wait(900);
  await m.screenshot({ path: `${OUT}/T5-手机-首屏.png` });
  await m.evaluate(() => document.getElementById("pairgrid").scrollIntoView({ block: 'start' }));
  await wait(600);
  await m.screenshot({ path: `${OUT}/T6-手机-报告区.png` });
  await m.evaluate(() => { window.scrollTo(0, 0); openPicker(state.nests[0]); });
  await wait(700);
  await m.screenshot({ path: `${OUT}/T7-手机-选择器.png` });

  console.log('pageerror:', errors.length, errors.slice(0, 4).join(' | '));
  await browser.close(); srv.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message || e); process.exit(1); });
