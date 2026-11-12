/**
 * v14 · S5「圣龙宝藏」赛季精灵更新专项核验（真实 Chrome）
 * 覆盖：产物数据 / 界面可见性 / 可繁育判定 / S5 配色 / 桌面与手机零溢出 / 截图
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

const D = path.resolve(__dirname, '..');
const SHOT = path.join(D, '_shots');
const FILE = 'file:///' + path.join(D, '孵蛋模拟器.html').replace(/\\/g, '/');
const S5_BASE = ['乐乐鲨', '蛋包蛋', '蟹蟹椰', '鲸羽', '豆粒鹅', '西瓜虫', '小剪影', '滴溜豚'];

(async () => {
  if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });
  const html = fs.readFileSync(path.join(D, '孵蛋模拟器.html'), 'utf8');

  console.log('\n=== A. 产物层：S5 数据已注入 ===');
  check('三处 s5 赛季配色规则', (html.match(/\.tag\.enc\.s5\{/g) || []).length === 2
    && /\.nest \.av\.enc\.s5\{/.test(html));
  check('8 只奇遇基础精灵都在产物里', S5_BASE.every(n => html.includes(n)), S5_BASE.filter(n => !html.includes(n)));
  check('S5 赛季元数据「圣龙宝藏」', html.includes('圣龙宝藏'));
  check('页首数量改为动态占位', html.includes('id="hero-total"') && html.includes('id="hero-groups"'));
  check('不再硬编码「621 只精灵 / 15 个蛋组」', !/621 只精灵 \/ 15 个蛋组/.test(html));

  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 980 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(FILE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1400);
  const wait = ms => p.waitForTimeout(ms);

  console.log('\n=== B. 数据层：精灵库与赛季标记 ===');
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
      legend: (() => { const x = PETS.find(q => q.name === '小冥龙'); return x ? { g: x.g, breed: canBreed(x), season: x.season } : null; })(),
      hero: [document.getElementById('hero-total').textContent, document.getElementById('hero-groups').textContent],
    };
  });
  console.log('    ', JSON.stringify({ total: d.total, seasons: d.seasons, s5n: d.s5n, breedPool: d.breedPool, unknown: d.unknown }));
  check('精灵总数 662', d.total === 662, d.total);
  check('蛋组 15 个 / 页首数字动态一致', d.groups === 15 && d.hero[0] === '662' && d.hero[1] === '15', d.hero);
  check('赛季元数据 5 个（S1~S5）', d.seasons === 5 && d.seasonIds.join(',') === 'S1,S2,S3,S4,S5', d.seasonIds);
  check('S5 元数据：圣龙宝藏 / 17 只 / 基础 8', d.meta.label === '圣龙宝藏' && d.meta.count === 17 && d.meta.baseCount === 8, d.meta);
  check('S5 专属道具留空（wiki 未收录，不臆造）', d.meta.ball === '' || d.meta.ball == null, d.meta.ball);
  check('S5 地点 = 圣龙乐园', /圣龙乐园/.test(d.meta.location || ''), d.meta.location);
  check('S5 标记 17 只 = 基础 8 + 进化 9', d.s5n === 17 && d.base === 8 && d.evo === 9, [d.s5n, d.base, d.evo]);
  check('8 只基础与官方公告名单一致', S5_BASE.every(n => d.baseNames.includes(n)), d.baseNames);
  check('17 只 S5 精灵全部可生蛋', d.allCanBreed);
  check('17 只 S5 精灵头像齐全', d.withIcon === 17, d.withIcon);
  check('可生蛋 605 / 未发现组 57', d.breedPool === 605 && d.unknown === 57, [d.breedPool, d.unknown]);
  check('传说精灵小冥龙属未发现组、不可生蛋、非奇遇标记',
    d.legend && d.legend.g.join() === '1' && !d.legend.breed && d.legend.season === null, d.legend);

  console.log('\n=== C. 配对规则：S5 精灵真能参与繁育 ===');
  const pairs = await p.evaluate(() => {
    const find = n => PETS.find(x => x.name === n);
    const mk = (pet, sex, x) => ({ x, y: 0, petId: pet.id, sex });
    const run = (n1, n2) => {
      const a = find(n1), c = find(n2);
      if (!a || !c) return 'missing';
      return evaluatePair(mk(a, 'M', 0), mk(c, 'F', 1)).state;
    };
    const lele = find('乐乐鲨'), yunmeng = find('云梦豚');
    return {
      sameGroup: lele && yunmeng ? run('乐乐鲨', '云梦豚') : 'missing',
      diffGroup: run('乐乐鲨', '喵喵'),
      s5pair: run('蛋包蛋', '鸡麻麻'),
      legendPair: run('小冥龙', '云梦豚'),
      leleG: lele ? lele.g : null,
    };
  });
  console.log('    ', JSON.stringify(pairs));
  check('乐乐鲨（海洋组）与同组精灵配对成功', pairs.sameGroup === 'ok', pairs);
  check('S5 基础与自身进化形态（同组）配对成功', pairs.s5pair === 'ok', pairs);
  check('与无交集蛋组仍判失败（规则未被破坏）', pairs.diffGroup === 'bad', pairs);
  check('传说精灵（未发现组）仍判失败', pairs.legendPair === 'bad', pairs);

  console.log('\n=== D. 界面层：筛选 / 徽章 / 头像 / 详情 ===');
  await p.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await wait(700);
  await p.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
  });
  await wait(400);
  const chips = await p.evaluate(() => [...document.querySelectorAll('#nfilters .fchip')].map(e => e.getAttribute('data-n')));
  check('来源筛选芯片含 S5', chips.join(',') === 'all,S1,S2,S3,S4,S5', chips);
  const chipTxt = await p.evaluate(() => (document.querySelector('#nfilters [data-n="S5"]') || {}).innerText || '');
  check('S5 芯片文案含「圣龙宝藏」', /圣龙宝藏/.test(chipTxt), chipTxt);
  const chipTip = await p.evaluate(() => (document.querySelector('#nfilters [data-n="S5"]') || {}).title || '');
  check('S5 芯片 tooltip 不出现空「专属道具」', !/专属道具：\s*$|专属道具：\n/.test(chipTip) && /触发/.test(chipTip), chipTip);

  await p.evaluate(() => document.querySelector('#nfilters [data-n="S5"]').click());
  await wait(600);
  const list = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#plist .pitem')];
    const badge = document.querySelector('#plist .pitem .tag.enc.s5');
    return {
      n: it.length,
      badges: document.querySelectorAll('#plist .pitem .tag.enc.s5').length,
      imgs: document.querySelectorAll('#plist .pitem .pic img').length,
      allInline: [...document.querySelectorAll('#plist .pitem .pic img')].every(i => i.src.startsWith('data:image/webp')),
      bg: badge ? getComputedStyle(badge).backgroundColor : null,
      mcount: (document.getElementById('m-count') || {}).textContent || '',
    };
  });
  console.log('    ', JSON.stringify(list));
  check('点 S5 芯片筛出 17 只', list.n === 17, list.n);
  check('17 只都带 S5 赛季徽章', list.badges === 17, list.badges);
  check('头像 17/17 且全部内联 WebP', list.imgs === 17 && list.allInline, list);
  check('S5 徽章为暖金色（区别于 S1~S4）', list.bg === 'rgb(255, 243, 224)', list.bg);
  await p.screenshot({ path: path.join(SHOT, 'V15-S5赛季筛选-桌面.png') });

  // 详情信息条：选「乐乐鲨」
  await p.evaluate(() => {
    setBreedFilter('breed');
    const q = document.getElementById('q');
    q.value = '乐乐鲨'; q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(500);
  const detail = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#plist .pitem')].find(x => x.innerText.includes('乐乐鲨'));
    if (it) it.click();
    return true;
  });
  await wait(600);
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
  check('信息条跳过空值的「专属道具」行', !!box && !box.keys.includes('专属道具') && box.rows === 4, box);
  await p.screenshot({ path: path.join(SHOT, 'V15-S5精灵详情.png') });

  console.log('\n=== E. 桌面 / 手机零溢出 + 零报错 ===');
  const ovfDesk = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('桌面 1280px 无横向溢出', ovfDesk <= 1, ovfDesk);
  check('桌面运行零 pageerror / console.error', errs.length === 0, errs.slice(0, 4));

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await ctx.newPage();
  const merrs = [];
  m.on('pageerror', e => merrs.push(String(e)));
  await m.goto(FILE, { waitUntil: 'domcontentloaded' });
  await m.waitForTimeout(1400);
  await m.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await m.waitForTimeout(600);
  await m.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
    const c = document.querySelector('#nfilters [data-n="S5"]');
    if (c) c.click();
  });
  await m.waitForTimeout(700);
  const mob = await m.evaluate(() => ({
    n: document.querySelectorAll('#plist .pitem').length,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    imgs: document.querySelectorAll('#plist .pitem .pic img').length,
  }));
  console.log('    ', JSON.stringify(mob));
  check('手机 390px 下 S5 列表 17 项且头像齐全', mob.n === 17 && mob.imgs === 17, mob);
  check('手机 390px 无横向溢出', mob.ovf <= 1, mob.ovf);
  check('手机运行零 pageerror', merrs.length === 0, merrs.slice(0, 3));
  await m.screenshot({ path: path.join(SHOT, 'V15-S5赛季-手机.png') });

  await b.close();
  console.log('\n──────────────────────────────────────────────');
  console.log(fail ? `❌ ${fail} 项失败，${pass} 项通过` : `✅ 全部通过（${pass} 项断言）`);
  process.exit(fail ? 1 : 0);
})();
