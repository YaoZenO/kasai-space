# Astro 迁移 Spec（决策完备版）

> 状态：待主人批准后进入执行。
> 上游依据：`docs/astro-migration/PLAN.md`（盘点与 8 项决策记录）、`docs/astro-migration/URL-BASELINE.txt`（验收基线）。
> 分支：`astro-migration`（已从 `85fa96f` 切出，唯一新提交 `44ae49c` 只含 `package-lock.json`）。
> 本文档只描述阶段 1 的可执行细节，阶段 2–5 只写接口与依赖，不写实现。

---

## 1. 目标

把 Hexo 8 + 魔改 Fluid 站点迁移为 Astro 静态站点，**页面优先**：URL、信息架构、文案、数据、视觉全部保持现状，只替换生成器。

硬约束（任何阶段都不得违反）：

1. `source/_posts`、`source/_data`、`source/img`、`source/fonts`、`source/css`、`source/js`、`source/lib`、`source/admin` 的**内容零改动**（阶段门禁：`git diff --exit-code -- source/_posts source/_data`）。
2. URL 1:1：702 页面 + `/404.html` 全部原路径；现有 12 条 301 原样保留；不新增跳转。
3. 视觉以现站为准，不顺手改设计、字号、配色、间距。
4. 不引入 React/Vue/Svelte 等前端框架。
5. 不提交、不推送工作区里他人未提交的 9 个改动：`AGENTS.md`、`DESIGN-LANGUAGE.md`、`ENVIRONMENT.md`、`PRD.md`、`_config.yml`、`api/_lib/config.js`、`package.json`、`package-lock.json`、`source/admin/index.html` 中**不属于本任务的部分**。本任务新增的 `package.json` 脚本与 devDependencies 单独成批提交，且提交前逐文件核对。
6. 测试只用 `ADMIN_DEV_MOCK=1`（E-001）；构建脚本放 `tools/`，不放根 `scripts/`（E-004）；禁止 `git checkout --` / `git restore` 撤销测试破坏（E-032）。

---

## 2. 技术栈与版本（已安装，未提交）

| 项 | 版本 | 用途 |
|---|---|---|
| astro | 7.4.7 | 静态站点生成器 |
| js-yaml | 4.3.2 | 读 `_config.yml` / `source/_data/*.yml` |
| rehype-slug | 6.0.0 | 文章标题锚点（阶段 2） |
| stylus | 0.64.0 | 编译主题 `main.styl` / `highlight.styl` |
| Node / npm | v24.14.1 / 11.11.0 | 构建环境 |

**不新增依赖**：日期格式化用 `Intl.DateTimeFormat`（`timeZone: Asia/Shanghai`）自实现，不引入 moment。

---

## 3. 目录与构建链

```
astro.config.mjs               # Astro 配置（新增）
tsconfig.json                  # 仅 for editor / astro check（新增）
tools/
  prepare-assets.mjs           # 资源隔离、stylus 编译、内容 hash（新增）
  verify-urls.mjs              # dist URL vs 基线（新增）
  lib/asset-version.mjs        # 移植 asset-version 算法（新增）
src/
  lib/site-config.ts           # 读 _config.yml + themes/fluid/_config.yml
  lib/data.ts                  # 读 source/_data/*.yml
  lib/url.ts                   # urlFor / assetUrl / versionedAsset
  lib/dates.ts                 # parsePostDate / formatDate / fullDate / fmtItemDate
  lib/i18n.ts                  # zh-CN 文案（仅迁移实际用到的键）
  lib/posts.ts                 # 阶段 1 只留接口，阶段 2 实现
  layouts/BaseLayout.astro
  layouts/PaperLayout.astro
  components/Head.astro
  components/SiteNav.astro
  components/SiteFooter.astro
  components/Styles.astro
  components/Scripts.astro
  components/PageHead.astro
  pages/index.astro
  pages/404.astro
  pages/about/index.astro
  pages/now/index.astro
  pages/links/index.astro
  pages/tags/index.astro
  pages/categories/index.astro
  pages/projects/index.astro
  pages/games/index.astro
  pages/collections/index.astro
  pages/library/index.astro
  pages/zodiac/index.astro
  pages/holidays/index.astro
  pages/city/index.astro
  pages/cityrank/index.astro
  pages/festivals/index.astro
static-public/                 # 构建期资源目录（gitignore），映射到站点根 /
dist/                          # Astro 产物（gitignore）
```

