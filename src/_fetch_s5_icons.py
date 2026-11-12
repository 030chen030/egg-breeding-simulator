# -*- coding: utf-8 -*-
"""增量补齐新增精灵的头像（不重建已有图标）。

先跑 _parse_catalog.py + _merge_s5.py 得到最新 src/pets.json，
本脚本找出 icons.json 里缺的 petId，分别从两个数据源取 head 文件名：
  - 普通新增形态：项目根目录 _catalog.lua（wiki Module:Pets/data/Catalog）
  - S5 精灵：项目根目录 _s5_pets_decoded.json（_parse_s5.py 的产物）
再走 MediaWiki imageinfo API 拿缩略图，压成 72x72 WebP base64 合并进 icons.json。
"""
import base64
import io
import json
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(D, "src")
WORK = os.path.join(D, "_icons_cache")
API = "https://wiki.biligame.com/nrc/api.php"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
SIZE, QUALITY = 72, 84


def http(url, data=None, tries=3):
    for t in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={
                "User-Agent": UA,
                "Referer": "https://wiki.biligame.com/nrc/",
                "Accept": "*/*",
            })
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception:
            if t == tries - 1:
                raise
            time.sleep(1.2 * (t + 1))


# ---------- 1) 找缺口 + 建立 petId -> head ----------
pets = json.loads(io.open(os.path.join(SRC, "pets.json"), encoding="utf-8").read())["pets"]
icons_path = os.path.join(SRC, "icons.json")
icons = json.loads(io.open(icons_path, encoding="utf-8").read())
missing = [p for p in pets if p["id"] not in icons]
print("精灵总数:", len(pets), "| 已有图标:", len(icons), "| 待补:", len(missing))
if not missing:
    print("无需补齐")
    raise SystemExit(0)

head_of = {}

cat = io.open(os.path.join(D, "_catalog.lua"), encoding="utf-8").read()
starts = [(m.start(), m.group(1)) for m in re.finditer(r'pet_(\d+)=\{', cat)]
for i, (pos, num_) in enumerate(starts):
    end = starts[i + 1][0] if i + 1 < len(starts) else len(cat)
    hm = re.search(r'head="([^"]+)"', cat[pos:end])
    if hm:
        head_of["pet_" + num_] = hm.group(1)

s5 = json.loads(io.open(os.path.join(D, "_s5_pets_decoded.json"), encoding="utf-8").read())
for p in s5:
    if p["head"]:
        head_of[p["id"]] = p["head"]

pairs = [(p["id"], head_of[p["id"]]) for p in missing if p["id"] in head_of]
no_head = [p["id"] + " " + p["title"] for p in missing if p["id"] not in head_of]
print("有 head 可抓:", len(pairs), "| 无 head:", len(no_head), no_head[:5])

files = sorted({f for _, f in pairs})
print("唯一头像文件:", len(files))


def normalize_key(t):
    return t.replace("文件:", "").replace("File:", "").replace(" ", "_")


url_of = {}
for i in range(0, len(files), 50):
    chunk = files[i:i + 50]
    qs = urllib.parse.urlencode({
        "action": "query", "titles": "|".join("File:" + c for c in chunk),
        "prop": "imageinfo", "iiprop": "url", "format": "json", "formatversion": "2",
    })
    d = json.loads(http(API + "?" + qs).decode("utf-8"))
    for pg in d.get("query", {}).get("pages", []):
        ii = pg.get("imageinfo")
        if ii:
            url_of[normalize_key(pg.get("title", ""))] = ii[0]["url"]
    print("  URL %d/%d 拿到 %d" % (i + len(chunk), len(files), len(url_of)), flush=True)

no_url = [f for f in files if f not in url_of]
print("无 URL:", len(no_url), no_url[:8])


def thumb_url(full, px=160):
    m = re.match(r"(https://patchwiki\.biligame\.com/images/nrc/)([0-9a-f]/[0-9a-f]{2}/)(.+)$", full)
    if not m:
        return full
    pre, mid, name = m.groups()
    return f"{pre}thumb/{mid}{name}/{px}px-{name}"


os.makedirs(WORK, exist_ok=True)


def grab(item):
    fname, full = item
    dst = os.path.join(WORK, fname)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return True
    for u in (thumb_url(full), full):
        try:
            b = http(u)
            if b and len(b) > 100:
                io.open(dst, "wb").write(b)
                return True
        except Exception:
            continue
    return False


with ThreadPoolExecutor(max_workers=12) as ex:
    res = list(ex.map(grab, [(f, url_of[f]) for f in files if f in url_of]))
print("下载成功:", sum(res), "失败:", len(res) - sum(res))

from PIL import Image


def to_datauri(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    s = max(w, h)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(im, ((s - w) // 2, (s - h) // 2))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    canvas.save(buf, format="WEBP", quality=QUALITY, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


ok, bad = 0, []
for pid, fname in pairs:
    p = os.path.join(WORK, fname)
    if os.path.exists(p):
        try:
            icons[pid] = to_datauri(p)
            ok += 1
        except Exception as e:
            bad.append((pid, fname, str(e)))
    else:
        bad.append((pid, fname, "missing"))

print("新增图标:", ok, "失败:", len(bad), bad[:5])
io.open(icons_path, "w", encoding="utf-8").write(
    json.dumps(icons, ensure_ascii=False, separators=(",", ":")))
print("written:", icons_path, os.path.getsize(icons_path) // 1024, "KB | 总图标", len(icons))
