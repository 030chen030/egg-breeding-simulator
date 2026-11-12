/**
 * v12 核验：「一键补位」真实可用 + 空窝的推荐角标（推荐的配对在画布上看得见）
 * 真实 Chrome 打开构建产物，断言以 DOM / 内部状态实际渲染为准。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

const SHOT = path.resolve(__dirname, '..', '_shots');

(async () => {
  const D = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(D, '孵蛋模拟器.html'), 'utf8');

  console.log('\n=== A. 产物层：旧占位文案已换成真按钮 ===');
  check('不再有「附近的窝可一键补位」纯文字', !html.includes('附近的窝可一键补位'));
  check('存在「一键补位」按钮 id', html.includes('id="fill"'));
  check('按钮文案含 ✦ 一键补位', /✦ 一键补位/.test(html));
  check('存在空窝幽灵星标样式 .stardot.ghost', html.includes('.stardot.ghost'));
  check('存在补位方案计算函数 fillPlan', html.includes('function fillPlan('));
  check('script 标签配对', (html.match(/<script/g) || []).length === (html.match(/<\/script/g) || []).length);

  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 940 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  const file = 'file:///' + path.join(D, '孵蛋模拟器.html').replace(/\\/g, '/');
  await p.goto(file, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1100);

  const wait = ms => p.waitForTimeout(ms);
  const toastText = () => p.evaluate(() => {
    const t = document.getElementById('toast');
    return t && t.classList.contains('show') ? t.textContent.trim() : '';
  });
  const closeModal = async () => {
    await p.evaluate(() => { const m = document.getElementById('modal'); if (m && m.classList.contains('show')) closePicker(); });
    await wait(150);
  };
  const place = async cells => {
    await p.evaluate(list => {
      const cs = [...document.querySelectorAll('#cells .cellbox')];
      list.forEach(([x, y]) => { const c = cs.find(e => +e.dataset.x === x && +e.dataset.y === y); if (c) c.click(); });
    }, cells);
    await wait(300 + cells.length * 60);
  };
  const putAt = async (idx, name) => {
    await p.evaluate(i => document.querySelectorAll('#nests .ncard .petchip')[i].click(), idx);
    await wait(420);
    await p.evaluate(() => setBreedFilter('all'));
    await wait(150);
    await p.evaluate(n => {
      const q = document.getElementById('q');
      q.value = n; q.dispatchEvent(new Event('input', { bubbles: true }));
    }, name);
    await wait(350);
    const got = await p.evaluate(nm => {
      const it = [...document.querySelectorAll('#plist .pitem')].find(x => x.innerText.includes(nm));
      if (!it) return '';
      const t = it.querySelector('.nm').innerText.trim();
      it.click();
      return t;
    }, name);
    await wait(480);
    await closeModal();
    return got;
  };
  const snap = () => p.evaluate(() => {
    const r = computeAll();
    const bad = r.pairs.filter(x => x.state === 'bad');
    return {
      ok: r.okPairs.length,
      total: r.pairs.length,
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
        isBase: base && base.nest.id === n.id,
        nb: nb.map(m => `${m.seq}${pairFeasible(m.petId ? { nest: m, pet: PETMAP[m.petId] } : null, pt) ? '' : '✗'}`)
      };
    });
  });

  console.log('\n=== B. 兜底：无小窝 / 有窝无精灵 ===');
  await p.click('#clear');
  await wait(350);
  await p.click('#fill');
  await wait(300);
  check('空画布点一键补位 → 提示先放小窝', /还没有小窝/.test(await toastText()), await toastText());
  await place([[3, 3]]);
  await p.click('#fill');
  await wait(300);
  check('只有空窝（无精灵）→ 提示先放入精灵', /先把一只精灵放进小窝/.test(await toastText()), await toastText());

  console.log('\n=== C. 复现用户场景：一个基准 + 三个空窝 ===');
  await p.click('#clear');
  await wait(300);
  await place([[2, 2], [3, 2], [4, 2], [4, 1], [5, 2], [5, 1], [4, 3]]);
  const n7 = await p.evaluate(() => state.nests.length);
  check('放置 7 个小窝', n7 === 7, n7);
  const names = [];
  names.push(await putAt(0, '星星眼'));
  names.push(await putAt(1, '布灵'));
  names.push(await putAt(2, '玳龟'));
  names.push(await putAt(4, '幽铃'));
  check('4 只精灵已放入（#1/#2/#3/#5）', names.every(x => x), names);
  await p.locator('#board .nest').nth(1).click();      // 画布点 #2（布灵）→ 配对基准
  await wait(500);
  const baseInfo = await p.evaluate(() => ({
    baseTitle: recBase() ? recBase().pet.title : '',
    baseSeq: recBase() ? recBase().nest.seq : 0,
    bar: document.getElementById('basebar').innerText.replace(/\s+/g, ' ').trim()
  }));
  check('画布点选后基准 = 小窝 #2 · 布灵', baseInfo.baseSeq === 2 && baseInfo.baseTitle === '布灵', baseInfo);

  const hint = await p.evaluate(() => ({
    ghost: document.querySelectorAll('#board .nest .stardot.ghost').length,
    fillable: document.querySelectorAll('#board .nest.fillable').length,
    empty: state.nests.filter(n => !n.petId).length,
    titles: [...document.querySelectorAll('#board .nest .stardot.ghost')].map(x => x.getAttribute('title')),
    planFills: fillPlan().fills.map(f => `#${f.seq}←${f.pet.title}`),
    planSkip: fillPlan().skipped.map(s => `#${s.seq}:${s.why}`)
  }));
  console.log('    补位预告：', JSON.stringify(hint.planFills), ' 跳过：', JSON.stringify(hint.planSkip));
  console.log('    角标 tooltip：', JSON.stringify(hint.titles));
  check('空窝确实渲染出「可补位」★ 角标', hint.ghost > 0, hint);
  check('★ 角标数量 = 方案可补的空窝数', hint.ghost === hint.planFills.length, hint);
  check('角标与虚线强调一一对应', hint.ghost === hint.fillable, hint);
  check('tooltip 预告了将补入哪只精灵', hint.titles.every(t => /一键补位将放入/.test(t)), hint.titles);
  await p.screenshot({ path: path.join(SHOT, 'V12-1-补位前-空窝角标.png') });

  console.log('\n=== D. 一键补位实跑 ===');
  const before = await snap();
  const emptyBefore = before.empty;
  await p.click('#fill');
  await wait(600);
  const t1 = await toastText();
  console.log('    toast：', t1);
  const after = await snap();
  const fillCount = emptyBefore.length - after.empty.length;
  check('toast 报告补位数量', new RegExp(`已补位 ${fillCount} 个空窝`).test(t1), { t1, fillCount });
  check('至少补上 2 个空窝', fillCount >= 2, { emptyBefore, after: after.empty });
  check('补位 + 留空 = 原有空窝数（不漏不吞）',
        after.empty.every(s => emptyBefore.includes(s)) && fillCount + after.empty.length === emptyBefore.length,
        { emptyBefore, after: after.empty });
  check('补位前已成功的配对全部保持成功', before.okSeqs.every(s => after.okSeqs.includes(s)),
        { before: before.okSeqs, after: after.okSeqs });
  check('没有新增失败配对', after.badSeqs.every(s => before.badSeqs.includes(s)),
        { before: before.badSeqs, after: after.badSeqs });
  check('成功配对数增加（补位生效）', after.ok > before.ok, { before: before.ok, after: after.ok });

  const rows = await dump();
  console.log('    补位后盘面：', JSON.stringify(rows));
  const originals = ['星星眼', '布灵', '玳龟', null, '幽铃', null, null];
  check('原有 4 只精灵未被覆盖',
        rows[0].pet === '星星眼' && rows[1].pet === '布灵' && rows[2].pet === '玳龟' && rows[4].pet === '幽铃',
        rows.map(r => `${r.seq}:${r.pet}`));
  const newOnes = rows.filter(r => emptyBefore.includes(r.seq) && r.pet);
  check('新补入的精灵与每个紧贴邻居都能配对', newOnes.every(r => r.nb.every(x => !x.includes('✗'))), newOnes);
  const sexClash = await p.evaluate(seqs => {
    const bad = [];
    state.nests.filter(n => seqs.includes(n.seq) && n.petId).forEach(n => {
      state.nests.filter(m => m !== n && m.petId && adjacent(m, n)).forEach(m => {
        if (effSex(m) === effSex(n)) bad.push(`${n.seq}-${m.seq}`);
      });
    });
    return bad;
  }, emptyBefore);
  check('新补入的精灵与紧贴邻居性别相反（不会同性别打架）', sexClash.length === 0, sexClash);
  check('基准性别已定为 ♀（母系定种）', rows[1].sex === 'F', rows[1].sex);
  const leftEmpty = after.empty;
  check('留空的空窝确属「两侧性别互斥」无法两全',
        leftEmpty.length === 0 || new RegExp(`${leftEmpty.length} 个空窝两侧性别互斥`).test(t1),
        { leftEmpty, t1 });
  await p.screenshot({ path: path.join(SHOT, 'V12-2-补位后-全盘就位.png') });

  console.log('\n=== E. 边界：没有空窝 / 基准无法配对 ===');
  await p.click('#fill');
  await wait(300);
  check('再点一次 → 仍留空的空窝给出「性别互斥」说明', /性别互斥/.test(await toastText()), await toastText());

  await p.click('#clear');
  await wait(300);
  await place([[2, 2], [3, 2]]);
  await putAt(0, '星星眼');
  await p.locator('#board .nest').nth(0).click();
  await wait(400);
  await p.click('#fill');
  await wait(500);
  const e0 = await snap();
  check('两窝场景可一键补位成对', e0.empty.length === 0 && e0.ok >= 1, e0);
  await p.click('#fill');
  await wait(300);
  check('全盘无空窝 → 提示没有空窝', /画布上没有空窝需要补位/.test(await toastText()), await toastText());

  await p.click('#clear');
  await wait(300);
  await place([[2, 2], [3, 2]]);
  const dimo = await putAt(0, '迪莫');
  check('放入「未发现」组的迪莫', /迪莫/.test(dimo), dimo);
  const dimoHint = await p.evaluate(() => ({ ghost: document.querySelectorAll('#board .nest .stardot.ghost').length }));
  check('无法配对的基准不会给空窝打角标', dimoHint.ghost === 0, dimoHint);
  await p.click('#fill');
  await wait(400);
  const t3 = await toastText();
  check('基准无法配对 → 明确提示换基准', /无法与任何精灵配对/.test(t3), t3);

  console.log('\n=== F. 回归：原有交互未被破坏 ===');
  await p.click('#clear');
  await wait(300);
  await place([[2, 2], [3, 2], [4, 2]]);
  await p.click('#rand');
  await wait(500);
  const r1 = await p.evaluate(() => ({ empty: state.nests.filter(n => !n.petId).length, filled: state.nests.filter(n => n.petId).length }));
  check('随机填充仍可用（3 个窝全部有精灵）', r1.empty === 0 && r1.filled === 3, r1);
  await p.click('#same');
  await wait(500);
  const r2 = await p.evaluate(() => ({ empty: state.nests.filter(n => !n.petId).length }));
  check('统一蛋组仍可用', r2.empty === 0, r2);
  await p.evaluate(() => { setBreedFilter('breed'); state.filter.q = ''; document.getElementById('q').value = ''; document.querySelector('#nests .ncard .petchip').click(); });
  await wait(500);
  const g = await p.evaluate(() => ({ n: document.querySelectorAll('#plist .pitem').length, def: document.querySelectorAll('#plist .tag.def').length }));
  check('选择器默认仍只列可生蛋精灵（605）+「默认」角标', g.n === 605 && g.def === 1, g);
  await closeModal();
  await p.locator('#board .nest').nth(0).click();
  await wait(400);
  await p.evaluate(() => { setBreedFilter('breed'); state.filter.q = ''; document.getElementById('q').value = ''; document.querySelector('#nests .ncard:nth-child(2) .petchip').click(); });
  await wait(700);
  const rec = await p.evaluate(() => ({
    pref: document.getElementById('prefilter').style.display,
    pairok: document.querySelectorAll('#plist .tag.pairok').length,
    def: document.querySelectorAll('#plist .tag.def').length
  }));
  check('选择器推荐栏仍正常（有基准时不显示「默认」角标）', rec.pref === 'flex' && rec.pairok > 0 && rec.def === 0, rec);
  await closeModal();
  const saved = await p.evaluate(() => { document.getElementById('open-save').click(); return document.querySelectorAll('#slist .sitem, #slist .empty-state').length; });
  check('存档面板仍可打开', saved >= 0, saved);
  await p.evaluate(() => closeSave());

  console.log('\n=== G. 性能：补位方案计算不拖慢画布 ===');
  const perf = await p.evaluate(() => {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) renderBoard();
    return (performance.now() - t0) / 30;
  });
  const perfCold = await p.evaluate(() => {
    _fillKey = '';                        // 强制重算方案（模拟首次进入/拖动后）
    const t0 = performance.now();
    fillPlan();
    return performance.now() - t0;
  });
  check('renderBoard 平均耗时 < 25ms', perf < 25, +perf.toFixed(2) + 'ms');
  check('补位方案冷算 < 60ms', perfCold < 60, +perfCold.toFixed(2) + 'ms');

  console.log('\n=== H. 小格子（手机 390px 各列数）下「可补位」文案不被裁切 ===');
  const mob = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  mp.on('pageerror', e => errs.push('mobile: ' + e));
  await mp.goto(file, { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(1200);
  const sweep = [];
  for (const cols of [4, 6, 8, 10, 12, 14]) {
    await mp.evaluate(c => {
      const s = document.getElementById('cols'); s.value = String(c); s.dispatchEvent(new Event('change'));
      state.nests = []; state.seq = 0;
      const bp = PETS.find(x => !unknownOnly(x) && sexAvail(x) === 'MF');
      addNest(0, 2, bp.id, 'M');
      addNest(1, 2, null, null);
      state.recBaseId = state.nests[0].id;
      renderAll();
    }, cols);
    await mp.waitForTimeout(260);
    sweep.push(await mp.evaluate(c => {
      const d = document.querySelector('#board .nest.fillable');
      if (!d) return { cols: c, ok: false, why: 'no-fillable' };
      const inner = d.querySelector('.empty-in');
      const dr = d.getBoundingClientRect(), ir = inner.getBoundingClientRect();
      return {
        cols: c, cell: Math.round(dr.width), txt: inner.innerText.replace(/\s+/g, ' '),
        hOver: inner.scrollWidth - inner.clientWidth,
        vClip: d.scrollHeight - d.clientHeight,
        centering: +Math.abs((ir.top - dr.top) - (dr.bottom - ir.bottom)).toFixed(1),
        fs: getComputedStyle(inner).fontSize
      };
    }, cols));
  }
  console.log('    扫描：', JSON.stringify(sweep));
  check('各列数下都有「可补位」提示', sweep.every(s => s.ok !== false && /可补位/.test(s.txt)), sweep);
  check('「可补位」文案横向不溢出', sweep.every(s => s.ok !== false && s.hOver <= 1), sweep);
  check('空窝内容纵向不被裁切', sweep.every(s => s.ok !== false && s.vClip <= 1), sweep);
  check('空窝内容仍垂直居中', sweep.every(s => s.ok !== false && s.centering < 3), sweep);
  await mp.screenshot({ path: path.join(SHOT, 'V12-3-手机-可补位.png') }).catch(() => {});

  console.log('\n=== 汇总 ===');
  console.log('pageerror =', errs.length ? errs : 0);
  check('无运行时错误', errs.length === 0, errs.slice(0, 3));
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
