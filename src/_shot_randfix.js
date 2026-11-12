/* v10.3 核验：统一蛋组连点后，「随机填充」仍能重排（回归用户反馈的死键问题） */
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

  /* ---------- ① 造 15 个小窝（复现截图场景） ---------- */
  await p.evaluate(() => {
    const coords = [[0, 0], [1, 0], [2, 0], [3, 1], [4, 1], [5, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3], [0, 4], [1, 4], [2, 4]];
    state.nests = []; state.seq = 0; state.selected = null; state.recBaseId = null;
    coords.forEach(([x, y]) => addNest(x, y, null, null));
    renderAll();
  });
  await wait(400);
  console.log('① 小窝数:', await p.evaluate(() => state.nests.length));

  /* ---------- ② 连点 3 次统一蛋组 ---------- */
  for (let i = 0; i < 3; i++) { await p.click('#same'); await wait(300); }
  const afterSame = await p.evaluate(() => ({
    group: gName(lastSameGid),
    filled: state.nests.filter(n => n.petId).length,
    ok: document.getElementById('s-ok').textContent,
    pets: state.nests.map(n => PETMAP[n.petId].title)
  }));
  console.log('② 统一蛋组 ×3 →', afterSame.group, '| 入住', afterSame.filled, '| 可生蛋', afterSame.ok, '组');
  await (await p.$('#board-wrap')).screenshot({ path: `${OUT}/V1-连点统一蛋组后.png` });

  /* ---------- ③ 点「随机填充」——以前这里毫无反应 ---------- */
  await p.click('#rand');
  await wait(500);
  const afterRand = await p.evaluate(() => ({
    toast: document.getElementById('toast').textContent.trim(),
    pets: state.nests.map(n => PETMAP[n.petId].title),
    sexes: state.nests.map(n => effSex(n)),
    ok: +document.getElementById('s-ok').textContent
  }));
  const changed = afterRand.pets.filter((t, i) => t !== afterSame.pets[i]).length;
  console.log('③ 点「随机填充」→ 变化', changed, '/', afterSame.pets.length, '个窝');
  console.log('   toast:', afterRand.toast);
  console.log('   可生蛋:', afterRand.ok, '组 | 性别:', afterRand.sexes.join(''));
  await (await p.$('#board-wrap')).screenshot({ path: `${OUT}/V2-随机填充重排后.png` });

  /* ---------- ④ 再点 3 次随机填充，每次都应变 ---------- */
  const seq = [afterRand.pets.join('|')];
  for (let i = 0; i < 3; i++) {
    await p.click('#rand'); await wait(400);
    seq.push(await p.evaluate(() => state.nests.map(n => PETMAP[n.petId].title).join('|')));
  }
  console.log('④ 连点 4 次随机填充，每次结果互不相同:', new Set(seq).size === seq.length, `(${new Set(seq).size}/4)`);
  console.log('   末次 toast:', await p.evaluate(() => document.getElementById('toast').textContent.trim()));

  /* ---------- ⑤ 有空窝时只填空窝，保留手放精灵 ---------- */
  await p.evaluate(() => {
    state.nests = []; state.seq = 0;
    addNest(2, 2, null, null); addNest(3, 2, null, null); addNest(4, 2, null, null);
    state.nests[0].petId = 'pet_000001'; state.nests[0].sex = 'F';   // 手动放「喵喵」
    renderAll();
  });
  await wait(300);
  const keepTitle = await p.evaluate(() => PETMAP[state.nests[0].petId].title);
  await p.click('#rand');
  await wait(400);
  const afterPartial = await p.evaluate(() => ({
    first: PETMAP[state.nests[0].petId].title,
    filled: state.nests.filter(n => n.petId).length,
    toast: document.getElementById('toast').textContent.trim()
  }));
  console.log('⑤ 手放精灵:', keepTitle, '→ 点击后:', afterPartial.first, '| 入住', afterPartial.filled, '| toast:', afterPartial.toast);
  await (await p.$('#board-wrap')).screenshot({ path: `${OUT}/V3-只填空窝.png` });

  console.log('pageerror:', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message || e); process.exit(1); });
