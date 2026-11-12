# -*- coding: utf-8 -*-
"""解析 wiki「模块:精灵图鉴/S5/数据/精灵」的压缩 Lua 数据 -> _s5_pets_decoded.json

wiki 新版 S5 精灵数据不在 Module:Pets/data/Catalog 里，而是单独放在
「模块:精灵图鉴/S5/数据/精灵」，并采用 dragon-tuples-1 压缩格式：

  return { "dragon-tuples-1", {字符串字典 1..N}, {tag, payload} }

  tag=1 -> 对象，payload 为 [[keyIdx, valueNode], ...]，keyIdx 是字典的 1-based 索引
  tag=2 -> 数组，payload 为 [valueNode, ...]
  其余标量（数字/布尔/字符串）直接作为值

抓取方式（输出到项目根目录 _s5_pets.lua）：
  curl -sS --noproxy "*" --get "https://wiki.biligame.com/nrc/api.php" \
    --data-urlencode "action=parse" --data-urlencode "page=模块:精灵图鉴/S5/数据/精灵" \
    --data-urlencode "prop=wikitext" --data-urlencode "format=json" -A "Mozilla/5.0"
"""
import io, json, os, re

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = io.open(os.path.join(D, "_s5_pets.lua"), encoding="utf-8").read()
m = re.search(r"(?m)^\s*return\b", src)
assert m, "未找到 return"
body = src[m.end():].strip()


# ---------- 极简 Lua 表字面量解析器 ----------
class P:
    def __init__(self, s):
        self.s, self.i, self.n = s, 0, len(s)

    def ws(self):
        while self.i < self.n and self.s[self.i] in " \t\r\n":
            self.i += 1

    def parse(self):
        self.ws()
        return self.table() if self.s[self.i] == "{" else self.value()

    def table(self):
        self.i += 1
        arr, obj = [], {}
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
            if self.s[self.i:self.i + 2] == "--":                 # 行注释
                self.i = self.s.find("\n", self.i)
                if self.i < 0:
                    self.i = self.n
                continue
            mm = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s*=", self.s[self.i:])
            if mm:
                k = mm.group(1)
                self.i += mm.end()
                obj[k] = self.value()
            elif c == "[":
                j = self.s.index("]", self.i)
                k = self.s[self.i + 1:j].strip().strip('"\'')
                self.i = j + 1
                self.ws()
                assert self.s[self.i] == "="
                self.i += 1
                obj[k] = self.value()
            else:
                arr.append(self.value())
        if arr and not obj:
            return arr
        if arr and obj:
            o = dict(obj)
            for k, v in enumerate(arr, 1):
                o[k] = v
            return o
        return obj

    def value(self):
        self.ws()
        c = self.s[self.i]
        if c == "{":
            return self.table()
        if c in "\"'":
            q = c
            self.i += 1
            buf = []
            while self.i < self.n:
                ch = self.s[self.i]
                if ch == "\\":
                    buf.append(self.s[self.i + 1])
                    self.i += 2
                    continue
                if ch == q:
                    self.i += 1
                    break
                buf.append(ch)
                self.i += 1
            return "".join(buf)
        mm = re.match(r"true|false|nil", self.s[self.i:])
        if mm:
            self.i += mm.end()
            return {"true": True, "false": False, "nil": None}[mm.group(0)]
        mm = re.match(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", self.s[self.i:])
        if mm:
            self.i += mm.end()
            t = mm.group(0)
            return float(t) if ("." in t or "e" in t) else int(t)
        raise ValueError("bad value at %d: %r" % (self.i, self.s[self.i:self.i + 50]))


root = P(body).parse()
assert root[0] == "dragon-tuples-1", "未知的压缩格式: %r" % root[0]
DICT = root[1]


def dec(n):
    """把 dragon-tuples 节点还原成普通 Python 值。"""
    if not isinstance(n, list):
        return n
    if (len(n) == 2 and isinstance(n[0], int) and n[0] in (1, 2)
            and isinstance(n[1], list)):
        tag, payload = n
        if tag == 1:
            out = {}
            for pair in payload:
                k, v = pair[0], pair[1]
                key = DICT[k - 1] if isinstance(k, int) and 1 <= k <= len(DICT) else k
                out[key] = dec(v)
            return out
        return [dec(x) for x in payload]
    return [dec(x) for x in n]


data = dec(root[2])
assert isinstance(data, dict), "顶层应为精灵 id -> 资料 的对象"

out = []
for pid, p in data.items():
    if not isinstance(p, dict):
        continue
    out.append({
        "id": pid,
        "no": str(p.get("number") or ""),
        "name": p.get("name") or p.get("title") or pid,
        "title": p.get("title") or p.get("name") or pid,
        "form": p.get("form") or "",
        "stage": p.get("stage") if isinstance(p.get("stage"), int) else None,
        "cls": p.get("class") or "",
        "types": [t for t in (p.get("types") or []) if isinstance(t, str)],
        "g": [int(x) for x in (p.get("egg_group") or []) if isinstance(x, int)],
        "head": (p.get("image") or {}).get("head") or "",
        "shiny_head": (p.get("image") or {}).get("shiny_head") or "",
        "has_shiny": bool(p.get("has_shiny")),
        "can_ride": bool(p.get("can_ride")),
        "evolution_id": p.get("evolution_id"),
        "game_id": p.get("game_id"),
    })

out.sort(key=lambda x: (int(x["no"] or 9999), str(x["title"])))
io.open(os.path.join(D, "_s5_pets_decoded.json"), "w", encoding="utf-8").write(
    json.dumps(out, ensure_ascii=False, indent=1))

print("S5 数据模块精灵数:", len(out))
for p in out:
    print(" %s NO.%-4s %-18s stage%-3s 蛋组%-10s %s" % (
        p["id"], p["no"], p["title"][:18], p["stage"], p["g"], "/".join(p["types"])))
