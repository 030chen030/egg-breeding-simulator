# -*- coding: utf-8 -*-
"""解析 Module:Pets/data/Evolutions -> _evolutions.json（petId -> 进化链成员）"""
import os
import io, json, re

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = io.open(os.path.join(D, "_evolutions.lua"), encoding="utf-8").read()

TOK = re.compile(r'"(?:[^"\\]|\\.)*"|[{}]|=|,|[^,={}]+')

def parse_value(toks, i):
    t = toks[i]
    if t == "{":
        i += 1
        arr, d = [], {}
        while i < len(toks) and toks[i] != "}":
            if i + 1 < len(toks) and toks[i + 1] == "=":
                k = toks[i]
                v, i = parse_value(toks, i + 2)
                d[k] = v
            else:
                v, i = parse_value(toks, i)
                arr.append(v)
            if i < len(toks) and toks[i] == ",":
                i += 1
        return (d if d else arr), i + 1
    if t.startswith('"'):
        return t[1:-1].replace('\\"', '"'), i + 1
    if re.fullmatch(r"-?\d+\.?\d*", t):
        return (float(t) if "." in t else int(t)), i + 1
    if t in ("true", "false"):
        return t == "true", i + 1
    return t, i + 1

toks = TOK.findall(src)
toks = [t.strip() for t in toks if t.strip()]
# 顶层： return { ... }
val, _ = parse_value(toks, 1)

chains = {}          # petId -> [ {id,name,title,stage} ]
by_name = {}         # 精灵名 -> 链
for k, v in val.items():
    # Lua 写法 evolution_xx={{record}} -> 外层表只含一个记录
    if isinstance(v, list) and len(v) == 1 and isinstance(v[0], dict):
        v = v[0]
    if not isinstance(v, dict):
        continue
    chain = v.get("chain")
    if not isinstance(chain, list):
        continue
    members = []
    for m in chain:
        if not isinstance(m, dict) or "id" not in m:
            continue
        members.append({"id": m["id"], "name": m.get("name", ""), "title": m.get("title", ""), "stage": m.get("stage")})
    # 首领化分支
    for m in v.get("lord_branches") or []:
        if isinstance(m, dict) and "id" in m:
            members.append({"id": m["id"], "name": m.get("name", ""), "title": m.get("title", ""),
                            "stage": m.get("stage"), "lord": True})
    for m in members:
        chains.setdefault(m["id"], []).append({"chain": [x for x in members if not x.get("lord")], "name": v.get("name")})

# 去重：只保留最长链
out = {}
for pid, opts in chains.items():
    best = max(opts, key=lambda o: len(o["chain"]))
    out[pid] = {"chainName": best["name"], "members": best["chain"]}

io.open(os.path.join(D, "_evolutions.json"), "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("链覆盖精灵数:", len(out))

# 校验：S4 已知奇遇链
for nm in ["幽铃", "布灵", "玳龟", "星星眼", "小浣蛋", "未完虫", "量风碗", "章脑丸"]:
    for pid, o in out.items():
        if any(m["name"] == nm for m in o["members"]):
            print("S4", nm, "->", " / ".join(f'{m["name"]}({m["id"]})' for m in o["members"]))
            break
