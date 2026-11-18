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

ok('第二屏不再有顶部遮挡条，第一屏不再有 SCROLL 提示', () => {
  assert.ok(!page.includes('sd-veil'), '模板里还留着顶部遮挡条');
  assert.ok(!s26.includes('sd-veil'), '样式里还留着顶部遮挡条');
  assert.ok(!page.includes('sd-cue'), '模板里还留着 SCROLL 提示');
  assert.ok(!s26.includes('sd-cue'), '样式里还留着 SCROLL 提示');
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
  const rest = s26.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/gradient|glow/i.test(rest),
    '§4.26 出现渐变/发光声明：' + ((rest.match(/[^\n]*(gradient|glow)[^\n]*/i) || [''])[0].trim()));
  assert.match(s26, /#sd-canvas\s*\{[^}]*position:\s*fixed/, '画布不是 fixed 全屏层');
});

ok('四窗外壳只定义一次，且不允许逐窗覆盖', () => {
  const shells = s26.match(/\n\.sd-win\s*\{/g) || [];
  assert.strictEqual(shells.length, 1, '.sd-win 外壳被定义了 ' + shells.length + ' 次');
  const shell = /\.sd-win\s*\{([^}]*)\}/.exec(s26)[1];
  ['background-color', 'border', 'border-radius', 'padding'].forEach((prop) => {
    assert.ok(shell.includes(prop), '统一外壳缺少 ' + prop);
  });
  // 允许按 id 做位置（第 4 窗向左探进通道），但不许改外壳属性——外壳必须四窗一致
  const idRules = [...s26.matchAll(/#win-\w+\s*\{([^}]*)\}/g)].map((m) => m[1]);
  idRules.forEach((body) => {
    ['background', 'border', 'border-radius', 'box-shadow', 'padding'].forEach((prop) => {
      assert.ok(!new RegExp('(^|[;\\s])' + prop).test(body),
        '按窗口 id 的规则里改了外壳属性 ' + prop + '：' + body.trim());
    });
  });
  assert.ok(!/\.sd-win--/.test(s26), 'CSS 里出现了窗口变体类（外壳必须完全统一）');
});

ok('抬头只放标题：模板与 CSS 都不存在计数角标', () => {
  assert.ok(!page.includes('win-note'), '模板里出现了 win-note');
  const heads = page.match(/<header class="win-head">[\s\S]*?<\/header>/g) || [];
  assert.strictEqual(heads.length, 6, '窗口抬头不是 6 个：' + heads.length);
  heads.forEach((h) => {
    const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(!/\d/.test(text), '窗口抬头出现数字：' + text);
    assert.ok(/^[\u4e00-\u9fa5A-Za-z ]+$/.test(text), '窗口抬头只应有纯标题：' + text);
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
  assert.match(s26, /\.sd-desk\s*\{[^}]*grid-template-columns:\s*416px/, '.sd-desk 不是 416px 窄幅双列');
  assert.match(s26, /\.sd-desk\s*\{[^}]*min-height:\s*130dvh/, '第二屏高度不是 130dvh');
  assert.match(s26, /\.sd-desk\s*\{[^}]*padding:\s*96px/, '第二屏没有留出 96px 顶距避开胶囊导航');
  assert.match(s26, /\.sd-desk\s*\{[^}]*width:\s*min\(1180px/, '版心不是 1180px');
  assert.match(s26, /#win-atlas\s*\{[^}]*translate:\s*-140px/, '第 4 窗没有向左探进中央通道');
  assert.match(s26, /\.sd-lane--b\s*\{[^}]*padding-top:\s*80px/, '右泳道错位不是 80px');
  assert.match(s26, /\.sd-lane\s*\{[^}]*gap:\s*20px/, '卡间距不是 20px');
  assert.match(s26, /\.sd-lane\s*\{[^}]*flex-direction:\s*column/, '泳道不是纵向排列');
  const shell = /\.sd-win\s*\{([^}]*)\}/.exec(s26)[1];
  assert.match(shell, /height:\s*auto/, '窗口仍在被强制等高');
  assert.ok(!/min-height/.test(shell), '外壳里还留着 min-height，会重新拉起等高与内部白板');
  assert.ok(page.includes('sd-lane sd-lane--a') && page.includes('sd-lane sd-lane--b'),
    '模板里没有两条泳道');
});

ok('画布是 WebGL 三维场景：深度缓冲、距离雾、Catmull-Rom 相机与 DPI', () => {
  assert.match(homeJs, /getContext\('webgl'/, '画布没有用 WebGL');
  assert.match(homeJs, /depth:true/, '没有开深度缓冲，画不出体块遮挡');
  assert.match(homeJs, /gl\.enable\(gl\.DEPTH_TEST\)/, '绘制前没有开深度测试');
  assert.match(homeJs, /const cr=\(a,b,c,d,t\)=>/, '相机没有 Catmull-Rom 插值，关键帧之间会折线');
  assert.match(homeJs, /clamp\(1\.3-d\/380\./, '着色器没有距离雾，远景压不下去');
  assert.match(homeJs, /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/, '画布没适配 devicePixelRatio');
  assert.match(homeJs, /requestAnimationFrame\(loop\)/, '画布没有走 rAF');
  assert.ok(!/createRadialGradient/.test(homeJs), '又回到 2D 渐变画法了');
  assert.ok(!/ctx\.arc\(/.test(homeJs), '又回到画圆点当浮尘的老路');
});


ok('常驻动画由 uT 驱动：星盘双环 / 秋千 / 浮空体三条通道', () => {
  assert.match(homeJs, /uniform float T[,;]/, '没有时间 uniform');
  assert.match(homeJs, /sy>19\.5&&sy<40\./, '缺「绕竖轴自转」通道（星盘环）');
  assert.match(homeJs, /s\.y>40\./, '缺「摆动」通道（赤陶秋千）');
  assert.match(homeJs, /s\.x>0\./, '缺「自转 + 浮动」通道（浮空多面体）');
  assert.match(homeJs, /t \+= dt \* 0\.001/, '没有时间累加，画面不会动');
  assert.match(homeJs, /PAL\.red=\['#e8603c','#d94826','#8e2a12'\]/, '色板里没有赤陶红');
});


ok('内殿终局：只有悬浮多面体核心 + 两道正交星轨环，没有任何十字', () => {
  // 2026-11-17 主人要求：抹掉尽头墙面的十字与塔顶十字，换成方案 B 的几何核心。
  assert.ok(!homeJs.includes('cbox(-GAP,GAP,0,CHT'), '尽头的十字竖杆又回来了');
  assert.ok(!homeJs.includes('-GAP,ARM+GAP'), '尽头的十字横杆又回来了');
  assert.ok(!homeJs.includes("b(0,87.8,0,2,.3,.3,'ink')"), '塔顶的横向短杆又回来了（和竖针一起就是十字）');
  assert.match(homeJs, /const CORE=CT\(0,4\.75,21\.4\)/, '内殿中央没有核心');
  assert.match(homeJs, /icosa\(CORE,1\.78,'core'\)/, '核心不是正二十面体');
  assert.match(homeJs, /beam\(Q\[i\],Q\[j\],\.055,'edge'\)/, '核心没有棱线，正面会读成一块平板');
  const rings = homeJs.match(/hoop\(CORE,[\d.]+,/g) || [];
  assert.strictEqual(rings.length, 2, '星轨环不是两道：' + rings.length);
  assert.match(homeJs, /hoop\(CORE,2\.72,norm\(\[1,\.18,\.12\]\)/, '第一道环不是斜轴');
  assert.match(homeJs, /hoop\(CORE,3\.14,\[0,1,0\]/, '第二道环不是正交水平环');
  assert.match(homeJs, /turns\(v0,CORE,\[0,1,0\],\.58,true\)[\s\S]{0,140}turns\(v0,CORE,norm\(\[1,0,\.15\]\),-\.26,true\)/,
    '两道环没有各自的反向转速，会读成同一块平板在转');
});


ok('E-172 防复发：.row 必须显式声明 width:100% + min-width:0', () => {
  const m = /\.win-row\s*\{([^}]*)\}/.exec(s26);
  assert.ok(m, '§4.26 缺少 .win-row 规则');
  assert.ok(/width:\s*100%/.test(m[1]), '.row 缺 width:100%（grid 容器会被标题顶宽）');
  assert.ok(/min-width:\s*0/.test(m[1]), '.row 缺 min-width:0');
});

ok('场景里每个被调用的辅助函数都有定义（改名不许留裸调用）', () => {
  // E-183：清洗脚本把调用点 at(v) 批量改名成 lift(v)，却漏了定义 const at=…，
  // 页面一加载就是 ReferenceError，整块画布只剩天空色——构建与静态断言全都看不到。
  const helpers = ['lift', 'icosa', 'hoop', 'quad', 'hull', 'box', 'beam', 'loft', 'turns', 'tone',
    'pushV', 'ribbon', 'placeSun', 'aimSun', 'look', 'camera', 'sample', 'hx'];
  helpers.forEach((h) => {
    const used = new RegExp('\\b' + h + '\\s*\\(').test(homeJs);
    // 允许与别的声明写在同一行：`const SPIN=[],turns=…`
    const defined = new RegExp('(?:const|let|var|function)\\s+' + h + '\\s*[=(]').test(homeJs)
      || new RegExp('[,;]\\s*' + h + '\\s*=').test(homeJs);
    assert.ok(!used || defined, '调用了 ' + h + '() 却没有定义，页面会直接 ReferenceError');
  });
  assert.ok(!/\bat\s*\(/.test(homeJs), '还有 at( 的裸调用：旧名只改了一半');
});
ok('E-173 防复发：相机是多档关键帧 + 阻尼收敛，滚动不许瞬移', () => {
  const stops = /const STOPS=\[([\s\S]*?)\n\];/.exec(homeJs);
  assert.ok(stops, '找不到 STOPS 定义');
  const n = (stops[1].match(/^\s{2}\[/gm) || []).length;
  assert.ok(n >= 5, '关键帧不足：' + n + ' 档，镜头会在两屏之间跳');
  assert.match(homeJs, /p \+= \(target - p\) \* 0\.08/, '进度没有阻尼，滚动跟着手指硬走');
  assert.match(homeJs, /function placeSun\(/, '首帧机位没有按视口重算');
});


ok('E-171 防复发：首页隐藏导航用带 #navbar 的选择器', () => {
  assert.match(s26, /body\.is-home #navbar \.site-nav-center/, '缺 id 级隐藏规则');
  assert.match(s26, /body\.is-home\.nav-desk #navbar \.site-nav-center/, '缺第二屏浮现规则');
});

ok('E-179 防复发：卡片左右内距由 .win-row 自己承担且 ≥ 18px', () => {
  // 主题基于 Bootstrap，`.row` 带 margin-left:-15px。行用同名类会被整行拉出卡片左缘，
  // 文字距边框只剩 8px（实测），右标签同时被顶出右框。所以行必须叫 .win-row 并显式 margin:0。
  const row = /\.win-row\s*\{([^}]*)\}/.exec(s26);
  assert.ok(row, '§4.26 缺少 .win-row');
  assert.ok(/margin:\s*0/.test(row[1]), '.win-row 没有显式 margin:0（会被全局 .row 拽走）');
  assert.ok(/padding:\s*9px\s+0/.test(row[1]), '.win-row 只该有纵向内距（水平内距归 .win-rows）');
  const rowsBox = /\.win-rows\s*\{([^}]*)\}/.exec(s26);
  assert.ok(rowsBox && /var\(--win-px\)/.test(rowsBox[1]), '.win-rows 没有承担水平内距');
  const px = /--win-px:\s*(\d+)px/.exec(s26);
  assert.ok(px, '§4.26 缺少 --win-px');
  assert.ok(Number(px[1]) >= 18, '--win-px = ' + px[1] + 'px，行距卡片边框不足 18px');
  // 外壳左右必须归零，否则行再补 22px 会变成双份
  const shell = /\.sd-win\s*\{([^}]*)\}/.exec(s26)[1];
  assert.ok(/padding:\s*0\s+0\s+var\(--win-pb\)/.test(shell),
    '外壳左右内距未归零：行会拿到 22+22 的双份缩进');
  assert.match(shell, /border-radius:\s*6px/, '窗口圆角不是利落的 6px');
  assert.match(shell, /border:\s*1\.5px\s+solid\s+var\(--win-line\)/, '窗口不是 1.5px 硬边');
  ['\.win-head', '\.win-ident', '\.win-lines li', '\.win-social-row', '\.win-split', '\.win-foot']
    .forEach((sel) => {
      const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(s26);
      assert.ok(m, '§4.26 缺少 ' + sel);
      // .win-lines li 的水平缩进走 margin（这样分隔线跟着内缩，不顶到边框），其余走 padding
      const okIndent = /var\(--win-px\)/.test(m[1]);
      assert.ok(okIndent, sel + ' 的水平内距没有用 var(--win-px)，与行不对齐');
    });
});

ok('E-179 防复发：六个窗口各有 more 入口，指向各自主页', () => {
  const page = read(PAGE);
  const links = [...page.matchAll(/class="win-more" href=\{urlFor\('([^']*)'\)\}/g)].map((m) => m[1]);
  ['/about/', '/archives/', '/projects/', '/games/', '/collections/', '/library/'].forEach((h) => {
    assert.ok(links.includes(h), '缺少指向 ' + h + ' 的 more 入口（当前：' + links.join(',') + '）');
  });
  assert.strictEqual((page.match(/class="win-foot"/g) || []).length, 5,
    '底栏容器数与预期不符（Thinking / Creations / Games / Collections / Library 各一）');
});
ok('E-174 防复发：片元着色器必须有精度兜底，否则链接失败整屏空白', () => {
  assert.match(homeJs, /#ifdef GL_FRAGMENT_PRECISION_HIGH/, '缺精度兜底分支');
  assert.match(homeJs, /precision mediump float;/, '没有 mediump 兜底');
  assert.ok(homeJs.includes('SCENE_FS=HP+'), '片元着色器没有拼上精度头');
});


ok('E-176 防复发：明暗只由面法线与固定光向点积落三档', () => {
  assert.match(homeJs, /const LIGHT=norm\(\[/, '找不到固定光向');
  assert.match(homeJs, /const d=dot\(n,LIGHT\),p=PAL\[mat\]/, '明暗没有走「法线·光向」');
  assert.match(homeJs, /return d>\.42\?p\[0\]:d>-\.12\?p\[1\]:p\[2\]/, '三档阈值被改动了');
  assert.ok(!/gl\.enable\(gl\.BLEND\)/.test(homeJs), '引入了混合批次：透明面会互相打架，而且没有排序');
  assert.match(homeJs, /gl\.disable\(gl\.CULL_FACE\)/, '背面剔除被打开：法线靠 quad 的 out 点翻正，两面都要画');
});


ok('E-177 防复发：内殿两档机位必须正对核心，不许对着墙根', () => {
  assert.match(homeJs, /\[inCH\(0,3\.5,-2\.5\),inCH\(0,4\.6,CL\),44\]/, '内殿第一机位没有对准核心高度');
  assert.match(homeJs, /\[inCH\(0,3\.4,7\.5\),inCH\(0,ARM-\.4,CL\),50\]/, '内殿第二机位没有对准核心');
});


ok('E-180 防复发：核心必须走自发光批次，暗夜系数不能把它压暗', () => {
  assert.match(homeJs, /\(mat=='core'\|\|mat=='orbit'\|\|mat=='edge'\)\?-5:0/, '核心没有进自发光批次');
  assert.match(homeJs, /s\.y<-4\.5\)\{f=1\.;k=c;\}/, '自发光分支没有在 k=c*N*DM 之后覆盖，暗态会连核心一起压暗');
  assert.match(homeJs, /THM\.DM = dark \? \[0\.52, 0\.46, 0\.4\] : \[1, 1, 1\]/, '暗夜暖金系数不是 0.52/0.46/0.40');
  // E-184：自转槽与材质标记共用 s.y。自发光体必须把槽号写成负数，否则裸 turns() 会把
  // -5 覆盖成 20+i，核心在暗态跟着建筑一起被压成褐色（实测 #745f46，应是 #e9bd72）。
  assert.match(homeJs, /turns\(v0,CORE,\[0,1,0\],\.34,true\)/, '核心自转没有标自发光');
  assert.match(homeJs, /\(emis\?-1:1\)\*\(20\+SPIN\.length\)/, 'turns 不写负槽号，自发光标记会被覆盖');
  assert.match(homeJs, /float sy=s\.y;if\(sy<-19\.5\)sy=-sy;/, '着色器没有把负槽号还原成正槽，核心不会转');
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

  ok('六个窗口都在第二屏内，且都不是 <footer>', () => {
    ['win-about', 'win-thinking', 'win-creations', 'win-games', 'win-collections', 'win-atlas'].forEach((id) => {
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

  ok('游戏与收藏板块已回到第二屏，且带完整出口', () => {
    assert.ok(desk.includes('href="/games/"'), '第二屏缺少游戏入口 /games/');
    assert.ok(desk.includes('href="/collections/"'), '第二屏缺少收藏入口 /collections/');
  });

  ok('六个窗口抬头只有标题（无篇数角标），标题统一为英文单行', () => {
    ['About Me', 'Thinking', 'Creations', 'Games', 'Collections', 'Library'].forEach((t) => {
      assert.ok(desk.includes('>' + t + '</h2>'), '抬头缺标题：' + t);
    });
    const heads = [...desk.matchAll(/<header class="win-head">([\s\S]*?)<\/header>/g)];
    assert.strictEqual(heads.length, 6, '抬头数量不是 6：' + heads.length);
    heads.forEach((h) => {
      const label = h[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      assert.ok(!/\d/.test(label), '抬头里出现数字（篇数 / 个数角标）：' + label);
      assert.strictEqual((h[1].match(/<h2/g) || []).length, 1, '抬头里不止一个标题');
    });
  });

  ok('Library 四行入口 + 四张与本行对应的界面裁图', () => {
    ['/cityrank/', '/holidays/', '/festivals/', '/zodiac/'].forEach((h) => {
      assert.ok(desk.includes(h), 'Library 缺入口 ' + h);
    });
    // 2026-11-16：改裁本站页面，四行各配一张、顺序一一对应。
    // 只放同一个专题的图（比如全是生肖）等于把四件事说成一件，断言锁死这件事。
    const thumbs = [...desk.matchAll(/\/img\/library-thumbs\/([a-z]+)\.jpg/g)].map((m) => m[1]);
    assert.deepStrictEqual(thumbs, ['cityrank', 'holidays', 'festivals', 'zodiac'],
      '四张裁图必须与四行一一对应：' + thumbs.join(','));
    assert.ok(!/\/img\/zodiac\/thumbs\//.test(desk), '又回到只放生肖缩略图的老路');
    assert.ok(desk.includes('class="win-scraps"'), '缺左栏画廊容器');
    assert.ok(desk.includes('class="win-split-main"'), '缺左图右文的分栏结构');
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
    const subs = [...desk.matchAll(/class="row-s">([^<]*)</g)].map((m) => m[1]);
    assert.ok(subs.length >= 11, '两行结构缺失：说明小字只有 ' + subs.length + ' 条');
    subs.forEach((t) => assert.ok(t.trim().length >= 4, '行内说明过短或为空：' + JSON.stringify(t)));
    const ks = [...desk.matchAll(/class="row-k">([^<]*)</g)].map((m) => m[1]);
    assert.ok(ks.length >= 9, '右标签数量不足：' + ks.length);
    ks.forEach((k) => {
      assert.ok(!k.includes('…'), '右标签被截断：' + k);
      assert.ok(!k.includes('...'), '右标签被截断：' + k);
    });
    ['显存 · 集群', '数据考据', 'AI 产品', '随笔', 'Vue · Node', 'Tauri 2 · TS',
      'Astro · Vercel', 'MOBA · 在玩', 'Nexus Mods', '350 城 · 145 榜'].forEach((want) => {
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
    const triggers = [...home.matchAll(/data-sd-open="([a-z0-9-]+)"/g)].map((m) => m[1]);
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
