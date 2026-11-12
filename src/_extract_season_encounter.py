# -*- coding: utf-8 -*-
"""抓取 S1~S4 赛季页，提取奇遇精灵名单、触发机制、专属道具。"""
import io, json, re, subprocess, html, os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(D, "_season_pages")
os.makedirs(CACHE, exist_ok=True)

seasons = {"S1": "暗夜拾光", "S2": "狂欢怪谈", "S3": "铅字幻梦", "S4": "月涌狂想"}

def fetch(page):
    fp = os.path.join(CACHE, page + ".txt")
    if os.path.exists(fp):
        return io.open(fp, encoding="utf-8").read()
    out = subprocess.run(["curl", "-s", "-G", "https://wiki.biligame.com/nrc/api.php",
                          "--data-urlencode", "action=parse", "--data-urlencode", "page=" + page,
                          "--data-urlencode", "format=json", "--data-urlencode", "prop=text",
                          "-H", "User-Agent: Mozilla/5.0"], capture_output=True)
    d = json.loads(out.stdout.decode("utf-8"))
    t = d["parse"]["text"]["*"]
    t = re.sub(r"<style.*?</style>", " ", t, flags=re.S)
    t = re.sub(r"<script.*?</script>", " ", t, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t)
    io.open(fp, "w", encoding="utf-8").write(t)
    return t

report = {}
for sid, name in seasons.items():
    t = fetch(name)
    contracts = re.findall(r"在赛季奇遇中与(.{2,8}?)建立契约", t)
    blood = re.findall(r"捕捉1只奇异血脉(.{2,8}?)\s", t)
    blood2 = re.findall(r"捕捉1只(.{2,8}?)奇遇精灵", t)
    trigger = [m.group(0).strip() for m in re.finditer(r"[^。；]{0,30}(?:触发|惊盒|惊喜)[^。；]{0,50}", t)]
    balls = re.findall(r"(捕光球|奇趣球|童话球|失重球)", t)
    report[sid] = {
        "season": name,
        "contracts": contracts,
        "blood": blood,
        "blood2": blood2,
        "balls": sorted(set(balls)),
        "trigger": trigger[:14],
    }

for sid in ["S1", "S2", "S3", "S4"]:
    r = report[sid]
    print(f"===== {sid} {r['season']}")
    print("  契约奇遇:", " ".join(r["contracts"]) or "（无）")
    print("  奇异血脉:", " ".join(sorted(set(r["blood"] + r["blood2"]))) or "（无）")
    print("  专属球:", " ".join(r["balls"]))
    print("  触发片段:")
    for x in r["trigger"]:
        print("    ·", x[:90])
