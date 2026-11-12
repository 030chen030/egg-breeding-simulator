# 洛克王国世界 · 孵蛋模拟器

一个纯前端、**完全离线**的孵蛋配对模拟器：把精灵放进相邻小窝，实时判断能否生蛋，并逐条列出判定依据。

- 收录 **662 只精灵 / 15 个蛋组 / 5 个赛季奇遇（S1~S5，共 83 只带赛季标记）**
- 精灵数据、样式、逻辑与 662 张头像全部内联在单个 HTML 中，**双击即可运行，断网也能用**
- 无需后端、无需数据库、无需登录；存档走浏览器 `localStorage`

## 使用方式

**离线（最稳）**：直接双击根目录的 `孵蛋模拟器.html`。

**在线**（平台分享链接必须带访问码，裸链会返回 403）：

| 版本 | 地址 |
|---|---|
| 电脑版 | https://egg-breeding-simulator.app.workbuddy.link/?sharecode=4AJ6XLOWU4 |
| 手机版 | https://egg-breeding-simulator-mobile.app.workbuddy.link/?sharecode=SPTZANPTGU |

> 在线地址由平台分配，可能随平台策略调整；离线单文件不受影响。若链接失效，以平台最新分享链接为准。

## 主要功能

- **实时配对判定**：对当前布局逐对预测能否生蛋，列出每条依据
- **可生蛋筛选**：默认只显示可生蛋精灵（605 只），「未发现」组等 57 只默认排除
- **一键补位**：为空窝自动挑选能与所有紧贴邻居配对成功的精灵，自动配好一公一母；补不出来就留空，绝不制造失败配对
- **配对推荐**：按推荐度排序，画布空窝上以 ★ 提示哪些位置可补位
- **赛季奇遇筛选**：S1~S5 分色徽章，附赛季元数据（触发条件、出现地点等）
- **本地存档 / 分享码**：布局可存本地，也可编码进 URL `#s=...` 分享给别人

## 判定规则

两窝精灵同时满足以下五条才算可生蛋：

1. **紧贴相邻**（上下左右，不含斜角）
2. **双方都已放入精灵**
3. **一公一母**（可雄可雌的精灵会自动选择合适性别）
4. **双方都不是「未发现」蛋组**
5. **两个蛋组有交集**

`★` 表示推荐配对建议（画布窝角标、选择器角标、筛选芯片）；`❤` 只出现在画布的可生蛋判定徽章上。

## 目录结构

```
孵蛋模拟器.html                 离线单文件产物（约 2.4 MB，直接用这个）
site/index.html                 电脑版线上发布产物
site/panel/index.html           已下线页面的跳转页
site-mobile/index.html          手机版外壳（窄屏直接跳转，宽屏用 iframe 预览）
site-mobile/app.html            手机版主程序
src/
  孵蛋模拟器.template.html       唯一需要手改的源文件（含 CSS / JS / 占位符）
  手机版外壳.html                手机版外壳源文件
  pets.json                       662 只精灵数据
  season.json                     S1~S5 赛季奇遇标记与元数据
  icons.json                      662 张头像（base64 WebP）
  _build.py                       构建入口：注入数据 → 生成产物并同步 site/、site-mobile/
  _parse_*.py / _merge_s5.py      wiki 数据解析与合并
  _gen_season.py                  生成赛季标记
  _fetch_*.py                     增量抓取缺失头像
  _smoke.js                       jsdom 冒烟测试（315 项）
  _shot_*.js                      真实 Chrome 视觉/功能核验脚本
_catalog.lua / _seasons.* /        数据管线所需的 wiki 抓取快照
_evolutions.* / _s5_pets.*
```

核验截图（`_shots/`）、头像源图缓存（`_icons_cache/`）与本地个人记忆（`.workbuddy/`）**不在仓库内**。

## 重新构建

需要 Python 3（仅标准库）：

```bash
python src/_build.py
```

该脚本会把 `pets.json` / `season.json` / `icons.json` 注入模板，生成 `孵蛋模拟器.html`，并自动同步 `site/` 与 `site-mobile/`。所有路径均相对脚本位置计算，克隆到任意目录都能直接构建。

### 数据管线

数据源为 [biligame 洛克王国世界 WIKI](https://wiki.biligame.com/nrc/) 的 MediaWiki API：

```
_parse_catalog.py → _parse_s5.py → _merge_s5.py → _gen_season.py
                 → _fetch_s5_icons.py → _build.py
```

**S5 及以后赛季不在 `Module:Seasons/data/Catalog` 里**（该模块只到 S4）。S5 精灵存放在 `模块:精灵图鉴/S5/数据/精灵`，为压缩过的 Lua 数据（tag 1 = 对象 / 2 = 数组，键走字符串字典索引，头像在 `p.image.head`），由 `_parse_s5.py` 解码。

### 测试

```bash
# jsdom 冒烟测试（需安装 jsdom）
node src/_smoke.js

# 真浏览器核验（需 playwright-core + 本机 Chrome）
node src/_shot_s5.js        # S5 赛季专项
node src/_shot_fill.js      # 一键补位
node src/_shot_overflow.js  # 桌面/手机溢出扫描
```

`_shot_live*.js` 直连线上地址做回归，需带 sharecode。

## 数据来源与说明

精灵蛋组、性别、图鉴编号、进化链与头像均整理自 **biligame 洛克王国世界 WIKI**，赛季奇遇名单以官方公告为准并交叉校验。本项目为非官方工具，数据以游戏内实际表现为准。

已知的数据留白（**未做猜测填充**）：

- **S5 专属捕捉球**：wiki 球类物品页只收录到 S4，S5 未收录 → 字段留空，界面自动省略该行。
- **S5 性别比例**：数据模块未提供 → 按「公母均可」处理，卡片上有提示。
- 图鉴编号不唯一（存在同号不同形态），所有归属判定一律使用精灵唯一 `id`。

页脚保留「数据来源 洛克王国世界 WIKI」与「光环助手整理发布」。

## 版本

- **v14（2026-11-12）**：新增 S5「圣龙宝藏」赛季（8 只奇遇基础 + 9 只进化形态），精灵数 621 → 662；新增暖金色 S5 徽章；页首数量改为动态取数。
- v13：筛选芯片按「大类别 / 具体分类」分两套配色。
- v12：一键补位改为真实按钮，空窝显示可补位预告。
- v11：移除埋点模块，默认精灵改为按「可生蛋」规则动态选取。
