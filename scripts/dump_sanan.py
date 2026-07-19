#!/usr/bin/env python3
# 散/按诊断：用完整引擎跑真谱，导出每音的散/按/弦/徽，对齐简谱。
# 目的：把「偶有把位割裂」变成当前引擎的精确可复现清单，供 TDD 定位散/按失败案例。
# 用法：python3 scripts/dump_sanan.py   （需先 python3 -m http.server 8899）
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8899/"
DEMOS = [("loadDemo5", "极乐吟(紧五1=bB)"),
         ("loadDemo6", "湘妃怨(借正调1=C)"),
         ("loadDemo7", "捣衣(紧二五七慢一1=bE)")]

DUMP_JS = """() => window._notesB.map(function(it){
  var c = it.cands[it.pick];
  var P = window.QinPitch;
  var semi = it.walk ? null :
    (c.type==='san' ? P.sanSemitone(c.string)
     : c.type==='fan' ? P.fanSemitone(c.string, c.hui)
     : P.anSemitone(c.string, c.hui, c.fen||0));
  return { jp: it.src.deg + (it.src.oct>0?"'".repeat(it.src.oct):it.src.oct<0?",".repeat(-it.src.oct):""),
           t: it.walk?'walk':c.type, s: c.string, h: c.hui||0, f: c.fen||0,
           semi: semi==null?null:Math.round(semi*10)/10,
           lyric: it.lyric||'', mStart: !!it.mStart };
})"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 940, "height": 1000})
    pg.on("dialog", lambda d: d.accept())
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(800)
    pg.click("#tab-p2j"); pg.wait_for_timeout(200)
    for fn, name in DEMOS:
        pg.evaluate(fn + "()"); pg.wait_for_timeout(600)
        notes = pg.evaluate(DUMP_JS)
        print("\n═══", name, "共", len(notes), "音 ═══")
        line = []
        for i, n in enumerate(notes):
            tag = {"san": "散", "an": "按", "fan": "泛", "walk": "走"}.get(n["t"], n["t"])
            if n["t"] == "san":
                pos = "%s弦" % n["s"]
            elif n["t"] == "an":
                pos = "%s弦%s徽%s" % (n["s"], n["h"], ("·%d分" % n["f"]) if n["f"] else "")
            elif n["t"] == "fan":
                pos = "泛%s弦%s徽" % (n["s"], n["h"])
            else:
                pos = "走音"
            bar = " |" if n["mStart"] and i > 0 else ""
            line.append("%s%d.%s%s(%s)%s" % (bar, i, n["jp"], tag, pos, ("「%s」" % n["lyric"]) if n["lyric"] else ""))
        print(" ".join(line))
    b.close()
print("\n完成")
