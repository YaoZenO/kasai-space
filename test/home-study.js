'use strict';
// 首页「三屏」结构与交互契约（2026-11-15 第二轮重构）。
//
// 断言分两类：
//   ① 真实故障：E-071 / E-163（is-home 下 <footer> 被整块隐藏）、E-164（脚本语法错误而外观正常）、
//      E-064（加法 calc 被压缩器吃掉）。
//   ② 主人本轮定的五条硬约束：四窗外壳统一、抬头不放计数、文章只出现一次、
//      摘要不得机械截取、游戏与收藏不进首页；再加"不许手搓火柴棍 SVG / 不许大数字锚点"。
//
// 运行：node test/home-study.js（已串入 npm test）

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0;
function ok(label, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS', label);
  } catch (e) {
    console.error('  FAIL', label, '—', e.message);
    process.exitCode = 1;
  }
}

const PAGE = 'src/pages/index.astro';
const JS = 'source/js/home-study.js';
const page = read(PAGE);
const siteCss = read('source/css/site.css');
const homeJs = read(JS);

const S_START = siteCss.indexOf('/* ===== 4.26 ');
const S_END = siteCss.indexOf('/* ===== 5. ', S_START);
const s26 = S_START === -1 || S_END === -1 ? '' : siteCss.slice(S_START, S_END);

console.log('源文件契约（模板 / CSS / 脚本）');

ok('首页样式段是 §4.26，且上一轮的死类已清零', () => {
  assert.ok(S_START > 0, 'site.css 找不到 §4.26 首页段');
  assert.ok(S_END > S_START, '§4.26 取样终点失效');
  assert.ok(s26.length > 6000, '§4.26 取样过短');
  assert.ok(s26.includes('三屏'), '§4.26 标题未标明「三屏」');
  ['sd-scene-word', 'sd-scene-side', 'sd-w--', 'sd-anchor', 'sd-fig', '.mz-'].forEach((c) => {
    assert.ok(!s26.includes(c), '上一轮的结构痕迹仍在：' + c);
  });
});

ok('E-071 / E-163 防复发：首页不得出现 <footer，第三屏用 <section>', () => {
  assert.ok(!/<footer[\s>]/.test(page), '首页模板里出现了 <footer> 标签');
  assert.ok(page.includes('class="sd-outro" id="outro"'), '第三屏不是 section#outro');
});

ok('E-164 防复发：交互脚本语法必须可解析（源码与产物各一次）', () => {
  new vm.Script(homeJs, { filename: JS });
  const built = path.join(ROOT, 'dist', 'js', 'home-study.js');
  assert.ok(fs.existsSync(built), '产物里找不到 home-study.js');
  new vm.Script(fs.readFileSync(built, 'utf8'), { filename: built });
});

ok('E-064 防复发：§4.26 不得出现加法 calc', () => {
  const bad = s26.match(/calc\([^)]*\+[^)]*\)/g) || [];
  assert.deepStrictEqual(bad, [], '出现加法 calc：' + bad.join(' | '));
});

