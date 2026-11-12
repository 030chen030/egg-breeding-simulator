const { chromium } = require('playwright-core');
const fs = require('fs');
const FILE = 'file:///' + require('path').resolve(__dirname, '..', '孵蛋模拟器.html').replace(/\\/g, '/');
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXE2 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = require('path').resolve(__dirname, '..', '_shots');

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : EXE2, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1080 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///' + FILE);
  await page.waitForTimeout(900);

  // 画布：S1 精灵 + S3 精灵 + 普通精灵，验证角标随赛季变化
  await page.evaluate(() => {
    document.getElementById('clear').click();
    const s1 = PETS.find(p => p.season === 'S1' && p.role === 'encounter' && realGroups(p).length);
    const s3 = PETS.find(p => p.season === 'S3' && p.role === 'encounter' && realGroups(p).some(g => realGroups(s1).includes(g)));
    const s4 = PETS.find(p => p.season === 'S4' && p.role === 'encounter');
    addNest(2, 2, s1.id, 'F');
    addNest(3, 2, s3 ? s3.id : s1.id, 'M');
    addNest(4, 2, s4.id, 'M');
    renderAll();
  });
  await page.waitForTimeout(400);
  console.log('判定:', await page.evaluate(() => document.getElementById('vtext').textContent));
  const board = await page.$('.board-wrap');
  if (board) await board.screenshot({ path: OUT + '/J1-赛季角标.png' });
  const panel = await page.$('#nests');
  if (panel) await panel.screenshot({ path: OUT + '/J2-赛季信息条.png' });

  // 选择器：S2 筛选
  await page.evaluate(() => document.querySelector('.ncard .petchip').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(250);
  await page.click('#nfilters [data-n="S2"]');
  await page.waitForTimeout(250);
  console.log('S2 筛选:', await page.evaluate(() => document.getElementById('m-count').textContent));
  await page.screenshot({ path: OUT + '/J3-S2筛选.png' });

  // 规则说明区赛季一览
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const doc = await page.$('.season-doc');
  if (doc) { await doc.scrollIntoViewIfNeeded(); await doc.screenshot({ path: OUT + '/J4-赛季说明.png' }); }

  console.log('page errors:', errs.length, errs.slice(0, 3));
  await browser.close();
})();
