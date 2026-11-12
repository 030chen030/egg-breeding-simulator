const { chromium } = require('playwright-core');
const fs = require('fs');
const FILE = 'file:///' + require('path').resolve(__dirname, '..', '孵蛋模拟器.html').replace(/\\/g, '/');
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXE2 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = require('path').resolve(__dirname, '..', '_shots');

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : EXE2, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///' + FILE);
  await page.waitForTimeout(900);

  // 布置：幽铃♀ × 布灵♂ 相邻，旁边再放一只普通精灵（星尘/喵喵任意）
  await page.evaluate(() => {
    document.getElementById('clear').click();
    const you = PETS.find(p => p.title === '幽铃');
    const bu = PETS.find(p => p.title === '布灵');
    const other = PETS.find(p => p.title === '喵喵') || PETS.find(p => realGroups(you).some(g => realGroups(p).includes(g)) && !p.season);
    addNest(3, 2, you.id, 'F');
    addNest(4, 2, bu.id, 'M');
    addNest(5, 2, other.id, 'M');
    renderAll();
  });
  await page.waitForTimeout(400);
  const verdict = await page.evaluate(() => document.getElementById('vtext').textContent);
  console.log('判定:', verdict);

  const board = await page.$('.board-wrap');
  if (board) await board.screenshot({ path: OUT + '/I1-赛季画布.png' });
  const panel = await page.$('#nests');
  if (panel) await panel.screenshot({ path: OUT + '/I2-赛季面板.png' });

  // 打开选择器并点 S4 筛选
  await page.evaluate(() => {
    document.querySelector('.ncard .petchip').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  await page.click('#nfilters [data-n="S4"]');
  await page.waitForTimeout(250);
  const cnt = await page.evaluate(() => document.getElementById('m-count').textContent);
  console.log('S4 筛选:', cnt);
  await page.screenshot({ path: OUT + '/I3-赛季筛选.png' });

  console.log('page errors:', errs.length, errs.slice(0, 3));
  await browser.close();
})();
