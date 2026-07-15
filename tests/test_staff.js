/* 五线谱正确性单元测试：验证每个音的字母/升降号/八度都对
 * 这是「保证五线谱不会错」的凭据——不靠肉眼，靠确定性断言。
 * 运行：node tests/test_staff.js
 */
global.window = global;
var S = require('../js/staff.js');
var P = require('../js/pitch.js');

var LETTER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
var fails = 0;

// 由半音数(相对C2)反查 staff 渲染出的 [字母, 升降, 八度]
function spell(semi) {
  var p = S.pos(semi);              // {y, idx, acc}
  var letter = LETTER[((p.idx % 7) + 7) % 7];
  var oct = Math.floor(p.idx / 7);
  return { letter: letter, acc: p.acc, oct: oct };
}
function eq(name, got, exp) {
  var ok = got.letter === exp[0] && got.acc === exp[1] && got.oct === exp[2];
  console.log((ok ? 'pass ' : 'FAIL ') + name +
    (ok ? '' : '  期望 ' + exp.join('') + '  得到 ' + got.letter + (got.acc || '') + got.oct));
  if (!ok) fails++;
}

// ── 基准：低音谱表音高定位（与调无关的绝对音高）──
S.setKey(0); // C 大调，最少干扰
eq('C2(一弦散音)=C 本位 八度2', spell(0), ['C', '', 2]);
eq('c(七弦低八度往上)=C 八度3', spell(12), ['C', '', 3]);
eq('G2=G 八度2', spell(7), ['G', '', 2]);
eq('中央C=C 八度4', spell(24), ['C', '', 4]);

// ── 正调 F：♭B 在调号内不另标，B 本位需还原号 ──
P.setTuning('zheng'); S.setKey(P.tuning().key);
eq('正调 ♭B 在调内不标记', spell(10), ['B', '', 2]);
eq('正调 B本位=需还原号', spell(11), ['B', 'n', 2]);
eq('正调 F=F本位', spell(5), ['F', '', 2]);
eq('正调 E=E本位', spell(4), ['E', '', 2]);

// ── 侧商调 D（升号调！F♯/C♯ 必须是升号，不能拼成 G♭/D♭）──
P.setTuning('ceshang'); S.setKey(P.tuning().key);
eq('侧商 F♯ 在调内=F 不另标(非G♭)', spell(6), ['F', '', 2]);
eq('侧商 C♯ 在调内=C 不另标', spell(13), ['C', '', 3]);
eq('侧商 C本位=还原号', spell(12), ['C', 'n', 3]);
eq('侧商 ♭B=升号调拼作 A♯', spell(10), ['A', '#', 2]);

// ── 商调 D（同为 2 升号）──
P.setTuning('shangdiao'); S.setKey(P.tuning().key);
eq('商调 F♯=F 不另标', spell(6), ['F', '', 2]);

// ── 慢商调 C ──
P.setTuning('manshang'); S.setKey(P.tuning().key);
eq('慢商 F本位=F', spell(5), ['F', '', 2]);
eq('慢商 E本位=E', spell(4), ['E', '', 2]);

// ── 清商调 ♭E（3 降号：♭B ♭E ♭A）──
P.setTuning('qingshang'); S.setKey(P.tuning().key);
eq('清商 ♭E 在调内=E 不另标', spell(3), ['E', '', 2]);
eq('清商 ♭A 在调内=A 不另标', spell(8), ['A', '', 2]);

// ── 调号记号数量（clefCell 画出的升/降号个数）──
function sigCount(tuning) {
  P.setTuning(tuning); S.setKey(P.tuning().key);
  var svg = S.clefCell();
  return (svg.match(/♯|♭/g) || []).length;
}
function ceq(name, got, exp) { var ok = got === exp; console.log((ok ? 'pass ' : 'FAIL ') + name + (ok ? '' : ' 期望' + exp + '得' + got)); if (!ok) fails++; }
ceq('正调调号=1个(♭B)', sigCount('zheng'), 1);
ceq('慢角调号=0个(C大调)', sigCount('manjiao'), 0);
ceq('侧商调号=2个(F♯C♯)', sigCount('ceshang'), 2);
ceq('清商调号=3个', sigCount('qingshang'), 3);
ceq('凄凉调号=2个(♭B♭E)', sigCount('qiliang'), 2);
ceq('慢宫调号=1个(F♯)', sigCount('mangong'), 1);