构建顺序：`node tools/prepare-assets.mjs` → `astro build`。

`package.json` 新增脚本（不改动现有 `build`/`server` 等，切换在阶段 5）：

```json
"astro:assets": "node tools/prepare-assets.mjs",
"astro:build": "node tools/prepare-assets.mjs && astro build",
"astro:verify": "node tools/verify-urls.mjs --mode=subset"
```

`.gitignore` 追加 `static-public/`、`dist/`、`.astro/`。

---

## 4. `astro.config.mjs`（精确配置）

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.040925.xyz',
  base: '/',
  output: 'static',
  publicDir: 'static-public',   // 关键：不能占用 Hexo 的 public/
  outDir: 'dist',
  build: {
    format: 'directory',        // /path/index.html，与 Hexo 一致
    inlineStylesheets: 'never', // 全部走 <link>，与现站一致
  },
  trailingSlash: 'ignore',
  compressHTML: false,          // 迁移期保留原空白，便于 golden diff
  vite: { build: { assetsInlineLimit: 0 } },
  markdown: {
    // 阶段 2 填充：shiki 主题 + rehype-slug + 自定义 headerlink
  },
});
```

理由：Hexo 产物是 `path/index.html` 且 HTML 不压缩；`publicDir` 必须是 `static-public`，否则会与 Hexo 的 `public/` 冲突（P2-1）。

---

## 5. `tools/prepare-assets.mjs`（精确行为）

1. 清空并重建 `static-public/`（只操作该目录，**绝不触碰 `public/`**）。
2. 复制顺序（后写覆盖先写）：
   1. `themes/fluid/source/{js,img}` → `static-public/{js,img}`
   2. `source/{js,img,favorites?}` → 同上（站点资源优先，`/img/avatar/11.jpg` 以站点版为准）
   3. `source/css/site.css` → `static-public/css/site.css`
   4. `source/fonts/**` → `static-public/fonts/**`
   5. `source/lib/**` → `static-public/lib/**`
   6. `source/admin/**` → `static-public/admin/**`
   7. `source/favicon.ico`、`source/robots.txt` → 根
   8. `themes/fluid/source/img/default.png`、`loading.gif`、`avatar.png`、`police_beian.png` 随第 1 步进入（banner 兜底图）
3. 用 `stylus` 编译（`compress: true`，与 `hexo-renderer-stylus` 默认一致）：
   - `themes/fluid/source/css/main.styl` → `static-public/css/main.css`
   - `themes/fluid/source/css/highlight.styl` → `static-public/css/highlight.css`
   - `themes/fluid/source/css/highlight-dark.styl` → `static-public/css/highlight-dark.css`（现站为 0 字节，编译结果若为空即保留空文件）
4. 写 `static-public/.asset-manifest.json`：`{ "/css/site.css": "<hash>", "/css/main.css": "<hash>", ... }`，供 `versionedAsset()` 读取。
5. hash 算法：**逐字移植** `themes/fluid/scripts/filters/asset-version.js`（执行阶段先读该文件，抽成 `tools/lib/asset-version.mjs`），保证 `?v=` 形态与现站一致（8 位 hex 形态；值是否与旧产物相同以实测为准，不同则记录原因）。
6. 幂等：同样输入连续两次构建，`static-public/` 内容 hash 不变。

---

## 6. 数据与工具函数（签名与规则）

### 6.1 `src/lib/site-config.ts`

- 读 `_config.yml`（站点）与 `themes/fluid/_config.yml`（主题），`js-yaml.load`，模块级缓存。
- 导出 `siteConfig`（`title`/`subtitle`/`description`/`author`/`url`/`timezone`/`language`/`date_format`/`keywords`/`pagination_dir`）、`themeConfig`（原样）、`t(key)` 与以下派生值：
  - `separator = theme.title_join_string || theme.tab_title_separator`
  - `navbarMenu`、`navbarAuxMenu`
  - `footerContent`
  - `staticPrefix`
  - `canonicalEnable`、`openGraphEnable`、`darkModeEnable`、`highlightEnable`、`lazyloadOnlyPost`
- 注释明确：YAML 无引号日期会被 js-yaml 解析为 `Date`（E-028 根源），模板层禁止直出。

### 6.2 `src/lib/data.ts`

- `getData()`：读 `source/_data/*.yml`（12 个），返回 `{ site, modules, projects, games, collections, cityrank, cities, cityphotos, holidays, festivals, library, zodiac }`。
- 只读、不改写、不补默认值；缺文件返回 `null` 并 `console.warn`。

### 6.3 `src/lib/url.ts`

- `urlFor(path = '/')`：补前导 `/`，保留原有尾斜杠；非 ASCII 段**不做额外编码**（与 Hexo `url_for` 一致，实测产物目录名为原文）。
- `assetUrl(p)`：`staticPrefix` 前缀拼接（`internal_js` `/js`、`internal_css` `/css`）。
- `versionedAsset(p)`：读 `.asset-manifest.json`，返回 `p + '?v=' + hash`；manifest 缺失时抛错（禁止静默降级）。

### 6.4 `src/lib/dates.ts`

- `parsePostDate(raw)`：三种 front matter 写法统一解析，**按 `Asia/Shanghai` 壁钟**：
  1. `2023-04-18 23:14:00`（js-yaml → Date，UTC 语义）→ 用 UTC 分量重解释为 +08:00；
  2. `"2026-11-04 01:16:46"` → 直接按 +08:00 解析；
  3. `"2026-11-04T01:16:46+08:00"` → 原生解析。
  返回 `Date`（绝对时刻正确）。
- `fmtItemDate(value, format = 'YYYY-MM-DD')`：逐条移植 `themes/fluid/scripts/helpers/fmt-item-date.js` 的 5 条规则；时区用 `Intl.DateTimeFormat` + `Asia/Shanghai`。
- `formatDate(value, 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm' | 'MM-DD' | 'YYYY')`：token 替换实现，覆盖模板用到格式。
- 断言：7 篇文章 URL 日期与基线一致；`_data` 全部 `date` 字段输出 `YYYY-MM-DD`，不含 `GMT`。

### 6.5 `src/lib/i18n.ts`

只收录阶段 1 实际渲染的键（其余用到再补）：`home.menu`、`about.menu`、`archive.post_total`、`category.post_total`、`tag.post_total`、`category.more`、`page404.title`、`page404.subtitle`、`search.title`、`noscript_warning`、`darkmode.light`、`darkmode.dark`。取值逐字来自 `themes/fluid/languages/zh-CN.yml`。

---

## 7. 布局与组件（DOM 逐字复刻）

复刻基准文件（只读，不改）：`themes/fluid/layout/layout.ejs`、`_partials/{head,css,scripts,footer}.ejs`、`_partials/site/nav.ejs`、`_partials/header.ejs`。

### 7.1 `BaseLayout.astro`

- `<html lang="zh-CN">`（`data-default-color-scheme` 仅在暗色开启时输出，当前不输出）。
- `<body class="is-home">` 仅在首页。
- 结构顺序：`skip-link` → `<header>`（空，当前 `inject_point('header')` 无内容）→ `<main id="main-content" tabindex="-1">` → `<footer>` → scripts → `<noscript>`。
- `main` 包裹规则：
  - 纸面类 layout（`paper`/`about`/`archive`/`tags`/`categories`/`tag`/`category`/`links`/`search`/`holidays`/`zodiac`/`library`/`festival`/`festivals`/`cityrank`/`rank`/`city`/`cityindex`/`province`/`404`/`module-index`/`project`/`game`）与 `is_home`：直接输出插槽；
  - 其余：`div.container.nopadding-x-md > #board > .container > .row > .col-12.col-md-10.m-auto`。
- 底部固定：`#scroll-top-button`（`scroll_top_arrow.enable` 为 true，当前输出）、`theme.custom_html`（当前为空 → 不输出）。
- 搜索弹窗**不复刻**（已于 2026-11-04 撤除）。

### 7.2 `Head.astro`（逐项对齐 `head.ejs`）

1. `meta charset`；2. apple-touch 180、favicon 32/16；3. 3 条字体 preload；4. canonical（`canonical.enable=true`）；5. viewport；6. `x-ua-compatible`；7. `force_https` 关闭 → 不输出 CSP；8. `theme-color = color.navbar_bg_color`；9. `author`；10. `keywords`（数组 → 逗号拼接）；11. open_graph（`enable: true`，**逐字移植** `node_modules/hexo/lib/plugins/helper/open_graph.js` 的输出形态）；12. `custom_head`（空）；13. `<title>page.title + separator + config.title`；14. `Styles.astro`；15. `export_config()` → **阶段 4 处理，阶段 1 先留空占位注释**；16. `/js/utils.js`、`/js/color-schema.js`（defer）；17. 关闭的 analytics；18. speculationrules 块（逐字复刻，含 `/admin/*`、`/archives*`、`/categories/*`、`/tags/*`、`/*.xml` 排除）；19. `inject_point('head')`（空）。
- 禁止：把 `Date` 交给模板直出（E-028）。

### 7.3 `Styles.astro`

顺序与现站完全一致：`/lib/bootstrap/4.6.1/css/bootstrap.min.css` → 页面 css_snippets（阶段 1 为空）→ `/lib/iconfont-theme.css` → `/lib/iconfont.css` → `/css/main.css` → `/css/highlight.css`（`media="print" onload="this.media='all'"` + noscript）→ `/css/site.css?v=<hash>`（`versionedAsset`）。

### 7.4 `Scripts.astro`

顺序：nprogress（`height 3px` / `#29d` / `showSpinner:false` / `trickleSpeed:100`）→ jquery → bootstrap → `/js/events.js` → `/js/plugins.js` →（typed 未启用，不加载）→ `img-lazyload.js` 仅文章页/页面且 `onlypost: true` → 页面 script snippets → `/js/boot.js`。全部 `defer`。`custom_js` 为空。

### 7.5 `SiteNav.astro`

- 逐字复刻 `nav.ejs` 的 DOM：`#navbar.navbar.fixed-top.navbar-dark.scrolling-navbar.site-nav > .site-nav-inner`，品牌、`.site-nav-center`（胶囊 + `.site-nav-aux`）、`.site-nav-actions`（`#search-btn` 直链 `/search/`、`#navbar-toggler-btn`）。
- 选中态规则：`currentPath` = 去 `index.html` 的页面路径；`/` 精确匹配，其余前缀匹配；下拉父项按子项命中判定。
- 移动端九宫格 `#mobile-grid-menu` 同构复刻（含搜索格、aux 两项）。

### 7.6 `SiteFooter.astro`

`<div class="footer-inner"><div class="footer-content"><span>© 2026 KASAI</span></div></div>`（statistics/beian 均关闭）。

### 7.7 `PaperLayout.astro`

纸面页统一骨架：`.paper-page > .home-wrap > header(.page-head | .page-head-plain) + 内容插槽`，可选结尾 `cal-after` 区块由页面自己提供。

---

## 8. 阶段 1 页面清单（无数据不渲染）

| URL | 数据源 | 说明 |
|---|---|---|
| `/` | `site.yml` + `modules.yml` + `library.yml` | 静态壳：身份域 + 内容墙（模块格 + 资料库格）；主卡/精选（curation-pool）与最新文字/动态（posts）阶段 2–3 补齐 |
| `/about/` | `source/about/index.md` + `site.yml` + 主题 about | 身份区 + markdown 正文 + 社交图标（含 copy/qrcode 三态） |
| `/now/` | `source/now/index.md` | `paper` 版式 |
| `/links/` | `theme.links.items` | 当前为空 → 空态文案（逐字） |
| `/404.html` | 主题 `page404` | 倒数 10 秒 + 「返回首页」按钮，脚本逐字 |
| `/tags/` | posts（阶段 2） | 阶段 1 输出页头，列表留空（无数据不渲染） |
| `/categories/` | posts（阶段 2） | 同上 |
| `/projects/` | `projects.yml` | 行式卡片网格 |
| `/games/` | `games.yml` | 封面墙（`games-wall`，1 大 + 2 中 + 2 小 + 1 横幅） |
| `/collections/` | `collections.yml` | 外链卡片；无 link 渲染为非链接卡 |
| `/library/` | `library.yml` | 专题卡墙；计数现算 |
| `/zodiac/` | `zodiac.yml` + `zodiac-data` 部分 | 生肖总览 |
| `/holidays/` | `holidays.yml` + `holiday-calendar` 部分 | 年份总览 |
| `/city/` | `cities.yml` + `cityphotos.yml` | 城市索引总览 |
| `/cityrank/` | `cityrank.yml` + `cityrank-data` 部分 | 榜单总览 |
| `/festivals/` | `festivals.yml` | 法定/传统两组卡片 |

说明：zodiac/holidays/city/cityrank 的总览页需要用到对应 helper 的**部分函数**，因此阶段 1 按「总览所需」先移植这些函数的只读部分（不改算法），阶段 3 再补详情页所需部分。

---

## 9. 验证（每步都要真实执行并报告）

1. `node tools/prepare-assets.mjs` → 退出码 0；`static-public/` 文件数与预期一致；`main.css` 与旧 `public/css/main.css` 字节级 diff（允许仅 hash 校验失败时的记录）。
2. `npx astro build` → 退出码 0；无 0 字节 HTML（E-029 教训：`.astro` 渲染错误可能产出空文件，须显式扫描）。
3. `node tools/verify-urls.mjs --mode=subset` → 阶段 1 生成 URL ⊆ 基线，且无基线外路径；输出缺失清单（预期：仅未实现的数量）。
4. `git diff --exit-code -- source/_posts source/_data` → 必须为空。
5. 浏览器对照（desktop 1440 / mobile 390）：`/`、`/about/`、`/now/`、`/links/`、`/404.html`、`/projects/`、`/games/`、`/collections/`、`/library/`、`/zodiac/`、`/holidays/`、`/city/`、`/cityrank/`、`/festivals/`。
6. `/css/site.css?v=`、字体 preload、导航、移动九宫格、搜索图标跳转均可用。

**未验证项必须显式标注「未验证」**。

---

## 10. 阶段 1 交付物与边界

交付：上述文件 + 两个构建脚本 + 本 spec / tasks；本地可运行的 `astro build` 产物；验证报告。

不做：不提交、不推送、不改 Vercel 配置、不删 Hexo 文件、不动 `public/`、不写阶段 2+ 的实现。

---

## 11. 后续阶段接口（不在本次执行）

- 阶段 2：`src/lib/posts.ts` 读 `source/_posts`（content collection），Markdown 管线（Shiki + rehype-slug + headerlink），文章/归档/分类/标签详情。
- 阶段 3：`curation-pool`、`festival-data`、`zodiac-data`、`holiday-calendar`、`cityrank-data`、`china-map`（33 SVG）、`search-index`。
- 阶段 4：`export_config()`、`/admin/` 适配、16 个测试迁移、Vercel 设置。
- 阶段 5：全量 URL 精确比对（`--mode=exact`）、301 校验、视觉全量验收、合并 main。
