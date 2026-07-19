#!/usr/bin/env python3
# 散/按割裂嫌疑筛选：列出引擎选「按音」但该音高其实有空弦(散音)可弹的音。
# 这些是「可能该用散音(承前/骨架)却算成按音」的嫌疑点，供用户对照大师减字裁决。
# 不改任何引擎行为，纯诊断。用法：python3 scripts/flag_sanan.py（需 http.server 8899）
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8899/"
DEMOS = [("loadDemo5", "极乐吟"), ("loadDemo6", "湘妃怨"), ("loadDemo7", "捣衣")]

# 返回每音：类型/弦/徽/semi + 该 semi 是否有空弦可弹(散available) + 前一音信息
JS = """() => {
  var P = window.QinPitch, OPEN = P.OPEN, nb = window._notesB;
  return nb.map(function(it, i){
    var c = it.cands[it.pick];
    var semi = it.walk ? null :
      (c.type==='san' ? P.sanSemitone(c.string)
       : c.type==='fan' ? P.fanSemitone(c.string, c.hui)
       : P.anSemitone(c.string, c.hui, c.fen||0));
    // 该音高有哪些空弦可弹(散音候选)
    var sanStrings = [];
    if (semi != null) for (var s=0;s<7;s++) if (Math.abs(OPEN[s]-semi)<0.2) sanStrings.push(s+1);
    return { i:i, jp: it.src.deg+(it.src.oct>0?"'".repeat(it.src.oct):it.src.oct<0?",".repeat(-it.src.oct):""),
             t: it.walk?'walk':c.type, s:c.string, h:c.hui||0,
             semi: semi==null?null:Math.round(semi*10)/10,
             sanAvail: sanStrings, mStart: !!it.mStart };
  });
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 940, "height": 1000})
    pg.on("dialog", lambda d: d.accept())
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(800)
    pg.click("#tab-p2j"); pg.wait_for_timeout(200)
    for fn, name in DEMOS:
        pg.evaluate(fn + "()"); pg.wait_for_timeout(600)
        nb = pg.evaluate(JS)
        # 找每音的「前一个非走音」的 semi，判断是否重复同音（散按相间只作用于重复音）
        def prev_semi(idx):
            j = idx - 1
            while j >= 0:
                if nb[j]["semi"] is not None:
                    return nb[j]["semi"]
                j -= 1
            return None
        suspects = [n for n in nb if n["t"] == "an" and n["sanAvail"]]
        strong = []
        for n in suspects:
            ps = prev_semi(n["i"])
            n["_repeat"] = (ps is not None and n["semi"] is not None and abs(ps - n["semi"]) < 0.2)
            if not n["_repeat"]:
                strong.append(n)
        print("\n═══ %s：共%d音，散/按嫌疑 %d 个（其中非重复音强候选 %d 个）═══" % (
            name, len(nb), len(suspects), len(strong)))
        for n in suspects:
            mark = "★强候选(非重复,散按相间无法解释)" if not n["_repeat"] else "  (重复同音,可能是散按相间·正常)"
            print("  #%d %s：引擎按%s弦%s徽，散可弹于%s弦%s  %s" % (
                n["i"], n["jp"], n["s"], n["h"],
                "/".join(map(str, n["sanAvail"])),
                " ⟵句首" if n["mStart"] else "", mark))
    b.close()
print("\n完成（嫌疑=按音但同音高有空弦；是否真该散，须对大师减字裁决）")
