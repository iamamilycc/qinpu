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
    import re
    pg.fill("#inJianpu", "2/4 4 - | 4 - ||")  # 长按音♭B → 加猱韵
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(600)
    labs2 = labels(pg)
    chk(any("猱" in x or "吟" in x for x in labs2), "长按音自动加吟/猱(韵味)")
    # 指法防单调：同一句内重复同音不应全是同一右手指法（对句配对会让「相同小节」一致，
    # 那是设计使然；此处测「一句内」重复音的八法轮转/交替）
    pg.fill("#inJianpu", "2/4 4 4 4 4 | 4 4 4 4 ||")
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(600)
    rights = [m.group(1) for x in labels(pg) for m in [re.search(r"(抹|挑|勾|剔|打|摘|托|擘)", x)] if m]
    chk(len(set(rights)) >= 2 if len(rights) >= 4 else True,
        "一句内重复同音指法有变化(防单调)：" + "".join(rights))

    print("— 散按相间（不全散/不全按）—")
    pg.fill("#inJianpu", "2/4 1 2 | 3 5 | 6 1 | 2 3 ||")
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(600)
    labs3 = labels(pg)
    n_san = sum(1 for x in labs3 if "散音" in x)
    n_an = sum(1 for x in labs3 if "徽" in x and "散音" not in x)
    chk(n_san >= 1 and n_an >= 1, "同段散音+按音并存(散按相间,音色有对比)")

    print("— 泛音成大段（[泛 … ]泛 段内强制泛音）—")
    pg.select_option("#selTuning", "zheng"); pg.wait_for_timeout(150)
    pg.fill("#inJianpu", "2/4 5 6 1' | [泛 1' 6 5 6 5 1' ]泛 | 5 3 2 1")
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(600)
    flabs = labels(pg)
    seg = [x for x in flabs if "泛音" in x]
    chk(len(seg) >= 6, "泛音段6音全部取泛音，实得 %d 个泛音" % len(seg))
    # 段外的音(散/按)不应被强制成泛：首音 5(散六弦)、末句 5 3 2 1 应有非泛音
    non_fan_outside = any(("泛音" not in x and x) for x in (flabs[:3] + flabs[-4:]))
    chk(non_fan_outside, "泛音段外仍是散/按音（未污染全曲）")

    print("— 秋风词八度核准（内置曲·慢角调 base=12 回归）—")
    # 曾 bug：manjiao 中音1错落一弦C2地板，低音句 6̣5̣6̣ 掉出地板→红✕不可弹
    pg.click("text=秋风词"); pg.wait_for_timeout(900)
    chk(pg.eval_on_selector("#selTuning", "e=>e.value") == "manjiao", "秋风词自动切慢角调")
    miss = pg.eval_on_selector_all("#scoreB .jz-miss", "els=>els.length")
    chk(miss == 0, "秋风词无不可弹音(红✕)——低音句全部落在弦上，实得 %d 个" % miss)
    qlabs = labels(pg)
    # 秋风清首音(中音5=g3)应为六弦按音，对齐原谱「大指九徽六分」——绝非旧版散音四弦(G2)
    chk(len(qlabs) > 0 and "六弦" in qlabs[0] and "散音" not in qlabs[0],
        "秋风清首音=六弦按音(八度对，非散音四弦低八度)：" + (qlabs[0] if qlabs else "空"))

    print("— 撮双弦框架（左臂弦数不得缺失）—")
    pg.select_option("#selTuning", "zheng"); pg.wait_for_timeout(150)
    # 末音落一弦散C：八度音=六弦散→合规撮，两臂弦数须齐（曾 bug：左臂 ls=0 缺弦数）
    pg.fill("#inJianpu", "2/4 3 2 | 5, -"); pg.click("text=转换为减字谱"); pg.wait_for_timeout(500)
    cuolab = labels(pg)[-1]
    # 大撮＝勾低弦(一弦)+托高弦(六弦)，两臂弦数须齐；曾 bug：左臂缺弦数 + 指法用挑
    chk("撮" in cuolab and "勾一弦" in cuolab and "托六弦" in cuolab,
        "大撮=勾低弦+托高弦，两臂弦数齐（勾一弦·托六弦）：" + cuolab)
    # 正调 F 末音：八度音 f 不在任何散弦→不得出残缺撮，退回单音指法
    pg.fill("#inJianpu", "2/4 5 6 | 1 -"); pg.click("text=转换为减字谱"); pg.wait_for_timeout(500)
    flab = labels(pg)[-1]
    chk("撮" not in flab, "八度音非散弦时退回单音（不出残缺撮）：" + flab)

    chk(len(errs) == 0, "全程无 JS 错误" + ("" if not errs else "：" + "; ".join(errs[:2])))
    b.close()

print("\n编配质量测试 " + ("ALL PASS" if not fails else "FAILED: " + "; ".join(fails)))
sys.exit(0 if not fails else 1)
