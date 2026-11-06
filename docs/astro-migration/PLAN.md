# Astro 迁移盘点与实施方案（待确认）

> 状态：**只做盘点和方案，未改任何代码**。
> 基线数据：`HEAD = 85fa96f`（main，与 origin/main 同步）；构建产物 `public/` 于 2026-11-06 生成。
> URL 全量清单见同目录 [URL-BASELINE.txt](./URL-BASELINE.txt)。

---

## 0. 结论摘要

现站是**纯静态**：702 个页面 + 1 个 404 + 5 个数据端点，全部由 Hexo 8.1.1 + 魔改 Fluid 主题的一次 `hexo generate` 产生。内容全部落在 `source/`（7 篇文章、46 个页面声明 md、12 个数据 YAML、静态资源），后台 `source/admin` 通过 GitHub App 写入同样的文件路径。

迁移可行性：**高**。目标结构：

- Astro 静态构建（`output: 'static'`），不引入任何前端框架，保持现有原生 JS；
- 内容目录**原地不动**（`source/_posts`、`source/_data`、`source/img` 等），Astro 直接读取；
- 74 个 EJS 模板逐个改写成 `.astro`，**沿用同一套 DOM 结构与 class**，因此 `site.css` / `main.css` 原样复用，视觉零漂移；
- 6 个自研生成器 + 20 个 helper 的逻辑逐函数移植，不重新设计算法；
- URL 目标 **702/703 全量 1:1 保留**，现有 12 条 301 原样保留，不新增“必须跳转”的 URL；
- `api/` 后台函数与 `vercel.json` 基本不动，后台写文件格式不变。

需要你拍板的 8 个问题见 §11。

---

## 1. 仓库实况核对

| 项 | 值 |
|---|---|
| 分支 | `main`，上游 `origin/main`，无未推送提交 |
| 生成器 | Hexo 8.1.1；`npm run build` = `hexo generate` |
| 构建产物 | `public/`：703 个 HTML、982 个文件、32.7 MB（已 gitignore） |
| Node / npm | v24.14.1 / 11.x（注意：`AGENTS.md` 快照写的是 Node 22，实际已升级） |
| 部署 | Vercel Git 集成，push main 自动构建；`deploy.type` 为空，`hexo deploy` 是空操作 |
| 域名 | `040925.xyz`（apex 308 → www） |
| 项目名 | `package.json` 与 `api/_lib/config.js` 已被其他会话改为 `kasai-space`（未提交） |

**工作区里有 8 个不属于本任务的未提交改动**（`AGENTS.md`、`DESIGN-LANGUAGE.md`、`ENVIRONMENT.md`、`PRD.md`、`_config.yml`、`api/_lib/config.js`、`package-lock.json`、`source/admin/index.html`）。迁移全程**不碰、不提交、不推送**这些文件。

已有约束（来自仓库规则，必须继承）：
- 测试只用 mock 模式（`ADMIN_DEV_MOCK=1`），禁止对真实仓库跑写操作测试（E-001）；
- 根 `scripts/` 会被 Hexo 自动加载，**构建脚本不能放根 `scripts/`**（E-004）；
- 后台前端改版必须 bump 两处 `?v=`（E-018）；
- 日期渲染禁止 EJS/模板直出 Date（E-028/E-029）；
- push 前 `git fetch` 并逐条核对 `origin/main..HEAD`（E-102）。

---

## 2. 内容层清单（迁移中零改动）

### 2.1 文章（7 篇）
`source/_posts/*.md`，文件名即 URL slug，`permalink: :year/:month/:day/:title/`。

| 文件 | URL |
|---|---|
| `C++-Job-StudyRoadMap.md` | `/2023/04/18/C++-Job-StudyRoadMap/` |
| 其余 6 篇（2026-10 / 2026-11） | `/2026/10/…/`、`/2026/11/…/` 共 6 条，详见基线文件 `[POSTS]` |

