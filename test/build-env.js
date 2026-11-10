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

console.log(`\nRESULTS: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);
