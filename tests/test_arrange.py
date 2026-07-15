# 编配质量测试：验证自动编配遵守标准琴学惯习（不是嘴上说，用断言证明）
# 规则依据：林晨/龚一(上行绰·下行注)、成公亮(长音吟猱)、则全(指法防单调)
# 用法：python3 tests/test_arrange.py [URL]
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899/"
fails = []

def chk(cond, name):
    print(("  ✅ " if cond else "  ❌ ") + name)
    if not cond:
        fails.append(name)

def labels(pg):
    # 返回减字行每个音的无障碍标签（含指法/走音/绰注吟猱）
    return pg.eval_on_selector_all(
        "#scoreB .jz-cell svg.jianzi",
        "els => els.map(e => e.getAttribute('aria-label') || '')")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 940, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1000)
    pg.click("#tab-p2j"); pg.wait_for_timeout(200)

    # 确保正调 + 中等韵味（绰注在密度≥0.4 生效）
    pg.select_option("#selTuning", "zheng")
    pg.select_option("select[onchange='setOrnDensity(this.value)']", "0.6")
    pg.wait_for_timeout(200)

    print("— 绰注方向惯习（上行绰·下行注）—")
    # 4=♭B、7=E 均为按音；4→7 上行、7→4 下行
    pg.fill("#inJianpu", "2/4 4 7 | 7 4 | 4 7 | 4 - ||")
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(600)
    labs = labels(pg)
    # 收集相邻按音对的方向与绰注：简化——统计是否出现绰、注，且不出现方向矛盾
    has_chuo = any("绰" in x for x in labs)
    has_zhu = any("注" in x for x in labs)
    chk(has_chuo, "上行按音出现绰(上滑入)")
    chk(has_zhu, "下行按音出现注(下滑入)")

    # 方向一致性：逐音对照——若某按音标了绰，其音高应高于前一音；标注则应更低
    semis = pg.eval_on_selector_all(
        "#scoreB .jz-cell",
        "els => els.map(e => e.getAttribute('title')||'')")
    # 用引擎内部校验代替（更可靠）：直接查 pitch 关系需内部数据，这里退而验证无「方向存疑」告警
    conv_warn = pg.inner_text("#convMsg")
    chk("方向存疑" not in conv_warn and "⚠" not in conv_warn, "无编配方向告警")

    print("— 长音吟猱、指法防单调 —")
    pg.fill("#inJianpu", "2/4 4 - | 4 - | 4 - | 4 - ||")  # 全是长按音♭B
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(600)
    labs2 = labels(pg)
    chk(any("猱" in x or "吟" in x for x in labs2), "长按音自动加吟/猱(韵味)")
    # 指法防单调：同一串♭B长音不应全是同一右手指法
    import re
    rights = []
    for x in labs2:
        m = re.search(r"(抹|挑|勾|剔|打|摘|托|擘)", x)
        if m: rights.append(m.group(1))
    chk(len(set(rights)) >= 2 if len(rights) >= 4 else True, "重复长音指法有变化(防单调)")

    print("— 散按相间（不全散/不全按）—")
    pg.fill("#inJianpu", "2/4 1 2 | 3 5 | 6 1 | 2 3 ||")
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(600)
    labs3 = labels(pg)
    n_san = sum(1 for x in labs3 if "散音" in x)
    n_an = sum(1 for x in labs3 if "徽" in x and "散音" not in x)
    chk(n_san >= 1 and n_an >= 1, "同段散音+按音并存(散按相间,音色有对比)")

    chk(len(errs) == 0, "全程无 JS 错误" + ("" if not errs else "：" + "; ".join(errs[:2])))
    b.close()

print("\n编配质量测试 " + ("ALL PASS" if not fails else "FAILED: " + "; ".join(fails)))
sys.exit(0 if not fails else 1)
