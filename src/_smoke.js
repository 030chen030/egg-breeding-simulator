/* 用 jsdom 真实加载单文件模拟器，跑端到端冒烟测试 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const FILE = 'F:\\workbuddy\\2026-09-20-14-43-56\\孵蛋模拟器.html';
const html = fs.readFileSync(FILE, 'utf8');

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  PASS  ' + msg); } else { fails++; console.log('  FAIL  ' + msg); } };

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://egg-breeder.test/',     // 非 about:blank：jsdom 才会提供 localStorage
  beforeParse(window) {
    window.Element.prototype.setPointerCapture = function () {};
    window.Element.prototype.releasePointerCapture = function () {};
  }
});
const w = dom.window, d = w.document;
const $ = s => d.querySelector(s);
const $$ = s => Array.from(d.querySelectorAll(s));
const text = s => ($(s) ? $(s).textContent.trim() : '<missing>');
const S = () => ({
  nests: $$('.nest').length,
  adj: +text('#s-adj'),
  okp: +text('#s-ok'),
  verdict: text('#vtext')
});

w.addEventListener('error', e => console.log('  !! window error: ' + e.message));

function nestPos(i) {
  const el = $$('.nest')[i];
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top), id: el.dataset.nid };
}
function openPickerAt(i) {
  $$('.ncard')[i].querySelector('[data-act="pick"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}
function pickByName(name) {
  const q = $('#q');
  q.value = name;
  q.dispatchEvent(new w.Event('input', { bubbles: true }));
  const items = $$('.pitem');
  const it = items.find(e => e.querySelector('.nm').textContent.trim() === name) || items[0];
  const got = it.querySelector('.nm').textContent.trim();
  it.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  return got;
}
function tpl(name) { $('[data-tpl="' + name + '"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function btn(id) { $('#' + id).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function ev(expr) { return w.eval(expr); }
/** 把画布统一到指定蛋组（绕开按钮的随机选组，用于需要确定组别的分支测试） */
function sameAs(gid) { return w.eval('fillSameGroup(' + gid + ')'); }
function firstKinds(cards) {
  return cards.map(c => ({
    cls: c.classList.contains('ok') ? 'ok' : c.classList.contains('bad') ? 'bad' : 'pending',
    bads: Array.from(c.querySelectorAll('.rules li.r-no')).map(li => li.textContent.replace(/\s+/g, ' ').trim())
  }));
}

console.log('\n=== 1. 加载 / 数据模型 ===');
let s = S();
ok(text('#s-nest') === '3', `小窝数 = 3 (${text('#s-nest')})`);
ok($$('.cellbox').length === 48, `网格 8×6 = 48 格 (${$$('.cellbox').length})`);
ok(s.adj === 2, `一字并排 3 窝 → 相邻配对 2 组 (${s.adj})`);
ok(s.okp === 2, `公宠居中 → 可生蛋配对 2 组 (${s.okp})`);
ok(s.verdict.includes('可以生蛋'), `总结论：${s.verdict} · ${text('#vsub')}`);
ok($$('#gfilters .fchip').length === 16, `蛋组筛选 1+15 = 16 个按钮 (${$$('#gfilters .fchip').length})`);

// —— 1a 页脚署名：只保留「孵蛋模拟器 · 数据来源 洛克王国世界 WIKI · 光环助手整理发布」——
const footTxt = text('footer').replace(/\s+/g, ' ');
ok(footTxt === '孵蛋模拟器 · 数据来源 洛克王国世界 WIKI · 光环助手整理发布', `页脚文案精简为一行：${footTxt}`);
ok(String($('footer a').getAttribute('href')).startsWith('https://wiki.biligame.com/'), '数据来源仍带可点的 WIKI 链接');
ok(!/621 只精灵形态|单文件实现|孵蛋组别查询/.test(footTxt), '页脚不再出现精灵数量 / 单文件实现 / 孵蛋组别查询等旧文案');
ok($$('footer br').length === 0 && $$('footer')[0].children.length === 1, '页脚合并为单行，不再有第二行说明');

console.log('\n=== 2. 判定依据 ===');
let cards = $$('.pair');
ok(cards.length === 2, `生成 2 张配对卡 (${cards.length})`);
const names = Array.from(cards[0].querySelectorAll('.rules li b')).map(e => e.textContent.trim());
ok(names.length === 5, `每卡 5 条依据 (${names.length})`);
console.log('        ' + names.join(' ｜ '));
ok(names.join('|') === '① 小窝紧贴相邻|② 两只小窝均已入住|③ 性别一公一母|④ 非「未发现」蛋组|⑤ 蛋组相同（有交集）', '五条依据顺序与命名正确');
ok(cards[0].querySelectorAll('.rules li.r-ok').length === 5, '全部依据通过');
const foot = cards[0].querySelector('.pair-f').textContent.replace(/\s+/g, ' ');
ok(/母系定种/.test(foot), '产出含「母系定种」');
ok(/20 小时档/.test(foot), '产出含「20 小时档 · 必定出蛋」');
ok(/生蛋耗时 0.5 ~ 20 小时/.test(foot), '产出含生蛋耗时区间');
ok(/子代 NO\./.test(foot), '产出含子代图鉴编号');
console.log('        ' + foot.slice(0, 118));

console.log('\n=== 3. 拖动 / 占位约束 ===');
const before = nestPos(0);
const node0 = $$('.nest')[0];
const sx = before.left + 30, sy = before.top + 30;
const md = (t, x, y, b) => node0.dispatchEvent(new w.MouseEvent(t, { bubbles: true, clientX: x, clientY: y, button: b || 0 }));
md('pointerdown', sx, sy);
md('pointermove', sx - 80, sy);   // 左移 1 格（该格为空）
md('pointerup', sx - 80, sy);
const after = nestPos(0);
ok(after.left === before.left - 78, `左移一格：left ${before.left} → ${after.left}（期望 ${before.left - 78}）`);
ok(after.top === before.top, '纵向位置不变');

const occupiedLeft = nestPos(1).left;
const node1 = $$('.nest')[1];
md2('pointerdown', node1, occupiedLeft + 30, parseFloat(node1.style.top) + 30);
md2('pointermove', node1, occupiedLeft + 30 + 78, parseFloat(node1.style.top) + 30);
md2('pointerup', node1, occupiedLeft + 30 + 78, parseFloat(node1.style.top) + 30);
function md2(t, el, x, y) { el.dispatchEvent(new w.MouseEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0 })); }
ok(nestPos(1).left === occupiedLeft, '拖到已被占用的格子（右侧邻居）→ 自动还原');
ok($$('.nest').length === 3, '拖动不会产生重复小窝');

