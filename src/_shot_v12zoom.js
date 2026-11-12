/**
 * v12 视觉核验：放大截取「一键补位」前后的画布，确认空窝 ★ 角标与补位结果看得清。
 */
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const D = path.resolve(__dirname, '..');
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const file = 'file:///' + path.join(D, '孵蛋模拟器.html').replace(/\\/g, '/');
  await p.goto(file, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1100);
  const wait = ms => p.waitForTimeout(ms);

  await p.evaluate(() => {
    document.getElementById('clear').click();
    const cs = [...document.querySelectorAll('#cells .cellbox')];
    [[2, 2], [3, 2], [4, 2], [4, 1], [5, 2], [5, 1], [4, 3]].forEach(([x, y]) => {
      const c = cs.find(e => +e.dataset.x === x && +e.dataset.y === y);
      if (c) c.click();
    });
  });
  await wait(800);
  const put = async (i, name) => {
    await p.evaluate(i => document.querySelectorAll('#nests .ncard .petchip')[i].click(), i);
    await wait(420);
    await p.evaluate(() => setBreedFilter('all'));
    await wait(120);
    await p.evaluate(n => { const q = document.getElementById('q'); q.value = n; q.dispatchEvent(new Event('input', { bubbles: true })); }, name);
    await wait(320);
    await p.evaluate(nm => { const it = [...document.querySelectorAll('#plist .pitem')].find(x => x.innerText.includes(nm)); if (it) it.click(); }, name);
    await wait(460);
    await p.evaluate(() => { const m = document.getElementById('modal'); if (m.classList.contains('show')) closePicker(); });
    await wait(150);
  };
  await put(0, '星星眼'); await put(1, '布灵'); await put(2, '玳龟'); await put(4, '幽铃');
  await p.locator('#board .nest').nth(1).click();
  await wait(500);
  await p.locator('#board').screenshot({ path: path.join(D, '_shots/V12-Z1-补位前-画布放大.png') });
  await p.locator('.card:has(#nests)').first().screenshot({ path: path.join(D, '_shots/V12-Z2-补位前-小窝面板.png') }).catch(() => {});
  await p.click('#fill');
  await wait(700);
  await p.locator('#board').screenshot({ path: path.join(D, '_shots/V12-Z3-补位后-画布放大.png') });
  await p.screenshot({ path: path.join(D, '_shots/V12-Z4-补位后-整页.png'), fullPage: true });
  // 手机端
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.goto(file, { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(1100);
  await mp.locator('#board').screenshot({ path: path.join(D, '_shots/V12-Z5-手机-画布.png') }).catch(() => {});
  console.log('shots done');
  await b.close();
})();
