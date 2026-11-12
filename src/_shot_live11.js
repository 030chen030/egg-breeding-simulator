/* 线上真浏览器核验（v11 发布后）
 * 检查：埋点彻底消失、v11 可生蛋规则生效、页脚文案、运行时零报错
 * 运行：NODE_PATH=".../node_modules" node _shot_live11.js
 */
const { chromium } = require('playwright-core');

const BASE = 'https://egg-breeding-simulator.app.workbuddy.link/?sharecode=4AJ6XLOWU4';
const MOB = 'https://egg-breeding-simulator-mobile.app.workbuddy.link/app.html?sharecode=SPTZANPTGU';
const PANEL = 'https://egg-breeding-simulator.app.workbuddy.link/panel/?sharecode=4AJ6XLOWU4';

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '  ->  ' + JSON.stringify(extra)); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const bad = [];

  // ── A. 电脑版
  console.log('\n=== A. 电脑版主页 ===');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('desktop: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('desktop-console: ' + m.text() + ' @ ' + JSON.stringify(m.location())); });
  p.on('requestfailed', r => errors.push('desktop-reqfailed: ' + r.url() + ' :: ' + (r.failure() || {}).errorText));
  p.on('response', r => { if (r.status() >= 400) bad.push('[desktop] ' + r.status() + ' ' + r.url()); });

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(1800);

  const A = await p.evaluate(() => {
    const chips = [...document.querySelectorAll('.fchip')].map(c => ({
      t: c.textContent.replace(/\s+/g, ' ').trim(), on: c.classList.contains('on'), b: c.dataset.b
    }));
    const foot = document.querySelector('footer') ? document.querySelector('footer').innerText.replace(/\s+/g, ' ') : '';
    return {
      hasTrack: typeof window.Track !== 'undefined',
      trkKeys: Object.keys(localStorage).filter(k => /^trk\./.test(k)),
      chips,
      foot,
      nests: document.querySelectorAll('#nests .ncard').length,
      ok: (document.getElementById('s-ok') || {}).textContent,
      nestTexts: [...document.querySelectorAll('#nests .ncard')].map(c => c.innerText.replace(/\s+/g, ' ')),
      trackCfg: !!document.getElementById('track-config'),
      appVerMeta: !!document.querySelector('meta[name="app-version"]')
    };
  });
  check('window.Track 已移除', !A.hasTrack, A.hasTrack);
  check('track-config 块已移除', !A.trackCfg, A.trackCfg);
  check('app-version meta 已移除', !A.appVerMeta, A.appVerMeta);
  check('localStorage 无 trk.* 残留', A.trkKeys.length === 0, A.trkKeys);
  check('初始 3 个小窝', A.nests === 3, A.nests);
  check('页脚含「光环助手整理发布」', A.foot.includes('光环助手整理发布'), A.foot);
  check('页脚含数据来源 WIKI', A.foot.includes('洛克王国世界 WIKI'), A.foot);
  check('存在「可生蛋」筛选芯片', A.chips.some(c => c.b === 'breed'), A.chips);
  const bchip = A.chips.find(c => c.b === 'breed');
  check('「可生蛋」为默认 ON', !!(bchip && bchip.on), bchip);
  check('「可生蛋」芯片带计数 605', !!(bchip && /605/.test(bchip.t)), bchip && bchip.t);
  check('初始精灵无「未发现」标签', A.nestTexts.every(t => !t.includes('未发现')), A.nestTexts);
  check('初始即可生蛋（配对数 ≥1）', +A.ok >= 1, A.ok);

  // 打开小窝选择器，验证默认精灵不是不可生蛋的迪莫
  // 关键：先「清空」再放一个空窝，才是「小窝入口的初始状态」（无配对基准、无搜索）
  await p.click('#clear');
  await wait(300);
  await p.evaluate(() => { const c = [...document.querySelectorAll('#cells .cellbox')].find(x => !x.querySelector('.nest')); if (c) c.click(); });
  await wait(400);
  await p.evaluate(() => document.querySelector('#nests .ncard:nth-child(1) .petchip').click());
  await wait(700);
  const B = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#plist .pitem')];
    const first = items[0];
    const selCls = n => [...n.classList].join('.');
    return {
      n: items.length,
      firstName: first ? first.querySelector('.nm').textContent.trim() : '',
      firstBad: first ? !!first.querySelector('.tag.bad') : null,
      firstDef: first ? !!first.querySelector('.tag.def') : null,
      defCount: document.querySelectorAll('#plist .tag.def').length,
      unknownCount: document.querySelectorAll('#plist .tag.bad').length,
      mcount: (document.getElementById('m-count') || {}).textContent || '',
      prefShown: (() => { const e = document.getElementById('prefilter'); return e ? getComputedStyle(e).display : 'none'; })(),
      nestsCls: [...document.querySelectorAll('#nests .ncard')].map(selCls),
      head: items.slice(0, 4).map(x => x.querySelector('.nm').textContent.trim())
    };
  });
  console.log('  info   m-count = ' + B.mcount);
  console.log('  info   prefilter = ' + B.prefShown + ' | nests = ' + JSON.stringify(B.nestsCls));
  console.log('  info   前 4 项 = ' + JSON.stringify(B.head));
  check('选择器默认只列可生蛋（605 项）', B.n === 605, B.n);
  check('选择器无「未发现」项', B.unknownCount === 0, B.unknownCount);
  check('首项为可生蛋精灵（非迪莫）', B.firstName && !B.firstBad, B.firstName);
  check('首项标「默认」角标', B.firstDef === true, B);
  check('仅一个「默认」角标', B.defCount === 1, B.defCount);
  console.log('  info   首项 = ' + B.firstName);

  // 有基准时默认角标消失：给窝1 放入首项精灵（建立配对基准）→ 再加一个空窝 → 打开窝2 的选择器
  const c1 = await p.evaluate(() => {
    const it = document.querySelector('#plist .pitem');
    if (!it) return 'no-pitem';
    it.click();
    return 'placed:' + it.querySelector('.nm').textContent.trim();
  });
  await wait(600);
  const c2 = await p.evaluate(() => ({
    nests: document.querySelectorAll('#nests .ncard').length,
    modalOpen: document.getElementById('modal').classList.contains('show'),
    cells: document.querySelectorAll('#cells .cellbox').length,
    empties: [...document.querySelectorAll('#cells .cellbox')].filter(x => !x.querySelector('.nest')).length
  }));
  console.log('  info   C1 = ' + c1 + ' | C2 = ' + JSON.stringify(c2));
  const c3 = await p.evaluate(() => {
    // #cells 是网格背景层，#nests 是窝层；两套 DOM 分离，「格子里有没有窝」无法直接判断。
    // 窝按顺序落在靠前的格子，所以点最后一个格子必定是空位。
    const cs = [...document.querySelectorAll('#cells .cellbox')];
    if (!cs.length) return 'no-cell';
    const last = cs[cs.length - 1];
    last.click();
    return 'clicked-last-of-' + cs.length;
  });
  await wait(500);
  const c4 = await p.evaluate(() => ({
    nests: document.querySelectorAll('#nests .ncard').length,
    petchips: document.querySelectorAll('#nests .ncard .petchip').length
  }));
  console.log('  info   C3 = ' + c3 + ' | C4 = ' + JSON.stringify(c4));
  await p.evaluate(() => { const e = document.querySelector('#nests .ncard:nth-child(2) .petchip'); if (e) e.click(); });
  await wait(700);
  const C = await p.evaluate(() => ({
    defCount: document.querySelectorAll('#plist .tag.def').length,
    n: document.querySelectorAll('#plist .pitem').length,
    mcount: (document.getElementById('m-count') || {}).textContent || '',
    prefShown: (() => { const e = document.getElementById('prefilter'); return e ? getComputedStyle(e).display : 'none'; })()
  }));
  console.log('  info   有基准 m-count = ' + C.mcount);
  check('有配对基准时不显示「默认」角标', C.defCount === 0, C.defCount);
  check('有基准时仍只列可生蛋', C.n <= 605, C.n);
  check('有基准时推荐栏正常显示', C.prefShown === 'flex', C.prefShown);
  await p.evaluate(() => { const b = document.querySelector('[data-close]'); if (b) b.click(); });
  await wait(300);

  // 响应式布局快速扫描
  for (const w of [1440, 1280, 1024, 820]) {
    await p.setViewportSize({ width: w, height: 900 });
    await wait(200);
    const ovf = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`无横向溢出 @${w}px`, ovf <= 1, ovf);
  }

  // ── D. 数据面板（应已下线）
  console.log('\n=== D. 数据面板 /panel/ ===');
  const pd = await ctx.newPage();
  pd.on('pageerror', e => errors.push('panel: ' + e.message));
  await pd.goto(PANEL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(500);
  const D = await pd.evaluate(() => ({
    title: document.title,
    h1: (document.querySelector('h1') || {}).textContent || '',
    hasTrack: typeof window.Track !== 'undefined',
    trkKeys: Object.keys(localStorage).filter(k => /^trk\.|trackpanel/.test(k)),
    hasKpi: !!document.querySelector('.kpi, .kpis, [data-kpi]')
  }));
  check('面板标题为「页面已下线」', /页面已下线/.test(D.title), D.title);
  check('无面板 KPI 卡片', !D.hasKpi, D.hasKpi);
  check('面板页无埋点脚本', !D.hasTrack, D.hasTrack);
  check('面板页无 trk./trackpanel 存储键', D.trkKeys.length === 0, D.trkKeys);

  // ── E. 手机版
  console.log('\n=== E. 手机版 app.html ===');
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const m = await mctx.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e.message));
  m.on('console', x => { if (x.type() === 'error') errors.push('mobile-console: ' + x.text()); });
  m.on('response', r => { if (r.status() >= 400) bad.push('[mobile] ' + r.status() + ' ' + r.url()); });
  await m.goto(MOB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(1800);
  const E = await m.evaluate(() => {
    const chips = [...document.querySelectorAll('.fchip')].map(c => ({ b: c.dataset.b, on: c.classList.contains('on') }));
    return {
      hasTrack: typeof window.Track !== 'undefined',
      trkKeys: Object.keys(localStorage).filter(k => /^trk\./.test(k)),
      breOn: !!(chips.find(c => c.b === 'breed') || {}).on,
      nests: document.querySelectorAll('#nests .ncard').length,
      nestTexts: [...document.querySelectorAll('#nests .ncard')].map(c => c.innerText.replace(/\s+/g, ' ')),
      ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  check('手机版无埋点', !E.hasTrack && E.trkKeys.length === 0, E);
  check('手机版「可生蛋」默认 ON', E.breOn, E);
  check('手机版初始精灵无「未发现」', E.nestTexts.every(t => !t.includes('未发现')), E.nestTexts);
  check('手机版无横向溢出', E.ovf <= 1, E.ovf);
  check('手机版小窝数正常', E.nests >= 3, E.nests);

  // ── 总结
  console.log('\n=== 非 2xx 响应 ===');
  if (bad.length) bad.forEach(b => console.log('  ' + b));
  else console.log('  （无）');
  console.log('\n=== 运行时错误 ===');
  if (errors.length) errors.forEach(e => console.log('  ' + e));
  else console.log('  （无）');
  check('全站 pageerror / console.error 为 0', errors.length === 0, errors.slice(0, 5));
  // 只有 favicon 缺失可接受，其余 404 视为问题
  const realBad = bad.filter(u => !/favicon\.ico/.test(u));
  check('无非 favicon 的 4xx/5xx 资源', realBad.length === 0, realBad.slice(0, 5));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('崩溃:', e); process.exit(2); });
