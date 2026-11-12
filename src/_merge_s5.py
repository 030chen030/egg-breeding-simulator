# -*- coding: utf-8 -*-
"""把 S5「圣龙宝藏」新增精灵合并进 src/pets.json。

背景：wiki 的 Module:Pets/data/Catalog 只收录到 S4；S5 精灵单独放在
「模块:精灵图鉴/S5/数据/精灵」，由 src/_parse_s5.py 解码为 _s5_pets_decoded.json。
本脚本把这部分合并进 _parse_catalog.py 的产物，形成构建用的完整精灵库。

字段对齐说明：
  - S5 数据模块没有 gender_ratio，故 male/female = null。
    前端 sexAvail() 对「数据缺失」按可雄可雌处理（与 S4 奇遇精灵一致），
    并在界面标注「wiki 未录性别 · 默认公母均可」。
  - g 为蛋组 id 列表，[1] = 未发现组（传说 / 战令类，不可生蛋）。
  - 图鉴编号不唯一（NO.478 两个形态、NO.493 阿布与超能阿布），
    一切归属键都用精灵唯一 id。
"""
import io, json, os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PETS = os.path.join(D, "src", "pets.json")
S5 = os.path.join(D, "_s5_pets_decoded.json")

db = json.loads(io.open(PETS, encoding="utf-8").read())
s5 = json.loads(io.open(S5, encoding="utf-8").read())
pets = db["pets"]
byid = {p["id"]: p for p in pets}

added, skipped = [], []
for s in s5:
    if s["id"] in byid:
        skipped.append(s["id"])
        continue
    assert s["g"], f"{s['id']} {s['title']} 无蛋组，跳过会破坏繁育判定"
    rec = {
        "id": s["id"],
        "no": s["no"],
        "name": s["name"],
        "title": s["title"],
        "form": s["form"],
        "stage": s["stage"],
        "cls": s["cls"],
        "types": s["types"],
        "g": s["g"],
        "male": None,          # wiki 未录入性别比例 -> 前端默认公母均可
        "female": None,
        "shiny": bool(s["has_shiny"]),
        "ride": bool(s["can_ride"]),
    }
    pets.append(rec)
    byid[rec["id"]] = rec
    added.append(rec)


def num(v):
    import re
    m = re.match(r"\d+", str(v or ""))
    return int(m.group(0)) if m else 999999


pets.sort(key=lambda p: (num(p["no"]), p["stage"] or 99, str(p["title"] or "")))
db["pets"] = pets
io.open(PETS, "w", encoding="utf-8").write(
    json.dumps(db, ensure_ascii=False, separators=(",", ":")))

unknown = sum(1 for p in pets if p["g"] == [1])
print("合并 S5 新增:", len(added), "只在总表中已存在跳过:", len(skipped))
print("精灵总数:", len(pets), "| 未发现组:", unknown,
      "| 可生蛋(供前端核对):", len(pets) - unknown)
print("S5 新增清单:")
for p in sorted(added, key=lambda x: (num(x["no"]), str(x["title"]))):
    print("  %s NO.%-4s %-20s stage%-3s g%-10s %s" % (
        p["id"], p["no"], p["title"][:20], p["stage"], p["g"], "/".join(p["types"])))