ok('环境全部由 canvas 画：§4.26 内不得出现任何渐变或 glow', () => {
  assert.ok(!/gradient|glow/i.test(s26), '§4.26 出现渐变/发光声明，环境应交给 #sd-canvas');
  assert.match(s26, /#sd-canvas\s*\{[^}]*position:\s*fixed/, '画布不是 fixed 全屏层');
});

ok('四窗外壳只定义一次，且不允许逐窗覆盖', () => {
  const shells = s26.match(/\n\.sd-win\s*\{/g) || [];
  assert.strictEqual(shells.length, 1, '.sd-win 外壳被定义了 ' + shells.length + ' 次');
  const shell = /\.sd-win\s*\{([^}]*)\}/.exec(s26)[1];
  ['background-color', 'border', 'border-radius', 'padding'].forEach((prop) => {
    assert.ok(shell.includes(prop), '统一外壳缺少 ' + prop);
  });
  assert.ok(!/#win-\w+\s*\{/.test(s26), 'CSS 里出现了按窗口 id 的外壳覆盖');
  assert.ok(!/\.sd-win--/.test(s26), 'CSS 里出现了窗口变体类（外壳必须完全统一）');
});

ok('抬头只放标题：模板与 CSS 都不存在计数角标', () => {
  assert.ok(!page.includes('win-note'), '模板里出现了 win-note');
  const heads = page.match(/<header class="win-head">[\s\S]*?<\/header>/g) || [];
  assert.strictEqual(heads.length, 4, '窗口抬头不是 4 个：' + heads.length);
  heads.forEach((h) => {
    const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(!/\d/.test(text), '窗口抬头出现数字：' + text);
    assert.ok(/^[A-Za-z ]+$/.test(text), '窗口抬头只应有纯标题：' + text);
  });
});

ok('首页导航只留右上角入口：品牌与宽胶囊被隐藏，动作区靠右', () => {
  assert.match(s26, /body\.is-home #navbar \.site-brand[\s\S]{0,80}display: none/, 'CSS 没有在首页隐藏品牌');
  assert.match(s26, /body\.is-home #navbar \.site-nav-center[\s\S]{0,60}opacity: 0/, '首页没有默认收起宽胶囊');
  assert.match(s26, /body\.is-home\.nav-desk #navbar \.site-nav-center[\s\S]{0,60}opacity: 1/, '第二屏没有浮现宽胶囊');
  assert.match(homeJs, /classList\.toggle\('nav-desk'/, 'JS 没有切换 nav-desk');
  assert.match(s26, /body\.is-home #navbar \.site-nav-actions[\s\S]{0,60}justify-self: end/, '动作区没有靠右');
  assert.ok(!s26.includes('nav-away'), 'nav-away 机制已废弃，不应留在样式里');
});

ok('画布是 WebGL 三维场景：深度测试、相机样条、雾、DPI 与 reduce 静态帧', () => {
  assert.match(homeJs, /getContext\('webgl'/, '画布没有用 WebGL');
  assert.match(homeJs, /depth: true/, '没有开深度缓冲，画不出体块遮挡');
  assert.match(homeJs, /STOPS\.length/, '没有三档相机关键帧');
  assert.match(homeJs, /catmull|lookAt/, '没有相机插值');
  assert.match(homeJs, /uFog/, '着色器没有雾，背景压不下去');
  assert.match(homeJs, /devicePixelRatio/, '画布没适配 devicePixelRatio');
  assert.match(homeJs, /requestAnimationFrame/, '画布没有走 rAF');
  const reduceBlock = homeJs.slice(homeJs.indexOf('if (reduce) {'));
  assert.ok(reduceBlock.includes('p = 0.34'), 'reduce 分支没有固定静态帧');
  // 曾经被否掉的形态：只画点与线
  assert.ok(!/createRadialGradient/.test(homeJs), '又回到 2D 渐变画法了');
  assert.ok(!/ctx\.arc\(/.test(homeJs), '又回到画圆点当浮尘的老路');
});

ok('E-172 防复发：.row 必须显式声明 width:100% + min-width:0', () => {
  const m = /\.row\s*\{([^}]*)\}/.exec(s26);
  assert.ok(m, '§4.26 缺少 .row 规则');
  assert.ok(/width:\s*100%/.test(m[1]), '.row 缺 width:100%（grid 容器会被标题顶宽）');
  assert.ok(/min-width:\s*0/.test(m[1]), '.row 缺 min-width:0');
});

ok('E-173 防复发：相机三档的 eye z 必须严格递减（不许倒车回门口）', () => {
  const stops = /var STOPS = \[([\s\S]*?)\n    \];/.exec(homeJs);
  assert.ok(stops, '找不到 STOPS 定义');
  const zs = [...stops[1].matchAll(/eye:\s*\[[^\]]*?,\s*[^,]+,\s*(-?\d+(?:\.\d+)?)\]/g)].map((x) => Number(x[1]));
  assert.strictEqual(zs.length, 3, '关键帧不是三档：' + zs.length);
  assert.ok(zs[0] > zs[1] && zs[1] > zs[2], '相机 z 非单调，叙事上等于倒车：' + zs.join(' → '));
});

ok('E-171 防复发：首页隐藏导航用带 #navbar 的选择器', () => {
  assert.match(s26, /body\.is-home #navbar \.site-nav-center/, '缺 id 级隐藏规则');
  assert.match(s26, /body\.is-home\.nav-desk #navbar \.site-nav-center/, '缺第二屏浮现规则');
});

console.log('产物契约（dist/index.html）');

const HOME = 'dist/index.html';
if (!exists(HOME)) {
  console.log('  SKIP 产物断言：dist/index.html 不存在，先跑 npm run astro:build');
} else {
  const home = read(HOME);
  const deskStart = home.indexOf('id="desk"');
  const deskEnd = home.indexOf('id="outro"');
  const desk = deskStart > -1 && deskEnd > deskStart ? home.slice(deskStart, deskEnd) : '';

  ok('三屏与画布都在产物里', () => {
    assert.ok(home.includes('id="sd-canvas"'), '产物缺 canvas');
    assert.ok(home.includes('id="hero"'), '产物缺 #hero');
    assert.ok(desk.length > 4000, '#desk 段取样失败');
    assert.ok(home.includes('id="outro"'), '产物缺 #outro');
  });

  ok('四个窗口都在第二屏内，且都不是 <footer>', () => {
    ['win-about', 'win-thinking', 'win-creations', 'win-atlas'].forEach((id) => {
      assert.ok(desk.includes('id="' + id + '"'), '第二屏缺窗口 ' + id);
    });
    assert.ok(!/<footer[\s>]/.test(home.slice(home.indexOf('id="desk"'), home.indexOf('</main>'))), '第二屏出现 footer');
  });

  ok('同一篇文章在首页最多出现 1 次', () => {
    ['/2026/11/04/70b-to-cluster/', '/2026/11/01/metro-vs-gdp-rank-mismatch/', '/2026/10/21/stylekit-design-styles/'].forEach((h) => {
      const n = home.split(h).length - 1;
      assert.strictEqual(n, 1, h + ' 出现 ' + n + ' 次');
    });
  });

  ok('摘要不机械引用正文：无数据出处、无来源域名', () => {
    ['数据出处', 'nvidia.com', 'commons.wikimedia.org', 'stylekit.top'].forEach((s) => {
      assert.ok(!desk.includes(s), '第二屏出现机械引用痕迹：' + s);
    });
  });

  ok('游戏 / 收藏不进第二屏', () => {
    assert.ok(!desk.includes('/games/'), '第二屏出现游戏入口');
    assert.ok(!desk.includes('/collections/'), '第二屏出现收藏入口');
  });

  ok('Atlas 四行 + 四张馆藏缩略图（走 thumbs 目录）', () => {
    ['/cityrank/', '/holidays/', '/festivals/', '/zodiac/'].forEach((h) => {
      assert.ok(desk.includes(h), 'Atlas 缺入口 ' + h);
    });
    const thumbs = desk.match(/\/img\/zodiac\/thumbs\/[a-z]+\.jpg/g) || [];
    assert.strictEqual(thumbs.length, 4, '缩略图不是 4 张：' + thumbs.length);
  });

  ok('About Me 的三句状态描述逐字上屏（主人 2026-11-15 定稿）', () => {
    assert.ok(desk.includes('构建本地优先的私有系统'), '缺第一句');
    assert.ok(desk.includes('独立维护这座数字空间'), '缺第二句');
    assert.ok(desk.includes('数字策展与考据'), '缺第三句');
    // 被点名删除的旧文案不得回潮
    assert.ok(!desk.includes('考研'), '「在学 英语/考研」回到了首页');
    assert.ok(!desk.includes('自信人生二百年'), '座右铭回到了首页');
  });

  ok('行内只放「标题 + 右标签」：没有多行小字摘要，右标签不截断', () => {
    assert.ok(!desk.includes('class="row-s"'), '列表行里又出现了第二行小字');
    const ks = [...desk.matchAll(/class="row-k">([^<]*)</g)].map((m) => m[1]);
    assert.ok(ks.length >= 9, '右标签数量不足：' + ks.length);
    ks.forEach((k) => {
      assert.ok(!k.includes('…'), '右标签被截断：' + k);
      assert.ok(!k.includes('...'), '右标签被截断：' + k);
    });
    ['显存 · 集群', '43 城 · ρ=0.870', '149 种风格', '350 城 · 145 榜'].forEach((want) => {
      assert.ok(desk.includes(want), '右标签缺关键短语：' + want);
    });
  });

  ok('第二屏没有手搓火柴棍图形：<svg> 只允许出现在社交按钮里', () => {
    const svgCount = (desk.match(/<svg/g) || []).length;
    const iconCount = (desk.match(/class="social-svg"/g) || []).length;
    assert.strictEqual(svgCount, iconCount,
      '第二屏出现了非图标 svg：' + (svgCount - iconCount) + ' 个');
    assert.ok(iconCount >= 1, '友链图标缺失');
    // 友链按钮不能再依赖 iconfont 字形（缺字时渲染成空心圆）
    assert.ok(!desk.includes('icon-link'), '友链仍在用 iconfont 的 link 字形');
  });

  ok('浮层语义完整：dialog + labelledby + 关闭按钮 + 每个触发点都有模板', () => {
    assert.ok(/<dialog[^>]*class="sd-modal"[^>]*aria-labelledby="sd-modal-title"/.test(home), 'dialog 缺 aria-labelledby');
    assert.ok(home.includes('data-sd-close'), '浮层缺关闭按钮');
    const triggers = [...home.matchAll(/data-sd-open="([a-z]+)"/g)].map((m) => m[1]);
    assert.ok(triggers.length >= 3, '触发点太少：' + triggers.join(','));
    [...new Set(triggers)].forEach((id) => {
      assert.ok(home.includes('id="sd-tpl-' + id + '"'), '触发点 ' + id + ' 没有对应模板');
    });
  });

  ok('交互脚本被产物引用且盖了内容 hash', () => {
    assert.match(home, /\/js\/home-study\.js\?v=[0-9a-f]{6,}/, '产物里的脚本没有内容 hash');
  });

  ok('旧结构与旧脚本痕迹清零', () => {
    ['mz-', 'home-measure.js', 'sd-scene-word', 'win-note', 'outro-title'].forEach((s) => {
      assert.ok(!home.includes(s), '产物里仍有：' + s);
    });
  });
}

console.log('');
console.log(passed + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
