/* 排版健壮性核验：扫描所有元素的水平溢出（内容被挤出容器边界）。
   判定：el.scrollWidth > el.clientWidth + 1（允许 1px 渲染误差）
   且该元素可见、非"允许滚动"的容器（overflow auto/scroll 的内部滚动是合法的）。
   另外检查 body 是否出现横向滚动条（整页溢出）。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function findChrome() {
  const cands = [
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  throw new Error('chrome not found');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', executablePath: findChrome(), headless: true });
  const errors = [];

  async function scan(name, width, height, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e));
    const url = 'file:///' + path.join(ROOT, '孵蛋模拟器.html').replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    // 场景准备：放小窝 + 长名精灵 + 打开选择器（可选）
    await page.evaluate(() => {
      const pool = PETS.filter(p => !unknownOnly(p));
      // 放两个小窝配对（覆盖报告卡）
      addNest(0, 0); addNest(0, 1);
      const n1 = state.nests[0], n2 = state.nests[1];
      const f = pool.find(p => p.title.includes('喵喵')) || pool[0];
      const f2 = pool.find(p => realGroups(p).some(g => f.g.includes(g)) && p !== f) || pool[1];
      n1.petId = f.id; n1.sex = 'F';
      n2.petId = f2.id; n2.sex = 'M';
      renderAll();
    }).catch(e => console.log('setup warn:', String(e).slice(0, 80)));

    // 长名场景：把每个窝都塞上名字最长的精灵，最大化溢出风险
    await page.evaluate(() => {
      const longest = PETS.slice().sort((a, b) => (b.title + (b.form || '')).length - (a.title + (a.form || '')).length)[0];
      state.nests.forEach(n => { if (PETMAP[longest.id]) { n.petId = longest.id; clampSex(n); } });
      renderAll();
    }).catch(() => {});

    if (opts.openPicker) {
      await page.evaluate(() => { const n = state.nests[0] || null; openPicker(n); });
      await page.waitForTimeout(400);
    }
    if (opts.openSave) {
      await page.evaluate(() => openSave());
      await page.waitForTimeout(300);
    }

    const result = await page.evaluate(() => {
      const bad = [];
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        if (!(el instanceof HTMLElement)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        /* 误报排除：
           ① ellipsis 合法截断（nowrap + overflow:hidden + text-overflow）—— 视觉上不溢出
           ② input 自身可横向滚动 —— 合法
           ③ 边框计量误差 —— 容差提到 2px */
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') continue;
        const isEllipsis = cs.whiteSpace === 'nowrap' && cs.overflowX === 'hidden';
        const clippedBySelf = /(hidden|clip|auto|scroll)/.test(cs.overflowX + cs.overflowY);

        // 视觉溢出判定：无裁剪祖先链时，元素右/左边界超出视口
        let p = el.parentElement, clip = null;
        while (p && p !== document.body) {
          const pcs = getComputedStyle(p);
          if (/(hidden|clip|auto|scroll)/.test(pcs.overflowX + pcs.overflowY)) { clip = p; break; }
          p = p.parentElement;
        }
        if (clip) continue;                       // 有裁剪祖先 => 视觉上不会画出容器外
        const vw = document.documentElement.clientWidth;
        if (r.right > vw + 2 || r.left < -2) {
          const txt = (el.textContent || '').trim().slice(0, 30);
          bad.push({ kind: 'viewport', tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), right: Math.round(r.right), vw, txt });
          continue;
        }

        // 容器内溢出（scrollWidth 计量）：排除 ellipsis / 自身滚动容器
        if (!isEllipsis && !clippedBySelf && el.scrollWidth > el.clientWidth + 2) {
          const txt = (el.textContent || '').trim().slice(0, 30);
          bad.push({ kind: 'inner', tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth, txt });
        }
      }
      const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      return { bad: bad.slice(0, 40), badCount: bad.length, docOverflow };
    });

    console.log(`\n[${name}] ${width}x${height}  整页横向溢出: ${result.docOverflow ? '❌ YES' : '✅ NO'}  疑似溢出: ${result.badCount} 处`);
    result.bad.forEach(b => console.log('   ❌', b.kind, b.tag, '.' + b.cls, b.kind === 'viewport' ? `right=${b.right} vw=${b.vw}` : `scroll=${b.sw} client=${b.cw}`, JSON.stringify(b.txt)));
    await page.screenshot({ path: `${OUT}/X-${name}.png`, fullPage: opts.full !== false });
    await ctx.close();
    return result;
  }

  // 桌面：主视图 / 选择器 / 存档面板
  await scan('桌面-主页', 1280, 900, { full: false });
  await scan('桌面-选择器', 1280, 900, { openPicker: true, full: false });
  await scan('桌面-存档面板', 1280, 900, { openSave: true, full: false });
  // 手机：主页 / 选择器 / 存档
  await scan('手机-主页', 390, 844, { full: false });
  await scan('手机-选择器', 390, 844, { openPicker: true, full: false });
  await scan('手机-存档面板', 390, 844, { openSave: true, full: false });
  // 极窄
  await scan('极窄360-主页', 360, 780, { full: false });

  console.log('\npageerror:', errors.length, errors.slice(0, 5));
  await browser.close();
})();
