/* ============================================================
 * 琴谱通 jianzi.js —— 减字 SVG 组字渲染
 *
 * 减字结构：上半 = 左手指法 + 徽位；下半 = 右手指法 + 弦号
 * Unicode 未收录减字，故用 SVG 把部件动态叠成一个"字"。
 *
 * 组字方式：照 docs/减字组字文法.md 五大律，全部真字体部件——
 *   容器律（弦号写进指法怀里）：勹勾 乚挑 乇托 勹+冂剔 亠丷冂摘
 *   截取律（clipChar 裁真字）：束去撇捺剌 兴去中点蠲 衮上半滚 長上半长锁
 *        今去人吟 复上半(进复退复) 声下半(掐撮三声)
 *   叠合律（STACK/ORN_STACK）：北巛背锁 矢巛短锁 双单双弹 ⺈巳掐起
 *        爫巳爪起 巾巳带起 八开分开
 *   框架律：撮/反撮/掐撮三声＝日+大T，两臂记双音（note.cuo）
 *   其余单部件：木抹 丁打 尸劈 癶拨 厂历 犭猱 卜绰(翻转点朝上)
 *   字形依据：用户琴书凡例（三页+特写+手书六轮校正）+维基54图交叉验证
 *   仍待定：吟猱七细分写法 —— UNSURE 标记
 * ============================================================ */
