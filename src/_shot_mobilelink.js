/* 手机端专用链接：本地起静态服务 → 真实 Chrome 双视口核验（电脑 1280 / 手机 390） */
const { chromium } = require('playwright-core');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..');
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXE2 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = ROOT + '/_shots';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(8137, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : EXE2, headless: true });
  const errs = [];
  const URL_M = 'http://127.0.0.1:8137/site-mobile/index.html';
  const appInfo = f => f.evaluate(() => ({
    phone: typeof isPhone === 'function' ? isPhone() : 'n/a',
    w: window.innerWidth, cell: typeof CELL !== 'undefined' ? CELL : 'n/a',
    boardW: document.getElementById('board') ? document.getElementById('board').style.width : 'n/a',
    modalFull: (() => { const d = document.querySelector('.dlg'); if (!d) return 'n/a'; const r = d.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })()
  }));

  /* ---------- 电脑 1280×900：外壳应固定为手机宽度 ---------- */
  const c1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p1 = await c1.newPage();
  p1.on('pageerror', e => errs.push('desktop: ' + e.message));
  await p1.goto(URL_M);
  await p1.waitForTimeout(1200);
  const shells = p1.frames();
  console.log('D1 电脑打开 → 外壳文案:', (await p1.locator('.mhead').innerText()).replace(/\s+/g, ' '));
  console.log('D2 手机框尺寸:', JSON.stringify(await p1.locator('.phone').evaluate(el => ({ w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))));
  console.log('D3 开关按钮:', await p1.locator('.mhead .sw').getAttribute('href'));
  const dApp = shells.find(f => f.url().endsWith('app.html'));
  console.log('D4 内嵌程序:', JSON.stringify(await appInfo(dApp)));
  await p1.screenshot({ path: OUT + '/P1-电脑打开手机版.png' });

  /* ---------- 手机 390×844：应铺满全屏，交互正常 ---------- */
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => errs.push('phone: ' + e.message));
  await p2.goto(URL_M);
  await p2.waitForTimeout(1200);
  console.log('P1 手机端外壳隐藏:', await p2.locator('.mhead').isHidden(), '| 框架铺满:',
    JSON.stringify(await p2.locator('.phone').evaluate(el => ({ w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))));
  const mApp = p2.frames().find(f => f.url().endsWith('app.html'));
  console.log('P2 内嵌程序:', JSON.stringify(await appInfo(mApp)));
  await p2.screenshot({ path: OUT + '/P2-手机打开手机版.png' });
  // 轻点小窝（用 iframe 内的真实 PointerEvent，touch 类型）→ 选择器应全屏打开
  const tapRes = await mApp.evaluate(() => {
    const n = document.querySelector('.nest');
    const mk = t => n.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch', isPrimary: true }));
    mk('pointerdown'); mk('pointerup');
    return document.getElementById('modal').classList.contains('show');
  });
  await p2.waitForTimeout(500);
  console.log('P3 轻点小窝 → 选择器打开:', tapRes);
  await p2.screenshot({ path: OUT + '/P3-手机版选择器全屏.png' });
  const listCount = await mApp.evaluate(() => document.querySelectorAll('.plist .pitem').length);
  console.log('P4 选择器精灵条目:', listCount);
  await p2.waitForTimeout(300);

  console.log('page errors:', errs.length, errs.slice(0, 3));
  await browser.close();
  server.close();
})();
