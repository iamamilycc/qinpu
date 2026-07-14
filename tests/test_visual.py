# 琴谱通 · 视觉回归测试（验证品牌/配色/布局/四页一致/手机/打印）
# 用法：python3 tests/test_visual.py [URL]
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899/"
fails = []

def chk(cond, name):
    print(("  ✅ " if cond else "  ❌ ") + name)
    if not cond:
        fails.append(name)

def css(pg, sel, prop):
    return pg.eval_on_selector(sel, "(el,p)=>getComputedStyle(el).getPropertyValue(p)", prop).strip()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1000, "height": 900}, device_scale_factor=2)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(700)

    SEAL = "rgb(176, 54, 42)"   # --seal #b0362a

    print("— 品牌题头 —")
    chk(pg.locator(".masthead .seal").count() == 1, "朱砂印章存在")
    chk(pg.eval_on_selector(".seal > span", "el=>el.textContent") == "琴", "印章内为「琴」字")
    seal_bg = css(pg, ".seal", "background-image")
    chk("gradient" in seal_bg, "印章为渐变底")
    chk(pg.locator(".masthead h1").is_visible() and pg.eval_on_selector("h1", "el=>el.textContent") == "琴谱通", "刊名琴谱通")
    # 印章尺寸合理（非塌陷）
    box = pg.eval_on_selector(".seal", "el=>({w:el.offsetWidth,h:el.offsetHeight})")
    chk(box["w"] >= 44 and box["h"] >= 44, "印章尺寸正常(%dx%d)" % (box["w"], box["h"]))

    print("— 定弦条 —")
    chk(pg.locator(".tuning-bar label").count() == 1, "定弦标签存在")
    chk(pg.locator(".tuning-bar #selTuning").is_visible(), "定弦下拉在条内可见")
    bt = css(pg, ".tuning-bar", "border-top-width")
    chk(bt not in ("", "0px"), "定弦条有细分隔线")

    print("— 导航 Tab —")
    active_color = css(pg, ".tabs button.active", "color")
    chk(active_color == SEAL, "当前 Tab 用朱砂字色")
    ub = css(pg, ".tabs button.active", "border-bottom-color")
    chk(ub == SEAL, "当前 Tab 朱砂下划线")
    # 切换后下划线跟随（等 btn-flash 动画 340ms 结束再读色）
    pg.click("#tab-p2j"); pg.wait_for_timeout(450)
    chk(css(pg, "#tab-p2j", "color") == SEAL, "切 Tab 后新页高亮朱砂")
    chk(css(pg, "#tab-j2p", "color") != SEAL, "旧 Tab 取消高亮")

    print("— 段标题眉标 —")
    eb = pg.eval_on_selector("h2", "el=>getComputedStyle(el,'::before').backgroundColor")
    chk(eb == SEAL, "段标题朱砂眉标")

    print("— 主按钮质感 —")
    prim_bg = css(pg, "#panel-p2j .primary", "background-image")
    chk("gradient" in prim_bg, "主按钮为渐变")
    prim_sh = css(pg, "#panel-p2j .primary", "box-shadow")
    chk(prim_sh not in ("", "none"), "主按钮有投影")

    print("— 卡片阴影 —")
    card_sh = css(pg, ".card", "box-shadow")
    chk(card_sh.count("rgba") >= 1 or "rgb" in card_sh, "卡片有阴影")

    print("— 工具组类别标 —")
    tg = css(pg, "#panel-p2j .tool-group .tg-label", "color")
    chk(tg == SEAL, "工具组类别标朱砂")

    print("— 四个页面一致（都能显示、标题眉标一致）—")
    for tab, panel in [("tab-j2p", "panel-j2p"), ("tab-p2j", "panel-p2j"),
                       ("tab-tut", "panel-tut"), ("tab-about", "panel-about")]:
        pg.click("#" + tab); pg.wait_for_timeout(150)
        vis = pg.locator("#" + panel).is_visible()
        h2n = pg.locator("#" + panel + " h2").count()
        chk(vis and h2n >= 1, "%s 显示且有段标题(%d)" % (panel, h2n))

    print("— 页脚 —")
    foot = pg.locator("footer")
    chk(foot.count() == 1, "页脚存在")

    print("— 谱面渲染未被破坏（视觉改动不碰几何）—")
    pg.click("#tab-p2j"); pg.click("text=名曲：关山月"); pg.wait_for_timeout(900)
    chk(pg.locator("#scoreB .jz-cell").count() >= 100, "关山月谱面正常渲染")
    chk(pg.locator("#scoreB .arc-path").count() >= 5, "走音弧线仍在")
    # 减字字号一致性（视觉改动不应改变 svg 尺寸）
    w0 = pg.eval_on_selector("#scoreB svg.jianzi", "el=>el.getAttribute('width')")
    chk(w0 is not None, "减字 SVG 尺寸属性完好")

    print("— 手机端不横向溢出 —")
    m = b.new_page(viewport={"width": 375, "height": 780}, device_scale_factor=2)
    m.goto(URL, wait_until="domcontentloaded"); m.wait_for_timeout(400)
    doc_w = m.evaluate("document.documentElement.scrollWidth")
    win_w = m.evaluate("window.innerWidth")
    chk(doc_w <= win_w + 2, "手机端无横向溢出(%d<=%d)" % (doc_w, win_w))
    chk(m.locator(".masthead .seal").is_visible(), "手机端印章可见")

    print("— 打印样式隐藏工具组、留谱面 —")
    pg.emulate_media(media="print")
    tg_disp = pg.eval_on_selector("#panel-p2j .tool-group", "el=>getComputedStyle(el).display")
    chk(tg_disp == "none", "打印时工具组隐藏")
    sc_disp = pg.eval_on_selector("#scoreB", "el=>getComputedStyle(el).display")
    chk(sc_disp != "none", "打印时谱面保留")
    pg.emulate_media(media="screen")

    chk(len(errs) == 0, "全程无 JS 错误" + ("" if not errs else "：" + "; ".join(errs[:2])))
    b.close()

print("\n视觉测试 " + ("ALL PASS" if not fails else "FAILED: " + "; ".join(fails)))
sys.exit(0 if not fails else 1)
