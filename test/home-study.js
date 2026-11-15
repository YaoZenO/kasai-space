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

ok('首页导航：品牌整块隐藏，胶囊钉在第 2 列严格居中，第二屏才浮现', () => {
  assert.match(s26, /body\.is-home #navbar \.site-brand[\s\S]{0,80}display: none/, 'CSS 没有在首页隐藏品牌');
  // 只是 opacity:0 时品牌仍占 1fr 列，胶囊被挤到右侧——必须 display:none + 显式钉到第 2 列
  assert.match(s26, /body\.is-home #navbar \.site-nav-center[\s\S]{0,90}grid-column: 2/,
    '胶囊没有钉到中间列，会被空掉的品牌列挤偏');
  assert.match(s26, /body\.is-home #navbar \.site-nav-center[\s\S]{0,90}justify-self: center/,
    '胶囊没有显式居中');
  assert.ok(!/\.site-nav-inner\s*\{[^}]*grid-template-columns:\s*1fr auto;/.test(s26),
    '容器又被改成两列了——两列时胶囊落在 1fr 里，天然偏左/偏右');
  assert.match(s26, /body\.is-home #navbar \.site-nav-center[\s\S]{0,60}opacity: 0/, '首页没有默认收起宽胶囊');
  assert.match(s26, /body\.is-home\.nav-desk #navbar \.site-nav-center[\s\S]{0,60}opacity: 1/, '第二屏没有浮现宽胶囊');
  assert.match(homeJs, /classList\.toggle\('nav-desk'/, 'JS 没有切换 nav-desk');
  assert.match(s26, /body\.is-home #navbar \.site-nav-actions[\s\S]{0,60}justify-self: end/, '动作区没有靠右');
  assert.ok(!s26.includes('nav-away'), 'nav-away 机制已废弃，不应留在样式里');
});

ok('第二屏是双泳道错落：两条独立纵列、中央通道、窗口紧包内容', () => {
  assert.match(s26, /\.sd-desk\s*\{[^}]*display:\s*flex/, '.sd-desk 不是 flex 双泳道');
  assert.match(s26, /\.sd-desk\s*\{[^}]*min-height:\s*190dvh/, '第二屏滚动高度没有拉到 190dvh');
  assert.match(s26, /\.sd-desk\s*\{[^}]*gap:\s*clamp\(56px, 8vw, 110px\)/, '两列之间没有中央视觉通道');
  assert.match(s26, /\.sd-lane--b\s*\{[^}]*padding-top:\s*22vh/, '右泳道没有下错 22vh');
  assert.match(s26, /\.sd-lane\s*\{[^}]*flex-direction:\s*column/, '泳道不是纵向排列');
  const shell = /\.sd-win\s*\{([^}]*)\}/.exec(s26)[1];
  assert.match(shell, /height:\s*auto/, '窗口仍在被强制等高');
  assert.ok(!/min-height/.test(shell), '外壳里还留着 min-height，会重新拉起等高与内部白板');
  assert.ok(page.includes('sd-lane sd-lane--a') && page.includes('sd-lane sd-lane--b'),
    '模板里没有两条泳道');
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
  assert.ok(reduceBlock.includes('p = 0.52'), 'reduce 分支没有固定静态帧');
  // 曾经被否掉的形态：只画点与线
  assert.ok(!/createRadialGradient/.test(homeJs), '又回到 2D 渐变画法了');
  assert.ok(!/ctx\.arc\(/.test(homeJs), '又回到画圆点当浮尘的老路');
});

ok('常驻顶点动画：三类动态部件由 uTime 驱动，不滚动画面也在动', () => {
  assert.match(homeJs, /attribute vec4 a;/, '顶点没有动画通道 a');
  assert.match(homeJs, /attribute vec2 b;/, '顶点没有支点 / 相位通道 b');
  assert.match(homeJs, /float ang = uT \* a\.y \+ b\.y/, '动画角度没有接 uTime');
  // 三个类型分支：绕竖轴自转、绕水平轴摆动、自转+浮动
  assert.ok(homeJs.includes('t > 0.5 && t < 1.5'), '缺「绕竖轴自转」分支（星盘环）');
  assert.ok(homeJs.includes('t > 1.5 && t < 2.5'), '缺「绕水平轴摆动」分支（钟摆）');
  assert.ok(homeJs.includes('t > 2.5 && t < 3.5'), '缺「自转 + 浮动」分支（浮空多面体）');
  assert.match(homeJs, /pos\.y \+= sin\(ang \* 0\.7\) \* 0\.55/, '浮空体没有上下浮动');
  // 常驻时间累加：只要画面不动，这条就会掉
  assert.match(homeJs, /t \+= dt \* 0\.001/, '没有时间累加，画面不会动');
  assert.match(homeJs, /(terra):\s*\[0\.784, 0\.353, 0\.196\]/, '色板里没有赤陶色 #C85A32');
  assert.match(homeJs, /octa\(tx, pivotY - 5\.9, tz, 1\.5, 'terra', swing\)/, '钟摆不是赤陶色八面体');
});

ok('静水内院：半透明光柱与水面波纹走独立通道', () => {
  assert.match(homeJs, /t > 3\.5 && t < 4\.5\) \? 0\.33/, '光柱没有走半透明批次');
  assert.match(homeJs, /gl\.enable\(gl\.BLEND\)[\s\S]{0,200}gl\.depthMask\(false\)/, '光柱没有开混合 / 关深度写入');
  assert.match(homeJs, /vType > 4\.5/, '水面没有波纹着色');
  assert.match(homeJs, /uniform vec2 uPool/, '波纹没有池心 uniform，会画在屏幕空间');
  assert.match(homeJs, /shaft\(4\.4\);\s*[\s\S]{0,60}shaft\(1\.3\)/, '光柱不是多层叠加');
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

ok('E-174 防复发：两个着色器必须同为 mediump，否则程序链接失败整屏空白', () => {
  const prec = homeJs.match(/'precision (highp|mediump) float;'/g) || [];
  assert.ok(prec.length >= 2, '精度声明不足');
  assert.ok(prec.every((x) => x.indexOf('mediump') > -1),
    '出现了 highp 全局精度：同名 uniform 两侧精度不一致会直接链接失败');
  assert.match(homeJs, /attribute highp vec3 p;/, '位置属性没有单独 highp，160 米尺度会抖');
  assert.match(homeJs, /uniform highp mat4 uV;/, '相机矩阵没有单独 highp');
});

ok('E-176 防复发：光源必须侧向（z 分量不为正）', () => {
  const m = /LIGHT = norm\(\[([-\d.]+), ([-\d.]+), ([-\d.]+)\]\)/.exec(homeJs);
  assert.ok(m, '找不到 LIGHT 定义');
  assert.ok(Number(m[3]) <= 0,
    '光源 z 分量为正：朝向观众的面会被照到最亮档，建筑读作纸片剪影');
});

ok('E-177 防复发：每档关键帧的 eye 与 ctr 不能共 z（lookAt 会退化）', () => {
  const block = /var STOPS = \[([\s\S]*?)\n    \];/.exec(homeJs);
  assert.ok(block, '找不到 STOPS');
  const pairs = [...block[1].matchAll(/eye:\s*\[([^\]]+)\],\s*ctr:\s*\[([^\]]+)\]/g)];
  assert.strictEqual(pairs.length, 3, '关键帧不是三档');
  pairs.forEach((pair, i) => {
    const ez = pair[1].split(',')[2].trim();
    const cz = pair[2].split(',')[2].trim();
    assert.notStrictEqual(ez, cz, '第 ' + (i + 1) + ' 档 eye.z 与 ctr.z 相同，视线朝正下方，整屏会糊成一团');
  });
});

ok('E-178 防复发：柱距不小于 8 米（柱身不许贴脸）', () => {
  const m = /var pz = 12 - k \* ([\d.]+)/.exec(homeJs);
  assert.ok(m, '找不到柱距');
  assert.ok(Number(m[1]) >= 8, '柱距 ' + m[1] + ' 米：机位会落在柱子旁边，柱身贴满两侧画面');
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
