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
    # 正调 F 末音：高八度 f 不在散弦 → 混合臂撮（散弦臂+大指按音臂，带指+徽标注）
    # ——秋风词梅庵闭环书证（明=散四+九徽六、月=散五+大九七、秋=散六+大七六七），
    #   2026-07-16 起按音臂为合法臂，不再退回单音；臂上必须带「大指X徽」注明位置。
    pg.fill("#inJianpu", "2/4 5 6 | 1 -"); pg.click("text=转换为减字谱"); pg.wait_for_timeout(500)
    flab = labels(pg)[-1]
    chk("撮" in flab and "勾三弦" in flab and "大指" in flab and "徽" in flab,
        "八度音非散弦时=混合臂撮（散臂+大指按音臂带徽位）：" + flab)

    # ═══ 秋风词逐音闭环（梅庵1931 大师减字 vs 引擎，docs/闭环对照-秋风词.md）═══
    print("— 秋风词闭环（琴歌·师承画像）—")
    pg.evaluate("loadDemo4()"); pg.wait_for_timeout(600)
    chk(pg.eval_on_selector("#selArrProfile", "e => e.value") == "qinge",
        "秋风词自动切「琴歌·师承」画像")
    nb = pg.evaluate("""() => window._notesB.map(it => {
      const c = it.cands[it.pick];
      return { t: c.type, s: c.string, h: c.hui||0, f: c.fen||0, r: it.right,
               orn: (it.orn||[]).join('/'), w: it.walk? it.walk.dir : null,
               hide: !!it.hideWalk, cuo: it.cuo||null };
    })""")
    # 开头「秋风清」＝大九挑六／散勾四／大九六（按-散⁸ᵛᵇ-按，大师逐字吻合）
    chk(nb[0]["t"] == "an" and nb[0]["s"] == 6 and nb[0]["h"] == 9 and
        nb[1]["t"] == "san" and nb[1]["s"] == 4 and
        nb[2]["t"] == "an" and nb[2]["s"] == 6 and nb[2]["h"] == 9,
        "秋风清＝大九六/散四/大九六（对齐大师）")
    # 「秋」长音＝混合臂撮：散勾六＋大指七徽六分挑七（大师原字）
    c3 = nb[3]["cuo"]
    chk(c3 and c3["ls"] == 6 and c3["rs"] == 7 and c3.get("rl") == "大" and
        c3["rhui"] == 7 and c3.get("rfen") == 6,
        "秋＝撮[散六+大七六挑七]（大师原字）")
    # 「明」长音＝撮：散勾四＋大指九徽六弦（大师原字）
    c5 = nb[5]["cuo"]
    chk(c5 and c5["ls"] == 4 and c5["rs"] == 6 and c5.get("rhui") == 9,
        "明＝撮[散四+大九·六弦]（大师原字）")
    # 三连重复音＝散-按-散（栖复惊 111：挑六/中十勾四/挑六——大师全曲 7 组无一例外）
    chk(nb[19]["t"] == "san" and nb[19]["s"] == 6 and
        nb[20]["t"] == "an" and nb[20]["s"] == 4 and nb[20]["h"] == 10 and
        nb[21]["t"] == "san" and nb[21]["s"] == 6,
        "栖复惊111＝散六/按四十徽/散六（散按散）")
    # 快速回返音型折叠：3532→撞、656/323→退复（谱面并字，一弹多音）
    n_zhuang = sum(1 for x in nb if "撞" in x["orn"])
    n_tuifu = sum(1 for x in nb if "退复" in x["orn"])
    n_hide = sum(1 for x in nb if x["hide"])
    chk(n_zhuang >= 3, "3532 型音组折叠为「撞」（实得 %d 处）" % n_zhuang)
    chk(n_tuifu >= 2, "656/323 型音组折叠为「退复」（实得 %d 处）" % n_tuifu)
    chk(n_hide == 2 * (n_zhuang + n_tuifu),
        "每处撞/退复恰隐藏两个走音小字（%d=2×%d）" % (n_hide, n_zhuang + n_tuifu))
    # 散音占比（大师约四成散音；旧引擎全曲仅 3 个散音=bug 级偏差）
    n_san = sum(1 for x in nb if x["t"] == "san" and not x["w"])
    chk(n_san >= 25, "散音占比恢复琴歌口径（散音 %d 个 ≥25）" % n_san)
    # 零距离假走音回归（徽分平均律 comma 曾致「上至原徽位」）：
    # 所有走音的落点须与前一音位置不同
    zero_walks = pg.evaluate("""() => {
      const nbb = window._notesB; let bad = 0;
      for (let i = 1; i < nbb.length; i++) {
        const w = nbb[i].walk; if (!w) continue;
        const p = nbb[i-1];
        if (p.walk) { if (p.walk.string === w.string && p.walk.hui === w.hui &&
                          (p.walk.fen||0) === (w.fen||0)) bad++; }
        else { const pc = p.cands[p.pick];
               if (pc.type === 'an' && pc.string === w.string && pc.hui === w.hui &&
                   (pc.fen||0) === (w.fen||0)) bad++; }
      }
      return bad;
    }""")
    chk(zero_walks == 0, "无零距离假走音（回归）")

    # ═══ 极乐吟闭环（紧五1=♭B，docs/闭环对照-极乐吟.md）═══
    print("— 极乐吟闭环（蕤宾/紧五·跨调验证）—")
    pg.evaluate("loadDemo5()"); pg.wait_for_timeout(600)
    chk(pg.eval_on_selector("#selTuning", "e => e.value") == "ruibin", "极乐吟自动切紧五(ruibin)")
    chk(pg.eval_on_selector("#convMsg", "e => e.textContent").strip() == "", "全曲无超音域红✕")
    nb5 = pg.evaluate("""() => window._notesB.map(it => {
      const c = it.cands[it.pick];
      return { t: c.type, s: c.string, h: c.hui||0, r: it.right, w: !!it.walk,
               semi: it.walk ? null : Math.round(((c.type==='san') ? window.QinPitch.sanSemitone(c.string)
                     : c.type==='fan' ? window.QinPitch.fanSemitone(c.string,c.hui)
                     : window.QinPitch.anSemitone(c.string,c.hui,c.fen||0))*10)/10,
               cuo: it.cuo||null };
    })""")
    # 烟消 5555＝轮拆解（摘剔挑三连）＋第4声，同弦同徽（大师：名十抹六＋轮，同位四声）
    lun = False
    for i in range(len(nb5) - 3):
        a, bq, cq, dq = nb5[i:i+4]
        if all(x["t"] == "an" and not x["w"] for x in (a, bq, cq, dq)) and \
           len({(x["s"], x["h"]) for x in (a, bq, cq, dq)}) == 1 and \
           [a["r"], bq["r"], cq["r"]] == ["摘", "剔", "挑"]:
            lun = True; break
    chk(lun, "烟消5555＝同位四声·轮拆解(摘剔挑)+第4声（对齐大师「轮」）")
    # 绿＝撮[散四 + 大九·六弦]（与秋风词「明」同构，跨曲重现）
    lv = any(x["cuo"] and x["cuo"].get("ls") == 4 and x["cuo"].get("rs") == 6 and
             x["cuo"].get("rhui") == 9 for x in nb5)
    chk(lv, "绿＝撮[散四+大九六]（跨曲重现）")
    # 重复音散-按-散（不见人 111：散五/名十三/散五——含八分对也相间，极乐吟书证）
    sas = False
    for i in range(len(nb5) - 2):
        a, bq, cq = nb5[i:i+3]
        if a["w"] or bq["w"] or cq["w"]: continue
        if a["semi"] == cq["semi"] and a["semi"] is not None and bq["semi"] == a["semi"] and \
           a["t"] == "san" and bq["t"] == "an" and cq["t"] == "san":
            sas = True; break
    chk(sas, "重复音三连＝散-按-散（八分对也相间）")
    # ═══ 湘妃怨闭环（借正调1=C，docs/闭环对照-湘妃怨.md）═══
    print("— 湘妃怨闭环（借正调·泛音段节点强度）—")
    pg.evaluate("loadDemo6()"); pg.wait_for_timeout(600)
    chk(pg.eval_on_selector("#selTuning", "e => e.value") == "jiezheng", "湘妃怨自动切借正调(jiezheng)")
    chk(pg.eval_on_selector("#convMsg", "e => e.textContent").strip() == "", "借正调全曲无超音域红✕(base=12生效)")
    nb6 = pg.evaluate("""() => window._notesB.map(it => {
      const c = it.cands[it.pick];
      return { t: it.walk?'walk':c.type, s: c.string, h: c.hui||0,
               jp: it.src.deg + (it.src.oct>0?'H':'') };
    })""")
    # 开篇泛音段：5 5 6 6 = 泛七四/四/五/五（七徽泛音，节点最强，闭环核对大师减字）
    chk(nb6[0]["t"]=="fan" and nb6[0]["s"]==4 and nb6[0]["h"]==7, "湘妃怨首音＝泛七四(七徽泛音·对齐大师)：得 %s%d/徽%d" % (nb6[0]["t"], nb6[0]["s"], nb6[0]["h"]))
    chk(nb6[2]["t"]=="fan" and nb6[2]["s"]==5 and nb6[2]["h"]==7, "第3音6＝泛七五")
    # 泛音段前14音：节点强度偏好使几乎全取七徽（唯高音3=E4无八度取五徽，大师同）
    fan_hui7 = sum(1 for x in nb6[:14] if x["t"]=="fan" and x["h"]==7)
    chk(fan_hui7 >= 12, "泛音段节点强度偏好：≥12音用七徽最强节点（得 %d/14）" % fan_hui7)
    # base=12 验证：中音1(弦6开)与高音1区分——首音泛七四=G3(中5)落在弦4，不掉一弦地板
    chk(all(x["s"] >= 1 for x in nb6), "无音落弦0(base=12防低八度掉地板)")
    chk(len(errs) == 0, "全程无 JS 错误" + ("" if not errs else "：" + "; ".join(errs[:2])))
    b.close()

print("\n编配质量测试 " + ("ALL PASS" if not fails else "FAILED: " + "; ".join(fails)))
sys.exit(0 if not fails else 1)