(function (global) {
  'use strict';

  var NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'];

  var LEFT = { '大': '大', '食': '亻', '中': '中', '名': '夕', '跪': '⻊' };
  var RIGHT = {
    // 基本八法（谱字表核对：木乚勹𠃓丁亐乇尸）
    '挑': '乚', '抹': '木', '勾': '勹', '剔': '𠃓', '打': '丁', '摘': '亐',
    '托': '乇', '擘': '尸',
    // 组合指法（早撮/厂历/仑轮/回打圆 已按谱字表；锁滚拂类待特写）
    '撮': '早', '反撮': '反撮', '轮': '仑', '半轮': '半轮',
    '短锁': '短锁', '长锁': '长巛', '背锁': '背锁', '如一声': '如一',
    '双弹': '双弹', '蠲': '蠲', '历': '厂', // 背锁⿱北巛/短锁⿱矢巛/双弹⿱双单=叠合；蠲=兴去中点,手绘
    '滚': '玄', '拂': '弗', '滚拂': '玄弗',
    '泼': '癶', '拨': '癶', '剌': '剌', '泼剌': '泼剌', '伏': '伏', // 剌/泼剌手绘（束去撇捺），见 render
    '打圆': '打圆', '索铃': '索铃', '掐撮三声': '掐撮三声' // 三者均为手绘字，见 render
  };
  // 上下叠合的省文：反撮=反字头+早（谱字表）；背锁=北+巛、短锁=矢+巛（用户书证）；双弹=双+单（维基）
  var STACK = { '背锁': ['北', '巛'], '短锁': ['矢', '巛'], '双弹': ['双', '单'] };
  var UNSURE = { '长吟': 1, '细吟': 1, '游吟': 1, '急吟': 1 }; // 吟猱细分写法书与维基均未载
  var ORN = {
    '绰': '卜', '注': '氵', '吟': '今', '猱': '犭', '上': '上', '下': '下', '引': '弓',
    '长吟': '长今', '细吟': '细今', '游吟': '游今', '急吟': '急今',
    '大猱': '大犭', '急猱': '刍犭', '缓猱': '爰犭',
    '进复': '进复', '退复': '退复', '撞': '立', '双撞': '双立', '唤': '奂', // 进复/退复的复=复字上半,手绘
    '逗': '豆', '往来': '徕', '淌': '尚下', '分开': '分开',
    '罨': '罨', '虚罨': '虚罨', '掐起': '掐起', '带起': '带起', // 罨=冂框内人(人不冒头),手绘
    '爪起': '爪起', '推出': '拙', '放合': '方合'
  };
  // 上下叠排的小字省文：起字家族（巳=起+顶部手指部件，维基证）；分开=⿱八开（用户书证）
  var ORN_STACK = { '掐起': ['⺈', '巳'], '爪起': ['爫', '巳'], '带起': ['巾', '巳'], '分开': ['八', '开'] };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function text(x, y, size, str, cls) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size +
      '" text-anchor="middle" dominant-baseline="middle"' +
      (cls ? ' class="' + cls + '"' : '') + '>' + esc(str) + '</text>';
  }

  // ── 组字文法·工艺律：真字体裁剪（取现成汉字的一部分，不手绘笔画）──
  var CLIP_SEQ = 0;
  function rectPts(x1, y1, x2, y2) { return x1 + ',' + y1 + ' ' + x2 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' + x1 + ',' + y2; }
  function clipChar(ch, x, y, size, pts, cls) {
    var id = 'jzc' + (++CLIP_SEQ);
    return '<clipPath id="' + id + '"><polygon points="' + pts + '"/></clipPath>' +
      '<g clip-path="url(#' + id + ')">' + text(x, y, size, ch, cls) + '</g>';
  }

  // GlyphWiki 自由授权减字部件（js/glyphparts.js）；按真实笔迹包围盒归一缩放——
  // size 即笔迹最大边长，所有字形数学上严格等大。缺库时返回 null 走字体拼装兜底
  function gw(name, cx, cy, size, cls) {
    var lib = global.QIN_GLYPHS;
    if (!lib || !lib[name]) return null;
    var bb = (global.QIN_BB || {})[name];
    var sc, ox, oy;
    if (bb) {
      var bw = bb[2] - bb[0], bh = bb[3] - bb[1];
      sc = size / Math.max(bw, bh);
      ox = cx - (bb[0] + bw / 2) * sc;
      oy = cy - (bb[1] + bh / 2) * sc;
    } else { sc = size / 200; ox = cx - size / 2; oy = cy - size / 2; }
    var out = '<g' + (cls ? ' class="' + cls + '"' : '') + ' fill="currentColor" transform="translate(' +
      ox.toFixed(1) + ',' + oy.toFixed(1) + ') scale(' + sc.toFixed(4) + ')">';
    for (var i = 0; i < lib[name].length; i++) out += '<path d="' + lib[name][i] + '"/>';
    return out + '</g>';
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
      var GLf = note.left === '跪' ? gw('跪', 28, 17, 25) : null;
      if (GLf) parts.push(GLf);
      else parts.push(text(28, 17, 27, lf));
      parts.push(huiGlyph(note, 71, 1, 33));
    }
    if (note.type === 'fan') {
      var GF = note.fanMark === '起' ? gw('泛起', 10, 12, 18, 'jz-fan') :
               note.fanMark === '止' ? gw('泛止', 10, 11, 15, 'jz-fan') :
               gw('泛音', 10, 10, 13, 'jz-fan');
      if (GF) parts.push(GF);
      else if (note.fanMark === '起') { // 谱字表：泛起省文＝⿱⺈巳
        parts.push(text(9, 6, 10, '⺈', 'jz-fan'));
        parts.push(text(9, 17, 12, '巳', 'jz-fan'));
      } else if (note.fanMark === '止') { // 谱字表：泛止省文＝正
        parts.push(text(9, 11, 14, '正', 'jz-fan'));
      } else {
        parts.push(text(9, 9, 13, '泛', 'jz-fan'));
      }
    }

    // ── 下半：右手指法＋弦号（照 docs/减字组字文法.md 五大律组字）──
    var R = note.right || '挑';
    var rGlyph = RIGHT[R] || R || '?';
    if (UNSURE[R]) warn = true;
    var strGlyph = NUM[note.string] || '?';

    if (R === '勾') {
      // 容器律：弦号嵌在勹口内（芶一式）
      parts.push(text(52, 58, 62, '勹'));
      parts.push(text(44, 66, 21, strGlyph));
    } else if (R === '挑') {
      // 容器律：弦号写在乚内（弦号靠右避开竖画）
      parts.push(text(48, 56, 62, '乚'));
      parts.push(text(54, 52, 22, strGlyph));
    } else if (R === '托') {
      // 容器律：弦号写在乇的乚内
      parts.push(text(48, 54, 60, '乇'));
      parts.push(text(56, 68, 18, strGlyph));
    } else if (R === '剔') {
      // 剔（GlyphWiki 字形优先，弦号置于开口内；兜底：勹＋小冂拼装）
      var GTi = gw('剔', 52, 54, 56);
      if (GTi) { parts.push(GTi); parts.push(text(38, 74, 18, strGlyph)); }
      else {
        parts.push(text(54, 60, 56, '勹'));
        parts.push(text(28, 35, 14, '冂'));
        parts.push(text(47, 67, 19, strGlyph));
      }
    } else if (R === '摘') {
      // 摘（GlyphWiki 字形优先，弦号置于框口内；兜底：亠＋丷＋冂拼装）
      var GZh = gw('摘', 50, 54, 56);
      if (GZh) { parts.push(GZh); parts.push(text(42, 72, 17, strGlyph)); }
      else {
        parts.push(text(50, 33, 19, '亠'));
        parts.push(text(50, 43, 12, '丷'));
        parts.push(text(50, 63, 36, '冂'));
        parts.push(text(50, 66, 16, strGlyph));
      }
    } else if (R === '掐撮三声' && gw('掐撮三声', 50, 52, 58)) {
      // GlyphWiki 整字（爫＋早＋三 合体）
      parts.push(gw('掐撮三声', 50, 52, 58));
      parts.push(text(50, 96, 17, strGlyph));
    } else if (R === '撮' || R === '反撮' || R === '掐撮三声') {
      // 框架律：撮＝「早」减写为框架（GlyphWiki 专业字形），大T两臂记双音（左低右高）
      var topCh2 = R === '反撮' ? gw('反', 50, 21, 16) : R === '掐撮三声' ? text(50, 21, 17, '爫') : null;
      var yy = topCh2 ? 8 : 0;
      if (topCh2) parts.push(topCh2);
      var GZao = gw('早', 50, 44 + yy, topCh2 ? 46 : 54);
      if (GZao) parts.push(GZao);
      else {
        parts.push(text(50, 30 + yy, topCh2 ? 16 : 20, '日'));
        parts.push(text(50, 44 + yy, topCh2 ? 30 : 34, '一'));
        parts.push(text(50, 56 + yy, topCh2 ? 22 : 26, '丨'));
      }
      if (R === '掐撮三声') {
        parts.push(clipChar('声', 32, 72 + yy, 22, rectPts(20, 72 + yy, 44, 86 + yy)));
        parts.push(text(68, 77 + yy, 14, '三'));
      } else {
        var cuo = note.cuo || { lt: '勾', ls: 0, rt: '挑', rs: note.string };
        parts.push(text(29, 76 + yy, 20, cuo.lt === '勾' ? '勹' : '乚'));
        if (cuo.ls) parts.push(text(28, 92 + yy, 14, NUM[cuo.ls]));
        parts.push(text(71, 76 + yy, 20, cuo.rt === '托' ? '乇' : cuo.rt === '擘' ? '尸' : '乚'));
        parts.push(text(72, 92 + yy, 14, NUM[cuo.rs] || strGlyph));
      }
    } else if (R === '打圆') {
      // 打圆＝囗内丁（GlyphWiki 部件，兜底字体拼装）
      var GDy = gw('打圆', 50, 52, 56);
      if (GDy) parts.push(GDy);
      else { parts.push(text(50, 53, 54, '囗')); parts.push(text(50, 52, 24, '丁')); }
      parts.push(text(50, 94, 19, strGlyph));
    } else if (R === '轮') {
      // 輪右半去冂内艹（GlyphWiki 部件，兜底：人＋一＋冂）
      var GLun = gw('轮', 50, 52, 56);
      if (GLun) parts.push(GLun);
      else {
        parts.push(text(50, 34, 24, '人'));
        parts.push(text(50, 46, 22, '一'));
        parts.push(text(50, 62, 30, '冂'));
      }
      parts.push(text(50, 92, 19, strGlyph));
    } else if (R === '半轮') {
      // 半轮（GlyphWiki 字形优先；兜底：龹＋冂拼装）
      var GBl = gw('半轮', 50, 52, 56);
      if (GBl) parts.push(GBl);
      else { parts.push(text(50, 42, 38, '龹')); parts.push(text(50, 69, 24, '冂')); }
      parts.push(text(50, 94, 17, strGlyph));
    } else if (R === '索铃') {
      // 索铃（GlyphWiki xicheng 字形；兜底：十＋冖＋令拼装）
      var GSl = gw('索铃', 50, 52, 56);
      if (GSl) parts.push(GSl);
      else {
        parts.push(text(50, 29, 16, '十'));
        parts.push(text(50, 40, 24, '冖'));
        parts.push(text(50, 60, 26, '令'));
      }
      parts.push(text(50, 92, 18, strGlyph));
    } else if (R === '如一声') {
      // 女下紧加一（GlyphWiki 部件，兜底字体拼装）
      var GR = gw('如一声', 50, 52, 56);
      if (GR) parts.push(GR);
      else { parts.push(text(50, 42, 30, '女')); parts.push(text(50, 59, 26, '一')); }
      parts.push(text(50, 88, 19, strGlyph));
    } else if (R === '长锁') {
      // 长锁（GlyphWiki xicheng 字形＝镸＋巛；兜底：長上半裁剪＋巛）
      var GCs = gw('长锁', 50, 52, 56);
      if (GCs) parts.push(GCs);
      else {
        parts.push(clipChar('長', 50, 44, 40, rectPts(28, 24, 72, 44)));
        parts.push(text(50, 58, 20, '巛'));
      }
      parts.push(text(50, 88, 18, strGlyph));
    } else if (R === '滚' || R === '滚拂') {
      // 衮的上半部分（＋弗）——GlyphWiki 整字部件，兜底真字裁剪
      var gf = R === '滚拂';
      var GG = gw(gf ? '滚拂' : '滚', 50, 52, 56);
      if (GG) parts.push(GG);
      else {
        parts.push(clipChar('衮', 50, gf ? 40 : 52, gf ? 40 : 52, rectPts(22, gf ? 20 : 26, 78, gf ? 42 : 55)));
        if (gf) parts.push(text(50, 62, 28, '弗'));
      }
      parts.push(text(50, gf ? 94 : 88, 18, strGlyph));
    } else if (R === '剌' || R === '泼剌') {
      // 束去掉下面一撇一捺（GlyphWiki 部件，兜底真字裁剪）
      var po = R === '泼剌';
      var GL = gw(po ? '泼剌' : '剌', 50, 52, 56);
      if (GL) parts.push(GL);
      else {
        if (po) parts.push(text(50, 32, 22, '癶'));
        var cy = po ? 62 : 52, cs = po ? 40 : 54;
        var half = cs / 2, topY = cy - half, botY = cy + half, cutY = cy + cs * 0.1, aw = cs * 0.17;
        parts.push(clipChar('束', 50, cy, cs,
          (50 - half) + ',' + topY + ' ' + (50 + half) + ',' + topY + ' ' + (50 + half) + ',' + cutY + ' ' +
          (50 + aw) + ',' + cutY + ' ' + (50 + aw) + ',' + botY + ' ' + (50 - aw) + ',' + botY + ' ' +
          (50 - aw) + ',' + cutY + ' ' + (50 - half) + ',' + cutY));
      }
      parts.push(text(50, po ? 98 : 92, po ? 15 : 19, strGlyph));
    } else if (R === '蠲') {
      // 兴去掉上面中间一点（GlyphWiki 部件，兜底真字裁剪）
      var GJ = gw('蠲', 50, 52, 56);
      if (GJ) parts.push(GJ);
      else parts.push(clipChar('兴', 50, 52, 50, '25,27 44,27 44,43 56,43 56,27 75,27 75,80 25,80'));
      parts.push(text(50, 92, 18, strGlyph));
    } else if (STACK[R]) {
      // 叠合律：两部件上下相叠（背锁/短锁/双弹优先 GlyphWiki 整字）
      var GS = gw(R, 50, 52, 56);
      if (GS) parts.push(GS);
      else {
        var st = STACK[R];
        parts.push(text(50, 38, 26, st[0]));
        parts.push(text(50, 64, 30, st[1]));
      }
      parts.push(text(50, 92, 18, strGlyph));
    } else {
      // 一劳永逸总开关：GlyphWiki 库里有的一律优先；否则弦号贴写在指法正下方
      var GAny = gw(R, 50, 52, 56);
      if (GAny) parts.push(GAny);
      else parts.push(text(50, 54, rGlyph.length > 1 ? 34 : 58, rGlyph));
      parts.push(text(50, GAny ? 92 : 88, strGlyph.length > 1 ? 18 : GAny ? 19 : 25, strGlyph));
    }

    // ── 走音/装饰：右侧竖排小字（截取/叠合，全部真字体部件）──
    var GW_ORN = { '吟': '吟', '进复': '进复', '退复': '退复', '掐起': '掐起', '带起': '带起',
      '爪起': '爪起', '罨': '罨', '虚罨': '虚罨', '分开': '分开', '淌': '淌下', '往来': '往来', '放合': '放合' };
    (note.orn || []).forEach(function (o, i) {
      var y = 46 + i * 19;
      if (GW_ORN[o]) {
        var GO = gw(GW_ORN[o], 92, y, 15, 'jz-orn');
        if (GO) { parts.push(GO); return; }
      }
      if (o === '绰') {
        // 绰＝卜右点朝上（用户书证）：真字上下翻转
        parts.push('<g transform="translate(0,' + (2 * y) + ') scale(1,-1)">' + text(92, y, 14, '卜', 'jz-orn') + '</g>');
        return;
      }
      if (o === '吟') {
        // 截取律：今去人字头
        parts.push(clipChar('今', 92, y - 3, 22, rectPts(84, y - 1, 100, y + 10), 'jz-orn'));
        return;
      }
      if (o === '长吟' || o === '细吟' || o === '游吟' || o === '急吟') {
        if (UNSURE[o]) warn = true;
        var yPre = { '长吟': '镸', '急吟': '刍', '细吟': '细', '游吟': '游' }[o];
        parts.push(text(92, y - 6, 9, yPre, 'jz-orn'));
        var GYin = gw('吟', 92, y + 6, 11, 'jz-orn');
        if (GYin) parts.push(GYin);
        else parts.push(clipChar('今', 92, y + 3, 17, rectPts(84, y + 5, 100, y + 13), 'jz-orn'));
        return;
      }
      if (o === '进复' || o === '退复') {
        // 隹/艮＋复的上半部分
        parts.push(text(92, y - 6, 10, o === '进复' ? '隹' : '艮', 'jz-orn'));
        parts.push(clipChar('复', 92, y + 9, 19, rectPts(84, y, 100, y + 9), 'jz-orn'));
        return;
      }
      if (o === '罨') {
        // 冂内一个小人（人不冒头）
        parts.push(text(92, y, 16, '冂', 'jz-orn'));
        parts.push(text(92, y + 1, 8, '人', 'jz-orn'));
        return;
      }
      if (o === '虚罨') {
        parts.push(text(92, y - 6, 9, '虚', 'jz-orn'));
        parts.push(text(92, y + 7, 11, '冂', 'jz-orn'));
        parts.push(text(92, y + 8, 6, '人', 'jz-orn'));
        return;
      }
      if (ORN_STACK[o]) {
        parts.push(text(92, y - 5, 9, ORN_STACK[o][0], 'jz-orn'));
        parts.push(text(92, y + 6, 10, ORN_STACK[o][1], 'jz-orn'));
        return;
      }
      var g = ORN[o] || o;
      if (UNSURE[o]) warn = true;
      parts.push(text(92, y, g.length > 1 ? 10 : 14, g, 'jz-orn'));
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

  // 按名输出单个专业字形的独立 SVG（教程速查表用）；库缺时返回 null
  function part(name, sizePx) {
    sizePx = sizePx || 34;
    var g = gw(name, 50, 50, 86);
    if (!g) return null;
    return '<svg class="jianzi" viewBox="0 0 100 100" width="' + sizePx + '" height="' + sizePx + '" role="img" aria-label="' + esc(name) + '">' + g + '</svg>';
  }

  var API = { render: render, label: label, part: part, NUM: NUM, RIGHT: RIGHT, LEFT: LEFT, ORN: ORN, UNSURE: UNSURE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.QinJianzi = API;
})(typeof window !== 'undefined' ? window : this);
