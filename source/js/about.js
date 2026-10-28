/* global window, document, navigator, setTimeout, clearTimeout */

'use strict';

// 关于页联系方式复制（2026-10-28）
//
// 为什么不用 mailto：mailto 依赖访客本机注册了默认邮件客户端。装了 Outlook/邮件 App 的机器上
// 会跳出写信窗口（很多人只是想要地址，不是现在写信）；没装的 Windows 上点了要么毫无反应，
// 要么弹「找不到应用」。这里改成点一下就复制，任何人都能粘到自己在用的邮箱里去。
//
// 自包含：不依赖 jQuery / Fluid.utils。defer 加载，执行时 DOM 已就绪。
(function () {
  var TOAST_ID = 'about-copy-toast';
  var hideTimer = null;

  function ensureToast() {
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.className = 'about-copy-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(msg) {
    var el = ensureToast();
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2400);
  }

  // navigator.clipboard 只在安全上下文（https / localhost）可用，http 下退回 execCommand。
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = !!document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return legacyCopy(text);
        }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  // 事件委托：图标内部的 <i> 也会命中，closest 往回找带 data-copy 的那一层。
  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    var trigger = target.closest('[data-copy]');
    if (!trigger) return;
    ev.preventDefault();
    var text = trigger.getAttribute('data-copy') || '';
    if (!text) return;
    writeClipboard(text).then(function (ok) {
      // 复制失败时仍把地址显示出来，访客至少能手动选中。
      toast(ok ? '已复制：' + text : '复制没成功，地址是：' + text);
    });
  });
})();
