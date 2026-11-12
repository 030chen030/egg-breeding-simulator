/* 定位「存档 / 分享」入口：桌面 + 手机端高亮截图 */
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

const mark = (sel) => `(function(){
  document.querySelectorAll('.__hl').forEach(e => e.classList.remove('__hl'));
  const st = document.getElementById('__hlcss') || (function(){ const s=document.createElement('style'); s.id='__hlcss'; document.head.appendChild(s); return s; })();
  st.textContent = '.__hl{outline:3px solid #e04b5a !important;outline-offset:2px;border-radius:6px}';
  const n = document.querySelector('${sel}');
  if (n){ n.classList.add('__hl'); n.scrollIntoView({block:'center'}); }
  return !!n;
})()`;

(async () => {
  const srv = await serve(path.join(ROOT, 'site'));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];

  /* 桌面：工具栏高亮入口 → 再打开面板 */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('desk: ' + e));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  await p.evaluate(mark('#open-save'));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/W1-桌面-入口位置.png` });
  const btnText = await p.evaluate(() => { const b = document.getElementById('open-save'); const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y) }; });
  console.log('desktop button:', JSON.stringify(btnText));

  await p.click('#open-save');
  await p.waitForTimeout(400);
  await p.evaluate(mark('#shareurl'));
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/W2-桌面-面板.png` });

  /* 手机：工具栏高亮入口 → 再打开面板 */
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e));
  await m.goto(url, { waitUntil: 'networkidle' });
  await m.waitForTimeout(400);
  const mBtn = await m.evaluate(mark('#open-save'));
  await m.waitForTimeout(300);
  await m.screenshot({ path: `${OUT}/W3-手机-入口位置.png` });
  const pos = await m.evaluate(() => {
    const b = document.getElementById('open-save'); const r = b.getBoundingClientRect();
    return { found: !!b, text: b.textContent.trim(), visible: r.width > 0 && r.height > 0, pageY: Math.round(r.top + window.scrollY) };
  });
  console.log('mobile button:', JSON.stringify(pos), '| scrollIntoView ok:', mBtn);

  await m.evaluate(() => document.getElementById('open-save').click());
  await m.waitForTimeout(400);
  await m.screenshot({ path: `${OUT}/W4-手机-面板.png` });

  console.log('pageerror:', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message || e); process.exit(1); });
