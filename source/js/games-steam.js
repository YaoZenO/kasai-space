/* global window, document, fetch */

'use strict';

// /games/ 交互脚本（2026-11-26）：
//   1. 原地玩家名片 <dialog id="gm-dialog">：点击常玩游戏卡片原地弹出，不强迫跳空博客详情；
//   2. 静默拉取 /api/steam：自动点亮常玩卡片的真实总时长与近两周标签，
//      并在下方展开完整的 Steam 近两周在玩 & 总时长 Top 12 榜单（接口未配置或超时则静默降级）。
(function () {
  var dialog = document.getElementById('gm-dialog');
  var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-gm-card]'));
  var steamByApp = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtHours(h) {
    if (!h || h <= 0) return '';
    return h >= 100 ? Math.round(h).toLocaleString('en-US') + ' h' : h + ' h';
  }

  // 1. 玩家名片原生 <dialog>
  if (dialog && typeof dialog.showModal === 'function' && tiles.length) {
    var dImg = dialog.querySelector('[data-gm-d-img]');
    var dTitle = dialog.querySelector('[data-gm-d-title]');
    var dMeta = dialog.querySelector('[data-gm-d-meta]');
    var dHours = dialog.querySelector('[data-gm-d-hours]');
    var dSum = dialog.querySelector('[data-gm-d-sum]');
    var dLinks = dialog.querySelector('[data-gm-d-links]');
    var dClose = dialog.querySelector('[data-gm-d-close]');

    tiles.forEach(function (tile) {
      tile.addEventListener('click', function (ev) {
        // 允许中键或修饰键直接新标签打开原详情页
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
        ev.preventDefault();

        var title = tile.getAttribute('data-gm-title') || '';
        var meta = tile.getAttribute('data-gm-meta') || '';
        var cover = tile.getAttribute('data-gm-cover') || '';
        var detail = tile.getAttribute('href') || '';
        var appid = tile.getAttribute('data-steam-app') || '';
        var specialHref = tile.getAttribute('data-gm-special-href') || '';
        var specialLabel = tile.getAttribute('data-gm-special-label') || '';
        var extHref = tile.getAttribute('data-gm-ext-href') || '';
        var extLabel = tile.getAttribute('data-gm-ext-label') || '';

        if (dImg) {
          if (cover) {
            dImg.src = cover;
            dImg.alt = title;
            dImg.hidden = false;
          } else {
            dImg.hidden = true;
          }
        }
        if (dTitle) dTitle.textContent = title;
        if (dMeta) dMeta.textContent = meta;
        if (dSum) dSum.hidden = true;

        if (dHours) {
          var st = appid ? steamByApp[appid] : null;
          if (st && st.hoursTotal > 0) {
            dHours.textContent =
              'Steam 累计 ' + fmtHours(st.hoursTotal) + (st.hours2w > 0 ? ' · 近两周 ' + fmtHours(st.hours2w) : '');
            dHours.hidden = false;
          } else {
            dHours.hidden = true;
          }
        }

        if (dLinks) {
          var html = '';
          if (specialHref && specialLabel) {
            html += '<a class="gm-d-btn gm-d-btn--primary" href="' + esc(specialHref) + '">' + esc(specialLabel) + ' →</a>';
          }
          if (extHref && extLabel) {
            html += '<a class="gm-d-btn" href="' + esc(extHref) + '" target="_blank" rel="noopener">' + esc(extLabel) + ' ↗</a>';
          }
          if (detail) {
            html += '<a class="gm-d-btn gm-d-btn--ghost" href="' + esc(detail) + '">完整记录 →</a>';
          }
          dLinks.innerHTML = html;
        }

        if (!dialog.open) dialog.showModal();
      });
    });

    if (dClose) {
      dClose.addEventListener('click', function () {
        dialog.close();
      });
    }
    dialog.addEventListener('click', function (ev) {
      if (ev.target === dialog) dialog.close();
    });
  }

  // 2. 静默拉取 /api/steam（支持单号与多号合并/分号切换）
  var steamSec = document.getElementById('gm-steam-section');
  var ledgerSteam = document.getElementById('gm-ledger-steam');
  var ledgerSteamVal = document.getElementById('gm-ledger-steam-val');
  var recentWrap = document.getElementById('gm-steam-recent-wrap');
  var recentGrid = document.getElementById('gm-steam-recent');
  var topGrid = document.getElementById('gm-steam-top');
  var summaryEl = document.getElementById('gm-steam-summary');
  var tabsEl = document.getElementById('gm-steam-tabs');

  function renderSteamView(view) {
    if (!view) return;
    steamByApp = view.byApp || {};

    // 页头实况刻度补全 Steam 游戏库总数与总时长
    if (ledgerSteam && ledgerSteamVal && view.summary) {
      ledgerSteamVal.textContent =
        view.summary.totalGames + ' 款 · ' + Number(view.summary.totalHours || 0).toLocaleString('en-US') + ' h';
      ledgerSteam.hidden = false;
    }

    // 给常玩卡片点亮真实总时长
    tiles.forEach(function (tile) {
      var appid = tile.getAttribute('data-steam-app');
      var slot = tile.querySelector('[data-gm-hours]');
      if (!slot) return;
      var st = appid ? steamByApp[appid] : null;
      if (st && st.hoursTotal > 0) {
        slot.textContent = fmtHours(st.hoursTotal);
        slot.hidden = false;
      } else {
        slot.textContent = '';
        slot.hidden = true;
      }
    });

    if (!steamSec) return;
    if (summaryEl && view.summary) {
      var parts = [
        '库内 ' + view.summary.totalGames + ' 款',
        '累计 ' + Number(view.summary.totalHours || 0).toLocaleString('en-US') + ' 小时',
      ];
      if (view.summary.recentHours > 0) {
        parts.push('近两周 ' + view.summary.recentHours + ' 小时');
      }
      summaryEl.textContent = parts.join(' · ');
    }

    // 近两周在玩
    if (recentWrap && recentGrid) {
      if (Array.isArray(view.recent) && view.recent.length) {
        recentGrid.innerHTML = view.recent
          .map(function (g) {
            return (
              '<a class="gm-st-recent" href="' + esc(g.url) + '" target="_blank" rel="noopener">' +
              '<img class="gm-st-img" src="' + esc(g.img) + '" alt="' + esc(g.name) + '" loading="lazy" />' +
              '<span class="gm-st-info">' +
              '<span class="gm-st-name">' + esc(g.name) + '</span>' +
              '<span class="gm-st-meta">近两周 ' + esc(fmtHours(g.hours2w)) + ' · 总计 ' + esc(fmtHours(g.hoursTotal)) + '</span>' +
              '</span>' +
              '</a>'
            );
          })
          .join('');
        recentWrap.hidden = false;
      } else {
        recentGrid.innerHTML = '';
        recentWrap.hidden = true;
      }
    }

    // 总时长 Top 12
    if (topGrid) {
      if (Array.isArray(view.top) && view.top.length) {
        var maxH = view.top[0].hoursTotal || 1;
        topGrid.innerHTML = view.top
          .map(function (g, i) {
            var pct = Math.max(4, Math.round((g.hoursTotal / maxH) * 100));
            return (
              '<a class="gm-st-row" href="' + esc(g.url) + '" target="_blank" rel="noopener">' +
              '<span class="gm-st-rank">' + String(i + 1).padStart(2, '0') + '</span>' +
              '<img class="gm-st-thumb" src="' + esc(g.img) + '" alt="' + esc(g.name) + '" loading="lazy" />' +
              '<span class="gm-st-main">' +
              '<span class="gm-st-name">' + esc(g.name) + '</span>' +
              '<span class="gm-st-bar"><i style="width:' + pct + '%"></i></span>' +
              '</span>' +
              '<span class="gm-st-hrs">' + esc(fmtHours(g.hoursTotal)) + '</span>' +
              '</a>'
            );
          })
          .join('');
      } else {
        topGrid.innerHTML = '';
      }
    }

    steamSec.hidden = false;
  }

  fetch('/api/steam', { credentials: 'same-origin' })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (data) {
      if (!data || !data.available) return;

      var viewMap = { all: data };
      var accounts = Array.isArray(data.accounts) ? data.accounts : [];

      if (tabsEl && accounts.length > 1) {
        var btnsHtml = '<button type="button" class="gm-st-tab" data-steam-view="all" aria-pressed="true">全部</button>';
        accounts.forEach(function (acc) {
          if (!acc || !acc.key) return;
          viewMap[acc.key] = acc;
          btnsHtml +=
            '<button type="button" class="gm-st-tab" data-steam-view="' +
            esc(acc.key) +
            '" aria-pressed="false">' +
            esc(acc.label || acc.key) +
            '</button>';
        });
        tabsEl.innerHTML = btnsHtml;
        tabsEl.hidden = false;

        tabsEl.addEventListener('click', function (ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest('[data-steam-view]') : null;
          if (!btn) return;
          var key = btn.getAttribute('data-steam-view');
          if (!key || !viewMap[key]) return;
          var allBtns = tabsEl.querySelectorAll('[data-steam-view]');
          Array.prototype.forEach.call(allBtns, function (b) {
            b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
          });
          renderSteamView(viewMap[key]);
        });
      }

      renderSteamView(data);
    })
    .catch(function () {
      /* 静默降级 */
    });
})();
