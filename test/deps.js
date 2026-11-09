// 依赖声明断言（E-132）。
//
// 背景：724fc3f 清理 Hexo 依赖后，`feedsmith` / `nib` / `ejs` 仍能被解析——
// 不是因为我们声明了它们，而是因为 Hexo 时代的 node_modules 残留还在顶层。
// 本地构建是绿的，CI 走 `npm ci` 严格按 lock 安装，顶层没有这些目录，
// `astro build` 直接报 Rolldown failed to resolve import。
//
// 这里锁两条不变量：
//   1. src / tools / test / astro.config 里 import 或 require 的外部包，
//      必须全部出现在 package.json 的依赖声明里；
//   2. 每个声明的依赖，必须在 package-lock.json 里有对应的 node_modules 条目，
//      否则 `npm ci` 装不出来。
//
// 边界：不扫 themes/fluid/scripts/。那是 Hexo 时代的整套主题脚本
// （hexo / moment / nunjucks / hexo-pagination 等），Astro 构建只用它的
// source/ 样式源；把这些全声明进来是把 Hexo 生态搬回来，不是修幽灵依赖。
// 该目录何时退役由主人决定，本检查不为它背书。

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['src', 'tools', 'test'].map((d) => path.join(ROOT, d));
const SCAN_FILES = ['astro.config.mjs'].map((f) => path.join(ROOT, f));
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.astro'];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  ...Object.keys(pkg.optionalDependencies || {}),
]);

let failed = 0;
function pass(msg) {
  console.log('  PASS ' + msg);
}
function fail(msg) {
  failed += 1;
  console.log('  FAIL ' + msg);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules') return [];
    if (entry.isDirectory()) return walk(full);
    return EXTS.includes(path.extname(entry.name)) ? [full] : [];
  });
}

// npm 包名只允许小写字母、数字、点、下划线、连字符，可带一个作用域。
// 这条形状校验同时挡掉测试代码里写在字符串中的假 import（例如以反斜杠开头的路径）。
const PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

function packageOf(spec) {
  if (!spec) return null;
  if (/^(\.|\/|node:|data:|https?:|astro:)/.test(spec)) return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (!PACKAGE_NAME.test(name)) return null;
  if (builtinModules.includes(name)) return null;
  if (name === 'astro') return null;
  return name;
}

const files = [...SCAN_DIRS.flatMap(walk), ...SCAN_FILES.filter((f) => fs.existsSync(f))];
const SPECIFIER = /(?:import\s+(?:[^'"]*?\sfrom\s+)?|export\s+[^'"]*?\sfrom\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

const used = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = SPECIFIER.exec(src))) {
    const name = packageOf(m[1]);
    if (!name) continue;
    if (!used.has(name)) used.set(name, new Set());
    used.get(name).add(path.relative(ROOT, file).replace(/\\/g, '/'));
  }
}

console.log('扫描文件数: ' + files.length + ' ｜ 引用的外部包: ' + used.size);

const undeclared = [...used.keys()].filter((n) => !declared.has(n)).sort();
if (undeclared.length === 0) {
  pass('源码引用的外部包全部已在 package.json 声明');
} else {
  for (const name of undeclared) {
    fail(`未声明的依赖: ${name}  <- ${[...used.get(name)].slice(0, 3).join(', ')}`);
  }
}

// 声明了但源码没用到的不报错（可能有工具链用途），只提示锁文件缺失——那是 CI 的硬伤。
const lockedRoot = (lock.packages && lock.packages['']) || {};
const lockedDeclared = new Set([
  ...Object.keys(lockedRoot.dependencies || {}),
  ...Object.keys(lockedRoot.devDependencies || {}),
]);
const missingInLock = [...declared].filter((n) => !lockedDeclared.has(n) || !lock.packages[`node_modules/${n}`]).sort();
if (missingInLock.length === 0) {
  pass('package.json 的依赖全部在 package-lock.json 中有对应条目');
} else {
  for (const name of missingInLock) {
    fail(`package-lock.json 缺少条目: ${name}（npm ci 会装不出来）`);
  }
}

console.log(failed === 0 ? '\n依赖声明检查通过' : `\n依赖声明检查失败: ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
