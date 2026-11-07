# Astro 迁移 Tasks（阶段 1）

> 依据：`spec.md` §3–§9。每条任务的验收必须真实执行，不得只凭“代码已写”判定完成。
> 全程：不 commit / 不 push / 不动 `public/` / 不改 `source/**` 内容。

## T1 工程骨架

- [x] 新建 `astro.config.mjs`（配置逐项照 `spec.md` §4）
- [x] 新建 `tsconfig.json`（`extends: astro/tsconfigs/strict`，含 `src` 与 `tools`）
- [x] `.gitignore` 追加 `static-public/`、`dist/`、`.astro/`
- [x] `package.json` 增加 `astro:assets` / `astro:build` / `astro:verify` 三个脚本（**不改动**现有脚本）
- [x] 验收：`npx astro --version` 可用；`node -e` 读配置无错

## T2 资源层

- [x] 读 `themes/fluid/scripts/filters/asset-version.js`，抽出 `tools/lib/asset-version.mjs`（算法不改）
- [x] 新建 `tools/prepare-assets.mjs`：复制 8 类资源 → 编译 3 个 stylus → 写 `.asset-manifest.json`
- [x] 验收：运行两次，产物 hash 稳定；`public/` 的 mtime 不变（证明未被触碰）

## T3 URL 校验器

- [x] 新建 `tools/verify-urls.mjs`：解析 `URL-BASELINE.txt`，扫描 `dist/`，支持 `--mode=subset|exact`，输出 `missing` / `extra` 两组并给出非零退出码
- [x] 验收：对一个手工构造的最小 dist 跑通两种模式

## T4 配置与数据层

- [x] `src/lib/site-config.ts`：读两份 YAML，导出 `siteConfig` / `themeConfig` / 派生值
- [x] `src/lib/data.ts`：读 12 个 `_data` 文件
- [x] `src/lib/url.ts`：`urlFor` / `assetUrl` / `versionedAsset`
- [x] `src/lib/dates.ts`：`parsePostDate` / `fmtItemDate` / `formatDate`（E-028 规则）
- [x] `src/lib/i18n.ts`：阶段 1 用到的键
- [x] 验收：写一段临时脚本（不入库）打印 7 篇文章日期与 12 个数据文件头两个 `date`，与基线人工比对后删除

## T5 布局与组件

- [x] `BaseLayout.astro`（含 skip-link / main / footer / noscript / scroll-top）
- [x] `Head.astro`（逐项照 `spec.md` §7.2；`export_config()` 留占位）
- [x] `Styles.astro`（6 条 link，顺序固定）
- [x] `Scripts.astro`（defer 顺序固定）
- [x] `SiteNav.astro`（桌面胶囊 + aux + actions + 移动九宫格）
- [x] `SiteFooter.astro`
- [x] `PaperLayout.astro`
- [x] `PageHead.astro`（`page-head` / `page-head-plain` 两种）
- [x] 验收：任意页面源码中 `<head>` 与现站同页逐行对照（忽略 hash 与 open_graph 细节差异需记录）

## T6 基础页

- [x] `pages/index.astro`（身份域 + 内容墙；无 posts/curation 数据 → 不渲染主卡与列表）
- [x] `pages/about/index.astro`（正文走 Markdown 渲染）
- [x] `pages/now/index.astro`
- [x] `pages/links/index.astro`（空态）
- [x] `pages/404.astro`（含倒数脚本）
- [x] `pages/tags/index.astro`（页头 + 空列表占位逻辑）
- [x] `pages/categories/index.astro`
- [x] 验收：7 条 URL 在 `dist` 存在且非 0 字节

## T7 模块总览页

- [x] `pages/projects/index.astro`（行式卡片）
- [x] `pages/games/index.astro`（封面墙）
- [x] `pages/collections/index.astro`（外链/非链接两态）
- [x] `pages/library/index.astro`（专题卡墙 + 现算计数）
- [x] `pages/zodiac/index.astro`（总览所需数据）
- [x] `pages/holidays/index.astro`（年份总览）
- [x] `pages/city/index.astro`（省份/城市索引）
- [x] `pages/cityrank/index.astro`（榜单总览）
- [x] `pages/festivals/index.astro`（法定/传统分组）
- [x] 验收：9 条 URL 存在；条目数与 `_data` 实际数量一致；无数据模块不渲染空壳

## T8 构建与验收

