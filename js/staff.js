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

  // 半音 pc → [字母序号 C0..B6, 变音记号]；F 大调（调号 bB，Bb 不再标记号）
  var SPELL = [
    [0, ''], [0, '#'], [1, ''], [2, 'b'], [2, ''], [3, ''],
    [3, '#'], [4, ''], [4, '#'], [5, ''], [6, 'inkey'], [6, 'n']
  ];
  var ACC_GLYPH = { '#': '♯', 'b': '♭', 'n': '♮' };

  function yOf(idx) { return BOT - (idx - G2_IDX) * HALF; }

  // 半音数(相对C2) → {y, acc}
  function pos(semi) {
    var midi = 36 + Math.round(semi);
    var oct = Math.floor(midi / 12) - 1;
    var sp = SPELL[((midi % 12) + 12) % 12];
    var idx = oct * 7 + sp[0];
    return { y: yOf(idx), idx: idx, acc: (sp[1] === 'inkey' ? '' : sp[1]) };
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

  function head(x, y, hollow) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="4.6" ry="3.4" transform="rotate(-18 ' + x + ' ' + y + ')"' +
      (hollow ? ' class="st-head-hollow"' : ' class="st-head"') + '/>';
  }

  function svgOpen(w, cls) {
    return '<svg class="staffcell ' + (cls || '') + '" viewBox="0 ' + VB_Y + ' ' + w + ' ' + VB_H +
      '" width="' + w + '" height="' + VB_H + '">';
  }

  /* 音符格。notes=[{semi, dotted}], opts={beam:bool, width} */
  function cell(notes, opts) {
    opts = opts || {};
    var n = notes.length;
    var w = opts.width || Math.max(34, n * 26);
    var s = svgOpen(w) + lines(w);
    var stemTops = [], xs = [];
    notes.forEach(function (nt, i) {
      var x = w / (n + 1) * (i + 1);
      var p = pos(nt.semi);
      xs.push(x);
      s += ledgers(p.idx, x);
      if (p.acc) s += '<text x="' + (x - 10) + '" y="' + (p.y + 3) + '" class="st-acc">' + ACC_GLYPH[p.acc] + '</text>';
      s += head(x, p.y, !!nt.half);
      if (nt.dotted) s += '<circle cx="' + (x + 8) + '" cy="' + (p.y - 2) + '" r="1.7" class="st-dot"/>';
      // 符桿：组内一律向上（便于连符杠）；单音低于中线向上，否则向下
      var up = opts.beam ? true : (p.idx <= G2_IDX + 4);
      if (up) {
        var yt = p.y - 26;
        stemTops.push({ x: x + 4.2, y: yt });
        s += '<line x1="' + (x + 4.2) + '" y1="' + p.y + '" x2="' + (x + 4.2) + '" y2="' + yt + '" class="st-stem"/>';
        if (opts.eighth && n === 1) { // 单八分音符旗
          s += '<path d="M' + (x + 4.2) + ' ' + yt + ' C' + (x + 12) + ' ' + (yt + 4) + ' ' + (x + 11) + ' ' + (yt + 12) + ' ' + (x + 7) + ' ' + (yt + 17) + '" class="st-flag"/>';
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
    }
    return s + '</svg>';
  }

  /* 谱号+调号格（乐谱开头）：低音谱号 𝄢 + F大调 bB */
  function clefCell() {
    var w = 46;
    return svgOpen(w) + lines(w) +
      '<text x="14" y="52" class="st-clef">𝄢</text>' +
      '<text x="34" y="' + (yOf(G2_IDX + 2) + 3) + '" class="st-acc">♭</text>' +
      '</svg>';
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

  /* 空格（延音/休止占位）：只画谱线；rest=true 加四分休止符 */
  function padCell(rest) {
    var w = 26;
    return svgOpen(w) + lines(w) +
      (rest ? '<text x="13" y="50" class="st-rest">𝄽</text>' : '') + '</svg>';
  }

  var API = { cell: cell, clefCell: clefCell, timeCell: timeCell, barCell: barCell, padCell: padCell, pos: pos };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.QinStaff = API;
})(typeof window !== 'undefined' ? window : this);
