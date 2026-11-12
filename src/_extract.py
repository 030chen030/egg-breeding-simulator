import json, io, os

d = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with io.open(os.path.join(d, "nrc_mod.json"), "r", encoding="utf-8") as f:
    mod = json.load(f)
with io.open(os.path.join(d, "_mod.lua"), "w", encoding="utf-8") as f:
    f.write(mod["parse"]["wikitext"]["*"])

with io.open(os.path.join(d, "nrc_text.json"), "r", encoding="utf-8") as f:
    txt = json.load(f)
with io.open(os.path.join(d, "_rendered.html"), "w", encoding="utf-8") as f:
    f.write(txt["parse"]["text"]["*"])

print("module chars:", len(mod["parse"]["wikitext"]["*"]))
print("html chars:", len(txt["parse"]["text"]["*"]))
