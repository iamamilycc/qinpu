/* ============================================================
 * 琴谱通 ocr.js —— 拍谱识谱（AI 视觉，需用户自己的 Anthropic API Key）
 *
 * 隐私与费用：
 *  - Key 只保存在本机浏览器 localStorage，绝不上传到任何服务器；
 *  - 照片直接从浏览器发给 Anthropic API（官方支持浏览器直连），
 *    本站无后端、不经手任何数据；
 *  - 每张照片约消耗几分钱人民币的 API 额度。
 *
 * 现阶段识别【简谱行】（数字谱）——琴书对照谱都有；
 * 纯古籍减字谱识别属实验目标，后续迭代。
 * ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function getKey() { return localStorage.getItem('qinpu_api_key') || ''; }

  window.saveApiKey = function () {
    var v = $('apiKeyIn').value.trim();
    if (!v) { $('ocrMsg').textContent = 'Key 是空的。'; return; }
    localStorage.setItem('qinpu_api_key', v);
    $('apiKeyRow').style.display = 'none';
    $('ocrMsg').textContent = '✅ Key 已保存在本机浏览器（只存你这台设备，不上传）。现在点「📷 拍谱识谱」。';
  };

  window.pickScorePhoto = function () {
    if (!getKey()) {
      $('apiKeyRow').style.display = '';
      $('ocrMsg').textContent = '第一次使用：粘贴你的 Anthropic API Key（console.anthropic.com 可申请；只存本机）。';
      return;
    }
    $('scorePhotoIn').click();
  };

  window.onScorePhoto = function (inp) {
    if (!inp.files || !inp.files[0]) return;
    var f = inp.files[0];
    inp.value = '';
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        // 压到长边 1568px（视觉模型最优输入），省流量省钱
        var sc = Math.min(1, 1568 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        callVision(c.toDataURL('image/jpeg', 0.88).split(',')[1]);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };

  var PROMPT =
    '这是一页中国古琴曲谱的照片，通常含简谱行（数字）、五线谱行、减字谱行。' +
    '请只转录【简谱行】（数字谱），按乐曲顺序从上到下、从左到右连成一首曲子，' +
    '输出为下述文本记法。只输出记谱文本本身，不要任何解释，不要代码块。\n' +
    '记法：小节线=|　终止=||　反复开始=|: 结束=:|　拍号原样如 2/4　音符=1~7　' +
    "高八度在数字后加'（音符上方每个小圆点一个'）　低八度加,（下方小圆点）　" +
    '升半音前缀#　降半音前缀b　附点=数字后加.（数字右侧小圆点）　' +
    '八分音符=同一条下划线的连写成组（如12）,单独的八分音符=数字后加_　' +
    '十六分音符（两条下划线）=连写后加=（如2222=）　三连音=括号包裹如(555)　' +
    '延音（增加一拍的横线）=-　休止=0，八分休止=0_　倚音（小音符）={3}5　' +
    '延长号=数字后加^　谱面每行结束输出 /　一房=[1　二房=[2　房结束=]\n' +
    '若整页找不到简谱数字行，只输出 JIANZI_ONLY。';

  function callVision(b64) {
    $('ocrMsg').textContent = '🔍 AI 识谱中（约 10~30 秒，请勿离开）…';
    var key = getKey();
    var isAnthropic = key.indexOf('sk-ant-') === 0;   // 按 Key 前缀自动识别服务商
    var url, headers, body;
    if (isAnthropic) {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      };
      body = {
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: PROMPT }
          ]
        }]
      };
    } else {                                          // OpenAI（sk-…）
      url = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Authorization': 'Bearer ' + key, 'content-type': 'application/json' };
      body = {
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }
          ]
        }]
      };
    }
    fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 401) throw new Error('KEY');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var txt = (isAnthropic
        ? (j.content && j.content[0] && j.content[0].text || '')
        : (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '')).trim();
      txt = txt.replace(/^```[^\n]*\n?/, '').replace(/```\s*$/, '').trim();
      if (!txt || txt.indexOf('JIANZI_ONLY') >= 0) {
        $('ocrMsg').textContent = '⚠️ 这页没识别到简谱行（纯减字谱识别尚在实验规划中）。请拍含简谱数字行的谱页，正对、光线均匀。';
        return;
      }
      $('inJianpu').value = txt;
      window.convertJianpu();
      $('ocrMsg').textContent = '✅ 已识谱并生成三行对照谱＋试听。⚠️ AI 识谱难免有错——请逐小节对照原谱校对，错音点击减字改。';
    }).catch(function (e) {
      $('ocrMsg').textContent = ('' + e).indexOf('KEY') >= 0
        ? '❌ API Key 无效或过期。点「📷 拍谱识谱」重新输入。'
        : '❌ 识别失败：' + e + '（多为网络问题，可重试）';
      if (('' + e).indexOf('KEY') >= 0) { localStorage.removeItem('qinpu_api_key'); }
    });
  }
})();
