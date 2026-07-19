/* 琴谱通 QinPu · © 2026 iamamilycc · 授权 CC BY-NC-SA 4.0（须署名／非商业／衍生同授权）· https://github.com/iamamilycc/qinpu */
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

  // ── 调弦法（各弦散音相对正调一弦 C 的半音数；key=简谱"1"的音高/调号）──
  // 全部十五调按琴书《古琴弦法表》核对（2026-07-12 特写照片，逐格确认）
  // 调性双选的（间弦 C或♭B、无媒 C或G）取前者为记谱基准
  // base：简谱"中音1"相对一弦C的半音数（记谱基准八度）。缺省=key（多数调tonic在中低弦）。
  //   1=C 且 tonic 落在六弦 c(=12) 的四调（慢角/玉女/慢商/间弦），中音1=六弦c，
  //   故 base=12——否则中音1会错落到一弦C2(地板)，全曲记低八度、低音句掉出地板变红叉。
  //   依据：秋风词原谱定弦图「1̣2̣3̣5̣6̣ 1 2」前五弦下加点=低音、六弦=中音1（2026-07-15核对）。
  var TUNINGS = {
    zheng:      { name: '正调 1=F',            open: [0, 2, 5, 7, 9, 12, 14],   key: 5,  flats: [10] },
    // 借正调 1=C：不改弦，正调开弦按 1=C 记谱（徵调式借调）。定弦=1̣2̣4̣5̣6̣12，
    //   中音1 落六弦 c(=12) → base:12（同慢角家族，否则低音句掉出一弦地板变红叉）。
    //   书证：湘妃怨（吴宗汉传谱）原谱印「正调定弦: 1̣2̣4̣5̣6̣12」，2026-07-17 闭环核对。
    jiezheng:   { name: '借正调 1=C（不改弦）',  open: [0, 2, 5, 7, 9, 12, 14],   key: 0,  base: 12, flats: [] },
    ruibin:     { name: '蕤宾调·紧五 1=♭B',    open: [0, 2, 5, 7, 10, 12, 14],  key: 10, flats: [10, 3] },
    huangzhong: { name: '黄钟调·紧五慢一 1=♭B', open: [-2, 2, 5, 7, 10, 12, 14], key: 10, flats: [10, 3] },
    liyou:      { name: '离忧调·紧五慢一二 1=♭B', open: [-2, 0, 5, 7, 10, 12, 14], key: 10, flats: [10, 3] },
    qiliang:    { name: '凄凉调·紧二五 1=♭B',   open: [0, 3, 5, 7, 10, 12, 14],  key: 10, flats: [10, 3] },
    manjiao:    { name: '慢角调·慢三 1=C',     open: [0, 2, 4, 7, 9, 12, 14],   key: 0,  base: 12, flats: [] },
    yunv:       { name: '玉女调·慢一三 1=C',   open: [-1, 2, 4, 7, 9, 12, 14],  key: 0,  base: 12, flats: [] },
    manshang:   { name: '慢商调·慢二 1=C',     open: [0, 0, 5, 7, 9, 12, 14],   key: 0,  base: 12, flats: [10] },
    jianxian:   { name: '间弦调·紧五慢三 1=C',  open: [0, 2, 4, 7, 10, 12, 14],  key: 0,  base: 12, flats: [10] },
    wumei:      { name: '无媒调·慢三六 1=C',   open: [0, 2, 4, 7, 9, 11, 14],   key: 0,  flats: [] },
    // 慢宫「1=G/♭A 记谱分歧」已裁决（2026-07-17，获麟操 pu/1078 管平湖演奏谱·王迪记谱，
    //   据《风宣玄品》1539）：原谱印「1=G／慢一三六定弦: 3̤5̤6̤ 1̣2̣3̣5̣」——
    //   ①key:7(1=G) 与本表相符，相对定弦 3 5 6 1 2 3 5 逐弦全同；
    //     （John Thompson 记作 6 1 2 4 5 6 1＝1=D，那是现代编曲者读法[国琴网梅旸諸曲同此]，非传统调名口径）
    //   ②⚠ base:19 —— 原谱四弦印「1̣」(低音1，单点)，故中音1 在四弦上方八度 G3=19，
    //     而非四弦散音 G2=7。缺 base 时 F_OFFSET 退回 key=7 → 全曲记高八度、
    //     倍低音 3̤ 算成 -13 掉出一弦地板(-1)→红✕无可弹位（同慢角 base:12 那一类）。
    //     七弦逐弦回算全中：3̤=-1 5̤=2 6̤=4 1̣=7 2̣=9 3̣=11 5̣=14。
    mangong:    { name: '慢宫调·慢一三六 1=G',  open: [-1, 2, 4, 7, 9, 11, 14],  key: 7,  base: 19, flats: [] },
    // 商调＝John Thompson 所称「姑洗调 guxian」：相对定弦 6 1 2 3 5 6 1（2026-07-17 书证核对）。
    //   同一相对定弦有两条调法路径：慢一三四六（本条，1=D，记谱出升号 F♯C♯）
    //   或紧二五七（＝下方 qingshang，1=♭E，记谱出降号）——音程全等，仅绝对基准差半音。
    shangdiao:  { name: '商调·慢一三四六 1=D',  open: [-1, 2, 4, 6, 9, 11, 14],  key: 2,  flats: [] },
    ceshang:    { name: '侧商调·慢三四六 1=D',  open: [0, 2, 4, 6, 9, 11, 14],   key: 2,  flats: [] },
    biyu:       { name: '碧玉调·紧三慢一四六 1=D', open: [-1, 2, 6, 6, 9, 11, 14], key: 2, flats: [] },
    qingshang:  { name: '清商调·紧二五七 1=♭E', open: [0, 3, 5, 7, 10, 12, 15],  key: 3,  flats: [10, 3, 8] },
    // 捣衣（徐立荪，梅庵1931）：紧二五七 + 慢一，1=♭E。开弦间隔同清商 [0,3,5,7,10,12,15]，
    //   但记谱基准不同——原谱印「定弦 6̤1̣2̣3̣5̣6̣1」，中音1 落七弦(open=15) → base:15
    //   （清商 base 默认=key=3，中音1 在二弦；两曲同开弦、异基准，故各立一调）。2026-07-17 闭环核对。
    daoyi:      { name: '捣衣·紧二五七慢一 1=♭E', open: [0, 3, 5, 7, 10, 12, 15], key: 3, base: 15, flats: [10, 3, 8] }
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
    F_OFFSET = (t.base !== undefined ? t.base : t.key);
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
    var acc = (sharp === true) ? 1 : (sharp === false || sharp == null) ? 0 : sharp; // 兼容 ±1
    return F_OFFSET + DEG_SEMI[deg] + acc + 12 * oct;
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
  // ctx.profile = { san, an, fan } 三种音色的偏好倍率（编配画像，见 app.js）
  // ctx.fast = 快速乐句（八分/十六分/三连音）——人体力学：手来不及大跳
  function candidatesFor(target, prevString, ctx) {
    ctx = ctx || {};
    var pf = ctx.profile || { san: 1, an: 1, fan: 1 };
    var atStart = ctx.mStart !== undefined ? ctx.mStart : (prevString === null || prevString === undefined);
    var fastK = ctx.fast ? 1.7 : 1;   // 快速乐句：换弦/移徽罚分加重
    var list = [];
    for (var s = 1; s <= 7; s++) {
      var d = target - OPEN[s - 1];
      if (d === 0) {
        // 散音：句头顺手；句中偏贵（无韵），让位给可走音的按音
        // 散音连用衰减：连片散音平直无韵，连得越多下一个散音越贵→散按自然相间
        // sanRunK：琴歌画像调低连用衰减（梅庵书证：入我相思门＝连片散音是常态）
        var sc = (atStart ? 0.8 : 1.5) * pf.san + (ctx.sanRun || 0) * 0.75 * (pf.sanRunK != null ? pf.sanRunK : 1);
        if (prevString && prevString !== s) {
          // 跨弦越远右手越吃力；但乐句起点右手可自由归位（句间有呼吸），
          // 跨弦成本大减，让空弦骨架音不因「留在前一音弦上」的按音就近而被夺（散音起骨架）
          sc += (0.5 + 0.2 * Math.abs(s - prevString)) * fastK * (atStart ? 0.3 : 1);
        }
        list.push({ type: 'san', string: s, score: sc });
      } else if (d > 0) {
        var pos = findPosition(s, target);
        if (!pos) continue;
        var score = 1.2 * pf.an;
        score += Math.abs(pos.hui - 9.5) * 0.3;        // 常用把位(7~10徽)
        if (pos.fen !== 0) score += 0.6;                // 整徽优先
        if (pos.hui < 5) score += 3;                    // 高把位难按
        if (pos.hui > 11) score += (pos.hui - 11) * 0.7; // 十二徽以下过深（旋律音罕用，秋风词闭环书证）
        if (pf.anchor && pos.hui >= 8.5 && pos.hui <= 10.5) score -= 0.25; // 琴歌把位锚：九/十徽带
        if (pos.waiwei) score += 1.5;
        if (prevString && prevString !== s)             // 人体力学：跨弦距离分级
          score += (0.5 + 0.2 * Math.abs(s - prevString)) * fastK;
        if (ctx.prevHui != null)                        // 左手移徽就近（快句加重）
          score += Math.min(1.6, Math.abs(pos.hui - ctx.prevHui) * 0.14 * fastK);
        list.push({ type: 'an', string: s, hui: pos.hui, fen: pos.fen, waiwei: pos.waiwei, score: score });
      }
    }
    // 泛音候选（1-13徽以七徽为轴的谐波家族）：偏好由画像控制
    for (var s2 = 1; s2 <= 7; s2++) {
      for (var hui in FAN_MULT) {
        var huiN = parseInt(hui, 10);
        var fs = fanSemitone(s2, huiN);
        if (fs !== null && Math.abs(fs - target) < 0.35) {
          // 节点强度偏好（湘妃怨闭环书证：大师泛音一律取最强节点，几乎全用七徽八度）：
          //   FAN_MULT=谐波序号，越低=节点越响越好按（徽7=2八度最强，徽1/13=8最弱最难）。
          //   加 (谐波序号-2)*0.35 惩罚，使七徽＞五九徽＞四十徽＞…，冷门高谐波节点最贵。
          var nodePen = (FAN_MULT[huiN] - 2) * 0.35;
          var fsc = 2.2 * pf.fan + nodePen + (prevString && prevString !== s2 ? 0.5 : 0);
          list.push({ type: 'fan', string: s2, hui: huiN, score: fsc });
        }
      }
    }
    // 泛音段（forceFan）：本段应整段用泛音（成大段）。凡该音有可得泛音，
    // 大幅提前其优先级使之必被选中；若该音在琴上无谐波节点（罕见），自然回落按/散。
    if (ctx.forceFan && list.some(function (c) { return c.type === 'fan'; })) {
      list.forEach(function (c) { if (c.type === 'fan') c.score -= 100; });
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