- [x] `node tools/prepare-assets.mjs` 成功
- [x] `npx astro build` 成功，扫描 0 字节 HTML（应为 0 个）
- [x] `node tools/verify-urls.mjs --mode=subset` 通过（无 extra）
- [x] `git diff --exit-code -- source/_posts source/_data` 为空
- [x] `npm test`（Hexo 侧既有 13 项）仍全绿 —— 证明迁移未破坏旧站
- [x] 浏览器截图对照：desktop 1440 / mobile 390，页面清单见 `spec.md` §9
- [x] 输出验证报告：命令、结果、未验证项、与现站的已知差异

## T8 验证报告（2026-11-06 实跑）

| 命令 | 结果 |
|---|---|
| `node tools/prepare-assets.mjs`（连续两次） | 通过；`css/main.css`、`js/utils.js` 哈希两次一致；`public/index.html` mtime 未变 |
| `npx astro build` | 通过；16 页 + `dist/404.html`；0 字节 HTML = 0 |
| `node tools/stamp-assets.mjs` | 通过；`v=` 与现站一致（main.css `2b1fd995` 产物 hash 由内容算出） |
| `node tools/verify-urls.mjs --mode=subset` | 通过（baseline 708 / dist 17 / extra 0 / missing 691） |
| `git status --short -- source/_posts source/_data source/admin vercel.json` | `source/_posts`、`source/_data`、`vercel.json` 无改动（`source/admin/index.html` 为主人在途改动，未触碰） |
| `npm test` | 通过（Hexo 侧全部断言，含精选 25 项 / 搜索 12 项） |
| Playwright（本机 Chrome）1440×900 + 390×844 | `/`、`/about/`、`/now/`、`/projects/`、`/zodiac/`、`/holidays/`、`/city/`、`/cityrank/`、`/library/`、`/festivals/`、`/links/`、`/404.html` 截图存 `.astro/verify/`，无控制台报错；布局/版式与现站同类页一致 |

**资源哈希与现站逐字节一致**：`css/main.css`=41360B/`2b1fd995`、`css/highlight.css`=1382B、`js/utils.js`=`3e3d85e1`、`js/color-schema.js`=`ba3465b0`。

### 与现站的已知差异（均已记录，非缺陷）

1. **`article:*` 时间来源改为显式 front matter 字段，不使用文件 mtime**（有意区别于旧站）：`published = fm.date ?? fm.show_updated`，`modified = fm.updated ?? published`。旧站 Vercel 上用 mtime，值等于部署时刻；同一提交每次构建都不同。新站因此与旧站 `modified_time` 数值不同（`now` 的 `published_time` 也不同），但两次连续构建全部 17 个 HTML 的 SHA1 完全一致 —— 确定性优先。页面上可见的「更新于」仍走 `show_updated`（E-028）。
2. ~~`now` 的 `meta description` 多空格~~ **已修复**：`src/lib/excerpt.ts` 按 Hexo `strip_html` 的块间距规律重写（标题后 0 空格、段落间 1、列表项 1、列表结束 2），并新增 `escapeHtmlLikeHexo()` 先转义再截断（`/`→`&#x2F;`，与 Hexo 渲染器计数口径一致）。配合 `descriptionPreformatted` 开关（`Head` → `openGraphTags`），避免二次转义。实测 `about`/`now` 的 `meta description` 与 `og:description` 与现站逐字一致（`now` 长度均为 200）；`zodiac`/`holidays`/`library`/`festivals` 同样逐字一致。
3. `clipboard.min.js` 现站无 `?v=`（EJS 以未加引号 URL 输出，过滤器跳过）；新站补齐了正确 hash `?v=9a7cb405`，属缓存破坏的正向修正，**不回退**。
4. `now` 正文里的 `/` 我们输出 `/`，现站为 `&#x2F;`（Hexo 渲染器转义）；浏览器显示相同，仅字节不同，**不修**（改写成实体反而会被 Astro 二次转义成可见文本）。
5. `/tags/`、`/categories/` 阶段 1 无文章数据 → 仅页头（spec 明确如此）；阶段 2 已接入真实数据（见 T9）。
6. 页面 HTML 的空白/换行与 `/>` 自闭合写法与现站不同（Astro 输出风格）；DOM 结构与 class 逐一核对一致，**不修**。

### 执行偏差（相对本文件原计划）

- 缓存破坏逻辑落在 `tools/lib/stamp.mjs`（+ `tools/lib/minify-css.mjs`），未单列 `asset-version.mjs`；hash 在盖章时按内容现算，因此未产出 `.asset-manifest.json`（不需要静态清单）。
- `src/lib/url.ts` 未实现 `versionedAsset`：Astro 无构建期 hash 查询，统一改为「模板写原路径 → `tools/stamp-assets.mjs` 构建后盖章」，效果与现站一致。
- `ExportConfig.astro` 已完整实现（非占位），字段与现站 `#fluid-configs` 一致。
- `/holidays/` 按 `source/holidays/index.md` 的 `year: 2026` 复刻为 2026 年页（原任务文字写成「年份总览」，实际页面即 2026 年日历）。

