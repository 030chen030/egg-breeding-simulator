// 真实 Chrome 渲染截图：验证图标接入后的视觉
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const FILE = 'F:\\workbuddy\\2026-09-20-14-43-56\\孵蛋模拟器.html';
const OUT = 'F:\\workbuddy\\2026-09-20-14-43-56\\_shots';
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EXE2 = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const exe = fs.existsSync(EXE2) ? EXE2 : EXE;
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await page.goto('file:///' + FILE.replace(/\\/g, '/'));
  await page.waitForTimeout(900);

  // 1. 初始视图
  await page.screenshot({ path: path.join(OUT, 'G1-图标-初始.png') });

  // 2. 左栏（画布特写）
  const board = await page.$('.board-wrap');
  if (board) await board.screenshot({ path: path.join(OUT, 'G2-图标-画布特写.png') });

  // 3. 打开精灵选择器
  await page.evaluate(() => {
    const card = document.querySelector('.ncard .petchip');
    if (card) card.click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'G3-图标-选择器.png') });

  // 4. 判定报告特写
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m) m.classList.remove('show');
  });
  await page.waitForTimeout(200);
  const rep = await page.$('.pair.ok');
  if (rep) await rep.screenshot({ path: path.join(OUT, 'G4-图标-判定报告.png') });

  // 5. 三角环绕（八向）
  await page.evaluate(() => {
    const b = document.querySelector('[data-tpl="tri"]');
    if (b) b.click();
    const same = document.getElementById('same');
    if (same) same.click();
  });
  await page.waitForTimeout(400);
  if (board) await board.screenshot({ path: path.join(OUT, 'G5-图标-三角环绕.png') });

  // 统计信息
  const stat = await page.evaluate(() => ({
    icons: Object.keys(ICONS).length,
    nests: document.querySelectorAll('.nest').length,
    nestImgs: document.querySelectorAll('.nest .pic img').length,
    chipImgs: document.querySelectorAll('.ncard .petchip .pic img').length,
    itemImgs: document.querySelectorAll('.pitem .pic img').length,
    brokenImgs: Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0).length,
  }));
  console.log(JSON.stringify(stat, null, 2));
  console.log('console errors:', errs.length, errs.slice(0, 5));

  await browser.close();
})();
