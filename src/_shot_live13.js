/**
 * v13 线上核验：筛选芯片「大类别 / 具体分类」两套配色是否生效 + v12 功能无回归
 * 运行：NODE_PATH="C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules" node _shot_live13.js
 */
const { chromium } = require('playwright-core');

const BASE = 'https://egg-breeding-simulator.app.workbuddy.link/?sharecode=4AJ6XLOWU4';
const MOB = 'https://egg-breeding-simulator-mobile.app.workbuddy.link/app.html?sharecode=SPTZANPTGU';

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

const isGray = c => /rgb\((229, 233, 242|241, 243, 248)\)/.test(c);
const isAccentBg = c => /rgb\(238, 240, 254\)/.test(c);
const isAccentBd = c => /rgb\(79, 70, 229\)/.test(c);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const bad = [];

  console.log('\n=== A. 电脑版主页 ===');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 980 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('desktop: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('desktop-console: ' + m.text()); });
  p.on('requestfailed', r => errors.push('desktop-reqfailed: ' + r.url() + ' :: ' + (r.failure() || {}).errorText));
  p.on('response', r => { if (r.status() >= 400) bad.push('[desktop] ' + r.status() + ' ' + r.url()); });

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  const wait = ms => p.waitForTimeout(ms);

  const A = await p.evaluate(() => ({
    hasFill: !!(document.getElementById('fill')),
    fillText: (document.getElementById('fill') || {}).textContent || '',
    hasTrack: typeof window.Track !== 'undefined',
    chips: [...document.querySelectorAll('.fchip')].map(c => ({ t: c.textContent.replace(/\s+/g, ' ').trim(), on: c.classList.contains('on'), b: c.dataset.b, s: c.dataset.s })),
    nests: document.querySelectorAll('#nests .ncard').length,
    ok: (document.getElementById('s-ok') || {}).textContent
  }));
  check('v12 一键补位按钮仍在线上', A.hasFill && /✦ 一键补位/.test(A.fillText), A.fillText);
  check('埋点仍为零', !A.hasTrack, A.hasTrack);
  const bchip = A.chips.find(c => c.b === 'breed');
  check('「可生蛋」默认 ON 且计数 605', !!(bchip && bchip.on && /605/.test(bchip.t)), bchip);
  check('初始 3 窝且有成功配对', A.nests === 3 && +A.ok >= 1, A);

  console.log('\n=== B. 筛选芯片两套配色（线上） ===');
  await p.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await wait(800);
  await p.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
  });
  await wait(500);

  const read = () => p.evaluate(() => {
    const pick = sel => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const cs = getComputedStyle(e);
      return { t: e.innerText.replace(/\s+/g, ' ').trim(), bg: cs.backgroundColor, bd: cs.borderTopColor, fg: cs.color };
    };
    return {
      allGroup: pick('#gfilters .fchip[data-g="all"]'),
      allSex: pick('.fchip[data-s="all"]'),
      allBreed: pick('.fchip[data-b="all"]'),
      allSrc: pick('#nfilters .fchip[data-n="all"]'),
      breed: pick('.fchip[data-b="breed"]')
    };
  });

  const S = await read();
  ['allGroup', 'allSex', 'allBreed', 'allSrc', 'breed'].forEach(k => {
    if (S[k]) console.log(`    ${k.padEnd(9)} 「${S[k].t}」 bg=${S[k].bg} bd=${S[k].bd}`);
  });
  check('大类「全部蛋组」选中为灰蓝底', isGray(S.allGroup.bg), S.allGroup.bg);
  check('大类「全部性别」选中为灰蓝底', isGray(S.allSex.bg), S.allSex.bg);
  check('大类「全部来源」选中为灰蓝底', isGray(S.allSrc.bg), S.allSrc.bg);
  check('大类选中描边不是靛蓝', !isAccentBd(S.allGroup.bd), S.allGroup.bd);
  check('分类「可生蛋」选中仍为靛蓝底 + 靛蓝描边', isAccentBg(S.breed.bg) && isAccentBd(S.breed.bd), S.breed);
  check('大类与分类选中底色确实不同（可分）', S.allGroup.bg !== S.breed.bg, { a: S.allGroup.bg, b: S.breed.bg });
  check('未选中大类有浅灰底（仍可与分类区分）', isGray(S.allBreed.bg), S.allBreed.bg);

  // 点一个具体蛋组 → 应变成靛蓝，同时「全部蛋组」回浅灰
  await p.evaluate(() => document.querySelector('#gfilters .fchip[data-g]:not([data-g="all"])').click());
  await wait(600);
  const S2 = await read();
  console.log('    点具体蛋组后：');
  console.log(`      具体蛋组 bg=${await p.evaluate(() => getComputedStyle(document.querySelector('#gfilters .fchip.on')).backgroundColor)}`);
  console.log(`      全部蛋组 bg=${S2.allGroup.bg}`);
  check('选中的具体分类变靛蓝', isAccentBg(await p.evaluate(() => getComputedStyle(document.querySelector('#gfilters .fchip.on')).backgroundColor)), S2);
  check('同类大类别自动回浅灰', isGray(S2.allGroup.bg), S2.allGroup.bg);

  // 筛选交互未被破坏：点「全部精灵」放宽后应有结果（未发现+可生蛋 交集本就是空集）
  const cnt = await p.evaluate(() => (document.getElementById('m-count') || {}).textContent || '');
  console.log('    m-count（未发现+可生蛋，预期 0） =', cnt);
  check('互斥条件交集为 0 只（筛选逻辑正常）', /0 只/.test(cnt), cnt);
  await p.evaluate(() => setBreedFilter('all'));
  await wait(400);
  const listed = await p.evaluate(() => document.querySelectorAll('#plist .pitem').length);
  console.log('    放宽为「全部精灵」后 =', listed, '只');
  check('放宽后列表恢复非空', listed > 0, listed);
  await p.evaluate(() => closePicker());
  await wait(300);

  console.log('\n=== C. v12 一键补位回归（线上） ===');
  await p.click('#clear'); await wait(500);
  await p.evaluate(() => {
    const cs = [...document.querySelectorAll('#cells .cellbox')];
    [[2, 2], [3, 2], [4, 2], [4, 1], [5, 2], [5, 1], [4, 3]].forEach(([x, y]) => {
      const c = cs.find(e => +e.dataset.x === x && +e.dataset.y === y); if (c) c.click();
    });
  });
  await wait(800);
  await p.evaluate(() => { setBreedFilter('all'); });
  await wait(200);
  const put = async (idx, name) => {
    await p.evaluate(i => document.querySelectorAll('#nests .ncard .petchip')[i].click(), idx);
    await wait(600);
    // 关键：筛选条件跨次打开选择器会保留，每次先归零（蛋组/来源/性别/可生蛋/关键词）
    await p.evaluate(() => {
      const hit = sel => { const e = document.querySelector(sel); if (e) e.click(); };
      hit('#gfilters .fchip[data-g="all"]');
      hit('#nfilters .fchip[data-n="all"]');
      hit('.fchip[data-s="all"]');
      setBreedFilter('all');
    });
    await wait(400);
    await p.evaluate(n => { const q = document.getElementById('q'); q.value = n; q.dispatchEvent(new Event('input', { bubbles: true })); }, name);
    await wait(450);
    const got = await p.evaluate(nm => {
      const it = [...document.querySelectorAll('#plist .pitem')].find(x => x.innerText.includes(nm));
      if (!it) return ''; it.click(); return it.querySelector('.nm').innerText.trim();
    }, name);
    await wait(600);
    await p.evaluate(() => { const m = document.getElementById('modal'); if (m && m.classList.contains('show')) closePicker(); });
    await wait(250);
    return got;
  };
  const names = [];
  names.push(await put(0, '星星眼'));
  names.push(await put(1, '布灵'));
  names.push(await put(2, '玳龟'));
  names.push(await put(4, '幽铃'));
  check('4 只精灵已放入', names.every(x => x), names);
  await p.locator('#board .nest').nth(1).click();
  await wait(600);
  const before = await p.evaluate(() => {
    const r = computeAll();
    return { ok: r.okPairs.length, bad: r.pairs.filter(x => x.state === 'bad').length, empty: state.nests.filter(n => !n.petId).length };
  });
  await p.click('#fill'); await wait(800);
  const t1 = await p.evaluate(() => { const t = document.getElementById('toast'); return t && t.classList.contains('show') ? t.textContent.trim() : ''; });
  const after = await p.evaluate(() => {
    const r = computeAll();
    return { ok: r.okPairs.length, bad: r.pairs.filter(x => x.state === 'bad').length, empty: state.nests.filter(n => !n.petId).length };
  });
  console.log('    toast：', t1);
  check('补位生效（空窝减少）', after.empty < before.empty, { before: before.empty, after: after.empty });
  check('未新增失败配对', after.bad <= before.bad, { before: before.bad, after: after.bad });
  check('成功配对数增加', after.ok > before.ok, { before: before.ok, after: after.ok });

  console.log('\n=== D. 响应式 ===');
  for (const w of [1440, 1280, 1024, 820]) {
    await p.setViewportSize({ width: w, height: 900 });
    await wait(300);
    const ovf = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`无横向溢出 @${w}px`, ovf <= 1, ovf);
  }

  console.log('\n=== E. 手机版 ===');
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('mobile: ' + e.message));
  mp.on('console', x => { if (x.type() === 'error') errors.push('mobile-console: ' + x.text()); });
  mp.on('response', r => { if (r.status() >= 400) bad.push('[mobile] ' + r.status() + ' ' + r.url()); });
  await mp.goto(MOB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mp.waitForTimeout(2500);
  await mp.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await mp.waitForTimeout(800);
  await mp.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
  });
  await mp.waitForTimeout(500);
  const M = await mp.evaluate(() => {
    const pick = sel => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { bg: cs.backgroundColor, bd: cs.borderTopColor }; };
    return {
      fill: !!(document.getElementById('fill')),
      track: typeof window.Track !== 'undefined',
      allGroup: pick('#gfilters .fchip[data-g="all"]'),
      breed: pick('.fchip[data-b="breed"]'),
      ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  console.log('    手机：全部蛋组 bg=' + M.allGroup.bg + ' | 可生蛋 bg=' + M.breed.bg);
  check('手机版一键补位按钮在位', M.fill, M.fill);
  check('手机版埋点为零', !M.track, M.track);
  check('手机版大类为灰蓝', isGray(M.allGroup.bg), M.allGroup);
  check('手机版分类为靛蓝', isAccentBg(M.breed.bg) && isAccentBd(M.breed.bd), M.breed);
  check('手机版无横向溢出', M.ovf <= 1, M.ovf);
  await mp.screenshot({ path: require('path').resolve(__dirname, '..', '_shots', 'V13-线上-手机.png') }).catch(() => {});

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
