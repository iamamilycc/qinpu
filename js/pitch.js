/* ============================================================
 * 琴谱通 pitch.js —— 音律引擎（纯逻辑，无 DOM，可单元测试）
 *
 * 定弦：正调（1=F），一至七弦 = C D F G A c d
 *       简谱对应：低5 低6 1 2 3 5 6
 * 音高表示：以一弦散音 C 为 0 的半音数（semitone）
 *
 * 徽位模型：第 n 徽在弦长（自岳山起）的分数位置 HUI_FRAC[n]
 *   按音音高 = 散音 + 12*log2(1/位置分数)
 *   泛音音高 = 散音 + 12*log2(谐波次数)，谐波次数=位置分数约分后的分母
 *   徽分：相邻两徽之间十等分（业界通行记法，如"七六"=七徽六分）
 * ============================================================ */
(function (global) {
  'use strict';

  // ── 调弦法（各弦散音相对正调一弦 C 的半音数；key=简谱"1"的音高）──
  var TUNINGS = {
    zheng:      { name: '正调 1=F',           open: [0, 2, 5, 7, 9, 12, 14],   key: 5,  flats: [10] },
    ruibin:     { name: '蕤宾调·紧五 1=♭B',   open: [0, 2, 5, 7, 10, 12, 14],  key: 10, flats: [10, 3] },
    manjiao:    { name: '慢角调·慢三 1=C',    open: [0, 2, 4, 7, 9, 12, 14],   key: 0,  flats: [] },
    manshang:   { name: '慢商调·慢二 1=F',    open: [0, 0, 5, 7, 9, 12, 14],   key: 5,  flats: [10] },
    huangzhong: { name: '黄钟调·慢一紧五 1=♭B', open: [-2, 2, 5, 7, 10, 12, 14], key: 10, flats: [10, 3] }
  };
  var CUR_TUNING = 'zheng';

  // 各弦散音（随调弦法变化），下标 0..6 = 一弦..七弦
  var OPEN = TUNINGS.zheng.open.slice();
  var F_OFFSET = 5; // 简谱"1"相对一弦 C 的半音数（随调弦法变化）

  function setTuning(id) {
    var t = TUNINGS[id];
    if (!t) return false;
    CUR_TUNING = id;
    for (var i = 0; i < 7; i++) OPEN[i] = t.open[i];
    F_OFFSET = t.key;
    return true;
  }
  function tuning() { return TUNINGS[CUR_TUNING]; }

  // 徽位分数（自岳山），下标 1..13
  var HUI_FRAC = [null,
    1 / 8, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 2 / 5, 1 / 2,
    3 / 5, 2 / 3, 3 / 4, 4 / 5, 5 / 6, 7 / 8];

  // 泛音谐波次数（= 徽位分数约分后的分母）
  var FAN_MULT = { 1: 8, 2: 6, 3: 5, 4: 4, 5: 3, 6: 5, 7: 2, 8: 5, 9: 3, 10: 4, 11: 5, 12: 6, 13: 8 };

  var log2 = function (x) { return Math.log(x) / Math.LN2; };

  // 徽+分 → 位置分数（徽分=相邻徽间十等分；13徽再往外按末段斜率外推=徽外）
  function huiToFrac(hui, fen) {
    fen = fen || 0;
    if (hui < 1 || hui > 13) return null;
    var f0 = HUI_FRAC[hui];
    // 13徽再往外（徽外）按末段斜率外推
    var f1 = (hui < 13) ? HUI_FRAC[hui + 1] : HUI_FRAC[13] + (HUI_FRAC[13] - HUI_FRAC[12]);
    return f0 + (f1 - f0) * fen / 10;
  }

  // ── 三种音色 → 半音数 ──
  function sanSemitone(s) { return OPEN[s - 1]; }

  function anSemitone(s, hui, fen) {
    var p = huiToFrac(hui, fen);
    if (!p || p <= 0 || p >= 1) return null;
    return OPEN[s - 1] + 12 * log2(1 / p);
  }

  function fanSemitone(s, hui) {
    var m = FAN_MULT[hui];
    if (!m) return null;
    return OPEN[s - 1] + 12 * log2(m);
  }

  // ── 半音数 ↔ 简谱（1=F）──
  var PC_NAME = ['1', '#1', '2', '#2', '3', '4', '#4', '5', '#5', '6', '#6', '7'];
  var DEG_SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };

  // 返回 {deg:'1'|'#4'…, oct:整数(0=中音), text:'5,'/"1'"} ；半音数先四舍五入到平均律
  function semitoneToJianpu(t) {
    var r = Math.round(t) - F_OFFSET;
    var oct = Math.floor(r / 12);
    var pc = ((r % 12) + 12) % 12;
    var deg = PC_NAME[pc];
    var mark = oct > 0 ? new Array(oct + 1).join("'") : new Array(-oct + 1).join(',');
    return { deg: deg, oct: oct, cents: Math.round((t - Math.round(t)) * 100), text: deg + mark };
  }

  function jianpuToSemitone(deg, sharp, oct) {
    return F_OFFSET + DEG_SEMI[deg] + (sharp ? 1 : 0) + 12 * oct;
  }

  // ── 反向：给定弦与目标半音数 → 徽位（按音）──
  // 返回 {hui, fen, waiwei:bool} 或 null（不可按/太高太低）
  function findPosition(s, target) {
    var d = target - OPEN[s - 1];
    if (d <= 0) return null;               // 按音必高于散音
    var p = Math.pow(2, -d / 12);
    if (p > 0.95) return null;             // 比徽外还外，不可用
    if (p > HUI_FRAC[13]) {                // 13徽以外 = 徽外
      var slope = HUI_FRAC[13] - HUI_FRAC[12];
      var fenW = Math.round((p - HUI_FRAC[13]) / slope * 10);
      return { hui: 13, fen: fenW, waiwei: true };
    }
    if (p < HUI_FRAC[1]) return null;      // 高过一徽，不实用
    for (var k = 1; k <= 12; k++) {
      if (p >= HUI_FRAC[k] && p <= HUI_FRAC[k + 1]) {
        var fen = Math.round((p - HUI_FRAC[k]) / (HUI_FRAC[k + 1] - HUI_FRAC[k]) * 10);
        if (fen === 10) return { hui: k + 1, fen: 0, waiwei: false };
        return { hui: k, fen: fen, waiwei: false };
      }
    }
    return null;
  }

  // ── 自动编配：简谱旋律 → [{候选弹法列表}] ──
  // 哲学：不取"最省事"而取"最悠扬、合人手"——
  //   乐句开头散音起骨架；句中优先按音（左手能绰注吟猱走，韵在其中）；
  //   同弦连贯、把位就近流动（人手不跳崖）；常用把位；整徽优先。
  // ctx = { mStart: 乐句/小节开头, prevHui: 上一按音的徽位 }
  function candidatesFor(target, prevString, ctx) {
    ctx = ctx || {};
    var atStart = ctx.mStart !== undefined ? ctx.mStart : (prevString === null || prevString === undefined);
    var list = [];
    for (var s = 1; s <= 7; s++) {
      var d = target - OPEN[s - 1];
      if (d === 0) {
        // 散音：句头顺手；句中偏贵（无韵），让位给可走音的按音
        var sc = atStart ? 0.8 : 1.5;
        if (prevString && prevString !== s) sc += 0.9;
        list.push({ type: 'san', string: s, score: sc });
      } else if (d > 0) {
        var pos = findPosition(s, target);
        if (!pos) continue;
        var score = 1.2;
        score += Math.abs(pos.hui - 9.5) * 0.3;        // 常用把位(7~10徽)
        if (pos.fen !== 0) score += 0.6;                // 整徽优先
        if (pos.hui < 5) score += 3;                    // 高把位难按
        if (pos.waiwei) score += 1.5;
        if (prevString && prevString !== s) score += 0.9;  // 少换弦
        if (ctx.prevHui != null)                        // 把位就近流动
          score += Math.min(1.2, Math.abs(pos.hui - ctx.prevHui) * 0.12);
        list.push({ type: 'an', string: s, hui: pos.hui, fen: pos.fen, waiwei: pos.waiwei, score: score });
      }
    }
    // 泛音候选：目标音恰在泛音位上时提供（不自动首选，供点击切换）
    for (var s2 = 1; s2 <= 7; s2++) {
      for (var hui in FAN_MULT) {
        var fs = fanSemitone(s2, parseInt(hui, 10));
        if (fs !== null && Math.abs(fs - target) < 0.35) {
          var fsc = 2.2 + (prevString && prevString !== s2 ? 0.5 : 0);
          list.push({ type: 'fan', string: s2, hui: parseInt(hui, 10), score: fsc });
        }
      }
    }
    list.sort(function (a, b) { return a.score - b.score; });
    return list;
  }

  // 解析简谱文本："1 2 3 5 6' 5, #4" → [{deg,sharp,oct}]
  function parseJianpu(text) {
    var out = [], re = /(#?)([1-7])((?:'|,)*)/g, m;
    while ((m = re.exec(text)) !== null) {
      var oct = 0;
      for (var i = 0; i < m[3].length; i++) oct += (m[3][i] === "'" ? 1 : -1);
      out.push({ deg: parseInt(m[2], 10), sharp: !!m[1], oct: oct });
    }
    return out;
  }

  function noteSemitone(n) { // n={type,string,hui,fen}
    if (n.type === 'san') return sanSemitone(n.string);
    if (n.type === 'fan') return fanSemitone(n.string, n.hui);
    return anSemitone(n.string, n.hui, n.fen);
  }

  var API = {
    OPEN: OPEN, HUI_FRAC: HUI_FRAC, FAN_MULT: FAN_MULT,
    TUNINGS: TUNINGS, setTuning: setTuning, tuning: tuning,
    sanSemitone: sanSemitone, anSemitone: anSemitone, fanSemitone: fanSemitone,
    semitoneToJianpu: semitoneToJianpu, jianpuToSemitone: jianpuToSemitone,
    findPosition: findPosition, candidatesFor: candidatesFor,
    parseJianpu: parseJianpu, noteSemitone: noteSemitone
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.QinPitch = API;
})(typeof window !== 'undefined' ? window : this);
