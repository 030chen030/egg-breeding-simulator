/** 选择器默认态 / 空态 / 手机端 视觉核验截图 */
const { chromium } = require('playwright-core');
const path = require('path');
const D = path.resolve(__dirname, '..');
const file = 'file:///' + path.join(D, '孵蛋模拟器.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];

  // ---- 桌面：默认态 ----
  let p = await b.newPage({ viewport: { width: 1440, height: 940 } });
  p.on('pageerror', e => errs.push('desk: ' + e));
  await p.goto(file, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  await p.click('#clear');
  await p.waitForTimeout(200);
  await p.evaluate(() => [...document.querySelectorAll('#cells .cellbox')].find(c => !c.querySelector('.nest')).click());
  await p.waitForTimeout(300);
  await p.click('#nests .ncard:nth-child(1) .petchip');
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(D, '_shots', 'V11-P1-选择器默认态.png') });

  // 顶部区域放大（筛选行 + 计数行 + 首项）
  const dlg = await p.$('#modal .dlg');
  await dlg.screenshot({ path: path.join(D, '_shots', 'V11-P2-选择器头部.png') });

  // ---- 桌面：空态（未发现蛋组 + 可生蛋规则） ----
  await p.click('#gfilters [data-g="1"]');
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(D, '_shots', 'V11-P3-空态兜底.png') });
  await p.evaluate(() => document.querySelector('[data-close]').click());
  await p.waitForTimeout(200);

  // ---- 桌面：说明文档新增段落 ----
  const note = await p.$('.rulesdoc');
  await note.screenshot({ path: path.join(D, '_shots', 'V11-P4-规则说明.png') });

  // ---- 手机：默认态 ----
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  p2.on('pageerror', e => errs.push('phone: ' + e));
  await p2.goto(file, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1000);
  await p2.click('#clear');
  await p2.waitForTimeout(200);
  await p2.evaluate(() => [...document.querySelectorAll('#cells .cellbox')].find(c => !c.querySelector('.nest')).click());
  await p2.waitForTimeout(300);
  await p2.click('#nests .ncard:nth-child(1) .petchip');
  await p2.waitForTimeout(600);
  await p2.click('#mfilter-toggle');
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: path.join(D, '_shots', 'V11-P5-手机-选择器.png') });

  console.log('pageerror:', errs.length, errs.slice(0, 5));
  await b.close();
})();
