/* 配对推荐（选择器内）：真实 Chrome 截图核验 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const FILE = 'file:///' + require('path').resolve(__dirname, '..', '孵蛋模拟器.html').replace(/\\/g, '/');
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXE2 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = require('path').resolve(__dirname, '..', '_shots');

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : EXE2, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///' + FILE);
  await page.waitForTimeout(1000);

  const shot = async (sel, name) => {
    const el = await page.$(sel);
    if (el) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await el.screenshot({ path: `${OUT}/${name}.png` }); }
  };

  // —— L1 打开非基准窝的选择器：推荐栏 + 可配对优先排序 ——
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.ncard')).find(c => !c.classList.contains('base'));
    card.querySelector('[data-act="pick"]').click();
  });
  await page.waitForTimeout(400);
  console.log('L1 推荐栏:', await page.evaluate(() => document.getElementById('prefilter').textContent.replace(/\s+/g, ' ').trim()));
  console.log('L1 计数:', await page.evaluate(() => document.getElementById('m-count').textContent));
  await shot('.dlg', 'L1-选择器推荐栏与排序');

  // —— L2 仅看可配对 ——
  await page.click('#prefilter [data-p="ok"]');
  await page.waitForTimeout(300);
  console.log('L2 筛选后:', await page.evaluate(() => document.getElementById('m-count').textContent),
    '| 置灰项:', await page.evaluate(() => document.querySelectorAll('.pitem.nopair').length));
  await shot('.plist', 'L2-仅看可配对');

  // —— L3 全部精灵：置灰 + 原因 ——
  await page.click('#prefilter [data-p="all"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const it = document.querySelector('.pitem.nopair');
    if (it) it.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(200);
  console.log('L3 置灰项原因:', await page.evaluate(() => {
    const it = document.querySelector('.pitem.nopair');
    if (!it) return '(none)';
    const t = Array.from(it.querySelectorAll('.tag')).find(x => /不可配对/.test(x.textContent));
    return it.querySelector('.nm').textContent + ' → ' + (t ? t.title : '');
  }));
  await shot('.plist', 'L3-不可配对置灰');

  // —— L4 点击可配对项 → 自动放入 + 画布 ❤ ——
  await page.evaluate(() => { document.querySelector('.pitem .tag.pairok').closest('.pitem').scrollIntoView({ block: 'center' }); });
  await page.evaluate(() => {
    const it = Array.from(document.querySelectorAll('.pitem')).find(x => x.querySelector('.tag.pairok'));
    it.click();
  });
  await page.waitForTimeout(400);
  console.log('L4 画布❤:', await page.evaluate(() => document.querySelectorAll('.nest .heartdot').length),
    '| 可生蛋配对:', await page.evaluate(() => document.getElementById('s-ok').textContent));
  await shot('.main', 'L4-选中推荐后画布');

  // —— L5 基准不可繁育 → 提示 ——
  await page.evaluate(() => {
    const b = recBase();
    b.nest.petId = PETS.find(unknownOnly).id;
    b.nest.sex = null;
    renderAll();
    const card = Array.from(document.querySelectorAll('.ncard')).find(c => !c.classList.contains('base'));
    card.querySelector('[data-act="pick"]').click();
  });
  await page.waitForTimeout(400);
  console.log('L5 提示:', await page.evaluate(() => document.getElementById('prefilter').textContent.replace(/\s+/g, ' ').trim()));
  await shot('.dlg-h', 'L5-基准不可繁育提示');

  // —— L6 无基准 → 不显示推荐栏 ——
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.getElementById('clear').click(); document.querySelector('[data-tpl="line3"]').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.ncard'))[1];
    card.querySelector('[data-act="pick"]').click();
  });
  await page.waitForTimeout(400);
  console.log('L6 推荐栏:', await page.evaluate(() => document.getElementById('prefilter').style.display));
  await shot('.dlg-h', 'L6-无基准不显示推荐');

  console.log('page errors:', errs.length, errs.slice(0, 3));
  await browser.close();
})();
