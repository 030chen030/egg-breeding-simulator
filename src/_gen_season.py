# -*- coding: utf-8 -*-
"""生成 src/season.json：赛季奇遇组别 + 标识字段（S1~S5）

数据来源（全部来自 wiki 原文，非推测）：
  S1 暗夜拾光：页内「拾光精通课题」任务「累计捕捉2只污染血脉X」点名的 8 只
  S2 狂欢怪谈：页内最终话任务「捕捉1只奇异血脉X」点名的 8 只
  S3 铅字幻梦：页内最终话任务「在赛季奇遇中与X建立契约」点名的 8 只
  S4 月涌狂想：页内最终话任务「在赛季奇遇中与X建立契约」点名的 8 只
  S5 圣龙宝藏：官方公告「S5赛季 | 赛季奇遇精灵图鉴」点名的 8 只
    （wiki 的 Seasons/data/Catalog 尚未收录 S5，故 S5 走独立数据源
      「模块:精灵图鉴/S5/数据/精灵」，由 _parse_s5.py 解码）
S1~S4 的进化形态用 Module:Pets/data/Evolutions 展开，并与 Module:Seasons/data/Catalog
的赛季新增精灵名单交叉校验（确保链上每只都属于该赛季）。
"""
import io, json, os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(D, "src")

pets = json.loads(io.open(os.path.join(SRC, "pets.json"), encoding="utf-8").read())["pets"]
byid = {p["id"]: p for p in pets}
byname = {}
for p in pets:
    byname.setdefault(p["title"], p)
byno = {p["no"]: p for p in pets}

seasons_raw = json.loads(io.open(os.path.join(D, "_seasons.json"), encoding="utf-8").read())
evos = json.loads(io.open(os.path.join(D, "_evolutions.json"), encoding="utf-8").read())
s5_raw = json.loads(io.open(os.path.join(D, "_s5_pets_decoded.json"), encoding="utf-8").read())
s5_byid = {p["id"]: p for p in s5_raw}
RAWKEY = {"S1": "season_1", "S2": "season_2", "S3": "season_3", "S4": "season_4"}

chain_of = {}
for pid, o in evos.items():
    ids = [m["id"] for m in o["members"] if m["id"] in byid]
    chain_of[pid] = ids

BASE = {
    "S1": ["贝瑟", "双灯鱼", "嗜光嗡嗡", "柴渣虫", "空空颅", "月牙雪熊", "粉星仔", "粉粉星"],
    "S2": ["加油海葵", "咕咕帽", "小丑豆豆", "小鼓象", "炫光迪迪", "烟花团", "牵线木偶", "猴麦仔"],
    "S3": ["卡波", "蜜果骸", "稻草人", "蝴蝶陶陶", "栗鼠", "十字蝌蚪", "守夜烛", "苞米仔"],
    "S4": ["布灵", "玳龟", "星星眼", "小浣蛋", "未完虫", "幽铃", "量风碗", "章脑丸"],
    "S5": ["乐乐鲨", "蛋包蛋", "蟹蟹椰", "鲸羽", "豆粒鹅", "西瓜虫", "小剪影", "滴溜豚"],
}

# S5 官方公告点名的 8 只奇遇基础形态，以及 wiki S5 数据模块里的进化形态。
# 乐乐鲨有两个分支形态（柠檬鲨 / 虎纹鲨），故进化形态共 9 只。
S5_ENCOUNTER_IDS = [
    "pet_000646", "pet_000647", "pet_000648",                 # 乐乐鲨 + 阿瓦鲨两分支
    "pet_000649", "pet_000650",                             # 蛋包蛋 -> 鸡麻麻
    "pet_000651", "pet_000652",                             # 蟹蟹椰 -> 沙咔蟹
    "pet_000653", "pet_000654",                             # 鲸羽 -> 圆环鲸羽
    "pet_000655", "pet_000656",                             # 豆粒鹅 -> 刨雪鹅
    "pet_000657", "pet_000658",                             # 西瓜虫 -> 冬虫夏瓜
    "pet_000659", "pet_000660",                             # 小剪影 -> 影子剪纸
    "pet_000661", "pet_000662",                             # 滴溜豚 -> 滴廿豚
]
META = {
    "S1": dict(label="暗夜拾光", adventureId=101, ball="捕光球",
               trigger="使用捕光球捕捉精灵即有机会触发赛季奇遇，出现「污染血脉」精灵",
               location="箱中研究室（暗夜拾光赛季）",
               note="奇遇精灵以「污染血脉」形态出现，须在赛季奇遇中捕捉"),
    "S2": dict(label="狂欢怪谈", adventureId=102, ball="奇趣球",
               trigger="连续捕捉触发「幸运惊喜盒 / 大量幸运惊喜盒」，盒子中藏有奇遇精灵",
               location="方舟马戏团（狂欢怪谈赛季）",
               note="奇遇精灵躲进马戏团四处散落的惊喜盒中"),
    "S3": dict(label="铅字幻梦", adventureId=103, ball="童话球",
               trigger="连续捕捉触发「精灵童话」，与随神奇书本现身的奇遇精灵相遇",
               location="智慧出版社（铅字幻梦赛季）",
               note="世界中出现的各式神奇书本与新现身的奇遇精灵有关"),
    "S4": dict(label="月涌狂想", adventureId=104, ball="失重球",
               trigger="连续捕捉触发「赛季奇遇 · 星陨流光」",
               location="月面（月涌狂想赛季地图）",
               note="奇遇精灵在星陨流光中现身"),
    "S5": dict(label="圣龙宝藏", adventureId=105, ball="",
               trigger="连续捕捉触发特殊的「赛季奇遇」，有机会遇到 S5 奇遇精灵",
               location="圣龙乐园（圣龙宝藏赛季地图）",
               note="官方 2026-10-27 公布 8 只奇遇精灵，赛季 2026-11-05 开启；"
                    "WIKI 暂未收录本赛季的捕捉道具信息"),
}

