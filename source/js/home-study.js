/* global window, document */

'use strict';

// 首页「三屏」交互层（2026-11-15 第四版：Be Water Courtyard）
//
// 机制取自 0z5a.github.io 的内联脚本（本地 curl 完整读过，不是靠截断抓取猜的）：
//   · webgl + depth，几何在 CPU 上拼成顶点数组一次上传；
//   · 着色是「三档色阶的平面着色」——每面算法线与固定光向点积后落三档，不做真实光照；
//   · 顶点着色器做相机矩阵 + 逐顶点动画 + 距离雾，片元叠颗粒；
//   · 相机是一条关键帧样条，随滚动推进。
//
// 本站不复制它的像素与造型：暖纸 / 黑曜石两套色板、毛玻璃基因来自本仓库的 site.css。
// 场景分三段沿 -z 单向推进：外景院落（台阶 + 格栅 + 亭廊 + 星盘塔）→ 柱廊主厅
// → 静水内院（看台 + 镜面水池 + 光柱）。所有体块都是实体盒子，零贴图。
//
// 三类部件在顶点着色器里按 uTime 常驻运动（不滚动也在动）：
//   ① 塔顶双环星盘绕竖轴旋转   ② 桁架下的赤陶钟摆绕水平轴摆动   ③ 浮空多面体自转 + 浮动
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

  // ================= 1. 场景 =================

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
        bg: [0.984, 0.969, 0.941],
        tones: [[0.949, 0.929, 0.890], [0.847, 0.814, 0.754], [0.678, 0.634, 0.562]],
        terra: [0.784, 0.353, 0.196], // #C85A32，与 /KASAI 的斜杠同色
        light: [1.0, 0.988, 0.955],   // 光柱与水面的基色
      },
      dark: {
        bg: [0.102, 0.094, 0.078],
        tones: [[0.408, 0.356, 0.284], [0.222, 0.192, 0.156], [0.134, 0.118, 0.097]],
        terra: [0.851, 0.467, 0.341],
        light: [0.996, 0.882, 0.760],
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
      var x = cross(up, z);
      // 视线与 up 平行时 cross 退化成零向量，矩阵里全是 NaN，整屏会变成一团糊。
      // 换一个不共线的参考轴重算。
      if (Math.hypot(x[0], x[1], x[2]) < 1e-4) x = cross([0, 0, 1], z);
      x = norm(x);
      var y = cross(z, x);
      return [
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
      ];
    }

    // ---- 顶点格式：pos(3) + color(3) + anim(4) + anim2(2) = 12 ----
    // anim = [type, speed, pivotX, pivotZ]，anim2 = [pivotY, phase]
    //   type 0 静态 / 1 绕竖轴自转 / 2 绕水平轴摆动 / 3 自转+浮动 / 4 光柱 / 5 水面
    var STRIDE = 12;
    var V = [];   // 不透明
    var VT = [];  // 半透明（光柱）
    var nOpaque = 0;
    var nAlpha = 0;

    var LIGHT = norm([0.75, 0.55, -0.1]);

    function put(arr, p, col, an) {
      arr.push(
        p[0], p[1], p[2],
        col[0], col[1], col[2],
        an ? an[0] : 0, an ? an[1] : 0, an ? an[2] : 0, an ? an[3] : 0,
        an ? an[4] : 0, an ? an[5] : 0
      );
    }

    function quad(a, b, c, d, col, an) {
      var arr = an && an[0] === 4 ? VT : V;
      put(arr, a, col, an); put(arr, b, col, an); put(arr, c, col, an);
      put(arr, a, col, an); put(arr, c, col, an); put(arr, d, col, an);
    }

    function tri(a, b, c, col, an) {
      var arr = an && an[0] === 4 ? VT : V;
      put(arr, a, col, an); put(arr, b, col, an); put(arr, c, col, an);
    }

    function shade(n) {
      var d = dot(n, LIGHT);
      return pal.tones[d > 0.42 ? 0 : d > -0.12 ? 1 : 2];
    }

    /** tone: null 按法线取色阶；0/1/2 强制档位；'terra' 用赤陶色（钟摆） */
    function toneOf(tone, n) {
      if (tone === 'terra') return pal.terra;
      if (tone === 0 || tone === 1 || tone === 2) return pal.tones[tone];
      return shade(n);
    }

    /** 实体盒子。y 是底面，返回顶面高度——上层结构用它当自己的底面，杜绝悬空与穿模。 */
    function box(x, y, z, w, h, d, o) {
      o = o || {};
      var tone = o.tone;
      var an = o.anim;
      var x0 = x - w / 2, x1 = x + w / 2;
      var y0 = y, y1 = y + h;
      var z0 = z - d / 2, z1 = z + d / 2;
      var P = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
      ];
      function c(n) { return toneOf(tone, n); }
      quad(P[0], P[1], P[2], P[3], c([0, -1, 0]), an);
      quad(P[4], P[5], P[6], P[7], c([0, 1, 0]), an);
      quad(P[0], P[1], P[5], P[4], c([0, 0, -1]), an);
      quad(P[3], P[2], P[6], P[7], c([0, 0, 1]), an);
      quad(P[0], P[3], P[7], P[4], c([-1, 0, 0]), an);
      quad(P[1], P[2], P[6], P[5], c([1, 0, 0]), an);
      return y1;
    }

    /** 任意方向方柱：斜拉索、钟摆悬索、星盘环段都靠它，避免"手画线" */
    function beam(a, b, r, tone, an) {
      var d = sub(b, a);
      var len = Math.hypot(d[0], d[1], d[2]) || 1;
      var dir = [d[0] / len, d[1] / len, d[2] / len];
      var up = Math.abs(dir[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0];
      var u = norm(cross(up, dir));
      var v = norm(cross(dir, u));
      function at(o, s1, s2) {
        return [o[0] + u[0] * s1 * r + v[0] * s2 * r, o[1] + u[1] * s1 * r + v[1] * s2 * r, o[2] + u[2] * s1 * r + v[2] * s2 * r];
      }
      var A = [at(a, -1, -1), at(a, 1, -1), at(a, 1, 1), at(a, -1, 1)];
      var B = [at(b, -1, -1), at(b, 1, -1), at(b, 1, 1), at(b, -1, 1)];
      var col = toneOf(tone, dir);
      for (var i = 0; i < 4; i += 1) quad(A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i], col, an);
      quad(A[0], A[1], A[2], A[3], col, an);
      quad(B[3], B[2], B[1], B[0], col, an);
    }

    /** 多边形环：n 段方柱首尾相接。tilt 是绕 x 轴的倾角，π/2 即竖直环。 */
    function ring(cx, cy, cz, R, n, thick, tilt, tone, an) {
      var pts = [];
      for (var i = 0; i < n; i += 1) {
        var a = (i / n) * Math.PI * 2;
        var px = Math.cos(a) * R;
        var pz = Math.sin(a) * R;
        pts.push([cx + px, cy + pz * Math.sin(tilt), cz + pz * Math.cos(tilt)]);
      }
      for (var j = 0; j < n; j += 1) beam(pts[j], pts[(j + 1) % n], thick, tone, an);
    }

    /** 八面体：星盘核心与浮空多面体共用 */
    function octa(cx, cy, cz, r, tone, an) {
      var col = tone === 'terra' ? pal.terra : tone === 0 || tone === 1 || tone === 2 ? pal.tones[tone] : pal.tones[0];
      var top = [cx, cy + r, cz];
      var bot = [cx, cy - r, cz];
      var q = [[cx + r, cy, cz], [cx, cy, cz + r], [cx - r, cy, cz], [cx, cy, cz - r]];
      for (var i = 0; i < 4; i += 1) {
        tri(top, q[i], q[(i + 1) % 4], col, an);
        tri(bot, q[(i + 1) % 4], q[i], col, an);
      }
    }

    // ---- 尺寸常量：三段建筑共用一个台基高度，靠它保证"严丝合缝" ----
    var BASE = 4.76;        // 台基顶面 = 14 级台阶的总升高
    var DOORH = 9.5;        // 门洞净高
    var FZ = 18;            // 主立面 z
    var SZ = -60;           // 水院中心 z
    var CEIL = BASE + 16.5; // 内院天花板
    var TOWER = [24, 20];   // 星盘塔的 x / z

    function build() {
      V.length = 0;
      VT.length = 0;
      LIGHT = norm([0.75, 0.55, -0.1]);

      var T = pal.tones;

      // ================= 地面与台基 =================
      quad([-160, 0, 150], [160, 0, 150], [160, 0, -130], [-160, 0, -130], T[1]);

      // 台基：整座建筑坐在它上面，前缘到 z=18.2（台阶顶）
      box(0, 0, -32, 70, BASE, 100.5);
      box(0, BASE - 0.34, 18.1, 70, 0.34, 0.9, { tone: 0 });

      // ================= 外景：长阶梯 =================
      var STEPS = 10;
      var RISE = BASE / STEPS;
      var RUN = 2.4;
      for (var s = 0; s < STEPS; s += 1) {
        var top = RISE * (s + 1);
        var zc = 42 - RUN * (s + 0.5);
        box(0, top - RISE, zc, 18, RISE, RUN + 0.04);
        // 两侧栏墙随阶梯逐级上升，读作扶手；顶面永远比踏面高 0.8
        box(-9.4, top - RISE, zc, 0.8, RISE + 0.42, RUN + 0.04);
        box(9.4, top - RISE, zc, 0.8, RISE + 0.42, RUN + 0.04);
      }

      // ================= 外景：主立面（左低右高，错落） =================
      box(-12.5, BASE, FZ, 15, 9.5, 1.8);        // 左翼 x -20..-5
      box(17.5, BASE, FZ, 25, 14, 1.8);          // 右翼 x 5..30
      box(0, BASE + DOORH, FZ, 10, 3.2, 1.8);    // 门楣
      box(-5.6, BASE, FZ + 1.3, 1.4, DOORH, 1.4, { tone: 0 }); // 门框柱
      box(5.6, BASE, FZ + 1.3, 1.4, DOORH, 1.4, { tone: 0 });

      // 透光格栅景墙：外立面两侧的竖板阵列
      for (var g = 0; g < 7; g += 1) {
        var gx = 7 + g * 2.7;
        box(gx, BASE, 21.6, 0.44, 10.5, 1.0);
      }

      // 错层亭廊：四柱落到台基面，顶板坐在柱顶（柱高 hy = 顶板底面高度）
      function pavilion(px, pz, w, d, hy) {
        box(px, BASE + hy, pz, w, 0.55, d, { tone: 0 });
        var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (var i = 0; i < 4; i += 1) {
          box(px + corners[i][0] * (w / 2 - 0.6), BASE, pz + corners[i][1] * (d / 2 - 0.6), 0.8, hy, 0.8);
        }
      }
      // 左侧不再放亭廊：柱列正好压在标题与副标题上，留空给文字与远景

      // ================= 星盘塔 =================
      var tx = TOWER[0];
      var tz = TOWER[1];
      var ty = BASE;
      ty = box(tx, ty, tz, 15, 1.0, 15);      // 三级台基，逐级收
      ty = box(tx, ty, tz, 12, 1.0, 12);
      ty = box(tx, ty, tz, 9.4, 1.0, 9.4);
      ty = box(tx, ty, tz, 6.0, 5.0, 6.0);    // 塔身三段，每段之间夹一道腰线
      ty = box(tx, ty, tz, 6.9, 0.45, 6.9, { tone: 0 });
      ty = box(tx, ty, tz, 5.2, 5.0, 5.2);
      ty = box(tx, ty, tz, 5.9, 0.45, 5.9, { tone: 0 });
      ty = box(tx, ty, tz, 4.4, 4.0, 4.4);

      // 观测平台：下层挑檐 → 四根细柱 → 上层平顶。柱底与檐顶同面，柱顶与平顶同面。
      var deckA = box(tx, ty, tz, 8.8, 0.6, 8.8, { tone: 0 });
      var colH = 3.0;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s2) {
        box(tx + s2[0] * 2.6, deckA, tz + s2[1] * 2.6, 0.45, colH, 0.45);
      });
      var deckB = box(tx, deckA + colH, tz, 7.6, 0.5, 7.6, { tone: 0 });

      // 星盘：内环半径 3.0 竖直，环底正好落在 deckB 顶面；外环微倾，最低点高于平台
      var astroY = deckB + 3.5;
      ring(tx, astroY, tz, 3.5, 12, 0.3, Math.PI / 2, 0, [1, 0.42, tx, tz, astroY, 0]);
      ring(tx, astroY, tz, 5.0, 16, 0.28, 0.3, 0, [1, -0.28, tx, tz, astroY, 0.9]);
      octa(tx, astroY, tz, 1.4, 0, [3, 0.8, tx, tz, astroY, 0]);

      // 环形外挑桁架（塔身中部）+ 八根斜拉索上挑到塔身上段
      var trussY = BASE + 11.5;
      ring(tx, trussY, tz, 8.4, 10, 0.28, 0, null);
      for (var c = 0; c < 8; c += 1) {
        var ca = (c / 8) * Math.PI * 2;
        beam(
          [tx + Math.cos(ca) * 8.4, trussY, tz + Math.sin(ca) * 8.4],
          [tx + Math.cos(ca) * 2.0, BASE + 16.4, tz + Math.sin(ca) * 2.0],
          0.1, 2
        );
      }

      // 赤陶钟摆：双索吊在桁架下，整组绕桁架中心的水轴摆动（索与摆锤共用同一个 anim）
      var pivotY = trussY - 0.3;
      var swing = [2, 1.15, tx, tz, pivotY, 0.4];
      beam([tx - 1.4, pivotY, tz], [tx - 0.7, pivotY - 5.0, tz], 0.12, 2, swing);
      beam([tx + 1.4, pivotY, tz], [tx + 0.7, pivotY - 5.0, tz], 0.12, 2, swing);
      octa(tx, pivotY - 5.9, tz, 1.5, 'terra', swing);

      // ================= 柱廊主厅 =================
      var HALF = 10;
      for (var k = 0; k < 6; k += 1) {
        var pz = 12 - k * 8.8;
        [-HALF, HALF].forEach(function (px) {
          box(px, BASE, pz, 1.5, 12, 1.5, { tone: 2 });
          box(px, BASE + 12, pz, 2.3, 0.7, 2.3, { tone: 0 });
          box(px, BASE + 12.7, pz, 3.0, 0.5, 3.0, { tone: 0 });
        });
        box(0, BASE + 13.2, pz, 21, 0.45, 0.8);
      }
      // 天光格栅：四道纵梁 + 稀疏横肋
      [-HALF, -3.4, 3.4, HALF].forEach(function (lx) {
        box(lx, BASE + 13.65, -12, 0.7, 0.55, 48);
      });
      for (var r2 = 0; r2 < 6; r2 += 1) {
        box(0, BASE + 13.65, 12 - r2 * 8.8, 20, 0.35, 0.35, { tone: 2 });
      }
      // 两侧格栅墙：让走廊有边界但不挡光
      for (var wc = 0; wc < 6; wc += 1) {
        var wz = 12 - wc * 8.8;
        box(-16, BASE, wz, 0.5, 11.5, 1.1);
        box(16, BASE, wz, 0.5, 11.5, 1.1);
      }

      // ================= 静水内院 =================
      // 入口门框（z = -40）
      box(-12, BASE, -40, 5.0, 15, 2.2, { tone: 2 });
      box(12, BASE, -40, 5.0, 15, 2.2, { tone: 2 });
      box(0, BASE + 15, -40, 20, 3.5, 2.2, { tone: 2 });

      // 围合：两侧墙 + 后墙
      box(-21, BASE, SZ - 4, 2.4, 18, 44, { tone: 2 });
      box(21, BASE, SZ - 4, 2.4, 18, 44, { tone: 2 });
      box(0, BASE, -82, 44, 18, 2.4, { tone: 2 });

      // 后墙壁柱：与外部格栅呼应，也给空荡的墙面一点可读的竖向节奏
      for (var nb = 0; nb < 5; nb += 1) {
        box(-8.4 + nb * 4.2, BASE, -80.4, 0.72, 16, 0.9, { tone: 1 });
      }

      // 两侧层叠看台：向内递进，每层踏面 = 上一层的顶面
      for (var st = 0; st < 4; st += 1) {
        var sy = BASE + st * 0.6;
        var sw = 6.4 - st * 1.5;
        box(-16.6 + st * 1.55, sy, SZ, sw, 0.6, 40);
        box(16.6 - st * 1.55, sy, SZ, sw, 0.6, 40);
      }

      // 水池：池底 + 池沿 + 水面（水面 type=5，片元按 uTime 画同心波纹）
      box(0, BASE - 0.4, SZ, 22, 0.6, 28, { tone: 2 });
      box(0, BASE, -44.8, 26, 0.55, 2.8, { tone: 0 });
      box(0, BASE, -75.2, 26, 0.55, 2.8, { tone: 0 });
      box(-11.6, BASE, SZ, 1.6, 0.55, 33, { tone: 0 });
      box(11.6, BASE, SZ, 1.6, 0.55, 33, { tone: 0 });
      quad(
        [-11, BASE + 0.3, -46], [11, BASE + 0.3, -46],
        [11, BASE + 0.3, -74], [-11, BASE + 0.3, -74],
        pal.light, [5, 0, 0, 0, 0, 0]
      );

      // 天花板：围着一口 16×16 的天窗铺四块，洞的位置由这四块反推
      box(0, CEIL, SZ - 14, 44, 1.2, 12, { tone: 2 });
      box(0, CEIL, SZ + 14, 44, 1.2, 12, { tone: 2 });
      box(-15, CEIL, SZ, 14, 1.2, 16, { tone: 2 });
      box(15, CEIL, SZ, 14, 1.2, 16, { tone: 2 });

      // 光柱：外层 7×7 + 内层 3.4×3.4，都从水面下方起、穿过天窗，半透明叠加出体积感
      var LY0 = BASE + 0.15;
      var LY1 = CEIL + 3.2;
      function shaft(hw) {
        var an = [4, 0, 0, 0, 0, 0];
        var A = [[-hw, LY0, SZ - hw], [hw, LY0, SZ - hw], [hw, LY0, SZ + hw], [-hw, LY0, SZ + hw]];
        var B = [[-hw, LY1, SZ - hw], [hw, LY1, SZ - hw], [hw, LY1, SZ + hw], [-hw, LY1, SZ + hw]];
        for (var i = 0; i < 4; i += 1) quad(A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i], pal.light, an);
      }
      shaft(4.4);
      shaft(2.8);
      shaft(1.3);

      // 浮空多面体：固定坐标（确定性，不做"随机生成"的假惊喜）
      var floaters = [
        [-7.5, 16.5, -14, 1.5, 0.7],
        [8.2, 19.0, -26, 1.1, 1.4],
        [-4.0, 21.0, -38, 1.35, 2.2],
        [6.4, 15.2, -46, 1.0, 3.1],
        [0.5, 18.4, -8, 0.9, 4.3],
      ];
      for (var f = 0; f < floaters.length; f += 1) {
        var fl = floaters[f];
        octa(fl[0], BASE + fl[1], fl[2], fl[3], 0, [3, fl[4], fl[0], fl[2], BASE + fl[1], f * 1.7]);
      }

      // ================= 前庭矮墙 =================
      box(-34, 0, 40, 2.2, 2.4, 74);
      box(34, 0, 40, 2.2, 2.4, 74);
    }

    // ---- 着色器 ----
    // 精度必须两边对齐：同名 uniform 在顶点与片元里精度不同会直接链接失败
    // （GLSL 报 "Precisions of uniform 'uT' differ"）。这里统一用 mediump，
    // 只把几何位置与相机矩阵单列 highp，否则 160 米尺度的坐标在 float16 下会抖。
    var VS = [
      'precision mediump float;',
      'attribute highp vec3 p;',
      'attribute vec3 c;',
      'attribute vec4 a;',
      'attribute vec2 b;',
      'uniform highp mat4 uV;',
      'uniform highp mat4 uP;',
      'uniform vec3 uBg;',
      'uniform float uFog;',
      'uniform float uT;',
      'varying vec3 vC;',
      'varying highp vec3 vW;',
      'varying float vType;',
      'varying float vA;',
      'void main(){',
      '  highp vec3 pos = p;',
      '  float t = a.x;',
      '  float ang = uT * a.y + b.y;',
      // ① 绕竖直轴自转（星盘双环）
      '  if (t > 0.5 && t < 1.5) {',
      '    float cs = cos(ang); float sn = sin(ang);',
      '    float dx = pos.x - a.z; float dz = pos.z - a.w;',
      '    pos.x = a.z + dx * cs + dz * sn;',
      '    pos.z = a.w - dx * sn + dz * cs;',
      '  } else if (t > 1.5 && t < 2.5) {',
      // ② 绕水平轴摆动（钟摆）
      '    float sw = sin(ang) * 0.17;',
      '    float cs2 = cos(sw); float sn2 = sin(sw);',
      '    float dy = pos.y - b.x; float dz2 = pos.z - a.w;',
      '    pos.y = b.x + dy * cs2 - dz2 * sn2;',
      '    pos.z = a.w + dy * sn2 + dz2 * cs2;',
      '  } else if (t > 2.5 && t < 3.5) {',
      // ③ 自转 + 上下浮动（塔顶核心 / 浮空多面体）
      '    float cs3 = cos(ang); float sn3 = sin(ang);',
      '    float dx3 = pos.x - a.z; float dz3 = pos.z - a.w;',
      '    pos.x = a.z + dx3 * cs3 + dz3 * sn3;',
      '    pos.z = a.w - dx3 * sn3 + dz3 * cs3;',
      '    pos.y += sin(ang * 0.7) * 0.55;',
      '  }',
      '  vType = t;',
      '  vA = (t > 3.5 && t < 4.5) ? 0.33 : 1.0;',
      '  vW = pos;',
      '  vec4 v = uV * vec4(pos, 1.0);',
      '  float d = length(v.xyz);',
      '  float f = 1.0 - smoothstep(45.0, 330.0, d) * 0.88;',
      '  f = mix(f, f * 0.4, uFog);',
      '  float ao = clamp(pos.y / 30.0, 0.0, 1.0);',
      '  vC = mix(uBg, c * (0.84 + 0.16 * ao), f);',
      '  gl_Position = uP * v;',
      '}',
    ].join('\n');

    var FS = [
      'precision mediump float;',
      'varying vec3 vC;',
      'varying highp vec3 vW;',
      'varying float vType;',
      'varying float vA;',
      'uniform float uT;',
      'uniform vec2 uPool;',
      'void main(){',
      '  vec3 c = vC;',
      // 静水波纹：同心环，随时间向外扩散；环宽用 smoothstep 收，避免出现硬边
      '  if (vType > 4.5) {',
      '    float r = length(vW.xz - uPool);',
      '    float ring = sin(r * 2.1 - uT * 1.25);',
      '    float band = smoothstep(0.15, 0.95, ring);',
      '    c = mix(c * 0.94, min(c * 1.06 + 0.015, vec3(1.0)), band * 0.3);',
      '  }',
      '  vec2 g = floor(gl_FragCoord.xy / 1.5);',
      '  float n = fract(52.9829189 * fract(dot(g, vec2(0.06711056, 0.00583715))));',
      '  c += (n - 0.5) * 0.026;',
      '  gl_FragColor = vec4(c, vA);',
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
      a: gl.getAttribLocation(prog, 'a'),
      b: gl.getAttribLocation(prog, 'b'),
      uV: gl.getUniformLocation(prog, 'uV'),
      uP: gl.getUniformLocation(prog, 'uP'),
      uBg: gl.getUniformLocation(prog, 'uBg'),
      uFog: gl.getUniformLocation(prog, 'uFog'),
      uT: gl.getUniformLocation(prog, 'uT'),
      uPool: gl.getUniformLocation(prog, 'uPool'),
    };

    var buf = gl.createBuffer();
    function upload() {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V.concat(VT)), gl.STATIC_DRAW);
      var bytes = STRIDE * 4;
      gl.enableVertexAttribArray(loc.p);
      gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, bytes, 0);
      gl.enableVertexAttribArray(loc.c);
      gl.vertexAttribPointer(loc.c, 3, gl.FLOAT, false, bytes, 12);
      if (loc.a >= 0) {
        gl.enableVertexAttribArray(loc.a);
        gl.vertexAttribPointer(loc.a, 4, gl.FLOAT, false, bytes, 24);
      }
      if (loc.b >= 0) {
        gl.enableVertexAttribArray(loc.b);
        gl.vertexAttribPointer(loc.b, 2, gl.FLOAT, false, bytes, 40);
      }
      nOpaque = V.length / STRIDE;
      nAlpha = VT.length / STRIDE;
    }

    // ---- 相机：三档关键帧 + Catmull-Rom 插值，沿 -z 单向推进，z 严格递减 ----
    var STOPS = [
      // 第一屏：院外远眺。门洞落在画面中线偏右，左侧广场留给 /KASAI；塔在右三分之一
      { eye: [-14, 14, 84], ctr: [1, 9.5, 2], fov: 47 },
      // 第二屏：拾级穿门，柱列在两侧展开；机位保持中线，杜绝柱子贴脸
      { eye: [0, 8.8, 7.6], ctr: [0, 9.2, -34], fov: 56 },
      // 第三屏：过门框站到池边，正对光柱与镜面水池（-44 与常量 SZ 不同值，断言要求这里是字面量）
      { eye: [0, 10.4, -37], ctr: [0, 7.2, -70], fov: 60 },
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
    var yHero = 1, yDesk = 1;

    // 相机进度不能直接取 scrollY/max：第二屏有 190dvh 高，那样滚到一半镜头就冲进内院了。
    // 这里按「屏」分段：hero 段推进到 0.5（门内），desk 段只挪 0.12，outro 段才推进到 1。
    function measure() {
      var hero = doc.getElementById('hero');
      var desk = doc.getElementById('desk');
      yHero = hero ? hero.offsetTop + hero.offsetHeight : H;
      if (desk) {
        yDesk = desk.offsetTop + desk.offsetHeight - H;
      } else {
        yDesk = yHero;
      }
      if (yDesk <= yHero) yDesk = yHero + 1;
    }

    function readProgress() {
      var y = window.scrollY;
      var max = doc.documentElement.scrollHeight - H;
      if (max <= 0) { target = 0; return; }
      if (y <= yHero) {
        target = 0.5 * (y / Math.max(1, yHero));
      } else if (y <= yDesk) {
        target = 0.5 + 0.06 * ((y - yHero) / Math.max(1, yDesk - yHero));
      } else {
        target = 0.56 + 0.44 * Math.min(1, (y - yDesk) / Math.max(1, max - yDesk));
      }
      if (target < 0) target = 0;
      if (target > 1) target = 1;
    }

    function draw() {
      var aspect = W / Math.max(1, H);
      // 竖屏：同一套关键帧放进 0.46 的窄画幅里，建筑会被左右裁掉大半。
      // 按水平视角补偿——加大 fov 并把机位沿视线方向后撤，构图才不会变成"贴脸"。
      var fov = sampleFov(p);
      var back = 1;
      if (aspect < 0.85) {
        fov = Math.min(84, fov * 1.5);
        back = 1.32;
      }

      var cx = sample('ctr', 0, p) + mx * 0.5;
      var cy = sample('ctr', 1, p);
      var cz = sample('ctr', 2, p);
      var ex = sample('eye', 0, p) + mx * 2.0;
      var ey = sample('eye', 1, p) + my * 0.7;
      var ez = sample('eye', 2, p);
      if (back > 1) {
        ex = cx + (ex - cx) * back;
        ey = cy + (ey - cy) * back;
        ez = cz + (ez - cz) * back;
      }

      var Vm = lookAt([ex, ey, ez], [cx, cy, cz], [0, 1, 0]);
      var Pm = perspective((fov * Math.PI) / 180, aspect, 0.1, 640);

      gl.clearColor(pal.bg[0], pal.bg[1], pal.bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      gl.uniformMatrix4fv(loc.uV, false, new Float32Array(Vm));
      gl.uniformMatrix4fv(loc.uP, false, new Float32Array(Pm));
      gl.uniform3f(loc.uBg, pal.bg[0], pal.bg[1], pal.bg[2]);
      // 中间屏雾最重：背景柔下去托住四个窗口
      gl.uniform1f(loc.uFog, 0.55 * Math.sin(p * Math.PI));
      gl.uniform1f(loc.uT, t);
      gl.uniform2f(loc.uPool, 0, SZ);

      if (nOpaque) gl.drawArrays(gl.TRIANGLES, 0, nOpaque);
      if (nAlpha) {
        // 光柱最后画：开混合、关深度写入，两层叠加出体积，不遮挡已经画好的水池
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, nOpaque, nAlpha);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      gl.disable(gl.DEPTH_TEST);
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

    build();
    upload();
    resize();
    measure();
    readProgress();
    p = target;

    window.addEventListener('resize', function () { resize(); measure(); readProgress(); }, { passive: true });
    window.addEventListener('scroll', readProgress, { passive: true });

    if (!reduce && window.matchMedia('(hover: hover)').matches) {
      doc.addEventListener('pointermove', function (ev) {
        tmx = (ev.clientX / (W || 1)) * 2 - 1;
        tmy = (ev.clientY / (H || 1)) * 2 - 1;
      }, { passive: true });
    }

    function refreshTheme() {
      pal = THEME[isDark() ? 'dark' : 'light'];
      build();   // 颜色烘在顶点里，必须重建
      upload();
      if (reduce) draw();
    }

    if (reduce) {
      // 静态帧：停在廊内机位，三类动态部件保持初相，不跑循环
      p = 0.52;
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
