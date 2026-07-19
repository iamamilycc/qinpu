/* 琴谱通 QinPu · © 2026 iamamilycc · 授权 CC BY-NC-SA 4.0（须署名／非商业／衍生同授权）· https://github.com/iamamilycc/qinpu */
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
      $('ocrMsg').innerHTML = '第一次使用：粘贴 API Key（只存本机浏览器，不上传）。<b>推荐智谱——有免费视觉模型</b>：到 <a href="https://bigmodel.cn" target="_blank">bigmodel.cn</a> 注册→「API Keys」复制（形如 <code>xxxx.yyyy</code>），本站自动识别用免费的 GLM-4.6V-Flash。也支持 Anthropic（sk-ant-…）/ OpenAI（sk-…）付费 Key。';
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
        // 压到长边 2048px：密集简谱的八度点/泛音圈/三连音弧极小，缩太狠会糊掉，2048 比 1568 多认出三连音等小记号（实测）
        var sc = Math.min(1, 2048 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        // 先自动切块：整页多系统时切成近方形小块逐块识别（小记号才认得出）；单块/切不出则整页识别
        var blocks = (window.QinSplit && window.QinSplit.imageToBlocks) ? window.QinSplit.imageToBlocks(c) : [];
        if (blocks.length >= 2) callVisionBlocks(c, blocks);
        else callVision(c.toDataURL('image/jpeg', 0.88).split(',')[1]);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };

  var PROMPT =
    '这是一页中国古琴曲谱的照片，竖向排了 2~3 个「系统」（行组）。每个系统从上到下依次是：' +
    '①简谱行（阿拉伯数字 1~7）②五线谱行（五条横线上的音符）③减字谱行（方块状汉字部件）④歌词行。\n' +
    '【只转录每个系统最上面那一行简谱（数字 1~7）】，按系统从上到下的顺序首尾相接，连成一首曲子。' +
    '严禁把五线谱的音名字母（d/f/a/c 等）、减字、歌词当成简谱输出——每个音必须是 1~7 的数字。' +
    '只输出记谱文本本身，不要任何解释，不要代码块。\n' +
    '记法：小节线=|　终止=||　反复开始=|: 结束=:|　拍号原样如 2/4　音符=1~7　' +
    "高八度在数字后加'（数字正上方每个小圆点一个'）　低八度加,（数字正下方每个小圆点一个,）　" +
    '升半音前缀#　降半音前缀b　附点=数字后加.　' +
    '八分音符=连写成组（如12）或数字后加_　十六分（两条下划线）=连写后加=　三连音=括号如(555)　' +
    '延音（横线）=-　休止=0，八分休止=0_　倚音（小音符）={3}5　延长号=数字后加^　' +
    '数字正上方小圆圈○=泛音，在该数字后加○　每个系统行末尾输出 /　一房=[1　二房=[2　房结束=]\n' +
    '若整页找不到简谱数字行，才转录【减字谱行】：把每个减字翻译成口述文字格式，' +
    '整体以 JIANZI: 开头输出一行。口述格式：散勾一=空弦勾一弦　名九挑四=名指按九徽挑四弦　' +
    '大七六托五=大指七徽六分托五弦　泛七挑一=七徽泛音挑一弦　上九/下七六=走音（滑到该徽位）　' +
    '|=小节线　左手指=大/食/中/名，右手指法=挑抹勾剔打摘托擘撮轮历滚拂等，弦号一~七，徽位一~十三。' +
    '无法辨认的减字输出?占位。\n' +
    '识别要点：①一个系统的简谱只有最上面一行，别把它下面的五线谱/减字/歌词行并进来；' +
    '②同列上下叠两个数字=撮的双音记谱（大数字为主旋律），不是倚音；' +
    '③逐个确认高低八度点（数字正上方小点=高八度、正下方小点=低八度），勿凭旋律惯性补八度；' +
    '④三连音记号（数字上方弧线+3）要用 (555) 包裹，别漏。';

  // 按 Key 前缀识别服务商：sk-ant-→Anthropic；sk-→OpenAI；含「.」的→智谱（免费视觉）
  function providerOf(key) {
    if (key.indexOf('sk-ant-') === 0) return 'anthropic';
    if (key.indexOf('sk-') === 0) return 'openai';
    if (key.indexOf('.') > 0) return 'zhipu';
    return 'openai';
  }
  window.__ocrProvider = providerOf; // 供测试

  // 分块识谱用的片段 prompt（只是整首一小块，照原样别补别省）
  var BLOCK_PROMPT =
    '这是一首古琴曲简谱的一小块（含简谱数字行，下方是五线谱）。只转录简谱数字行（1~7），' +
    '这只是整首曲子的一个片段，照原样逐个转录、别补别省。' +
    "数字正上方空心圆圈○=泛音（后加○）；正下方小圆点=低八度（后加半角逗号，两点两逗号）；" +
    "正上方小圆点=高八度（后加半角撇）；右侧小点=附点（后加英文句点.）；" +
    '数字上方弧线连三音=三连音用(555)包裹；小节线=|。只输出这一小块的简谱文本，不要解释，不要代码块。';

  // 按服务商组请求（key 前缀路由）
  function buildReq(b64, promptText) {
    var key = getKey(), prov = providerOf(key), url, headers, body;
    if (prov === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' };
      body = { model: 'claude-sonnet-5', max_tokens: 2000, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: promptText }] }] };
    } else {                                          // OpenAI（sk-…）/ 智谱（含.）——OpenAI 兼容格式
      var isZhipu = prov === 'zhipu';
      url = isZhipu ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
                    : 'https://api.openai.com/v1/chat/completions';
      headers = { 'Authorization': 'Bearer ' + key, 'content-type': 'application/json' };
      var zModel = ($('zhipuModel') && $('zhipuModel').value) || 'glm-4.6v-flash';
      body = { model: isZhipu ? zModel : 'gpt-4o', max_tokens: isZhipu ? 4000 : 2000, messages: [{ role: 'user', content: [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }] }] };
    }
    return { prov: prov, url: url, headers: headers, body: body };
  }

  // 发一次视觉请求 → Promise<识别文本>；429/503 自动退避重试（onProg 报进度）
  function visionRequest(b64, promptText, onProg) {
    var req = buildReq(b64, promptText);
    function doFetch(attempt) {
      return fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) }).then(function (r) {
        if (r.status === 401) throw new Error('KEY');
        if ((r.status === 429 || r.status === 503) && attempt < 4) {
          if (onProg) onProg('模型繁忙，自动重试中（第 ' + (attempt + 2) + ' 次）…');
          return new Promise(function (res) { setTimeout(res, 2500 * (attempt + 1)); }).then(function () { return doFetch(attempt + 1); });
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return doFetch(0).then(function (j) {
      var txt = (req.prov === 'anthropic'
        ? (j.content && j.content[0] && j.content[0].text || '')
        : (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '')).trim();
      return txt.replace(/^```[^\n]*\n?/, '').replace(/```\s*$/, '').trim();
    });
  }

  function ocrError(e) {
    var es = '' + e;
    $('ocrMsg').textContent = es.indexOf('KEY') >= 0
      ? '❌ API Key 无效或过期。点「📷 拍谱识谱」重新输入。'
      : es.indexOf('429') >= 0
        ? '⏳ 免费模型持续繁忙（已自动重试多次）。请等一两分钟再点「📷 拍谱识谱」，或在「识谱设置」选高精度 GLM-4.6V（付费约1~2分/张，不限流）。'
        : '❌ 识别失败：' + e + '（多为网络问题，可重试）';
    if (es.indexOf('KEY') >= 0) { localStorage.removeItem('qinpu_api_key'); }
  }

  // 整页单张识别（切块不可用/单块时兜底；也处理纯减字谱 JIANZI: 分支）
  function callVision(b64) {
    $('ocrMsg').textContent = '🔍 AI 识谱中（约 10~40 秒，请勿离开）…';
    visionRequest(b64, PROMPT, function (m) { $('ocrMsg').textContent = '🔍 ' + m; }).then(function (txt) {
      if (!txt) { $('ocrMsg').textContent = '⚠️ 没识别出内容，请拍正、拍清晰再试。'; return; }
      if (txt.indexOf('JIANZI:') === 0) {
        document.getElementById('jzTextIn').value = txt.slice(7).trim();
        window.switchTab('j2p'); window.parseJzText();
        document.getElementById('jzTextMsg').textContent +=
          '　📷 来自拍照识别（实验功能）——务必逐字对照原谱校对，? 为 AI 无法辨认的字；校对后用下方「🎭 打谱风格」试听多种演绎。';
        return;
      }
      $('inJianpu').value = txt; window.convertJianpu();
      $('ocrMsg').textContent = '✅ 已识谱并生成三行对照谱＋试听。⚠️ AI 识谱难免有错——请逐小节对照原谱校对，错音点击减字改。';
    }).catch(ocrError);
  }

  // 整页自动切块识别：逐块识别（空结果重试一次）→ 系统间插 / 拼接（模型对小块才认得出八度点/泛音）
  function callVisionBlocks(canvas, blocks) {
    var out = [], i = 0, lastSys = -1;
    function finish() {
      var txt = out.join(' ').replace(/\s+/g, ' ').trim();
      if (!txt) { $('ocrMsg').textContent = '⚠️ 切块识谱没认出内容，换清晰正对的照片再试。'; return; }
      $('inJianpu').value = txt; window.convertJianpu();
      $('ocrMsg').textContent = '✅ 已切块识谱并生成谱（共 ' + blocks.length + ' 块）。⚠️ 八度/泛音仍可能有错——请逐小节对照原谱校对，错音点减字改。';
    }
    function step(isRetry) {
      if (i >= blocks.length) { finish(); return; }
      var b = blocks[i];
      $('ocrMsg').textContent = '🔍 切块识谱中… 第 ' + (i + 1) + '/' + blocks.length + ' 块' + (isRetry ? '（重试）' : '');
      var c = document.createElement('canvas');
      c.width = Math.round(b.w * 1.6); c.height = Math.round(b.h * 1.6);
      c.getContext('2d').drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
      var b64 = c.toDataURL('image/jpeg', 0.9).split(',')[1];
      visionRequest(b64, BLOCK_PROMPT).then(function (txt) {
        if (!txt && !isRetry) { step(true); return; }        // 空结果重试一次
        if (txt) {
          if (b.sys !== lastSys && lastSys >= 0) out.push('/');  // 系统间换行
          lastSys = b.sys; out.push(txt);
        }
        i++; step(false);
      }).catch(function (e) {
        if (('' + e).indexOf('KEY') >= 0) { ocrError(e); return; }  // key 错直接停
        i++; step(false);                                            // 单块失败跳过，继续
      });
    }
    step(false);
  }

  // 记住智谱识别精度选择（存本机，下次自动沿用，不必每次重选）
  (function () {
    var zm = $('zhipuModel');
    if (!zm) return;
    var saved = localStorage.getItem('qinpu_zhipu_model');
    if (saved) {
      var ok = false;
      for (var i = 0; i < zm.options.length; i++) if (zm.options[i].value === saved) ok = true;
      if (ok) zm.value = saved;
    }
    zm.addEventListener('change', function () { localStorage.setItem('qinpu_zhipu_model', zm.value); });
  })();
})();
