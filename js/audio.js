/* ============================================================
 * 琴谱通 audio.js —— 古琴试听（零依赖，Web Audio）
 *
 * 双引擎：
 * ① 真琴采样（默认）：samples.js 内嵌真古琴七根空弦录音
 *    （RafaelCaro/freesound CC-BY 4.0），选最近空弦按半音差变速。
 * ② 合成后备：Karplus-Strong 物理弦模型，采样解码失败时兜底。
 *
 * 走手音（上/下滑）的物理正确实现：
 *   不开新声源——在上一次拨弦的【同一个声源】上做 playbackRate
 *   渐变（同一根弦的余音滑高滑低，能量只减不增）；
 *   滑动过程按"实—虚—实"做音量凹陷（龚一：头尾为实、过程为虚），
 *   并叠极轻的擦弦摩擦噪声。
 *
 * 音高输入 = 相对一弦散音 C2(65.406Hz) 的半音数（可带小数）。
 * ============================================================ */
(function (global) {
  'use strict';
  var ctx = null, master = null, ksBus = null, timers = [], srcs = [], bufCache = {};
  var sampleBuf = null, sampleTried = false, noiseBuf = null;
  var extBufs = null; // 每根弦的"续尾"长采样（相位对齐循环延长，见 buildExtended）
  var META = global.QIN_SAMPLE_META || null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(ctx.destination);
      // 轻混响：把前后音"黏"在一起（琴室空间感，干声会显得断）
      var irDur = 1.5, irN = Math.round(ctx.sampleRate * irDur);
      var ir = ctx.createBuffer(2, irN, ctx.sampleRate);
      for (var c = 0; c < 2; c++) {
        var d = ir.getChannelData(c), lpv = 0;
        for (var i = 0; i < irN; i++) {
          // 低通化噪声 × 指数衰减 = 柔和房间尾音
          lpv = lpv * 0.82 + (Math.random() * 2 - 1) * 0.18;
          d[i] = lpv * Math.pow(1 - i / irN, 2.2);
        }
      }
      var conv = ctx.createConvolver(); conv.buffer = ir;
      var wet = ctx.createGain(); wet.gain.value = 0.3;
      master.connect(conv); conv.connect(wet); wet.connect(ctx.destination);
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.5; // 合成音去金属味
      ksBus = ctx.createGain(); ksBus.gain.value = 1;
      ksBus.connect(lp); lp.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function ensureSamples() {
    if (sampleBuf) return Promise.resolve(sampleBuf);
    if (sampleTried || !META || !global.QIN_SAMPLE_MP3) return Promise.resolve(null);
    sampleTried = true;
    try {
      var bin = atob(global.QIN_SAMPLE_MP3);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return ctx.decodeAudioData(arr.buffer).then(function (b) {
        sampleBuf = b;
        buildExtended(b);
        return b;
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ── 续尾：录音里每弦只响 0.8~0.9s 就被下一次拨弦截断（比一拍还短，
   *    是"一顿一顿"的根源）。取段尾稳态区做【基频整数周期对齐】的
   *    循环拼接 + 按实测衰减率逐圈衰减 → 无缝延长到 2.8s 余音。── */
  function buildExtended(buf) {
    var sr = buf.sampleRate, ch = buf.getChannelData(0);
    var TOTAL = Math.round(4.6 * sr);
    extBufs = [];
    for (var s = 0; s < 7; s++) {
      var f0 = 65.406 * Math.pow(2, META.openSemis[s] / 12);
      var period = Math.max(8, Math.round(sr / f0));
      var a = Math.round(META.onsets[s] * sr);
      var bnd = Math.round((s < 6 ? META.onsets[s + 1] : META.end) * sr);
      var segN = bnd - a;
      // 循环区：段尾 ~0.3s，长度取基频整数周期（相位对齐是无缝的关键）
      var loopLen = Math.max(4, Math.round(0.3 * sr / period)) * period;
      if (loopLen > segN * 0.45) loopLen = Math.max(2, Math.floor(segN * 0.45 / period)) * period;
      var loopStart = segN - loopLen;
      var xf = 2 * period; // 交叉渐变2个周期（同为周期整数倍→相位相干）
      if (xf > loopLen / 2) xf = Math.floor(loopLen / 2 / period) * period || period;
      // 实测该弦的自然衰减率（循环区首尾 RMS 比）
      var rms = function (off, n) {
        var sum = 0;
        for (var i = 0; i < n; i++) { var v = ch[a + off + i]; sum += v * v; }
        return Math.sqrt(sum / n);
      };
      var r0 = rms(loopStart, period * 2), r1 = rms(segN - period * 2, period * 2);
      var decay = (r0 > 1e-6) ? Math.min(0.97, Math.max(0.55, r1 / r0)) : 0.85;
      // 拼接
      var out = new Float32Array(TOTAL);
      var copyN = Math.min(segN, TOTAL);
      for (var i2 = 0; i2 < copyN; i2++) out[i2] = ch[a + i2];
      var pos = segN - xf, amp = 1;
      while (pos + loopLen <= TOTAL) {
        amp *= decay;
        for (var j = 0; j < loopLen; j++) {
          var v = ch[a + loopStart + j] * amp;
          if (j < xf) { var w = j / xf; out[pos + j] = out[pos + j] * (1 - w) + v * w; }
          else out[pos + j] = v;
        }
        pos += loopLen - xf;
      }
      var ab = ctx.createBuffer(1, TOTAL, sr);
      ab.getChannelData(0).set(out);
      extBufs.push(ab);
    }
  }

  /* ── 走音 = 音高轨迹自动化 ── */
  function vib(p, base, t0, hz, cents, dur) {
    var half = 1 / (hz * 2), n = Math.max(2, Math.round(dur / half));
    for (var i = 1; i <= n; i++) {
      var c = (i % 2 ? 1 : -1) * cents * (1 - i / (n + 1));
      p.linearRampToValueAtTime(base * Math.pow(2, c / 1200), t0 + i * half);
    }
    p.linearRampToValueAtTime(base, t0 + (n + 1) * half);
  }

  function applyOrn(p, base, when, orns) {
    orns = orns || [];
    function has(o) { return orns.indexOf(o) >= 0; }
    function r(c) { return base * Math.pow(2, c / 1200); }
    if (has('绰')) { p.setValueAtTime(r(-180), when); p.linearRampToValueAtTime(base, when + 0.18); }
    else if (has('注')) { p.setValueAtTime(r(200), when); p.linearRampToValueAtTime(base, when + 0.18); }
    else p.setValueAtTime(base, when);
    var t0 = when + 0.25;
    if (has('逗')) { p.setValueAtTime(base, when + 0.04); p.linearRampToValueAtTime(r(90), when + 0.09); p.linearRampToValueAtTime(base, when + 0.15); }
    if (has('撞')) { p.setValueAtTime(base, t0); p.linearRampToValueAtTime(r(160), t0 + 0.07); p.linearRampToValueAtTime(base, t0 + 0.16); }
    if (has('双撞')) {
      p.setValueAtTime(base, t0);
      p.linearRampToValueAtTime(r(160), t0 + 0.07); p.linearRampToValueAtTime(base, t0 + 0.14);
      p.linearRampToValueAtTime(r(160), t0 + 0.21); p.linearRampToValueAtTime(base, t0 + 0.3);
    }
    if (has('唤')) { p.setValueAtTime(base, t0); p.linearRampToValueAtTime(r(160), t0 + 0.08); p.linearRampToValueAtTime(r(-120), t0 + 0.25); p.linearRampToValueAtTime(base, t0 + 0.4); }
    if (has('吟')) vib(p, base, t0, 4.5, 45, 1.0);
    if (has('猱')) vib(p, base, t0, 3.0, 95, 1.2);
    // 吟猱细分（幅度音分/频率Hz/时长s 各异）
    if (has('细吟')) vib(p, base, t0, 6.0, 25, 0.8);
    if (has('长吟')) vib(p, base, t0, 4.2, 45, 1.8);
    if (has('急吟')) vib(p, base, t0, 6.5, 55, 0.6);
    if (has('游吟')) vib(p, base, t0, 3.2, 55, 1.6);
    if (has('大猱')) vib(p, base, t0, 2.6, 140, 1.5);
    if (has('急猱')) vib(p, base, t0, 4.0, 110, 0.8);
    if (has('缓猱')) vib(p, base, t0, 2.2, 80, 1.7);
    if (has('上')) { p.setValueAtTime(base, t0); p.linearRampToValueAtTime(r(200), t0 + 0.42); }
    if (has('下')) { p.setValueAtTime(base, t0); p.linearRampToValueAtTime(r(-200), t0 + 0.42); }
    if (has('进复')) { p.setValueAtTime(base, t0); p.linearRampToValueAtTime(r(200), t0 + 0.2); p.setValueAtTime(r(200), t0 + 0.38); p.linearRampToValueAtTime(base, t0 + 0.55); }
    if (has('退复')) { p.setValueAtTime(base, t0); p.linearRampToValueAtTime(r(-200), t0 + 0.2); p.setValueAtTime(r(-200), t0 + 0.38); p.linearRampToValueAtTime(base, t0 + 0.55); }
    if (has('往来')) vib(p, base, t0, 0.9, 160, 1.6);
    if (has('淌')) { p.setValueAtTime(base, t0); p.linearRampToValueAtTime(r(-280), t0 + 0.9); }
    if (has('分开')) { p.setValueAtTime(base, t0 + 0.1); p.setValueAtTime(r(200), t0 + 0.3); p.setValueAtTime(base, t0 + 0.6); }
  }

  /* ── 左手技法 = 音色/力度 ── */
  var TECH_MUTE = { '罨': [520, 0.5, 0.75], '虚罨': [420, 0.32, 0.55] };
  var TECH_SOFT = { '掐起': 1, '带起': 1, '爪起': 1, '推出': 1, '放合': 1 };

  function techChain(orns, vol0, out) {
    var tech = null;
    (orns || []).forEach(function (o) { if (TECH_MUTE[o] || TECH_SOFT[o]) tech = tech || o; });
    if (tech && TECH_MUTE[tech]) {
      var m = TECH_MUTE[tech];
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = m[0]; f.Q.value = 0.4;
      f.connect(out);
      return { input: f, vol: vol0 * m[1], maxDur: m[2] };
    }
    if (tech) {
      var f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass'; f2.frequency.value = 1700; f2.Q.value = 0.4;
      f2.connect(out);
      return { input: f2, vol: vol0 * 0.6, maxDur: 99 };
    }
    return { input: out, vol: vol0, maxDur: 99 };
  }

  /* ── 擦弦摩擦声：指甲/指肉蹭过缠弦 + 琴面木头共鸣 ──
   * dir: 1=上滑(噪声频率上扫) -1=下滑 0=原地(吟猱揉弦) */
  function frictionAt(when, dur, dir, level) {
    dir = dir || 0; level = level || 0.05;
    if (!noiseBuf) {
      var n = Math.round(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    // ① 弦上蹭动"沙沙"：带通频率随滑动方向扫动
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.6;
    var f0 = dir > 0 ? 850 : dir < 0 ? 1900 : 1300;
    var f1 = dir > 0 ? 1900 : dir < 0 ? 850 : 1300;
    bp.frequency.setValueAtTime(f0, when);
    bp.frequency.linearRampToValueAtTime(f1, when + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(level, when + dur * 0.35);
    g.gain.setValueAtTime(level, when + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(when); s.stop(when + dur + 0.05);
    srcs.push(s);
    // ② 琴面木头低频闷响（手压着弦在面板上移动）
    var s2 = ctx.createBufferSource(); s2.buffer = noiseBuf; s2.loop = true;
    var lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass'; lp2.frequency.value = 320; lp2.Q.value = 0.5;
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.linearRampToValueAtTime(level * 0.6, when + dur * 0.4);
    g2.gain.linearRampToValueAtTime(0.0001, when + dur);
    s2.connect(lp2); lp2.connect(g2); g2.connect(master);
    s2.start(when + 0.01); s2.stop(when + dur + 0.05);
    srcs.push(s2);
  }

  /* 各走音的摩擦声排程（时间点与 applyOrn 的音高轨迹一致） */
  function frictionForOrns(when, orns) {
    orns = orns || [];
    function has(o) { return orns.indexOf(o) >= 0; }
    var t0 = when + 0.25;
    if (has('绰')) frictionAt(when - 0.02, 0.36, 1, 0.013);
    if (has('注')) frictionAt(when - 0.02, 0.36, -1, 0.013);
    if (has('上')) frictionAt(t0, 0.55, 1, 0.014);
    if (has('下')) frictionAt(t0, 0.55, -1, 0.014);
    if (has('进复')) { frictionAt(t0, 0.34, 1, 0.013); frictionAt(t0 + 0.36, 0.32, -1, 0.011); }
    if (has('退复')) { frictionAt(t0, 0.34, -1, 0.013); frictionAt(t0 + 0.36, 0.32, 1, 0.011); }
    if (has('撞')) frictionAt(t0, 0.26, 1, 0.011);
    if (has('双撞')) { frictionAt(t0, 0.24, 1, 0.011); frictionAt(t0 + 0.14, 0.24, 1, 0.01); }
    if (has('唤')) frictionAt(t0, 0.6, -1, 0.013);
    if (has('逗')) frictionAt(when + 0.04, 0.2, 1, 0.01);
    if (has('往来')) { frictionAt(t0, 0.7, 1, 0.011); frictionAt(t0 + 0.55, 0.7, -1, 0.011); frictionAt(t0 + 1.1, 0.6, 1, 0.01); }
    if (has('淌')) frictionAt(t0, 1.3, -1, 0.013);
    if (has('猱') || has('大猱') || has('急猱') || has('缓猱') || has('长吟') || has('游吟'))
      frictionAt(t0, 1.4, 0, 0.007); // 阔颤/长颤的轻微揉弦沙沙
  }

  /* ── 指法音色族（琴学物理：向内指肉多→温厚；向外指甲触弦→清亮）── */
  var INWARD = { '抹': 1, '勾': 1, '打': 1, '擘': 1, '泼': 1, '伏': 1 };
  var OUTWARD = { '挑': 1, '剔': 1, '摘': 1, '托': 1, '剌': 1, '历': 1, '滚': 1, '拂': 1, '索铃': 1 };

  /* ── 走音组调度：一次拨弦 + 其后同弦滑动（同一声源改速率）──
   * grp = { head:{t,semi,orn,col,right,ntype,vel}, walks:[…] } */
  var _drift = 0; // 时点微差用慢漂移（近1/f粉噪，心理声学：最悦耳的波动谱）
  function scheduleGroup(grp, t0, useSample) {
    var e = grp.head, semi = e.semi;
    _drift = _drift * 0.88 + (Math.random() - 0.5) * 0.006;
    if (_drift > 0.014) _drift = 0.014; if (_drift < -0.014) _drift = -0.014;
    var when = t0 + e.t + _drift; // 人手微差：漂移式而非机械抖动
    var src = ctx.createBufferSource();
    var rate, off = 0, segDur, out;
    if (useSample) {
      // 选采样弦：优先目标音【上方】最近的空弦（降速播放→采样段被拉长、
      // 余音更足且音色偏暗，贴近按音；加速播放会把段压短导致断续）
      var best = 0, bestD = 1e9;
      for (var i = 0; i < META.openSemis.length; i++) {
        var d = Math.abs(semi - META.openSemis[i]);
        if (META.openSemis[i] < semi - 0.01) d += 1.5; // 需加速的罚分
        if (d < bestD - 1e-6) { bestD = d; best = i; }
      }
      rate = Math.pow(2, (semi - META.openSemis[best]) / 12);
      src.buffer = extBufs[best]; // 续尾长采样：余音 2.8s，音符间自然交叠
      off = 0;
      segDur = extBufs[best].duration;
      out = master;
    } else {
      rate = 1;
      var freq = 65.406 * Math.pow(2, semi / 12);
      src.buffer = ksBuffer(freq);
      segDur = 3.2;
      out = ksBus;
    }
    var chain = techChain(e.orn, useSample ? 1 : 0.85, out);
    // 力度：音量差按 vel^1.5 拉开（强弱约 7dB）+ ±8% 人性化微差
    var vel = (e.vel || 0.8) * (0.92 + Math.random() * 0.16);
    if (vel > 1) vel = 1;
    chain.vol *= Math.pow(vel, 1.5);
    // 轻弹＝音色变暗（真实拨弦物理：力小则高频少）
    if (vel < 0.85) {
      var tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400 + 2600 * vel; // 轻音只微暗，不闷
      tone.Q.value = 0.4;
      tone.connect(chain.input);
      chain.input = tone;
    }
    // ── 指法音色分族 ──
    if (e.ntype === 'fan') {
      // 泛音：纯净如铃——去低频浑浊、略收高频、音量稍轻
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 320; hp.Q.value = 0.5;
      hp.connect(chain.input); chain.input = hp;
      chain.vol *= 0.82;
      grp._fan = true;
    } else if (INWARD[e.right]) {
      // 向内（抹勾打擘）：指肉温厚——收高频、低频稍满
      var wf = ctx.createBiquadFilter();
      wf.type = 'lowpass'; wf.frequency.value = 3300; wf.Q.value = 0.4;
      wf.connect(chain.input); chain.input = wf;
      chain.vol *= 1.05;
    } else if (OUTWARD[e.right]) {
      // 向外（挑剔摘托）：指甲清亮——2.8kHz 亮度峰
      var bf = ctx.createBiquadFilter();
      bf.type = 'peaking'; bf.frequency.value = 2800; bf.Q.value = 0.9; bf.gain.value = 4;
      bf.connect(chain.input); chain.input = bf;
    }
    // 按音比散音略暗（左手指按住琴面，弦振略受抑）
    if (e.ntype === 'an' && !INWARD[e.right]) {
      var af = ctx.createBiquadFilter();
      af.type = 'lowpass'; af.frequency.value = 4400; af.Q.value = 0.3;
      af.connect(chain.input); chain.input = af;
    }
    var p = src.playbackRate;
    applyOrn(p, rate, when, e.orn);
    frictionForOrns(when, e.orn); // 走音配指甲擦弦+琴面摩擦声

    // 走音链：同一声源上渐变速率（实—虚—实：滑动中音量微凹 + 擦弦声）
    var g = ctx.createGain();
    if (useSample) g.gain.setValueAtTime(chain.vol, when);
    else { g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(chain.vol, when + 0.008); }
    var curRate = rate, maxRate = rate, lastWhen = when, lvl = chain.vol;
    grp.walks.forEach(function (w) {
      var wWhen = t0 + w.t;
      var nr = rate * Math.pow(2, (w.semi - semi) / 12);
      var slide = 0.22;   // 滑得从容些，耳朵抓得住
      p.setValueAtTime(curRate, Math.max(when, wWhen - 0.02));
      p.linearRampToValueAtTime(nr, wWhen + slide);
      // 滑动补偿：走音发生时余音已衰减，指力压弦提振——增益抬回可闻水平，
      // 滑动中保留轻微"虚"感，到位后清晰
      var boosted = Math.min(chain.vol * 0.95, lvl * 1.55);
      g.gain.setValueAtTime(lvl * 0.9, Math.max(when, wWhen - 0.02));
      g.gain.linearRampToValueAtTime(boosted * 0.85, wWhen + slide * 0.5);
      g.gain.linearRampToValueAtTime(boosted, wWhen + slide);
      lvl = boosted;
      frictionAt(wWhen - 0.02, slide + 0.24, nr > curRate ? 1 : -1, 0.022);
      curRate = nr; if (nr > maxRate) maxRate = nr;
      lastWhen = wWhen;
    });

    // 时长与收尾：按【拍值】满音量保持到本音节奏结束，
    // 之后进入 ~3 秒的自然指数衰减（长短音由保持时间区分，节奏才立得住）
    var lastDur = grp.walks.length ? (grp.walks[grp.walks.length - 1].dur || 1.0) : (e.dur || 1.0);
    var hold = (lastWhen - when) + lastDur;          // 满音量保持 = 到拍值末
    var avail = segDur / maxRate;
    var ringEnd = Math.min(hold + (grp._fan ? 1.6 : 3.0), avail, chain.maxDur); // 泛音余音较短
    // 同弦再拨会止住前音（真琴物理）：短音真正变短
    if (grp.cutT !== undefined) {
      var cutWall = grp.cutT - (when - 0) - 0.02;
      if (cutWall > 0.08 && cutWall < ringEnd) {
        ringEnd = cutWall;
        g.gain.setTargetAtTime(0.0001, when + ringEnd - 0.07, 0.05);
      } else {
        g.gain.setTargetAtTime(0.0001, when + Math.min(hold, Math.max(0.15, ringEnd - 0.8)), 0.7);
      }
    } else {
      g.gain.setTargetAtTime(0.0001, when + Math.min(hold, Math.max(0.15, ringEnd - 0.8)), 0.7);
    }

    src.connect(g); g.connect(chain.input);
    src.start(when);
    src.stop(when + ringEnd + 0.5);
    srcs.push(src);
  }

  /* ── 引擎②：Karplus-Strong 缓冲 ── */
  function ksBuffer(freq) {
    var key = freq.toFixed(2);
    if (bufCache[key]) return bufCache[key];
    var sr = ctx.sampleRate, dur = 3.2, N = Math.round(sr * dur);
    var buf = ctx.createBuffer(1, N, sr), d = buf.getChannelData(0);
    var period = Math.max(2, Math.round(sr / freq));
    var ring = new Float32Array(period), i;
    for (i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    for (var r = 0; r < 2; r++)
      for (i = 0; i < period; i++) ring[i] = 0.5 * (ring[i] + ring[(i + 1) % period]);
    var decay = 0.9955 + 0.003 * Math.min(1, 80 / freq);
    if (decay > 0.9988) decay = 0.9988;
    var idx = 0;
    for (i = 0; i < N; i++) {
      var cur = ring[idx];
      d[i] = cur;
      ring[idx] = decay * 0.5 * (cur + ring[(idx + 1) % period]);
      idx = (idx + 1) % period;
    }
    bufCache[key] = buf;
    return buf;
  }

  /* events = [{t,semi,col,orn:[],glideFrom?}]；glideFrom≠null 表示走音（不另弹） */
  function playSeq(events, onCol) {
    stop();
    ensure();
    ensureSamples().then(function (buf) {
      var t0 = ctx.currentTime + 0.08;
      // 分组：拨弦头 + 其后连续走音
      var groups = [];
      events.forEach(function (e) {
        if (e.glideFrom !== null && e.glideFrom !== undefined && groups.length) {
          groups[groups.length - 1].walks.push(e);
        } else {
          groups.push({ head: e, walks: [] });
        }
        if (onCol) timers.push(setTimeout(function () { onCol(e.col); }, (e.t + 0.08) * 1000));
      });
      // 同弦止音标记：下一组在同一根弦上再拨 → 本组余音在彼时截止
      for (var gi = 0; gi < groups.length - 1; gi++) {
        var g1 = groups[gi], g2 = groups[gi + 1];
        var lastStr = g1.walks.length ? g1.walks[g1.walks.length - 1].str : g1.head.str;
        if (lastStr !== undefined && g2.head.str === lastStr) {
          g1.cutT = t0 + g2.head.t; // 绝对时间
        }
      }
      groups.forEach(function (grp) {
        scheduleGroup(grp, t0, !!buf);
        // 撮 = 双弦齐鸣（大撮八度）：补一个低八度音，指法用勾（向内温厚）
        var h = grp.head;
        if (h.right === '撮' && h.glideFrom == null) {
          var s2 = h.semi - 12 >= 0 ? h.semi - 12 : h.semi + 12;
          if (s2 >= 0 && s2 <= 38) {
            scheduleGroup({
              head: { t: h.t + 0.012, semi: s2, orn: [], col: null, right: '勾', ntype: 'san', vel: (h.vel || 0.8) * 0.8, dur: h.dur },
              walks: []
            }, t0, !!buf);
          }
        }
      });
      if (onCol && events.length) {
        var last = events[events.length - 1];
        timers.push(setTimeout(function () { onCol(null); }, (last.t + 2.5) * 1000));
      }
    });
  }

  function stop() {
    timers.forEach(clearTimeout); timers = [];
    srcs.forEach(function (s) { try { s.stop(); } catch (e) { /* 已停 */ } });
    srcs = [];
  }

  global.QinAudio = {
    playSeq: playSeq, stop: stop,
    mode: function () { return sampleBuf ? 'sample' : (sampleTried ? 'ks' : 'pending'); }
  };
})(window);
