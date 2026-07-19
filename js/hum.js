/* 琴谱通 QinPu · © 2026 iamamilycc · 授权 CC BY-NC-SA 4.0（须署名／非商业／衍生同授权）· https://github.com/iamamilycc/qinpu */
/* ============================================================
 * 琴谱通 hum.js —— 哼唱转谱（纯前端，无需 API/联网）
 *
 * 原理：麦克风 → YIN 基频检测（逐帧）→ 清音筛选 + 中值滤波 →
 *       切分成音符 → 音高量化到平均律 → 时长量化 → 简谱文本。
 * 对外：QinHum.start(cb) 开始录音；QinHum.stop() 停止并回调简谱串；
 *       QinHum.quantize(frames, frameDur) 纯逻辑（可单测，不碰麦克风）。
 * ============================================================ */
(function (global) {
  'use strict';

  var C2 = 65.406; // 一弦散音 C2，semitone 0 基准（与 pitch.js 一致）

  // ── YIN 基频检测：返回 Hz，或 -1（无稳定基频）──
  function yin(buf, sampleRate, threshold) {
    var thr = threshold || 0.15;
    var half = buf.length >> 1;
    var d = new Float32Array(half);
    for (var tau = 0; tau < half; tau++) {
      var sum = 0;
      for (var i = 0; i < half; i++) { var dl = buf[i] - buf[i + tau]; sum += dl * dl; }
      d[tau] = sum;
    }
    var cmnd = new Float32Array(half); cmnd[0] = 1; var run = 0;
    for (var t2 = 1; t2 < half; t2++) { run += d[t2]; cmnd[t2] = run ? d[t2] * t2 / run : 1; }
    var te = -1;
    for (var t3 = 2; t3 < half; t3++) {
      if (cmnd[t3] < thr) { while (t3 + 1 < half && cmnd[t3 + 1] < cmnd[t3]) t3++; te = t3; break; }
    }
    if (te === -1) return -1;
    var x0 = te > 0 ? te - 1 : te, x2 = te + 1 < half ? te + 1 : te, bt;
    if (x0 === te) bt = cmnd[te] <= cmnd[x2] ? te : x2;
    else if (x2 === te) bt = cmnd[te] <= cmnd[x0] ? te : x0;
    else {
      var s0 = cmnd[x0], s1 = cmnd[te], s2 = cmnd[x2], den = 2 * (2 * s1 - s2 - s0);
      bt = den ? te + (s2 - s0) / den : te;
    }
    return sampleRate / bt;
  }

  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  var log2 = function (x) { return Math.log(x) / Math.LN2; };

  /* frames = [{f:Hz或-1, rms:能量}]；frameDur = 每帧秒数。返回简谱字符串。 */
  function quantize(frames, frameDur) {
    // 1. 频率 → semitone（相对 C2），无音标 null
    var semRaw = frames.map(function (fr) {
      if (fr.f <= 0 || fr.rms < 0.012) return null;
      var s = 12 * log2(fr.f / C2);
      return (s > 5 && s < 48) ? s : null; // 人声合理区
    });
    // 2. 中值滤波（窗口5）压掉八度野点
    var sem = semRaw.map(function (_, i) {
      var w = [];
      for (var k = -2; k <= 2; k++) { var v = semRaw[i + k]; if (v != null) w.push(v); }
      return w.length ? median(w) : null;
    });
    // 3. 切分成音符：连续有音且半音差<0.7 归一段；null 或大跳分隔
    var notes = [], cur = null;
    for (var i = 0; i < sem.length; i++) {
      var v = sem[i];
      if (v == null) { if (cur) { notes.push(cur); cur = null; } continue; }
      if (cur && Math.abs(v - cur.last) < 0.7) { cur.vals.push(v); cur.last = v; cur.frames++; }
      else { if (cur) notes.push(cur); cur = { vals: [v], last: v, frames: 1, gapBefore: 0 }; }
    }
    if (cur) notes.push(cur);
    // 记录音符间静音帧数（作小节/停顿依据）——重新扫一遍标 gap
    (function () {
      var ni = 0, gap = 0, inNote = false;
      for (var j = 0; j < sem.length; j++) {
        if (sem[j] == null) { gap++; inNote = false; }
        else { if (!inNote) { if (notes[ni]) notes[ni].gapBefore = gap; ni++; gap = 0; inNote = true; } }
      }
    })();
    // 4. 太短的音符（<3帧≈换气杂音）丢弃
    notes = notes.filter(function (n) { return n.frames >= 3; });
    if (notes.length < 2) return '';
    // 5. 音高：段中值 → 最近半音
    notes.forEach(function (n) { n.semi = Math.round(median(n.vals)); });
    // 6. 归中八度：整体平移使中位音落在中音区（少一堆撇号）
    var P = global.QinPitch, off = (P && P.tuning) ? P.tuning().key : 5;
    var medOct = Math.floor((median(notes.map(function (n) { return n.semi; })) - off) / 12);
    if (medOct) notes.forEach(function (n) { n.semi -= medOct * 12; });
    // 7. 时长量化：以音符时长中位数为一拍
    var unit = median(notes.map(function (n) { return n.frames; })) || 1;
    var toks = [];
    notes.forEach(function (n, idx) {
      if (idx > 0 && n.gapBefore > unit * 1.3) toks.push('|'); // 长停顿→小节线
      var jp = P.semitoneToJianpu(n.semi).text; // 相对 C2 semitone → 简谱（内部按 1=调 换算）
      var r = n.frames / unit;
      if (r < 0.65) toks.push(jp + '_');
      else if (r < 1.6) toks.push(jp);
      else if (r < 2.8) toks.push(jp + ' -');
      else toks.push(jp + ' - -');
    });
    return toks.join(' ').replace(/\s+/g, ' ').trim();
  }

  // ── 实时录音 ──
  var actx = null, stream = null, analyser = null, timer = null, frames = [], running = false;
  var FRAME = 2048;

  function start(onLevel) {
    if (running) return Promise.reject('已在录音');
    frames = []; running = true;
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (st) {
        stream = st;
        actx = new (global.AudioContext || global.webkitAudioContext)();
        var src = actx.createMediaStreamSource(st);
        analyser = actx.createAnalyser();
        analyser.fftSize = FRAME;
        src.connect(analyser);
        var buf = new Float32Array(FRAME);
        var frameDur = FRAME / actx.sampleRate / 2; // 取样间隔约等于分析半窗
        start._frameDur = actx.sampleRate ? (0.046) : 0.046; // ~46ms 帧步
        timer = setInterval(function () {
          analyser.getFloatTimeDomainData(buf);
          var rms = 0; for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
          rms = Math.sqrt(rms / buf.length);
          var f = rms > 0.008 ? yin(buf, actx.sampleRate, 0.15) : -1;
          frames.push({ f: f, rms: rms });
          if (onLevel) onLevel(rms, f);
        }, 46);
      });
  }

  function stop() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (actx) { try { actx.close(); } catch (e) {} actx = null; }
    return quantize(frames, 0.046);
  }

  global.QinHum = { start: start, stop: stop, quantize: quantize, yin: yin, isRecording: function () { return running; } };
})(typeof window !== 'undefined' ? window : this);
