/* 存档 / 分享 视觉核验：真实 Chrome，桌面 + 手机，检查 pageerror 为 0 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_shots');
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(buf); });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const box = async (p, sel) => {
  const b = await p.locator(sel).boundingBox();
  return { x: Math.max(0, b.x), y: Math.max(0, b.y), width: b.width, height: b.height };
};

(async () => {
  const srv = await serve(path.join(ROOT, 'site'));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let errors = [];

  /* ---------- 桌面 ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('desktop: ' + e));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);

  // 造一套辨识度高的布局：一公一母 + 一个空窝
  const code = await p.evaluate(`(function(){
    const pool = PETS.filter(x => !unknownOnly(x) && sexAvail(x)==='MF');
    const a = pool[0];
    const b = pool.find(x => x.id!==a.id && realGroups(x).some(g=>realGroups(a).includes(g))) || pool[1];
    state.cols=8; state.rows=6; state.seq=0;
    state.nests = [
      {id:'v1',seq:1,x:2,y:2,petId:a.id,sex:'M',shiny:false},
      {id:'v2',seq:2,x:3,y:2,petId:b.id,sex:'F',shiny:true},
      {id:'v3',seq:3,x:4,y:2,petId:pool[3].id,sex:'M',shiny:false},
      {id:'v4',seq:4,x:6,y:4,petId:null,sex:null,shiny:false}
    ];
    renderAll();
    return encodeLayout(layoutOf());
  })()`);
  console.log('share code:', code, '| len', code.length);

  // 1) 空面板
  await p.click('#open-save');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/S1-存档面板-空.png`, clip: await box(p, '#smodal .dlg') });

  // 2) 保存两条存档
  await p.fill('#savename', '火系三连（一公两母）');
  await p.click('#save-now');
  await p.waitForTimeout(250);
  await p.evaluate(`state.nests[0].sex='F'; state.nests[1].sex='F'; renderAll()`);
  await p.fill('#savename', '备用：双母待补公');
  await p.click('#save-now');
  await p.waitForTimeout(350);
  const listInfo = await p.evaluate(() => ({ n: document.querySelectorAll('.sitem').length, urlLen: document.getElementById('shareurl').value.length }));
  console.log('saves:', listInfo.n, '| shareurl len:', listInfo.urlLen);
  await p.screenshot({ path: `${OUT}/S2-存档面板-有存档.png`, clip: await box(p, '#smodal .dlg') });

  // 3) 分享某条存档（点「分享」→ 复制链接）
  await p.click('.sitem [data-sact="share"]');
  await p.waitForTimeout(300);
  const copied = await p.evaluate(() => navigator.clipboard.readText().catch(() => '(clipboard blocked)'));
  console.log('clipboard:', String(copied).slice(0, 72) + '…');
  await p.screenshot({ path: `${OUT}/S3-存档面板-分享链接.png`, clip: await box(p, '#smodal .dlg') });

  await p.evaluate('closeSave()');
  await p.waitForTimeout(200);

  // 4) 打开分享链接 → 自动还原 + 顶部提示条
  await p.goto(url + '#s=' + code, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const st = await p.evaluate(() => ({
    nests: document.querySelectorAll('.nest').length,
    tip: document.getElementById('sharetip').style.display,
    tipText: document.getElementById('sharetip').textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
    verdict: document.getElementById('vtext').textContent
  }));
  console.log('share-open:', JSON.stringify(st));
  await p.screenshot({ path: `${OUT}/S4-打开分享链接-桌面.png`, clip: { x: 0, y: 0, width: 1280, height: 620 } });

  /* ---------- 手机 ---------- */
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e));
  await m.goto(url, { waitUntil: 'networkidle' });
  await m.waitForTimeout(400);
  await m.evaluate(() => document.getElementById('open-save').click());
  await m.waitForTimeout(350);
  await m.fill('#savename', '手机端保存的布局');
  await m.click('#save-now');
  await m.waitForTimeout(300);
  console.log('mobile save ok:', await m.evaluate(() => document.querySelectorAll('.sitem').length));
  await m.screenshot({ path: `${OUT}/S5-手机-存档面板.png` });

  await m.goto(url + '#s=' + code, { waitUntil: 'networkidle' });
  await m.waitForTimeout(600);
  const mst = await m.evaluate(() => { closeSave(); return { nests: document.querySelectorAll('.nest').length, tip: document.getElementById('sharetip').style.display }; });
  console.log('mobile share-open:', JSON.stringify(mst));
  await m.screenshot({ path: `${OUT}/S6-手机-分享载入.png` });

  /* ---------- 手机版外壳：手机上直接跳 app.html（脱离 iframe） ---------- */
  const srv2 = await serve(path.join(ROOT, 'site-mobile'));
  const shellURL = `http://127.0.0.1:${srv2.address().port}/`;
  const m2 = await mctx.newPage();
  m2.on('pageerror', e => errors.push('shell: ' + e));
  await m2.goto(shellURL + '#s=' + code, { waitUntil: 'networkidle' });
  await m2.waitForTimeout(900);
  const jumped = await m2.evaluate(() => ({
    path: location.pathname, hash: location.hash.slice(0, 3),
    nests: document.querySelectorAll('.nest').length,
    tip: document.getElementById('sharetip').style.display,
    hasIframe: !!document.getElementById('app'),
    bgFixed: getComputedStyle(document.body, '::before').position
  }));
  console.log('mobile shell ->', JSON.stringify(jumped));
  await m2.screenshot({ path: `${OUT}/S7-手机-外壳跳转后.png` });

  /* ---------- 电脑上打开手机版外壳：仍是 390px iframe ---------- */
  const d2 = await ctx.newPage();
  d2.on('pageerror', e => errors.push('shell-desk: ' + e));
  await d2.goto(shellURL + '#s=' + code, { waitUntil: 'networkidle' });
  await d2.waitForTimeout(900);
  const deskShell = await d2.evaluate(() => {
    const f = document.getElementById('app');
    return { hasIframe: !!f, src: f && f.getAttribute('src'), w: f && f.getBoundingClientRect().width };
  });
  const dframe = await (await d2.$('#app')).contentFrame();
  const fin = await dframe.evaluate(() => ({ nests: document.querySelectorAll('.nest').length, cvis: getComputedStyle(document.querySelector('.card')).display }));
  console.log('desktop shell ->', JSON.stringify(deskShell), '| inner:', JSON.stringify(fin));
  await d2.screenshot({ path: `${OUT}/S8-电脑-手机版外壳.png` });

  console.log('pageerror:', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close(); srv.close(); srv2.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message || e); process.exit(1); });
