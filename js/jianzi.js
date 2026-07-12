/* ============================================================
 * 琴谱通 jianzi.js —— 减字 SVG 组字渲染
 *
 * 减字结构：上半 = 左手指法 + 徽位；下半 = 右手指法 + 弦号
 * Unicode 未收录减字，故用 SVG 把部件动态叠成一个"字"。
 *
 * ⚠️ 字形诚实声明：部分减字省文尚待琴谱字形校对——
 *   有把握的省文：大/人/中/夕(左手)、艹(散)、木(抹)、勹(勾)、
 *                 丁(打)、乇(托)、今(吟)
 *   待校对(以全字或通行近似显示)：挑、剔、摘、擘、撮、滚、拂、
 *                 绰、注、猱 —— UNSURE 集合标记
 * ============================================================ */
(function (global) {
  'use strict';

  var NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'];

  var LEFT = { '大': '大', '食': '人', '中': '中', '名': '夕', '跪': '跪' };
  var RIGHT = {
    // 基本八法
    '挑': '乚', '抹': '木', '勾': '勹', '剔': '剔', '打': '丁', '摘': '摘',
    '托': '乇', '擘': '擘',
    // 组合指法（多为全字/近似省文显示，字形待琴谱校对）
    '撮': '撮', '反撮': '反撮', '轮': '仑', '半轮': '半仑',
    '短锁': '短锁', '长锁': '长锁', '背锁': '背锁', '如一声': '如一',
    '双弹': '双', '蠲': '蠲', '历': '历',
    '滚': '滚', '拂': '弗', '滚拂': '滚弗',
    '泼': '泼', '剌': '剌', '泼剌': '泼剌', '伏': '伏',
    '打圆': '打圆', '索铃': '索铃'
  };
  var UNSURE = {
    '挑': 1, '剔': 1, '摘': 1, '擘': 1, '撮': 1, '反撮': 1, '滚': 1, '拂': 1,
    '滚拂': 1, '历': 1, '轮': 1, '半轮': 1, '短锁': 1, '长锁': 1, '背锁': 1,
    '如一声': 1, '双弹': 1, '蠲': 1, '泼': 1, '剌': 1, '泼剌': 1, '伏': 1,
    '打圆': 1, '索铃': 1,
    '绰': 1, '注': 1, '猱': 1, '进复': 1, '退复': 1, '撞': 1, '双撞': 1,
    '唤': 1, '逗': 1, '往来': 1, '淌': 1, '分开': 1,
    '罨': 1, '虚罨': 1, '掐起': 1, '带起': 1, '爪起': 1, '推出': 1, '放合': 1,
    '长吟': 1, '细吟': 1, '游吟': 1, '急吟': 1, '大猱': 1, '急猱': 1, '缓猱': 1
  };
  var ORN = {
    '绰': '绰', '注': '注', '吟': '今', '猱': '猱', '上': '上', '下': '下',
    '长吟': '长今', '细吟': '细今', '游吟': '游今', '急吟': '急今',
    '大猱': '大猱', '急猱': '急猱', '缓猱': '缓猱',
    '进复': '进复', '退复': '退复', '撞': '撞', '双撞': '双撞', '唤': '唤',
    '逗': '逗', '往来': '往来', '淌': '淌', '分开': '分开',
    '罨': '罨', '虚罨': '虚罨', '掐起': '掐起', '带起': '带起',
    '爪起': '爪起', '推出': '推出', '放合': '放合'
  };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function text(x, y, size, str, cls) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size +
      '" text-anchor="middle" dominant-baseline="middle"' +
      (cls ? ' class="' + cls + '"' : '') + '>' + esc(str) + '</text>';
  }

  // 徽位显示：整徽="九"；带分="九二"上下叠；徽外="外"
  function huiGlyph(note, x, yTop, h) {
    if (note.waiwei) {
      return text(x, yTop + h * 0.28, 22, '外') + text(x, yTop + h * 0.72, 22, NUM[13]);
    }
    var huiStr = NUM[note.hui] || '?';
    if (note.fen && note.fen > 0) {
      var fenStr = NUM[note.fen] || String(note.fen);
      return text(x, yTop + h * 0.28, huiStr.length > 1 ? 15 : 20, huiStr) +
             text(x, yTop + h * 0.72, 20, fenStr);
    }
    return text(x, yTop + h * 0.5, huiStr.length > 1 ? 17 : 26, huiStr);
  }

  /* 渲染一个减字。note = {
   *   type:'san'|'an'|'fan', string:1-7,
   *   hui, fen, waiwei, left:'大|食|中|名', right:'挑|抹|…', orn:['吟',…] }
   * 返回 SVG 字符串（自带 <svg>）。 */
  function render(note, sizePx, opts) {
    sizePx = sizePx || 72;
    opts = opts || {};
    var W = 100, H = 112;
    var parts = [];
    var warn = false;

    // ── 走音小字（上/下＋徽位）：左手滑到位，右手不另弹 ──
    if (note.type === 'walk') {
      var wparts = [text(50, 36, 40, note.dir)];
      wparts.push(huiGlyph(note, 50, 52, 54));
      return '<svg class="jianzi jz-walk" viewBox="0 0 ' + W + ' ' + H +
        '" width="' + Math.round(sizePx * 0.78) + '" height="' + Math.round(sizePx * 0.78 * H / W) + '"' +
        ' role="img" aria-label="' + esc(label(note)) + '">' + wparts.join('') + '</svg>';
    }

    // ── 上半（0~62）──
    if (note.type === 'san') {
      parts.push(text(50, 15, 34, '艹'));
    } else {
      var lf = LEFT[note.left || '大'] || '大';
      parts.push(text(28, 17, 27, lf));
      parts.push(huiGlyph(note, 71, 1, 33));
    }
    if (note.type === 'fan') {
      if (note.fanMark) { // 泛音段首尾：泛起 / 泛止（竖排小红字）
        parts.push(text(9, 8, 11, '泛', 'jz-fan'));
        parts.push(text(9, 20, 11, note.fanMark, 'jz-fan'));
      } else {
        parts.push(text(9, 9, 13, '泛', 'jz-fan'));
      }
    }

    // ── 下半（62~150）：右手指法 + 弦号 ──
    var rGlyph = RIGHT[note.right || '挑'] || note.right || '?';
    if (UNSURE[note.right]) warn = true;
    var strGlyph = NUM[note.string] || '?';
    if (rGlyph === '勹') {
      // 勹包住弦号
      parts.push(text(50, 56, 50, '勹'));
      parts.push(text(51, 88, 24, strGlyph)); // 弦号在勹下方完整露出
    } else {
      parts.push(text(50, 55, rGlyph.length > 1 ? 28 : 44, rGlyph));
      parts.push(text(50, 92, strGlyph.length > 1 ? 19 : 26, strGlyph));
    }

    // ── 走音/装饰：右侧竖排小字（多字的缩小） ──
    (note.orn || []).forEach(function (o, i) {
      var g = ORN[o] || o;
      if (UNSURE[o]) warn = true;
      parts.push(text(92, 46 + i * 19, g.length > 1 ? 10 : 14, g, 'jz-orn'));
    });

    return '<svg class="jianzi' + (warn ? ' jz-unsure' : '') +
      '" viewBox="0 0 ' + W + ' ' + H + '" width="' + sizePx + '" height="' + (sizePx * H / W) + '"' +
      ' role="img" aria-label="' + esc(label(note)) + '">' +
      (opts.bare ? '' : '<rect x="1" y="1" width="98" height="110" rx="8" class="jz-box"/>') +
      parts.join('') + '</svg>';
  }

  // 文字描述（无障碍 + 提示用）："名指九徽 挑 四弦"
  function label(note) {
    if (note.type === 'walk') {
      return note.dir + '至' + NUM[note.hui] + '徽' + (note.fen ? NUM[note.fen] + '分' : '') + '（走音，不另弹）';
    }
    var s = '';
    if (note.type === 'san') s += '散音 ';
    else {
      s += (note.left || '大') + '指';
      s += note.waiwei ? '徽外 ' : (NUM[note.hui] + '徽' + (note.fen ? NUM[note.fen] + '分' : '') + ' ');
      if (note.type === 'fan') s = '泛音 ' + s;
    }
    s += (note.right || '挑') + NUM[note.string] + '弦';
    if (note.orn && note.orn.length) s += ' ' + note.orn.join('');
    return s;
  }

  var API = { render: render, label: label, NUM: NUM, RIGHT: RIGHT, LEFT: LEFT, ORN: ORN, UNSURE: UNSURE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.QinJianzi = API;
})(typeof window !== 'undefined' ? window : this);
