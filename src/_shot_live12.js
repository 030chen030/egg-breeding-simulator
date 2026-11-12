/**
 * v12 线上真机核验：确认线上跑的是 v12（一键补位真实可用 + 空窝推荐角标）
 * 复用 _shot_fill.js 的断言思路，但目标换成线上 URL。
 * 运行：NODE_PATH="C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules" node _shot_live12.js
 */
const { chromium } = require('playwright-core');

const BASE = 'https://egg-breeding-simulator.app.workbuddy.link/?sharecode=4AJ6XLOWU4';
const MOB = 'https://egg-breeding-simulator-mobile.app.workbuddy.link/app.html?sharecode=SPTZANPTGU';

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const bad = [];

  // ── A. 电脑版
  console.log('\n=== A. 线上主页加载 ===');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('desktop: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('desktop-console: ' + m.text()); });
  p.on('requestfailed', r => errors.push('desktop-reqfailed: ' + r.url() + ' :: ' + (r.failure() || {}).errorText));
  p.on('response', r => { if (r.status() >= 400) bad.push('[desktop] ' + r.status() + ' ' + r.url()); });

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);

  const A = await p.evaluate(() => ({
    hasFill: !!document.getElementById('fill'),
    fillText: (document.getElementById('fill') || {}).textContent || '',
    ghostTip: document.title,
    chips: [...document.querySelectorAll('.fchip')].map(c => ({ t: c.textContent.replace(/\s+/g, ' ').trim(), on: c.classList.contains('on'), b: c.dataset.b })),
    nests: document.querySelectorAll('#nests .ncard').length,
    ok: (document.getElementById('s-ok') || {}).textContent,
    hasTrack: typeof window.Track !== 'undefined'
  }));
  check('存在「一键补位」真实按钮 #fill', A.hasFill, A.hasFill);
  check('按钮文案为「✦ 一键补位」', /✦ 一键补位/.test(A.fillText), A.fillText);
  check('埋点已彻底移除（window.Track 不存在）', !A.hasTrack, A.hasTrack);
  const bchip = A.chips.find(c => c.b === 'breed');
  check('v11「可生蛋」筛选仍是默认 ON', !!(bchip && bchip.on), bchip);
  check('「可生蛋」计数仍为 605', !!(bchip && /605/.test(bchip.t)), bchip && bchip.t);
  check('初始 3 个小窝且已有成功配对', A.nests === 3 && +A.ok >= 1, A);

  const wait = ms => p.waitForTimeout(ms);
  const toastText = () => p.evaluate(() => {
    const t = document.getElementById('toast');
    return t && t.classList.contains('show') ? t.textContent.trim() : '';
  });
  const closeModal = async () => {
    await p.evaluate(() => { const m = document.getElementById('modal'); if (m && m.classList.contains('show')) closePicker(); });
    await wait(200);
  };
  const place = async cells => {
    await p.evaluate(list => {
      const cs = [...document.querySelectorAll('#cells .cellbox')];
      list.forEach(([x, y]) => { const c = cs.find(e => +e.dataset.x === x && +e.dataset.y === y); if (c) c.click(); });
    }, cells);
    await wait(400 + cells.length * 80);
  };
  const putAt = async (idx, name) => {
    await p.evaluate(i => document.querySelectorAll('#nests .ncard .petchip')[i].click(), idx);
    await wait(600);
    await p.evaluate(() => setBreedFilter('all'));
    await wait(200);
    await p.evaluate(n => {
      const q = document.getElementById('q');
      q.value = n; q.dispatchEvent(new Event('input', { bubbles: true }));
    }, name);
    await wait(450);
    const got = await p.evaluate(nm => {
      const it = [...document.querySelectorAll('#plist .pitem')].find(x => x.innerText.includes(nm));
      if (!it) return '';
      const t = it.querySelector('.nm').innerText.trim();
      it.click();
      return t;
    }, name);
    await wait(600);
    await closeModal();
    return got;
  };
  const snap = () => p.evaluate(() => {
    const r = computeAll();
    const bad = r.pairs.filter(x => x.state === 'bad');
    return {
      ok: r.okPairs.length,
      badSeqs: bad.map(x => x.nests.map(n => n.seq).join('-')).sort(),
      okSeqs: r.okPairs.map(x => x.nests.map(n => n.seq).join('-')).sort(),
      empty: state.nests.filter(n => !n.petId).map(n => n.seq)
    };
  });
  const dump = () => p.evaluate(() => {
    const base = recBase();
    return state.nests.slice().sort((a, c) => a.seq - c.seq).map(n => {
      const pt = n.petId ? PETMAP[n.petId] : null;
      const nb = state.nests.filter(m => m !== n && m.petId && adjacent(m, n));
      return {
        seq: n.seq, pet: pt ? pt.title : null, sex: pt ? effSex(n) : null,
        nb: nb.map(m => `${m.seq}${pairFeasible(m.petId ? { nest: m, pet: PETMAP[m.petId] } : null, pt) ? '' : '✗'}`)
      };
    });
  });

  console.log('\n=== B. 兜底提示（线上） ===');
  await p.click('#clear'); await wait(500);
  await p.click('#fill'); await wait(400);
  check('空画布补位 → 提示先放小窝', /还没有小窝/.test(await toastText()), await toastText());
  await place([[3, 3]]);
  await p.click('#fill'); await wait(400);
  check('只有空窝无精灵 → 提示先放入精灵', /先把一只精灵放进小窝/.test(await toastText()), await toastText());

  console.log('\n=== C. 复现用户场景：基准 + 空窝 ===');
  await p.click('#clear'); await wait(450);
  await place([[2, 2], [3, 2], [4, 2], [4, 1], [5, 2], [5, 1], [4, 3]]);
  const n7 = await p.evaluate(() => state.nests.length);
  check('放置 7 个小窝', n7 === 7, n7);
  const names = [];
  names.push(await putAt(0, '星星眼'));
  names.push(await putAt(1, '布灵'));
  names.push(await putAt(2, '玳龟'));
  names.push(await putAt(4, '幽铃'));
  check('4 只精灵已放入', names.every(x => x), names);
  await p.locator('#board .nest').nth(1).click();     // 画布点 #2（布灵）→ 基准
  await wait(600);

  const hint = await p.evaluate(() => ({
    ghost: document.querySelectorAll('#board .nest .stardot.ghost').length,
    fillable: document.querySelectorAll('#board .nest.fillable').length,
    titles: [...document.querySelectorAll('#board .nest .stardot.ghost')].map(x => x.getAttribute('title')),
    planFills: fillPlan().fills.map(f => `#${f.seq}←${f.pet.title}`),
    planSkip: fillPlan().skipped.map(s => `#${s.seq}:${s.why}`)
  }));
  console.log('    补位预告：', JSON.stringify(hint.planFills), ' 跳过：', JSON.stringify(hint.planSkip));
  check('空窝渲染出「可补位」★ 角标', hint.ghost > 0, hint);
  check('★ 数量 = 方案可补空窝数', hint.ghost === hint.planFills.length, hint);
  check('角标与虚线强调一一对应', hint.ghost === hint.fillable, hint);
  check('tooltip 预告将补入哪只精灵', hint.titles.every(t => /一键补位将放入/.test(t)), hint.titles);

  console.log('\n=== D. 一键补位实跑（线上） ===');
  const before = await snap();
  const emptyBefore = before.empty;
  await p.click('#fill'); await wait(800);
  const t1 = await toastText();
  console.log('    toast：', t1);
  const after = await snap();
  const fillCount = emptyBefore.length - after.empty.length;
  check('toast 报告补位数量', new RegExp(`已补位 ${fillCount} 个空窝`).test(t1), { t1, fillCount });
  check('至少补上 2 个空窝', fillCount >= 2, { emptyBefore, after: after.empty });
  check('补位 + 留空 = 原有空窝数', after.empty.every(s => emptyBefore.includes(s)) && fillCount + after.empty.length === emptyBefore.length, { emptyBefore, after: after.empty });
  check('补位前成功配对全部保持', before.okSeqs.every(s => after.okSeqs.includes(s)), { before: before.okSeqs, after: after.okSeqs });
  check('没有新增失败配对', after.badSeqs.every(s => before.badSeqs.includes(s)), { before: before.badSeqs, after: after.badSeqs });
  check('成功配对数增加（补位生效）', after.ok > before.ok, { before: before.ok, after: after.ok });

  const rows = await dump();
  console.log('    补位后盘面：', JSON.stringify(rows));
  check('原有 4 只精灵未被覆盖',
        rows[0].pet === '星星眼' && rows[1].pet === '布灵' && rows[2].pet === '玳龟' && rows[4].pet === '幽铃',
        rows.map(r => `${r.seq}:${r.pet}`));
  const newOnes = rows.filter(r => emptyBefore.includes(r.seq) && r.pet);
  check('新补入精灵与每个紧贴邻居都能配对', newOnes.every(r => r.nb.every(x => !x.includes('✗'))), newOnes);
  const sexClash = await p.evaluate(seqs => {
    const bad = [];
    state.nests.filter(n => seqs.includes(n.seq) && n.petId).forEach(n => {
      state.nests.filter(m => m !== n && m.petId && adjacent(m, n)).forEach(m => {
        if (effSex(m) === effSex(n)) bad.push(`${n.seq}-${m.seq}`);
      });
    });
    return bad;
  }, emptyBefore);
  check('新补入精灵与邻居性别相反', sexClash.length === 0, sexClash);
  const leftEmpty = after.empty;
  check('留空者确属「两侧性别互斥」',
        leftEmpty.length === 0 || new RegExp(`${leftEmpty.length} 个空窝两侧性别互斥`).test(t1), { leftEmpty, t1 });

  console.log('\n=== E. 边界：无空窝 / 基准无法配对 ===');
  await p.click('#fill'); await wait(400);
  check('无空窝可补 → 给出说明', /性别互斥|没有空窝/.test(await toastText()), await toastText());
  await p.click('#clear'); await wait(450);
  await place([[2, 2], [3, 2]]);
  await putAt(0, '星星眼');
  await p.locator('#board .nest').nth(0).click(); await wait(500);
  await p.click('#fill'); await wait(700);
  const e0 = await snap();
  check('两窝场景可一键补位成对', e0.empty.length === 0 && e0.ok >= 1, e0);
  await p.click('#clear'); await wait(450);
  await place([[2, 2], [3, 2]]);
  const dimo = await putAt(0, '迪莫');
  check('放入「未发现」组的迪莫', /迪莫/.test(dimo), dimo);
  const dimoHint = await p.evaluate(() => ({ ghost: document.querySelectorAll('#board .nest .stardot.ghost').length }));
  check('无法配对的基准不给空窝打角标', dimoHint.ghost === 0, dimoHint);
  await p.click('#fill'); await wait(500);
  check('基准无法配对 → 提示换基准', /无法与任何精灵配对/.test(await toastText()), await toastText());

  console.log('\n=== F. 回归：原有交互（线上） ===');
  await p.click('#clear'); await wait(450);
  await place([[2, 2], [3, 2], [4, 2]]);
  await p.click('#rand'); await wait(700);
  const r1 = await p.evaluate(() => ({ empty: state.nests.filter(n => !n.petId).length, filled: state.nests.filter(n => n.petId).length }));
  check('随机填充仍可用', r1.empty === 0 && r1.filled === 3, r1);
  await p.click('#same'); await wait(700);
  const r2 = await p.evaluate(() => ({ empty: state.nests.filter(n => !n.petId).length }));
  check('统一蛋组仍可用', r2.empty === 0, r2);
  await p.evaluate(() => { setBreedFilter('breed'); state.filter.q = ''; document.getElementById('q').value = ''; document.querySelector('#nests .ncard .petchip').click(); });
  await wait(600);
  const g = await p.evaluate(() => ({ n: document.querySelectorAll('#plist .pitem').length, def: document.querySelectorAll('#plist .tag.def').length }));
  check('选择器默认仍只列可生蛋（605）+「默认」角标', g.n === 605 && g.def === 1, g);
  await closeModal();

  console.log('\n=== G. 响应式 + 溢出扫描 ===');
  for (const w of [1440, 1280, 1024, 820]) {
    await p.setViewportSize({ width: w, height: 900 });
    await wait(300);
    const ovf = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`无横向溢出 @${w}px`, ovf <= 1, ovf);
  }

  // ── H. 手机版
  console.log('\n=== H. 手机版 app.html ===');
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const m = await mctx.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e.message));
  m.on('console', x => { if (x.type() === 'error') errors.push('mobile-console: ' + x.text()); });
  m.on('response', r => { if (r.status() >= 400) bad.push('[mobile] ' + r.status() + ' ' + r.url()); });
  await m.goto(MOB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await m.waitForTimeout(2500);
  const E = await m.evaluate(() => {
    const chips = [...document.querySelectorAll('.fchip')].map(c => ({ b: c.dataset.b, on: c.classList.contains('on') }));
    return {
      hasFill: !!document.getElementById('fill'),
      fillText: (document.getElementById('fill') || {}).textContent || '',
      hasTrack: typeof window.Track !== 'undefined',
      trkKeys: Object.keys(localStorage).filter(k => /^trk\.|trackpanel/.test(k)),
      breOn: !!(chips.find(c => c.b === 'breed') || {}).on,
      ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  check('手机版有「一键补位」按钮', E.hasFill && /✦ 一键补位/.test(E.fillText), E);
  check('手机版无埋点残留', !E.hasTrack && E.trkKeys.length === 0, E);
  check('手机版「可生蛋」默认 ON', E.breOn, E);
  check('手机版无横向溢出', E.ovf <= 1, E.ovf);

  // 手机端各列数下「可补位」文案不裁切
  const sweep = [];
  for (const cols of [4, 8, 12, 14]) {
    await m.evaluate(c => {
      const s = document.getElementById('cols'); s.value = String(c); s.dispatchEvent(new Event('change'));
      state.nests = []; state.seq = 0;
      const bp = PETS.find(x => !unknownOnly(x) && sexAvail(x) === 'MF');
      addNest(0, 2, bp.id, 'M');
      addNest(1, 2, null, null);
      state.recBaseId = state.nests[0].id;
      renderAll();
    }, cols);
    await m.waitForTimeout(350);
    sweep.push(await m.evaluate(c => {
      const d = document.querySelector('#board .nest.fillable');
      if (!d) return { cols: c, ok: false, why: 'no-fillable' };
      const inner = d.querySelector('.empty-in');
      const dr = d.getBoundingClientRect(), ir = inner.getBoundingClientRect();
      return {
        cols: c, cell: Math.round(dr.width), txt: inner.innerText.replace(/\s+/g, ' '),
        hOver: inner.scrollWidth - inner.clientWidth,
        vClip: d.scrollHeight - d.clientHeight,
        centering: +Math.abs((ir.top - dr.top) - (dr.bottom - ir.bottom)).toFixed(1)
      };
    }, cols));
  }
  console.log('    手机扫描：', JSON.stringify(sweep));
  check('手机各列数都有「可补位」提示', sweep.every(s => s.ok !== false && /可补位/.test(s.txt)), sweep);
  check('手机「可补位」不溢出/不裁切', sweep.every(s => s.ok !== false && s.hOver <= 1 && s.vClip <= 1), sweep);
  check('手机空窝内容仍垂直居中', sweep.every(s => s.ok !== false && s.centering < 3), sweep);

  console.log('\n=== 非 2xx 响应 ===');
  if (bad.length) bad.forEach(b => console.log('  ' + b)); else console.log('  （无）');
  console.log('=== 运行时错误 ===');
  if (errors.length) errors.forEach(e => console.log('  ' + e)); else console.log('  （无）');
  check('全站 pageerror / console.error 为 0', errors.length === 0, errors.slice(0, 5));
  const realBad = bad.filter(u => !/favicon\.ico/.test(u));
  check('无非 favicon 的 4xx/5xx 资源', realBad.length === 0, realBad.slice(0, 5));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('崩溃:', e); process.exit(2); });
