/* 琴谱通 QinPu · © 2026 iamamilycc · 授权 CC BY-NC-SA 4.0（须署名／非商业／衍生同授权）· https://github.com/iamamilycc/qinpu */
/* ============================================================
 * 琴谱通 scoresplit.js —— 拍谱识谱·整页自动切块
 *
 * 缘由（2026-07-19 实测）：整页发给视觉模型，八度点/泛音圈○/附点这些
 *   针尖大的小记号会糊掉认不出；裁成一小块近方形区域再识别就认得出。
 *   但太扁的长条（10:1）模型会返回空——故必须切成「近方形」块。
 *
 * 做法：① findBands 按横向空白把整页切成「系统」（行组，简谱+五线谱+减字+歌词为一系统）；
 *       ② splitBandCols 把每个系统按小节间的竖向空白切成近方形小块（在空白处切，不切断墨迹）；
 *       ③ 浏览器层 imageToBlocks 用 canvas 算像素墨迹投影，调上面两个纯函数得到块矩形。
 * 纯函数（findBands / splitBandCols）不碰 canvas/网络，node 可单测（见 tests/test_scoresplit.js）。
 * ============================================================ */
(function (global) {
  'use strict';

  // 找内容行程（darkness > 阈值的连续段），系统内的小间隙（< mergeGap）合并为一个系统 band。
  // rowDark: 每行墨迹量数组（越大越黑）；返回 [{y0, y1}]（y1 为开区间上界）。
  function findBands(rowDark, H, opts) {
    opts = opts || {};
    var max = 0, y;
    for (y = 0; y < H; y++) if (rowDark[y] > max) max = rowDark[y];
    if (max <= 0) return [];
    var thresh = max * (opts.darkFrac || 0.06);
    var mergeGap = opts.mergeGap != null ? opts.mergeGap : Math.max(4, Math.round(H * 0.03));
    var runs = [], inRun = false, s = 0;
    for (y = 0; y < H; y++) {
      var content = rowDark[y] > thresh;
      if (content && !inRun) { inRun = true; s = y; }
      else if (!content && inRun) { inRun = false; runs.push([s, y]); }
    }
    if (inRun) runs.push([s, H]);
    if (!runs.length) return [];
    var bands = [runs[0].slice()];
    for (var i = 1; i < runs.length; i++) {
      var last = bands[bands.length - 1];
      if (runs[i][0] - last[1] < mergeGap) last[1] = runs[i][1];
      else bands.push(runs[i].slice());
    }
    return bands.map(function (b) { return { y0: b[0], y1: b[1] }; });
  }

  // 把一个 band 按竖向空白切成近方形块。colDark: 该 band 内每列墨迹量；bandH: 该 band 高度。
  // 目标块宽 ≈ bandH * targetAspect；内容不宽时不切。返回 [{x0, x1}]（x1 开区间上界）。
  function splitBandCols(colDark, W, bandH, opts) {
    opts = opts || {};
    var max = 0, x;
    for (x = 0; x < W; x++) if (colDark[x] > max) max = colDark[x];
    if (max <= 0) return [];
    var thresh = max * (opts.darkFrac || 0.06);
    var minX = -1, maxX = -1;
    for (x = 0; x < W; x++) if (colDark[x] > thresh) { if (minX < 0) minX = x; maxX = x; }
    if (minX < 0) return [];
    var contentW = maxX - minX + 1;
    var targetW = bandH * (opts.targetAspect || 2.5);
    if (contentW <= targetW * 1.5) return [{ x0: minX, x1: maxX + 1 }];
    // 空白列的中心，作为候选切点（在这里切不会切断墨迹）
    var gaps = [], inGap = false, gs = 0;
    for (x = minX; x <= maxX; x++) {
      var white = colDark[x] <= thresh;
      if (white && !inGap) { inGap = true; gs = x; }
      else if (!white && inGap) { inGap = false; gaps.push((gs + x - 1) / 2); }
    }
    var blocks = [], start = minX;
    while (maxX - start + 1 > targetW * 1.5) {
      var ideal = start + targetW, best = -1, bestD = Infinity;
      for (var gi = 0; gi < gaps.length; gi++) {
        var g = gaps[gi];
        if (g <= start + 5) continue;
        var d = Math.abs(g - ideal);
        if (d < bestD) { bestD = d; best = g; }
      }
      var cut;
      if (best >= 0 && best < maxX) cut = Math.round(best);
      else cut = Math.min(maxX, Math.round(ideal));      // 无合适空白则硬切
      if (cut <= start) cut = Math.min(maxX, start + Math.round(targetW));
      blocks.push({ x0: start, x1: cut });
      start = cut;
    }
    blocks.push({ x0: start, x1: maxX + 1 });
    return blocks;
  }

  // 靠五线谱（满宽横线）把系统分组：五线谱 band = band 内存在某行墨迹量 > staffFill*W（一条满宽线）。
  // 每个五线谱 band 与其正上方的非五线谱 band（简谱行）配成一个「系统块」；跳过减字/歌词/标题。
  // 若整页无五线谱（纯减字页），回退为每个 band 各自成块。返回系统块 [{y0, y1}]。
  function groupSystems(bands, rowDark, W, opts) {
    opts = opts || {};
    var staffTh = W * (opts.staffFill || 0.45);
    var isStaff = bands.map(function (b) {
      var mx = 0;
      for (var y = b.y0; y < b.y1; y++) if (rowDark[y] > mx) mx = rowDark[y];
      return mx > staffTh;
    });
    if (!isStaff.some(Boolean)) return bands.map(function (b) { return { y0: b.y0, y1: b.y1 }; });
    var sys = [];
    for (var i = 0; i < bands.length; i++) {
      if (!isStaff[i]) continue;
      var hasJp = (i > 0 && !isStaff[i - 1]);
      var top = hasJp ? bands[i - 1].y0 : bands[i].y0;  // 简谱行在上则并入
      // jp = 简谱子行范围：列切点从这里找（有小节空白）；五线谱横线贯穿全宽无空白，不能用它找切点
      sys.push({ y0: top, y1: bands[i].y1,
        jpY0: hasJp ? bands[i - 1].y0 : bands[i].y0,
        jpY1: hasJp ? bands[i - 1].y1 : bands[i].y1 });
    }
    return sys;
  }

  // ── 浏览器层：canvas 像素墨迹投影 → 块矩形 [{x,y,w,h}]（node 环境无 document，不导出）──
  function imageToBlocks(canvas, opts) {
    opts = opts || {};
    var W = canvas.width, H = canvas.height;
    var data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    // 墨迹量 = 暗像素计数（灰度 < 150 视为墨）；行、列投影
    var rowDark = new Array(H).fill(0), colDark = new Array(W).fill(0), x, y;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var p = (y * W + x) * 4;
        var lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        if (lum < 150) { rowDark[y]++; colDark[x]++; }
      }
    }
    var bands = findBands(rowDark, H, opts);
    var systems = groupSystems(bands, rowDark, W, opts);   // 简谱行+五线谱行配成系统块
    var pad = Math.round(H * 0.01);
    var blocks = [];
    systems.forEach(function (band, sysIdx) {
      var bandH = band.y1 - band.y0;
      // 列切点只从「简谱子行」找（那里有小节空白）；五线谱横线贯穿全宽无空白，会导致切不动
      var jp0 = band.jpY0 != null ? band.jpY0 : band.y0, jp1 = band.jpY1 != null ? band.jpY1 : band.y1;
      var cCol = new Array(W).fill(0);
      for (y = jp0; y < jp1; y++)
        for (x = 0; x < W; x++) {
          var p = (y * W + x) * 4;
          if (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2] < 150) cCol[x]++;
        }
      var cols = splitBandCols(cCol, W, bandH, opts);
      cols.forEach(function (c) {
        var x0 = Math.max(0, c.x0 - pad), x1 = Math.min(W, c.x1 + pad);
        if (x1 - x0 < 8) return;   // 丢弃退化的零宽块
        blocks.push({ x: x0, y: Math.max(0, band.y0 - pad), sys: sysIdx,
          w: x1 - x0, h: Math.min(H, band.y1 + pad) - Math.max(0, band.y0 - pad) });
      });
    });
    return blocks;
  }

  var API = { findBands: findBands, splitBandCols: splitBandCols, groupSystems: groupSystems };
  if (typeof document !== 'undefined') API.imageToBlocks = imageToBlocks;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.QinSplit = API;
})(typeof window !== 'undefined' ? window : this);
