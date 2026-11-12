# -*- coding: utf-8 -*-
"""从 biligame wiki 抓取精灵头像，压缩后输出 base64 data URI 映射。

流程：
  1) 解析 _catalog.lua 得到 pet_id -> head 文件名
  2) 批量调用 MediaWiki imageinfo API 拿真实图片 URL（50 个/批）
  3) 并发下载（走缩略图接口，直接拿 96px 小图，省流量）
  4) Pillow 统一处理成 72x72 WebP，输出 icons.json: {petId: dataURI}
"""
import io, json, os, re, sys, time
import urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(D, "src")
WORK = os.path.join(D, "_icons_cache")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
API = "https://wiki.biligame.com/nrc/api.php"

SIZE = 72          # 输出边长
QUALITY = 84       # WebP 质量


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
        except Exception as e:
            if t == tries - 1:
                raise
            time.sleep(1.2 * (t + 1))


# ---------- 1) 解析 pet_id -> 头像文件名 ----------
src = io.open(os.path.join(D, "_catalog.lua"), encoding="utf-8").read()
# Lua 表是单行大字符串，用「下一个 pet_xxxxxx= 出现位置」切分每个精灵的记录
starts = [(m.start(), m.group(1)) for m in re.finditer(r'pet_(\d+)=\{', src)]
pairs = []          # (pet_id, head_file)
for i, (pos, num_) in enumerate(starts):
    end = starts[i + 1][0] if i + 1 < len(starts) else len(src)
    body = src[pos:end]
    hm = re.search(r'head="([^"]+)"', body)
    if hm:
        pairs.append(("pet_" + num_, hm.group(1)))
print("pet->head 解析:", len(pairs))
if not pairs:
    print("!! 解析失败，前 300 字符：", src[:300])
    sys.exit(1)

files = sorted({f for _, f in pairs})
print("唯一头像文件:", len(files))


# ---------- 2) 批量查 URL ----------
def normalize_key(t):
    return t.replace("文件:", "").replace("File:", "").replace(" ", "_")


url_of = {}
BATCH = 50
for i in range(0, len(files), BATCH):
    chunk = files[i:i + BATCH]
    titles = "|".join("File:" + c for c in chunk)
    qs = urllib.parse.urlencode({
        "action": "query", "titles": titles, "prop": "imageinfo",
        "iiprop": "url", "format": "json", "formatversion": "2",
    })
    raw = http(API + "?" + qs)
    d = json.loads(raw.decode("utf-8"))
    pages = d.get("query", {}).get("pages", [])
    for pg in pages:
        key = normalize_key(pg.get("title", ""))
        ii = pg.get("imageinfo")
        if ii:
            url_of[key] = ii[0]["url"]
    print(f"  URL {i + len(chunk)}/{len(files)}  拿到 {len(url_of)}", flush=True)

missing = [f for f in files if f not in url_of]
print("无 URL:", len(missing), missing[:8])


# ---------- 3) 用缩略图接口下载小图 ----------
def thumb_url(full, px=160):
    """patchwiki 支持 /thumb/xxx.png/160px-xxx.png"""
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
        return fname, True
    for u in (thumb_url(full), full):
        try:
            b = http(u)
            if b and len(b) > 100:
                io.open(dst, "wb").write(b)
                return fname, True
        except Exception:
            continue
    return fname, False


ok = fail = 0
with ThreadPoolExecutor(max_workers=12) as ex:
    for fname, good in ex.map(grab, [(f, url_of[f]) for f in files if f in url_of]):
        if good:
            ok += 1
        else:
            fail += 1
print("下载成功:", ok, "失败:", fail)


# ---------- 4) 压缩 + base64 ----------
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
    import base64
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

icons = {}
bad = []
for pid, fname in pairs:
    p = os.path.join(WORK, fname)
    if os.path.exists(p):
        try:
            icons[pid] = to_datauri(p)
        except Exception as e:
            bad.append((pid, fname, str(e)))
    else:
        bad.append((pid, fname, "missing"))

print("图标转换:", len(icons), "失败:", len(bad), bad[:5])
total = sum(len(v) for v in icons.values())
print("base64 总字节: %.2f MB" % (total / 1024 / 1024))
avg = total / max(1, len(icons))
print("平均每张: %.2f KB" % (avg / 1024))

dst = os.path.join(SRC, "icons.json")
io.open(dst, "w", encoding="utf-8").write(json.dumps(icons, ensure_ascii=False, separators=(",", ":")))
print("written:", dst, os.path.getsize(dst) // 1024, "KB")