## T9 文章与聚合页（阶段 2）

- [x] `src/lib/posts.ts`：直接读 `source/_posts/*.md`（js-yaml 解析 front matter），产出 `Post`（`path` = `:year/:month/:day/:title`、`href` = `encodeURL(path)`、`content` 渲染后 HTML、`wordcount`/`min2read`）
- [x] 分类/标签：`slug = hexo-util.slugize(name)`（`C++ → C`、中文原样），`href` 用 `encodeURL`
- [x] `src/lib/markdown.ts`：`marked` v15 + `hexo-util`（`highlight` / `slugize` / `escapeHTML` / `isExternalLink`），复刻 Hexo 渲染口径
  - 标题 `<h2 id="…"><a href="#…" class="headerlink" title="…"></a>…</h2>`（**不追加换行**，与现站一致）
  - 围栏代码块走 `hexo-util.highlight`（`figure.highlight` / `table` / `gutter` / `code.hljs`），并按 Hexo `escapeSwigTag` 把 `{}` → `&#123;`/`&#125;`
  - smartypants 逐字复刻 `hexo-renderer-marked`（引号被吞掉而非回填，修复双引号重复）
  - 外链补 `target="_blank" rel="noopener"`
- [x] `src/layouts/PostLayout.astro`：`post.ejs` 结构（`post-head` / 字数·分钟 / 分类链 / 标签 / `markdown-body` / 许可协议 / 上下篇 / `#toc` + tocbot 内联脚本）
- [x] `src/pages/[year]/[month]/[day]/[slug].astro`（7 条）
- [x] `src/components/ArchiveList.astro` + `ArchiveView.astro`；`/archives/`、`/archives/[year]/`、`/archives/[year]/[month]/`（6 条）
- [x] `/categories/`（真实分类树 + 折叠）、`/categories/[category]/`（7 条）、`/tags/`（tag-cloud）、`/tags/[tag]/`（13 条）
- [x] 首页接入：主卡（`pickPool` hero）+「精选内容 /5」+「最新文字 /3」+「最近更新」纳入文章
- [x] `src/lib/i18n.ts` 补 `post` / `footer` 全部键；`src/lib/excerpt.ts` 补 `excerptText`
- [x] 验收：`npx astro build` 49 页；`verify-urls --mode=subset` extra=0；7 篇文章正文可见文本与现站逐字一致

### T9 验证报告（2026-11-06 实跑）

| 命令 | 结果 |
|---|---|
| `npx astro build` | 通过；49 页（7 文章 / 6 归档 / 8 分类 / 14 标签 + 阶段 1 的 16 页 + 404） |
| `node tools/stamp-assets.mjs` | 通过 |
| `node tools/verify-urls.mjs --mode=subset` | 通过（baseline 708 / dist 50 / extra 0 / missing 658） |
| 逐页可见文本对照（临时脚本，已删除） | 49 页与现站可见文本 **零差异**（DIFF COUNT = 0） |
| 浏览器截图对照（Edge headless，左右并排） | 首页 / 文章页 / 标签 / 归档：布局、字号、间距、代码块、精选摘录全部一致 |

### T9 与现站的已知差异

1. **分类/标签排序**：已修复。现站同计数条目的顺序来自 `db.json` 历史插入记录，源码不可复现；`src/lib/posts.ts` 按现站实际顺序冻结了 `KNOWN_ORDER` 平局表（count 降序 → 平局表序 → 拼音兜底），新条目自动排在已知条目之后。`/categories/`、`/tags/` 两页现已与现站逐字一致。
2. **Markdown 渲染器选型**：spec 原写 Shiki，实际改用 `marked + hexo-util`。原因：现站代码块是 highlight.js 的 `figure.highlight > table > td.gutter/td.code` 结构，主题 `highlight.styl/.css` 只认这套 DOM；Shiki 的 `shiki` 类名会让代码块丢样式。
3. 文章页标题标签后无换行、`<hr/>` vs `<hr>`、空白风格差异同阶段 1「已知差异」第 6 条。
4. 字数/阅读时长按现站 `meta-top.ejs` 原样行为：`symbolsCount` 返回字符串后与 `50` 比较，`>999` 的文章（`2.6k`）不显示字数与分钟（现站即如此，**照搬不复刻为「修复」**）。

## T10 自研生成器移植（阶段 3）

