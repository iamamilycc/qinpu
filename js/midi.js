/* 琴谱通 QinPu · © 2026 iamamilycc · 授权 CC BY-NC-SA 4.0（须署名／非商业／衍生同授权）· https://github.com/iamamilycc/qinpu */
/* ============================================================
 * 琴谱通 midi.js —— 标准 MIDI 文件（.mid）导入（纯前端解析）
 *
 * 读 SMF：解析音轨的 note-on/off，取单声部旋律（同时多音取最高），
 * 按每四分音符 tick 数量化时长 → 简谱文本。QinMidi.parse(arrayBuffer)。
 * ============================================================ */
(function (global) {
  'use strict';

  function parse(ab) {
    var dv = new DataView(ab), pos = 0;
    function u32() { var v = dv.getUint32(pos); pos += 4; return v; }
    function u16() { var v = dv.getUint16(pos); pos += 2; return v; }
    function u8() { return dv.getUint8(pos++); }
    function str4() { var s = ''; for (var i = 0; i < 4; i++) s += String.fromCharCode(u8()); return s; }
    function vlq() { var v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; }

    if (str4() !== 'MThd') throw new Error('不是 MIDI 文件');
    u32(); // header len
    u16(); // format
    var ntracks = u16();
    var division = u16();
    var tpq = (division & 0x8000) ? 480 : division; // SMPTE 帧格式少见，退回默认

    var notes = []; // {midi, start, dur}
    for (var tk = 0; tk < ntracks; tk++) {
      if (pos >= ab.byteLength || str4() !== 'MTrk') break;
      var len = u32(), end = pos + len, t = 0, running = 0, open = {};
      var closeN = function (nn) {
        if (open[nn] != null) { notes.push({ midi: nn, start: open[nn], dur: Math.max(1, t - open[nn]) }); delete open[nn]; }
      };
      while (pos < end) {
        t += vlq();
        var b = dv.getUint8(pos);
        var status;
        if (b & 0x80) { status = b; pos++; running = status; } else { status = running; }
        var hi = status & 0xf0;
        if (status === 0xff) { var mt = u8(); var l = vlq(); pos += l; /* meta 跳过 */ }
        else if (status === 0xf0 || status === 0xf7) { var sl = vlq(); pos += sl; }
        else if (hi === 0x90) { var n = u8(), v = u8(); if (v > 0) open[n] = t; else closeN(n); }
        else if (hi === 0x80) { var n2 = u8(); u8(); closeN(n2); }
        else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) { pos += 2; } // 双字节消息
        else if (hi === 0xc0 || hi === 0xd0) { pos += 1; } // 单字节消息
        else { pos++; }
      }
      pos = end;
    }
    if (!notes.length) return '';

    // 单声部：按起点排序，同起点取最高音，去重叠只留旋律线
    notes.sort(function (a, b) { return a.start - b.start || b.midi - a.midi; });
    var mel = [], lastStart = -1;
    notes.forEach(function (n) { if (n.start !== lastStart) { mel.push(n); lastStart = n.start; } });

    var P = global.QinPitch;
    // MIDI 60=C4；semitone(rel C2)= midi-36
    var semis = mel.map(function (n) { return n.midi - 36; });
    var medOct = Math.floor((median(semis) - (P && P.tuning ? P.tuning().key : 5)) / 12);

    var toks = [], acc = 0;
    mel.forEach(function (n, i) {
      // 音符间空隙作停顿：累计满 4 拍插小节线
      if (i > 0) {
        var gap = n.start - (mel[i - 1].start + mel[i - 1].dur);
        if (gap > tpq * 0.5) { toks.push('0'); acc += 1; }
      }
      var semi = (n.midi - 36) - medOct * 12;
      var jp = P.semitoneToJianpu(semi).text;
      var r = n.dur / tpq;
      if (r < 0.65) { toks.push(jp + '_'); acc += 0.5; }
      else if (r < 1.6) { toks.push(jp); acc += 1; }
      else if (r < 2.8) { toks.push(jp + ' -'); acc += 2; }
      else { toks.push(jp + ' - -'); acc += 3; }
      if (acc >= 4) { toks.push('|'); acc = 0; }
    });
    return toks.join(' ').replace(/\s+/g, ' ').replace(/\|\s*$/, '').trim();
  }

  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  global.QinMidi = { parse: parse };
})(typeof window !== 'undefined' ? window : this);
