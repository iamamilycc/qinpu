/* 琴谱通音律引擎单元测试：node tests/test_pitch.js
 * 全部通过输出 ALL PASS；任一失败退出码 1 */
var P = require('../js/pitch.js');
var fails = 0;
function eq(name, got, want) {
  var ok = (JSON.stringify(got) === JSON.stringify(want));
  if (!ok) { fails++; console.log('FAIL', name, '得到', JSON.stringify(got), '期望', JSON.stringify(want)); }
  else console.log('pass', name);
}
function close(name, got, want, tol) {
  tol = tol || 0.06;
  var ok = Math.abs(got - want) < tol;
  if (!ok) { fails++; console.log('FAIL', name, '得到', got, '期望', want); }
  else console.log('pass', name);
}

// ── 散音：正调七弦 = C D F G A c d = 简谱 5, 6, 1 2 3 5 6 ──
eq('三弦散音=1(F)', P.semitoneToJianpu(P.sanSemitone(3)).text, '1');
eq('一弦散音=低音5(C)', P.semitoneToJianpu(P.sanSemitone(1)).text, '5,');
eq('七弦散音=6(d)', P.semitoneToJianpu(P.sanSemitone(7)).text, '6');

// ── 按音：经典位置 ──
close('一弦9徽=纯五度(G)', P.anSemitone(1, 9, 0), 7, 0.05);      // 3/2 ≈ +7.02
close('一弦7徽=八度(c)', P.anSemitone(1, 7, 0), 12, 0.01);
close('一弦10徽=纯四度(F)', P.anSemitone(1, 10, 0), 5, 0.05);    // 4/3 ≈ +4.98
close('一弦13徽≈大二度', P.anSemitone(1, 13, 0), 2, 0.35);       // 8/7 ≈ +2.31（纯律偏宽）
eq('一弦7徽按音简谱=5', P.semitoneToJianpu(P.anSemitone(1, 7, 0)).text, '5');

// ── 泛音 ──
close('一弦7徽泛音=八度', P.fanSemitone(1, 7), 12, 0.01);
close('一弦9徽泛音=八度上纯五', P.fanSemitone(1, 9), 19, 0.05);
close('一弦4徽泛音=两个八度', P.fanSemitone(1, 4), 24, 0.01);

// ── 反查徽位 ──
var p9 = P.findPosition(1, 7);   // 一弦上找 G(+7) → 应在9徽附近
eq('反查纯五度→9徽', [p9.hui, p9.fen], [9, 0]);
var p7 = P.findPosition(1, 12);  // 八度 → 7徽
eq('反查八度→7徽', [p7.hui, p7.fen], [7, 0]);
eq('低于散音不可按', P.findPosition(3, 2), null);

// ── 简谱解析 ──
eq('解析 1 2 #4 5\' 6,', P.parseJianpu("1 2 #4 5' 6,"),
  [{ deg: 1, sharp: false, oct: 0 }, { deg: 2, sharp: false, oct: 0 },
   { deg: 4, sharp: true, oct: 0 }, { deg: 5, sharp: false, oct: 1 },
   { deg: 6, sharp: false, oct: -1 }]);

// ── 自动编配：1(F) 应首选三弦散音 ──
var c = P.candidatesFor(P.jianpuToSemitone(1, false, 0), null);
eq('编配1=F首选三弦散音', [c[0].type, c[0].string], ['san', 3]);
// 2(G) 首选四弦散音
var c2 = P.candidatesFor(P.jianpuToSemitone(2, false, 0), null);
eq('编配2=G首选四弦散音', [c2[0].type, c2[0].string], ['san', 4]);
// #4 无散音可用 → 必为按音且有徽位
var c3 = P.candidatesFor(P.jianpuToSemitone(4, true, 0), null);
eq('#4为按音', c3[0].type, 'an');

// ── 双向一致性：编配出的弹法弹回来必须是原音 ──
var mel = P.parseJianpu("1 2 3 5 6 1' 6 5 3 2 1");
var prev = null, roundtripOK = true;
mel.forEach(function (n) {
  var t = P.jianpuToSemitone(n.deg, n.sharp, n.oct);
  var best = P.candidatesFor(t, prev)[0];
  prev = best.string;
  var back = Math.round(P.noteSemitone(best));
  if (back !== t) { roundtripOK = false; console.log('  往返不符', n, best, back, t); }
});
eq('11音旋律往返零误差', roundtripOK, true);