- [x] ① 模块页：`projects` 4 / `games` 6 / `collections` 1（`module-pages` 等价逻辑）
- [x] ② 资料库 + 节令：`library` 13 / `festivals` 1（专题计数按 `_data` 现算，12 节日页）
- [x] ③ 生肖：`zodiac` 13（12 生肖 + 索引）
- [x] ④ 节假日：`holidays` 17（2026 默认页 + 16 个年份页）
- [x] ⑤ 城市 + 城市榜：`city` 460 / `cityrank` 146，33 张省级位置 SVG
- [x] ⑥ 首页精选与墙面：`curation-pool` 的 pickPool / 篇幅档 / 置顶租期逻辑
- [x] ⑦ 搜索索引 `search-index.json`（636 条，八类内容）、`atom.xml`、`sitemap.xml`
- [x] 验收：`npm run astro:build` 成功；`verify-urls --mode=exact` 708/708；逐模块截图对照

### 实现要点

- 动态页的 `getStaticPaths` 传**原始值**（中文标题），构建后由
  `tools/encode-module-paths.mjs` 把 projects/games 中无 slug 的 2 个目录重命名为
  `encodeURIComponent(title)`，与现站目录名逐字一致。
- 所有日期输出走 `fmtItemDate` / `formatWithPattern`，无 `Date` 直出（E-028）。
- 面包屑、标签、阶乘 `<dd>` 等 JSX 内联节点全部压成单行，避免换行被渲染成空格
  导致版式位移（E-110）。
- 首页「最新文字 /3」的 `postHasSubstance` 复刻现站口径（正文去标点后 ≥1 字，
  或带 cover / featured），并修正对 number 取 `.length` 的误判（E-111）。

### T10 验证报告（2026-11-06 实跑）

| 命令 | 结果 |
|---|---|
| `npm run astro:build` | 通过；`[encode-module-paths] 重命名目录数 = 2`；`[stamp-assets] 已完成` |
| `node tools/verify-urls.mjs --mode=exact` | `baseline=708 / dist=708`，`extra=0 missing=0` |
| `SITE_OUT=dist node test/module-dates.js` 等 6 项 | 全 PASS（module-dates 27 / search-index 12 / cityrank-e2e 60 / festival-e2e 39 / holidays-e2e 53 / zodiac-e2e 37） |
| `SITE_OUT=dist node test/curation.js` | 25 项 PASS |
| 可见文本逐页对照（临时脚本，已删除） | `OK=702 BAD=0` |
| Edge headless 像素 diff（1440×900） | home / archives / cityrank / holiday / library / search / post / city = 0；zodiac 8px(max2)、about 4px(max2)，均为抗锯齿 |

### T10 与现站的已知差异

1. **`sitemap.xml`** 初期产出 `SITE + '/' + path` 造成双斜杠，已改为 `SITE + path`；
   并补收 `holidays/library/zodiac` 三个目录 `index.md`。修后 `<loc>` 集合与现站 74/74 一致。
2. **tocbot 资源路径** 曾漏掉版本段（`/lib/tocbot/tocbot.min.js` → 404，文章页目录空白），
   已改为 `/lib/tocbot/4.20.1/tocbot.min.js`（E-110）。
3. **`.mt-1` 空壳**：现站 EJS 无论是否显示字数都会输出该容器（带 `margin-top:.25rem`），
   新站原先按条件包裹，导致整块上移 4px；已改为无条件渲染（E-110）。
4. 分类/标签平局顺序依赖现站历史插入序，按 T9 的 `KNOWN_ORDER` 冻结方案处理，未再复现差异。
5. 首页最新文章卡片不渲染 `.post-cat`：现站因 Hexo Query 索引取到 `undefined` 实际也不渲染，
   照搬不复刻为“修复”。

## T11 后台与 API 共存（阶段 4）

- [x] `dist/admin/` 完整产出：`index.html`、`admin.css`、`admin.js`、`lib/`、`img/`、`fonts/`
- [x] `api/**` 未改动；`vercel.json` 已声明 `buildCommand` / `outputDirectory` / `installCommand`
      （`vercel.json` 会覆盖项目设置里的同名项，preview 不必手工改 dashboard）
- [x] 构建环境加固：`engines.node` 对齐 Vercel 项目设置的 `24.x`；`hexo-util` 改默认导入
      （Node 22 不支持 CJS 具名导入，见 E-112）；`test/build-env.js` 串入 `npm test`