front matter 字段：`title` / `date` / `slug`（仅 1 篇显式写了，其余用文件名）/ `tags` / `categories`。
日期存在 3 种写法：无引号（`2023-04-18 23:14:00`）、双引号字符串（`"2026-11-04 01:16:46"`）、后台写入的带 `+08:00` ISO 串——必须统一解析（见风险 P0-2）。
无 `<!-- more -->`、无加密字段、无 Hexo 标签插件（`{% %}`），Markdown 可平移。

### 2.2 页面声明 md（46 个，正文为空，只做路由声明）
| 目录 | 数量 | 作用 |
|---|---|---|
| `source/about/index.md` | 1 | 关于页正文（需保留文案） |
| `source/now/index.md` | 1 | 现在页正文 |
| `source/festivals/index.md` | 1 | 节令总览 |
| `source/holidays/` | 17 | 索引 + 2021–2036 共 16 年 |
| `source/library/` | 13 | 索引 + 12 个节令详情 |
| `source/zodiac/` | 13 | 索引 + 12 生肖 |

这些 stub 的 front matter（`layout` / `year` / `key` 等）是现站的**路由真值**，Astro 要么继续读它们，要么由 `_data` 生成同样的路由；二者 URL 完全一致。

### 2.3 数据文件（`source/_data/`，12 个）
`site.yml`、`modules.yml`、`projects.yml`、`games.yml`、`collections.yml`、`cityrank.yml`、`cities.yml`、`cityphotos.yml`、`holidays.yml`、`festivals.yml`、`library.yml`、`zodiac.yml`。

- 结构：`items:` / `topics:` / `animals:` / `festivals:` 等数组 + 少量顶层标量；
- 日期为 **无引号 YAML 日期**（被解析成 `Date`，只有日期粒度）——是 E-028 的根源，Astro 必须沿用同一解析后走统一 helper；
- **禁止改写任何一个值**；迁移期用 `git diff --exit-code source/_data` 作为硬门禁。

### 2.4 静态资源
| 位置 | 规模 |
|---|---|
| `source/img/**` | 188 个文件，10.8 MB（城市照片、头像、封面等） |
| `source/fonts/**` | 5 个 woff2（V3.4 字体基线） |
| `source/css/site.css` | 183 KB 源文件（压缩后产物 99 KB） |
| `source/js/**` | 5 个页面脚本（about / festival / holidays / zodiac / site-search） |
| `source/lib/**` | 10 个第三方目录（bootstrap / jquery / fancybox / tocbot / anchor / nprogress / typed / clipboard / hint / github-markdown），15 个文件 |
| `themes/fluid/source/**` | 54 个文件（`main.styl`+`highlight.styl` 编译出的 css、7 个主题 js、5 张主题图） |
| 构建期生成 | 33 张省份 SVG 地图（`/img/map/*.svg`，由 `china-map.js` 生成，源文件不在仓库） |
| `source/admin/**` | 13 个文件 125 KB，原样静态复制到 `/admin/` |

另有 `_private/`（10 个私密文件）、`_trash/`（3 个）在 `source/` 之外，迁移后必须继续**不参与构建**。

---

## 3. URL 基线（验收唯一标准）

完整清单：`docs/astro-migration/URL-BASELINE.txt`（702 条页面 + 404 + 端点）。

| 类型 | 数量 | 路由模式 |
|---|---|---|
| 首页 | 1 | `/` |
| 文章 | 7 | `/YYYY/MM/DD/<slug>/` |
| 归档 | 6 | `/archives/`、`/archives/<年>/`、`/archives/<年>/<月>/` |
| 分类 | 8 | `/categories/` + 7 个分类（中文目录名） |
| 标签 | 14 | `/tags/` + 13 个标签（Hexo slugize 后，如 `C++` → `/tags/C/`） |
| 项目 | 4 | `/projects/` + 3 个详情（目录名是 **百分号编码**，如 `%E6%A0%A1…`） |
| 游戏 | 6 | `/games/` + 5 个详情 |
| 收藏 | 1 | `/collections/` |
| 资料库 | 13 | `/library/` + 12 个节令详情 |
| 节令总览 | 1 | `/festivals/` |
| 生肖 | 13 | `/zodiac/` + 12 生肖 |
| 节假日 | 17 | `/holidays/` + 2021–2036 |
| 城市榜 | 146 | `/cityrank/` + 145 个榜单 |
| 城市 | 460 | `/city/` + 28 个省 + 431 个城市 |
| 其他 | 5 | `/about/`、`/now/`、`/links/`、`/search/`、`/admin/` |
| 404 | 1 | `/404.html` |
| 端点 | 5 | `/atom.xml`、`/sitemap.xml`、`/search-index.json`、`/robots.txt`、`/favicon.ico` |

