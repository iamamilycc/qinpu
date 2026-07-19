/* 减字渲染结构单元测试：验证「容器律」——弦号嵌进指法怀里，不写在指法下方。
 * 依据《减字组字文法》大律一（容器律）+ 大律四（撮双臂框架，两臂弦号同样入怀）。
 * 运行：node tests/test_jianzi.js  全过输出 ALL PASS
 */
global.window = global;
var J = require('../js/jianzi.js');
var fails = 0;
function ok(name, cond) {
  if (cond) console.log('pass', name);
  else { fails++; console.log('FAIL', name); }
}

// 提取 SVG 里所有 <text>：返回 [{ch, size, x, y}]
function texts(svg) {
  var re = /<text[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bfont-size="([^"]+)"[^>]*>([^<]+)<\/text>/g, m, out = [];
  while ((m = re.exec(svg)) !== null)
    out.push({ x: +m[1], y: +m[2], size: +m[3], ch: m[4] });
  return out;
}
function find(ts, ch) { return ts.filter(function (t) { return t.ch === ch; })[0]; }

// ── 容器律：单字勾四，弦号「四」嵌在勹口内（y 与勹接近，非下方另起）──
(function () {
  var ts = texts(J.render({ type: 'san', string: 4, right: '勾' }));
  var gou = find(ts, '勹'), num = find(ts, '四');
  ok('勾四渲染出勹与弦号四', gou && num);
  // 弦号在指法怀里：y 差很小（嵌合），且弦号比指法小
  ok('勾四·弦号嵌勹口内(非下方)', num && gou && Math.abs(num.y - gou.y) <= 12 && num.size < gou.size);
})();

// ── 容器律·撮双臂：勾四+挑六，两臂弦号各自嵌进勹/乚怀里（回归 2026-07-18 修）──
(function () {
  var ts = texts(J.render({ type: 'san', string: 6, right: '撮', cuo: { lt: '勾', ls: 4, rt: '挑', rs: 6 } }));
  var lg = find(ts, '勹'), ln = find(ts, '四'), rg = find(ts, '乚'), rn = find(ts, '六');
  ok('撮渲染出左臂勹四·右臂乚六', lg && ln && rg && rn);
  // 修前弦号在 y=92（指法 y=74 下方16），修后应嵌在怀里 |Δy|≤10
  ok('撮左臂·弦号四嵌勹口内(非下方)', ln && lg && Math.abs(ln.y - lg.y) <= 10);
  ok('撮右臂·弦号六嵌乚内(非下方)', rn && rg && Math.abs(rn.y - rg.y) <= 10);
  // 弦号是被指法抱着的小字
  ok('撮两臂弦号小于臂指法', ln && lg && rn && rg && ln.size < lg.size && rn.size < rg.size);
})();

// ── 混合臂撮：右臂按音，指+徽写在该臂弦号「正上方」(书证更正 2026-07-19)──
// 旧版把指徽放最右竖列 x=94；更正后应在右臂弦号「六」正上方(x 靠近六、y 小于六)
(function () {
  var ts = texts(J.render({ type: 'san', string: 6, right: '撮', cuo: { lt: '勾', ls: 4, rt: '挑', rs: 6, rl: '大', rhui: 9 } }));
  var zhi = find(ts, '大'), hui = find(ts, '九'), rn = find(ts, '六');
  ok('混合臂撮渲染出按臂指「大」徽「九」', zhi && hui && rn);
  ok('混合臂撮·指徽在右臂弦号正上方(y更小)', zhi && hui && rn && zhi.y < rn.y && hui.y < rn.y);
  ok('混合臂撮·指徽横对右臂非甩到最右列(x≤88)', zhi && hui && zhi.x <= 88 && hui.x <= 88 && Math.abs(hui.x - rn.x) <= 15);
})();

// ── 托撮：勾二+托七，右臂弦号嵌乇内 ──
(function () {
  var ts = texts(J.render({ type: 'san', string: 7, right: '撮', cuo: { lt: '勾', ls: 2, rt: '托', rs: 7 } }));
  var rg = find(ts, '乇'), rn = find(ts, '七');
  ok('托撮右臂·弦号七嵌乇内(非下方)', rn && rg && Math.abs(rn.y - rg.y) <= 10);
})();

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