- [x] mock 回归：`ADMIN_DEV_MOCK=1 node test/admin-smoke.js` → 100 项断言全部 PASS
- [x] 后台资源缓存破坏：`index.html` 与 `admin.js` 的 `?v=` 版本一致（E-018 断言 PASS）
- [x] **preview 已验证**（2026-11-07，`d056781`，部署 `my-hexo-blog-m2lhufldn-kasa1us-projects.vercel.app`，Ready / 29s）：
      `api/` 与 Astro 静态产物共存成立。`GET /api/session-check` → `{"error":"SERVER_NOT_CONFIGURED"}`
      （JSON，非 404 页面）；`POST` → `{"error":"METHOD_NOT_ALLOWED","hint":"仅支持 GET 请求"}`
      → 说明 Vercel Functions 已被识别并路由。返回 `SERVER_NOT_CONFIGURED` 是因为 preview
      未配置 GitHub token 等环境变量，属预期。
- [x] preview 静态页全 200：`/`、`/about/`、`/now/`、`/projects/`、`/games/`、`/collections/`、
      `/library/`、`/library/chunjie/`、`/zodiac/`、`/zodiac/rat/`、`/holidays/`、`/city/`、
      `/city/beijing/`、`/cityrank/`、`/festivals/`、`/search/`、`/archives/`、`/tags/`、
      `/categories/`、`/links/`、`/admin/`、`/404.html`
- [x] preview 非 HTML 端点全 200：`/atom.xml`(84310B)、`/sitemap.xml`(13686B)、
      `/search-index.json`(81559B)、`/robots.txt`、`/favicon.ico`
- [x] preview 静态资源可访问：`/css/main.css?v=2b1fd995`(41360B，与现站逐字节一致)、
      `/css/highlight.css`、`/lib/bootstrap/4.6.1/css/bootstrap.min.css`、`/admin/admin.css`、`/admin/admin.js`
- [x] preview 重定向：`/uses` → `/now/`、`/city/province/beijing`(带/不带尾斜杠) → `/city/beijing/`，均 **308**
- [x] 产物确定性：`/city/index.html`、`/atom.xml`、`/sitemap.xml`、`/search-index.json`
      与本地 `dist` **逐字节相同**；`/index.html`、`/admin/index.html` 的差异来自工作区
      **未提交**的 `_config.yml`（`个人博客`→`个人空间`）与 `source/admin/index.html`
      （标题改动），属主人/其他会话在途改动，非迁移缺陷

### T11 说明

- 本地仅能证明「静态产物中 admin 资源齐全、后台逻辑 mock 下全绿」。
- `api/` 是 Vercel Functions（非 Astro 端点），不参与 `astro build`；其能否被识别取决于
  Vercel 项目的构建配置，属于阶段 5 的待决策项（见下）。

## T12 全量校验（阶段 5）

- [x] `node tools/verify-urls.mjs --mode=exact`：`baseline=708 / dist=708`，`extra=0 missing=0`
- [x] 非 HTML 端点纳入基线：`/atom.xml`、`/sitemap.xml`、`/search-index.json`、
      `/robots.txt`、`/favicon.ico`
- [x] 可见文本逐页对照：`OK=702 BAD=0`
- [x] 产物级测试（`SITE_OUT=dist`）：module-dates / search-index / cityrank-e2e /
      festival-e2e / holidays-e2e / zodiac-e2e / curation / css-tokens / docs-claims / asset-version 全 PASS
- [x] 0 字节 HTML：0 个（E-029 防复发）
- [x] 12 条重定向对线上逐条验证：`/uses`、`/uses/`、`/city/province/{beijing,tianjin,shanghai,chongqing,xianggang}`
      （各带 / 不带尾斜杠）→ 目标正确，状态 **308**（Vercel `permanent:true` 实际返回 308），目标页均 200
- [x] 像素验收（1440×900）：见 T10 表格；post / city 修复后 diff = 0
- [x] 冷构建（清空 `dist/`、`static-public/`、`.astro/` 后重建）：708/708，0 字节 HTML = 0
- [x] 构建配置已写进 `vercel.json`；Node 版本锁定 `24.x`（与 Vercel 项目设置一致，见 E-112）
- [x] 已推送 `astro-migration`（`44ae49c` + `a107c43` + `d056781`），**未合并 `main`**
- [x] preview 线上验证通过（见 T11 的 preview 清单）
- [ ] **待主人确认**：preview 通过后再合并 `main`

## 停止点

以下情况必须停下来问主人，不得自行决定：

- 视觉/信息架构出现 spec 未覆盖的差异；
- 某条 URL 在 Astro 下无法 1:1 产出（如 `+`、百分号编码目录）；
- 需要改动 `source/**`、`vercel.json`、`api/**` 或 Vercel 构建配置；
- 需要提交或推送。
