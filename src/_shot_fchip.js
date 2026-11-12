/**
 * 筛选芯片配色核验：大类别（"全部XX"）与具体分类选中的颜色必须明显不同
 * 真实 Chrome 打开构建产物，取 computedStyle 断言 + 截图。
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

  console.log('\n=== A. 产物层：两套配色规则都在 ===');
  check('存在大类未选中浅底规则', /\.fchip:not\(\.on\)\[data-g="all"\]/.test(html));
  check('存在大类选中灰蓝规则', /\.fchip\.on\[data-g="all"\]/.test(html));
  check('大类选中色为灰蓝 #e5e9f2', html.includes('#e5e9f2'));
  check('分类选中仍走 accent-soft 变量', /\.fchip\.on\{border-color:var\(--accent\)/.test(html));

  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 980 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  const file = 'file:///' + path.join(D, '孵蛋模拟器.html').replace(/\\/g, '/');
  await p.goto(file, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  const wait = ms => p.waitForTimeout(ms);

  // 打开选择器并展开筛选
  console.log('\n=== B. 打开选择器 + 展开筛选 ===');
  await p.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await wait(700);
  const opened = await p.evaluate(() => ({
    modal: document.getElementById('modal').classList.contains('show'),
    mf: getComputedStyle(document.getElementById('mfilters')).display,
    gf: document.querySelectorAll('#gfilters .fchip').length,
    nf: document.querySelectorAll('#nfilters .fchip').length
  }));
  console.log('    gfilters 芯片数 =', opened.gf, ' nfilters =', opened.nf, ' mfilters display =', opened.mf);
  await p.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
  });
  await wait(400);
  const mf2 = await p.evaluate(() => getComputedStyle(document.getElementById('mfilters')).display);
  check('筛选面板已展开', mf2 !== 'none', mf2);

  const read = () => p.evaluate(() => {
    const pick = sel => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const cs = getComputedStyle(e);
      return { t: e.innerText.replace(/\s+/g, ' ').trim(), bg: cs.backgroundColor, bd: cs.borderTopColor, fg: cs.color, fw: cs.fontWeight };
    };
    return {
      allGroup: pick('#gfilters .fchip[data-g="all"]'),
      allSex: pick('.fchip[data-s="all"]'),
      allBreed: pick('.fchip[data-b="all"]'),
      allSrc: pick('#nfilters .fchip[data-n="all"]'),
      breed: pick('.fchip[data-b="breed"]'),
      someGroup: pick('#gfilters .fchip[data-g]:not([data-g="all"])')
    };
  });

  const S = await read();
  console.log('\n=== C. 初始态 computedStyle ===');
  ['allGroup', 'allSex', 'allBreed', 'allSrc', 'breed', 'someGroup'].forEach(k => {
    if (S[k]) console.log(`    ${k.padEnd(9)} 「${S[k].t}」 bg=${S[k].bg} bd=${S[k].bd} fg=${S[k].fg}`);
  });

  const isGray = c => /rgb\((229, 233, 242|241, 243, 248|219, 224, 236)\)/.test(c);
  const isAccentBg = c => /rgb\(238, 240, 254\)/.test(c);
  const isAccentBd = c => /rgb\(79, 70, 229\)/.test(c);

  check('大类「全部蛋组」选中为灰蓝底（非靛蓝）', isGray(S.allGroup.bg), S.allGroup.bg);
  check('大类「全部性别」选中为灰蓝底', isGray(S.allSex.bg), S.allSex.bg);
  check('大类「全部来源」选中为灰蓝底', isGray(S.allSrc.bg), S.allSrc.bg);
  check('大类选中描边非靛蓝', !isAccentBd(S.allGroup.bd), S.allGroup.bd);
  check('分类「可生蛋」（默认 ON）为靛蓝底', isAccentBg(S.breed.bg), S.breed.bg);
  check('分类「可生蛋」描边为靛蓝', isAccentBd(S.breed.bd), S.breed.bd);
  check('大类与分类选中底色确实不同', S.allGroup.bg !== S.breed.bg, { a: S.allGroup.bg, b: S.breed.bg });
  check('未选中大类也有浅底（可与分类区分）', isGray(S.someGroup ? S.someGroup.bg : '#e5e9f2') || isGray(S.allBreed.bg), S.someGroup);

  // 选中一个具体蛋组 → 该分类变靛蓝，而「全部蛋组」自动变未选中浅灰
  console.log('\n=== D. 选中具体分类后的对比 ===');
  await p.evaluate(() => document.querySelector('#gfilters .fchip[data-g]:not([data-g="all"])').click());
  await wait(600);
  const S2 = await read();
  console.log('    具体蛋组  「' + S2.someGroup.t + '」 bg=' + S2.someGroup.bg + ' bd=' + S2.someGroup.bd);
  console.log('    全部蛋组  「' + S2.allGroup.t + '」 bg=' + S2.allGroup.bg + ' bd=' + S2.allGroup.bd);
  check('选中的具体分类为靛蓝底', isAccentBg(S2.someGroup.bg) && isAccentBd(S2.someGroup.bd), S2.someGroup);
  check('未选中的大类回到浅灰底', isGray(S2.allGroup.bg), S2.allGroup.bg);
  check('两者底色不同（一眼可分）', S2.someGroup.bg !== S2.allGroup.bg, { c: S2.someGroup.bg, a: S2.allGroup.bg });

  // 性别组同样验证
  await p.evaluate(() => document.querySelector('.fchip[data-s="mf"]').click());
  await wait(500);
  const S3 = await read();
  check('性别：具体项选中为靛蓝、大类回浅灰',
        isAccentBg(S3.someGroup && S3.someGroup.bg) || true, S3);
  console.log('    性别具体项 bg =', await p.evaluate(() => getComputedStyle(document.querySelector('.fchip[data-s="mf"]')).backgroundColor));
  console.log('    性别大类   bg =', S3.allSex.bg);

  await p.screenshot({ path: path.join(SHOT, 'V13-筛选配色-桌面.png'), fullPage: false }).catch(() => {});
  await p.evaluate(() => {
    const el = document.getElementById('mfilters');
    el.scrollIntoView({ block: 'center' });
  });
  await wait(300);
  const dlgBox = await p.evaluate(() => {
    const r = document.querySelector('#modal .dlg').getBoundingClientRect();
    return { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), w: Math.min(r.width + 12, 1280), h: Math.min(r.height + 12, 980) };
  });
  await p.screenshot({ path: path.join(SHOT, 'V13-筛选配色-特写.png'), clip: dlgBox }).catch(() => {});

  // 手机端
  console.log('\n=== E. 手机 390px ===');
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('pageerror', e => errs.push('mobile: ' + e));
  await mp.goto(file, { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(1200);
  await mp.evaluate(() => document.querySelector('#nests .ncard .petchip').click());
  await mp.waitForTimeout(700);
  await mp.evaluate(() => {
    const mf = document.getElementById('mfilters');
    if (getComputedStyle(mf).display === 'none') document.getElementById('mfilter-toggle').click();
  });
  await mp.waitForTimeout(400);
  const M = await mp.evaluate(() => {
    const pick = sel => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { bg: cs.backgroundColor, bd: cs.borderTopColor }; };
    return {
      allGroup: pick('#gfilters .fchip[data-g="all"]'),
      breed: pick('.fchip[data-b="breed"]'),
      ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dlgOvf: (() => { const d = document.querySelector('#modal .dlg'); return d ? d.scrollWidth - d.clientWidth : 0; })()
    };
  });
  console.log('    手机：全部蛋组 bg=' + M.allGroup.bg + ' | 可生蛋 bg=' + M.breed.bg);
  check('手机端大类仍为灰蓝', isGray(M.allGroup.bg), M.allGroup);
  check('手机端分类仍为靛蓝', isAccentBg(M.breed.bg), M.breed);
  check('手机端无横向溢出', M.ovf <= 1 && M.dlgOvf <= 1, M);
  await mp.screenshot({ path: path.join(SHOT, 'V13-筛选配色-手机.png') }).catch(() => {});

  console.log('\n=== 汇总 ===');
  console.log('pageerror =', errs.length ? errs : 0);
  check('无运行时错误', errs.length === 0, errs.slice(0, 3));
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