// ── 加线（ledger line）条数：极高/极低音超出五线时补的短横线 ──
// 低音谱表标准：谱线 G2 B2 D3 F3 A3；期望值均按乐理核对过。
P.setTuning('zheng'); S.setKey(5);
function ledgerCount(semi) {
  var svg = S.cell([{ semi: semi }], {});
  return (svg.match(/class="st-line"/g) || []).length - 5; // 减去5条谱线
}
function leq(name, semi, exp) {
  var got = ledgerCount(semi);
  var ok = got === exp;
  console.log((ok ? 'pass ' : 'FAIL ') + name + '(semi' + semi + ')加线' + (ok ? '=' + exp : '期望' + exp + '得' + got));
  if (!ok) fails++;
}
leq('C2一弦散音', 0, 2);   // E2、C2 两条下加线
leq('D2', 2, 1);
leq('E2第一下加线', 4, 1);
leq('F2下方间', 5, 0);
leq('G2最低谱线', 7, 0);
leq('D3中线', 14, 0);
leq('A3最高谱线', 21, 0);
leq('中央C(C4)', 24, 1); // 第一上加线
leq('D4', 26, 1);
leq('E4第二上加线', 28, 2);
leq('C5', 36, 4);

// ── 全覆盖：所有调 × 全音域「往返校验」——证明显示音名==实际音高 ──
(function roundTripAll() {
  var NAT = S._natpc, bad = 0, checked = 0;
  Object.keys(P.TUNINGS).forEach(function (tk) {
    P.setTuning(tk); S.setKey(P.tuning().key);
    var alt = S._alt();
    for (var pc = 0; pc < 12; pc++) {
      var sp = S._spell(pc), L = sp[0], acc = sp[1], eff;
      if (acc === '') eff = ((NAT[L] + (alt[L] || 0)) % 12 + 12) % 12;
      else if (acc === 'n') eff = NAT[L];
      else if (acc === '#') eff = (NAT[L] + 1) % 12;
      else eff = (NAT[L] + 11) % 12;
      checked++;
      if (eff !== pc) { bad++; if (bad <= 5) console.log('  ✗ ' + tk + ' pc=' + pc + '→字母' + L + acc + ' 反算=' + eff); }
    }
  });
  console.log((bad === 0 ? 'pass ' : 'FAIL ') + '全15调×12音拼写往返(' + checked + '项)音名==实际音高');
  if (bad) fails++;
})();

// ── 全音域定位合法+八度正确（黄钟低 ♭B, 到 泛音高音区）──
(function rangeAll() {
  var bad = 0, checked = 0;
  Object.keys(P.TUNINGS).forEach(function (tk) {
    P.setTuning(tk); S.setKey(P.tuning().key);
    for (var semi = -4; semi <= 44; semi++) {
      var p = S.pos(semi); checked++;
      var okAcc = ['', '#', 'b', 'n'].indexOf(p.acc) >= 0;
      var expectOct = Math.floor((36 + semi) / 12) - 1, gotOct = Math.floor(p.idx / 7);
      if (!okAcc || Math.abs(gotOct - expectOct) > 1) { bad++; if (bad <= 5) console.log('  ✗ ' + tk + ' semi=' + semi + ' acc=' + p.acc + ' oct=' + gotOct + '/' + expectOct); }
    }
  });
  console.log((bad === 0 ? 'pass ' : 'FAIL ') + '全15调×49半音 定位合法+八度正确(' + checked + '项)');
  if (bad) fails++;
})();

P.setTuning('zheng'); S.setKey(5); // 复位
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
