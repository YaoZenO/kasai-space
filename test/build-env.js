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

console.log(`\nRESULTS: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);