console.log('\n=== 4. 自由摆放 / 孤立提示 / 移除 ===');
$$('.cellbox')[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
s = S();
ok(s.nests === 4, `点击空格子放置小窝 → 4 (${s.nests})`);
ok(/没有与任何小窝紧贴/.test(text('#isolated')), '孤立小窝被提示');
console.log('        ' + text('#isolated').replace(/\s+/g, ' ').slice(0, 128));
$$('[data-act="del"]')[3].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok(S().nests === 3, `移除后回到 3 个 (${S().nests})`);

console.log('\n=== 5. 规则分支：未发现组 / 性别 / 跨蛋组 / 无性别 ===');
tpl('line3');
ok(S().nests === 3, `「一字并排」模板放置 3 个空窝 (${S().nests})`);
ok(S().adj === 2, `空窝时相邻配对 2 组 (${S().adj})`);
ok($$('.pair.pending').length === 2, '空窝配对标记为「待完善」');
btn('same');
s = S();
ok($$('.nest.empty').length === 0, '「统一蛋组」后全部入住');
ok(s.okp === 2, `统一蛋组后可生蛋 2 组 (${s.okp})`);
ok(text('#vtext').includes('可以生蛋'), `结论：${text('#vtext')}`);

// 5a 未发现组（顺带验证「可生蛋」默认筛选规则 v11）
openPickerAt(1);
ok($('#modal').classList.contains('show'), '打开精灵选择器');
ok(ev('canBreed(PETMAP["pet_000004"])') === false, 'canBreed(迪莫 NO.001) = false（未发现组不可生蛋）');
ok(ev('canBreed(PETMAP["pet_000001"])') === true, 'canBreed(喵喵 NO.002) = true');
ok(ev('BREED_POOL_N') === 605, `可生蛋精灵总数 ${ev('BREED_POOL_N')} 只（662 - 57 未发现组）`);
ok($('[data-b="breed"]').classList.contains('on'), '「可生蛋」为默认筛选规则（默认不列出不能生蛋的精灵）');
ok($$('.pitem').length === 605, `默认只列可生蛋精灵 605 只 (${$$('.pitem').length})`);
ok($$('.pitem .tag.bad').length === 0, '默认列表内不含「未发现」精灵');
ok(!$$('.pitem').some(e => /迪莫/.test(e.textContent)), '默认列表不含迪莫（原来固定排第一）');
const dftName = $$('.pitem')[0].querySelector('.nm').textContent.trim();
ok(dftName === '喵喵', `小窝入口默认精灵按规则动态选取 = 「${dftName}」（不再固定迪莫）`);
ok(ev('defaultPet(null).id') === 'pet_000001' && ev('defaultPet(null).no') === '002', `defaultPet() 规则返回 NO.${ev('defaultPet(null).no')} ${ev('defaultPet(null).name')}`);
ok($$('.pitem .tag.def').length === 1 && !!$$('.pitem')[0].querySelector('.tag.def'), '首位带「默认」角标且仅一处');
ok(/已按「可生蛋」默认规则隐藏 57 只/.test(text('#m-count')), `计数行说明：${text('#m-count')}`);
// 兜底：显式切到「不可生蛋」仍可查看/选取被排除的精灵
$('[data-b="unknown"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok($$('.pitem').length === 57, `「不可生蛋」筛选 57 只 (${$$('.pitem').length})`);
ok($$('.pitem').every(e => e.querySelector('.tag.bad')), '该列表每项都带「未发现」标签');
ok($$('.pitem .tag.def').length === 0, '查看不可生蛋列表时不打「默认」角标');
const got = pickByName('迪莫');
ok(got === '迪莫', `选中「${got}」`);
ok(!$('#modal').classList.contains('show'), '选完自动关闭');
// 复位默认规则，避免影响后续用例
$('[data-b="breed"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
cards = $$('.pair');
ok(cards.length === 2 && cards.every(c => c.classList.contains('bad')), '未发现组 → 两组配对全部失败');
const whyA = firstKinds(cards);
ok(whyA.some(x => x.bads.some(b => /未发现/.test(b))), '失败依据指出「未发现」蛋组');
ok(/修复建议/.test(cards[0].querySelector('.pair-f').textContent), '失败卡片输出修复建议');
console.log('        ' + whyA[0].bads.map(b => b.slice(0, 52)).join(' / '));
ok(text('#vtext').includes('无法生蛋'), `结论翻转：${text('#vtext')}`);

// 5b 性别（把中间改为雌性）
btn('same');                       // 先恢复
$$('.ncard')[1].querySelector('[data-act="sex"][data-s="F"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
cards = $$('.pair');
const whyB = firstKinds(cards).flatMap(x => x.bads);
ok(cards.every(c => c.classList.contains('bad')), '中间小窝改为雌性 → 两组失败');
ok(whyB.some(b => /两只都是雌性|同性/.test(b)), '失败依据指出同性无法生蛋');
console.log('        ' + whyB.join(' / ').slice(0, 160));

// 5c 跨蛋组：先统一到妖精组，再把两侧固定成「不含动物组 / 拟人组」的妖精组精灵
// （喵喵 = 动物组·拟人组，这样替换中间窝后必然生殖隔离；统一蛋组本身是随机的，故这里显式定死）
sameAs(7);
const safePets = ev(`JSON.stringify(PETS.filter(p => !unknownOnly(p) && sexAvail(p) !== '' &&
  realGroups(p).includes(7) && !realGroups(p).includes(6) && !realGroups(p).includes(9)).slice(0, 2).map(p => p.id))`);
ev(`(function(){
  const ids = ${safePets};
  const ns = state.nests.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  state.nests = state.nests.map(n => {
    const i = ns.findIndex(m => m.id === n.id);
    return { ...n, petId: ids[i % ids.length], sex: i === 1 ? 'M' : 'F' };
  });
  renderAll(); return 1;
})()`);
openPickerAt(1);
pickByName('喵喵');
cards = $$('.pair');
const whyC = firstKinds(cards).flatMap(x => x.bads);
ok(cards.every(c => c.classList.contains('bad')), '换成另一蛋组的「喵喵」→ 两组失败');
ok(whyC.some(b => /生殖隔离|无交集/.test(b)), '失败依据指出蛋组无交集（生殖隔离）');
ok(!whyC.some(b => /两只都是/.test(b)), '性别判定仍通过，失败原因只在蛋组');
console.log('        ' + whyC.join(' / ').slice(0, 185));

// 5d wiki 未录性别的赛季精灵（S4 奇遇等 27 只）→ 默认公母均可，可正常配对
//    注：果实立方人属「未发现」蛋组，会被默认「可生蛋」规则过滤，故先切「全部精灵」再选
btn('same');
openPickerAt(1);
ok(!$$('.pitem').some(e => /果实立方人/.test(e.textContent)), '未发现组的「果实立方人」默认不出现在列表（新规则生效）');
$('[data-b="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
pickByName('果实立方人');
$('[data-b="breed"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const nc1 = $$('.ncard')[1];
ok(!nc1.querySelector('[data-act="sex"][data-s="M"]').disabled, 'wiki 未录性别的精灵「♂」按钮可用');
ok(!nc1.querySelector('[data-act="sex"][data-s="F"]').disabled, 'wiki 未录性别的精灵「♀」按钮可用');
ok(/wiki 未录性别/.test(nc1.textContent), '面板标注「wiki 未录性别 · 默认公母均可」');

// 5e 仅雌性作为母本
btn('same');
openPickerAt(0);
pickByName('水蓝蓝');
const nc0 = $$('.ncard')[0];
ok(nc0.querySelector('[data-act="sex"][data-s="M"]').disabled, '仅雌性精灵的「♂」按钮被禁用');
ok(/仅雌性/.test(nc0.textContent), '面板标注「仅雌性 · 只能作为母本」');

console.log('\n=== 6. 相邻规则：四向 vs 八向 ===');
tpl('tri');
ok($('#mode-seg button.on').dataset.m === 'diag', '「三角环绕」自动切到八向含斜角');
ok(S().nests === 3, `模板放置 3 窝 (${S().nests})`);
const diagAdj = S().adj;
ok(diagAdj === 3, `八向相邻配对 3 组（三窝两两相邻，含斜角）(${diagAdj})`);
$$('#mode-seg button').find(b => b.dataset.m === 'orth').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const orthAdj = S().adj;
ok(orthAdj === 2, `切回四向紧贴后降为 2 组（斜角那组不再成立）(${orthAdj})`);

console.log('\n=== 7. 布局模板 / 批量 / 清空 ===');
tpl('twopair');
ok(S().nests === 4, `「双组并行」放置 4 窝 (${S().nests})`);
ok(S().adj === 2, `双组并行恰好 2 组相邻 (${S().adj})`);
btn('same');
ok(S().okp === 2, `统一蛋组后 2 组可生蛋 (${S().okp})`);

// —— 7a 「统一蛋组」随机换组（不再永远锁死在最大蛋组） ——
ok(ev('viableSameGroups().length') >= 5, `可统一的蛋组共 ${ev('viableSameGroups().length')} 个`);
ok(ev('viableSameGroups().includes(7)'), '最大的「妖精组」也在随机候选内');
const seenG = new Set();
let sameRepeat = false, sameBad = false, prevG = null;
for (let i = 0; i < 16; i++){
  btn('same');
  const g = +ev('lastSameGid');
  if (prevG !== null && g === prevG) sameRepeat = true;
  prevG = g;
  seenG.add(g);
  if (!ev('state.nests.every(n=>n.petId && realGroups(PETMAP[n.petId]).includes(lastSameGid) && sexAvail(PETMAP[n.petId])!=="")')) sameBad = true;
}
ok(seenG.size >= 3, `连点 16 次换到 ${seenG.size} 个不同蛋组（不再只有一个组别）`);
ok(!sameRepeat, '连续两次点「统一蛋组」不会停在同一蛋组');
ok(!sameBad && S().okp === 2, '每次统一后的精灵都属于该蛋组且配对成立');
ok(ev('state.nests.every(n=>effSex(n)!==null)'), '统一后每个小窝都定好了性别');
console.log('        换到的蛋组：' + Array.from(seenG).sort((a, b) => a - b).map(g => ev('gName(' + g + ')')).join(' / '));

btn('rand');
ok(S().okp >= 1, `随机填充后仍有 ${S().okp} 组可生蛋（自动修复生效）`);

// —— 7b 「随机填充」：小窝满了也要能重排（此前只填空窝，统一蛋组填满后成死键） ——
for (let i = 0; i < 3; i++) btn('same');                 // 先连点几次统一蛋组，把 4 个窝全部填满
ok(ev('state.nests.every(n=>n.petId)'), '统一蛋组后 4 个窝全部入住');
const beforePets = ev('JSON.stringify(state.nests.map(n=>n.petId).sort())');
btn('rand');
const afterPets = ev('JSON.stringify(state.nests.map(n=>n.petId).sort())');
ok(afterPets !== beforePets, '小窝已满时点「随机填充」仍会重新随机（不再是死键）');
ok(ev('state.nests.every(n=>effSex(n)!==null)'), '重排后每个小窝性别已定');
ok(S().okp >= 1, `重排后仍有 ${S().okp} 组可生蛋`);
ok(/重新随机/.test(text('#toast')), `提示文案：${text('#toast')}`);

// 有空窝时只填空窝，保留手动放好的精灵
btn('clear');
tpl('twopair');
ev('(function(){const n=state.nests[0]; n.petId="pet_000001"; n.sex="F"; renderAll(); return 1})()');  // 手动放「喵喵」
const keepId = ev('state.nests[0].petId');
btn('rand');
ok(ev('state.nests[0].petId') === keepId, '有空窝时「随机填充」不动已有精灵');
ok(ev('state.nests.every(n=>n.petId)'), '空窝被填满');
ok(/随机填充 \d+ 个空窝/.test(text('#toast')), `提示文案：${text('#toast')}`);

btn('clear');
ok(S().nests === 0, '清空后 0 个小窝');
ok(text('#vtext').includes('小窝不足'), `空布局结论：${text('#vtext')}`);
ok(/还没有小窝/.test(text('#nests')), '空状态文案正确');

console.log('\n=== 8. 网格尺寸 ===');
const cs = $('#cols'); cs.value = '12'; cs.dispatchEvent(new w.Event('change', { bubbles: true }));
ok($$('.cellbox').length === 72, `12 列 → 72 格 (${$$('.cellbox').length})`);
const rs = $('#rows'); rs.value = '3'; rs.dispatchEvent(new w.Event('change', { bubbles: true }));
ok($$('.cellbox').length === 36, `3 行 → 36 格 (${$$('.cellbox').length})`);
tpl('line3');
ok(S().nests === 3, '缩小网格后仍能应用模板');

/* === 9. 精灵图标：异步跑（jsdom 大段 innerHTML 解析后查询需让出事件循环），
       并先重新布置 3 个有精灵的小窝（前面第 7 节已清空） === */
setTimeout(() => {
  console.log('\n=== 9. 精灵图标 ===');
  const iconData = w.JSON.parse(d.getElementById('icon-data').textContent);
  ok(Object.keys(iconData).length === 662, `图标映射 662 条 (${Object.keys(iconData).length})`);
  ok(Object.values(iconData).every(u => u.startsWith('data:image/webp;base64,')), '全部为内联 WebP data URI');
  tpl('line3'); btn('same');   // 3 个小窝全部入住精灵
  ok($$('.nest .pic img').length === 3, `画布小窝头像 3/3 (${$$('.nest .pic img').length})`);
  ok($$('.ncard .petchip .pic img').length === 3, `小窝面板头像 3/3 (${$$('.ncard .petchip .pic img').length})`);
  const q = $('#q'); q.value = ''; q.dispatchEvent(new w.Event('input', { bubbles: true }));  // 清掉残留搜索词
  openPickerAt(0);
  ok($$('.pitem').length === 605, `选择器列表 605 项（默认只列可生蛋精灵）(${$$('.pitem').length})`);
  ok($$('.pitem .pic img').length === 605, `选择器列表头像 605/605 (${$$('.pitem .pic img').length})`);
  ok($$('.pitem .pic img').every(i => i.src.startsWith('data:image/webp')), '列表头像均为内联 WebP');
  ok($$('.whoside .pic img').length >= 2, `报告卡配对头像 (${$$('.whoside .pic img').length})`);

  /* === 10. 赛季奇遇组别 + season/role 标识字段（S1~S5） === */
  console.log('\n=== 10. 赛季奇遇组别（S1~S5） ===');
  const db = w.JSON.parse(d.getElementById('pet-data').textContent);
  const SM = {};
  db.seasons.forEach(s => SM[s.id] = s);
  ok(db.seasons.length === 5, `注入 5 个赛季元数据 (${db.seasons.length})`);
  ok(['S1', 'S2', 'S3', 'S4'].every(id => SM[id] && SM[id].label && SM[id].ball && SM[id].trigger && SM[id].location),
     '每赛季含 赛季名/专属球/触发条件/出现地点');
  console.log('        ' + db.seasons.map(s => `${s.id} ${s.label}(${s.ball})`).join(' | '));
  const perSeason = {};
  db.seasons.forEach(s => perSeason[s.id] = db.pets.filter(p => p.season === s.id).length);
  ok(perSeason.S1 === 17 && perSeason.S2 === 17 && perSeason.S3 === 18 && perSeason.S4 === 14,
     `各赛季精灵数 S1/S2/S3/S4 = ${perSeason.S1}/${perSeason.S2}/${perSeason.S3}/${perSeason.S4}`);
  const enc = db.pets.filter(p => p.role === 'encounter');
  const evo = db.pets.filter(p => p.role === 'evolution');
  ok(enc.length === 40 && evo.length === 43, `形态角色：奇遇基础 40 + 进化 43 (${enc.length}/${evo.length})`);
  ok(db.pets.filter(p => !p.season).length === 662 - 83, `普通精灵 season=null 579 只 (${db.pets.filter(p => !p.season).length})`);
  ok(db.pets.every(p => p.season ? (p.role === 'encounter' || p.role === 'evolution') : p.role === null),
     'season 与 role 取值成对合法');
  ok(db.pets.filter(p => p.season).every(p => !p.g.some(g => g === 0)), '赛季标识不污染蛋组字段 g');
  // 各赛季名单抽查
  const t = (sid, name) => db.pets.some(p => p.season === sid && p.title === name);
  ok(t('S1', '贝瑟') && t('S1', '月牙雪熊'), 'S1 含贝瑟/月牙雪熊');
  ok(t('S2', '小丑豆豆') && t('S2', '牵线木偶'), 'S2 含小丑豆豆/牵线木偶');
  ok(t('S3', '十字蝌蚪') && t('S3', '稻草守护者'), 'S3 含十字蝌蚪/稻草守护者（含进化）');
  ok(t('S4', '幽铃') && t('S4', '布灵'), 'S4 含幽铃/布灵');
  // 编号不唯一陷阱：NO.329 同时有「夜枭」与「暗夜颅主（首领形态）」
  const n329 = db.pets.filter(p => String(p.no) === '329');
  ok(n329.length === 2 && n329.filter(p => p.season === 'S1').length === 1, `NO.329 双形态仅标记名单内那一只`);
  // 筛选芯片
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  openPickerAt(0);
  const chips = Array.from($$('#nfilters .fchip')).map(c => c.dataset.n);
  ok(chips.join(',') === 'all,S1,S2,S3,S4,S5', `筛选芯片 全部来源+S1~S5 (${chips.join(',')})`);
  const cntOf = sid => { $('#nfilters').querySelector(`[data-n="${sid}"]`).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return $$('.pitem').length; };
  ok(cntOf('S1') === 17, `S1 筛选 17 只 (${$$('.pitem').length})`);
  ok($$('.pitem').every(it => it.querySelector('.tag.enc.s1')), 'S1 列表项带 s1 配色的赛季奇遇徽章');
  ok(cntOf('S3') === 18, `S3 筛选 18 只 (${$$('.pitem').length})`);
  ok($$('.pitem').every(it => it.querySelector('.tag.enc.s3')), 'S3 列表项带 s3 配色徽章');
  ok($$('.pitem .tag.enc .rl').length === 18, '徽章内标注形态角色');
  // 搜索：赛季标识 / 赛季名 / 专属球 / 触发机制 / 地点（先复位赛季筛选，避免与筛选叠加）
  $('#nfilters').querySelector('[data-n="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const search = kw => { const qe = $('#q'); qe.value = kw; qe.dispatchEvent(new w.Event('input', { bubbles: true })); return $$('.pitem').length; };
  ok(search('S2') === 17, `搜索「S2」命中 17 只 (${$$('.pitem').length})`);
  ok(search('狂欢怪谈') === 17, `搜索赛季名「狂欢怪谈」命中 17 只 (${$$('.pitem').length})`);
  ok(search('奇趣球') === 17, `搜索专属球「奇趣球」命中 17 只 (${$$('.pitem').length})`);
  ok(search('星陨流光') === 14, `搜索触发机制「星陨流光」命中 14 只 (${$$('.pitem').length})`);
  ok(search('智慧出版社') === 18, `搜索出现地点「智慧出版社」命中 18 只 (${$$('.pitem').length})`);
  ok(search('奇遇') === 83, `搜索「奇遇」命中 83 只 (${$$('.pitem').length})`);
  search('');
  $('#nfilters').querySelector('[data-n="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok($$('.pitem').length === 605, `恢复全部来源 605 只（默认可生蛋规则生效）(${$$('.pitem').length})`);
  // v11：空态兜底 —— 「未发现」蛋组 + 默认可生蛋规则 → 0 结果时给出「显示全部精灵」一键放宽
  $('#gfilters').querySelector('[data-g="1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok($$('.pitem').length === 0 && /没有可生蛋的精灵/.test($('#plist').textContent), '「未发现」蛋组 + 可生蛋规则 → 空态提示');
  ok(!!$('#plist [data-b="all"]'), '空态提供「显示全部精灵」兜底按钮');
  $('#plist [data-b="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok($$('.pitem').length === 57, `一键放宽后列出该蛋组 57 只 (${$$('.pitem').length})`);
  $('#gfilters').querySelector('[data-g="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const qz = $('#q'); qz.value = '不存在zzz'; qz.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok($$('.pitem').length === 0 && /没有匹配的精灵/.test($('#plist').textContent), '关键词无命中 → 另一类空态提示');
  ok(!!$('#plist [data-reset-filter]'), '空态提供「清空全部筛选条件」兜底按钮');
  $('#plist [data-reset-filter]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok($('#q').value === '' && $$('.pitem').length === 605 && $('[data-b="breed"]').classList.contains('on'),
     '一键清空后回到默认（关键词清空 + 可生蛋 + 605）');
  // 面板赛季信息条 + 画布角标
  pickByName('幽铃');
  ok($$('.ncard .tag.enc').length >= 1, '小窝面板带赛季奇遇徽章');
  ok($$('.ncard .seasonbox').length >= 1, '小窝面板带赛季信息条');
  const sbText = d.querySelector('.ncard .seasonbox').textContent.replace(/\s+/g, ' ');
  ok(/月涌狂想/.test(sbText) && /星陨流光/.test(sbText) && /失重球/.test(sbText), '信息条含赛季名/触发条件/专属球');
  ok($$('.nest .av.enc.s4').length >= 1, '画布小窝带 S4 角标');
  ok((d.querySelector('.nest .av.enc.s4') || {}).textContent === 'S4', '角标文本为赛季标识');
  // 规则说明区的赛季一览已按用户要求整体移除（赛季信息保留在选择器筛选芯片 tooltip 中）
  ok(!d.getElementById('seasondoc') && !d.querySelector('.note.season-doc'), '规则说明区不再有「赛季奇遇」一览块');
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  /* ==================== 8. 精灵配对推荐（选择器内） ==================== */
  console.log('\n=== 8. 精灵配对推荐（选择器内） ===');
  const ev = expr => w.eval(expr);
  const clickEl = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // —— 8.1 基准自动建立 ——
  ok($$('.ncard.base').length === 1, `自动出现 1 个配对基准卡片 (${$$('.ncard.base').length})`);
  ok(/配对基准/.test(d.getElementById('basebar').textContent), '顶部提示条标注配对基准与性别');
  ok($$('.recbox').length === 0, '小窝列表不再内嵌推荐区（保持原有展示）');
  // 显式指定中间的（雄性）小窝为配对基准：一字并排 F-M-F → 两侧各得 1 个 ★ 角标
  // （基准若落在两端雌窝上，另一只雌窝本就配不上，故这里定死基准以保证断言稳定）
  // 先把画布摆成稳定的 F-M-F（同属妖精组），再指定中间雄性窝为基准 → 两侧各得 1 个 ★ 角标
  // （避免受前面小节随机换组/换精灵的影响，保证断言稳定）
  tpl('line3'); sameAs(7);
  ev('(function(){setRecBase(state.nests[1]); renderAll(); return 1})()');
  ok($$('.nest .stardot').length === 2, `画布同蛋组小窝显示 ★ 角标 (${$$('.nest .stardot').length})`);
  ok($$('.nest .stardot').every(s => s.textContent.trim() === '★'), '角标图形为 ★（不再用 ❤，与判定徽章区隔）');
  ok($$('.nest .heartdot').length === 0, '画布小窝上不存在 ❤ 角标');

  // —— 8.2 选择器内推荐栏 + 排序 + 角标 ——
  openPickerAt(0);
  const qclr = $('#q'); qclr.value = ''; qclr.dispatchEvent(new w.Event('input', { bubbles: true }));  // 清掉前置测试残留的搜索词
  const pf = d.getElementById('prefilter');
  ok(d.getElementById('modal').classList.contains('show') && pf.style.display !== 'none' && /配对基准/.test(pf.textContent), '选择器顶部出现配对推荐栏');
  const baseTitle = ev('recBase(state.pickerFor).pet.title');
  ok(pf.textContent.includes(baseTitle), `推荐栏标注基准「${baseTitle}」`);
  ok(ev('recBase(state.pickerFor).nest.id') !== $$('.ncard')[0].dataset.ncard, '基准自动排除正在选的窝');
  ok(Array.from($$('.pitem')).slice(0, 5).every(it => it.querySelector('.tag.pairok')), '可配对精灵排在列表最前（★ 角标）');
  ok(Array.from($$('.pitem .tag.pairok')).every(t => /^★ 可配对/.test(t.textContent.trim())), '可配对角标统一使用 ★ 图标');
  ok($$('.pitem.nopair').length > 0, '不可配对精灵被置灰标记');
  ok(Array.from($$('.pitem .tag.pairok')).every(t => /建议[♂♀]/.test(t.textContent)), '可配对角标带建议性别');
  const nop = $$('.pitem.nopair')[0];
  const nopTag = nop && Array.from(nop.querySelectorAll('.tag')).find(t => /不可配对/.test(t.textContent));
  ok(nopTag && nopTag.title && nopTag.title.length > 4, '不可配对项悬停显示原因');
  ok(/仅看可配对/.test(pf.textContent), '推荐栏提供「仅看可配对」快捷筛选');
  ok(/可配对 \d+ 只/.test(d.getElementById('m-count').textContent), '计数行显示可配对数量');

  // —— 8.3 仅看可配对筛选 ——
  const cntAll = $$('.pitem').length;
  clickEl(pf.querySelector('[data-p="ok"]'));
  const cntOk = $$('.pitem').length;
  ok(cntOk > 0 && cntOk < cntAll, `「仅看可配对」筛选生效 (${cntAll} → ${cntOk})`);
  ok($$('.pitem.nopair').length === 0 && $$('.pitem').every(it => it.querySelector('.tag.pairok')), '筛选后每一项均可配对');
  clickEl(pf.querySelector('[data-p="all"]'));
  ok($$('.pitem').length === cntAll, '切回「全部精灵」恢复列表');

  // —— 8.4 选中推荐精灵 → 自动放入 + 性别互补 ——
  const nid0 = $$('.ncard')[0].dataset.ncard;
  const firstOk = $$('.pitem').find(it => it.querySelector('.tag.pairok'));
  const pidSel = firstOk.dataset.id;
  clickEl(firstOk);
  ok(!d.getElementById('modal').classList.contains('show'), '选中后选择器自动关闭');
  ok(ev(`String(state.nests.find(m=>m.id===${JSON.stringify(nid0)}).petId)===String(${JSON.stringify(pidSel)})`), '选中的推荐精灵已放入该窝');
  ok(ev(`(function(){const b=recBase();const n=state.nests.find(m=>m.id===${JSON.stringify(nid0)});return pairFeasible(b,PETMAP[n.petId])!==null})()`), '放入的精灵确实可与基准成功配对');
  ok(ev(`(function(){const b=recBase();const n=state.nests.find(m=>m.id===${JSON.stringify(nid0)});return effSex(n)!==null&&effSex(n)!==effSex(b.nest)})()`), '放入后双方性别自动补成一公一母');
  ok($$('.nest .stardot').length >= 1, '画布上该窝出现 ★ 角标');
  ok(ev('state.recBaseId') === d.querySelector('.ncard.base').dataset.ncard, '放入精灵不会顶掉已有配对基准');

  // —— 8.5 数据层判定（复用规则引擎） ——
  ok(ev('(function(){const b=recBase();return pairFeasible(b,PETMAP[b.pet.id])!==null})()'), '同种精灵可成功配对');
  ok(ev('(function(){const b=recBase();return pairFeasible(b,PETS.filter(unknownOnly)[0])===null})()'), '「未发现」组精灵判为不可配对（规则④）');
  ok(ev('(function(){const b=recBase();return pairFeasible(b,PETS.filter(p=>sexAvail(p)==="")[0])===null})()'), '无性别精灵判为不可配对（规则③）');
  ok(ev('(function(){const b=recBase();const bg=realGroups(b.pet);const other=PETS.find(p=>!unknownOnly(p)&&sexAvail(p)!==""&&!realGroups(p).some(g=>bg.includes(g)));return other?pairFeasible(b,other)===null:true})()'), '无共享蛋组的精灵判为不可配对（规则⑤）');
  ok(ev('(function(){const b=recBase();const pool=recPool(b);return pool.length>0&&pool.every(x=>pairFeasible(b,x.pet)!==null)})()'), '推荐池内每一只都可与基准成功配对');
  ok(ev('(function(){const b=recBase();const bg=realGroups(b.pet);return recPool(b).every(x=>x.shared.length>0&&x.shared.every(g=>bg.includes(g)))})()'), '推荐均与基准共享蛋组');
  ok(ev('(function(){const b=recBase();const s=effSex(b.nest);return recPool(b).every(x=>(s==="M"?x.candSex==="F":s==="F"?x.candSex==="M":true))})()'), '基准已定性别时推荐性别自动互补');

  // —— 8.6 基准不可繁育 → 推荐栏给出提示 ——
  ev('(function(){const b=recBase();b.nest.petId=PETS.filter(unknownOnly)[0].id;b.nest.sex=null;renderAll();return 1})()');
  openPickerAt(2);   // 打开非基准窝的选择器
  const pf2 = d.getElementById('prefilter');
  ok(pf2.style.display !== 'none' && /无法与任何精灵配对/.test(pf2.textContent), '基准不可繁育时推荐栏提示无法配对');
  ok(!pf2.querySelector('[data-p="ok"]'), '无可配对对象时不提供筛选按钮');
  ok($$('.pitem .tag.pairok').length === 0, '列表中不出现可配对角标');
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // —— 8.7 未设置基准 → 不展示推荐，保持原有逻辑 ——
  btn('clear');
  ok(!d.querySelector('.ncard.base') && d.getElementById('basebar').textContent.trim() === '', '清空后无基准标记与提示条');
  tpl('line3');
  openPickerAt(0);
  ok(d.getElementById('prefilter').style.display === 'none', '未设置基准时选择器不显示推荐栏');
  ok($$('.pitem .tag.pairok').length === 0 && $$('.pitem.nopair').length === 0, '列表保持原有展示（无推荐角标）');
  pickByName('喵喵');
  ok(!!d.querySelector('.ncard.base'), '放入精灵的窝自动成为配对基准');
  openPickerAt(2);
  ok(d.getElementById('prefilter').style.display !== 'none', '再开其它窝的选择器即出现推荐栏');
  ok($$('.pitem .tag.pairok').length > 0, '推荐角标正常出现');
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // —— 8.8 退出推荐 ——
  clickEl(d.querySelector('#basebar [data-act="recoff"]'));
  ok(d.getElementById('basebar').textContent.trim() === '', '「退出推荐」后基准提示条消失');
  ok(ev('state.recBaseId === null'), '基准记忆已清除');
  openPickerAt(1);
  ok(d.getElementById('prefilter').style.display === 'none' && $$('.pitem .tag.pairok').length === 0, '退出后选择器恢复原有展示逻辑');
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  /* ==================== 9. 手机 / 窄屏适配 ==================== */
  console.log('\n=== 9. 手机 / 窄屏适配 ===');
  const setWidth = px => Object.defineProperty(w, 'innerWidth', { value: px, configurable: true, writable: true });
  const tap = (node, type, opt) => {
    const e = new w.Event(type, { bubbles: true });
    Object.assign(e, { clientX: 120, clientY: 120, pointerId: 1, button: 0 });
    Object.assign(e, opt || {});
    node.dispatchEvent(e);
  };

  // —— 9.1 桌面宽度：格子尺寸与旧版一致，不受手机适配影响 ——
  setWidth(1280);
  ev('renderAll()');
  ok(ev('CELL') === 78, `桌面端格子尺寸保持 78px (${ev('CELL')})`);
  ok(!d.getElementById('board').classList.contains('sm') && !d.getElementById('board').classList.contains('xs'), '桌面端不启用小格子压缩样式');
  ok(ev('isPhone()') === false, '1280px 宽不识别为手机布局');
  if (d.activeElement && d.activeElement.blur) d.activeElement.blur();
  openPickerAt(0);
  ok(d.activeElement === d.getElementById('q'), '桌面端打开选择器仍自动聚焦搜索框（保持原行为）');
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // —— 9.2 手机宽度：格子自适应缩小，网格落在屏幕内 ——
  setWidth(390);
  ok(ev('isPhone()') === true, '390px 宽识别为手机布局');
  ev('renderAll()');
  const cellP = ev('CELL'), colsNow = ev('state.cols');
  ok(cellP < 78, `手机端格子自适应缩小到 ${cellP}px（原 78px）`);
  ok(cellP >= 42, `格子不低于 42px 触摸下限 (${cellP}px)`);
  ok(cellP * colsNow === parseFloat(d.getElementById('board').style.width), `画布宽度与「列数 × 格子」一致 (${colsNow} × ${cellP})`);
  ok(d.getElementById('board').classList.contains('sm') || d.getElementById('board').classList.contains('xs'), '手机端启用小格子压缩样式（图标/字号同步收缩）');
  const nestW = parseFloat($$('.nest')[0].style.width);
  ok(Math.abs(nestW - (cellP - 6)) < 0.01, `小窝宽度跟随格子尺寸 (${nestW}px)`);
  // 列数较少时应能完整落在屏幕内
  ev('state.cols=6; renderAll()');
  const cell6 = ev('CELL');
  ok(cell6 > 42 && cell6 * 6 <= 390, `6 列网格完整落在 390px 内，格子放大到 ${cell6}px`);
  ev('state.cols=8; renderAll()');
  ok(ev('CELL') * 8 <= 390, `8 列（默认）同样完整可见 (${ev('CELL') * 8}px)`);

  // —— 9.3 提示文案按设备分流 ——
  ok($$('.hint .phone-only').length === 2, '提示区带 2 条手机专属操作说明');
  ok($$('.hint .desk-only').length === 2, '桌面专属说明保留（右键删除 / 点击小窝）');

  // —— 9.4 选择器：筛选条件折叠 ——
  if (d.activeElement && d.activeElement.blur) d.activeElement.blur();
  openPickerAt(0);

  // —— 9.4b 手机端防字体重叠：禁用字体自动放大 + 文本行允许换行 ——
  ok(ev('getComputedStyle(document.documentElement).webkitTextSizeAdjust === "100%" || getComputedStyle(document.documentElement).textSizeAdjust === "100%"'),
     '已禁用 Android 字体自动放大（text-size-adjust:100%，防行内小字画错位置重叠）');
  const cssNorm = d.querySelector('style').textContent.replace(/\s+/g, '');
  ok(cssNorm.includes('.pitem.nm{white-space:normal'), '手机端精灵名/形态行允许换行（不依赖省略号裁切，异常放大时撑高卡片而非画飞）');
  ok(cssNorm.includes('.pitem.ntypes{white-space:normal'), '手机端编号/属性行允许换行');
  ok(cssNorm.includes('.petchip.txtb{white-space:normal') && cssNorm.includes('.petchip.txtsmall{white-space:normal'), '手机端小窝信息条文本允许换行');
  ok(cssNorm.includes('text-size-adjust:100%'), '样式表包含全局 text-size-adjust:100% 规则');
  ok(cssNorm.includes('grid-auto-rows:max-content'), '精灵列表 grid 行高用 max-content（规避 Chrome 手机视口下 auto 行塌成 20px 的渲染问题）');
  ok(cssNorm.includes('grid-template-columns:1fr'), '手机端精灵列表为单列（避免两列窄卡内容堆叠）');

  // —— 9.4c 修边：空窝居中不裁切 + 状态标签不被同行按钮拉伸 ——
  ok(cssNorm.includes('.nest.empty{padding-top:3px;justify-content:center}'),
     '空窝整窝垂直居中（不再为顶部 #序号 预留 14px 而视觉偏低）');
  ok(cssNorm.includes('.board.xs.nest.empty{padding-top:1px;justify-content:center}'),
     '极小格子里空窝同样居中（原先内容高 36px > 可用 28px，底部文字被裁掉）');
  ok(cssNorm.includes('.board.sm.nest.empty-in{font-size:9.5px;gap:1px}') && cssNorm.includes('.board.sm.nest.empty-in.plus{font-size:15px}'),
     'sm 档空窝「＋/空窝」随格子收缩');
  ok(cssNorm.includes('.board.xs.nest.empty-in{font-size:8.5px;gap:0}') && cssNorm.includes('.board.xs.nest.empty-in.plus{font-size:12px}'),
     'xs 档空窝「＋/空窝」随格子收缩');
  ok(cssNorm.includes('.ncard-top.acts{display:flex;align-items:center'), '小窝卡片操作行垂直居中（标签不再被同行按钮拉伸）');
  ok(cssNorm.includes('.ncard-top.acts.tag{white-space:nowrap;align-self:center;line-height:1.5}'), '状态标签自身也强制居中');
  ok(cssNorm.includes('.tagsline{display:flex;flex-wrap:wrap;align-items:center'), '小窝卡片标签行统一垂直居中');
  ok(cssNorm.includes('.pitem.r2{display:flex;flex-wrap:wrap;align-items:center'), '选择器标签行统一垂直居中');


  ok(!!d.getElementById('mfilter-toggle') && !!d.getElementById('mfilters'), '选择器提供「筛选条件」折叠开关');
  ok(!d.getElementById('mfilters').classList.contains('open'), '手机端默认折叠筛选条件（列表优先可见）');
  ok(d.activeElement !== d.getElementById('q'), '手机端打开选择器不自动聚焦（避免软键盘遮挡列表）');
  ok(d.body.style.overflow === 'hidden', '打开选择器时锁定背景滚动');
  ok($$('.pitem').length > 0, '精灵列表照常渲染');
  clickEl(d.getElementById('mfilter-toggle'));
  ok(d.getElementById('mfilters').classList.contains('open'), '点击「筛选条件」展开筛选区');
  ok(/收起筛选/.test(d.getElementById('mfilter-toggle').textContent), '展开后按钮文案变为「收起筛选」');
  clickEl($$('#gfilters .fchip')[1]);
  ok(/项生效/.test(d.getElementById('mfilter-toggle').textContent), '筛选条件生效时折叠按钮给出计数提示');
  clickEl(d.getElementById('mfilter-toggle'));
  ok(!d.getElementById('mfilters').classList.contains('open'), '可再次收起筛选区');
  ev('state.filter.g="all"; state.filter.q=""; renderPickerList()');

  // —— 9.5 手机端轻点小窝 → 直接打开精灵选择器（拖动仍是移动位置） ——
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(!d.getElementById('modal').classList.contains('show'), '选择器可正常关闭');
  ok(d.body.style.overflow === '', '关闭后恢复背景滚动');
  const tapNode = $$('.nest')[0];
  tap(tapNode, 'pointerdown');
  tap(tapNode, 'pointerup');
  ok(d.getElementById('modal').classList.contains('show'), '手机端轻点小窝直接打开精灵选择器');
  ok(d.querySelector('#m-nest').textContent === '#N.' + ev(`state.nests.find(m=>String(m.id)===${JSON.stringify(tapNode.dataset.nid)}).seq`), '选择器标题指向被点的小窝');
  d.querySelector('#modal [data-close]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // —— 9.6 拖动仍然是移动位置（位移超过阈值时不弹选择器） ——
  const dragNode = $$('.nest')[0];
  const beforeX = ev(`state.nests.find(m=>String(m.id)===${JSON.stringify(dragNode.dataset.nid)}).x`);
  tap(dragNode, 'pointerdown');
  tap(dragNode, 'pointermove', { clientX: 20, clientY: 120 });
  tap(dragNode, 'pointerup', { clientX: 20, clientY: 120 });
  ok(!d.getElementById('modal').classList.contains('show'), '拖动小窝不会误触选择器');
  ok(ev(`state.nests.find(m=>String(m.id)===${JSON.stringify(dragNode.dataset.nid)}).x`) !== beforeX, '拖动确实移动了小窝位置');

  // —— 9.7 恢复桌面宽度 ——
  setWidth(1280);
  ev('renderAll()');
  ok(ev('CELL') === 78, '恢复桌面宽度后格子回到 78px');
  ok(!d.getElementById('board').classList.contains('sm'), '桌面端移除小格子压缩样式');

  /* ==================== 11. 存档 / 分享 ==================== */
  console.log('\n=== 10. 存档 / 分享 ===');
  ok(!!d.getElementById('open-save'), '工具栏提供「存档 / 分享」入口');
  ok(!!d.getElementById('smodal') && !!d.getElementById('toast'), '存档面板与轻提示容器已就位');

  // 摆一套有辨识度的布局：一公一母配对 + 一个空窝 + 异色标记 + 一个远端孤立窝
  const pairTitles = ev(`(function(){
    const pool = PETS.filter(p => !unknownOnly(p) && sexAvail(p)==='MF');
    const a = pool[0];
    const b = pool.find(p => p.id!==a.id && realGroups(p).some(g=>realGroups(a).includes(g))) || pool[1];
    state.cols=8; state.rows=6; state.mode='orth'; state.seq=0;
    state.nests = [
      {id:'t1',seq:1,x:2,y:2,petId:a.id,sex:'M',shiny:false},
      {id:'t2',seq:2,x:3,y:2,petId:b.id,sex:'F',shiny:true},
      {id:'t3',seq:3,x:5,y:4,petId:null,sex:null,shiny:false}
    ];
    state.selected=null; state.recBaseId=null;
    syncToolbar(); renderAll();
    return a.title + '/' + b.title;
  })()`);
  ok($$('.nest').length === 3, `构造测试布局：3 个小窝（${pairTitles}）`);
  ok(ev('computeAll().okPairs.length') === 1, '其中 1 组可生蛋配对');

  // —— 11.1 分享码编解码往返 ——
  const codeA = ev('encodeLayout(layoutOf())');
  ok(/^E1\.8\.6\.o\./.test(codeA), `分享码格式为 E1.<列>.<行>.<模式>.…（${codeA}）`);
  ok(codeA.length < 120, `分享码足够短（${codeA.length} 字符），适合塞进链接`);
  ok(ev(`(function(){const L=decodeLayout(${JSON.stringify(codeA)});return !!L && L.cols===8 && L.rows===6 && L.mode==='orth' && L.nests.length===3})()`), '分享码可解析，网格尺寸与相邻规则一致');
  ok(ev(`(function(){const L=decodeLayout(${JSON.stringify(codeA)});const a=L.nests[0];return a.x===2&&a.y===2&&a.s==='M'&&a.k===false&&a.p===state.nests[0].petId})()`), '小窝位置 / 精灵 / 性别往返一致');
  ok(ev(`(function(){const L=decodeLayout(${JSON.stringify(codeA)});return L.nests[1].k===true})()`), '异色标记往返一致');
  ok(ev(`(function(){const L=decodeLayout(${JSON.stringify(codeA)});return L.nests[2].p===null&&L.nests[2].s===null})()`), '空窝（未放精灵）也能往返');
  ok(ev(`(function(){const L=decodeLayout(${JSON.stringify(codeA)});return L.nests.map(n=>n.p).join()===state.nests.map(n=>n.petId||'').join()})()`), '精灵顺序与画布一致');

  // 八向模式 / 其他网格
  ok(ev(`(function(){state.mode='diag';const c=encodeLayout(layoutOf());state.mode='orth';return decodeLayout(c).mode==='diag'})()`), '八向含斜角模式可往返');

  // —— 11.2 分享链接 ——
  const shareURL = ev(`buildShareURL(${JSON.stringify(codeA)})`);
  ok(shareURL.includes('#s=' + codeA), '分享链接把布局码放进 hash（不发给服务器）');
  ok(/^https:\/\//.test(shareURL), `分享链接是完整地址（${shareURL.slice(0, 46)}…）`);
  ok(ev(`decodeLayout(${JSON.stringify(shareURL)})!==null`), '整条链接可直接当分享码解析');
  ok(ev(`(function(){const L=decodeLayout('https://a.b/c/#s=' + ${JSON.stringify(codeA)} + '&x=1');return !!L && L.nests.length===3})()`), '链接带其它参数也能正确解析');
  ok(ev('decodeLayout("随便一段文字")===null'), '无效内容返回 null（不会误载入）');
  ok(ev('decodeLayout("E1.8.6.o.1,1,zz")===null'), '字段缺失的分享码被拒绝');
  ok(ev('decodeLayout("E1.99.99.o.1,1,1,f,0")===null'), '网格尺寸越界的分享码被拒绝');
  ok(ev('(function(){const L=decodeLayout("E1.4.3.o.9,9,1,f,0");return L===null||L.nests.length===0})()'), '超出网格范围的小窝被丢弃');
  ok(ev('(function(){const L=decodeLayout("E1.4.3.o.1,1,1,f,0|1,1,2,m,0");return L.nests.length===1})()'), '同格子重复小窝被去重');

  // —— 11.3 面板：打开 / 空状态 / 预填链接 ——
  btn('open-save');
  ok(d.getElementById('smodal').classList.contains('show'), '点「存档 / 分享」打开面板');
  ok(d.body.style.overflow === 'hidden', '面板打开时锁定背景滚动');
  ok(d.getElementById('shareurl').value === shareURL, '面板已自动填好当前布局的分享链接');
  ok(text('#share-note') === '当前布局', '链接标注来源为「当前布局」');
  ok(/还没有存档/.test(d.getElementById('slist').textContent), '首次打开显示空状态引导');

  // —— 11.4 保存多套布局 ——
  d.getElementById('savename').value = '测试布局 A';
  btn('save-now');
  ok($$('.sitem').length === 1, '保存后列表出现 1 条存档');
  ok(/测试布局 A/.test($$('.sitem')[0].textContent), '存档名称正确');
  ok(/3 个小窝/.test($$('.sitem')[0].textContent), '存档卡片显示小窝数量');
  ok(/1 组可生蛋/.test($$('.sitem')[0].textContent), '存档卡片统计可生蛋配对数');
  ok($$('.sitem .thumbs .pic').length === 2, '存档卡片显示精灵缩略图（空窝不计入）');
  ok(d.getElementById('savename').value === '', '保存后清空名称输入框');
  ok(ev(`JSON.parse(localStorage.getItem('egg-breeder.saves.v1')).length===1`), '存档已写入本机 localStorage');

  ev(`state.nests[0].sex='F'; state.nests[1].sex='F'; renderAll()`);   // 改成同性 → 不可生蛋
  d.getElementById('savename').value = '测试布局 B';
  btn('save-now');
  ok($$('.sitem').length === 2, '可同时保存多套孵蛋布局');
  ok(/测试布局 B/.test($$('.sitem')[0].textContent), '最新保存的排在最前');
  ok(/0 组可生蛋/.test($$('.sitem')[0].textContent), '统计随布局内容实时变化');

  // —— 11.5 载入存档 ——
  btn('clear');
  ok($$('.nest').length === 0, '清空画布');
  btn('open-save');
  clickEl($$('.sitem')[0].querySelector('[data-sact="load"]'));       // 载入 B（两窝皆雌）
  ok(!d.getElementById('smodal').classList.contains('show'), '载入后自动关闭面板');
  ok($$('.nest').length === 3, '载入存档完整还原 3 个小窝');
  ok(ev('state.nests.filter(n=>n.petId).every(n=>effSex(n)==="F")'), '性别随存档还原（两窝皆雌）');
  ok(ev('computeAll().okPairs.length') === 0, '还原后的判定结果与原布局一致（0 组可生蛋）');
  ok(ev('state.cols===8 && state.rows===6 && state.mode==="orth"'), '网格尺寸与相邻规则一并还原');

  btn('open-save');
  clickEl($$('.sitem')[1].querySelector('[data-sact="load"]'));       // 载入 A（一公一母）
  ok(ev('state.nests.filter(n=>n.petId).map(effSex).sort().join("")') === 'FM', '载入另一套布局为一公一母');
  ok(ev('computeAll().okPairs.length') === 1, '可生蛋配对数正确还原');
  ok(ev('state.nests.some(n=>n.shiny===true)'), '异色标记随存档还原');
  ok(ev('state.nests.every(n=>n.seq>=1)') && new Set(ev('state.nests.map(n=>n.seq)')).size === 3, '载入后小窝序号重新连续编号');

  // —— 11.6 分享某条存档 ——
  btn('open-save');
  clickEl($$('.sitem')[0].querySelector('[data-sact="share"]'));
  const codeShared = ev('_shareCode');
  ok(/^E1\./.test(codeShared), '「分享」按钮按该存档生成分享码');
  ok(d.getElementById('shareurl').value.includes(codeShared), '分享框切换为该存档的链接');
  ok(text('#share-note') === '测试布局 B', '链接标注来源为该存档名');

  // —— 11.7 导入分享码 / 链接 ——
  d.getElementById('importcode').value = codeA;
  btn('do-import');
  ok(!d.getElementById('smodal').classList.contains('show'), '导入后自动关闭面板');
  ok($$('.nest').length === 3, '导入分享码还原布局');
  ok(ev('computeAll().okPairs.length') === 1, '导入的布局判定结果正确');
  const tip = d.getElementById('sharetip');
  ok(tip.style.display !== 'none' && /别人分享的布局/.test(tip.textContent), '顶部出现「已载入别人分享的布局」提示条');
  // 用整条链接导入
  ev('state.nests=[]; state.seq=0; renderAll()');
  ev(`importCode(${JSON.stringify(shareURL)})`);
  ok($$('.nest').length === 3, '粘贴整条分享链接同样可以导入');
  // 打开分享链接（#s=…）自动还原
  ev('state.nests=[]; state.seq=0; renderAll()');
  ev(`location.hash = '#s=' + ${JSON.stringify(codeA)}`);
  const booted = ev('bootFromHash()');
  ok(booted === true && $$('.nest').length === 3, '带 #s= 打开页面时自动还原分享的布局');
  // 提示条 → 保存为我的存档
  clickEl(d.querySelector('#sharetip [data-tip="save"]'));
  ok(d.getElementById('smodal').classList.contains('show'), '提示条「保存为我的存档」打开面板');
  ok(d.getElementById('savename').value === '来自分享的布局', '预填存档名，方便直接保存');
  ev('closeSave()');

  // —— 11.8 改名 / 删除 ——
  w.prompt = () => '改过的名字';
  btn('open-save');
  clickEl($$('.sitem')[0].querySelector('[data-sact="rename"]'));
  ok($$('.sitem')[0].textContent.includes('改过的名字'), '存档可改名');
  ok(ev(`JSON.parse(localStorage.getItem('egg-breeder.saves.v1')).some(s=>s.name==='改过的名字')`), '改名已写回 localStorage');

  w.confirm = () => true;
  const beforeDel = $$('.sitem').length;
  clickEl($$('.sitem')[0].querySelector('[data-sact="del"]'));
  ok($$('.sitem').length === beforeDel - 1, '存档可删除');
  ok(ev(`JSON.parse(localStorage.getItem('egg-breeder.saves.v1')).length===${beforeDel - 1}`), '删除同步写回 localStorage');

  // —— 11.9 空布局不允许保存 ——
  ev('state.nests=[]; state.seq=0; renderAll()');
  const beforeEmpty = $$('.sitem').length;
  btn('save-now');
  ok($$('.sitem').length === beforeEmpty, '空布局不会产生新存档');
  ok(/还没有小窝/.test(d.getElementById('toast').textContent), '空布局保存时给出提示');

  // —— 11.10 关闭面板 ——
  d.querySelector('#smodal [data-sclose]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(!d.getElementById('smodal').classList.contains('show'), '面板可正常关闭');
  ok(d.body.style.overflow === '', '关闭后恢复背景滚动');

  // —— 11.11 手机端适配 ——
  const isCss = frag => d.querySelector('style').textContent.replace(/\s+/g, '').includes(frag);
  setWidth(390);
  ok(isCss('.sitem.actsbutton{min-height:34px'), '手机端存档操作按钮加大（便于点按）');
  ok(isCss('#savename,#importcode{font-size:16px'), '手机端输入框 16px 防 iOS 聚焦缩放');
  ok(isCss('.sharetip.sp{'), '手机端分享提示条按钮自适应铺开');
  setWidth(1280);

  console.log('\n=== 12. 一键补位（v12） ===');
  // —— 12.1 那行装饰文字已换成真按钮 ——
  ok(!/附近的窝可一键补位/.test(html), '标题里的「附近的窝可一键补位」纯文字已移除');
  ok(!!$('#fill'), '存在「✦ 一键补位」按钮');
  ok(/一键补位/.test($('#fill').textContent), '按钮文案 = ' + $('#fill').textContent.trim());
  ok(/把画布上的空窝自动补成可配对的精灵/.test($('#fill').getAttribute('title')), '按钮 title 说明了行为');

  // —— 12.2 一字并排 3 窝、只放中间那只 → 两侧空窝标记「可补位」——
  ev('state.nests=[]; state.seq=0; state.selected=null; state.recBaseId=null; renderAll()');
  tpl('line3');
  ev('(function(){ const bp = PETS.find(p => !unknownOnly(p) && sexAvail(p)==="MF"); const n = state.nests[0]; n.petId = bp.id; n.sex = "F"; state.recBaseId = n.id; renderAll(); })()');
  ok($$('.nest.fillable').length === 2, `空窝标记为「可补位」(${$$('.nest.fillable').length}/2)`);
  ok($$('.nest .stardot.ghost').length === 2, `空窝出现 ★ 角标 (${$$('.nest .stardot.ghost').length}/2)`);
  ok($$('.nest.fillable').every(n => /可补位/.test(n.textContent)), '空窝文案变为「＋ 可补位」（普通空窝仍是「＋ 空窝」）');
  ok(/一键补位将放入/.test($$('.nest .stardot.ghost')[0].getAttribute('title')),
     '角标 tooltip 预告将补入的精灵：' + $$('.nest .stardot.ghost')[0].getAttribute('title'));
  const planOk = ev('fillPlan().fills.length === 2 && fillPlan().skipped.length === 0');
  ok(planOk, '补位方案 = 2 个可补 / 0 个跳过');

  // —— 12.3 补位实跑：空窝填满、配对数增加、不新增失败 ——
  const okBefore = ev('computeAll().okPairs.length');
  const badBefore = ev('computeAll().pairs.filter(p=>p.state==="bad").length');
  btn('fill');
  const st = ev('({empty: state.nests.filter(n=>!n.petId).length, ok: computeAll().okPairs.length, bad: computeAll().pairs.filter(p=>p.state==="bad").length, fillable: document.querySelectorAll(".nest.fillable").length, ghost: document.querySelectorAll(".nest .stardot.ghost").length})');
  ok(st.empty === 0, `补位后无空窝 (${st.empty})`);
  ok(st.ok > okBefore, `可生蛋配对数增加：${okBefore} → ${st.ok}`);
  ok(st.bad <= badBefore, `未新增失败配对：${badBefore} → ${st.bad}`);
  ok(st.fillable === 0 && st.ghost === 0, '补位后「可补位」标记自动消失');
  ok(/已补位 2 个空窝/.test(d.getElementById('toast').textContent), 'toast 报告数量：' + d.getElementById('toast').textContent.trim());
  ok(ev('(function(){ const a=state.nests[0], b=state.nests[1]; return !!pairFeasible({nest:a,pet:PETMAP[a.petId]}, PETMAP[b.petId]); })()'),
     '补入的精灵与基准可配对（同蛋组 + 一公一母）');
  ok(ev('(function(){ const a=state.nests[0], b=state.nests[1]; return effSex(a) !== effSex(b); })()'), '补位的双方性别相反');
  ok(ev('state.nests[0].petId === state.nests[0].petId && state.nests[1].sex !== null'), '补位时自动定好了性别');

  // —— 12.4 兜底提示 ——
  ev('state.nests=[]; state.seq=0; renderAll()');
  btn('fill');
  ok(/还没有小窝/.test(d.getElementById('toast').textContent), '空画布点补位 → 提示先放小窝');
  tpl('line3');
  btn('fill');
  ok(/先把一只精灵放进小窝/.test(d.getElementById('toast').textContent), '只有空窝 → 提示先放入精灵');
  ev('state.nests=[]; state.seq=0; state.recBaseId=null; renderAll()');

  // —— 12.5 规则说明同步 ——
  ok(/一键补位/.test(text('.note.howto')), '规则说明补充了「一键补位」用法');
  ok(/可补位/.test($('.card-h h2').textContent) === false, '标题区不再残留旧占位文案');

  console.log('\n' + '─'.repeat(46));
  console.log(fails === 0 ? `✅ 全部通过（${passes} 项断言）` : `❌ ${fails} 项失败，${passes} 项通过`);
  process.exit(fails === 0 ? 0 : 1);
}, 60);
