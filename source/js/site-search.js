/* global window, document, history */
// 站内搜索（/search/）前端逻辑。
//
// 2026-11-04 从「导航弹窗」改为独立页（PLAN-V3 §4）：弹窗只有一屏高、移动端被键盘
// 压掉一半，而且结果无法分享。独立页 + ?q= 参数可以直接复制给别人。
//
// 数据来自构建期生成的 /search-index.json（由 themes/fluid/scripts/generators/
// search-index.js 产出），页面打开后才拉取，不占首屏。
//
// 检索用「标题前缀 > 标题包含 > 别名（拼音）> 摘要 > 路径」五级打分，
// 同一关键词在多个位置命中取最高档；多关键词之间是 AND。

(function () {
  'use strict';

  var input = document.getElementById('sr-input');
  if (!input) return;

  var listEl = document.getElementById('sr-list');
  var metaEl = document.getElementById('sr-meta');
  var emptyEl = document.getElementById('sr-empty');
  var chipsEl = document.getElementById('sr-chips');

  var LABEL = {
    post: '文章', page: '页面', city: '城市', rank: '榜单',
    zodiac: '生肖', festival: '节日', holiday: '节假日', topic: '资料库'
  };
  // 同分时按这个顺序排：文章 → 主题内容（生肖/节日/节假日）→ 城市 → 榜单 → 入口页。
  // 把主题内容放在城市之前，是因为「龙」「马」这类词既是生肖也是城市名的一部分，
  // 而读者输入一个字时更可能是在找生肖；搜具体城市名（深圳/北京）时城市仍是唯一结果。
  var TYPE_ORDER = { post: 0, zodiac: 1, festival: 2, holiday: 3, city: 4, rank: 5, topic: 6, page: 7 };
  var MAX = 40;

  var items = null;
  var cat = 'all';
  var timer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase();
  }

  // 命中打分：取该条目所有关键词里命中的最高档，全部命中才算匹配
  function scoreItem(item, words) {
    var t = norm(item.t), k = norm(item.k), s = norm(item.s), u = norm(item.u);
    var lowest = 999;
    for (var i = 0; i < words.length; i += 1) {
      var w = words[i];
      var hit = 0;
      if (t.indexOf(w) === 0) hit = 100;
      else if (t.indexOf(w) >= 0) hit = 80;
      else if (k && k.indexOf(w) >= 0) hit = 60;
      else if (s.indexOf(w) >= 0) hit = 40;
      else if (u.indexOf(w) >= 0) hit = 20;
      if (hit === 0) return 0;
      if (hit < lowest) lowest = hit;
    }
    return lowest;
  }

  function highlight(text, words) {
    var out = esc(text);
    for (var i = 0; i < words.length; i += 1) {
      var w = words[i];
      if (!w) continue;
      var safe = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(safe, 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
    }
    return out;
  }

  function render(q) {
    var query = String(q || '').trim();
    var words = norm(query).split(/\s+/).filter(Boolean);

    if (!items) return;
    if (!words.length) {
      listEl.innerHTML = '';
      metaEl.hidden = true;
      emptyEl.hidden = true;
      return;
    }

    var hits = [];
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (cat !== 'all' && it.c !== cat) continue;
      // 「页面」类不单独给 chip，但「全部」里仍然能搜到
      var sc = scoreItem(it, words);
      if (sc > 0) hits.push({ it: it, sc: sc });
    }

    hits.sort(function (a, b) {
      if (b.sc !== a.sc) return b.sc - a.sc;
      // 同分时标题更短的靠前：搜「龙」时「龙年」比「龙湖镇」更接近用户想找的东西
      var la = String(a.it.t).length;
      var lb = String(b.it.t).length;
      if (la !== lb) return la - lb;
      var oa = TYPE_ORDER[a.it.c] == null ? 9 : TYPE_ORDER[a.it.c];
      var ob = TYPE_ORDER[b.it.c] == null ? 9 : TYPE_ORDER[b.it.c];
      if (oa !== ob) return oa - ob;
      return String(a.it.t).localeCompare(String(b.it.t), 'zh');
    });

    metaEl.hidden = false;
    metaEl.textContent = hits.length
      ? '找到 ' + hits.length + ' 条' + (hits.length > MAX ? '，显示前 ' + MAX + ' 条' : '') + ' · 关键词「' + query + '」'
      : '没有匹配「' + query + '」的内容';

    if (!hits.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    var html = '';
    for (var j = 0; j < hits.length && j < MAX; j += 1) {
      var it2 = hits[j].it;
      html += '<a class="sr-row" href="' + esc(it2.u) + '">'
        + '<span class="sr-row-main">'
        + '<span class="sr-row-title">' + highlight(it2.t, words) + '</span>'
        + (it2.s ? '<span class="sr-row-desc">' + highlight(it2.s, words) + '</span>' : '')
        + '</span>'
        + '<span class="sr-row-cat">' + (LABEL[it2.c] || '') + '</span>'
        + '</a>';
    }
    listEl.innerHTML = html;
  }

  function syncUrl(q) {
    try {
      var next = q ? '/search/?q=' + encodeURIComponent(q) : '/search/';
      if (window.location.pathname + window.location.search !== next) {
        history.replaceState(null, '', next);
      }
    } catch (e) { /* 无 history 支持时忽略，不影响检索 */ }
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var q = input.value.trim();
      syncUrl(q);
      render(q);
    }, 120);
  }

  input.addEventListener('input', onInput);

  if (chipsEl) {
    chipsEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.sr-chip');
      if (!btn) return;
      cat = btn.getAttribute('data-cat') || 'all';
      var chips = chipsEl.querySelectorAll('.sr-chip');
      for (var i = 0; i < chips.length; i += 1) {
        var active = chips[i] === btn;
        chips[i].classList.toggle('is-active', active);
        chips[i].setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      render(input.value.trim());
    });
  }

  // 从 URL 带入关键词（?q=深圳），并自动聚焦到输入框末尾
  var initial = '';
  try {
    initial = new URLSearchParams(window.location.search).get('q') || '';
  } catch (e) { initial = ''; }
  if (initial) {
    input.value = initial;
    render(initial);
  }
  input.focus();
  if (initial) {
    var len = input.value.length;
    try { input.setSelectionRange(len, len); } catch (e) { /* 某些输入类型不支持选区 */ }
  }

  fetch('/search-index.json', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function (data) {
      items = (data && Array.isArray(data.items)) ? data.items : [];
      if (input.value.trim()) render(input.value.trim());
    })
    .catch(function () {
      metaEl.hidden = false;
      metaEl.textContent = '索引加载失败，请刷新页面重试。';
    });
})();