**现有 301（vercel.json，12 条，原样保留）**：`/uses(/)?` → `/now/`；`/city/province/{beijing,tianjin,shanghai,chongqing,xianggang}(/)?` → `/city/<同名>/`（这 5 个直辖市没有省页）。

**URL 保真结论**：全部 702 条可在 Astro 用 `getStaticPaths` 1:1 生成（`build.format: 'directory'` 产出 `path/index.html`，与 Hexo 一致）。**没有任何一条“必须变”的页面 URL**。真正需要逐条验证的是 3 类特殊路径：
1. `+` 号路径（`/2023/04/18/C++-Job-StudyRoadMap/`）——需确认 Astro 不会把它写成 `%2B`；
2. 中文/百分号编码路径（分类、项目详情）——需确认产物目录名与现站逐字节一致；
3. 标签 slug 压缩规则（`C++` → `C`）——移植 `hexo-util` 的 slugize 行为。

---

## 4. 页面清单（路由 → 模板 → 数据）

| 页面 | 路由 | 现模板 | 数据来源 |
|---|---|---|---|
| 首页 | `/` | `index.ejs`（17.5KB） | posts + `modules.yml` + 各模块数据 + `curation-pool` |
| 文章 | `/YYYY/MM/DD/slug/` | `post.ejs` | 文章 md |
| 归档 | `/archives/**` | `archive.ejs` + `archive-list.ejs` | posts |
| 分类总览/详情 | `/categories/**` | `category-list.ejs` / `archive-list.ejs` | posts |
| 标签总览/详情 | `/tags/**` | `tag-list.ejs`(chip) / `archive-list.ejs` | posts |
| 关于 | `/about/` | `about.ejs` | md + `about.js` |
| 现在 | `/now/` | `paper.ejs` | md |
| 友链 | `/links/` | `links.ejs` | 主题配置（当前列表为空） |
| 搜索 | `/search/` | `search.ejs` | `search-index.json` + `site-search.js` |
| 项目总览/详情 | `/projects/**` | `module-index.ejs` / `project.ejs` | `projects.yml` |
| 游戏总览/详情 | `/games/**` | `module-index.ejs` / `game.ejs` | `games.yml` |
| 收藏 | `/collections/` | `module-index.ejs` | `collections.yml` |
| 资料库总览 | `/library/` | `library.ejs` | `library.yml` |
| 节令详情 | `/library/<key>/` | `festival.ejs`（15.3KB） | `festivals.yml` + `festival-data` + `festival.js` |
| 节令总览 | `/festivals/` | `festivals.ejs` | `festivals.yml` |
| 生肖总览/详情 | `/zodiac/**` | `zodiac.ejs`（17.5KB） | `zodiac.yml` + `zodiac-data` + `zodiac.js` |
| 节假日总览/详情 | `/holidays/**` | `holidays.ejs`（12KB） | `holidays.yml` + `holiday-calendar` + `holidays.js` |
| 城市榜总览/详情 | `/cityrank/**` | `cityrank.ejs` / `rank.ejs` | `cityrank.yml` + `cityrank-data` |
| 城市总览/城市/省 | `/city/**` | `cityindex.ejs` / `city.ejs` / `province.ejs` | `cities.yml` + `cityphotos.yml` + `city-fields` + `china-map` |
| 404 | `/404.html` | `404.ejs` | 静态 |
| 后台 | `/admin/` | `source/admin/index.html`（原样） | API |

