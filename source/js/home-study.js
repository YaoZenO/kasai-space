/* global window, document */

'use strict';

// 首页「三屏」交互层（2026-11-15 第三版：WebGL 空间场景）
//
// 机制取自 0z5a.github.io 的内联脚本（本地 curl 完整读过）：
//   · 场景画在 <canvas> 上，webgl + depth，几何在 CPU 上拼成顶点数组，一次性上传；
//   · 着色是「三档色阶的平面着色」——每个面算法线，与固定光向点积后落到三档之一，不做真实光照；
//   · 顶点着色器只做相机矩阵与雾的混合；相机是一条关键帧样条，随滚动在三屏之间推进；
//   · 片元着色器叠胶片颗粒、极轻行纹与一条缓慢滚动的亮带。
//
// 本站不复制它的像素：柱廊 + 横梁 + 后墙 + 悬垂缎带的程序化展厅，三段相机轨迹，
// 配色取站点暖纸 / 黑曜石两套，零图片请求。
//
// 另外三件事：原生 <dialog> 浮层、落幕屏倒计时、WebGL 不可用时干净降级。

(function () {
  var doc = document;

  function prefersReduce() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function isDark() {
    var r = doc.documentElement;
    var u = r.getAttribute('data-user-color-scheme');
    if (u) return u === 'dark';
    var s = r.getAttribute('data-sun-scheme');
    if (s) return s === 'dark';
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  }

  // ================= 1. 展厅 =================

  (function scene() {
    var cv = doc.getElementById('sd-canvas');
    if (!cv) return;

    var gl = null;
    try {
      gl = cv.getContext('webgl', {
        antialias: true,
        alpha: false,
        depth: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      gl = null;
    }
    if (!gl) {
      cv.style.display = 'none'; // 不假装有场景，也不抛错
      return;
    }

    var reduce = prefersReduce();

    var THEME = {
      light: {
        bg: [0.98, 0.965, 0.933],
        tones: [[0.945, 0.925, 0.888], [0.876, 0.84, 0.774], [0.738, 0.69, 0.61]],
        accent: [0.69, 0.416, 0.29],
      },
      dark: {
        bg: [0.102, 0.094, 0.078],
        tones: [[0.19, 0.163, 0.126], [0.108, 0.095, 0.078], [0.052, 0.046, 0.038]],
        accent: [0.851, 0.467, 0.341],
      },
    };
    var pal = THEME[isDark() ? 'dark' : 'light'];

    // ---- 向量 / 矩阵（只做这里要用的） ----
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

    function perspective(fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2);
      var nf = 1 / (near - far);
      return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    }
    function lookAt(eye, ctr, up) {
      var z = norm(sub(eye, ctr));
      var x = norm(cross(up, z));
      var y = cross(z, x);
      return [
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
      ];
    }

    // ---- 几何：顶点格式 pos(3) + color(3) ----
    var LIGHT = norm([-0.42, 0.76, 0.5]);
    var V = [];

    function push(p, col) { V.push(p[0], p[1], p[2], col[0], col[1], col[2]); }
    function quad(a, b, c, d, col) {
      push(a, col); push(b, col); push(c, col);
      push(a, col); push(c, col); push(d, col);
    }
    function shade(n) {
      var d = dot(n, LIGHT);
      return pal.tones[d > 0.42 ? 0 : d > -0.12 ? 1 : 2];
    }

    /** 实体盒子：8 个角、6 个面，每个面按法线取三档色之一 */
    function box(x, y, z, w, h, d, accent) {
      var x0 = x - w / 2, x1 = x + w / 2;
      var y0 = y, y1 = y + h;
      var z0 = z - d / 2, z1 = z + d / 2;
      function col(n) { return accent ? pal.accent : shade(n); }
      var P = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
      ];
      quad(P[0], P[1], P[2], P[3], col([0, -1, 0]));
      quad(P[4], P[5], P[6], P[7], col([0, 1, 0]));
      quad(P[0], P[1], P[5], P[4], col([0, 0, -1]));
      quad(P[3], P[2], P[6], P[7], col([0, 0, 1]));
      quad(P[0], P[3], P[7], P[4], col([-1, 0, 0]));
      quad(P[1], P[2], P[6], P[5], col([1, 0, 0]));
    }

    function ribbon(x, y, z, w, h) {
      var a = [x - w / 2, y, z];
      var b = [x + w / 2, y, z];
      var c = [x + w / 2, y - h, z];
      var d = [x - w / 2, y - h, z];
      quad(a, b, c, d, pal.accent);
    }

    // 确定性伪随机：每次构建同一座展厅，不做「随机生成」的假惊喜
    var seed = 20231115;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    var ROWS = [-9.5, 9.5];
    var ZS = [];
    for (var i = 0; i < 11; i += 1) ZS.push(8 - i * 7);

    function build() {
      V.length = 0;
      seed = 20231115;
      LIGHT = norm([-0.42, 0.76, 0.5]);

      // 地面：一整块，给柱廊一个落脚的平面
      quad([-70, -2, 26], [70, -2, 26], [70, -2, -86], [-70, -2, -86], pal.tones[2]);

      ZS.forEach(function (z, idx) {
        var h = 14 + Math.round(rnd() * 4);
        ROWS.forEach(function (x) {
          box(x, -2, z, 1.5, h + 2, 1.5);   // 柱身
          box(x, h, z, 2.3, 0.7, 2.3);      // 柱头
        });
        box(0, h + 0.6, z, 20.5, 0.5, 0.9); // 跨梁
        if (idx % 2 === 0) box(0, h - 1.7, z + 0.4, 20.5, 0.35, 0.6); // 次梁
      });

      // 两侧通长压梁
      ROWS.forEach(function (x) { box(x, 18.6, -27, 0.8, 0.8, 76); });

      // 后墙：一面大板，给纵深一个落点
      box(0, -2, -84, 46, 34, 1.6);

      // 悬垂缎带：三段强调色，挂在跨梁下
      ribbon(-3.2, 13.2, -6, 2.2, 9.2);
      ribbon(2.8, 13.2, -20, 2.4, 10.6);
      ribbon(-1.4, 13.2, -34, 2, 8.2);
    }
    build();

    // ---- 着色器 ----
    var VS = [
      'attribute vec3 p;',
      'attribute vec3 c;',
      'uniform mat4 uV;',
      'uniform mat4 uP;',
      'uniform vec3 uBg;',
      'uniform float uFog;',
      'varying vec3 vC;',
      'void main(){',
      '  vec4 v = uV * vec4(p, 1.0);',
      '  float d = length(v.xyz);',
      '  float f = clamp(1.0 - d / 190.0, 0.0, 1.0);',
      '  f = mix(f, f * 0.45, uFog);',
      '  vC = mix(uBg, c, f);',
      '  gl_Position = uP * v;',
      '}',
    ].join('\n');

    var FS = [
      'precision mediump float;',
      'varying vec3 vC;',
      'uniform float uT;',
      'void main(){',
      '  vec2 x = gl_FragCoord.xy;',
      '  vec2 g = floor(x / 1.5);',
      '  float n = fract(52.9829189 * fract(dot(g, vec2(0.06711056, 0.00583715))));',
      '  vec3 c = vC + (n - 0.5) * 0.032;',
      '  c *= 0.975 + 0.025 * step(0.5, fract(x.y / 3.0));',
      '  c += 0.012 * smoothstep(0.965, 1.0, fract(x.y * 0.0006 - uT * 0.02));',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n');

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      cv.style.display = 'none';
      return;
    }
    gl.useProgram(prog);

    var loc = {
      p: gl.getAttribLocation(prog, 'p'),
      c: gl.getAttribLocation(prog, 'c'),
      uV: gl.getUniformLocation(prog, 'uV'),
      uP: gl.getUniformLocation(prog, 'uP'),
      uBg: gl.getUniformLocation(prog, 'uBg'),
      uFog: gl.getUniformLocation(prog, 'uFog'),
      uT: gl.getUniformLocation(prog, 'uT'),
    };

    var buf = gl.createBuffer();
    function upload() {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc.p);
      gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc.c);
      gl.vertexAttribPointer(loc.c, 3, gl.FLOAT, false, 24, 12);
    }
    upload();

    // ---- 相机：三档关键帧 + Catmull-Rom 插值，对应三屏 ----
    var STOPS = [
      { eye: [0, 3.4, 30], ctr: [0, 8.2, -16], fov: 52 },   // 第一屏：厅外，看纵深
      { eye: [4.2, 11, 20], ctr: [0, 6.2, -22], fov: 46 }, // 第二屏：后退抬高偏轴，柱廊退成背景，窗口才是主体
      { eye: [0, 6.4, 40], ctr: [0, 8.4, -20], fov: 54 },   // 第三屏：退远，整座厅收进画面
    ];

    function catmull(a, b, c, d, t) {
      var t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    }
    function seg(u) {
      var n = STOPS.length - 1;
      var f = Math.min(n - 1e-6, Math.max(0, u * n));
      var i = Math.floor(f);
      return { i: i, t: f - i };
    }
    function sample(key, axis, u) {
      var s = seg(u);
      var g = function (k) {
        var idx = Math.max(0, Math.min(STOPS.length - 1, s.i - 1 + k));
        return STOPS[idx][key][axis];
      };
      return catmull(g(0), g(1), g(2), g(3), s.t);
    }
    function sampleFov(u) {
      var s = seg(u);
      var a = STOPS[s.i].fov;
      var b = STOPS[Math.min(STOPS.length - 1, s.i + 1)].fov;
      return a + (b - a) * s.t;
    }

    var W = 0, H = 0;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      gl.viewport(0, 0, cv.width, cv.height);
    }

    var p = 0, target = 0, t = 0, mx = 0, my = 0, tmx = 0, tmy = 0;

    function readProgress() {
      var max = doc.documentElement.scrollHeight - H;
      target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    }

    function draw() {
      var eye = [
        sample('eye', 0, p) + mx * 2.2,
        sample('eye', 1, p) + my * 0.8,
        sample('eye', 2, p),
      ];
      var ctr = [sample('ctr', 0, p) + mx * 0.6, sample('ctr', 1, p), sample('ctr', 2, p)];
      var Vm = lookAt(eye, ctr, [0, 1, 0]);
      var Pm = perspective((sampleFov(p) * Math.PI) / 180, W / Math.max(1, H), 0.1, 400);

      gl.clearColor(pal.bg[0], pal.bg[1], pal.bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      gl.uniformMatrix4fv(loc.uV, false, new Float32Array(Vm));
      gl.uniformMatrix4fv(loc.uP, false, new Float32Array(Pm));
      gl.uniform3f(loc.uBg, pal.bg[0], pal.bg[1], pal.bg[2]);
      // 中间屏雾最重：背景柔下去托住四个窗口
      gl.uniform1f(loc.uFog, 0.52 * Math.sin(p * Math.PI));
      gl.uniform1f(loc.uT, t);

      uploadBuffersIfNeeded();
      gl.drawArrays(gl.TRIANGLES, 0, V.length / 6);
      gl.disable(gl.DEPTH_TEST);
    }

    var dirty = false;
    function uploadBuffersIfNeeded() {
      if (!dirty) return;
      dirty = false;
      upload();
    }

    var raf = 0;
    var last = 0;
    function loop(now) {
      var dt = last ? Math.min(64, now - last) : 16;
      last = now;
      t += dt * 0.001;
      p += (target - p) * 0.08;
      mx += (tmx - mx) * 0.06;
      my += (tmy - my) * 0.06;
      draw();
      raf = window.requestAnimationFrame(loop);
    }

    resize();
    readProgress();
    p = target;

    window.addEventListener('resize', function () { resize(); readProgress(); }, { passive: true });
    window.addEventListener('scroll', readProgress, { passive: true });

    if (!reduce && window.matchMedia('(hover: hover)').matches) {
      doc.addEventListener('pointermove', function (ev) {
        tmx = (ev.clientX / (W || 1)) * 2 - 1;
        tmy = (ev.clientY / (H || 1)) * 2 - 1;
      }, { passive: true });
    }

    function refreshTheme() {
      pal = THEME[isDark() ? 'dark' : 'light'];
      build();      // 颜色烘在顶点里，必须重建
      dirty = true;
      if (reduce) draw();
    }

    if (reduce) {
      p = 0.34;   // 静态帧：停在第二屏的机位
      draw();
      window.addEventListener('resize', function () { resize(); draw(); }, { passive: true });
    } else {
      raf = window.requestAnimationFrame(loop);
      doc.addEventListener('visibilitychange', function () {
        if (doc.hidden) {
          window.cancelAnimationFrame(raf);
        } else {
          last = 0;
          raf = window.requestAnimationFrame(loop);
        }
      });
    }

    doc.addEventListener('kasai:sun-scheme', refreshTheme);
    try {
      new MutationObserver(refreshTheme).observe(doc.documentElement, {
        attributes: true,
        attributeFilter: ['data-user-color-scheme', 'data-sun-scheme'],
      });
    } catch (e) { /* 老浏览器忽略 */ }
  })();

  // ================= 2. 浮层 =================

  (function modal() {
    var dlg = doc.getElementById('sd-modal');
    if (!dlg || typeof dlg.showModal !== 'function') return;

    var elKicker = dlg.querySelector('[data-sd-kicker]');
    var elTitle = dlg.querySelector('[data-sd-title]');
    var elBody = dlg.querySelector('[data-sd-body]');
    var elMore = dlg.querySelector('[data-sd-more]');
    var elClose = dlg.querySelector('[data-sd-close]');
    var opener = null;

    function fill(tpl) {
      if (!tpl) return false;
      elTitle.textContent = tpl.getAttribute('data-sd-name') || '';
      elBody.textContent = '';
      var frag = tpl.content ? tpl.content.cloneNode(true) : null;
      if (frag) elBody.appendChild(frag);

      var href = tpl.getAttribute('data-sd-href') || '';
      var label = tpl.getAttribute('data-sd-more') || '';
      if (href && label) {
        elMore.setAttribute('href', href);
        elMore.textContent = label;
        elMore.hidden = false;
      } else {
        elMore.removeAttribute('href');
        elMore.textContent = '';
        elMore.hidden = true;
      }
      if (elKicker) elKicker.textContent = tpl.id === 'sd-tpl-wechat' ? '联系' : '造物';
      return true;
    }

    doc.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;

      if (target.closest('[data-sd-close]')) {
        ev.preventDefault();
        dlg.close();
        return;
      }

      var trigger = target.closest('[data-sd-open]');
      if (!trigger) return;
      var tpl = doc.getElementById('sd-tpl-' + trigger.getAttribute('data-sd-open'));
      if (!tpl) return;

      ev.preventDefault();
      opener = trigger;
      if (!fill(tpl)) return;
      dlg.showModal();
      if (elClose) {
        window.requestAnimationFrame(function () { elClose.focus(); });
      }
    });

    dlg.addEventListener('click', function (ev) {
      if (ev.target !== dlg) return;
      var r = dlg.getBoundingClientRect();
      var inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!inside) dlg.close();
    });

    dlg.addEventListener('close', function () {
      if (opener && typeof opener.focus === 'function') opener.focus();
      opener = null;
    });
  })();

  // ================= 3. 落幕屏倒计时 =================

  (function feed() {
    var node = doc.getElementById('sd-feed');
    if (!node) return;
    var list;
    try {
      list = JSON.parse(node.textContent || '[]');
    } catch (e) {
      return;
    }
    if (!Array.isArray(list) || !list.length) return;

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    function days(iso) {
      var q = String(iso).split('-');
      if (q.length !== 3) return null;
      var d = new Date(Number(q[0]), Number(q[1]) - 1, Number(q[2]));
      return Math.round((d - today) / 86400000);
    }

    var KIND = { 节气: 'term', 假期: 'holiday' };
    var seen = {};
    for (var i = 0; i < list.length; i += 1) {
      var ev = list[i];
      var slot = KIND[ev.k];
      if (!slot || seen[slot]) continue;
      var n = days(ev.d);
      if (n === null || n < 0) continue;
      var cell = doc.querySelector('[data-sd-feed="' + slot + '"]');
      if (!cell) continue;
      cell.textContent = String(n);
      seen[slot] = true;
    }
  })();
})();
