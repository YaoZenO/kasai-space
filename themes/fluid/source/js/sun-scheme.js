/* global window, document */
/**
 * 时间层：当地日出日落驱动的明暗自动切换（Phase 4A，2026-11-11）
 *
 * 三层优先级：手动 > 当地日出日落 > 系统偏好。本模块只负责第二层「何时生效」，
 * 不含任何视觉声明、不新增任何元素、不新增任何 UI 文案。
 *
 * 边界（与《时间驱动日夜模式的行为不变式》逐条对应）：
 *   · 绝不写 data-user-color-scheme（该属性只表示访客手动选过）。时间层只用独立
 *     标记 data-sun-scheme 施加明暗；手动态与降级态一律不设置或清除该标记。
 *   · 明暗只由接口/缓存给出的真实 sunrise/sunset 与当前时刻比较得出，sunrise/sunset
 *     是 UTC 绝对时刻，与 Date.now() 同一基准（R-D），不读设备本地钟点、不猜时刻、
 *     不做任何钟点兜底。
 *   · 首屏定态由两侧 head 的同源内联同步脚本完成（读当日缓存）；本模块 defer 执行，
 *     负责接口回填、跨日出/日落的自动切换、清除手动值后的回落、以及统一 UI 同步。
 *   · 缓存只用于首屏 boot 的同步定态；本模块每次页面加载都无条件请求一次接口，
 *     用返回值覆盖缓存并重算，绝不因「缓存当天有效」而跳过请求。跨天旧缓存可能
 *     让首屏误判一帧，接口回填立即校正（数据到达后的切换，不属 FOUC）。
 *   · 位置不可用时干净降级：清除时间标记、不发估算、让 CSS 跟随系统分支接管。
 *   · 缓存只写 4 个派生字段（date / sunrise / sunset / fp），不下发也不落盘访客地址、
 *     原始请求头、完整精度经纬度、地区名称、访问时间或任何身份/行踪数据。
 */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  var MANUAL_KEY = 'Fluid_Color_Scheme';
  var CACHE_KEY = 'Fluid_Sun_Scheme';
  var MANUAL_ATTR = 'data-user-color-scheme';
  var TIME_ATTR = 'data-sun-scheme';
  var EVENT = 'kasai:sun-scheme';
  var API = '/api/sun-times';

  // 2026-11-14：访客经代理 / VPN / 漫游访问时，平台地理头定位到的是网络出口而非访客所在地，
  // 会出现「当地已是深夜、站点仍按出口所在地白天显示浅色」。这里只上报一个整数——设备
  // 当前 UTC 偏移分钟数——供端点校正经度；不下发时区名、坐标、IP 或任何身份 / 行踪字段。
  // 明暗比较仍由端点返回 UTC 绝对时刻后统一进行，不拿设备本地钟点裸比异地日出日落。
  function deviceUtcOffset() {
    try {
      var v = -new Date().getTimezoneOffset();
      return (typeof v === 'number' && isFinite(v)) ? Math.round(v) : null;
    } catch (e) {
      return null; // 环境不提供时区 API（含测试沙箱）时保持原有请求形态
    }
  }
  function apiUrl() {
    var off = deviceUtcOffset();
    return off === null ? API : API + '?tzoff=' + off;
  }
  var DAY_MS = 86400000;
  var FETCH_TIMEOUT_MS = 5000;

  var running = false;
  var timer = null;
  var currentCache = null;

  function getLS(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function setLS(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function manualValue() {
    var v = getLS(MANUAL_KEY);
    return (v === 'light' || v === 'dark') ? v : null;
  }
  function hasManual() {
    return manualValue() !== null || root.hasAttribute(MANUAL_ATTR);
  }

  // 缓存字段白名单：只有这 4 个派生字段；缺字段 / 解析异常 / 超出合理范围 / 损坏均视为失效。
  function parseCache(raw) {
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (!c || typeof c !== 'object'
        || typeof c.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)
        || typeof c.sunrise !== 'number' || !isFinite(c.sunrise)
        || typeof c.sunset !== 'number' || !isFinite(c.sunset)
        || typeof c.fp !== 'string' || !/^[0-9a-f]{8}$/.test(c.fp)
        || !(c.sunrise > 0) || !(c.sunset > c.sunrise)
        || (c.sunset - c.sunrise) > DAY_MS) return null;
      return c;
    } catch (e) {
      return null;
    }
  }

  // 跨天失效：用接口给出的真实 sunrise 的绝对时刻周期判定，不依赖设备本地钟点或时区名。
  // 标记存在但已越过次日日出时，缓存不再覆盖当前昼夜周期，等接口回填。
  function cacheAlive(c, now) {
    return now >= c.sunrise - DAY_MS && now < c.sunrise + DAY_MS;
  }

  // 唯一的明暗判定（§2.2 允许的正向比较）：真实 sunrise/sunset 与当前时刻在同一 UTC 基准下比较。
  function computeScheme(c, now) {
    return (now >= c.sunrise && now < c.sunset) ? 'light' : 'dark';
  }

  // 统一 UI 同步入口：任何一层改变生效态后都走同一套既有函数（图标 / aria / theme-color /
  // 代码高亮 / iframe）。manual=true 时只清生效态、不覆盖手动按钮已经同步好的 UI。
  function emit(scheme, active, manual) {
    if (!document.dispatchEvent) return;
    try {
      var detail = { scheme: scheme, active: !!active, manual: !!manual };
      var ev;
      if (typeof CustomEvent === 'function') {
        ev = new CustomEvent(EVENT, { detail: detail });
      } else {
        ev = document.createEvent('CustomEvent');
        ev.initCustomEvent(EVENT, false, false, detail);
      }
      document.dispatchEvent(ev);
    } catch (e) {}
  }

  function applyTimeLayer(c, now) {
    // 双保险：CSS 分支② 按规格用逗号并列、不加手动属性卫兵，因此这里必须保证
    // 「手动属性 + 时间标记」的不一致态绝不出现。手动值一旦出现立即退出并清标记。
    if (hasManual()) { stopForManual(); return; }
    var scheme = computeScheme(c, now);
    if (root.getAttribute(TIME_ATTR) !== scheme) root.setAttribute(TIME_ATTR, scheme);
    emit(scheme, true, false);
  }

  // 第 4 类降级：清空时间层独立标记，手动属性保持不存在，让 CSS 跟随系统分支接管。
  function fallbackToSystem() {
    if (root.hasAttribute(TIME_ATTR)) root.removeAttribute(TIME_ATTR);
    if (timer) { clearTimeout(timer); timer = null; }
    emit(null, false, false);
  }

  // 状态机 #1：手动态恒定。时间层完全不参与判定，仅清除可能残留的时间标记，
  // 不读缓存定态、不取接口、不设切换定时器。
  function stopForManual() {
    running = false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (root.hasAttribute(TIME_ATTR)) root.removeAttribute(TIME_ATTR);
    emit(null, false, true);
  }

  function onUnavailable() {
    if (hasManual()) { stopForManual(); return; }
    currentCache = null;
    fallbackToSystem();
  }

  function onData(data) {
    if (hasManual()) { stopForManual(); return; }
    if (!data || data.available !== true
      || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
      || typeof data.sunrise !== 'number' || !isFinite(data.sunrise)
      || typeof data.sunset !== 'number' || !isFinite(data.sunset)
      || typeof data.fp !== 'string' || !/^[0-9a-f]{8}$/.test(data.fp)
      || !(data.sunrise > 0) || !(data.sunset > data.sunrise)
      || (data.sunset - data.sunrise) > DAY_MS) {
      onUnavailable();
      return;
    }
    var c = {
      date: data.date,
      sunrise: Math.round(data.sunrise),
      sunset: Math.round(data.sunset),
      fp: data.fp
    };
    setLS(CACHE_KEY, JSON.stringify(c));
    var now = Date.now();
    if (!cacheAlive(c, now)) { onUnavailable(); return; }
    currentCache = c;
    applyTimeLayer(c, now);
    schedule(c, now);
  }

  function refresh() {
    if (hasManual()) return;
    if (typeof fetch !== 'function') { onUnavailable(); return; }
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var opts = ctrl ? { signal: ctrl.signal, credentials: 'same-origin' }
      : { credentials: 'same-origin' };
    var settled = false;
    var timeoutId = setTimeout(function () {
      if (settled) return;
      settled = true;
      if (ctrl) ctrl.abort();
      onUnavailable();
    }, FETCH_TIMEOUT_MS);
    try {
      fetch(apiUrl(), opts).then(function (res) {
        if (!res || !res.ok) throw new Error('sun-times-unavailable');
        return res.json();
      }).then(function (data) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        onData(data);
      }).catch(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        onUnavailable();
      });
    } catch (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      onUnavailable();
    }
  }

  // 页面开着跨日出/日落那一刻自动切换，无需刷新。切换点全部取自接口/缓存给的真实
  // sunrise/sunset；后继日的两个点只作「重新取数」的触发时刻，绝不用于判定明暗。
  function schedule(c, now) {
    if (timer) clearTimeout(timer);
    var points = [c.sunrise, c.sunset, c.sunrise + DAY_MS, c.sunset + DAY_MS];
    var next = Infinity;
    for (var i = 0; i < points.length; i++) {
      if (points[i] > now && points[i] < next) next = points[i];
    }
    var delay = (next === Infinity) ? 60000 : Math.min(next - now, DAY_MS);
    timer = setTimeout(function () {
      timer = null;
      var t = Date.now();
      if (hasManual()) { stopForManual(); return; }
      if (!currentCache || !cacheAlive(currentCache, t)) {
        refresh();
        return;
      }
      applyTimeLayer(currentCache, t);
      schedule(currentCache, t);
    }, delay);
  }

  function enterAuto() {
    if (running) return;
    watchManualAttribute();
    running = true;
    var c = parseCache(getLS(CACHE_KEY));
    var now = Date.now();
    if (c && cacheAlive(c, now)) {
      currentCache = c;
      applyTimeLayer(c, now);   // 先按首屏缓存校正统一 UI，不等接口
      schedule(c, now);
    } else {
      currentCache = null;
      fallbackToSystem();      // 首屏/缓存失效：系统兜底，稳定呈现
    }
    refresh();                  // 接口回填校正（数据到达后的切换，不属 FOUC）
  }

  function onStorage(e) {
    if (e && e.key && e.key !== MANUAL_KEY && e.key !== CACHE_KEY) return;
    if (hasManual()) {
      if (running) stopForManual();
      return;
    }
    if (!running) { enterAuto(); return; }
    var c = parseCache(getLS(CACHE_KEY));
    var now = Date.now();
    if (c && cacheAlive(c, now)) {
      currentCache = c;
      applyTimeLayer(c, now);
      schedule(c, now);
    } else {
      fallbackToSystem();
      refresh();
    }
  }

  function onVisibility() {
    if (document.hidden) return;
    if (hasManual()) {
      if (running) stopForManual();
      return;
    }
    if (!running) { enterAuto(); return; }
    var c = parseCache(getLS(CACHE_KEY));
    var now = Date.now();
    if (c && cacheAlive(c, now)) {
      currentCache = c;
      applyTimeLayer(c, now);
      schedule(c, now);
    }
    refresh();
  }

  var manualObserver = null;
  function watchManualAttribute() {
    if (manualObserver || typeof MutationObserver !== 'function' || !root) return;
    manualObserver = new MutationObserver(function () {
      if (hasManual()) {
        if (running || root.hasAttribute(TIME_ATTR)) stopForManual();
      } else if (!running) {
        enterAuto();          // 状态机 #8：清除手动值后立刻回落，无需刷新
      }
    });
    manualObserver.observe(root, { attributes: true, attributeFilter: [MANUAL_ATTR] });
  }

  function boot() {
    if (window.addEventListener) window.addEventListener('storage', onStorage);
    if (document.addEventListener) document.addEventListener('visibilitychange', onVisibility);
    if (hasManual()) {
      // 状态机 #1：手动态恒定。时间层完全不启动——不注册属性观察、不取接口、
      // 不设切换定时器、不写任何 DOM（只清可能残留的时间标记）。
      if (root.hasAttribute(TIME_ATTR)) root.removeAttribute(TIME_ATTR);
      return;
    }
    enterAuto();
  }

  boot();
})(window, document);