模板总量：**74 个 EJS（27 个页面级 + 47 个 partial，221 KB）**。这是本次重写的主要工作量，但其中 `comments` 等分支当前全部关闭，可不移植。

---

## 5. 自研模块清单（逐个移植）

### 5.1 生成器（6 个）
| 生成器 | 产出 | 移植方式 |
|---|---|---|
| `index-generator.js` | `/`（per_page=10，7 篇无分页） | `src/pages/index.astro` |
| `pages.js` | `/404.html`、`/tags/`、`/categories/`、`/links/` | 4 个静态页面 |
| `module-pages.js` | 项目/游戏/收藏 11 条 URL | `getStaticPaths` + 复用 slug 规则 |
| `cityrank-pages.js` | 城市榜 146 + 城市 460 + 33 张 SVG 地图 | `getStaticPaths` + `china-map` 移植 |
| `search-index.js` | `/search-index.json`（636 条） | `src/pages/search-index.json.ts`（prerender） |
| `local-search.js` | 现站**未产出** `/local-search.xml` | **不移植**（保持不存在） |

### 5.2 helper（20 个）
纯计算类、可近原样复用：`cityrank-data`、`holiday-calendar`、`festival-data`、`zodiac-data`、`city-fields`、`china-map`、`excerpt-text`、`fmt-item-date`、`wordcount`、`date`。
Hexo 胶水类、需替换：`asset-url`、`engine`、`export-config`、`import`、`injects`、`page`、`scope`、`url`、`utils`、`curation-pool`（依赖 `site.posts`/`site.data`，改成入参注入）。

### 5.3 filter（5 个）
| filter | 现行为 | Astro 等价 |
|---|---|---|
| `asset-version` | 内容 hash → `?v=` 缓存破坏 | 构建期 helper `versionedAsset(path)` |
| `minify-css` | 压缩 `site.css`、`main.css` | 构建脚本（或产物预压缩） |
| `post-filter` | `hide`/`archive`/`featured` 等语义 | 读取文章时过滤 |
| `default-injects` | 注入点默认内容 | 组件 slots |
| `locals` | 注入 `site`/`page` 变量 | Astro `Astro.locals`/模块数据层 |

### 5.4 客户端脚本（12 个，原样复用）
theme 7 个（`boot/utils/events/plugins/img-lazyload/color-schema/local-search`）+ 页面 5 个（`about/festival/holidays/zodiac/site-search`）+ `highlight.js` 等 vendor。
主题运行时依赖 bootstrap / jquery / fancybox / tocbot / anchorjs / nprogress / typed，全部是静态文件，**继续原样引用**，不改技术栈。

### 5.5 样式
`themes/fluid/source/css/*.styl`（`main.styl`、`highlight.styl`、`highlight-dark.styl`）继续用 stylus 编译出 `main.css` / `highlight.css`（现 `highlight-dark.css` 为 0 字节，可保持为空或省略）；`source/css/site.css` **一字不改**直接发布。

---

## 6. 后台（admin）盘点

| 项 | 现状 |
|---|---|
| 入口 | `/admin/`（Hexo `skip_render: admin/**` 原样复制） |
| API | `api/` 下 11 个 endpoint + 18 个 `_lib` 文件，零第三方依赖（`node:crypto` + `fetch`） |
| 写入路径 | `source/_posts/**`、`source/_data/*.yml`、`source/img/**`、`_drafts/`、`_trash/` |
| 文章格式 | YAML front matter；`date` 序列化为**带双引号的 ISO 8601（带 +08:00）**；文件名与 date 对已发布文章锁定 |
| 数据格式 | `items:`/`topics:` 等数组 + 自定义 YAML 序列化（含引号规则）；图片走 `contentBase64` + 本地 `gitBlobSha` 防假冲突 |
| 部署联动 | 每次写入生成 GitHub commit → 触发 Vercel 自动部署 |

**结论：后台后端不需要改。** 只要 Astro 继续读 `source/` 的同一批文件，API 路径与格式全部保持。需要适配的只有三点：
1. 构建入口从 `hexo generate` 换成 `astro build`（Vercel 构建命令）；
2. `/admin/` 从“Hexo 复制 source”改为“预构建脚本复制 source/admin”（URL 不变）；
3. 后台若展示“站点结构/预览地址”，需核对没有硬编码 Hexo 专有路径。

