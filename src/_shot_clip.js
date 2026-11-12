/* 量测：空窝「＋ 空窝」与状态胶囊「配对失败」的裁切 / 居中情况 */
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

const PROBE = () => {
  const r = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), b: +b.bottom.toFixed(1), r: +b.right.toFixed(1) }; };
  const out = { cell: CELL, boardCls: document.getElementById('board').className, nests: [] };
  document.querySelectorAll('.nest').forEach(n => {
    const nb = n.getBoundingClientRect();
    const ei = n.querySelector('.empty-in') || n.querySelector('.pname');
    const eb = ei ? ei.getBoundingClientRect() : null;
    const cs = getComputedStyle(n);
    out.nests.push({
      seq: n.querySelector('.seq') ? n.querySelector('.seq').textContent : '?',
      empty: n.classList.contains('empty'),
      nest: r(n),
      inner: eb ? { h: +eb.height.toFixed(1), top: +(eb.y - nb.y).toFixed(1), bottomGap: +(nb.bottom - eb.bottom).toFixed(1) } : null,
      pad: cs.paddingTop + '/' + cs.paddingBottom,
      scrollH: n.scrollHeight, clientH: n.clientHeight,
      clipped: n.scrollHeight > n.clientHeight + 0.5,
      innerFs: ei ? getComputedStyle(ei).fontSize : null
    });
  });
  const pill = document.querySelector('.pair .pill');
  if (pill) {
    const pb = pill.getBoundingClientRect();
    const par = pill.parentElement.getBoundingClientRect();
    out.pill = {
      txt: pill.textContent.trim(),
      box: r(pill),
      lineHeight: getComputedStyle(pill).lineHeight,
      fontSize: getComputedStyle(pill).fontSize,
      parentH: +par.height.toFixed(1),
      parentCls: pill.parentElement.className,
      clipped: pill.scrollHeight > pill.clientHeight + 0.5 || pb.bottom > par.bottom + 0.5
    };
  }
  return out;
};

