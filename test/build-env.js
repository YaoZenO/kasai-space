// 构建环境断言（E-112）。
// Vercel 用 scripts/astro:build 构建；本地 Node 版本若与部署不一致，
// CommonJS 包的具名导入会「本地通过、线上失败」。这里把两条硬约束锁死：
//   1. src/ 下禁止从 CJS 包具名导入（hexo-util 在 Node 22 会抛 Named export not found）；
//   2. engines.node 的主版本必须与当前构建机一致，避免部署环境被 engines 降级。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const CJS_PACKAGES = ['hexo-util'];

let failed = 0;
function pass(msg) {
  console.log('  PASS ' + msg);
}
function fail(msg) {
  failed += 1;
  console.log('  FAIL ' + msg);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|astro|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

console.log('构建环境断言');

// 1. 禁止从 CJS 包具名导入
for (const pkg of CJS_PACKAGES) {
  const re = new RegExp(
    `import\\s*\\{[^}]*\\}\\s*from\\s*['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
  );
  const hits = walk(SRC).filter((file) => re.test(fs.readFileSync(file, 'utf8')));
  if (hits.length === 0) {
    pass(`src/ 下没有从 ${pkg}（CommonJS）具名导入`);
  } else {
    for (const file of hits) {
      fail(`${path.relative(ROOT, file)} 从 ${pkg} 具名导入（Node 22 会失败，请改默认导入）`);
    }
  }
}

// 2. engines 主版本与当前 Node 一致
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const enginesNode = String((pkgJson.engines && pkgJson.engines.node) || '');
const currentMajor = process.versions.node.split('.')[0];
if (enginesNode === `${currentMajor}.x`) {
  pass(`engines.node = ${enginesNode}，与当前构建机 Node ${process.versions.node} 一致`);
} else {
  fail(`engines.node = "${enginesNode}"，与当前构建机 Node ${currentMajor}.x 不一致（会改变部署环境）`);
}

// 3. CI 的 node-version 主版本必须与 engines 一致（E-112）。
// 只比对「当前构建机」不够：本地是 Node 24 时，ci.yml 里写着 22 也照样 PASS，
// 环境漂移就一直藏到 push 之后。这里直接读 ci.yml 把两处钉在一起。
const ciFile = path.join(ROOT, '.github', 'workflows', 'ci.yml');
if (fs.existsSync(ciFile)) {
  const ciText = fs.readFileSync(ciFile, 'utf8');
  const matched = ciText.match(/node-version:\s*['"]?(\d+)['"]?/);
  if (!matched) {
    fail('ci.yml 里找不到 node-version');
  } else if (`${matched[1]}.x` === enginesNode) {
    pass(`ci.yml 的 node-version ${matched[1]} 与 engines.node ${enginesNode} 一致`);
  } else {
    fail(`ci.yml 的 node-version ${matched[1]} 与 engines.node ${enginesNode} 不一致（CI 会拿更低的 Node 构建）`);
  }

  // 4. CI 步骤顺序必须与 npm test 链一致（E-133）。
  // test/module-pages-e2e.js 第 [10] 组断言读真实 dist/index.html，构建若排在
  // test:pages 之后，CI 必红；而本地 npm test 是先 astro:build 再 test:pages，
  // 顺序错误在本地永远不复现。这里按文件中的出现顺序校验，不依赖 YAML 结构。
  const buildAt = ciText.indexOf('run: npm run build');
  const pagesAt = ciText.indexOf('run: npm run test:pages');
  if (buildAt < 0 || pagesAt < 0) {
    fail('ci.yml 里找不到 `npm run build` 或 `npm run test:pages`');
  } else if (buildAt < pagesAt) {
    pass('ci.yml 的 Astro build 排在 Module pages E2E 之前（与 npm test 链一致）');
  } else {
    fail('ci.yml 把 Astro build 排在了 test:pages 之后：test:pages 第 [10] 组读 dist/ 会直接失败');
  }

  // 5. CI 语法检查必须覆盖 api/ 下的每一个 .js（issue #11）。
  // 只查「domains」字样不够：将来再拆一层目录照样漏。这里动态枚举
  // api/**/*.js 的实际所在目录，要求 Syntax check 用 find api 递归，
  // 或把每个含 .js 的子目录都显式写进 glob；少一层就 FAIL。
  const syntaxBlock = (ciText.match(/- name:\s*Syntax check[\s\S]*?(?=\n\s*- name:|$)/) || [''])[0];
  const apiDir = path.join(ROOT, 'api');
  const apiJs = fs.existsSync(apiDir)
    ? walk(apiDir).filter((f) => f.endsWith('.js')).map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))
    : [];
  const apiSubdirs = [...new Set(apiJs.map((f) => path.posix.dirname(f)))].filter((d) => d !== 'api');
  if (apiJs.length === 0 || apiSubdirs.length === 0) {
    fail('api/ 下没有子目录 .js，语法覆盖断言会空转');
  } else {
    const usesFind = /find\s+api\s/.test(syntaxBlock) && /-name\s+['"]?\*\.js/.test(syntaxBlock);
    const missing = usesFind ? [] : apiSubdirs.filter((d) => !syntaxBlock.includes(`${d}/*.js`));
    if (missing.length === 0) {
      pass(`ci.yml 的 Syntax check 覆盖 api/ 全部 ${apiJs.length} 个 .js（含 ${apiSubdirs.length} 个子目录）`);
    } else {
      fail(`ci.yml 的 Syntax check 漏掉子目录：${missing.join(', ')}（改用 find api 递归，见 issue #11）`);
    }
  }
} else {
  fail('.github/workflows/ci.yml 不存在');
}

// 6. 构建校验脚本必须指向真实产物目录（E-161）。
// 724fc3f 把构建输出从 Hexo 的 public/ 换成 Astro 的 dist/，但 tools/verify-build.sh
// 仍在查 $ROOT/public，而它不在 npm test 链里、只靠人工调用，失败没人看见——
// E-087 / E-108 的防复发机制实际空转了整整一段时间。这里把目标目录钉死在 dist/：
// 谁再把它改回 public/ 或改丢，这一条直接判红。
const verifyFile = path.join(ROOT, 'tools', 'verify-build.sh');
if (!fs.existsSync(verifyFile)) {
  fail('tools/verify-build.sh 不存在（E-087 的防复发机制缺失）');
} else {
  const verifyText = fs.readFileSync(verifyFile, 'utf8');
  // 只比对可执行行：脚本注释里会写明「原先查的是 $ROOT/public」这类历史说明，
  // 整文件匹配会把注释当违规，断言就会永远红。
  const verifyCode = verifyText
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  const pointsDist = /DIST="\$ROOT\/dist"/.test(verifyCode);
  const pointsPublic = /\$ROOT\/public/.test(verifyCode);
  if (pointsDist && !pointsPublic) {
    pass('tools/verify-build.sh 的目标目录是 dist/（不是 Hexo 时代的 public/）');
  } else if (pointsPublic) {
    fail('tools/verify-build.sh 仍检查 $ROOT/public，而构建输出是 dist/（E-161）');
  } else {
    fail('tools/verify-build.sh 里找不到 DIST="$ROOT/dist"（E-161）');
  }
}

// 7. 后台回收站的运行目录必须真实存在（E-162）。
// `_trash/` 看起来像垃圾目录，实际是后台删除/还原功能的正式落点：
// api/_lib/shared.js 的 TRASH_DIR、api/_lib/domains/trash.js 的清单读写都指着它。
// 2026-11-14 整理仓库时把它当残留整块删掉，回收站清单与两篇已删文章一起消失。
// test:admin 跑在 mockfs 虚拟文件系统上，抓不到这个错——所以在这里对真实磁盘断言。
const trashDir = path.join(ROOT, '_trash');
const trashManifest = path.join(trashDir, 'manifest.json');
if (!fs.existsSync(trashManifest)) {
  fail('_trash/manifest.json 不存在：后台回收站清单丢失（E-162，_trash 不是垃圾目录）');
} else {
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(trashManifest, 'utf8'));
  } catch (err) {
    fail(`_trash/manifest.json 无法解析为 JSON：${err.message}`);
  }
  if (parsed) {
    if (Array.isArray(parsed.items)) {
      pass(`_trash/manifest.json 存在且结构合法（${parsed.items.length} 条回收站条目）`);
    } else {
      fail('_trash/manifest.json 缺少 items 数组（trash 域读写会失败）');
    }
    // 清单里登记的条目必须真的在磁盘上，否则「还原」会指向不存在的文件。
    const missing = (parsed.items || [])
      .map((it) => it.trashPath)
      .filter((p) => p && !fs.existsSync(path.join(ROOT, p)));
    if (missing.length === 0) {
      pass('_trash/manifest.json 登记的所有条目文件均存在');
    } else {
      fail(`回收站条目文件缺失：${missing.join(', ')}（还原会失败）`);
    }
  }
}

// 4. CI 必须执行 package.json 里的每一个 test:* 套件（E-189 / E-195）。
//    套件清单存在两份：package.json 的串行链、ci.yml 的步骤序列。CI 不跑 `npm test`，
//    而是逐项列举，所以「只加进 package.json」等于没加。历史上已两次漂移：
//    E-189 是 test:img 只在本地；2026-11-26 是另外十套从未进过 CI。
//    这里不再写死套件名，而是枚举 package.json 的所有 test:* 脚本逐个反查：
//      · ci.yml 里有 → PASS
//      · 没有但登记在 DEFERRED（必须写原因与解除条件）→ PASS 并标注「暂缓」
//      · 其余 → FAIL（新增套件必须接线）
//    再反向校验 ci.yml 不得执行 package.json 里不存在的套件（改名后旧步骤会空跑）。
const CI_FILE = path.join(ROOT, '.github', 'workflows', 'ci.yml');

// 暂缓接入 CI 的套件。加条目必须写清「为什么现在不能接」和「什么条件下解除」，
// 禁止把它当免检通道长期堆放。
const DEFERRED = {
  'test:darkmode':
    '2026-11-26 复跑 HEAD（5f8b608）红一条：§10-7 断言「暗态段不新增 font-size / 布局量」——' +
    'site.css 的 §4.27（/plates/）被追加在 §15 暗色段之后，而 darkmode-e2e 用「§15 → 文件末尾」切段，' +
    '把 §4.27 的规则当成了暗态规则；同一处还有真实隐患——§4.27 排在 §15 之后，层叠顺序压在暗色覆盖之上。' +
    '解除条件：把 §4.27 移回 §4 段内（或让切段止于下一个分节头）并让 test:darkmode 在 HEAD 上全绿，' +
    '随后把它加进 ci.yml 并从本表删除。',
  'test:festival':
    '2026-11-26 复跑 HEAD（5f8b608）红一条：E-064「site.css 源码无加法 calc」直接拿原始 css 匹配，' +
    '而 site.css 里有一条样式规范说明注释写了「禁用 calc(+/-)」，正则命中注释即误报。' +
    '修法已在另一条工作线的工作区里（改为匹配剥掉注释的 cssNoComment，并加注释豁免自检），尚未提交。' +
    '解除条件：该修法落地、test:festival 在 HEAD 上全绿后，把它加进 ci.yml 并从本表删除。',
};

if (!fs.existsSync(CI_FILE)) {
  fail('.github/workflows/ci.yml 不存在，CI 门禁无从校验');
} else {
  const ci = fs.readFileSync(CI_FILE, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const suites = Object.keys(pkg.scripts || {}).filter((k) => k.startsWith('test:'));
  const runsInCi = (script) => new RegExp('npm run ' + script + '(?![\\w:-])').test(ci);

  const missing = [];
  const deferred = [];
  for (const script of suites) {
    if (runsInCi(script)) continue;
    if (DEFERRED[script]) deferred.push(script);
    else missing.push(script);
  }
  if (missing.length) {
    fail(
      `ci.yml 漏接 ${missing.length} 套断言：${missing.join(', ')}` +
        '（只挂在本地 npm test 上，push 到 main 时等于没加）'
    );
  } else {
    pass(`ci.yml 覆盖 package.json 的全部 ${suites.length - deferred.length} 套断言`);
  }
  if (deferred.length) {
    pass(`暂缓接入 CI 的套件 ${deferred.length} 套（已在 DEFERRED 登记原因）：${deferred.join(', ')}`);
  }

  // 反向：ci.yml 不得执行 package.json 里不存在的套件（改名/删除后旧步骤会空转或直接失败）
  const ciSuites = [...ci.matchAll(/npm run (test:[\w-]+)/g)].map((m) => m[1]);
  const unknown = [...new Set(ciSuites)].filter((s) => !suites.includes(s));
  if (unknown.length) {
    fail(`ci.yml 执行了 package.json 里不存在的套件：${unknown.join(', ')}`);
  } else {
    pass(`ci.yml 引用的 ${new Set(ciSuites).size} 个套件名在 package.json 中都存在`);
  }

  // 读 dist/ 的套件必须排在构建之后，否则 CI 里断言跑在空产物上（E-133 同族）。
  const DIST_SUITES = [
    'test:pages', 'test:img', 'test:blurb', 'test:plates', 'test:home', 'test:form',
    'test:assets', 'test:dates', 'test:holidays', 'test:zodiac', 'test:festival',
    'test:cityrank', 'test:search',
  ];
  const at = (script) => {
    const m = new RegExp('npm run ' + script + '(?![\\w:-])').exec(ci);
    return m ? m.index : -1;
  };
  const buildAt = at('build');
  const early = DIST_SUITES.filter((s) => {
    const i = at(s);
    return i !== -1 && buildAt !== -1 && i < buildAt;
  });
  if (early.length) {
    fail(`这些套件读 dist/ 却排在 Astro build 之前：${early.join(', ')}`);
  } else {
    pass(`读 dist/ 的 ${DIST_SUITES.filter((s) => at(s) !== -1).length} 套断言都排在 Astro build 之后`);
  }
}

console.log(`\nRESULTS: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);
