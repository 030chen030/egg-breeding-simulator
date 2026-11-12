# -*- coding: utf-8 -*-
"""把 pets.json + season.json + icons.json 注入模板，生成单文件孵蛋模拟器（完全离线）。

season.json 为人工核对的「赛季奇遇」标识数据（独立于 wiki Catalog）：
  - 字段 season：'S1'~'S5'（所属赛季奇遇链）| null（普通精灵）
  - 字段 role  ：'encounter'（奇遇基础形态）| 'evolution'（奇遇进化形态）| null
  - 组别名「赛季奇遇」= season 非空的精灵，非蛋组，不影响 g 字段与繁育判定
  - DB.seasons 携带每赛季元数据（赛季名/专属球/触发条件/出现地点）
"""
import io, json, os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(D, "src")

tpl = io.open(os.path.join(SRC, "孵蛋模拟器.template.html"), encoding="utf-8").read()

db = json.loads(io.open(os.path.join(SRC, "pets.json"), encoding="utf-8").read())
season_cfg = json.loads(io.open(os.path.join(SRC, "season.json"), encoding="utf-8").read())

encounter_ids = {}          # 精灵 id -> (赛季标识, 形态角色)
seasons_meta = []           # 注入前端的赛季元数据
for sid, cfg in season_cfg.items():
    if sid.startswith("_"):
        continue
    base = {str(i) for i in cfg["base"]}
    for pid in cfg["encounter"]:
        pid = str(pid)
        encounter_ids[pid] = (sid, "encounter" if pid in base else "evolution")
    seasons_meta.append({
        "id": sid,
        "label": cfg["label"],
        "adventureId": cfg["adventureId"],
        "ball": cfg["ball"],
        "trigger": cfg["trigger"],
        "location": cfg["location"],
        "note": cfg["note"],
        "baseCount": len(base),
        "count": len(cfg["encounter"]),
        "nos": cfg.get("nos", []),
    })

marked = 0
for p in db["pets"]:
    hit = encounter_ids.get(str(p["id"]))
    p["season"] = hit[0] if hit else None
    p["role"] = hit[1] if hit else None
    if hit:
        marked += 1
db["seasons"] = seasons_meta
print("season marked:", marked, "pets /", len(seasons_meta), "seasons")
assert marked == len(encounter_ids), "season.json 中存在未匹配到的精灵 id"

data = json.dumps(db, ensure_ascii=False, separators=(",", ":"))

icons_path = os.path.join(SRC, "icons.json")
icons = io.open(icons_path, encoding="utf-8").read().strip() if os.path.exists(icons_path) else "{}"

for ph, blob, label in (("/*__PET_DATA__*/", data, "pets"),
                        ("/*__ICON_DATA__*/", icons, "icons")):
    assert ph in tpl, "placeholder missing: " + ph
    # 防止 JSON 里出现 </script> 提前闭合脚本标签
    assert "</script" not in blob.lower(), f"{label} 数据含 </script>"
    tpl = tpl.replace(ph, blob)

dst = os.path.join(D, "孵蛋模拟器.html")
io.open(dst, "w", encoding="utf-8").write(tpl)
print("written:", dst)

# 同步一份到发布目录（site/index.html），供「发布为应用」上传；避免每次手动复制
site_dir = os.path.join(D, "site")
if not os.path.isdir(site_dir):
    os.makedirs(site_dir)
io.open(os.path.join(site_dir, "index.html"), "w", encoding="utf-8").write(tpl)
print("synced :", os.path.join(site_dir, "index.html"))

# 手机端专用发布目录（site-mobile/）：外壳页 + 同一份主程序，供「手机版」独立链接使用
m_dir = os.path.join(D, "site-mobile")
if not os.path.isdir(m_dir):
    os.makedirs(m_dir)
io.open(os.path.join(m_dir, "app.html"), "w", encoding="utf-8").write(tpl)
shell_src = os.path.join(SRC, "手机版外壳.html")
if os.path.exists(shell_src):
    shell = io.open(shell_src, encoding="utf-8").read()
    io.open(os.path.join(m_dir, "index.html"), "w", encoding="utf-8").write(shell)
    print("synced :", os.path.join(m_dir, "index.html"), "+ app.html")
else:
    print("skip   : 未找到 src/手机版外壳.html，手机版外壳未同步")

print("size KB:", round(len(tpl.encode("utf-8")) / 1024, 1))
