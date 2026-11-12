# -*- coding: utf-8 -*-
"""把 wiki 的 Module:Pets/data/Catalog Lua 表解析成精简 JSON。"""
import io, json, re, os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

src = io.open(os.path.join(D, "_catalog.lua"), encoding="utf-8").read()
# wiki 新版在 return 前加了「-- 请勿直接修改本页面的数据。」注释，跳过注释与前置内容
m = re.search(r"(?m)^\s*return\b", src)
assert m, "Catalog 中未找到顶层的 return"
src = src[m.end():].strip()

# ---------- 极简 Lua 表字面量解析器 ----------
class P:
    def __init__(self, s):
        self.s = s
        self.i = 0
        self.n = len(s)

    def ws(self):
        while self.i < self.n and self.s[self.i] in " \t\r\n":
            self.i += 1

    def parse(self):
        self.ws()
        if self.s[self.i] == "{":
            return self.table()
        raise ValueError("expect { at %d" % self.i)

    def table(self):
        self.i += 1  # skip {
        arr, obj = [], {}
        idx = 1
        while True:
            self.ws()
            if self.i >= self.n:
                raise ValueError("unterminated table")
            c = self.s[self.i]
            if c == "}":
                self.i += 1
                break
            if c == ",":
                self.i += 1
                continue
            # 看是不是 key = value
            m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*=', self.s[self.i:])
            if m:
                key = m.group(1)
                self.i += m.end()
                val = self.value()
                obj[key] = val
            elif self.s[self.i] == "[":
                # ["x"]= 或 [1]=
                j = self.s.index("]", self.i)
                keyraw = self.s[self.i+1:j].strip().strip('"\'')
                self.i = j + 1
                self.ws()
                assert self.s[self.i] == "="
                self.i += 1
                obj[keyraw] = self.value()
            else:
                val = self.value()
                arr.append(val)
                idx += 1
        if arr and not obj:
            return arr
        if arr and obj:
            # 混合：按 1..n 放数组
            out = dict(obj)
            for k, v in enumerate(arr, 1):
                out[k] = v
            return out
        return obj

    def value(self):
        self.ws()
        c = self.s[self.i]
        if c == "{":
            return self.table()
        if c == '"' or c == "'":
            q = c
            self.i += 1
            buf = []
            while self.i < self.n:
                ch = self.s[self.i]
                if ch == "\\":
                    buf.append(self.s[self.i+1])
                    self.i += 2
                    continue
                if ch == q:
                    self.i += 1
                    break
                buf.append(ch)
                self.i += 1
            return "".join(buf)
        m = re.match(r'true|false|nil', self.s[self.i:])
        if m:
            self.i += m.end()
            return {"true": True, "false": False, "nil": None}[m.group(0)]
        m = re.match(r'-?\d+\.?\d*(?:[eE][-+]?\d+)?', self.s[self.i:])
        if m:
            self.i += m.end()
            t = m.group(0)
            return float(t) if ("." in t or "e" in t or "E" in t) else int(t)
        raise ValueError("bad value at %d: %r" % (self.i, self.s[self.i:self.i+40]))

data = P(src).parse()

GROUPS = {
    1: "未发现", 2: "巨灵组", 3: "两栖组", 4: "昆虫组", 5: "天空组",
    6: "动物组", 7: "妖精组", 8: "植物组", 9: "拟人组", 10: "软体组",
    11: "大地组", 12: "魔力组", 13: "海洋组", 14: "飞龙组", 15: "机械组",
}
GROUP_COLORS = {
    1: "#7b838b", 2: "#7ea56b", 3: "#d86361", 4: "#59a0d8", 5: "#d7b840",
    6: "#a56658", 7: "#685b8c", 8: "#c875bd", 9: "#74b99a", 10: "#7c8996",
    11: "#91784d", 12: "#4f83ab", 13: "#438cac", 14: "#826bb3", 15: "#5f777f",
}

def num(v):
    m = re.match(r"\d+", str(v or ""))
    return int(m.group(0)) if m else 999999

out = []
for pid, pet in sorted(data.items(), key=lambda kv: (num(kv[1].get("number")), kv[1].get("stage") or 99, str(kv[1].get("title") or ""))):
    if not isinstance(pet, dict):
        continue
    gs, seen = [], set()
    for g in (pet.get("egg_group") or []):
        try:
            g = int(g)
        except Exception:
            continue
        if g in GROUPS and g not in seen:
            gs.append(g)
            seen.add(g)
    if not gs:
        continue
    gr = pet.get("gender_ratio") or {}
    out.append({
        "id": pid,
        "no": str(pet.get("number") or ""),
        "name": pet.get("name") or pet.get("title") or pid,
        "title": pet.get("title") or pet.get("name") or pid,
        "form": pet.get("form") or "",
        "stage": pet.get("stage") if isinstance(pet.get("stage"), int) else None,
        "cls": pet.get("class") or "",
        "types": [t for t in (pet.get("types") or []) if isinstance(t, str)],
        "g": gs,
        "male": gr.get("male") if isinstance(gr.get("male"), int) else None,
        "female": gr.get("female") if isinstance(gr.get("female"), int) else None,
        "shiny": bool(pet.get("has_shiny")),
        "ride": bool(pet.get("can_ride")),
    })

payload = {"groups": [{"id": k, "name": v, "color": GROUP_COLORS[k]} for k, v in GROUPS.items() if k in GROUP_COLORS],
           "pets": out}

io.open(os.path.join(D, "src", "pets.json"), "w", encoding="utf-8").write(
    json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

print("pets:", len(out))
from collections import Counter
c = Counter()
for p in out:
    for g in p["g"]:
        c[GROUPS[g]] += 1
print(dict(c))
print("无性别(male=0):", sum(1 for p in out if p["male"] == 0))
print("仅雌性:", sum(1 for p in out if p["male"] == 0 and (p["female"] or 0) > 0))
print("未发现组:", sum(1 for p in out if p["g"] == [1]))
print("sample:", json.dumps(out[:2], ensure_ascii=False)[:400])