(async () => {
  const srv = await serve(path.join(ROOT, 'site'));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function run(label, vp, opts = {}) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(label + ': ' + e));
    await p.goto(url, { waitUntil: 'networkidle' });
    await wait(900);
    if (opts.cols) {
      await p.evaluate(c => { const s = document.getElementById('cols'); s.value = String(c); s.dispatchEvent(new Event('change')); }, opts.cols);
      await wait(400);
    }
    // 4 个空窝（复现截图：两两相邻）
    await p.evaluate(() => {
      state.nests = []; state.seq = 0; state.selected = null; state.recBaseId = null;
      [[1, 2], [2, 2], [4, 2], [5, 2]].forEach(([x, y]) => addNest(x, y, null, null));
      renderAll();
    });
    await wait(500);
    const info = await p.evaluate(PROBE);
    console.log(`\n[${label}] ${vp.width}x${vp.height} cell=${info.cell} board="${info.boardCls}"`);
    info.nests.forEach(n => console.log('   窝' + n.seq, n.empty ? '空' : '有', 'nest', n.w + 'x' + n.h, 'pad', n.pad,
      '| inner h=' + (n.inner ? n.inner.h : '-'), 'topGap=' + (n.inner ? n.inner.top : '-'), 'bottomGap=' + (n.inner ? n.inner.bottomGap : '-'),
      '| 裁切:', n.clipped, '| fs', n.innerFs));
    if (info.pill) console.log('   胶囊:', JSON.stringify(info.pill));
    const bw = await p.$('#board-wrap');
    return { p, bw, info };
  }

  const desk = await run('桌面', { width: 1280, height: 900 });
  await desk.bw.screenshot({ path: `${OUT}/Y1-桌面-空窝.png` });

  const desk8 = await run('桌面-窄', { width: 700, height: 900 });
  await desk8.bw.screenshot({ path: `${OUT}/Y2-桌面窄-空窝.png` });

  const mob = await run('手机', { width: 390, height: 844 }, { mobile: true });
  await mob.bw.screenshot({ path: `${OUT}/Y3-手机-空窝.png` });

  const mob8 = await run('手机-8列', { width: 390, height: 844 }, { mobile: true, cols: 8 });
  await mob8.bw.screenshot({ path: `${OUT}/Y4-手机8列-空窝.png` });

  // 配对失败胶囊：放两只不可配对的精灵
  await mob8.p.evaluate(() => {
    state.nests[0].petId = 'pet_000001'; state.nests[0].sex = 'F';        // 喵喵
    const other = PETS.find(p => !unknownOnly(p) && sexAvail(p) === 'MF' && !realGroups(p).some(g => realGroups(PETMAP['pet_000001']).includes(g)));
    state.nests[1].petId = other.id; state.nests[1].sex = 'M';
    renderAll();
  });
  await wait(500);
  const pillInfo = await mob8.p.evaluate(() => {
    const cards = [...document.querySelectorAll('.pair')];
    return cards.map(c => {
      const pill = c.querySelector('.pill');
      const head = pill ? pill.parentElement : null;
      const pb = pill && pill.getBoundingClientRect(), hb = head && head.getBoundingClientRect();
      return {
        state: pill ? pill.textContent.trim() : null,
        pillH: pb ? +pb.height.toFixed(1) : null,
        headH: hb ? +hb.height.toFixed(1) : null,
        lineHeight: pill ? getComputedStyle(pill).lineHeight : null,
        fs: pill ? getComputedStyle(pill).fontSize : null,
        overflow: pill ? pill.scrollHeight - pill.clientHeight : null,
        headCls: head ? head.className : null
      };
    });
  });
  console.log('\n手机-8列 胶囊量测:', JSON.stringify(pillInfo, null, 1));
  const card = await mob8.p.$('.pair');
  if (card) await card.screenshot({ path: `${OUT}/Y5-手机-配对失败胶囊.png` });

  /* ---------- 小窝配置卡顶部：状态标签是否被拉伸 / 文字是否居中 ---------- */
  const tagProbe = async (label, page) => {
    const info = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.ncard').forEach(c => {
        const top = c.querySelector('.ncard-top');
        const acts = c.querySelector('.acts');
        [...acts.querySelectorAll('.tag')].forEach(t => {
          const tb = t.getBoundingClientRect(), cs = getComputedStyle(t);
          out.push({
            txt: t.textContent.trim(), h: +tb.height.toFixed(1),
            actsH: +acts.getBoundingClientRect().height.toFixed(1),
            topH: +top.getBoundingClientRect().height.toFixed(1),
            alignSelf: cs.alignSelf, lineHeight: cs.lineHeight,
            stretched: tb.height > parseFloat(cs.lineHeight) + 12
          });
        });
      });
      return out.slice(0, 8);
    });
    console.log(`\n[${label}] 状态标签:`, JSON.stringify(info));
    const el = await page.$('.ncard-top');
    if (el) await el.screenshot({ path: `${OUT}/Y7-${label}-状态标签.png` });
  };
  await tagProbe('手机-8列', mob8.p);
  await tagProbe('桌面', desk.p);

  /* ---------- 格子尺寸扫描：各档位空窝都不得裁切且居中 —— 通过标准：全部 ok ---------- */
  const sweep = [];
  for (const cols of [4, 5, 6, 8, 10, 12]) {
    await mob.p.evaluate(c => {
      const s = document.getElementById('cols'); s.value = String(c); s.dispatchEvent(new Event('change'));
      state.nests = []; state.seq = 0;
      addNest(0, 2, null, null); addNest(1, 2, null, null);
      renderAll();
    }, cols);
    await wait(250);
    const r = await mob.p.evaluate(() => {
      const n = document.querySelector('.nest');
      const i = n.querySelector('.empty-in');
      const nb = n.getBoundingClientRect(), ib = i.getBoundingClientRect();
      return {
        cell: CELL, board: document.getElementById('board').className,
        clipped: n.scrollHeight > n.clientHeight + 0.5,
        topGap: +(ib.y - nb.y).toFixed(1), bottomGap: +(nb.bottom - ib.bottom).toFixed(1),
        innerH: +ib.height.toFixed(1), fs: getComputedStyle(i).fontSize
      };
    });
    sweep.push({ cols, ...r, centered: Math.abs(r.topGap - r.bottomGap) <= 1.5 });
  }
  console.log('\n格子尺寸扫描（手机 390px）：');
  sweep.forEach(s => console.log(`   ${s.cols}列 cell=${s.cell} ${s.board} | 空窝裁切:${s.clipped ? '❌' : '✅'} 居中:${s.centered ? '✅' : '❌'} (上${s.topGap}/下${s.bottomGap}) innerH=${s.innerH} fs=${s.fs}`));
  const bad = sweep.filter(s => s.clipped || !s.centered);
  console.log('   全部通过:', bad.length === 0, bad.length ? JSON.stringify(bad) : '');

  const deskCard = await (async () => {
    await desk.p.evaluate(() => {
      state.nests[0].petId = 'pet_000001'; state.nests[0].sex = 'F';
      const other = PETS.find(p => !unknownOnly(p) && sexAvail(p) === 'MF' && !realGroups(p).some(g => realGroups(PETMAP['pet_000001']).includes(g)));
      state.nests[1].petId = other.id; state.nests[1].sex = 'M';
      renderAll();
    });
    await wait(400);
    return desk.p.$('.pair');
  })();
  if (deskCard) await deskCard.screenshot({ path: `${OUT}/Y6-桌面-配对失败胶囊.png` });

  console.log('\npageerror:', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
})().catch(e => { console.error('FATAL', e.stack || e.message || e); process.exit(1); });