---

## 7. 目标目录与构建链（提议）

```text
astro.config.mjs                  # output: 'static', build.format: 'directory', trailingSlash: 'ignore'
src/
  content.config.ts               # posts ← source/_posts；pages ← source/{about,now,holidays,zodiac,library,festivals}
  lib/                            # 20 个 helper 的 ESM 版（逻辑不改，去 Hexo 依赖）
  layouts/                        # Base / Paper / Post / Module
  components/                     # header、nav、footer、搜索面板、TOC、文章 meta 等
  pages/
    index.astro
    [year]/[month]/[day]/[slug].astro
    archives/**  categories/**  tags/**
    about/ now/ links/ search/ 404.astro
    projects/**  games/**  collections/
    library/  library/[festival]/
    festivals/  zodiac/**  holidays/**
    city/  city/[city]/  city/province/[province]/
    cityrank/  cityrank/[rank]/
    search-index.json.ts  atom.xml.ts  sitemap.xml.ts
tools/
  prepare-assets.mjs              # source/{css,js,img,fonts,lib,admin} + themes/fluid/source → 静态发布目录；编译 stylus
  verify-urls.mjs                 # dist 产物 URL ↔ 基线逐条比对
  verify-redirects.mjs            # 301 校验（本地/线上）
static-public/                    # 构建生成，gitignore；不覆盖现有 public/
api/                              # 原样不动
vercel.json                       # 原样不动（12 条 301 + 8 条 headers）
```

要点：
- **不改 Markdown 渲染观感**：复用 `marked` + `highlight.js`，按 `node_modules/hexo-renderer-marked` 的配置（headerIds、headerlink、langPrefix、行号）逐项复刻；7 篇文章做 HTML golden diff。
- **日期按 `Asia/Shanghai` 解释**（重点风险，见 §9-P0-2）。
- 静态资源走“构建前复制”而不是搬仓库：`source/` 保持唯一真源，避免 10.8 MB 图片出现两份。
- 旧 `public/`（Hexo 产物）**保留不动**，切换前可随时回滚。

---

## 8. URL 与部署策略

1. 所有页面保持原路径、尾斜杠、编码形式；`/admin/`、`/search-index.json`、`/atom.xml`、`/sitemap.xml`、`/robots.txt` 保持。
2. 现有 12 条 301 与 8 条 Cache-Control 规则**原文件保留**；若最终发现个别 URL 无法等价复现，只允许追加 301 到同一文件，并在基线文件里标注。
3. 部署切换：在 `astro-migration` 分支完成；Vercel 预览用本地构建 + 一次性 preview 部署验证（**禁止 prod 手动部署**）；全部验收通过后再 merge main 由 Git 集成自动生产发布。
4. 切换前最后一次“旧站快照”：`public/` 全量 URL 列表 + 关键页面截图，作为回滚与验收依据。

---

## 9. 风险清单

