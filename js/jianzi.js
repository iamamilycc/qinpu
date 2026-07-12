/* ============================================================
 * 琴谱通 jianzi.js —— 减字 SVG 组字渲染
 *
 * 减字结构：上半 = 左手指法 + 徽位；下半 = 右手指法 + 弦号
 * Unicode 未收录减字，故用 SVG 把部件动态叠成一个"字"。
 *
 * 字形依据：用户琴书凡例谱字表（2026-07-12 三页照片+8张特写+用户手书确认）——
 *   八法：木抹 乚挑 勹勾 𠃓剔(手绘) 丁打 亐摘 乇托 尸劈(擘)
 *   组合：早撮 ⿱⺁早反撮 厂历 仑轮 半轮(龹加竖钩,手绘) 回打圆 癶拨 申剌 伏伏
 *   左手：卜绰 氵注 豆逗 立撞 隹进 艮退 白复 今吟 犭猱 方放 合合 奂唤
 *        冈罨 拙推出 乞掐起 多跪 尚淌
 *   标记：艹散 正泛止 ⿱⺈巳泛起 亻食指 卜徽外(本站正文沿用「外」)
 *   仍待定：索铃、掐撮三声(组合字)、带起、爪起、发一声 —— UNSURE 标记
 * ============================================================ */
(function (global) {
  'use strict';

  var NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'];

  var LEFT = { '大': '大', '食': '亻', '中': '中', '名': '夕', '跪': '多' };
  var RIGHT = {
    // 基本八法（谱字表核对：木乚勹𠃓丁亐乇尸）
    '挑': '乚', '抹': '木', '勾': '勹', '剔': '𠃓', '打': '丁', '摘': '亐',
    '托': '乇', '擘': '尸',
    // 组合指法（早撮/厂历/仑轮/回打圆 已按谱字表；锁滚拂类待特写）
    '撮': '早', '反撮': '反撮', '轮': '仑', '半轮': '半轮',
    '短锁': '短锁', '长锁': '长锁', '背锁': '背锁', '如一声': '如一',
    '双弹': '双', '蠲': '蠲', '历': '厂',
    '滚': '滚', '拂': '弗', '滚拂': '滚弗',
    '泼': '癶', '剌': '申', '泼剌': '癶申', '伏': '伏',
    '打圆': '回', '索铃': '索铃'
  };
  // 上下叠合的省文（谱字表：反撮=反字头+早）；半轮为手绘字（龹加竖钩），见 render
  var STACK = { '反撮': ['⺁', '早'] };
  var UNSURE = {
    '滚': 1, '拂': 1, '滚拂': 1, '短锁': 1, '长锁': 1, '背锁': 1,
    '如一声': 1, '双弹': 1, '蠲': 1,
    '索铃': 1,
    '双撞': 1, '往来': 1, '分开': 1,
    '掐起': 1, '带起': 1, '爪起': 1,
    '长吟': 1, '细吟': 1, '游吟': 1, '急吟': 1
  };
  var ORN = {
    '绰': '卜', '注': '氵', '吟': '今', '猱': '犭', '上': '上', '下': '下',
    '长吟': '长今', '细吟': '细今', '游吟': '游今', '急吟': '急今',
    '大猱': '大犭', '急猱': '急犭', '缓猱': '缓犭',
    '进复': '隹白', '退复': '艮白', '撞': '立', '双撞': '双立', '唤': '奂',
    '逗': '豆', '往来': '往来', '淌': '尚下', '分开': '分开',
    '罨': '冈', '虚罨': '虚冈', '掐起': '乞', '带起': '带起',
    '爪起': '爪巳', '推出': '拙', '放合': '方合'
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
      parts.push(text(50, 14, 36, '艹'));
    } else {
      var lf = LEFT[note.left || '大'] || '大';
      parts.push(text(28, 17, 27, lf));
      parts.push(huiGlyph(note, 71, 1, 33));
    }
    if (note.type === 'fan') {
      if (note.fanMark === '起') { // 谱字表：泛起省文＝⿱⺈巳
        parts.push(text(9, 6, 10, '⺈', 'jz-fan'));
        parts.push(text(9, 17, 12, '巳', 'jz-fan'));
      } else if (note.fanMark === '止') { // 谱字表：泛止省文＝正
        parts.push(text(9, 11, 14, '正', 'jz-fan'));
      } else {
        parts.push(text(9, 9, 13, '泛', 'jz-fan'));
      }
    }

    // ── 下半（62~150）：右手指法 + 弦号 ──
    var rGlyph = RIGHT[note.right || '挑'] || note.right || '?';
    if (UNSURE[note.right]) warn = true;
    var strGlyph = NUM[note.string] || '?';
    if (rGlyph === '勹') {
      // 规律②：弦号嵌在勹口内（谱书"芶一"式），勹放大避免钩画压字
      parts.push(text(52, 58, 62, '勹'));
      parts.push(text(44, 66, 21, strGlyph));
    } else if (rGlyph === '𠃓') {
      // 剔的省文 𠃓 属 Unicode 扩展B区、多数字体缺字，手绘笔画：横折钩＋两撇（谱字表字形）
      parts.push('<path d="M31 34 L69 34 L69 62 Q69 70 60 72" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>');
      parts.push('<path d="M55 40 L35 68 M65 42 L47 71" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>');
      parts.push(text(50, 92, 25, strGlyph));
    } else if (note.right === '半轮') {
      // 半轮省文非现行汉字（用户手书对照）：丷＋两横＋撇捺＋中竖钩（龹形加竖钩），手绘
      parts.push('<path d="M40 30 L44 38 M60 30 L56 38 M35 46 L65 46 M30 56 L70 56" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>');
      parts.push('<path d="M48 58 Q42 68 31 75 M52 58 Q58 68 69 75 M50 46 L50 80 Q50 86 43 84" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>');
      parts.push(text(50, 98, 21, strGlyph));
    } else if (STACK[note.right]) {
      // 上下叠合省文（反撮/半轮）
      var st = STACK[note.right];
      parts.push(text(50, 42, 24, st[0]));
      parts.push(text(50, 66, 28, st[1]));
      parts.push(text(50, 94, 20, strGlyph));
    } else {
      // 规律④：弦号紧贴指法部件，融合成一个字
      parts.push(text(50, 55, rGlyph.length > 1 ? 28 : 44, rGlyph));
      parts.push(text(50, 88, strGlyph.length > 1 ? 19 : 25, strGlyph));
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
