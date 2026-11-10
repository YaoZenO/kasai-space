/* global Fluid */

/**
 * Modified from https://blog.skk.moe/post/hello-darkmode-my-old-friend/
 *
 * 2026-11-09（暗色模式启用）：状态机改为「两态 + 默认跟随系统」。
 *   · 只有 light / dark 两态，存储键 Fluid_Color_Scheme 只写这两个值，没有 auto / 第三态；
 *   · DOM 上 data-user-color-scheme 属性存在 = 访客已手动选择；属性不存在 = 跟随系统；
 *   · 系统深色则暗、系统浅色或未表态则浅；不按本地时间 18:00–6:00 兜底；
 *   · 手动选择后 LS 永久保留，不再随系统偏好变化回退到自动；
 *   · 未手动选择时 matchMedia().change 只同步按钮/图标/aria/theme-color/代码高亮，不写属性。
 */
(function(window, document) {
  var rootElement = document.documentElement;
  var colorSchemaStorageKey = 'Fluid_Color_Scheme';
  var userColorSchemaAttributeName = 'data-user-color-scheme';
  var defaultColorSchemaAttributeName = 'data-default-color-scheme';
  var colorToggleButtonSelector = '#color-toggle-btn';
  var colorToggleIconSelector = '#color-toggle-icon';
  // 2026-11-11 修订：全站只保留顶栏一个切换按钮，九宫格格位与移动端专用选择器/绑定已移除。
  var iframeSelector = 'iframe';
  var darkMediaQuery = '(prefers-color-scheme: dark)';

  function setLS(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }

  function removeLS(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  }

  function getLS(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  function getSchemaFromHTML() {
    var res = rootElement.getAttribute(defaultColorSchemaAttributeName);
    if (typeof res === 'string') {
      return res.replace(/["'\s]/g, '');
    }
    return null;
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia(darkMediaQuery).matches);
  }

  // LS 为空 / 非法时移除属性，让 :root:not([data-user-color-scheme]) 的 CSS 分支接管跟随系统。
  // 注意：绝不能把系统偏好固化写成 data-user-color-scheme，否则 CSS 自动跟随分支会失效。
  function resetSchemaAttributeAndLS() {
    rootElement.removeAttribute(userColorSchemaAttributeName);
    removeLS(colorSchemaStorageKey);
  }

  var validColorSchemaKeys = {
    dark : true,
    light: true
  };

  function getDefaultColorSchema() {
    // 取默认字段的值；default: auto 不是有效态，继续按系统偏好判断
    var schema = getSchemaFromHTML();
    if (validColorSchemaKeys[schema]) {
      return schema;
    }
    // 默认 auto：只走 prefers-color-scheme，未表态一律浅色；不按本地时间兜底
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function applyCustomColorSchemaSettings(schema) {
    // 优先级：本次点击传入的新态 > localStorage 手动值 > 系统偏好 / 浅色
    var stored = getLS(colorSchemaStorageKey);
    var hasManual = !!(stored && validColorSchemaKeys[stored]);
    var current = schema || (hasManual ? stored : getDefaultColorSchema());

    if (!validColorSchemaKeys[current]) {
      // 非法值兜底：清 LS、移除属性，回到跟随系统
      resetSchemaAttributeAndLS();
      current = getDefaultColorSchema();
    } else if (hasManual || schema) {
      // 访客已手动选择：写属性，屏蔽 :root:not([data-user-color-scheme]) 的自动跟随分支
      rootElement.setAttribute(userColorSchemaAttributeName, current);
    } else {
      // 未手动选择：属性必须不存在，纯 CSS @media 自动跟随
      rootElement.removeAttribute(userColorSchemaAttributeName);
    }

    // 根据当前模式设置图标 / aria / meta theme-color
    setButtonIcon(current);

    // 设置代码高亮
    setHighlightCSS(current);

    // 设置其他应用
    setApplications(current);
  }

  var invertColorSchemaObj = {
    dark : 'light',
    light: 'dark'
  };

  function getIconClass(scheme) {
    return 'icon-' + scheme;
  }

  function toggleCustomColorSchema() {
    var currentSetting = getLS(colorSchemaStorageKey);

    if (validColorSchemaKeys[currentSetting]) {
      // 从 localStorage 中读取模式，并取相反的模式
      currentSetting = invertColorSchemaObj[currentSetting];
    } else {
      // LS 为空或非法：先按按钮的状态进行切换，再按当前生效态取反
      if (currentSetting !== null) removeLS(colorSchemaStorageKey);
      var iconElement = document.querySelector(colorToggleIconSelector);
      if (iconElement) {
        currentSetting = iconElement.getAttribute('data');
      }
      if (!iconElement || !validColorSchemaKeys[currentSetting]) {
        currentSetting = invertColorSchemaObj[getDefaultColorSchema()];
      }
    }
    // 只写 light / dark，绝不写 auto
    setLS(colorSchemaStorageKey, currentSetting);

    return currentSetting;
  }

  // 跟随系统态也要与当前生效底色一致：从 getComputedStyle 取 token，不新增硬编码色值。
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var color = getComputedStyle(rootElement).getPropertyValue('--navbar-bg-color').trim();
    if (color) meta.setAttribute('content', color);
  }

  function setButtonIcon(schema) {
    if (!validColorSchemaKeys[schema]) return;

    // 切换图标（沿用 Fluid 原厂双图标 + hover 预览逻辑）
    var icon = getIconClass(schema);
    var iconElement = document.querySelector(colorToggleIconSelector);
    if (iconElement) {
      iconElement.setAttribute('class', 'iconfont ' + icon);
      iconElement.setAttribute('data', invertColorSchemaObj[schema]);
    } else {
      Fluid.utils.waitElementLoaded(colorToggleIconSelector, function() {
        var iconElement = document.querySelector(colorToggleIconSelector);
        if (iconElement) {
          iconElement.setAttribute('class', 'iconfont ' + icon);
          iconElement.setAttribute('data', invertColorSchemaObj[schema]);
        }
      });
    }

    // 功能性文案：图标 + aria-pressed 三重编码，不单靠颜色表达状态
    // 2026-11-11 修订：全站只保留顶栏一个按钮，aria-label / aria-pressed 只同步这一个。
    var target = invertColorSchemaObj[schema];
    var label = target === 'dark' ? '切换到深色模式' : '切换到浅色模式';
    var pressed = schema === 'dark' ? 'true' : 'false';
    var btn = document.querySelector(colorToggleButtonSelector);
    if (btn) {
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', pressed);
    }

    syncThemeColor();
  }

  function setHighlightCSS(schema) {
    // 启用对应的代码高亮的样式
    var lightCss = document.getElementById('highlight-css');
    var darkCss = document.getElementById('highlight-css-dark');
    if (schema === 'dark') {
      if (darkCss) {
        darkCss.removeAttribute('disabled');
      }
      if (lightCss) {
        lightCss.setAttribute('disabled', '');
      }
    } else {
      if (lightCss) {
        lightCss.removeAttribute('disabled');
      }
      if (darkCss) {
        darkCss.setAttribute('disabled', '');
      }
    }

    setTimeout(function() {
      // 设置代码块组件样式
      document.querySelectorAll('.markdown-body pre').forEach((pre) => {
        var cls = Fluid.utils.getBackgroundLightness(pre) >= 0 ? 'code-widget-light' : 'code-widget-dark';
        var widget = pre.querySelector('.code-widget-light, .code-widget-dark');
        if (widget) {
          widget.classList.remove('code-widget-light', 'code-widget-dark');
          widget.classList.add(cls);
        }
      });
    }, 200);
  }

  function setApplications(schema) {
    // 设置 remark42 评论主题
    if (window.REMARK42) {
      window.REMARK42.changeTheme(schema);
    }

    // 设置 cusdis 评论主题
    if (window.CUSDIS) {
      window.CUSDIS.setTheme(schema);
    }

    // 设置 utterances 评论主题
    var utterances = document.querySelector('.utterances-frame');
    if (utterances) {
      var utterancesTheme = schema === 'dark' ? window.UtterancesThemeDark : window.UtterancesThemeLight;
      const message = {
        type : 'set-theme',
        theme: utterancesTheme
      };
      utterances.contentWindow.postMessage(message, 'https://utteranc.es');
    }

    // 设置 giscus 评论主题
    var giscus = document.querySelector('iframe.giscus-frame');
    if (giscus) {
      var giscusTheme = schema === 'dark' ? window.GiscusThemeDark : window.GiscusThemeLight;
      const message = {
        setConfig: {
          theme: giscusTheme,
        }
      };
      // giscus.style.cssText += 'color-scheme: normal;';
      giscus.contentWindow.postMessage({ 'giscus': message }, 'https://giscus.app');
    }
  }

  // 系统偏好中途切换：仅在「属性不存在」（未手动选择）时同步 UI，手动选择后不再随系统变。
  function bindSystemPreferenceChange() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia(darkMediaQuery);
    var onChange = function() {
      if (rootElement.hasAttribute(userColorSchemaAttributeName)) return;
      var schema = getDefaultColorSchema();
      setButtonIcon(schema);
      setHighlightCSS(schema);
      setApplications(schema);
    };
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
    } else if (mq.addListener) {
      mq.addListener(onChange);
    }
  }

  // 当页面加载时，将显示模式设置为 localStorage 中自定义的值（如果有的话）
  applyCustomColorSchemaSettings();
  bindSystemPreferenceChange();

  Fluid.utils.waitElementLoaded(colorToggleIconSelector, function() {
    applyCustomColorSchemaSettings();
    var button = document.querySelector(colorToggleButtonSelector);
    if (button) {
      // 当用户点击切换按钮时，获得新的显示模式、写入 localStorage、并在页面上生效
      button.addEventListener('click', function() {
        applyCustomColorSchemaSettings(toggleCustomColorSchema());
      });
      var icon = document.querySelector(colorToggleIconSelector);
      if (icon) {
        // 光标悬停在按钮上时，切换图标
        button.addEventListener('mouseenter', function() {
          var current = icon.getAttribute('data');
          icon.classList.replace(getIconClass(invertColorSchemaObj[current]), getIconClass(current));
        });
        button.addEventListener('mouseleave', function() {
          var current = icon.getAttribute('data');
          icon.classList.replace(getIconClass(current), getIconClass(invertColorSchemaObj[current]));
        });
      }
    }
    // 2026-11-11 修订：不再有第二个按钮需要绑定，click / hover 预览全部由上面这一个按钮承担。
  });

  Fluid.utils.waitElementLoaded(iframeSelector, function() {
    applyCustomColorSchemaSettings();
  });

})(window, document);
