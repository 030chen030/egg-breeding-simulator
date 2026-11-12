/**
 * v11 核验：① 埋点清理无残留  ② 小窝入口默认精灵按规则动态选取
 * 真实 Chrome 打开构建产物，断言以 DOM 实际渲染为准。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const D = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(D, '孵蛋模拟器.html'), 'utf8');

  console.log('\n=== A. 埋点清理：产物无残留 ===');
  check('无 track-config 配置块', !html.includes('track-config'));
  check('无 window.Track 注入', !html.includes('window.Track'));
  check('无 app-version meta', !html.includes('app-version'));
  check('无 trk. 本地键', !html.includes('trk.'));
  check('无 sendBeacon 上报', !html.includes('sendBeacon'));
  check('无 /collect 接口', !html.includes('/collect'));
  check('无埋点注释残留', !/埋点/.test(html));
  check('script 标签配对', (html.match(/<script/g) || []).length === (html.match(/<\/script/g) || []).length,
        [(html.match(/<script/g) || []).length, (html.match(/<\/script/g) || []).length]);
  check('文件不含 track-server 引用', !html.includes('track-server'));
  // v11 埋点清理后为 2.22MB；v14 补入 S5 的 29 只精灵 + 41 张头像后约 2.3MB，
  // 阈值放宽到 2.6MB，仍能兜住「把埋点 SDK / 大图原样塞回来」这类异常膨胀。
  check('产物体积 < 2.6MB（含 S5 新增精灵与头像）', Buffer.byteLength(html, 'utf8') < 2.6 * 1024 * 1024, Buffer.byteLength(html, 'utf8'));

  console.log('\n=== B. 磁盘无埋点文件残留 ===');
  for (const f of ['src/埋点SDK.js', 'src/埋点面板.template.html', 'src/_shot_track.js', 'src/_shot_live.js',
                   '埋点数据面板.html', 'docs/埋点方案说明.md', 'server/track-server.js']) {
    check('已删除 ' + f, !fs.existsSync(path.join(D, f)));
  }
  // 线上沙箱会保留部署时多出来的旧文件（部署只覆盖、不删除）→
  // 本地在 site/panel/ 放了一个「已下线」跳转页去覆盖服务端残留的旧看板
  const pIdx = path.join(D, 'site/panel/index.html');
  const pGone = !fs.existsSync(pIdx);
  const pOffline = pGone ? false : (() => {
    const s = fs.readFileSync(pIdx, 'utf8');
    return s.includes('此页面已下线') && !s.includes('数据面板');
  })();
  check('site/panel/index.html 已移除或替换为下线页', pGone || pOffline, { pGone, pOffline });
  check('_build.py 无 SDK 注入', !fs.readFileSync(path.join(D, 'src/_build.py'), 'utf8').includes('TRACK_SDK'));
  check('模板无 SDK 占位符', !fs.readFileSync(path.join(D, 'src/孵蛋模拟器.template.html'), 'utf8').includes('TRACK_SDK'));

  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 940 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  const file = 'file:///' + path.join(D, '孵蛋模拟器.html').replace(/\\/g, '/');
  await p.goto(file, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1100);

  console.log('\n=== C. 初始布局（原有功能回归） ===');
  const boot = await p.evaluate(() => ({
    nests: document.querySelectorAll('#nests .ncard').length,
    ok: document.getElementById('s-ok').textContent,
    texts: [...document.querySelectorAll('#nests .ncard')].map(c => c.innerText.replace(/\s+/g, ' '))
  }));
  check('初始 3 个小窝', boot.nests === 3, boot.nests);
  check('初始即可生蛋（可生蛋配对数 ≥1）', +boot.ok >= 1, boot.ok);
  check('初始精灵全部可生蛋（无「未发现」）', boot.texts.every(t => !t.includes('未发现')), boot.texts);
  // 新增一个空窝，读「小窝入口」的占位提示
  await p.evaluate(() => [...document.querySelectorAll('#cells .cellbox')].find(c => !c.querySelector('.nest')).click());
  await p.waitForTimeout(350);
  const ph = await p.evaluate(() => {
    const card = [...document.querySelectorAll('#nests .ncard')].find(c => /点击选择精灵/.test(c.innerText));
    return card ? card.querySelector('.petchip small').textContent : '';
  });
  check('小窝入口提示语已更新为可生蛋口径', /默认只列\s*605\s*只可生蛋精灵/.test(ph), ph);

  console.log('\n=== D. 小窝入口默认精灵（新规则） ===');
  // 清空 → 放一个空窝 → 打开选择器（无基准、无搜索）
  await p.click('#clear');
  await p.waitForTimeout(250);
  await p.evaluate(() => [...document.querySelectorAll('#cells .cellbox')].find(c => !c.querySelector('.nest')).click());
  await p.waitForTimeout(300);
  await p.click('#nests .ncard:nth-child(1) .petchip');
  await p.waitForTimeout(500);
  const d = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#plist .pitem')];
    const on = [...document.querySelectorAll('[data-b]')].filter(x => x.classList.contains('on')).map(x => x.dataset.b);
    const names = items.slice(0, 5).map(x => x.querySelector('.nm').innerText.trim());
    return {
      n: items.length,
      first: items[0] ? items[0].innerText.replace(/\s+/g, ' ') : '',
      firstHasDef: !!(items[0] && items[0].querySelector('.tag.def')),
      defCount: document.querySelectorAll('#plist .tag.def').length,
      onB: on,
      hasDimo: items.some(x => /迪莫/.test(x.innerText)),
      hasUnknownTag: items.some(x => x.querySelector('.tag.bad')),
      names,
      mcount: document.getElementById('m-count').textContent,
      placeholder: document.getElementById('q').placeholder
    };
  });
  check('默认规则芯片 = 可生蛋', d.onB.length === 1 && d.onB[0] === 'breed', d.onB);
  check('默认列表为 605 只可生蛋精灵', d.n === 605, d.n);
  check('默认精灵已不是迪莫', !/迪莫/.test(d.first), d.first);
  check('默认精灵 = 喵喵（NO.002，规则排序首位）', /喵喵/.test(d.names[0]) && /NO\.002/.test(d.first), d.names);
  check('默认精灵带「默认」角标', d.firstHasDef === true, d.firstHasDef);
  check('「默认」角标只出现一次', d.defCount === 1, d.defCount);
  check('列表内无任何不可生蛋精灵', !d.hasDimo && !d.hasUnknownTag);
  check('计数行说明已隐藏的不可生蛋精灵', /已按「可生蛋」默认规则隐藏 57 只/.test(d.mcount), d.mcount);

  console.log('\n=== E. 原有交互逻辑保留 ===');
  // 切「不可生蛋」
  await p.click('[data-b="unknown"]');
  await p.waitForTimeout(400);
  const unk = await p.evaluate(() => ({
    n: document.querySelectorAll('#plist .pitem').length,
    allBad: [...document.querySelectorAll('#plist .pitem')].every(x => x.querySelector('.tag.bad')),
    hasDimo: [...document.querySelectorAll('#plist .pitem')].some(x => /迪莫/.test(x.innerText)),
    defCount: document.querySelectorAll('#plist .tag.def').length
  }));
  check('「不可生蛋」筛出 57 只', unk.n === 57, unk.n);
  check('这 57 只全部带「未发现」标签', unk.allBad === true);
  check('迪莫在其中（可正常查看）', unk.hasDimo === true);
  check('查看不可生蛋列表时不出现「默认」角标', unk.defCount === 0, unk.defCount);

  // 切「全部精灵」
  await p.click('[data-b="all"]');
  await p.waitForTimeout(400);
  const allc = await p.evaluate(() => ({
    n: document.querySelectorAll('#plist .pitem').length,
    first: document.querySelector('#plist .pitem') ? document.querySelector('#plist .pitem .nm').innerText.trim() : '',
    defCount: document.querySelectorAll('#plist .tag.def').length
  }));
  check('「全部精灵」恢复 662 只', allc.n === 662, allc.n);
  check('切到全部后默认精灵仍按规则取可生蛋（喵喵）', /喵喵/.test(allc.first), allc.first);
  check('此时仍有 1 个「默认」角标', allc.defCount === 1, allc.defCount);

  // 搜索仍可用
  await p.fill('#q', '喵喵');
  await p.waitForTimeout(400);
  const s = await p.evaluate(() => ({ n: document.querySelectorAll('#plist .pitem').length,
                                      defCount: document.querySelectorAll('#plist .tag.def').length }));
  check('搜索「喵喵」命中 2 只（本体 + 「喵喵的样子」形态）', s.n === 2, s.n);
  check('搜索态不再显示「默认」角标（避免歧义）', s.defCount === 0, s.defCount);

  console.log('\n=== F. 空态兜底 ===');
  // 搜索无结果 → 清空筛选兜底
  await p.fill('#q', 'zzzz不存在');
  await p.waitForTimeout(400);
  const e1 = await p.evaluate(() => ({
    txt: document.querySelector('#plist .pickempty') ? document.querySelector('#plist .pickempty').innerText.replace(/\s+/g, ' ') : '',
    hasReset: !!document.querySelector('#plist [data-reset-filter]')
  }));
  check('无结果时给出空态提示', /没有匹配的精灵/.test(e1.txt), e1.txt);
  check('提供「清空全部筛选条件」兜底', e1.hasReset === true);
  await p.click('#plist [data-reset-filter]');
  await p.waitForTimeout(400);
  const e1b = await p.evaluate(() => ({
    q: document.getElementById('q').value,
    n: document.querySelectorAll('#plist .pitem').length,
    onB: [...document.querySelectorAll('[data-b]')].filter(x => x.classList.contains('on')).map(x => x.dataset.b)
  }));
  check('一键清空后恢复默认（关键词清空 + 可生蛋 + 605）',
        e1b.q === '' && e1b.n === 605 && e1b.onB[0] === 'breed', e1b);

  // 「未发现」蛋组 + 可生蛋筛选 → 0 结果 → 一键放宽
  await p.click('#gfilters [data-g="1"]');
  await p.waitForTimeout(400);
  const e2 = await p.evaluate(() => ({
    txt: document.querySelector('#plist .pickempty') ? document.querySelector('#plist .pickempty').innerText.replace(/\s+/g, ' ') : '',
    hasWiden: !!document.querySelector('#plist [data-b="all"]')
  }));
  check('「未发现」蛋组 + 可生蛋 → 空态提示可生蛋规则', /没有可生蛋的精灵/.test(e2.txt), e2.txt);
  check('提供「显示全部精灵」一键放宽', e2.hasWiden === true);
  await p.click('#plist [data-b="all"]');
  await p.waitForTimeout(400);
  const e2b = await p.evaluate(() => ({
    n: document.querySelectorAll('#plist .pitem').length,
    onB: [...document.querySelectorAll('[data-b]')].filter(x => x.classList.contains('on')).map(x => x.dataset.b),
    chipOn: document.getElementById('c-unk') ? true : false
  }));
  check('放宽后列出该蛋组 57 只', e2b.n === 57, e2b.n);
  check('放宽后芯片同步高亮「全部精灵」', e2b.onB[0] === 'all', e2b.onB);

  console.log('\n=== G. 配对推荐 / 随机 / 统一蛋组 回归 ===');
  await p.evaluate(() => document.querySelector('[data-close]').click());
  await p.waitForTimeout(250);
  // 上一段把筛选切到了「未发现蛋组 + 全部精灵」，这里复位到默认规则再验证推荐逻辑
  await p.evaluate(() => {
    state.filter = { q:'', g:'all', sex:'all', b:'breed', season:'all', pair:'all' };
    el('q').value = '';
    el('gfilters').querySelectorAll('.fchip').forEach(x => x.classList.toggle('on', x.dataset.g === 'all'));
    document.querySelectorAll('[data-b]').forEach(x => x.classList.toggle('on', x.dataset.b === 'breed'));
    renderPickerList();
  });
  await p.evaluate(() => {
    const cells = [...document.querySelectorAll('#cells .cellbox')];
    let placed = 0;
    for (const c of cells) { if (placed >= 3) break; if (!c.querySelector('.nest')) { c.click(); placed++; } }
  });
  await p.waitForTimeout(300);
  await p.click('#rand');
  await p.waitForTimeout(500);
  const g1 = await p.evaluate(() => ({
    ok: document.getElementById('s-ok').textContent,
    texts: [...document.querySelectorAll('#nests .ncard .petchip')].map(x => x.innerText.replace(/\s+/g, ' ')),
    toast: document.getElementById('toast').textContent
  }));
  check('随机填充后无不可生蛋精灵', g1.texts.every(t => !t.includes('未发现')), g1.texts);
  check('随机填充 toast 正常', /随机填充|重新随机/.test(g1.toast), g1.toast);

  await p.click('#same');
  await p.waitForTimeout(500);
  const g2 = await p.evaluate(() => ({
    toast: document.getElementById('toast').textContent,
    texts: [...document.querySelectorAll('#nests .ncard .petchip')].map(x => x.innerText.replace(/\s+/g, ' '))
  }));
  check('统一蛋组 toast 正常', /已统一为/.test(g2.toast), g2.toast);
  check('统一蛋组后无不可生蛋精灵', g2.texts.every(t => !t.includes('未发现')), g2.texts);

  // 配对推荐：先在小窝里放入一只（建立基准）→ 再开另一个窝的选择器 → 应出现 ★ 可配对
  await p.click('#nests .ncard:nth-child(1) .petchip');
  await p.waitForTimeout(450);
  await p.click('#plist .pitem');            // 放入第一只（自动成为配对基准）
  await p.waitForTimeout(450);
  await p.click('#nests .ncard:nth-child(2) .petchip');
  await p.waitForTimeout(500);
  const g3 = await p.evaluate(() => ({
    star: document.querySelectorAll('#plist .tag.pairok').length,
    pref: document.getElementById('prefilter').style.display,
    defCount: document.querySelectorAll('#plist .tag.def').length,
    n: document.querySelectorAll('#plist .pitem').length,
    baseCard: document.querySelectorAll('#nests .ncard')[0].innerText.replace(/\s+/g, ' ').slice(0, 40)
  }));
  check('配对推荐星标正常出现', g3.star > 0, g3.star);
  check('推荐栏正常显示', g3.pref === 'flex', g3.pref);
  check('有基准时不显示「默认」角标', g3.defCount === 0, g3.defCount);
  check('有基准时仍只列可生蛋精灵（≤605）', g3.n <= 605, g3.n);
  await p.evaluate(() => document.querySelector('[data-close]').click());

  console.log('\n=== H. 说明文档同步 ===');
  const docTxt = await p.evaluate(() => document.querySelector('.rulesdoc').innerText.replace(/\s+/g, ' '));
  check('规则说明新增「选择器的默认规则」段', /选择器的默认规则/.test(docTxt));
  check('说明中明确指出迪莫等不可生蛋会被过滤', /迪莫/.test(docTxt));

  await p.screenshot({ path: path.join(D, '_shots', 'V11-A-默认精灵.png') });
  await p.evaluate(() => [...document.querySelectorAll('#cells .cellbox')].find(c => !c.querySelector('.nest')) && null);
  console.log('\npageerror:', errs.length, errs.slice(0, 3));
  check('无页面错误', errs.length === 0);

  await b.close();
  console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
