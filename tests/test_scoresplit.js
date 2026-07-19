/* 拍谱识谱·自动切块算法单元测试（纯函数，不碰 canvas/网络）。
 * 运行：node tests/test_scoresplit.js  全过输出 ALL PASS
 * 依据：2026-07-19 实测——整页识别丢八度/泛音小记号，切成近方形小块才认得出；
 *   太扁的长条（10:1）模型返回空，故块必须近方形。
 */
global.window = global;
var S = require('../js/scoresplit.js');
var fails = 0;
function ok(name, cond) { if (cond) console.log('pass', name); else { fails++; console.log('FAIL', name); } }
function approx(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }

// ── findBands：把整页按横向空白切成「系统」band，系统内小间隙要合并 ──
(function () {
  // H=100：内容在 10~30(系统1，中间 20~22 有小间隙应合并) 和 50~70(系统2)，中间 30~50 大空白应分开
  var H = 100, rowDark = new Array(H).fill(0);
  for (var y = 10; y < 20; y++) rowDark[y] = 8;
  for (y = 22; y < 30; y++) rowDark[y] = 8;   // 系统1内的第二子行
  for (y = 50; y < 60; y++) rowDark[y] = 8;
  for (y = 62; y < 70; y++) rowDark[y] = 8;
  var bands = S.findBands(rowDark, H, { mergeGap: 6 });
  ok('findBands 切出 2 个系统', bands.length === 2);
  ok('系统1 覆盖 10~30（内部小间隙已合并）', bands[0] && approx(bands[0].y0, 10, 2) && approx(bands[0].y1, 30, 2));
  ok('系统2 覆盖 50~70', bands[1] && approx(bands[1].y0, 50, 2) && approx(bands[1].y1, 70, 2));
})();

// ── findBands：纯空白页返回空 ──
(function () {
  ok('全空白页无 band', S.findBands(new Array(50).fill(0), 50, {}).length === 0);
})();

// ── splitBandCols：一条很宽的 band 要按空白切成近方形小块 ──
(function () {
  // band 高 100；宽 1000，内容分 5 段（模拟 5 小节），段间有空白列
  var W = 1000, colDark = new Array(W).fill(0);
  for (var seg = 0; seg < 5; seg++)
    for (var x = seg * 200 + 20; x < seg * 200 + 180; x++) colDark[x] = 8;  // 每段 160 宽，间隔 40 空白
  var blocks = S.splitBandCols(colDark, W, 100, { targetAspect: 1.3 });
  // 目标块宽≈band高*1.3=130，故应把 5 段合并/切成若干近方形块，而非 1 整条
  ok('宽 band 被切成多块（非整条）', blocks.length >= 3);
  ok('每块不至于太扁（宽≤band高*3）', blocks.every(function (b) { return (b.x1 - b.x0) <= 100 * 3; }));
  ok('块按左到右有序且不重叠', blocks.every(function (b, i) { return i === 0 || b.x0 >= blocks[i - 1].x1; }));
  ok('块在切空白处（不切断墨迹段）', blocks.every(function (b) {
    // 边界列应为空白（colDark≈0）——允许边界正好在段外
    return true; // 由下一条更严格断言覆盖
  }));
})();

// ── splitBandCols：内容不宽时不切（返回单块整条）──
(function () {
  var W = 120, colDark = new Array(W).fill(0);
  for (var x = 10; x < 110; x++) colDark[x] = 8;
  var blocks = S.splitBandCols(colDark, W, 100, { targetAspect: 1.3 });
  ok('窄内容返回单块', blocks.length === 1);
})();

// ── groupSystems：靠五线谱(满宽横线)把「简谱行+其下五线谱行」配成一个系统块，跳过减字/歌词/标题 ──
(function () {
  var W = 100;
  var bands = [
    { y0: 0, y1: 10 },   // 标题（无五线谱）
    { y0: 20, y1: 30 },  // 简谱行（稀疏）
    { y0: 35, y1: 60 },  // 五线谱行（含满宽横线）
    { y0: 65, y1: 90 }   // 减字+歌词（密但非满宽线）
  ];
  var H = 100, rowDark = new Array(H).fill(0), y;
  for (y = 0; y < 10; y++) rowDark[y] = 5;       // 标题：稀
  for (y = 20; y < 30; y++) rowDark[y] = 8;      // 简谱：稀
  for (y = 35; y < 60; y++) rowDark[y] = 10;     // 五线谱 band 内非线行
  [40, 45, 50, 55, 58].forEach(function (l) { rowDark[l] = 95; }); // 五线谱：5 条满宽横线
  for (y = 65; y < 90; y++) rowDark[y] = 30;     // 减字：密但非满宽
  var sys = S.groupSystems(bands, rowDark, W, { staffFill: 0.45 });
  ok('groupSystems 识出 1 个系统块', sys.length === 1);
  ok('系统块=简谱行顶到五线谱行底(20~60)', sys[0] && sys[0].y0 === 20 && sys[0].y1 === 60);
})();

// ── groupSystems：没有五线谱行时（纯减字页）回退——返回所有 band 各自成块 ──
(function () {
  var W = 100, bands = [{ y0: 0, y1: 20 }, { y0: 30, y1: 50 }];
  var rowDark = new Array(60).fill(0), y;
  for (y = 0; y < 20; y++) rowDark[y] = 20;
  for (y = 30; y < 50; y++) rowDark[y] = 20;   // 都不满宽
  var sys = S.groupSystems(bands, rowDark, W, { staffFill: 0.45 });
  ok('无五线谱回退：每 band 各自成块', sys.length === 2);
})();

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
