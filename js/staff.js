/* ============================================================
 * 琴谱通 staff.js —— 简化五线谱渲染（低音谱表，F 大调，自绘 SVG）
 *
 * 零依赖：谱线/谱号/调号/符头/符桿/符杠/附点/加线/变音记号全部自绘。
 * 音高输入 = 相对一弦散音 C 的半音数（正调一弦 = C2，MIDI 36）。
 * 每个"格子"一段 SVG，谱线画满整格宽度，格子相邻即线条连续。
 *
 * 几何：底线 G2，y=64；线距 8（半音阶级距 4）；viewBox y 从 -16 起。
 * ============================================================ */
(function (global) {
  'use strict';

  var BOT = 64, HALF = 4;           // 底线 y、级距一半
  var VB_Y = -16, VB_H = 100;       // viewBox 纵向范围
  var G2_IDX = 2 * 7 + 4;           // 底线 G2 的音级序号 (oct*7+letter)

  // ── 调号系统（升降号都支持，从主音 pc 按五度圈推导）──
  // 字母序号：C=0 D=1 E=2 F=3 G=4 A=5 B=6
  var NAT_PC = [0, 2, 4, 5, 7, 9, 11];                 // 字母 → 自然音 pc
  var ACC_GLYPH = { '#': '♯', 'b': '♭', 'n': '♮' };
  // 主音 pc → { letter:主音字母, sig:[[字母,±1],…] 调号 }（古琴用 C F ♭B ♭E G D，通用亦备）
  var KEYSIG = {
    0:  { sig: [] },                                                   // C
    7:  { sig: [[3, 1]] },                                             // G:  F♯
    2:  { sig: [[3, 1], [0, 1]] },                                     // D:  F♯ C♯
    9:  { sig: [[3, 1], [0, 1], [4, 1]] },                             // A
    4:  { sig: [[3, 1], [0, 1], [4, 1], [1, 1]] },                     // E
    11: { sig: [[3, 1], [0, 1], [4, 1], [1, 1], [5, 1]] },             // B
    6:  { sig: [[3, 1], [0, 1], [4, 1], [1, 1], [5, 1], [2, 1]] },     // F♯
    5:  { sig: [[6, -1]] },                                            // F:  ♭B
    10: { sig: [[6, -1], [2, -1]] },                                   // ♭B: ♭B ♭E
    3:  { sig: [[6, -1], [2, -1], [5, -1]] },                          // ♭E: ♭B ♭E ♭A
    8:  { sig: [[6, -1], [2, -1], [5, -1], [1, -1]] },                 // ♭A
    1:  { sig: [[6, -1], [2, -1], [5, -1], [1, -1], [4, -1]] }         // ♭D
  };
  var SIG = [], LETTER_ALT = {}, SHARP_KEY = false;

  function setKey(tonicPc) {
    if (Array.isArray(tonicPc)) tonicPc = tonicPc.length ? 5 : 0; // 向后兼容旧的 flats 数组
    tonicPc = ((Math.round(tonicPc) % 12) + 12) % 12;
    SIG = (KEYSIG[tonicPc] || KEYSIG[0]).sig;
    LETTER_ALT = {};
    SIG.forEach(function (e) { LETTER_ALT[e[0]] = e[1]; });
    SHARP_KEY = SIG.length > 0 && SIG[0][1] > 0;
  }
  setKey(5); // 默认正调 F

  // pc → [字母序号, 变音记号]：调号内不标记，非调内音按升/降调习惯拼写
  function spellPc(pc) {
    pc = ((pc % 12) + 12) % 12;
    // 1) 调内音（字母的调号变化后正好等于 pc）→ 不标记
    for (var L = 0; L < 7; L++) {
      if (((NAT_PC[L] + (LETTER_ALT[L] || 0)) % 12 + 12) % 12 === pc) return [L, ''];
    }
    // 2) 某自然字母被调号改动、此处却弹本位 → 还原记号
    for (var L2 = 0; L2 < 7; L2++) {
      if (NAT_PC[L2] === pc && LETTER_ALT[L2]) return [L2, 'n'];
    }
    // 3) 变化音：升调用升号（下方字母 +♯），降调用降号（上方字母 +♭）
    if (SHARP_KEY) {
      for (var L3 = 0; L3 < 7; L3++) if (NAT_PC[L3] === (pc + 11) % 12) return [L3, '#'];
    } else {
      for (var L4 = 0; L4 < 7; L4++) if (NAT_PC[L4] === (pc + 1) % 12) return [L4, 'b'];
    }
    return [0, '']; // 理论不达
  }

  function yOf(idx) { return BOT - (idx - G2_IDX) * HALF; }

  // 半音数(相对C2) → {y, acc}
  function pos(semi) {
    var midi = 36 + Math.round(semi);
    var oct = Math.floor(midi / 12) - 1;
    var sp = spellPc(((midi % 12) + 12) % 12);
    var idx = oct * 7 + sp[0];
    return { y: yOf(idx), idx: idx, acc: sp[1] };
  }

  function lines(w) {
    var s = '';
    for (var i = 0; i < 5; i++) {
      var y = BOT - i * 8;
      s += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" class="st-line"/>';
    }
    return s;
  }

  function ledgers(idx, x) {
    var s = '';
    var k;
    // 下加线：从第一条下加线(E2)画到音符所在(或紧邻)的线
    for (k = G2_IDX - 2; k >= idx + (idx % 2 ? 1 : 0); k -= 2) s += ledgerAt(k, x);
    // 上加线：从第一条上加线(C4)画到音符
    for (k = G2_IDX + 10; k <= idx - (idx % 2 ? 1 : 0); k += 2) s += ledgerAt(k, x);
    return s;
  }
  function ledgerAt(idx, x) {
    return '<line x1="' + (x - 8) + '" y1="' + yOf(idx) + '" x2="' + (x + 8) + '" y2="' + yOf(idx) + '" class="st-line"/>';
  }

  function head(x, y, hollow, wide) {
    var rx = wide ? 5.6 : 4.6;                 // 全音符符头略宽
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="3.4" transform="rotate(-18 ' + x + ' ' + y + ')"' +
      (hollow ? ' class="st-head-hollow"' : ' class="st-head"') + '/>';
  }

  function svgOpen(w, cls) {
    return '<svg class="staffcell ' + (cls || '') + '" viewBox="0 ' + VB_Y + ' ' + w + ' ' + VB_H +
      '" width="' + w + '" height="' + VB_H + '">';
  }

  /* 音符格。notes=[{semi, dotted}], opts={beam, width, hold} hold=持续拍数(≥2空心二分,≥4全音符) */
  function cell(notes, opts) {
    opts = opts || {};
    var n = notes.length;
    var hold = opts.hold || 1;
    var hollow = n === 1 && hold >= 2;      // 二分音符及以上：空心符头
    var whole = n === 1 && hold >= 4;       // 全音符：空心无桿
    var holdDot = n === 1 && (hold === 3 || hold === 6); // 附点二分/附点全音符
    var w = opts.width || Math.max(34, n * 26);
    var s = svgOpen(w) + lines(w);
    var stemTops = [], xs = [];
    notes.forEach(function (nt, i) {
      var x = w / (n + 1) * (i + 1);
      var p = pos(nt.semi);
      xs.push(x);
      s += ledgers(p.idx, x);
      if (p.acc) s += '<text x="' + (x - 10) + '" y="' + (p.y + 3) + '" class="st-acc">' + ACC_GLYPH[p.acc] + '</text>';
      s += head(x, p.y, !!nt.half || hollow, whole);
      if (nt.dotted || holdDot) s += '<circle cx="' + (x + (whole ? 10 : 8)) + '" cy="' + (p.y - 2) + '" r="1.7" class="st-dot"/>';
      if (whole) return; // 全音符无符桿
      // 符桿：组内一律向上（便于连符杠）；单音低于中线向上，否则向下
      var up = opts.beam ? true : (p.idx <= G2_IDX + 4);
      if (up) {
        var yt = p.y - 26;
        stemTops.push({ x: x + 4.2, y: yt });
        s += '<line x1="' + (x + 4.2) + '" y1="' + p.y + '" x2="' + (x + 4.2) + '" y2="' + yt + '" class="st-stem"/>';
        if ((opts.eighth || opts.six) && n === 1) { // 单八分/十六分音符旗
          s += '<path d="M' + (x + 4.2) + ' ' + yt + ' C' + (x + 12) + ' ' + (yt + 4) + ' ' + (x + 11) + ' ' + (yt + 12) + ' ' + (x + 7) + ' ' + (yt + 17) + '" class="st-flag"/>';
          if (opts.six) s += '<path d="M' + (x + 4.2) + ' ' + (yt + 7) + ' C' + (x + 12) + ' ' + (yt + 11) + ' ' + (x + 11) + ' ' + (yt + 19) + ' ' + (x + 7) + ' ' + (yt + 24) + '" class="st-flag"/>';
        }
      } else {
        var yb = p.y + 26;
        s += '<line x1="' + (x - 4.2) + '" y1="' + p.y + '" x2="' + (x - 4.2) + '" y2="' + yb + '" class="st-stem"/>';
        if (opts.eighth && n === 1) {
          s += '<path d="M' + (x - 4.2) + ' ' + yb + ' C' + (x + 3.5) + ' ' + (yb - 4) + ' ' + (x + 2.5) + ' ' + (yb - 12) + ' ' + (x - 1.5) + ' ' + (yb - 17) + '" class="st-flag"/>';
        }
      }
    });
    if (opts.beam && stemTops.length > 1) {
      var by = Math.min.apply(null, stemTops.map(function (t) { return t.y; }));
      // 拉平各桿到符杠高度
      stemTops.forEach(function (t) {
        if (t.y > by) s += '<line x1="' + t.x + '" y1="' + t.y + '" x2="' + t.x + '" y2="' + by + '" class="st-stem"/>';
      });
      s += '<line x1="' + stemTops[0].x + '" y1="' + by + '" x2="' + stemTops[stemTops.length - 1].x + '" y2="' + by + '" class="st-beam"/>';
      if (opts.six) s += '<line x1="' + stemTops[0].x + '" y1="' + (by + 6) + '" x2="' + stemTops[stemTops.length - 1].x + '" y2="' + (by + 6) + '" class="st-beam"/>';
    }
    // 三连音：符杠/符头上方标 3
    if (opts.triplet) {
      var midX = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : w / 2;
      s += '<text x="' + midX + '" y="' + (VB_Y + 12) + '" class="st-trip">3</text>';
    }
    return s + '</svg>';
  }

  /* 谱号+调号格（乐谱开头）：低音谱号 𝄢 + 当前调的升/降号 */
  // 低音谱表上各变音记号的音级序号（idx=oct*7+letter）：
  var SHARP_POS = { 3: 24, 0: 21, 4: 25, 1: 22, 5: 26, 2: 23 }; // F♯ C♯ G♯ D♯ A♯ E♯
  var FLAT_POS_L = { 6: 20, 2: 23, 5: 19, 1: 22, 4: 25, 0: 21 }; // ♭B ♭E ♭A ♭D ♭G ♭C
  function clefCell() {
    var w = 36 + SIG.length * 9 + (SIG.length ? 2 : 0);
    var s = svgOpen(w) + lines(w) + '<text x="14" y="52" class="st-clef">𝄢</text>';
    SIG.forEach(function (e, i) {
      var letter = e[0], sharp = e[1] > 0;
      var idx = sharp ? SHARP_POS[letter] : FLAT_POS_L[letter];
      if (idx !== undefined) s += '<text x="' + (33 + i * 9) + '" y="' + (yOf(idx) + 3) + '" class="st-acc">' + (sharp ? '♯' : '♭') + '</text>';
    });
    return s + '</svg>';
  }

  /* 拍号格 */
  function timeCell(num, den) {
    var w = 26;
    return svgOpen(w) + lines(w) +
      '<text x="13" y="45" class="st-time">' + num + '</text>' +
      '<text x="13" y="62" class="st-time">' + den + '</text></svg>';
  }

  /* 小节线格；rep='L'(|:) / 'R'(:|) 画反复小圆点 */
  function barCell(fin, rep) {
    var w = (fin || rep) ? 14 : 6;
    var s = svgOpen(w) + lines(w) +
      '<line x1="3" y1="' + (BOT - 32) + '" x2="3" y2="' + BOT + '" class="st-bar"/>';
    if (fin || rep) s += '<rect x="6" y="' + (BOT - 32) + '" width="3.5" height="32" class="st-barfin"/>';
    if (rep) {
      var dx = rep === 'L' ? 12 : -3;
      s += '<circle cx="' + (3 + dx) + '" cy="' + (BOT - 20) + '" r="1.8" class="st-barfin"/>' +
           '<circle cx="' + (3 + dx) + '" cy="' + (BOT - 12) + '" r="1.8" class="st-barfin"/>';
    }
    return s + '</svg>';
  }

  /* 空格（延音/休止占位）：只画谱线；rest=true 加休止符（按 unit 区分时值）*/
  // 时值 → 休止符字形：四分𝄽 八分𝄾 十六分𝄿（半/全较少见，多拍休止仍用四分+延音格）
  function restGlyph(unit) {
    if (unit === 0.25) return '𝄿';
    if (unit === 0.5) return '𝄾';
    return '𝄽';
  }
  function padCell(rest, unit) {
    var w = 26;
    return svgOpen(w) + lines(w) +
      (rest ? '<text x="13" y="50" class="st-rest">' + restGlyph(unit) + '</text>' : '') + '</svg>';
  }

  var API = { cell: cell, clefCell: clefCell, timeCell: timeCell, barCell: barCell, padCell: padCell, pos: pos, setKey: setKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.QinStaff = API;
})(typeof window !== 'undefined' ? window : this);