out = {"_doc": ("赛季奇遇标识数据（人工核对源，独立于 wiki Catalog 自动解析）。"
                "字段 season 注入 pets：'S1'~'S5'|null；"
                "role：'encounter'(奇遇基础形态) / 'evolution'(奇遇进化形态) / null。"
                "组别「赛季奇遇」= season 非空的精灵，非蛋组，不影响 g 字段与繁育判定。"
                "S1~S4 名单依据各赛季 wiki 页契约/捕捉任务原文 + Seasons/data/Catalog 交叉校验；"
                "S5 依据官方「赛季奇遇精灵图鉴」公告 8 只 + wiki「模块:精灵图鉴/S5/数据/精灵」"
                "的进化链（该模块独立于 Catalog，需 _parse_s5.py 解码后再 _merge_s5.py 合并）。"
                "adventureId 105 按 S1~S4 顺序延续标记，wiki Catalog 暂未收录 S5。")}

total = 0
for sid in ["S1", "S2", "S3", "S4", "S5"]:
    # 关键：图鉴编号不唯一（如 NO.329 同时有「夜枭」与「暗夜颅主（首领形态）」），
    # 因此一律用精灵 id（pet_xxxxxx，唯一）作为赛季归属与校验键。
    meta = dict(META[sid])
    dropped = []
    if sid == "S5":
        # S5 走独立数据源：官方公告 8 只 + S5 数据模块的进化形态（含乐乐鲨双分支）
        base_ids = []
        for nm in BASE[sid]:
            pt = byname.get(nm)
            assert pt, f"{sid} 未找到精灵 {nm}"
            base_ids.append(pt["id"])
        all_ids = list(S5_ENCOUNTER_IDS)
        assert set(base_ids).issubset(set(all_ids)), "S5 基础形态必须都在奇遇名单里"
        for pid in all_ids:
            assert pid in s5_byid, f"{pid} 不在 S5 数据模块"
            assert pid in byid, f"{pid} 不在 pets.json（请先跑 _merge_s5.py）"
        # 交叉校验：进化形态与同链基础的蛋组必须一致，否则繁育判定会自相矛盾
        chains = {}
        for p in s5_raw:
            if p["id"] in all_ids:
                chains.setdefault(p["evolution_id"], []).append(p)
        for base in base_ids:
            g = byid[base]["g"]
            for cand in all_ids:
                if cand == base or cand in base_ids:
                    continue
                if (s5_byid[cand]["no"] == byid[base]["no"]
                        or int(s5_byid[cand]["no"]) == int(byid[base]["no"]) + 1):
                    assert byid[cand]["g"] == g, \
                        f"{byid[cand]['title']} 蛋组 {byid[cand]['g']} 与 {byid[base]['title']} {g} 不一致"
        meta["source"] = "洛克王国世界 WIKI · S5 赛季奇遇精灵图鉴公告 + S5 精灵数据模块"
    else:
        season_ids = {p["id"] for p in seasons_raw[RAWKEY[sid]]["new_pets"]}
        base_ids, all_ids = [], []
        for nm in BASE[sid]:
            pt = byname.get(nm)
            assert pt, f"{sid} 未找到精灵 {nm}"
            base_ids.append(pt["id"])
            for pid in chain_of.get(pt["id"], [pt["id"]]):
                if pid in season_ids:
                    if pid not in all_ids:
                        all_ids.append(pid)
                else:
                    dropped.append((nm, pid, byid[pid]["title"] if pid in byid else "?"))
        meta["source"] = "洛克王国世界 WIKI · 赛季页任务原文"
    all_ids.sort(key=lambda i: int(byid[i]["no"]))
    base_ids.sort(key=lambda i: int(byid[i]["no"]))
    meta["base"] = base_ids
    meta["encounter"] = all_ids
    meta["baseNos"] = [byid[i]["no"] for i in base_ids]
    meta["nos"] = [byid[i]["no"] for i in all_ids]
    out[sid] = meta
    total += len(all_ids)
    print(f"=== {sid} {meta['label']} (adv {meta['adventureId']}, {meta['ball']}) 基础 {len(base_ids)} → 含进化 {len(all_ids)}")
    print("   ", " / ".join(f"{byid[i]['title']}(NO.{byid[i]['no']})" for i in all_ids))
    if dropped:
        print("    [提示] 进化链成员不在该赛季新增名单，未纳入:", dropped)

io.open(os.path.join(SRC, "season.json"), "w", encoding="utf-8").write(
    json.dumps(out, ensure_ascii=False, indent=2))
print("\nwritten src/season.json  总标记:", total)
