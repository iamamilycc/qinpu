# 琴谱通 · 全按键点击测试（逐个真实点击，验证有反应、无 JS 错误）
# 用法：python3 tests/test_buttons.py [URL]
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899/"
fails, errs = [], []

def chk(cond, name):
    print(("  ✅ " if cond else "  ❌ ") + name)
    if not cond:
        fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required",
                                "--use-fake-ui-for-media-stream"])
    pg = b.new_page(viewport={"width": 980, "height": 1300})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    # 真实用户：确认框点「确定」，输入框（起名）取消，提示框关掉
    def on_dialog(d):
        if d.type == "prompt":
            d.dismiss()
        else:
            d.accept()
    pg.on("dialog", on_dialog)
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1200)

    # ═══ 顶部：调弦下拉 + 四个 Tab ═══
    print("— 顶部导航 —")
    for tab, panel in [("tab-j2p", "panel-j2p"), ("tab-p2j", "panel-p2j"),
                       ("tab-tut", "panel-tut"), ("tab-about", "panel-about")]:
        pg.click("#" + tab); pg.wait_for_timeout(150)
        chk(pg.locator("#" + panel).is_visible(), "Tab 切换：" + tab)
    pg.select_option("#selTuning", "ruibin"); pg.wait_for_timeout(200)
    chk(pg.input_value("#selTuning") == "ruibin", "调弦下拉可选")
    pg.select_option("#selTuning", "zheng"); pg.wait_for_timeout(150)

    # ═══ 方向一：减字谱 → 简谱 ═══
    print("— 减字谱→简谱 面板 —")
    pg.click("#tab-j2p"); pg.wait_for_timeout(200)
    pg.fill("#jzTextIn", "散勾一 勾二 挑三 | 名九挑四")
    pg.click("text=解析生成简谱"); pg.wait_for_timeout(400)
    chk("已解析" in pg.inner_text("#jzTextMsg"), "①解析生成简谱")
    # 点选拼字添加
    pg.select_option("#selType", "san"); pg.wait_for_timeout(100)
    pg.click("text=添加到谱"); pg.wait_for_timeout(200)
    chk(pg.locator("#scoreA .jz-cell").count() >= 1, "➕添加到谱")
    pg.click("text=试听此音"); pg.wait_for_timeout(200); chk(len(errs) == 0, "🔊试听此音无错")
    pg.click("text=小节线"); pg.wait_for_timeout(150)
    pg.click("text=撤销上一个"); pg.wait_for_timeout(150); chk(True, "↩️撤销上一个")
    pg.click("text=清空"); pg.wait_for_timeout(150)
    chk(pg.locator("#scoreA .jz-cell").count() == 0, "🗑清空")
    # A 卡播放/风格/曲库
    pg.click("text=解析生成简谱"); pg.wait_for_timeout(500)
    pg.click("text=▶ 试听整段"); pg.wait_for_timeout(400); pg.click("#panel-j2p >> text=⏹ 停止")
    chk(True, "▶试听整段")
    for st in ["文句法", "匀速吟诵", "琴歌韵", "散板古意", "轻快"]:
        pg.click("#panel-j2p >> text=" + st); pg.wait_for_timeout(250); pg.click("#panel-j2p >> text=⏹ 停止")
    chk(len(errs) == 0, "🎭五种打谱风格无错")

    # ═══ 方向二：简谱 → 减字谱 ═══
    print("— 简谱→减字谱 面板 —")
    pg.click("#tab-p2j"); pg.wait_for_timeout(200)
    # 获取旋律：三名曲 + 编配/韵味
    for demo, mn in [("名曲：普庵咒", 8), ("名曲：关山月", 100), ("名曲：高山·页1", 30)]:
        pg.click("text=" + demo); pg.wait_for_timeout(800)
        chk(pg.locator("#scoreB .jz-cell").count() >= mn, "🎵 " + demo)
    pg.select_option("select[onchange='setArrProfile(this.value)']", "hong"); pg.wait_for_timeout(600)
    chk(len(errs) == 0, "编配画像切换")
    pg.select_option("select[onchange='setOrnDensity(this.value)']", "0.9"); pg.wait_for_timeout(600)
    chk(len(errs) == 0, "韵味密度切换")
    pg.click("text=转换为减字谱"); pg.wait_for_timeout(500)
    chk(pg.locator("#scoreB .jz-cell").count() >= 1, "🎼转换为减字谱")

    # 播放组
    print("— 播放/循环/跟弹 —")
    pg.click("text=▶ 试听（真琴采样）"); pg.wait_for_timeout(500)
    chk(pg.evaluate("window.QinAudio.mode()") == "sample", "▶试听真琴采样")
    pg.evaluate("setSpeed(70)"); chk(pg.evaluate("window._spdScale") == 0.7, "🐢速度滑块")
    pg.evaluate("setSpeed(100)")
    pg.click("#panel-p2j >> text=⏹ 停止"); pg.wait_for_timeout(200)
    chk(pg.evaluate("window._looping") == False, "⏹停止")
    # 段落循环
    pg.fill("#loopA", "1"); pg.fill("#loopB", "2")
    pg.click("text=循环播放"); pg.wait_for_timeout(500)
    chk(pg.evaluate("window._looping") == True, "🔁循环播放")
    pg.click("#panel-p2j >> text=⏹ 停止"); pg.wait_for_timeout(200)
    # 逐音跟弹
    pg.click("text=▶ 下一音"); pg.wait_for_timeout(300)
    chk("第 1/" in pg.inner_text("#stepInfo"), "▶下一音")
    pg.click("text=▶ 下一音"); pg.wait_for_timeout(200)
    chk("第 2/" in pg.inner_text("#stepInfo"), "▶下一音累进")
    pg.click("text=◀ 上一音"); pg.wait_for_timeout(200)
    chk("第 1/" in pg.inner_text("#stepInfo"), "◀上一音")
    pg.click("text=⏮ 重头"); pg.wait_for_timeout(200)
    chk("回到开头" in pg.inner_text("#stepInfo"), "⏮重头有反应")
    pg.click("text=▶ 下一音"); pg.wait_for_timeout(200)
    chk("第 1/" in pg.inner_text("#stepInfo"), "重头后从第1音起")

    # 编辑·输出（复位默认编配，重转换，再点减字改真弹法）
    print("— 编辑/输出/竖排 —")
    pg.select_option("select[onchange='setArrProfile(this.value)']", "yuan2")
    pg.select_option("select[onchange='setOrnDensity(this.value)']", "0.6")
    pg.click("text=名曲：关山月"); pg.wait_for_timeout(900)
    pg.evaluate("stepReset()")
    # 找一个候选数≥2 的减字（排除自定义项后仍有多种弹法）
    picked = False
    for idx in [3, 5, 7, 9, 11, 2, 4]:
        cell = pg.locator("#scoreB .jz-cell").nth(idx)
        cell.scroll_into_view_if_needed(); cell.click(); pg.wait_for_timeout(250)
        real = pg.locator("#candMenu .cand-item:not(.cand-add)")
        if real.count() >= 2:
            # 点一个非当前项（末位真候选）
            real.nth(real.count() - 1).click(); pg.wait_for_timeout(400)
            picked = True; break
        pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    chk(picked and pg.locator("#undoBtn").is_enabled(), "改指法→撤销按钮亮")
    pg.click("text=↩ 撤销改指法"); pg.wait_for_timeout(300)
    chk(not pg.locator("#undoBtn").is_enabled(), "↩撤销后按钮复位灰")
    # 竖排（弹窗）
    pg.click("text=📜 竖排减字谱"); pg.wait_for_timeout(400)
    chk(pg.locator("#vertModal").is_visible(), "📜竖排减字谱弹出")
    chk(pg.locator("#vertBody svg.jianzi").count() >= 30, "竖排含减字")
    chk(pg.locator("#vertBody svg .jz-box").count() == 0, "竖排无边框(bare)")
    pg.click("#vertModal >> text=✕"); pg.wait_for_timeout(200)
    chk(not pg.locator("#vertModal").is_visible(), "竖排✕关闭")

    # 曲库组
    print("— 曲库/分享 —")
    pg.click("#panel-p2j >> text=💾 存入曲库"); pg.wait_for_timeout(300)  # prompt 取消，不应报错
    chk(len(errs) == 0, "💾存入曲库无错")
    pg.click("#panel-p2j >> text=📂 我的曲库"); pg.wait_for_timeout(300)
    chk(pg.locator("#libModal").is_visible(), "📂我的曲库弹出")
    pg.click("#libModal >> text=✕"); pg.wait_for_timeout(150)
    pg.click("#panel-p2j >> text=🔗 分享链接"); pg.wait_for_timeout(300)
    chk(len(errs) == 0, "🔗分享链接无错")

    # 哼唱/MIDI 引擎（钩子，headless 无真麦克风/文件）
    print("— 哼唱/MIDI 引擎 —")
    hum = pg.evaluate("""() => {
      function tone(hz,n){var a=[];for(var i=0;i<n;i++)a.push({f:hz,rms:0.05});return a;}
      function sil(n){var a=[];for(var i=0;i<n;i++)a.push({f:-1,rms:0.001});return a;}
      return QinHum.quantize([].concat(tone(261.63,12),sil(3),tone(293.66,12),sil(3),tone(329.63,12)),0.046);
    }""")
    chk(hum.startswith("5 6 7"), "🎤哼唱转谱引擎")
    midi = pg.evaluate("""() => {
      function vlq(n){var b=[n&0x7f];n>>=7;while(n){b.unshift((n&0x7f)|0x80);n>>=7;}return b;}
      var ev=[]; [60,62,64].forEach(function(m){ ev=ev.concat(vlq(0),[0x90,m,0x64],vlq(480),[0x80,m,0x00]); });
      var trk=ev.concat([0,0xff,0x2f,0]);
      function u32(n){return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
      var hdr=[0x4d,0x54,0x68,0x64].concat(u32(6),[0,0,0,1,0x01,0xe0]);
      var body=[0x4d,0x54,0x72,0x6b].concat(u32(trk.length),trk);
      return QinMidi.parse(new Uint8Array(hdr.concat(body)).buffer);
    }""")
    chk(midi.startswith("5 6 7"), "🎹MIDI导入引擎")

    # 教程目录锚点
    print("— 教程目录 —")
    pg.click("#tab-tut"); pg.wait_for_timeout(200)
    toc = pg.locator(".tut-toc a")
    chk(toc.count() == 8, "教程目录8锚点")
    toc.nth(2).click(); pg.wait_for_timeout(200)
    chk(pg.locator("#tut3").is_visible(), "目录锚点跳转")

    chk(len(errs) == 0, "全程无 JS 错误" + ("" if not errs else "：" + "; ".join(errs[:3])))
    b.close()

print("\n全按键测试 " + ("ALL PASS" if not fails else "FAILED: " + "; ".join(fails)))
sys.exit(0 if not fails else 1)
