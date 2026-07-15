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

P.setTuning('zheng'); S.setKey(5); // 复位
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