| 级别 | 风险 | 后果 | 对策 |
|---|---|---|---|
| **P0-1** | Markdown 渲染管线不一致（marked 版本/headerlink/highlight 行号） | 文章正文 HTML 结构变化，`site.css` 命中不了，代码块/TOC 错位 | 锁定 marked 15 + highlight.js 11.11；7 篇逐篇 golden diff（normalize 空白后比较） |
| **P0-2** | 日期时区漂移 | 文章 URL 变 `/YYYY/MM/DD`，归档/排序全错 | 已实测：无引号 `2023-04-18 23:14:00` 被 js-yaml 解析成 **UTC**；必须按 `Asia/Shanghai` 壁钟时间重新计算。三种格式（无引号 / 带引号字符串 / `+08:00`）统一走一个 `parsePostDate()`，并对 7 篇 + 全部 `_data` 日期做断言 |
| **P0-3** | 特殊路径编码 | `C++`、中文分类、`%E6` 项目详情 404 | 阶段 1 先做 3 条原型验证；产物目录名与基线逐字节比对；必要时用构建后补写文件兜底 |
| **P0-4** | Vercel 上 Astro 静态站点与根 `api/` 函数共存 | 后台全部 500/404 | 阶段 4 用 preview deployment 实测 `/api/session`、`/api/content/list`；不行则改 `@astrojs/vercel` adapter 或 `vercel.json` functions 显式声明 |
| **P0-5** | 后台写入格式与 Astro 解析不一致（YAML 日期、长文本、引号） | 后台发文章/改数据后构建失败或显示异常 | 阶段 4 用 mock 模式做全模块 round-trip；断言“写入→读取→渲染”闭环；绝不跑真实仓库（E-001） |
| **P1-1** | 74 个模板复刻遗漏（首页 17.5KB、生肖/城市/榜页逻辑重） | 页面空白、区块缺失、移动端错位 | 按页面清单逐页对照现站；每页做 desktop+mobile 截图比对；空数据模块不渲染的规则保留 |
| **P1-2** | 首页精选算法（`curation-pool` 21KB）移植偏差 | 主卡/精选名单与现站不同 | 逻辑原样迁移，用现有 `test/curation.js` 同款用例做快照断言 |
| **P1-3** | 33 张省份 SVG 地图生成路径/内容不一致 | 城市页地图缺失 | `china-map` 原样移植；产物逐字节比对（SVG 是纯函数输出） |
| **P1-4** | stylus 编译链断裂（`main.css` 41KB） | 主题基础样式丢失 | 复用已安装的 `stylus`/`hexo-renderer-stylus` 逻辑，在 `prepare-assets` 里编译；产物与现 `main.css` 比对 |
| **P1-5** | 搜索索引条目数/摘要不一致 | 搜索结果变少或乱 | 移植 `search-index.js` 分类规则；断言 636 条及各类计数（post 7 / city 431 / rank 145 / festival 12 / zodiac 12 / holiday 16 / topic 5 / page 8） |
| **P1-6** | 缓存破坏机制（`?v=`）丢失 | 线上看不到新样式（E-018） | 构建期内容 hash 注入，URL 形态与现站一致 |
| **P1-7** | 预览环境后台误写 main | 污染生产数据 | 预览只读验证；写入测试仅 mock 模式 |
| **P2-1** | 旧 `public/` 与新 `dist/` 混淆 | 部署错产物 | Vercel 构建命令显式 `astro build`；产物目录独立 |
| **P2-2** | sitemap/atom 与现站差异 | 收录/订阅页面列表变化 | 用端点复刻；允许 sitemap 更完整，但逐条核对不丢 URL |
| **P2-3** | 404 页、`/links/` 空列表、0 字节 `highlight-dark.css` | 细节不一致 | 纳入验收清单逐项确认 |

---

## 10. 分阶段执行计划（每阶段跑通构建 + 对照基线）

### 阶段 1：骨架与静态数据页
- 建 Astro 工程、`content.config.ts`（先只读 `_data` 与页面 md）、`prepare-assets.mjs`、`verify-urls.mjs`；
- 复刻 Base/Paper 布局、导航、页脚、搜索面板外壳；
- 产出：`/`（先静态壳）、`/about/`、`/now/`、`/links/`、`/404.html`、`/tags/`、`/categories/`，以及项目/游戏/收藏/资料库/生肖/节假日/城市/城市榜的**总览页**（详情页放到阶段 3）；
- **验收**：`astro build` 成功；上述页面在浏览器中与现站逐区对照（desktop 1440 / mobile 390）；`/css/site.css`、字体、导航、搜索面板可加载；URL 集合 ⊆ 基线且无多余路径。

### 阶段 2：文字（7 篇文章）
- 接通 `_posts` 集合、Markdown 渲染管线、文章页模板、归档/分类/标签详情；
- **验收**：7 条文章 URL 全部 200；正文 HTML 与现站 golden diff 通过；TOC/anchor/代码高亮/上一篇下一篇/分类条/标签正常；`/archives/**`、`/categories/**`、`/tags/**` 全部生成且计数一致；`git diff --exit-code source/_posts` 为空。

