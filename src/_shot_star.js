/* v10.2 核验：★ 角标（可配对建议）与 ❤ 徽章（判定可生蛋）视觉区隔 + 统一蛋组随机换组 */
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

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('desk: ' + e));
  await p.goto(url, { waitUntil: 'networkidle' });
  await wait(900);

  /* ---------- ① 角标区隔：F-M-F 同蛋组，中间为基准 ---------- */
  await p.evaluate(() => {
    document.querySelector('[data-tpl="line3"]').click();
    fillSameGroup(7); setRecBase(state.nests[1]); renderAll();
  });
  await wait(600);
  const badge = await p.evaluate(() => ({
    stars: [...document.querySelectorAll('.nest .stardot')].map(s => ({ ch: s.textContent.trim(), color: getComputedStyle(s).color })),
    hearts: document.querySelectorAll('.nest .heartdot').length,
    overlayHearts: (document.getElementById('overlay').textContent.match(/❤/g) || []).length,
    pairState: [...document.querySelectorAll('.pair')].map(c => c.className)
  }));
  console.log('① 画布角标:', JSON.stringify(badge));
  const bw = await p.$('#board-wrap');
  await bw.screenshot({ path: `${OUT}/U1-桌面-星标与爱心区隔.png` });

  /* ---------- ② 工具栏密度（统一蛋组按钮位置） ---------- */
  const tb = await p.$('.toolbar');
  if (tb) await tb.screenshot({ path: `${OUT}/U2-桌面-工具栏.png` });

  /* ---------- ③ 统一蛋组：连点 8 次，记录换组结果 ---------- */
  const picks = [];
  for (let i = 0; i < 8; i++) {
    await p.click('#same');
    await wait(260);
    picks.push(await p.evaluate(() => ({
      gid: lastSameGid,
      group: gName(lastSameGid),
      pets: state.nests.map(n => PETMAP[n.petId].title),
      okPairs: +document.getElementById('s-ok').textContent,
      toast: document.getElementById('toast') ? document.getElementById('toast').textContent.trim() : ''
    })));
    if (i === 1 || i === 3 || i === 5) await (await p.$('#board-wrap')).screenshot({ path: `${OUT}/U3-统一蛋组-第${i + 1}次.png` });
  }
  console.log('③ 连点 8 次换组：');
  picks.forEach((r, i) => console.log(`   第${i + 1}次 → ${r.group}(gid ${r.gid}) · ${r.pets.join('/')} · 可生蛋 ${r.okPairs} 组 · toast「${r.toast}」`));
  const distinct = new Set(picks.map(r => r.gid)).size;
  let repeat = false;
  for (let i = 1; i < picks.length; i++) if (picks[i].gid === picks[i - 1].gid) repeat = true;
  console.log('   不同蛋组数:', distinct, '| 相邻两次重复:', repeat);

  /* ---------- ④ 选择器内的 ★ 推荐角标 + 筛选芯片 ---------- */
  await p.evaluate(() => {
    document.querySelector('[data-tpl="line3"]').click();
    fillSameGroup(7); setRecBase(state.nests[1]); renderAll();
  });
  await wait(400);
  await p.evaluate(() => openPicker(state.nests[0]));
  await wait(800);
  const pf = await p.evaluate(() => ({
    chip: [...document.querySelectorAll('#prefilter .fchip')].map(b => b.textContent.trim()),
    tag: (document.querySelector('.pitem .tag.pairok') || {}).textContent,
    count: document.getElementById('m-count').textContent
  }));
  console.log('④ 选择器:', JSON.stringify(pf));
  await p.screenshot({ path: `${OUT}/U4-桌面-选择器星标推荐.png` });

  console.log('pageerror:', errors.length, errors.slice(0, 4).join(' | '));

  /* ---------- ⑤ 手机端：星标 + 统一蛋组提示 ---------- */
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e));
  await m.goto(url, { waitUntil: 'networkidle' });
  await wait(900);
  await m.evaluate(() => {
    document.querySelector('[data-tpl="line3"]').click();
    fillSameGroup(7); setRecBase(state.nests[1]); renderAll();
  });
  await wait(500);
  const mBadge = await m.evaluate(() => ({
    stars: document.querySelectorAll('.nest .stardot').length,
    stone: document.querySelector('.nest .stardot') ? getComputedStyle(document.querySelector('.nest .stardot')).fontSize : null
  }));
  console.log('⑤ 手机端星标:', JSON.stringify(mBadge));
  await (await m.$('#board-wrap')).screenshot({ path: `${OUT}/U5-手机-星标与爱心.png` });
  await m.evaluate(() => document.getElementById('same').scrollIntoView({ block: 'center' }));
  await wait(300);
  await m.tap('#same');
  await wait(400);
  await m.screenshot({ path: `${OUT}/U6-手机-统一蛋组提示.png` });
  console.log('⑤ 手机端统一蛋组:', await m.evaluate(() => `toast「${document.getElementById('toast').textContent.trim()}」/ 可生蛋 ${document.getElementById('s-ok').textContent} 组`));
  console.log('pageerror total:', errors.length, errors.slice(0, 4).join(' | '));

  await browser.close(); srv.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message || e); process.exit(1); });
