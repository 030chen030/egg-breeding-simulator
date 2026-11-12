/**
 * v14 线上专项核验（真实 Chrome，直连带 sharecode 的线上地址）
 * 目的：确认「S5 圣龙宝藏」确实部署到了线上，而不是只改了本地。
 * 覆盖：数据 / 配对规则 / 筛选芯片 / 徽章配色 / 头像 / 信息条 / 桌面与手机溢出 / 零报错
 * 注意：线上脚本的数量断言只在「发布后」改；线上仍跑旧版时会误报，属预期。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

const D = path.resolve(__dirname, '..');
const SHOT = path.join(D, '_shots');
const DESK = 'https://egg-breeding-simulator.app.workbuddy.link/?sharecode=4AJ6XLOWU4';
const MOB = 'https://egg-breeding-simulator-mobile.app.workbuddy.link/app.html?sharecode=SPTZANPTGU';
const S5_BASE = ['乐乐鲨', '蛋包蛋', '蟹蟹椰', '鲸羽', '豆粒鹅', '西瓜虫', '小剪影', '滴溜豚'];

(async () => {
  if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 980 } });
  const errs = [], bad = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(r.status() + ' ' + r.url()); });

  const resp = await p.goto(DESK, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2600);   // CDN 首屏比本地 file:// 慢
  const wait = ms => p.waitForTimeout(ms);

  console.log('\n=== A. 线上入口 ===');
  check('电脑版 HTTP 200', !!resp && resp.status() === 200, resp && resp.status());
  const html = await p.evaluate(() => document.documentElement.outerHTML);
  check('线上产物含 S5 赛季数据', html.includes('圣龙宝藏') && html.includes('乐乐鲨') && /\.tag\.enc\.s5\{/.test(html));
  check('线上产物含动态数量占位', html.includes('id="hero-total"') && html.includes('id="hero-groups"'));
  check('线上不再是旧版 621 只文案', !/621 只精灵 \/ 15 个蛋组/.test(html));

  console.log('\n=== B. 数据层 ===');
  const d = await p.evaluate(() => {
    const s5 = PETS.filter(x => x.season === 'S5');
    const meta = (DB.seasons || []).find(s => s.id === 'S5') || {};
    return {
      total: PETS.length, groups: DB.groups.length,
      seasons: DB.seasons.length, seasonIds: DB.seasons.map(s => s.id),
      meta, s5n: s5.length,
      base: s5.filter(x => x.role === 'encounter').length,
      evo: s5.filter(x => x.role === 'evolution').length,
      baseNames: s5.filter(x => x.role === 'encounter').map(x => x.name),
      allCanBreed: s5.every(canBreed),
      breedPool: BREED_POOL_N,
      unknown: PETS.filter(unknownOnly).length,
      withIcon: s5.filter(x => ICONS[x.id]).length,
      hero: [document.getElementById('hero-total').textContent, document.getElementById('hero-groups').textContent],
    };
  });
  console.log('    ', JSON.stringify({ total: d.total, seasons: d.seasons, s5n: d.s5n, breedPool: d.breedPool, unknown: d.unknown }));
  check('线上精灵总数 662', d.total === 662, d.total);
  check('蛋组 15 / 页首数字动态一致', d.groups === 15 && d.hero[0] === '662' && d.hero[1] === '15', d.hero);
  check('线上赛季 5 个（S1~S5）', d.seasons === 5 && d.seasonIds.join(',') === 'S1,S2,S3,S4,S5', d.seasonIds);
  check('S5 元数据：圣龙宝藏 / 17 只 / 基础 8', d.meta.label === '圣龙宝藏' && d.meta.count === 17 && d.meta.baseCount === 8, d.meta);
  check('S5 专属道具留空（不臆造）', d.meta.ball === '' || d.meta.ball == null, d.meta.ball);
  check('S5 地点 = 圣龙乐园', /圣龙乐园/.test(d.meta.location || ''), d.meta.location);
  check('S5 标记 17 = 基础 8 + 进化 9', d.s5n === 17 && d.base === 8 && d.evo === 9, [d.s5n, d.base, d.evo]);
  check('8 只基础与官方公告一致', S5_BASE.every(n => d.baseNames.includes(n)), d.baseNames);
  check('17 只 S5 全部可生蛋', d.allCanBreed);
  check('17 只 S5 头像齐全', d.withIcon === 17, d.withIcon);
  check('可生蛋 605 / 未发现组 57', d.breedPool === 605 && d.unknown === 57, [d.breedPool, d.unknown]);

  console.log('\n=== C. 配对规则（线上实跑） ===');
  const pairs = await p.evaluate(() => {
    const find = n => PETS.find(x => x.name === n);
    const mk = (pet, sex, x) => ({ x, y: 0, petId: pet.id, sex });
    const run = (n1, n2) => {
      const a = find(n1), c = find(n2);
      if (!a || !c) return 'missing';
      return evaluatePair(mk(a, 'M', 0), mk(c, 'F', 1)).state;
    };
    return {
      sameGroup: run('乐乐鲨', '云梦豚'),
      diffGroup: run('乐乐鲨', '喵喵'),
      s5pair: run('蛋包蛋', '鸡麻麻'),
      legendPair: run('小冥龙', '云梦豚'),
    };
  });
  console.log('    ', JSON.stringify(pairs));
  check('S5 与同组配对成功', pairs.sameGroup === 'ok', pairs);
  check('S5 基础与进化形态配对成功', pairs.s5pair === 'ok', pairs);
  check('异组仍判失败（规则未破坏）', pairs.diffGroup === 'bad', pairs);
  check('传说精灵（未发现组）仍判失败', pairs.legendPair === 'bad', pairs);

  console.log('\n=== D. 界面层 ===');
  await p.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await wait(800);
  await p.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
  });
  await wait(450);
  const chips = await p.evaluate(() => [...document.querySelectorAll('#nfilters .fchip')].map(e => e.getAttribute('data-n')));
  check('来源筛选芯片含 S5', chips.join(',') === 'all,S1,S2,S3,S4,S5', chips);
  const chipTxt = await p.evaluate(() => (document.querySelector('#nfilters [data-n="S5"]') || {}).innerText || '');
  check('S5 芯片文案含「圣龙宝藏」', /圣龙宝藏/.test(chipTxt), chipTxt);
  const chipTip = await p.evaluate(() => (document.querySelector('#nfilters [data-n="S5"]') || {}).title || '');
  check('S5 tooltip 无空「专属道具」', !/专属道具：\s*$|专属道具：\n/.test(chipTip) && /触发/.test(chipTip), chipTip);

  await p.evaluate(() => document.querySelector('#nfilters [data-n="S5"]').click());
  await wait(700);
  const list = await p.evaluate(() => {
    const badge = document.querySelector('#plist .pitem .tag.enc.s5');
    const imgs = [...document.querySelectorAll('#plist .pitem .pic img')];
    return {
      n: document.querySelectorAll('#plist .pitem').length,
      badges: document.querySelectorAll('#plist .pitem .tag.enc.s5').length,
      imgs: imgs.length,
      allInline: imgs.every(i => i.src.startsWith('data:image/webp')),
      bg: badge ? getComputedStyle(badge).backgroundColor : null,
    };
  });
  console.log('    ', JSON.stringify(list));
  check('点 S5 芯片筛出 17 只', list.n === 17, list.n);
  check('17 只都带 S5 徽章', list.badges === 17, list.badges);
  check('头像 17/17 且全内联 WebP', list.imgs === 17 && list.allInline, list);
  check('S5 徽章暖金 rgb(255,243,224)', list.bg === 'rgb(255, 243, 224)', list.bg);
  await p.screenshot({ path: path.join(SHOT, 'V16-线上S5-桌面.png') });

  await p.evaluate(() => {
    setBreedFilter('breed');
    const q = document.getElementById('q');
    q.value = '乐乐鲨'; q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(600);
  await p.evaluate(() => {
    const it = [...document.querySelectorAll('#plist .pitem')].find(x => x.innerText.includes('乐乐鲨'));
    if (it) it.click();
  });
  await wait(650);
  const box = await p.evaluate(() => {
    const sb = document.querySelector('.seasonbox');
    return sb ? {
      txt: sb.innerText.replace(/\s+/g, ' ').trim(),
      rows: sb.querySelectorAll('.kv').length,
      keys: [...sb.querySelectorAll('.kv .k')].map(e => e.innerText.trim()),
    } : null;
  });
  console.log('     信息条:', JSON.stringify(box));
  check('选中 S5 精灵显示赛季信息条', !!box && /S5 · 圣龙宝藏/.test(box.txt), box);
  check('信息条含触发与地点', !!box && /圣龙乐园/.test(box.txt) && /赛季奇遇/.test(box.txt), box);
  check('信息条跳过空值行（4 行）', !!box && !box.keys.includes('专属道具') && box.rows === 4, box);
  await p.screenshot({ path: path.join(SHOT, 'V16-线上S5-详情.png') });

  console.log('\n=== E. 桌面 / 手机 / 报错 ===');
  const ovfDesk = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('桌面 1280px 无横向溢出', ovfDesk <= 1, ovfDesk);
  check('桌面零 pageerror / console.error', errs.length === 0, errs.slice(0, 4));
  check('桌面无 4xx/5xx 资源', bad.length === 0, bad.slice(0, 4));

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await ctx.newPage();
  const merrs = [], mbad = [];
  m.on('pageerror', e => merrs.push(String(e)));
  m.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) mbad.push(r.status() + ' ' + r.url()); });
  await m.goto(MOB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await m.waitForTimeout(2600);
  await m.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await m.waitForTimeout(700);
  await m.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
    const c = document.querySelector('#nfilters [data-n="S5"]');
    if (c) c.click();
  });
  await m.waitForTimeout(800);
  const mob = await m.evaluate(() => ({
    url: location.href,
    total: typeof PETS !== 'undefined' ? PETS.length : -1,
    n: document.querySelectorAll('#plist .pitem').length,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    imgs: document.querySelectorAll('#plist .pitem .pic img').length,
  }));
  console.log('    ', JSON.stringify(mob));
  check('手机版 app.html 线上为 662 只', mob.total === 662, mob.total);
  check('手机 390px 下 S5 列表 17 项且头像齐全', mob.n === 17 && mob.imgs === 17, mob);
  check('手机 390px 无横向溢出', mob.ovf <= 1, mob.ovf);
  check('手机零 pageerror / 零 4xx', merrs.length === 0 && mbad.length === 0, { merrs: merrs.slice(0, 3), mbad: mbad.slice(0, 3) });
  await m.screenshot({ path: path.join(SHOT, 'V16-线上S5-手机.png') });

  await b.close();
  console.log('\n──────────────────────────────────────────────');
  console.log(fail ? `❌ ${fail} 项失败，${pass} 项通过` : `✅ 全部通过（${pass} 项断言）`);
  process.exit(fail ? 1 : 0);
})();
