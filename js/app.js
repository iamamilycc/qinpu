/* 琴谱通 app.js —— 界面逻辑（两个方向的转换 + 编辑） */
(function () {
  'use strict';
  var P = window.QinPitch, J = window.QinJianzi, S = window.QinStaff;
  var $ = function (id) { return document.getElementById(id); };

  // 通用三行列：简谱行 / 五线谱行 / 减字行
  function colHtml(jp, staff, jz, jpCls) {
    return '<div class="dp-col"><div class="dp-jp' + (jpCls ? ' ' + jpCls : '') + '">' + jp + '</div>' +
      '<div class="dp-staff">' + staff + '</div><div class="dp-jz">' + jz + '</div></div>';
  }

  /* ══════════ 标签页切换 ══════════ */
  window.switchTab = function (name) {
    ['j2p', 'p2j', 'tut', 'about'].forEach(function (t) {
      $('tab-' + t).classList.toggle('active', t === name);
      $('panel-' + t).style.display = (t === name) ? '' : 'none';
    });
  };

  /* ══════════ 方向一：减字谱 → 简谱 ══════════ */
  var scoreA = []; // [{kind:'note',note} | {kind:'bar'}]

  // 走音/技法勾选项（与 index.html 复选框 id 一一对应）
  var ORN_IDS = ['绰', '注', '吟', '猱', '上', '下', '进复', '退复', '撞', '双撞', '唤', '逗',
    '往来', '淌', '分开', '罨', '虚罨', '掐起', '带起', '爪起', '推出', '放合'];

  function currentNoteFromForm() {
    var type = $('selType').value;
    var note = {
      type: type,
      string: parseInt($('selString').value, 10),
      right: $('selRight').value,
      orn: []
    };
    if (type !== 'san') {
      note.left = $('selLeft').value;
      note.hui = parseInt($('selHui').value, 10);
      note.fen = parseInt($('selFen').value, 10) || 0;
      if (type === 'fan') note.fen = 0; // 泛音只在整徽
    }
    ORN_IDS.forEach(function (o) {
      var el = $('orn' + o);
      if (el && el.checked) note.orn.push(o);
    });
    return note;
  }


  /* ══════════ 文字减字谱解析（琴人口述格式，无需API）══════════
   * 支持："名九挑四" "大七六托五" "散勾一" "泛七挑一" "上九" "下七六"
   *       裸弦号=沿用上一指法（谱书"勾一 二 三"简省）；| 小节线；
   *       尾缀走音：绰注吟猱上下 */
  var CN_NUM = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12,'十三':13 };
  function cnNum(str) { return CN_NUM[str] || 0; }
  var RIGHT_NAMES = Object.keys(J.RIGHT).sort(function (a, b) { return b.length - a.length; });
  var ORN_NAMES = ['绰','注','吟','猱'];

  window.parseJzText = function () {
    var text = $('jzTextIn').value.trim();
    if (!text) { alert('请先粘贴文字减字谱，如：散勾一 勾二 挑三 | 名九挑四'); return; }
    var toks = text.split(/[\s，。、]+/).filter(Boolean);
    var errs = [], added = 0, prevNote = null;
    scoreA = [];
    toks.forEach(function (w0) {
      var w = w0.replace(/[弦徽指分]/g, '');
      if (w === '|' || w === '｜') { scoreA.push({ kind: 'bar' }); return; }
      // 尾缀走音
      var orn = [];
      var changed = true;
      while (changed) {
        changed = false;
        ORN_NAMES.forEach(function (o) {
          if (w.length > 1 && w.slice(-1) === o) { orn.unshift(o); w = w.slice(0, -1); changed = true; }
        });
      }
      // 上/下 + 徽位 = 走音（沿用上一音的弦）
      var mW = w.match(/^(上|下)(十三|十二|十一|[一二三四五六七八九十])([一二三四五六七八九])?$/);
      if (mW && prevNote && prevNote.string) {
        var wn = { type: 'walk', dir: mW[1], string: prevNote.string, hui: cnNum(mW[2]), fen: mW[3] ? cnNum(mW[3]) : 0 };
        scoreA.push({ kind: 'note', note: wn });
        prevNote = { string: prevNote.string };
        added++; return;
      }
      // 裸弦号 = 沿用上一指法（散音简省）
      var mBare = w.match(/^[一二三四五六七]$/);
      if (mBare && prevNote && prevNote.right) {
        var bn = { type: prevNote.type || 'san', string: cnNum(w), right: prevNote.right, orn: orn };
        if (bn.type !== 'san') { bn.left = prevNote.left; bn.hui = prevNote.hui; bn.fen = prevNote.fen; }
        scoreA.push({ kind: 'note', note: bn });
        prevNote = bn; added++; return;
      }
      // 常规减字：[泛|散]? [大食中名跪]? [徽][分]? [右手] [弦]
      var fan = /^泛/.test(w); if (fan) w = w.slice(1);
      var san = /^散/.test(w); if (san) w = w.slice(1);
      var rIdx = -1, rName = '';
      for (var i = 0; i < RIGHT_NAMES.length; i++) {
        var p = w.lastIndexOf(RIGHT_NAMES[i]);
        if (p > rIdx) { rIdx = p; rName = RIGHT_NAMES[i]; }
      }
      if (rIdx < 0) { errs.push(w0); return; }
      var leftPart = w.slice(0, rIdx);
      var strPart = w.slice(rIdx + rName.length);
      var mS = strPart.match(/^(十三|十二|十一|[一二三四五六七])$/);
      if (!mS) { errs.push(w0); return; }
      var note = { string: cnNum(mS[1]), right: rName, orn: orn };
      if (san || leftPart === '') {
        note.type = fan ? 'fan' : 'san';
        if (fan) { // 泛+徽："泛七挑一"
          var mF = leftPart.match(/^(十三|十二|十一|[一二三四五六七八九十])$/);
          note.hui = mF ? cnNum(mF[1]) : 7; note.fen = 0; note.left = '中';
        }
      } else {
        var mL = leftPart.match(/^(大|食|中|名|跪)?(十三|十二|十一|[一二三四五六七八九十])([一二三四五六七八九])?$/);
        if (!mL) { errs.push(w0); return; }
        note.type = fan ? 'fan' : 'an';
        note.left = mL[1] || (cnNum(mL[2]) >= 9 ? '名' : '大');
        note.hui = cnNum(mL[2]);
        note.fen = fan ? 0 : (mL[3] ? cnNum(mL[3]) : 0);
      }
      if (P.noteSemitone(note) === null || isNaN(P.noteSemitone(note))) { errs.push(w0 + '(无法发音)'); return; }
      scoreA.push({ kind: 'note', note: note });
      prevNote = note; added++;
    });
    renderScoreA();
    $('jzTextMsg').textContent = '已解析 ' + added + ' 个减字' +
      (errs.length ? '；未识别：' + errs.join('、') : '');
  };

  function noteJianpu(note) {
    var t = P.noteSemitone(note);
    if (t === null || isNaN(t)) return null;
    return P.semitoneToJianpu(t);
  }

  window.updatePreview = function () {
    var note = currentNoteFromForm();
    var jp = noteJianpu(note);
    $('previewBox').innerHTML = J.render(note, 88) +
      '<div class="pv-info">' + J.label(note) +
      (jp ? ' → 简谱 <b>' + jp.text + '</b>' : ' → <span class="warn">此位置无法发音</span>') + '</div>';
    // 泛音只能在整徽：切到泛音时禁用"分"
    $('selFen').disabled = ($('selType').value === 'fan');
    var isSan = ($('selType').value === 'san');
    $('selLeft').disabled = isSan; $('selHui').disabled = isSan;
    if (isSan) $('selFen').disabled = true;
  };

  window.addNote = function () {
    var note = currentNoteFromForm();
    if (noteJianpu(note) === null) { alert('此弦徽组合无法发音（按音须高于散音），请调整。'); return; }
    scoreA.push({ kind: 'note', note: note });
    renderScoreA();
  };
  window.addBarA = function () { scoreA.push({ kind: 'bar' }); renderScoreA(); };
  window.undoNote = function () { scoreA.pop(); renderScoreA(); };
  window.clearScoreA = function () { if (scoreA.length === 0 || confirm('清空整段谱？')) { scoreA = []; renderScoreA(); } };

  // 三行对照谱：简谱行 + 五线谱行 + 减字行
  function renderScoreA() {
    var jpLine = [], nNotes = 0;
    var html = '<div class="duipu">' + colHtml('', S.clefCell(), '');
    scoreA.forEach(function (it) {
      if (it.kind === 'bar') {
        jpLine.push('|');
        html += colHtml('<span class="jp-barline"></span>', S.barCell(false), '');
        return;
      }
      var n = it.note; nNotes++;
      var jp = noteJianpu(n), semi = P.noteSemitone(n);
      jpLine.push(jp ? jp.text : '?');
      var src = jp ? { deg: parseInt(jp.deg.replace('#', ''), 10), sharp: jp.deg.charAt(0) === '#', oct: jp.oct } : null;
      html += colHtml(
        src ? jpNoteHtml(src, false) : '<span class="jp-num">?</span>',
        S.cell([{ semi: semi }], {}),
        '<span class="jz-cell" title="' + J.label(n) + '">' + J.render(n, 44, { bare: true }) + '</span>');
    });
    html += '</div>';
    $('scoreA').innerHTML = scoreA.length ? html : '<div class="empty">尚未录入，用上方按钮拼出减字后点「添加」</div>';
    $('outJianpu').value = jpLine.join(' ');
    $('cntA').textContent = nNotes;
  }

  /* ══════════ 方向二：简谱 → 对照谱（简谱行＋减字行） ══════════
   * 记法：| 小节线   2/4 拍号   0 休止   - 延音
   *       1. 附点    1' 高八度  1, 低八度  #4 升半音
   *       连写如 12 = 八分音符组（下加横线），每个数字各配一个减字
   */
  var tokensB = [];   // 排版元素流
  var tieArcs = [];   // 连音线 [fromTi, toTi]
  var notesB = [];    // 扁平音符表 [{cands,pick,src}]，供点击切换

  function parseScore(text) {
    var toks = [], raw = text.trim().split(/\s+/);
    raw.forEach(function (w) {
      if (!w) return;
      if (w === '|' || w === '||') { toks.push({ kind: 'bar', fin: w === '||' }); return; }
      if (w === '|:') { toks.push({ kind: 'bar', rep: 'L' }); return; }
      if (w === ':|') { toks.push({ kind: 'bar', rep: 'R' }); return; }
      if (w === '/') { toks.push({ kind: 'br' }); return; }   // 手动换行
      if (w === '[1') { toks.push({ kind: 'volta', n: 1 }); return; }  // 1房
      if (w === '[2') { toks.push({ kind: 'volta', n: 2 }); return; }  // 2房
      if (w === ']') { toks.push({ kind: 'voltaEnd' }); return; }
      if (/^\d+\/\d+$/.test(w)) { toks.push({ kind: 'time', text: w }); return; }
      if (w === '-') { toks.push({ kind: 'dash' }); return; }
      var mT = w.match(/^(?:T|♩)=(\d+)$/);                       // 速度 T=60
      if (mT) { toks.push({ kind: 'tempo', bpm: parseInt(mT[1], 10) }); return; }
      var mR = w.match(/^0(_|=)?(\.)?$/);                        // 休止 0 / 0_ / 0=
      if (mR) { toks.push({ kind: 'rest', dotted: !!mR[2], unit: mR[1] === '=' ? 0.25 : mR[1] === '_' ? 0.5 : 1 }); return; }
      // 音符组：连写=八分组；= 十六分；_ 单八分；(555) 三连音；^ 延长号；
      // {3}5 倚音；5~ 连音线(与后一同音合并不再触弦)
      var grace = null;
      var mG = w.match(/^\{([^}]+)\}(.+)$/);
      if (mG) {
        grace = [];
        var gre = /([#b]?)([1-7])((?:'|,)*)/g, gm;
        while ((gm = gre.exec(mG[1])) !== null) {
          var go = 0;
          for (var gi2 = 0; gi2 < gm[3].length; gi2++) go += (gm[3][gi2] === "'" ? 1 : -1);
          grace.push({ deg: parseInt(gm[2], 10), sharp: gm[1] === '#' ? 1 : gm[1] === 'b' ? -1 : 0, oct: go });
        }
        w = mG[2];
      }
      var tie = /~/.test(w);
      var trip = /^\(/.test(w) && /\)/.test(w);
      var ferm = /\^/.test(w);
      var six = /=/.test(w);
      var eighth = /_/.test(w);
      var w2 = w.replace(/[_()=^~]/g, '');
      var group = [], re = /([#b]?)([1-7])((?:'|,)*)/g, m;
      var dotted = /\.$/.test(w2);
      while ((m = re.exec(w2)) !== null) {
        var oct = 0;
        for (var i = 0; i < m[3].length; i++) oct += (m[3][i] === "'" ? 1 : -1);
        group.push({ deg: parseInt(m[2], 10), sharp: m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0, oct: oct });
      }
      if (group.length) toks.push({
        kind: 'notes', group: group, dotted: dotted,
        beam: group.length > 1, eighth: eighth && group.length === 1,
        six: six, ferm: ferm, tie: tie, grace: grace,
        triplet: trip && group.length === 3
      });
    });
    return toks;
  }

  window.convertJianpu = function () {
    var toks = parseScore($('inJianpu').value);
    var nNotes = toks.reduce(function (a, t) { return a + (t.kind === 'notes' ? t.group.length : 0); }, 0);
    if (nNotes === 0) { alert('没有解析到音符。示例：2/4 1 1 1 1 | 2 1 2 12 | 3 3 3 3'); return; }
    tokensB = toks; notesB = [];
    var prev = null, prevHui = null, failed = [], barJustSeen = true, sanRun = 0;
    toks.forEach(function (t) {
      if (t.kind === 'br' || t.kind === 'tempo' || t.kind === 'volta' || t.kind === 'voltaEnd') return;
      if (t.kind === 'bar' || t.kind === 'time') { barJustSeen = true; return; }
      if (t.kind === 'dash') { // 延音：上一音是长音
        if (notesB.length) notesB[notesB.length - 1].long = true;
        return;
      }
      if (t.kind !== 'notes') return;
      t.refs = [];
      t.group.forEach(function (n, gi) {
        var semi = P.jianpuToSemitone(n.deg, n.sharp, n.oct);
        var cands = P.candidatesFor(semi, prev, {
          mStart: barJustSeen && gi === 0, prevHui: prevHui,
          profile: ARR_PROFILES[curArrProfile],
          fast: !!(t.beam || t.six || t.triplet),  // 人体力学：快句手来不及大跳
          sanRun: sanRun                            // 散音连用计数→散按相间
        });
        if (cands.length === 0) {
          failed.push(jpText(n));
          t.refs.push(-1);
          return;
        }
        prev = cands[0].string;
        prevHui = (cands[0].type === 'an') ? cands[0].hui : prevHui;
        sanRun = (cands[0].type === 'san') ? sanRun + 1 : 0;
        t.refs.push(notesB.length);
        notesB.push({
          cands: cands, pick: 0, src: n,
          mStart: gi === 0 && barJustSeen,
          beam: t.beam,
          dotted: t.dotted && gi === t.group.length - 1
        });
      });
      // 八分组内三连同音 → 轮（摘剔挑连作），标记组内序号
      if (t.beam && t.group.length === 3 &&
          t.group.every(function (g) { return g.deg === t.group[0].deg && g.oct === t.group[0].oct && g.sharp === t.group[0].sharp; })) {
        t.refs.forEach(function (r, k) { if (r !== -1) notesB[r].trip = k; });
      }
      barJustSeen = false;
    });
    if (notesB.length) notesB[notesB.length - 1].final = true;
    renderScoreB();
    $('convMsg').textContent = failed.length ?
      '⚠️ 以下音超出古琴正调音域（标红处）：' + failed.join(' ') : '';
  };


  /* ══════════ 编配画像：一首简谱 → 多版减字谱 ══════════
   * 对应琴学审美的可测代理：宏(广)=散音骨架铺得开；圆=按音走韵连贯；远=泛音清冷+留白 */
  var ARR_PROFILES = {
    hong: { name: '宏·散音骨架', san: 0.75, an: 1.25, fan: 1.15, walkMax: 2,
            pal: { low: ['托', '勾', '剔', '勾'], high: ['勾', '挑', '剔', '抹'] } },   // 厚重
    yuan2:{ name: '圆·走韵悠扬', san: 1.25, an: 0.85, fan: 1.05, walkMax: 3,
            pal: { low: ['勾', '抹', '托', '挑'], high: ['挑', '抹', '勾', '打'] } },   // 流畅
    yuan3:{ name: '远·泛音清冷', san: 1.1,  an: 1.05, fan: 0.5,  walkMax: 2,
            pal: { low: ['挑', '勾', '摘', '抹'], high: ['挑', '摘', '抹', '打'] } }    // 轻灵
  };
  var curArrProfile = 'yuan2';   // 默认：圆
  var curOrnDensity = 0.6;       // 韵味装饰密度 0.3淡/0.6中/0.9浓

  window.setArrProfile = function (id) {
    if (!ARR_PROFILES[id]) return;
    curArrProfile = id;
    if (tokensB.length) convertJianpu();
  };
  window.setOrnDensity = function (v) {
    curOrnDensity = parseFloat(v);
    if (tokensB.length) renderScoreB();
  };

  function candToNote(c, right, orn) {
    right = right || (c.string <= 3 ? '勾' : '挑');
    if (c.type === 'san') return { type: 'san', string: c.string, right: right, orn: orn || [] };
    // 左手选指惯例：九徽及以下把位用名指，七八徽高把位用大指；泛音习惯标中指
    var left = (c.type === 'fan') ? '中' : (c.hui >= 9) ? '名' : '大';
    return { type: c.type, string: c.string, hui: c.hui, fen: c.fen, waiwei: c.waiwei, left: left, right: right, orn: orn || [] };
  }

  /* 演奏法分配（琴人惯例，逐音扫一遍）：
   *  ① 句尾/延音长音 → 撮（双弦齐鸣结音）
   *  ② 同弦同音重复 → 勾剔/抹挑交替（模拟轮指）
   *  ③ 小节头的一二弦散音 → 托（大指起句）
   *  ④ 其余：一~三弦勾、四~七弦挑
   *  走音：按音上行加绰、下行加注（八分组除外）；附点/延音按音加吟 */
  function computePerform() {
    var prev = null, prevSemi = null, prevType = null, prevString = null, walkChain = 0;
    var rightRun = { name: '', n: 0 };   // 指法连用计数（防全曲一个指法）
    var palIdx = 0;                       // 调色板轮转游标
    notesB.forEach(function (it) {
      // 用户自定义弹法：全盘尊重，不做任何自动分配
      if (it.custom) {
        it.walk = null; it.walkAvail = null;
        it.right = it.custom.right; it.orn = it.custom.orn || [];
        prevType = it.custom.type; prevString = it.custom.string;
        prevSemi = P.noteSemitone(it.custom);
        prev = { string: it.custom.string, right: it.custom.right };
        walkChain = 0;
        return;
      }
      var c = it.cands[it.pick];
      var target = P.jianpuToSemitone(it.src.deg, it.src.sharp, it.src.oct);
      // ── 走音判定（古琴"一弹多音"）：上一音是同弦按音/走音，音程≤大三度
      //    → 本音由左手上/下滑到位，右手不另弹（谱记小字"上/下+徽位"）
      it.walkAvail = null; it.walk = null;
      if (it.trip === undefined && !it.long && !it.final &&
          (prevType === 'an' || prevType === 'walk') && walkChain < (ARR_PROFILES[curArrProfile].walkMax || 3) &&
          prevSemi !== null && Math.abs(target - prevSemi) <= 4 && Math.abs(target - prevSemi) > 0.01) {
        var wpos = P.findPosition(prevString, target);
        if (wpos && !wpos.waiwei && wpos.hui >= 5) {
          it.walkAvail = { dir: target > prevSemi ? '上' : '下', string: prevString, hui: wpos.hui, fen: wpos.fen };
        }
      }
      if (it.walkAvail && !it.noWalk && it.pick === 0) {
        it.walk = it.walkAvail;
        walkChain++;
        it.right = null; it.orn = [];
        prevType = 'walk'; prevString = it.walk.string; prevSemi = target;
        return;
      }
      walkChain = 0;
      var semi = P.noteSemitone(candToNote(c));
      var right, orn = [];
      if (it.trip !== undefined) {
        right = ['摘', '剔', '挑'][it.trip];       // 三连同音 = 轮的拆解
      } else if (it.final || it.long) {
        right = '撮';
      } else if (prev && prev.string === c.string && prevSemi !== null && Math.abs(prevSemi - semi) < 0.01) {
        right = (prev.right === '勾') ? '剔' :
                (prev.right === '剔') ? '勾' :
                (prev.right === '托') ? '擘' :
                (prev.right === '擘') ? '托' :
                (prev.right === '挑') ? '抹' : '挑';
      } else if (it.mStart && c.type === 'san' && c.string <= 2) {
        right = '托';
      } else {
        // 画像专属指法调色板轮转：同曲风内八法循环上手，不再勾挑包场
        var pal = ARR_PROFILES[curArrProfile].pal;
        var row = c.string <= 3 ? pal.low : pal.high;
        right = row[palIdx % row.length];
        palIdx++;
      }
      if (c.type === 'an' && !it.beam && prevSemi !== null && curOrnDensity >= 0.4) {
        if (semi > prevSemi + 0.5) orn.push('绰');
        else if (semi < prevSemi - 0.5) orn.push('注');
      }
      // 韵味装饰随密度：附点加吟；延音加猱；浓档普通长按音也吟
      if (c.type === 'an' && !it.final) {
        if (it.long && curOrnDensity >= 0.35) orn.push('猱');
        else if (it.dotted && curOrnDensity >= 0.35) orn.push('吟');
        else if (!it.beam && curOrnDensity >= 0.85 && orn.length === 0) orn.push('吟');
      }
      // 指法防单调：同一右手指法连用3次即换成对指法（挑↔抹 勾↔剔 托↔擘 打↔摘）
      var PAIR = { '挑': '抹', '抹': '挑', '勾': '剔', '剔': '勾', '托': '擘', '擘': '托', '打': '摘', '摘': '打' };
      if (PAIR[right] && rightRun.name === right && rightRun.n >= 2) {
        right = PAIR[right];
      }
      if (rightRun.name === right) rightRun.n++; else rightRun = { name: right, n: 1 };
      it.right = right; it.orn = orn;
      prev = { string: c.string, right: right };
      prevType = c.type; prevString = c.string;
      prevSemi = semi;
    });
    // 连续泛音段：首标「泛起」尾标「泛止」（单个泛音只标「泛」）
    var runStart = -1;
    for (var i = 0; i <= notesB.length; i++) {
      var isFan = i < notesB.length && !notesB[i].walk && notesB[i].cands[notesB[i].pick].type === 'fan';
      if (isFan) { notesB[i].fanMark = null; if (runStart < 0) runStart = i; }
      else if (runStart >= 0) {
        if (i - runStart >= 2) { notesB[runStart].fanMark = '起'; notesB[i - 1].fanMark = '止'; }
        runStart = -1;
      }
    }
  }

  /* 点击减字 → 弹出全部弹法菜单供选择 */
  function closeCandMenu() {
    var m = $('candMenu'); if (m) m.remove();
    var e2 = $('custEditor'); if (e2) e2.remove();
  }
  document.addEventListener('click', closeCandMenu);

  /* ══════════ 自定义弹法编辑器 ══════════
   * 候选弹法都不合意时，用户自己拼一个（含音高校验，不符也可保存）*/
  var CUST_ORNS = ['绰', '注', '吟', '猱', '上', '下'];
  window.showCustomEditor = function (ref, anchorRect) {
    closeCandMenu();
    var it = notesB[ref];
    var target = P.jianpuToSemitone(it.src.deg, it.src.sharp, it.src.oct);
    var cur = it.custom || null;
    var box = document.createElement('div');
    box.id = 'custEditor'; box.className = 'cand-menu cust-editor';
    box.onclick = function (e) { e.stopPropagation(); };
    var rightOpts = Object.keys(J.RIGHT).map(function (r) {
      return '<option value="' + r + '"' + (cur && cur.right === r ? ' selected' : '') + '>' + r + '</option>';
    }).join('');
    var numOpt = function (n, sel) {
      var o = '';
      for (var i = 1; i <= n; i++) o += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + J.NUM[i] + '</option>';
      return o;
    };
    var fenOpt = function (sel) {
      var o = '<option value="0"' + (!sel ? ' selected' : '') + '>整徽</option>';
      for (var i = 1; i <= 9; i++) o += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + J.NUM[i] + '分</option>';
      return o;
    };
    box.innerHTML =
      '<div class="cand-head">自定义弹法（谱面音：' + jpText(it.src) + '）</div>' +
      '<div class="cust-grid">' +
      '<label>音色<select id="custType">' +
        '<option value="san"' + (cur && cur.type === 'san' ? ' selected' : '') + '>散音</option>' +
        '<option value="an"' + (!cur || cur.type === 'an' ? ' selected' : '') + '>按音</option>' +
        '<option value="fan"' + (cur && cur.type === 'fan' ? ' selected' : '') + '>泛音</option></select></label>' +
      '<label>弦<select id="custStr">' + numOpt(7, cur ? cur.string : 4) + '</select></label>' +
      '<label>左手<select id="custLeft">' +
        ['大', '食', '中', '名', '跪'].map(function (l) {
          var sel = cur ? cur.left === l : l === '名';
          return '<option' + (sel ? ' selected' : '') + '>' + l + '</option>';
        }).join('') + '</select></label>' +
      '<label>徽位<select id="custHui">' + numOpt(13, cur && cur.hui ? cur.hui : 9) + '</select></label>' +
      '<label>徽分<select id="custFen">' + fenOpt(cur ? cur.fen : 0) + '</select></label>' +
      '<label>右手<select id="custRight">' + rightOpts + '</select></label>' +
      '</div>' +
      '<div class="cust-orns">走音：' + CUST_ORNS.map(function (o) {
        var ck = cur && cur.orn && cur.orn.indexOf(o) >= 0 ? ' checked' : '';
        return '<label class="chk"><input type="checkbox" class="custOrn" value="' + o + '"' + ck + '>' + o + '</label>';
      }).join('') + '</div>' +
      '<div id="custPv" class="cust-pv"></div>' +
      '<div class="btn-row" style="margin-top:6px">' +
      '<button class="primary" id="custSave">✔ 使用此弹法</button>' +
      (it.custom ? '<button id="custClear">↩ 恢复自动</button>' : '') +
      '<button id="custCancel">取消</button></div>';
    document.body.appendChild(box);
    box.style.left = Math.max(6, Math.min(window.innerWidth - box.offsetWidth - 10, anchorRect.left)) + 'px';
    box.style.top = (anchorRect.bottom + window.scrollY + 4) + 'px';

    function readNote() {
      var type = $('custType').value;
      var n = { type: type, string: parseInt($('custStr').value, 10), right: $('custRight').value, orn: [] };
      if (type !== 'san') {
        n.left = $('custLeft').value;
        n.hui = parseInt($('custHui').value, 10);
        n.fen = type === 'fan' ? 0 : parseInt($('custFen').value, 10);
      }
      box.querySelectorAll('.custOrn:checked').forEach(function (c) { n.orn.push(c.value); });
      return n;
    }
    function refresh() {
      var n = readNote();
      var sm = P.noteSemitone(n);
      var ok = (sm !== null && !isNaN(sm));
      var match = ok && Math.abs(Math.round(sm) - target) < 0.5;
      $('custPv').innerHTML = J.render(n, 58) + '<div class="pv-info">' + J.label(n) +
        (ok ? (match ? '　<b style="color:#2c7a2c">✓ 音高相符</b>'
                     : '　<b class="warn">⚠ 音高不符（差 ' + (Math.round(sm) - target) + ' 半音）</b>')
            : '　<b class="warn">⚠ 此位置无法发音</b>') + '</div>';
      var isSan = $('custType').value === 'san';
      $('custLeft').disabled = isSan; $('custHui').disabled = isSan;
      $('custFen').disabled = isSan || $('custType').value === 'fan';
    }
    box.querySelectorAll('select,.custOrn').forEach(function (el) { el.addEventListener('change', refresh); });
    refresh();
    $('custSave').onclick = function (e) {
      e.stopPropagation();
      var n = readNote();
      var sm = P.noteSemitone(n);
      if (sm === null || isNaN(sm)) { alert('此弦徽组合无法发音，请调整。'); return; }
      it.custom = n; it.noWalk = true;
      closeCandMenu(); renderScoreB();
      window.QinAudio.playSeq([{ t: 0, semi: sm, col: null, orn: n.orn, right: n.right, ntype: n.type }], null);
    };
    var cc = $('custClear');
    if (cc) cc.onclick = function (e) { e.stopPropagation(); it.custom = null; it.noWalk = false; closeCandMenu(); renderScoreB(); };
    $('custCancel').onclick = function (e) { e.stopPropagation(); closeCandMenu(); };
  };

  window.showCands = function (ref, ev) {
    ev.stopPropagation();
    closeCandMenu();
    var it = notesB[ref];
    var menu = document.createElement('div');
    menu.id = 'candMenu'; menu.className = 'cand-menu';
    var head = document.createElement('div');
    head.className = 'cand-head';
    var total = it.cands.length + (it.walkAvail ? 1 : 0);
    head.textContent = total > 1 ? ('此音共 ' + total + ' 种弹法：') : '此音只有一种弹法：';
    menu.appendChild(head);
    // 走音选项（若上一音同弦可滑到位）
    if (it.walkAvail) {
      var wNote = { type: 'walk', dir: it.walkAvail.dir, string: it.walkAvail.string, hui: it.walkAvail.hui, fen: it.walkAvail.fen };
      var wd = document.createElement('div');
      wd.className = 'cand-item' + (it.walk ? ' sel' : '');
      wd.innerHTML = J.render(wNote, 38, { bare: true }) +
        '<span>' + J.label(wNote) + (it.walk ? '　✓ 当前' : '') + '</span>';
      wd.onclick = function (e) {
        e.stopPropagation();
        it.noWalk = false; it.pick = 0;
        closeCandMenu();
        renderScoreB();
      };
      menu.appendChild(wd);
    }
    it.cands.forEach(function (c, i) {
      var note = candToNote(c, it.right, it.orn);
      var d = document.createElement('div');
      var isCur = (i === it.pick && !it.walk && !it.custom);
      d.className = 'cand-item' + (isCur ? ' sel' : '');
      d.innerHTML = J.render(note, 38, { bare: true }) +
        '<span>' + J.label(note) + (isCur ? '　✓ 当前' : '') + '</span>';
      d.onclick = function (e) {
        e.stopPropagation();
        it.pick = i;
        it.noWalk = true; // 明确选了拨弦弹法 → 不再自动走音
        it.custom = null; // 选回候选即清除自定义
        closeCandMenu();
        renderScoreB(); // 重排会按新弹法重算全谱指法惯例
        var pn = candToNote(it.cands[i]);
        window.QinAudio.playSeq([{ t: 0, semi: P.noteSemitone(pn), col: null, orn: it.orn, right: pn.right, ntype: pn.type }], null);
      };
      menu.appendChild(d);
    });
    // 已有自定义 → 显示为当前项
    if (it.custom) {
      var cd = document.createElement('div');
      cd.className = 'cand-item sel';
      cd.innerHTML = J.render(it.custom, 38, { bare: true }) +
        '<span>' + J.label(it.custom) + '（自定义）　✓ 当前</span>';
      var _r0 = null;
      cd.onclick = function (e) { e.stopPropagation(); window.showCustomEditor(ref, _rectOf()); };
      menu.appendChild(cd);
    }
    // 底部：自定义入口
    var add = document.createElement('div');
    add.className = 'cand-item cand-add';
    add.innerHTML = '<span>➕ 都不合适？自定义弹法…</span>';
    var _anchor = ev.currentTarget.getBoundingClientRect();
    function _rectOf() { return _anchor; }
    add.onclick = function (e) { e.stopPropagation(); window.showCustomEditor(ref, _anchor); };
    menu.appendChild(add);
    document.body.appendChild(menu);
    var r = ev.currentTarget.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(window.innerWidth - menu.offsetWidth - 10, r.left)) + 'px';
    menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
  };

  function jpText(n) { return (n.sharp === 1 ? '#' : n.sharp === -1 ? 'b' : '') + n.deg; }

  // 简谱音符 HTML：上八度点(+泛音圈) / [↗↘走音箭头]数字(+附点) / 下八度点
  function jpNoteHtml(n, dotted, pre, fanCirc) {
    var top = (fanCirc ? '<i class="fan-circ">○</i>' : '') +
      (n.oct > 0 ? new Array(n.oct + 1).join('<i class="odot">·</i>') : '');
    var bot = n.oct < 0 ? new Array(-n.oct + 1).join('<i class="odot">·</i>') : '';
    return '<span class="jp-note"><span class="od-top">' + top + '</span>' +
      '<span class="jp-num">' + (pre ? '<i class="jp-pre">' + pre + '</i>' : '') +
      (n.sharp === 1 ? '<i class="sharp">♯</i>' : n.sharp === -1 ? '<i class="sharp">♭</i>' : '') + n.deg +
      (dotted ? '<i class="pdot">·</i>' : '') + '</span>' +
      '<span class="od-bot">' + bot + '</span></span>';
  }

  // 该音的简谱行前缀记号：走音→⌒上/下箭头；绰→↗ 注→↘
  function jpPre(it) {
    if (it.walk) return ''; // 走音由真弧线表达
    if (it.orn && it.orn.indexOf('绰') >= 0) return '↗';
    if (it.orn && it.orn.indexOf('注') >= 0) return '↘';
    return '';
  }

  function renderScoreB() {
    if (tokensB.length === 0) {
      $('scoreB').innerHTML = '<div class="empty">输入简谱后点「转换」</div>'; return;
    }
    computePerform();
    tieArcs = []; var lastTieFrom = null;
    // ── 分行（仿谱书按乐句排行）：显式 / 换行；无 / 时每 4 小节自动换行 ──
    var lines = [], cur = [], barCount = 0;
    var hasBr = tokensB.some(function (t) { return t.kind === 'br'; });
    tokensB.forEach(function (t, ti) {
      if (t.kind === 'br') { if (cur.length) { lines.push(cur); cur = []; } return; }
      cur.push([t, ti]);
      if (!hasBr && t.kind === 'bar' && !t.fin) {
        barCount++;
        if (barCount % 4 === 0) { lines.push(cur); cur = []; }
      }
    });
    if (cur.length) lines.push(cur);

    var html = '';
    var prevPk = null; // 谱书简省惯例：连续同指法散音，后字只写弦号（如"勾一 二 三"）
    lines.forEach(function (line) {
      prevPk = null; // 行首恢复全字
      html += '<div class="duipu">' + colHtml('', S.clefCell(), ''); // 每行行首谱号
      line.forEach(function (pair) {
        var t = pair[0], ti = pair[1];
        if (t.kind === 'bar') {
          var jpBar = (t.rep === 'L' ? '<span class="rep-dots">:</span>' : '') +
            '<span class="jp-barline' + (t.fin || t.rep ? ' fin' : '') + '"></span>' +
            (t.rep === 'R' ? '<span class="rep-dots">:</span>' : '');
          if (t.rep === 'L') jpBar = '<span class="jp-barline fin"></span><span class="rep-dots">:</span>';
          html += colHtml(jpBar, S.barCell(t.fin || !!t.rep, t.rep), ''); return;
        }
        if (t.kind === 'time') {
          var p = t.text.split('/');
          html += colHtml('<span class="jp-time"><span>' + p[0] + '</span><span>' + p[1] + '</span></span>',
            S.timeCell(p[0], p[1]), ''); return;
        }
        if (t.kind === 'dash') { html += colHtml('<span class="jp-num">–</span>', S.padCell(false), ''); return; }
        if (t.kind === 'tempo') { html += colHtml('<span class="jp-tempo">♩=' + t.bpm + '</span>', S.padCell(false), ''); return; }
        if (t.kind === 'volta') { html += colHtml('<span class="volta-chip">' + t.n + '.</span>', S.padCell(false), ''); return; }
        if (t.kind === 'voltaEnd') { return; }
        if (t.kind === 'rest') {
          var rCls = t.unit === 0.25 ? 'beam beam16' : t.unit === 0.5 ? 'beam' : '';
          html += colHtml('<span class="jp-num">0' + (t.dotted ? '·' : '') + '</span>', S.padCell(true), '', rCls); return;
        }
        // notes 组
        var jpRow = '', jzRow = '', stn = [];
        if (lastTieFrom !== null) { tieArcs.push([lastTieFrom, ti]); lastTieFrom = null; }
        if (t.tie) lastTieFrom = ti;
        // 倚音：简谱小音符 + 自动配的小减字
        if (t.grace) {
          t.grace.forEach(function (g) {
            jpRow += '<i class="grace">' + jpText(g) + '</i>';
            var gs = P.jianpuToSemitone(g.deg, g.sharp, g.oct);
            var gc = P.candidatesFor(gs, null);
            if (gc.length) jzRow += '<span class="jz-grace">' + J.render(candToNote(gc[0]), 24, { bare: true }) + '</span>';
          });
        }
        t.group.forEach(function (n, gi) {
          var ref = t.refs[gi];
          var lastInGroup = (gi === t.group.length - 1);
          if (ref === -1) {
            jpRow += jpNoteHtml(n, t.dotted && lastInGroup, '', false);
            jzRow += '<span class="jz-miss" title="超出正调音域">×</span>';
          } else {
            var it = notesB[ref];
            var c = it.cands[it.pick];
            var note;
            if (it.custom) {
              note = it.custom;
              stn.push({ semi: P.noteSemitone(note), dotted: t.dotted && lastInGroup });
            } else if (it.walk) {
              note = { type: 'walk', dir: it.walk.dir, string: it.walk.string, hui: it.walk.hui, fen: it.walk.fen };
              stn.push({ semi: P.anSemitone(it.walk.string, it.walk.hui, it.walk.fen), dotted: t.dotted && lastInGroup });
            } else {
              note = candToNote(c, it.right, it.orn);
              if (it.fanMark) note.fanMark = it.fanMark;
              stn.push({ semi: P.noteSemitone(note), dotted: t.dotted && lastInGroup });
            }
            jpRow += jpNoteHtml(n, t.dotted && lastInGroup, jpPre(it), !it.walk && c.type === 'fan');
            var tip = J.label(note) + (it.custom ? '（自定义弹法，点击可改）' : '（点击查看全部弹法）');
            // 谱书简省：连续同指法的散音（无走音无装饰）→ 只写弦号
            var plainSan = !it.walk && note.type === 'san' && (!note.orn || !note.orn.length) && !note.fanMark;
            if (plainSan && prevPk && prevPk.right === note.right) {
              jzRow += '<span class="jz-cell jz-abbr" onclick="showCands(' + ref + ',event)" title="同前指法·' + tip + '">' +
                '<span class="abbr-num">' + J.NUM[note.string] + '</span></span>';
            } else {
              jzRow += '<span class="jz-cell" onclick="showCands(' + ref + ',event)" title="' + tip + '">' +
                J.render(note, t.beam ? 34 : 44, { bare: true }) + '</span>';
            }
            prevPk = it.walk ? null : (plainSan ? { right: note.right } : null);
          }
        });
        if (t.triplet) jpRow = '<i class="trip3">3</i>' + jpRow; // 三连音标记
        if (t.ferm) jpRow = '<i class="ferm">𝄐</i>' + jpRow;      // 延长号
        var jpCls = (t.beam || t.eighth || t.six) ? 'beam' : '';
        if (t.six) jpCls += ' beam16';
        if (t.triplet) jpCls += ' has-trip';
        html += '<div class="dp-col" data-col="' + ti + '"><div class="dp-jp' + (jpCls ? ' ' + jpCls : '') + '">' + jpRow + '</div>' +
          '<div class="dp-staff">' + (stn.length ? S.cell(stn, { beam: t.beam, eighth: t.eighth, six: t.six }) : S.padCell(false)) + '</div>' +
          '<div class="dp-jz">' + jzRow + '</div></div>';
      });
      html += '</div>';
    });
    $('scoreB').innerHTML = html;
    drawWalkArcs();
  }

  /* 走音真弧线（仿谱书：弧线+箭头跨在前音与走音之间） */
  function drawWalkArcs() {
    var NS = 'http://www.w3.org/2000/svg';
    document.querySelectorAll('#scoreB .duipu').forEach(function (duipu) {
      var old = duipu.querySelector('.arc-layer');
      if (old) old.remove();
      var dRect = duipu.getBoundingClientRect();
      if (!dRect.width) return;
      var layer = document.createElementNS(NS, 'svg');
      layer.setAttribute('class', 'arc-layer');
      layer.setAttribute('width', dRect.width);
      layer.setAttribute('height', dRect.height);
      var lastNoteJp = null;
      duipu.querySelectorAll('.dp-col').forEach(function (col) {
        var jp = col.querySelector('.dp-jp');
        var hasNote = col.querySelector('.jz-cell') || col.querySelector('.jz-miss');
        var isWalk = col.querySelector('.jz-walk');
        if (isWalk && lastNoteJp) {
          var r1 = lastNoteJp.getBoundingClientRect();
          var r2 = jp.getBoundingClientRect();
          var x1 = r1.left + r1.width / 2 - dRect.left;
          var x2 = r2.left + r2.width / 2 - dRect.left;
          var y = Math.min(r1.top, r2.top) - dRect.top - 2;
          var lift = Math.min(15, (x2 - x1) * 0.3 + 6);
          var path = document.createElementNS(NS, 'path');
          path.setAttribute('d', 'M' + x1 + ' ' + y + ' Q' + ((x1 + x2) / 2) + ' ' + (y - lift) + ' ' + x2 + ' ' + y);
          path.setAttribute('class', 'arc-path');
          layer.appendChild(path);
          var head = document.createElementNS(NS, 'path');
          head.setAttribute('d', 'M' + (x2 - 5) + ' ' + (y - 4) + ' L' + (x2 + 0.5) + ' ' + y + ' L' + (x2 - 5.5) + ' ' + (y + 1.5) + ' Z');
          head.setAttribute('class', 'arc-head');
          layer.appendChild(head);
        }
        if (hasNote) lastNoteJp = jp;
      });
      // 连音线（同一行内，平弧无箭头）
      tieArcs.forEach(function (pr) {
        var c1 = duipu.querySelector('.dp-col[data-col="' + pr[0] + '"]');
        var c2 = duipu.querySelector('.dp-col[data-col="' + pr[1] + '"]');
        if (!c1 || !c2) return;
        var r1 = c1.querySelector('.dp-jp').getBoundingClientRect();
        var r2 = c2.querySelector('.dp-jp').getBoundingClientRect();
        var x1 = r1.left + r1.width / 2 - dRect.left;
        var x2 = r2.left + r2.width / 2 - dRect.left;
        var y = Math.min(r1.top, r2.top) - dRect.top - 2;
        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', 'M' + x1 + ' ' + y + ' Q' + ((x1 + x2) / 2) + ' ' + (y - Math.min(12, (x2 - x1) * 0.25 + 5)) + ' ' + x2 + ' ' + y);
        path.setAttribute('class', 'arc-path arc-tie');
        layer.appendChild(path);
      });
      duipu.appendChild(layer);
    });
  }
  window.addEventListener('resize', function () { drawWalkArcs(); });

  /* ══════════ 示例（正调 1=F）══════════ */
  window.loadDemo = function () {
    $('inJianpu').value =
      "2/4 1 1 1 1 | 2 1 2 12 | 3 3 3 3 | 5 6 5 3 | 5 323 26 | " +
      "3/4 2. 1_ 2 1 | 2. 1_ 2 12 | 3. 6,_ 2 6, | 2/4 1. 5,_ | 3' 5' 6' ||";
    convertJianpu();
  };
  // 《关山月》全曲（梅庵琴谱·查阜西演奏谱；前两段与用户琴书核对一致，
  // 后四段按网络查阜西谱转写——八度与个别时值待与原书二页核对；
  // 原谱四个十六分连音暂以两组八分近似）
  window.loadDemo2 = function () {
    $('inJianpu').value =
      "2/4 |: 5,. 6,_ 1 1 | 1. 2_ | 5 (555) 6 2 | 5 - / " +
      "1' 2' 2' 1'6 5 5 | 2'. 3'_ 5' 5' | 1'. 6_ 1' 6 | 5 1' 6 5 | 5 3 5 / " +
      "5 (666) 5 (666) | 5. 3_ 2. 3_ | 5 5 | 1' (666) 51' 65 / " +
      "53 2222= | 2 5 3. 2_ | 1 1 | 6 2222= | 1. 2_ 16 / " +
      "51' 65 | 53 2222= | 2 5 3. 2_ | 1 1 / " +
      "5,. 6,_ 1 1 | 1. 2_ | 5 (555) 5 6 | 2. 3_ 21 1 | 1 2 3 5 :| 1 - ||";
    convertJianpu();
  };



  /* ══════════ 打谱风格：减字谱无节奏，给出多种机器演绎（参考，非传承打谱）══════════ */
  var DAPU_STYLES = {
    yun:  { name: '匀速吟诵', bpm: 56, pat: [1],                          end: 2   },
    ge:   { name: '琴歌韵',   bpm: 63, pat: [1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1.5], end: 2 },
    san:  { name: '散板古意', bpm: 44, pat: [1.4, 0.8, 1.1, 0.7, 1.6, 0.9], end: 2.6 },
    qing: { name: '轻快',     bpm: 86, pat: [0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 1], end: 1.5 }
  };

  window.playStyle = function (id) {
    var st = DAPU_STYLES[id];
    if (!st) return;
    var items = scoreA.filter(function (x) { return x.kind === 'note'; });
    if (!items.length) { alert('谱面还是空的：先粘贴文字减字谱解析，或点选录入。'); return; }
    var spb = 60 / st.bpm;
    var ev = [], t = 0, pi = 0, lastSemi = null;
    scoreA.forEach(function (it, idx) {
      if (it.kind === 'bar') { pi = 0; return; }
      if (it.kind !== 'note') return;
      // 句读：小节线后重新起句；句尾（下一项是小节线或结尾）拉长
      var next = scoreA[idx + 1];
      var phraseEnd = !next || (next && next.kind === 'bar');
      var beats = phraseEnd ? st.end : st.pat[pi % st.pat.length];
      var dur = beats * spb;
      var vel = (pi === 0) ? 1.0 : (beats < 1 ? 0.55 : 0.78);
      var n = it.note;
      var semi = P.noteSemitone(n);
      if (semi === null || isNaN(semi)) { pi++; t += dur; return; }
      if (n.type === 'walk') {
        ev.push({ t: t, semi: semi, col: null, orn: [], glideFrom: lastSemi, dur: dur, str: n.string, vel: vel });
      } else {
        ev.push({ t: t, semi: semi, col: null, orn: n.orn || [], dur: dur, str: n.string, vel: vel, right: n.right, ntype: n.type });
      }
      lastSemi = semi;
      pi++; t += dur;
    });
    window.QinAudio.playSeq(ev, null);
  };

  /* ══════════ 打印/存PDF：弹出独立打印页（兼容微信等 window.print 无效的环境）══════════ */
  window.printScore = function (which) {
    var el = $(which === 'A' ? 'scoreA' : 'scoreB');
    if (!el || !el.querySelector('.duipu')) { alert('谱面还是空的，先生成谱再打印。'); return; }
    var w = window.open('', '_blank');
    if (!w) { alert('浏览器拦截了弹窗。请允许本站弹窗后重试；微信内请点右上角「在浏览器打开」。'); return; }
    var href = document.querySelector('link[rel="stylesheet"]').href;
    w.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>琴谱通 · 打印</title><link rel="stylesheet" href="' + href + '">' +
      '<style>body{background:#fff;max-width:none;padding:20px}.jz-cell{cursor:default}</style>' +
      '</head><body>' + el.innerHTML +
      '<p style="text-align:center;color:#a89877;font-size:12px">琴谱通 iamamilycc.github.io/qinpu</p>' +
      '</body></html>');
    w.document.close();
    setTimeout(function () { try { w.print(); } catch (e) { /* 用户可手动 Cmd+P */ } }, 500);
  };

  /* ══════════ 试听（模拟古琴拨弦）══════════ */
  var SPB = 60 / 56; // ♩=56，琴曲宜缓

  // 反复展开：|: A [1 B :| [2 C → A+B, A+C（无房则 body 两遍）
  function expandForPlay(toks) {
    var repL = -1, repR = -1, v1 = -1, v2 = -1;
    toks.forEach(function (t, i) {
      if (t.kind === 'bar' && t.rep === 'L' && repL < 0) repL = i;
      if (t.kind === 'bar' && t.rep === 'R' && repR < 0) repR = i;
      if (t.kind === 'volta' && t.n === 1 && v1 < 0) v1 = i;
      if (t.kind === 'volta' && t.n === 2 && v2 < 0) v2 = i;
    });
    var pairs = toks.map(function (t, i) { return [t, i]; });
    if (repR < 0) return pairs;
    if (repL < 0) repL = 0;
    if (v1 >= 0 && v2 >= 0) {
      return pairs.slice(0, repL)
        .concat(pairs.slice(repL, v1), pairs.slice(v1, repR),
                pairs.slice(repL, v1), pairs.slice(v2));
    }
    return pairs.slice(0, repL)
      .concat(pairs.slice(repL, repR), pairs.slice(repL, repR), pairs.slice(repR));
  }

  // 乐句强弱拱形：句中渐强、句尾渐收（人耳最舒适的呼吸形）
  function applyPhraseArch(ev, a, b) {
    var n = b - a;
    if (n < 2) return;
    for (var i = a; i < b; i++) {
      var pos = (i - a + 0.5) / n;
      ev[i].vel = (ev[i].vel || 0.8) * (0.86 + 0.26 * Math.sin(Math.PI * pos));
    }
  }

  function eventsFromB() {
    var ev = [], t = 0, lastSemi = null, atBarStart = true;
    var spb = SPB; // 可被谱中 T=NN 改变
    var pendTie = null; // 连音线：待与下一同音合并
    var phraseStart = 0; // 当前乐句(小节)在 ev 中的起点
    expandForPlay(tokensB).forEach(function (pair) {
      var tk = pair[0], ti = pair[1];
      var col = ti + 1; // 第0列是谱号
      if (tk.kind === 'br' || tk.kind === 'volta' || tk.kind === 'voltaEnd') return;
      if (tk.kind === 'tempo') { spb = 60 / tk.bpm; return; }
      if (tk.kind === 'bar' || tk.kind === 'time') {
        atBarStart = true;
        if (ev.length > phraseStart) {
          applyPhraseArch(ev, phraseStart, ev.length); // 上一句强弱拱形
          t += 0.07 * spb;                              // 句间呼吸（气口）
          phraseStart = ev.length;
        }
        return;
      }
      if (tk.kind === 'rest') { t += (tk.unit || 1) * (tk.dotted ? 1.5 : 1) * spb; return; }
      if (tk.kind === 'dash') { // 延音：上一音的拍值加长，余音继续
        if (ev.length) ev[ev.length - 1].dur += spb;
        t += spb; return;
      }
      tk.group.forEach(function (n, gi) {
        var unit = tk.triplet ? (1 / 3) : tk.six ? 0.25 : (tk.beam || tk.eighth) ? 0.5 : 1;
        var dur = unit * ((tk.dotted && gi === tk.group.length - 1) ? 1.5 : 1) * spb;
        if (tk.ferm && gi === tk.group.length - 1) dur *= 1.6; // 延长号
        // 力度分层（拉开差距才听得见）：小节头强拍 1.0 → 正拍 0.7 →
        // 八分前半 0.58 → 八分后半 0.42；附点/长音是乐句呼吸点，给 0.9
        var vel = atBarStart ? 1.0 : (unit === 0.5 && gi % 2 === 1) ? 0.42 : (unit === 0.5 ? 0.58 : 0.7);
        if ((tk.dotted && gi === tk.group.length - 1) && !atBarStart) vel = Math.max(vel, 0.9);
        atBarStart = false;
        var refPeek = tk.refs[gi];
        if (refPeek !== -1 && notesB[refPeek] && notesB[refPeek].trip !== undefined) {
          vel = 0.48 + 0.06 * notesB[refPeek].trip; // 轮：三声连续短而轻，微渐强
        }
        var ref = tk.refs[gi];
        // 倚音：主音前抢拍的短小音（各0.11s，轻）
        if (tk.grace && gi === 0 && ref !== -1) {
          tk.grace.forEach(function (g, k) {
            var gs = P.jianpuToSemitone(g.deg, g.sharp, g.oct);
            var gt = Math.max(0, t - 0.11 * (tk.grace.length - k));
            ev.push({ t: gt, semi: gs, col: col, orn: [], dur: 0.11, str: 0, vel: 0.45 });
          });
        }
        if (ref !== -1) {
          var it = notesB[ref];
          var evt = null;
          if (it.custom) {
            var cs = P.noteSemitone(it.custom);
            evt = { t: t, semi: cs, col: col, orn: it.custom.orn || [], dur: dur, str: it.custom.string, vel: vel, right: it.custom.right, ntype: it.custom.type };
          } else if (it.walk) { // 走音：从上一音滑过去，不重新拨弦
            var ws = P.anSemitone(it.walk.string, it.walk.hui, it.walk.fen);
            evt = { t: t, semi: ws, col: col, orn: [], glideFrom: lastSemi, dur: dur, str: it.walk.string, vel: vel };
          } else {
            var cc = it.cands[it.pick];
            var s = P.noteSemitone(candToNote(cc));
            evt = { t: t, semi: s, col: col, orn: it.orn, dur: dur, str: cc.string, vel: vel, right: it.right, ntype: cc.type };
          }
          // 连音线：与前一同音合并，不再触弦
          if (pendTie && Math.abs(Math.round(pendTie.semi) - Math.round(evt.semi)) === 0) {
            pendTie.dur += evt.dur;
            pendTie = null;
          } else {
            ev.push(evt);
            lastSemi = evt.semi;
            pendTie = (tk.tie && gi === tk.group.length - 1) ? evt : null;
          }
        }
        t += dur;
      });
    });
    if (ev.length > phraseStart) applyPhraseArch(ev, phraseStart, ev.length); // 末句
    return ev;
  }

  function eventsFromA() {
    var ev = [], t = 0;
    scoreA.forEach(function (it) {
      if (it.kind !== 'note') return;
      ev.push({ t: t, semi: P.noteSemitone(it.note), col: null, orn: it.note.orn, dur: SPB, str: it.note.string, vel: (ev.length % 2 === 0 ? 0.95 : 0.65), right: it.note.right, ntype: it.note.type });
      t += SPB;
    });
    return ev;
  }

  function highlightB(col) {
    document.querySelectorAll('#scoreB .dp-col.playing').forEach(function (c) { c.classList.remove('playing'); });
    if (col !== null) {
      var el = document.querySelector('#scoreB .dp-col[data-col="' + (col - 1) + '"]');
      if (el) el.classList.add('playing');
    }
  }

  window.playB = function () { window.QinAudio.playSeq(eventsFromB(), highlightB); };
  window.playA = function () { window.QinAudio.playSeq(eventsFromA(), null); };
  window.stopPlay = function () { window.QinAudio.stop(); highlightB(null); };
  window.playCurrent = function () {
    var note = currentNoteFromForm();
    var s = P.noteSemitone(note);
    if (s !== null && !isNaN(s)) window.QinAudio.playSeq([{ t: 0, semi: s, col: null, orn: note.orn, right: note.right, ntype: note.type }], null);
  };

  /* ══════════ 教程页：用真渲染器注入示例减字 ══════════ */

  // 指法动作示意图：琴面俯视（上=一弦·远侧，下=七弦·近身），箭头=拨弦方向
  function motionSVG(finger, inward) {
    var w = 120, h = 84, top = 12, gap = 8;
    var NUMS = ['一', '二', '三', '四', '五', '六', '七'];
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="120" height="84" class="tut-motion" role="img">';
    for (var i = 0; i < 7; i++) {
      var y = top + i * gap;
      s += '<line x1="26" y1="' + y + '" x2="' + (w - 6) + '" y2="' + y + '" class="tm-str' + (i === 3 ? ' hit' : '') + '"/>';
      s += '<text x="13" y="' + (y + 3) + '" class="tm-num">' + NUMS[i] + '</text>';
    }
    var x = 74, yT = top + 3 * gap;                 // 以四弦为例
    var y1 = inward ? yT - 18 : yT + 18;            // 指尖起点
    var y2 = inward ? yT + 14 : yT - 14;            // 拨过弦后
    var dir = inward ? 1 : -1;
    s += '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" class="tm-arrow"/>';
    s += '<path d="M' + (x - 4) + ' ' + (y2 - 6 * dir) + ' L' + x + ' ' + y2 + ' L' + (x + 4) + ' ' + (y2 - 6 * dir) + '" class="tm-head"/>';
    s += '<circle cx="' + x + '" cy="' + y1 + '" r="4" class="tm-finger"/>';
    s += '<text x="' + (x + 9) + '" y="' + (y1 + (inward ? -3 : 8)) + '" class="tm-label">' + finger + '</text>';
    s += '<text x="' + (w - 6) + '" y="' + (h - 2) + '" class="tm-side" text-anchor="end">' +
      (inward ? '向内＝朝身体' : '向外＝离身') + '</text>';
    return s + '</svg>';
  }

  function tutInit() {
    if (!$('tutBig')) return;
    $('tutBig').innerHTML = J.render({ type: 'an', string: 4, hui: 9, left: '名', right: '挑' }, 110);
    // 三种音色
    var timbres = [
      { n: { type: 'san', string: 3, right: '挑' }, t: '<b>散音</b>：空弦，左手不按。<br>上半写「艹」。声如钟，多用于曲首曲尾。' },
      { n: { type: 'an', string: 4, hui: 9, left: '名', right: '挑' }, t: '<b>按音</b>：左手按在徽位上弹。<br>琴曲的主体，可走音变化。' },
      { n: { type: 'fan', string: 3, hui: 7, left: '中', right: '挑' }, t: '<b>泛音</b>：左手轻点徽位即离。<br>左上角红「泛」。声如天籁。' }
    ];
    var h = '';
    timbres.forEach(function (x) {
      h += '<div class="tut-cell">' + J.render(x.n, 66) + '<p>' + x.t + '</p></div>';
    });
    $('tutTimbre').innerHTML = h;
    // 右手八法
    var rights = [
      ['挑', '食指', '向外弹出', '最常用的指法，声音清亮'],
      ['抹', '食指', '向内弹入', '与挑成对，声音温厚'],
      ['勾', '中指', '向内弹入', '浑厚有力，低音常用'],
      ['剔', '中指', '向外弹出', '与勾成对'],
      ['打', '名指', '向内弹入', '轻柔'],
      ['摘', '名指', '向外弹出', '与打成对，滚指法的基础'],
      ['托', '大指', '向外推出', '常弹低音弦'],
      ['擘', '大指', '向内弹入', '与托成对']
    ];
    h = '<tr><th>指法</th><th>减字</th><th>手指</th><th>方向</th><th>动作示意（琴面俯视）</th><th>特点</th></tr>';
    rights.forEach(function (r) {
      var inward = r[2].indexOf('向内') === 0;
      var fingerShort = r[1].charAt(0); // 食/中/名/大
      h += '<tr><td><b>' + r[0] + '</b></td><td>' + J.render({ type: 'san', string: 3, right: r[0] }, 34, { bare: true }) +
        '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + motionSVG(fingerShort, inward) + '</td><td>' + r[3] + '</td></tr>';
    });
    $('tutRight').innerHTML = h;
    // 左手与走音
    var lefts = [
      ['大指', '大', '按弦主力，与食指配合'],
      ['食指', '人', '省文作「人」'],
      ['中指', '中', ''],
      ['名指', '夕', '省文作「夕」，按高把位常用']
    ];
    var orns = [
      ['绰', '自下而上滑入本位（上滑音），出音有"迎"意'],
      ['注', '自上而下滑入本位（下滑音），出音有"落"意'],
      ['吟', '按弦后小幅度摆动，声音微颤如吟哦'],
      ['猱', '按弦后较大幅度摆动，苍劲之声'],
      ['上', '弹响后左手沿弦上移至另一徽位，音随之升高'],
      ['下', '弹响后左手下移，音随之降低'],
      ['进复', '上移一位再回到本位（去而复返，两个音）'],
      ['退复', '下移一位再回到本位'],
      ['撞', '弹响后向上急撞一下立刻回来，短促有力'],
      ['双撞', '连撞两次，急切之声'],
      ['唤', '先撞后注的连续动作，如呼唤之声'],
      ['逗', '弹的同时向上急逗一下随即归位，比撞更贴着弹音'],
      ['往来', '在两个徽位间来回移动数次，余音袅袅'],
      ['淌', '缓缓下滑，音渐淌落，多接在注、下之后'],
      ['分开', '走音两声分开清晰弹出（各谱系细节略异）']
    ];
    var techs = [
      ['罨', '左手指不弹而直接击按弦上出声，音闷而古'],
      ['虚罨', '罨的轻虚之作，声若有若无'],
      ['掐起', '大指甲扣弦抠起出声（名指按住不动），「掐撮三声」的核心'],
      ['带起', '左手指离弦时顺势勾带空弦出声'],
      ['爪起', '大指甲轻抠弦离弦出声，比带起更轻'],
      ['推出', '中指按弦向外推出发声'],
      ['放合', '按指放开得散音，与随后弹出的音相合呼应']
    ];
    h = '<tr><th colspan="3">左手四指（写在减字左上角）</th></tr>';
    lefts.forEach(function (r) { h += '<tr><td><b>' + r[0] + '</b></td><td class="tut-glyph">' + r[1] + '</td><td>' + r[2] + '</td></tr>'; });
    h += '<tr><th colspan="3">走音（弹响之后左手的动作，写在减字旁）</th></tr>';
    orns.forEach(function (r) { h += '<tr><td><b>' + r[0] + '</b></td><td></td><td>' + r[1] + '</td></tr>'; });
    h += '<tr><th colspan="3">左手出声技法（不靠右手弹，左手自己出音）</th></tr>';
    techs.forEach(function (r) { h += '<tr><td><b>' + r[0] + '</b></td><td></td><td>' + r[1] + '</td></tr>'; });
    $('tutLeft').innerHTML = h;

    // 右手组合指法表（全表）
    var combos = [
      ['撮', '大/食与中指同时弹两根弦，双音齐鸣，常用于结音'],
      ['反撮', '撮后两指反方向再弹一次，与撮成对'],
      ['如一声', '两声几乎同时发出、合若一声，常接双弹之后'],
      ['双弹', '食中二指在同一弦上先后急弹两声'],
      ['蠲', '食中二指在同一弦上急速连弹两声，轻快如珠（juān）'],
      ['轮', '名中食三指在同一弦上摘、剔、挑连作，如珠落玉盘'],
      ['半轮', '轮的省作，只取其中两声'],
      ['背锁', '剔、抹、挑三声连作，短促铿锵'],
      ['短锁', '背锁前加抹勾引带，约五声连作'],
      ['长锁', '抹挑往复再接背锁，约七声连作（各谱系声数略有出入）'],
      ['打圆', '两音往复弹奏共七声，圆转如环'],
      ['索铃', '食指向外连续挑过数弦，颤动如摇铃（《普庵咒》标志指法）'],
      ['滚', '名指由高弦向低弦连摘数弦，如水倾泻'],
      ['拂', '食指由低弦向高弦连抹数弦，与滚相对'],
      ['滚拂', '滚、拂连作一气，波涛之声（《流水》标志指法）'],
      ['历', '食指连挑相邻两三弦，轻快连贯'],
      ['泼', '食中名三指并拢向内击弦'],
      ['剌', '三指并拢向外扫出'],
      ['泼剌', '泼、剌连作，声如裂帛（《广陵散》多用）'],
      ['伏', '弹后随即以手掌轻按弦上止住余音']
    ];
    h = '<tr><th>指法</th><th>减字</th><th>动作说明</th></tr>';
    combos.forEach(function (r) {
      h += '<tr><td><b>' + r[0] + '</b></td><td>' + J.render({ type: 'san', string: 3, right: r[0] }, 34, { bare: true }) +
        '</td><td style="text-align:left">' + r[1] + '</td></tr>';
    });
    $('tutCombo').innerHTML = h;

    // 谱字术语速查
    var terms = [
      ['泛起 / 泛止', '泛音段开始 / 结束的标记'],
      ['少息', '稍作停顿，气口'],
      ['大息', '较长的停顿'],
      ['入慢', '由此渐慢'],
      ['紧', '由此加快'],
      ['再作', '从记号处再弹一遍'],
      ['从头再作', '整段从头重复'],
      ['曲终', '全曲结束（常接泛音尾声）']
    ];
    if ($('tutTerms')) {
      h = '<tr><th>谱字</th><th>含义</th></tr>';
      terms.forEach(function (r) { h += '<tr><td><b>' + r[0] + '</b></td><td style="text-align:left">' + r[1] + '</td></tr>'; });
      $('tutTerms').innerHTML = h;
    }
  }

  // 初始化
  document.addEventListener('DOMContentLoaded', function () {
    // 徽位下拉 1~13
    var huiSel = $('selHui');
    for (var h = 1; h <= 13; h++) {
      var o = document.createElement('option');
      o.value = h; o.textContent = J.NUM[h] + '徽';
      if (h === 9) o.selected = true;
      huiSel.appendChild(o);
    }
    ['selType', 'selString', 'selLeft', 'selHui', 'selFen', 'selRight'].forEach(function (id) {
      $(id).addEventListener('change', updatePreview);
    });
    ORN_IDS.forEach(function (o) {
      var el = $('orn' + o); if (el) el.addEventListener('change', updatePreview);
    });
    // 调弦法切换：音律/五线谱调号/两个方向的谱面全部联动
    $('selTuning').addEventListener('change', function () {
      P.setTuning(this.value);
      S.setKey(P.tuning().flats);
      updatePreview();
      renderScoreA();
      if (tokensB.length) convertJianpu(); // 重新编配（定弦变了，弹法全变）
    });
    updatePreview();
    renderScoreA();
    renderScoreB();
    tutInit();
    // 首次进入方向二自动载入《普庵咒》示例，让人一眼看懂产品
    if (!$('inJianpu').value) loadDemo();
  });
})();