### 阶段 3：自研模块逐个移植（按依赖顺序）
1. 项目 / 游戏 / 收藏（`module-pages`）
2. 资料库 + 节令（`festival-data`）
3. 生肖（`zodiac-data`）
4. 节假日（`holiday-calendar`）
5. 城市 + 城市榜 + 33 张 SVG（`cityrank-pages` / `china-map`）
6. 首页精选与墙面（`curation-pool`）
7. 搜索索引（`search-index`）
- 每完成一个模块就跑一次该模块 URL 子集校验 + 该页面截图对照；**验收**：对应基线 URL 全部生成，数据条数与现站一致，空数据模块不渲染。

### 阶段 4：后台适配与测试
- 确认 `api/` 与 Astro 静态产物在 preview 中共存；
- 后台可访问 `/admin/`，只读列表正常；mock 模式下“新建文章 / 改数据 / 传图 / 回收站”round-trip；
- 移植/替换现有 16 个测试中与产物相关的断言（URL、搜索、日期、资产版本）；
- 在 Vercel 项目设置里把 Framework 切到 Astro、Build Command 改 `npm run build`（脚本内部走 `astro build`）、Output 目录 `dist`；在 preview 分支上验证构建成功；
- **验收**：mock 全流程通过；真实仓库零写入（`git status` 除预期文件外无变化）；preview 构建产物与本地一致。

### 阶段 5：重定向校验与切换
- `verify-urls.mjs`：`dist` 全量 URL vs 基线，**差异必须为空**（除显式记录项）；
- `verify-redirects.mjs`：12 条 301 逐条 301→200；
- 旧 URL 线上可达性抽查（覆盖基线中每一个 URL 分组，至少 1 条/组）；
- 关键页面 desktop/mobile 视觉验收：首页、一篇文章、归档、城市榜详情、城市详情、节假日详情、生肖详情、资料库、搜索、关于、后台；
- 最后一次核对推送范围（E-102）后合并 main；上线后 24 小时内复查 404 与构建。
- **回滚**：保留 Hexo 分支与 `public/` 快照，`git revert` 即可恢复。

---

## 11. 决策记录（2026-11-06 已确认）

| # | 问题 | 决策 | 说明 |
|---|---|---|---|
| 1 | 内容目录 | **保持 `source/` 原地不动** | 后台 API 零改路径 |
| 2 | 静态资源 | **构建前复制到隔离目录** | `source/` 为唯一真源，仓库不出现两份图片 |
| 3 | Markdown 渲染 | **B：Astro 原生 remark/rehype + Shiki** | 需额外适配代码块样式（`.astro-code` 按现主题 github gist + 行号 + 复制按钮重做），并用 `rehype-slug` + 自定义 autolink 复刻 `.headerlink`；对 7 篇文章做逐篇视觉对照 |
| 4 | 构建脚本位置 | **`tools/`** | 避开 Hexo 自动加载的根 `scripts/`（E-004） |
| 5 | 切换方式 | **`astro-migration` 分支 + preview 验证后 merge main** | 当前已在 `astro-migration` 分支 |
| 6 | Hexo 保留期 | **一周** | 本任务内不删除 `themes/fluid` 与 Hexo 脚本 |
| 7 | URL 目标 | **零新增跳转、702/703 全量原路径** | 现有 12 条 301 原样保留 |
| 8 | “页面优先”含义 | **只换生成器，不动信息架构** | 首页各区块先后/权重保持原样 |

---

## 12. 本次明确不做

- 不改任何文案、front matter、数据值、图片、永久链接；
- 不重新设计、不调整字号/配色/版式（字体沿用 V3.4 基线资产）；
- 不删除 `public/`、`node_modules/`、`db.json`、备份、`_private`、`_trash`；
- 不引入 React/Vue/Svelte 等前端框架或 UI 库；
- 不提交/推送工作区里其他会话的 8 个改动；
- 不在方案确认前写任何 Astro 代码。
