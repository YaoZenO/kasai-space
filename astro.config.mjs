import { defineConfig } from 'astro/config';

// Astro 静态站点配置（迁移期）
// 关键点：
//  - publicDir 必须是 static-public：Hexo 的产物目录叫 public/，不能被 Astro 占用
//  - build.format = directory：产物为 path/index.html，与 Hexo 一致
//  - compressHTML = false：迁移期保留原始空白，方便与旧产物逐行对照
//  - 不引入任何前端框架：现有原生 JS 与主题运行时原样复用
export default defineConfig({
  site: 'https://www.040925.xyz',
  base: '/',
  output: 'static',
  publicDir: 'static-public',
  // 测试可用 ASTRO_OUT_DIR 指定独立产物目录，避免污染 dist/（见 test/module-pages-e2e.js）
  outDir: process.env.ASTRO_OUT_DIR || 'dist',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  trailingSlash: 'ignore',
  compressHTML: false,
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
  markdown: {
    // 阶段 2 填充：Shiki + rehype-slug + headerlink
  },
});
