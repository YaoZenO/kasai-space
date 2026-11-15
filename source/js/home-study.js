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
        tones: [[0.26, 0.222, 0.172], [0.108, 0.095, 0.078], [0.05, 0.044, 0.036]],
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
    /** tone 传 0/1/2 时强制用该色阶（围合压暗、核心提亮都要靠它），不传则按法线取 */
    function box(x, y, z, w, h, d, tone) {
      var x0 = x - w / 2, x1 = x + w / 2;
      var y0 = y, y1 = y + h;
      var z0 = z - d / 2, z1 = z + d / 2;
      function col(n) { return tone === 0 || tone === 1 || tone === 2 ? pal.tones[tone] : shade(n); }
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

    /** 绕 y 轴转过的盒子：内殿的核心装置要用它叠出旋转的层次 */
    function boxRy(x, y, z, w, h, d, ry) {
      var cs = Math.cos(ry);
      var sn = Math.sin(ry);
      var P = function (a, b, e) {
        return [x + (a * w / 2) * cs + (e * d / 2) * sn, y + b * h / 2, z - (a * w / 2) * sn + (e * d / 2) * cs];
      };
      var c = [
        P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1),
        P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1),
      ];
      quad(c[0], c[1], c[2], c[3], shade([0, -1, 0]));
      quad(c[4], c[5], c[6], c[7], shade([0, 1, 0]));
      quad(c[0], c[1], c[5], c[4], shade([0, 0, -1]));
      quad(c[3], c[2], c[6], c[7], shade([0, 0, 1]));
      quad(c[0], c[3], c[7], c[4], shade([-1, 0, 0]));
      quad(c[1], c[2], c[6], c[5], shade([1, 0, 0]));
    }

    // 确定性伪随机：每次构建同一座展厅，不做「随机生成」的假惊喜
    var seed = 20231115;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    // 空间分三段，对应三屏：外景前庭（z 正）→ 柱廊主厅（z 0…-40）→ 内殿光井（z -42…-78）
    // 观众沿着 -z 单向推进，永不回头。
    var DOOR = 7;          // 门洞半宽
    var HALL_H = 17;       // 主厅净高
    var SANCT = -60;       // 内殿核心所在

    function build() {
      V.length = 0;
      seed = 20231115;
      LIGHT = norm([-0.42, 0.76, 0.5]);

      // —— 地面：一整块，从前庭铺到内殿 ——
      quad([-90, -2, 86], [90, -2, 86], [90, -2, -100], [-90, -2, -100], pal.tones[1]);

      // —— 内殿静水面：比地面亮一档，读作反光 ——
      quad([-13, -0.4, -42], [13, -0.4, -42], [13, -0.4, -76], [-13, -0.4, -76], pal.tones[2]);

      // —— 外立面：两翼实墙 + 门楣，中间留门洞 ——
      box(-(DOOR + 13), -2, 10, 26, 30, 2.4, 1);
      box(DOOR + 13, -2, 10, 26, 30, 2.4, 1);
      box(0, 21, 10, DOOR * 2, 7, 2.4, 1);
      // 门前台阶与门框
      box(0, -2, 13, 30, 1.2, 6);
      box(-DOOR, -2, 10, 1.2, 21, 3);
      box(DOOR, -2, 10, 1.2, 21, 3);

      // —— 柱廊：七开间，柱头 + 柱身 ——
      var zs = [];
      for (var i = 0; i < 7; i += 1) zs.push(4 - i * 7);
      zs.forEach(function (z) {
        [-9.5, 9.5].forEach(function (x) {
          box(x, -2, z, 1.6, HALL_H + 2, 1.6);
          box(x, HALL_H, z, 2.4, 0.8, 2.4);
        });
        box(0, HALL_H + 0.8, z, 21, 0.5, 0.9);
      });

      // —— 顶部天光格栅：纵向主梁，让抬头有结构 ——
      [-9.5, -3.2, 3.2, 9.5].forEach(function (x) {
        box(x, HALL_H + 0.9, -17, 0.7, 0.6, 50);
      });

      // —— 内殿围合：两侧墙 + 后墙，把空间收成一口"井" ——
      box(-15, -2, SANCT - 8, 2.6, 32, 44, 2);
      box(15, -2, SANCT - 8, 2.6, 32, 44, 2);
      box(0, -2, -82, 32, 32, 2.6, 2);

      // —— 天花板：围着核心挖一口 14×14 的天窗，光从洞正上方落下 ——
      box(0, 24, SANCT - 15, 32, 1.4, 16, 2);   // 天窗之后
      box(0, 24, SANCT + 15, 32, 1.4, 16, 2);   // 天窗之前
      box(-11.5, 24, SANCT, 9, 1.4, 14, 2);     // 天窗左侧
      box(11.5, 24, SANCT, 9, 1.4, 14, 2);      // 天窗右侧

      // —— 核心装置：三层旋转台 + 中柱 + 悬浮冠，立在静水中央 ——
      boxRy(0, 0.6, SANCT, 17, 1.1, 17, 0.5);
      boxRy(0, 1.9, SANCT, 13, 1.1, 13, 0);
      boxRy(0, 3.2, SANCT, 9.4, 1.1, 9.4, -0.5);
      boxRy(0, 4.5, SANCT, 6, 1.1, 6, 0.25);
      box(0, 5.8, SANCT, 2.6, 8.6, 2.6, 0);
      boxRy(0, 15.2, SANCT, 7.4, 1.1, 7.4, 0.4);

      // —— 光池：天窗正下方，把"光落下来"画成一块亮面 ——
      quad([-7, 0.12, SANCT - 7], [7, 0.12, SANCT - 7], [7, 0.12, SANCT + 7], [-7, 0.12, SANCT + 7], pal.tones[0]);

      // —— 踏步：从主厅下到内殿，两级，给"抵达"一个动作 ——
      box(0, -0.6, -41, 30, 0.9, 4, 1);
      box(0, -1.4, -45, 30, 0.9, 4, 1);

      // —— 前庭两侧矮墙：给外景一个边界，避免广场漫无边 ——
      box(-26, -2, 40, 2, 2.4, 60);
      box(26, -2, 40, 2, 2.4, 60);
    }

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
    // 三档都是沿 -z 前进，z 严格递减：外景 → 门廊 → 主厅；内殿由第三档的落点承担，
    // 不存在"滑到底又退回门口"的倒车。
    // 三档沿 -z 单向推进，z 严格递减：外景 → 门廊主厅 → 内殿核心。
    // 不设"回望"的关键帧，滚到底不会倒车回门口。
    var STOPS = [
      // 第一屏：建筑外景远眺。门洞偏右，左侧大片广场与远景留给 /KASAI
      { eye: [14, 9.5, 46], ctr: [-9, 9, 8], fov: 48 },
      // 第二屏：跨过门槛进入主厅，柱列在视野两侧展开
      { eye: [0, 6.8, 8], ctr: [0, 7, -26], fov: 54 },
      // 第三屏：走完长廊下两级台阶，正对内殿核心与天窗
      { eye: [0, 4.4, -24], ctr: [0, 7.6, SANCT], fov: 50 },
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

  // ================= 2. 导航：只在第二屏浮现完整胶囊 =================

  (function nav() {
    var desk = doc.getElementById('desk');
    var body = doc.body;
    if (!desk || !body) return;
    var queued = false;

    function sync() {
      queued = false;
      var r = desk.getBoundingClientRect();
      // 视口中线落在第二屏内 → 展开导航
      var mid = (window.innerHeight || 0) * 0.5;
      var on = r.top <= mid && r.bottom >= mid;
      body.classList.toggle('nav-desk', on);
    }

    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(sync);
    }, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  })();

  // ================= 3. 浮层 =================

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

  // ================= 4. 落幕屏倒计时 =================

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
