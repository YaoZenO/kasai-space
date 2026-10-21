// A10 头像圆形化 · 渲染层验收（一次性 + 可重跑）。
//
// 为什么要有这一层：E-034 证明「规则层断言全绿」不等于「浏览器里长这样」——
// 主题 main.css 用 visibility:hidden 继承把 ::before 静默废掉时，静态断言读到的
// 仍是 site.css 里写的值。头像这类 border-radius + overflow 组合同理：
// 只有逐像素看产物，才能证明圆真的裁出来了。
//
// 依赖策略：playwright / pngjs 不在项目 devDependencies 里（装进 node_modules 会
// 拖慢每次构建、且要下载浏览器二进制）。这里按「项目内 → 隔离 workspace → 跳过」
// 三级解析，缺失时打印 SKIP 并以 0 退出，绝不把环境问题报成产品缺陷。
// 用法：npm run test:a10-render（需先 npm run build，并起一个静态服务在 :4199）
//
// 验收口径（三条，缺一不可）：
//   ① computed style：border-radius 50% / box-shadow none / 1px 描边 / overflow hidden / 96×96
//   ② 像素复核：四角必须是背景色——证明圆裁切生效（方角时这里会 100% 暴露）
//   ③ 反向对照：中心必须是图片内容——排除「整块都是背景」造成的假阳性
// 判据用「非背景占比 ≤5%」而非「必须为 0」：圆与背景的交界必有 1~2px 抗锯齿
// 过渡像素，用全零判据会在移动端误报（2026-10-21 踩过，见 ERRORS.md E-038）。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// --- 依赖三级解析 ---
function resolveDep(name) {
  const candidates = [
    path.join(ROOT, 'node_modules', name),
    path.join('C:', 'Users', 'Lenovo', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', name),
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 试下一个 */ }
  }
  return null;
}

const pw = resolveDep('playwright');
const PNGlib = resolveDep('pngjs');

if (!pw || !PNGlib) {
  console.log('SKIP A10 渲染层验收：缺 playwright 或 pngjs（项目内与隔离 workspace 都没找到）。');
  console.log('  规则层断言已由 test/css-tokens.js 锁死，本条不影响 npm test。');
  process.exit(0);
}

const { chromium } = pw;
const { PNG } = PNGlib;

const URL = process.env.A10_URL || 'http://127.0.0.1:4199/';
const OUT = path.join(ROOT, '_trash', 'a10-shots');
fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
const ok = (label, cond, detail) => {
  if (!cond) failed++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'} | ${label}${detail ? ' → ' + detail : ''}`);
};

// 取四角 inset×insit 邻域，逐像素与「页面底色」比对。
// 参考底色不写死，取图片最外侧一圈的中位数——纸底 #f5f1e9 与截图抗锯齿后的实际值有差。
function cornerStats(png, inset, tol) {
  const { width: w, height: h, data } = png;
  const px = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const edge = [];
  for (let x = 2; x < w - 2; x += Math.max(1, Math.floor(w / 8))) edge.push(px(x, 0), px(x, h - 1));
  for (let y = 2; y < h - 2; y += Math.max(1, Math.floor(h / 8))) edge.push(px(0, y), px(w - 1, y));
  const ref = edge.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))[Math.floor(edge.length / 2)];

  let bad = 0, total = 0, worst = 0, worstAt = '';
  for (const [cx, cy] of [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]]) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const p = px(cx + dx, cy + dy);
        total++;
        const d = Math.max(Math.abs(p[0] - ref[0]), Math.abs(p[1] - ref[1]), Math.abs(p[2] - ref[2]));
        if (d > tol) {
          bad++;
          if (d > worst) { worst = d; worstAt = `(${cx + dx},${cy + dy}) rgb(${p[0]},${p[1]},${p[2]})`; }
        }
      }
    }
  }
  return { bad, total, ref, worst, worstAt };
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const vp of [
      { name: 'desktop-1440', width: 1440, height: 900 },
      { name: 'mobile-390', width: 390, height: 844 },
    ]) {
      console.log(`\n== ${vp.name} (${vp.width}×${vp.height}) ==`);
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(URL, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const img = document.querySelector('.identity-avatar-img');
        return img && img.complete && img.naturalWidth > 0;
      }, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);

      const cs = await page.evaluate(() => {
        const el = document.querySelector('.identity-avatar');
        const img = document.querySelector('.identity-avatar-img');
        if (!el) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          borderRadius: s.borderRadius, boxShadow: s.boxShadow,
          borderTopWidth: s.borderTopWidth, overflow: s.overflow,
          rectW: r.width, rectH: r.height,
          imgLoaded: !!img && img.complete && img.naturalWidth > 0,
          imgNatural: img ? `${img.naturalWidth}×${img.naturalHeight}` : 'none',
        };
      });

      if (!cs) { ok('找到 .identity-avatar', false, '元素不存在'); await page.close(); continue; }

      ok('border-radius 计算值为 50%', cs.borderRadius === '50%', cs.borderRadius);
      ok('box-shadow 为 none', cs.boxShadow === 'none', cs.boxShadow);
      ok('描边 1px', cs.borderTopWidth === '1px', cs.borderTopWidth);
      ok('overflow hidden（圆裁切的前提）', cs.overflow === 'hidden', cs.overflow);
      ok('rect 宽高相等（否则 50% 渲染成椭圆）', Math.abs(cs.rectW - cs.rectH) < 0.5, `${cs.rectW}×${cs.rectH}`);
      ok('rect 为 96px', Math.abs(cs.rectW - 96) < 0.5, String(cs.rectW));
      ok('头像图片已加载', cs.imgLoaded, cs.imgNatural);

      const shotPath = path.join(OUT, `avatar-${vp.name}.png`);
      await (await page.$('.identity-avatar')).screenshot({ path: shotPath });
      const png = PNG.sync.read(fs.readFileSync(shotPath));
      const inset = Math.max(6, Math.round(png.width * 0.13));
      const st = cornerStats(png, inset, 26);
      ok(`四角为背景色（圆裁切实测，${inset}px 内缩）`, st.bad / st.total <= 0.05,
        `${st.bad}/${st.total} 个像素非背景（阈值 5%），参考底色 rgb(${st.ref[0]},${st.ref[1]},${st.ref[2]})`
        + (st.worst ? `，最大偏差 ${st.worst} @ ${st.worstAt}` : ''));

      const i = ((png.height >> 1) * png.width + (png.width >> 1)) * 4;
      const dMid = Math.max(Math.abs(png.data[i] - st.ref[0]), Math.abs(png.data[i + 1] - st.ref[1]), Math.abs(png.data[i + 2] - st.ref[2]));
      ok('中心是图片内容（排除整块皆背景的假阳性）', dMid > 12, `中心与底色差 ${dMid}`);

      ok('无页面 JS 错误', errors.length === 0, errors.join('; '));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nRESULT: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
  process.exit(failed === 0 ? 0 : 1);
})();