// ── 调弦法 ──
P.setTuning('ruibin');   // 紧五：五弦 A→Bb，1=bB
eq('蕤宾五弦散音=1(bB)', P.semitoneToJianpu(P.sanSemitone(5)).text, '1');
eq('蕤宾三弦散音=低5(F)', P.semitoneToJianpu(P.sanSemitone(3)).text, '5,');
P.setTuning('manjiao');  // 慢三：三弦 F→E，1=C
eq('慢角三弦散音=3(E)', P.semitoneToJianpu(P.sanSemitone(3)).text, '3');
eq('慢角一弦散音=1(C)', P.semitoneToJianpu(P.sanSemitone(1)).text, '1');
P.setTuning('huangzhong'); // 慢一紧五：一弦 C→Bb,
eq('黄钟一弦散音=低1(bB,)', P.semitoneToJianpu(P.sanSemitone(1)).text, '1,');
P.setTuning('manshang'); // 慢二：二弦=一弦同音；弦法表调性 1=C（特写核对后由 F 改正）
eq('慢商一二弦同音', P.sanSemitone(1) === P.sanSemitone(2), true);
eq('慢商一弦散音=1(C)', P.semitoneToJianpu(P.sanSemitone(1)).text, '1');
eq('慢商三弦散音=4(F)', P.semitoneToJianpu(P.sanSemitone(3)).text, '4');
P.setTuning('qiliang'); // 紧二五：二弦 D→bE、五弦 A→bB，1=bB（琴书弦法表）
eq('凄凉五弦散音=1(bB)', P.semitoneToJianpu(P.sanSemitone(5)).text, '1');
eq('凄凉二弦散音=低4(bE)', P.semitoneToJianpu(P.sanSemitone(2)).text, '4,');
P.setTuning('biyu'); // 碧玉：紧三慢一四六——三四弦同为 #F（弦法表 6133561 互证）
eq('碧玉三四弦同音', P.sanSemitone(3) === P.sanSemitone(4), true);
eq('碧玉二弦散音=1(D)', P.semitoneToJianpu(P.sanSemitone(2)).text, '1');
P.setTuning('qingshang'); // 清商：紧二五七，1=bE
eq('清商七弦散音=高1(be)', P.semitoneToJianpu(P.sanSemitone(7)).text, "1'");
eq('清商二弦散音=1(bE)', P.semitoneToJianpu(P.sanSemitone(2)).text, '1');
P.setTuning('zheng');    // 还原
eq('还原正调三弦=1(F)', P.semitoneToJianpu(P.sanSemitone(3)).text, '1');

// ── 弦徽音高模型 vs 国琴网权威正调定弦校验表（纯律精度，比音名）──
// 证明编配引擎的散/按/泛音定位与传统定弦法一致（音高地道）。
function pcEq(name, got, exp) {
  var d = ((got - exp) % 12 + 12) % 12; if (d > 6) d -= 12;
  var ok = Math.abs(d) < 0.15;              // 允许纯律与平均律音差(comma)
  console.log((ok ? 'pass ' : 'FAIL ') + name);
  if (!ok) fails++;
}
pcEq('定弦校验:七弦散==四弦九徽按(纯五)', P.anSemitone(4, 9), 14);
pcEq('定弦校验:六弦散==四弦十徽按(纯四)', P.anSemitone(4, 10), 12);
pcEq('定弦校验:五弦散==三弦十徽八分按', P.anSemitone(3, 10, 8), 9);
pcEq('定弦校验:四弦散==二弦十徽按', P.anSemitone(2, 10), 7);
pcEq('定弦校验:三弦散==一弦十徽按', P.anSemitone(1, 10), 5);
pcEq('定弦校验:二弦七徽按==七弦音名', P.anSemitone(2, 7), 14);
pcEq('定弦校验:七弦九徽按==五弦音名A', P.anSemitone(7, 9), 9);
pcEq('定弦校验:一弦七徽泛==六弦', P.fanSemitone(1, 7), 12);
pcEq('定弦校验:二弦七徽泛==七弦', P.fanSemitone(2, 7), 14);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);

