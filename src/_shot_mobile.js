/* 手机端适配：真实 Chrome 手机视口截图核验 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const FILE = 'file:///' + require('path').resolve(__dirname, '..', '孵蛋模拟器.html').replace(/\\/g, '/');
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXE2 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = require('path').resolve(__dirname, '..', '_shots');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : EXE2, headless: true });
  const errs = [];

  const openPhone = async (w, h) => {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: UA
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
    await page.goto('file:///' + FILE);
    await page.waitForTimeout(900);
    return page;
  };
  const shot = async (page, sel, name) => {
    const el = await page.$(sel);
    if (el) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await el.screenshot({ path: `${OUT}/${name}.png` }); }
    else console.log('  (selector not found) ' + sel);
  };
  const info = p => p.evaluate(() => ({
    cell: CELL, cols: state.cols, boardW: document.getElementById('board').style.width,
    cls: document.getElementById('board').className,
    wrapScroll: (() => { const b = document.getElementById('board-wrap'); return b.scrollWidth - b.clientWidth; })(),
    pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));

  /* ================= 390 × 844（主流 iPhone） ================= */
  const p1 = await openPhone(390, 844);
  console.log('M1 390×844:', JSON.stringify(await info(p1)));
  await p1.screenshot({ path: `${OUT}/M1-首屏-390.png` });
  await shot(p1, '.board-wrap', 'M2-画布-390');
  await shot(p1, '.toolbar', 'M3-工具栏-390');
  await shot(p1, '.main > .card + .card', 'M4-小窝面板-390');

  // 轻点小窝 → 是否直接打开选择器
  await p1.locator('.nest').first().click();
  await p1.waitForTimeout(500);
  const opened = await p1.evaluate(() => document.getElementById('modal').classList.contains('show'));
  const focused = await p1.evaluate(() => document.activeElement && document.activeElement.id);
  console.log('M5 轻点小窝 → 选择器打开:', opened, '| 焦点:', focused || '(无)');
  await p1.keyboard.press('Escape');
  await p1.waitForTimeout(300);
  // 轻点第二个窝（它随即成为新基准）→ 关闭；再从「小窝配置」面板打开其它窝的选择器 → 推荐栏出现
  await p1.locator('.nest').nth(1).click();
  await p1.waitForTimeout(400);
  await p1.keyboard.press('Escape');
  await p1.waitForTimeout(300);
  await p1.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.ncard')).find(c => String(c.dataset.ncard) !== String(state.recBaseId));
    card.querySelector('[data-act="pick"]').click();
  });
  await p1.waitForTimeout(500);
  console.log('M5b 推荐栏:', await p1.evaluate(() => document.getElementById('prefilter').textContent.replace(/\s+/g, ' ').trim().slice(0, 60)));
  await p1.screenshot({ path: `${OUT}/M5-选择器全屏-折叠筛选.png` });
  await shot(p1, '.dlg-h', 'M6-选择器头部-折叠态');
  await p1.click('#mfilter-toggle');
  await p1.waitForTimeout(300);
  await shot(p1, '.dlg-h', 'M7-筛选展开');
  await shot(p1, '.plist', 'M8-精灵列表两列');
  await p1.click('#mfilter-toggle');
  await p1.keyboard.press('Escape');
  await p1.waitForTimeout(300);

  // 拖动小窝（触摸拖拽）+ 触摸点按验证
  await p1.keyboard.press('Escape');
  await p1.waitForTimeout(200);
  const before = await p1.evaluate(() => state.nests[0].x);
  try {
    await p1.locator('.nest').first().tap();
    await p1.waitForTimeout(400);
    console.log('M9 触摸点按是否弹窗:', await p1.evaluate(() => document.getElementById('modal').classList.contains('show')));
    await p1.keyboard.press('Escape');
    await p1.waitForTimeout(200);
  } catch (e) { console.log('M9 tap skip:', e.message.split('\n')[0]); }
  // 用真实 PointerEvent（pointerType=touch）再验证一次轻点逻辑（Playwright 的 tap 不合成 pointer 事件）
  const ptrTap = await p1.evaluate(() => {
    const n = document.querySelector('.nest');
    const mk = t => { const e = new PointerEvent(t, { bubbles: true, clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch', isPrimary: true }); n.dispatchEvent(e); };
    mk('pointerdown'); mk('pointerup');
    return document.getElementById('modal').classList.contains('show');
  });
  console.log('M9b PointerEvent(touch) 轻点 → 选择器打开:', ptrTap);

  /* ================= 360 × 800（窄屏安卓） ================= */
  const p2 = await openPhone(360, 800);
  console.log('M10 360×800:', JSON.stringify(await info(p2)));
  await shot(p2, '.board-wrap', 'M9-画布-360');

  /* ================= 844 × 390（横屏） ================= */
  const p3 = await openPhone(844, 390);
  console.log('M11 844×390:', JSON.stringify(await info(p3)));
  await p3.screenshot({ path: `${OUT}/M10-横屏-844.png` });

  console.log('page errors:', errs.length, errs.slice(0, 3));
  await browser.close();
})();
