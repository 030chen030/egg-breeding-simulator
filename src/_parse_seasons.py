# -*- coding: utf-8 -*-
"""解析 wiki Module:Seasons/data/Catalog 的 Lua 表 -> _seasons.json"""
import io, json, re, os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

src = io.open(os.path.join(D, "_seasons.lua"), encoding="utf-8").read()

TOK = re.compile(r'"(?:[^"\\]|\\.)*"|[{}]|=|,|[^,={}]+')

def tokenize(s, pos=0, end=None):
    toks = []
    i = pos
    while i < len(s):
        m = TOK.match(s, i)
        if not m:
            break
        t = m.group(0).strip()
        if t:
            toks.append(t)
        i = m.end()
        if end and s.startswith(end, i):
            break
    return toks, i

def parse_value(toks, i):
    """返回 (value, next_index)。toks[i] 是 '=' 之后的 token。"""
    t = toks[i]
    if t == "{":
        i += 1
        arr, d, key = [], {}, None
        while toks[i] != "}":
            if i + 1 < len(toks) and toks[i + 1] == "=":
                k = toks[i]
                v, i = parse_value(toks, i + 2)
                d[k] = v
            else:
                v, i = parse_value(toks, i)
                arr.append(v)
            if toks[i] == ",":
                i += 1
        return (d if d else arr), i + 1
    if t.startswith('"'):
        return t[1:-1].replace('\\"', '"'), i + 1
    if re.fullmatch(r"-?\d+\.?\d*", t):
        return (float(t) if "." in t else int(t)), i + 1
    if t in ("true", "false"):
        return t == "true", i + 1
    return t, i + 1

data = {}
# 顶层：season_N={...}
for m in re.finditer(r'(season_\d+)=\{', src):
    key = m.group(1)
    body = src[m.end():]
    toks, _ = tokenize("{" + body)
    # toks[0] == '{' ; 解析该表
    val, _ = parse_value(toks, 0)
    data[key] = val

out = {}
for k, v in data.items():
    out[k] = {
        "season_label": v.get("season_label"),
        "name": v.get("name"),
        "adventure_id": v.get("adventure_id"),
        "adventure_name": v.get("adventure_name"),
        "encounter_text": v.get("encounter_text"),
        "chapter_count": v.get("chapter_count"),
        "task_count": v.get("task_count"),
        "new_pets": [
            {"id": p.get("id"), "name": p.get("name"), "no": p.get("pictorial_book_id"),
             "source_id": p.get("source_id"), "type_ids": p.get("type_ids"),
             "avatar": p.get("avatar"), "desc": (p.get("description") or "")[:40]}
            for p in v.get("new_pets", [])
        ],
    }

io.open(os.path.join(D, "_seasons.json"), "w", encoding="utf-8").write(
    json.dumps(out, ensure_ascii=False, indent=1))

for k in sorted(out):
    s = out[k]
    print(k, "| label =", s["season_label"], "| name =", s["name"], "| 新精灵", len(s["new_pets"]), "只")
    print("   ", " ".join(f'{p["name"]}(NO.{p["no"]})' for p in s["new_pets"]))
