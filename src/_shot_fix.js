const { chromium } = require('playwright-core');
const fs = require('fs');
const FILE = 'file:///' + require('path').resolve(__dirname, '..', '孵蛋模拟器.html').replace(/\\/g, '/');
const EXE = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXE2 = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : EXE2, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///' + FILE);
  await page.waitForTimeout(900);

  // 清空并放两个相邻窝：幽铃(♀) × 布灵(♂)
  await page.evaluate(() => {
    document.getElementById('clear').click();
    // 网格坐标 (3,2) 和 (4,2)：直接用内部 addNest
    addNest(3, 2, PETS.find(p => p.title === '幽铃').id, 'F');
    addNest(4, 2, PETS.find(p => p.title === '布灵').id, 'M');
    renderAll();
  });
  await page.waitForTimeout(400);
  const verdict = await page.evaluate(() => document.getElementById('vtext').textContent);
  const okp = await page.evaluate(() => document.getElementById('s-ok').textContent);
  console.log('判定:', verdict, '| 可生蛋配对:', okp);
  const board = await page.$('.board-wrap');
  if (board) await board.screenshot({ path: require('path').resolve(__dirname, '..', '_shots', 'H1-幽铃布灵配对.png') });
  const rep = await page.$('.pair.ok');
  if (rep) await rep.screenshot({ path: require('path').resolve(__dirname, '..', '_shots', 'H2-幽铃布灵报告.png') });
  const panel = await page.$('#nests');
  if (panel) await panel.screenshot({ path: require('path').resolve(__dirname, '..', '_shots', 'H3-面板标注.png') });
  console.log('page errors:', errs.length);
  await browser.close();
})();
