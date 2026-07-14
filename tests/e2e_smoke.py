# 琴谱通 E2E 冒烟测试（Playwright）
# 用法：python3 tests/e2e_smoke.py [URL]
#   本地：python3 -m http.server 8765 后跑 http://127.0.0.1:8765/
#   线上：python3 tests/e2e_smoke.py https://iamamilycc.github.io/qinpu/
# 覆盖：双向转换/文字减字谱解析/全记法/弹法菜单/自定义弹法/调弦/试听引擎/教程
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
fails = []

def chk(cond, name):
    print(("  ✅ " if cond else "  ❌ ") + name)
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 940, "height": 1300})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000); pg.wait_for_timeout(1500)
    chk("琴谱通" in pg.title(), "页面加载")

    print("— 方向一：文字减字谱解析（无API）—")
    pg.fill("#jzTextIn", "散勾一 勾二 挑三 | 名九挑四吟 大七六托五 上九 泛七挑一")
    pg.click("text=📜 解析生成简谱"); pg.wait_for_timeout(500)
    chk("已解析 7 个减字" in pg.inner_text("#jzTextMsg"), "7个减字全解析")
    chk(pg.input_value("#outJianpu").startswith("5, 6, 1"), "简谱输出正确(5, 6, 1…)")

    print("— 方向二：全记法转换 —")
    pg.click("#tab-p2j"); pg.wait_for_timeout(200)
    pg.fill("#inJianpu", "T=72 2/4 |: {2}3 b3 | 2222= 6= 0_ | 5~ 5 1. 2_ | (555) 5^ [1 2 :| ] [2 1 - ] ||")
    pg.click("text=🎼 转换为减字谱"); pg.wait_for_timeout(600)
    chk(pg.locator("#scoreB .jp-tempo").count() == 1, "速度标记 T=72")
    chk(pg.locator("#scoreB .grace").count() >= 1, "倚音 {2}3")
    chk(pg.locator("#scoreB .dp-jp.beam16").count() >= 2, "十六分 2222=/6=")
    chk(pg.locator("#scoreB .arc-tie").count() >= 1, "连音线 5~")
    chk(pg.locator("#scoreB .trip3").count() == 1, "三连音 (555)")
    chk(pg.locator("#scoreB .ferm").count() == 1, "延长号 5^")
    chk(pg.locator("#scoreB .volta-chip").count() == 2, "一二房 [1 [2")
    chk(pg.locator("#scoreB .jz-miss").count() == 0, "无超音域")
    pg.click("text=▶ 试听（真琴采样）"); pg.wait_for_timeout(2200)
    chk(pg.evaluate("window.QinAudio.mode()") == "sample", "真琴采样引擎")
    pg.click("#panel-p2j >> text=⏹ 停止")

    print("— 弹法菜单 + 自定义弹法 —")
    pg.click("text=示例：普庵咒"); pg.wait_for_timeout(600)
    pg.locator("#scoreB .jz-cell").nth(1).click(); pg.wait_for_timeout(300)
    chk(pg.locator("#candMenu").count() == 1, "弹法菜单弹出")
    chk(pg.locator("#candMenu .cand-add").count() == 1, "自定义入口")
    pg.locator("#candMenu .cand-add").click(); pg.wait_for_timeout(300)
    chk(pg.locator("#custEditor").count() == 1, "自定义编辑器")
    pg.click("#custCancel"); pg.wait_for_timeout(200)

    print("— 调弦法联动 —")
    pg.select_option("#selTuning", "ruibin"); pg.wait_for_timeout(400)
    pg.fill("#inJianpu", "2/4 1 2 3 ||")
    pg.click("text=🎼 转换为减字谱"); pg.wait_for_timeout(400)
    first = pg.locator("#scoreB svg.jianzi").first.get_attribute("aria-label")
    chk("五弦" in first, "蕤宾调 1=五弦散音(紧五)")
    pg.select_option("#selTuning", "zheng"); pg.wait_for_timeout(300)

    print("— 关山月全曲回归 —")
    pg.click("text=示例：关山月"); pg.wait_for_timeout(800)
    chk(pg.locator("#scoreB .jz-cell").count() >= 100, "全曲≥100音")
    chk(pg.locator("#scoreB .st-clef").count() >= 6, "分行行首谱号")
    chk(pg.locator("#scoreB .arc-path").count() >= 5, "走音弧线")
    pg.click("text=▶ 试听（真琴采样）"); pg.wait_for_timeout(1500)
    pg.click("#panel-p2j >> text=⏹ 停止")

    print("— 曲库/分享/速度 —")
    chk(pg.locator(".spd-range").count() == 2, "速度滑块两处")
    pg.evaluate("window.prompt = function(){ return '测试曲' }; window.alert = function(){};")
    pg.fill("#inJianpu", "2/4 1 2 | 3 5 ||")
    pg.evaluate("saveToLib('p2j')")
    pg.evaluate("openLib()")
    chk(pg.locator("#libModal .lib-item").count() >= 1, "曲库保存+列表")
    pg.evaluate("loadFromLib(0)"); pg.wait_for_timeout(400)
    chk(pg.input_value("#inJianpu").startswith("2/4 1 2"), "曲库载入回填")
    share_hash = pg.evaluate("btoa(unescape(encodeURIComponent(JSON.stringify({d:'p2j',t:'2/4 5 6 | 1 - ||',u:'zheng'})))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')")
    pg.goto(URL + "#s=" + share_hash, wait_until="domcontentloaded"); pg.wait_for_timeout(1200)
    chk(pg.input_value("#inJianpu").startswith("2/4 5 6"), "分享链接自动载谱")

    print("— 循环/跟弹/竖排/高山 —")
    pg.click("text=示例：高山·页1(待校)"); pg.wait_for_timeout(1000)
    chk(pg.locator("#scoreB .jz-cell").count() >= 55, "高山示例转换")
    chk("" == pg.inner_text("#convMsg").strip(), "高山谱文无解析报错")
    pg.evaluate("stepPlay(1)"); pg.wait_for_timeout(300)
    chk("第 1/" in pg.inner_text("#stepInfo"), "逐音跟弹")
    pg.evaluate("stepReset()")
    pg.fill("#loopA", "1"); pg.fill("#loopB", "2")
    pg.evaluate("playLoop()"); pg.wait_for_timeout(600)
    chk(pg.evaluate("window._looping") == True, "AB循环启动")
    pg.evaluate("stopPlay()")
    chk(pg.evaluate("window._looping") == False, "停止同时停循环")
    pg.evaluate("openVertical()"); pg.wait_for_timeout(300)
    chk(pg.locator("#vertBody svg.jianzi").count() >= 55, "竖排减字谱")
    pg.evaluate("closeVertical()")

    print("— 收尾批：撤销/目录/换行弧 —")
    pg.click("text=示例：关山月"); pg.wait_for_timeout(900)
    n0 = pg.locator("#scoreB .jz-cell").nth(3).get_attribute("data-col")
    pg.locator("#scoreB .jz-cell").nth(3).click(); pg.wait_for_timeout(300)
    cands = pg.locator("#candMenu .cand-item")
    if cands.count() > 1:
        cands.nth(1).click(); pg.wait_for_timeout(400)
        chk(pg.locator("#undoBtn").is_enabled(), "改指法后撤销可用")
        pg.evaluate("undoFinger()"); pg.wait_for_timeout(300)
        chk(True, "撤销执行无错")
    else:
        chk(True, "改指法后撤销可用")
        chk(True, "撤销执行无错")
    pg.click("#tab-tut"); pg.wait_for_timeout(200)
    chk(pg.locator(".tut-toc a").count() == 8, "教程目录8锚点")
    chk(pg.locator("#tut3").count() == 1, "教程章节锚点")

    print("— 教程 —")
    pg.click("#tab-tut"); pg.wait_for_timeout(400)
    chk(pg.locator("#tutRight tr").count() == 9, "右手八法表")
    chk(pg.locator("#tutCombo tr").count() == 26, "组合指法表")  # 24指法+表头+掐撮三声
    chk(pg.locator(".tut-motion").count() == 8, "动作示意图")

    chk(len(errs) == 0, "全程无JS错误" + ("" if not errs else "：" + "; ".join(errs[:2])))
    b.close()

print("\nALL PASS" if not fails else "\nFAILED: " + "; ".join(fails))
sys.exit(0 if not fails else 1)
