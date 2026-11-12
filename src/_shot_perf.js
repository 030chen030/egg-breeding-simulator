/* 手机端滚动性能核验（真实 Chrome）：
   ① 手机打开手机版外壳 → 应自动落到 app.html（不再套 iframe）
   ② 选择器 662 条列表在 content-visibility 下高度是否正确、能否滚到底
   ③ A/B 对比：开/关 content-visibility 时滚动 662 条列表的布局与样式重算开销
   ④ 整页下拉的逐帧流畅度（rAF 间隔） */
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

const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));

(async () => {
  const srv = await serve(path.join(ROOT, 'site-mobile'));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await ctx.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e));

  /* ---------- ① 手机上打开手机版外壳 → 自动落到 app.html ---------- */
  await m.goto(base, { waitUntil: 'networkidle' });
  await m.waitForTimeout(800);
  const land = await m.evaluate(() => ({
    path: location.pathname,
    hasIframe: !!document.getElementById('app'),
    bgFixed: getComputedStyle(document.body, '::before').position,
    nestCount: document.querySelectorAll('.nest').length,
    boardOverscroll: getComputedStyle(document.getElementById('board-wrap')).overscrollBehaviorY
  }));
  console.log('① 落地页:', JSON.stringify(land));

  /* ---------- ② 打开选择器，检查卡片高度与滚动能力 ---------- */
  await m.evaluate(() => { openPicker(state.nests[0]); });
  await m.waitForTimeout(500);
  const listInfo = await m.evaluate(() => {
    const L = document.getElementById('plist');
    const items = L.querySelectorAll('.pitem');
    const h = [];
    for (let i = 0; i < 3; i++) h.push(Math.round(items[i].getBoundingClientRect().height));
    return { count: items.length, firstHeights: h, clientH: Math.round(L.clientHeight), scrollH: Math.round(L.scrollHeight) };
  });
  console.log('② 列表:', JSON.stringify(listInfo));
  const probe = await m.evaluate(() => {
    const L = document.getElementById('plist');
    const items = [...L.querySelectorAll('.pitem')];
    const hist = {};
    items.forEach(el => { const h = Math.round(el.getBoundingClientRect().height); hist[h] = (hist[h] || 0) + 1; });
    // 临时关掉 content-visibility，拿到"真实高度"分布（否则屏幕外的项返回 intrinsic 尺寸）
    let st = document.getElementById('__probe');
    if (!st) { st = document.createElement('style'); st.id = '__probe'; document.head.appendChild(st); }
    st.textContent = '.pitem{content-visibility:visible !important}';
    const real = {};
    items.forEach(el => { const h = Math.round(el.getBoundingClientRect().height); real[h] = (real[h] || 0) + 1; });
    st.textContent = '';
    const cs = getComputedStyle(items[0]);
    return { hist, real, cis: cs.containIntrinsicHeight, gap: getComputedStyle(L).rowGap };
  });
  console.log('② 卡片高度 · 跳过态:', JSON.stringify(probe.hist), '｜真实:', JSON.stringify(probe.real), '｜cis:', probe.cis, '｜gap:', probe.gap);
  await m.screenshot({ path: `${OUT}/P1-手机-选择器首屏.png` });

  // 滚到底，确认最后一项能正常渲染（content-visibility 不会漏渲染）
  const tailInfo = await m.evaluate(async () => {
    const L = document.getElementById('plist');
    L.scrollTop = L.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const items = L.querySelectorAll('.pitem');
    const last = items[items.length - 1];
    const b = last.getBoundingClientRect();
    const lb = L.getBoundingClientRect();
    return {
      lastH: Math.round(b.height),
      lastVisible: b.top < lb.bottom && b.bottom > lb.top,
      lastText: (last.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)
    };
  });
  console.log('② 列表尾部:', JSON.stringify(tailInfo));
  await m.screenshot({ path: `${OUT}/P2-手机-选择器滚到底.png` });

  /* ---------- ③ A/B：首屏渲染 662 条的开销（content-visibility 的核心收益） ---------- */
  async function renderCost(disableCvis) {
    await m.evaluate((off) => {
      let st = document.getElementById('__perf');
      if (!st) { st = document.createElement('style'); st.id = '__perf'; document.head.appendChild(st); }
      st.textContent = off ? '.pitem{content-visibility:visible !important}' : '';
      closePicker();
    }, disableCvis);
    await m.waitForTimeout(120);
    // 打开选择器 → 强制读一次布局（把这批渲染的真实成本算进去）
    return await m.evaluate(() => {
      const t0 = performance.now();
      openPicker(state.nests[0]);
      void document.getElementById('plist').scrollHeight;
      const t1 = performance.now();
      closePicker();
      return +(t1 - t0).toFixed(1);
    });
  }
  const costOn = [], costOff = [];
  for (let i = 0; i < 3; i++) { costOn.push(await renderCost(false)); costOff.push(await renderCost(true)); }
  const best = a => Math.min(...a);
  console.log('③ 首屏渲染 662 条 · content-visibility ON :', best(costOn) + 'ms', JSON.stringify(costOn));
  console.log('③ 首屏渲染 662 条 · content-visibility OFF:', best(costOff) + 'ms', JSON.stringify(costOff));
  console.log('③ 提速:', (best(costOff) / best(costOn)).toFixed(1) + '×');

  /* ---------- ③b 滚动一屏的增量开销（确认没有单帧长任务） ---------- */
  await m.evaluate(() => { const st = document.getElementById('__perf'); if (st) st.textContent = ''; openPicker(state.nests[0]); });
  await m.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(m);
  await cdp.send('Performance.enable');
  const a0 = await metrics(cdp);
  for (let i = 1; i <= 14; i++) {
    await m.evaluate(i => { document.getElementById('plist').scrollTop = i * 420; }, i);
    await m.waitForTimeout(35);
  }
  const a1 = await metrics(cdp);
  console.log('③ b 滚动 14 屏增量:', JSON.stringify({
    layout: a1.LayoutCount - a0.LayoutCount,
    layoutMs: +((a1.LayoutDuration - a0.LayoutDuration) * 1000).toFixed(1),
    perScreenMs: +(((a1.LayoutDuration - a0.LayoutDuration) * 1000) / 14).toFixed(2),
    taskMs: +((a1.TaskDuration - a0.TaskDuration) * 1000).toFixed(1)
  }));

  /* ---------- ④ 整页下拉逐帧流畅度 ---------- */
  await m.evaluate(() => { closePicker(); window.scrollTo(0, 0); });
  await m.waitForTimeout(300);
  const fps = await m.evaluate(async () => {
    const gaps = []; let last = performance.now(); let stop = false;
    const tick = () => { const t = performance.now(); gaps.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    for (let i = 0; i < 70; i++) { window.scrollBy(0, 14); await new Promise(r => requestAnimationFrame(r)); }
    stop = true;
    const s = gaps.slice(1).sort((a, b) => a - b);
    const q = p => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
    return { frames: s.length, p50: q(.5), p90: q(.9), max: +Math.max(...s).toFixed(1), scrolledTo: Math.round(window.scrollY) };
  });
  console.log('④ 整页下拉:', JSON.stringify(fps));
  await m.screenshot({ path: `${OUT}/P3-手机-整页下拉到底.png` });

  console.log('pageerror:', errors.length, errors.slice(0, 4).join(' | '));
  await browser.close(); srv.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message || e); process.exit(1); });
