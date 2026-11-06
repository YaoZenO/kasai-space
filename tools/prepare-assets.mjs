// 资源准备：把 source/ 与 themes/fluid/source/ 的静态资源复制到星式隔离目录 static-public/，
// 并编译主题 stylus、压缩本站 CSS。
//
// 设计要点：
//   · 绝不写入 Hexo 的 public/（那是旧站产物，迁移期由 Hexo 继续负责）
//   · 只操作 static-public/，每次全量重建，保证幂等
//   · hexo-config() 的取值来自 themes/fluid/_config.yml，与 Hexo 渲染时一致

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import stylus from 'stylus';
import yaml from 'js-yaml';
import { minifyCss } from './lib/minify-css.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(ROOT, 'static-public');
const THEME = path.join(ROOT, 'themes', 'fluid');
const require = createRequire(import.meta.url);

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyInto(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('[prepare-assets] 跳过不存在的路径:', path.relative(ROOT, src));
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

/** 逐字移植 hexo-renderer-stylus 的 getProperty（hexo-config() 取值规则） */
function getProperty(obj, name) {
  name = String(name).replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
  const split = name.split('.');
  let key = split.shift();
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return '';
  let result = obj[key];
  const len = split.length;
  if (!len) {
    if (result === 0) return result;
    return result || '';
  }
  if (typeof result !== 'object') return '';
  for (let i = 0; i < len; i++) {
    key = split[i];
    if (!Object.prototype.hasOwnProperty.call(result, key)) return '';
    result = result[key];
    if (typeof result !== 'object') return result;
  }
  return result;
}

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, 'utf8')) || {};
}

const themeConfig = readYaml(path.join(THEME, '_config.yml'));

// Hexo 侧由 inject 插件补齐空数组；这里补同样的默认值，
// 否则 stylus 的 `for $x in hexo-config("injects.variable")` 会拿到空串而报错。
themeConfig.injects = themeConfig.injects || { variable: [], mixin: [], style: [], script: [] };

// Hexo 侧由主题脚本 scripts/events/lib/highlight.js 在构建前把 highlight.js 的样式文件
// 解析进 theme.config（highlight.styl 靠它 @require）。这里做等价解析：
// 当前配置 lib=highlightjs、style="github gist" → github-gist.css 不存在，回退 github.css；
// dark_mode 关闭，所以 dark 为 false（highlight-dark.styl 因此编译为空）。
if (themeConfig.code && themeConfig.code.highlight && themeConfig.code.highlight.enable
  && themeConfig.code.highlight.lib === 'highlightjs') {
  themeConfig.code.highlight.highlightjs = themeConfig.code.highlight.highlightjs || {};
  themeConfig.code.highlight.highlightjs.light = {
    file: path.join(ROOT, 'node_modules', 'highlight.js', 'styles', 'github.css'),
  };
  themeConfig.code.highlight.highlightjs.dark = false;
}

const nib = require('nib');

function compileStyl(srcRel, destRel) {
  const src = path.join(THEME, 'source', srcRel);
  const dest = path.join(OUT, destRel);
  const text = fs.readFileSync(src, 'utf8');
  const style = stylus(text)
    .use(nib())
    .define('hexo-config', node => getProperty(themeConfig, node.val))
    .set('filename', src)
    .set('sourcemap', false)
    .set('compress', false) // 与 hexo-renderer-stylus 默认一致，随后由 minifyCss 压缩
    .set('include css', true);

  return new Promise((resolve, reject) => {
    style.render((err, css) => {
      if (err) return reject(err);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, css);
      resolve(css.length);
    });
  });
}

async function main() {
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  // 1) 主题资源先复制，站点资源后复制（同名文件以站点为准）
  copyInto(path.join(THEME, 'source', 'js'), path.join(OUT, 'js'));
  copyInto(path.join(THEME, 'source', 'img'), path.join(OUT, 'img'));

  copyInto(path.join(ROOT, 'source', 'js'), path.join(OUT, 'js'));
  copyInto(path.join(ROOT, 'source', 'img'), path.join(OUT, 'img'));
  copyInto(path.join(ROOT, 'source', 'css'), path.join(OUT, 'css'));
  copyInto(path.join(ROOT, 'source', 'fonts'), path.join(OUT, 'fonts'));
  copyInto(path.join(ROOT, 'source', 'lib'), path.join(OUT, 'lib'));
  copyInto(path.join(ROOT, 'source', 'admin'), path.join(OUT, 'admin'));
  copyInto(path.join(ROOT, 'source', 'favicon.ico'), path.join(OUT, 'favicon.ico'));
  copyInto(path.join(ROOT, 'source', 'robots.txt'), path.join(OUT, 'robots.txt'));

  // 1.5) 统一文本资源换行符为 LF。
  // Hexo 产物里 js/css/html 都是 LF（Windows 检出的是 CRLF）；
  // 不归一化会导致 ?v= 的内容 hash 与现站不一致（只是换行差异，却让所有缓存失效一次）。
  const TEXT_EXT = /\.(js|css|html|htm|txt|xml|json|svg)$/i;
  let normalized = 0;
  for (const rel of fs.readdirSync(OUT, { recursive: true })) {
    const name = String(rel);
    const abs = path.join(OUT, name);
    if (!TEXT_EXT.test(name) || !fs.statSync(abs).isFile()) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (text.includes('\r\n')) {
      fs.writeFileSync(abs, text.replace(/\r\n/g, '\n'));
      normalized += 1;
    }
  }

  // 2) 编译主题样式（与 Hexo 的 stylus renderer 同参数）
  const sizes = [];
  sizes.push(await compileStyl('css/main.styl', 'css/main.css'));
  sizes.push(await compileStyl('css/highlight.styl', 'css/highlight.css'));
  sizes.push(await compileStyl('css/highlight-dark.styl', 'css/highlight-dark.css'));

  // 3) 压缩本站 CSS（site.css 手写注释多；main.css 幂等无害）
  const cssDir = path.join(OUT, 'css');
  let changed = 0;
  for (const name of fs.readdirSync(cssDir)) {
    if (!/\.css$/i.test(name)) continue;
    const abs = path.join(cssDir, name);
    const css = fs.readFileSync(abs, 'utf8');
    const min = minifyCss(css);
    if (min !== css) {
      fs.writeFileSync(abs, min);
      changed += 1;
    }
  }

  const count = fs.readdirSync(OUT, { recursive: true }).filter(p => fs.statSync(path.join(OUT, String(p))).isFile()).length;
  console.log('[prepare-assets] static-public/ 文件数 =', count, '| CSS 压缩文件数 =', changed);
  console.log('[prepare-assets] 编译输出字节:', sizes.join(' / '));
}

main().catch(err => {
  console.error('[prepare-assets] 失败:', err);
  process.exit(1);
});
