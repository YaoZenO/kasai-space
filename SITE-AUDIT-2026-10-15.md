# KASAI'S Bloger 全面审查报告（2026-10-15）

**审查执行**：严关胜（site-audit-squad 交付验收官）
**审查方式**：本地源码核对 + `public/` 构建产物静态分析 + 线上站点 https://www.040925.xyz 实测（Playwright 375/768/1440 三断点 + curl 全链接状态 + 网络负载采样）
**验收结论**：⚠️ 修改后可交付。无模块级缺失、无阻塞性故障；P0 三项（SEO 配置、文章版权、public/ 污染）改完后，站点才可对外推广/提交搜索引擎。

---

## 行动清单速览（按优先级）

| 优先级 | 事项 | 工作量 |
|---|---|---|
| **P0-1** | 补全 SEO 基础：站点 description/keywords/timezone、开启 canonical、装 sitemap/feed 插件、新建 robots.txt | 小，改配置 |
| **P0-2** | 处置 C++ 转载文：标注来源 / 重写 / 删除（涉版权，最优先） | 小，需决策 |
| **P0-3** | 清理被测试污染的本地 public/（含 2 个死链）；测试脚本末尾补 clean | 小，改脚本 |
| **P1-1~4** | 可访问性硬伤四连：文章标题层级降级、图片补 alt、次级文字对比度加深（#877d6d→#736a5c）、移动端隐藏被裁切的 CC 许可证图标 | 中，改内容+样式 |
| **P1-5~9** | GitHub 链接改真实主页、换个人 favicon、扩充关于页、Ties 项目页补内容或下架、首页 FEATURED 位给有实质内容的文章 | 中，需素材 |
| **P1-10~11** | 自托管 bootstrap/图标字体消除 CDN 单点故障、404 页跳转延时调长 | 中 |
| **决策项** | C++ 文章处置、站名 Bloger 是否有意、关于页素材、games/collections 是否填数据、Instagram 是否本人账号、发布方式确认 | 需主人拍板 |

---

# 严关胜验收报告全文

## 一、总结论

工程的底子好得超出预期：PRD 的设计需求（悬浮胶囊导航、编辑式首页、分页职责化布局、真实计数、无伪造内容）基本高质量落地，后台 API 的会话安全设计扎实，CI 门禁完善，响应式三档实测零横向溢出，搜索功能实测可用，首页加载 1.85s / 25 请求 / 约 86KB 传输。但站点带着三类问题出门：**SEO 基础项全缺**（无 description、无 robots、无 sitemap、canonical 关闭）、**一篇第三方文章全文转载未标来源**（版权风险）、**一批可访问性硬伤**（标题层级断裂、图片缺 alt、次级文字对比度 3.6:1）。另发现本地 public/ 被测试产物污染，含两个 404 死链，有被误部署的风险。

**结论：⚠️ 修改后可交付。**

## 二、P0 必须改（阻塞交付）

| # | 问题 | 定位 | 依据（实际检查到） | 改法 |
|---|------|------|------|------|
| 1 | **全站 SEO 基础缺失**：站点 description/keywords/timezone 全空，无 robots.txt，无 sitemap.xml，canonical 关闭 | `_config.yml` L8 `description: ""`、L9-10 `keywords` 空、L12 `timezone: ""`；`themes/fluid/_config.yml` L331 `canonical.enable: false`；线上实测 | 线上首页 HTML 只有 `<meta name="keywords" content="">`、**完全没有 description meta**；`curl /robots.txt → 404`、`/sitemap.xml → 404`；package.json 无 hexo-generator-sitemap/feed，source/ 无 robots.txt | ① `_config.yml` 填 `description`（一句话站点简介）、`keywords`（3-5 个）、`timezone: Asia/Shanghai`；② 主题配置 `canonical.enable: true`；③ `npm i hexo-generator-sitemap hexo-generator-feed` 并在 `_config.yml` 配 `sitemap.path: sitemap.xml`；④ 新建 `source/robots.txt`：`User-agent: *` / `Allow: /` / `Disallow: /admin/` / `Sitemap: https://www.040925.xyz/sitemap.xml` |
| 2 | **C++ 文章为第三方全文转载，未标注来源，存在版权风险** | `source/_posts/C++-Job-StudyRoadMap.md` L1-7 front-matter、全文 | front-matter `author: 拓跋阿秀`，正文为拓跋阿秀公开发表的文章全文（语气、自称"秀哥"均保留），6 张配图全部热链其个人 jsdelivr 图库（`cdn.jsdelivr.net/gh/forthespada/...`）；页面未展示任何来源信息 | 三选一：① 文首加"本文转载自拓跋阿秀《…》，原文链接：…"并保留全部外链；② 用自己的话重写；③ 删除该文。在解决前不要把这篇文章用于任何推广 |
| 3 | **本地 public/ 构建产物被 E2E 测试污染，含 2 个死链** | `public/index.html` L336、L386；`test/module-pages-e2e.js`（跑完只还原 yml，未 clean） | public/index.html 含 `<a href="/games/">`（public/ 无 games 目录，线上实测 `/games/ → 404`）和 `/projects/e2e-rich/` 精选行（public/projects/ 只有 Ties，404）；"项目"计数显示 2、"游戏"计数 1，均为测试数据。线上站点是干净构建（无这两项），说明当前发布链路不经过本地 public/——但若主人用 `vercel --prod` 直接推本地目录，死链会上线 | ① 部署前一律 `hexo clean && hexo generate`；② 在 test:pages 脚本末尾补 `hexo clean`（或在 CI/本地约定测试后必须重新构建）；③ 现在先 clean 一次消除工作区隐患 |

## 三、P1 建议改（不影响使用，但应排期）

| # | 问题 | 定位 | 依据 | 改法 |
|---|------|------|------|------|
| 1 | **文章页标题层级断裂**：双 h1 + 跳级（h2 直接跳 h5） | `source/_posts/C++-Job-StudyRoadMap.md` 标题写法；线上 `/2023/04/18/C++-Job-StudyRoadMap/` | 实测页面 heading 序列：`h1(页题)` → `h1(# 为小白新手…)` → `h2(第一阶段)` → `h5(1、郝斌…)`，违反 PRD 8.3「合理的标题层级」，影响屏幕阅读器导航 | 将该文 Markdown 标题整体降级：`#`→`##`、`##`→`###`、`#####`→`####`；后续文章约定正文从 `##` 起笔 |
| 2 | **文章内容图片 4/6 完全无 alt 属性** | 同上文章 L21-275 的 `![](...)` 写法 | 线上 img 标签实测：4 张只有 `lazyload` 无 `alt`，2 张 alt 为 `2433224`/`习题集`（无意义），违反 PRD 8.3「为有意义的图片提供替代文本」 | 给每张图补描述性 alt，如 `![《C++ Primer 第五版》封面](...)` |
| 3 | **次级文字对比度不达 AA** | `themes/fluid/_config.yml` L170 `sec_text_color: "#877d6d"`；用于 tagline、摘要、日期、feed 等全站辅助文字 | 实测计算：#877d6d 在纸底 #f5f1e9 上 ≈ **3.6:1**、在面板 #fdfbf6 上 ≈ **3.9:1**，均低于 4.5:1；更严重的是黄色入口格（#e6b23c）上的 `.wall-cell-item` 用同一颜色 ≈ **2.1:1**（首页"项目"格内 "Ties" 小字） | ① `sec_text_color` 改深至 `#736a5c`（实测 4.7:1 / 5.2:1，视觉几乎不变）；② `source/css/site.css` L577 附近加 `.cell-yellow .wall-cell-item { color: #2a251d; }`（7.8:1）；若将来启用橙色格，`cell-orange` 标题色也需同步校验 |
| 4 | **文章页脚 CC 许可证图标在 <768px 被裁切** | 主题 `.license-box`/`.license-icon`（post 页脚版权区块） | Playwright 实测 375px：图标盒 L34-R341（overflow:hidden），图标本体 L341-**R541**，超出视口 166px 被硬裁；768px 同样超出 99px。每篇 post 页移动端都可见残缺 CC 圆标 | `site.css` 加 `@media (max-width: 767.98px) { .license-icon { display: none; } }`，或把该图标改为小尺寸内联 |
| 5 | **GitHub 社交图标是占位链接** | `themes/fluid/_config.yml` L1016 | 关于页 GitHub 图标 `href="https://github.com"`（裸域名），点击到 GitHub 首页而非作者主页；仓库实际是 `YaoZenO/my-hexo-blog`（api/_lib/config.js L4-5） | 改为 `https://github.com/YaoZenO` |
| 6 | **favicon 与 apple-touch-icon 仍是主题默认图** | `themes/fluid/_config.yml` L21、L25（`/img/fluid.png`） | 线上所有页面 `<link rel="icon" href="/img/fluid.png">`，浏览器标签页显示的是 Fluid 主题Logo，个人辨识度为负 | 做一枚个人图标（32px/180px）放入 `source/img/`，替换两处配置 |
| 7 | **关于页内容过薄** | `source/about/index.md`（全文 2 句） | 线上关于页 = 头像 + 两句话 + 社交图标，正是 PRD 5.6 明确否定的"只有几段文字的简介页" | 补真实内容：关注领域、在做的项目（可链 /projects/）、经历时间线；`source/_data/site.yml` 的 intro/motto/identity_words 四个字段全空，可顺手填 |
| 8 | **Ties 项目详情页只有标题 + 一个按钮** | `source/_data/projects.yml`（仅 title+link）；线上 `/projects/Ties/` 实测 | 详情页 h1 "Ties" + 一个 GitHub 按钮，无 summary/date/tags/四段长文，恰是 PRD 5.8 禁止的"只有标题、没有实际内容的展示页面" | 要么补 `summary/date/tags/background`，要么暂时从 projects.yml 移除（首页项目格会自动消失，不留空壳） |
| 9 | **一句话文章占据首页 FEATURED 重点位** | `source/_posts/a-dream-from-nobody.md`（正文仅"我要环游世界。"） | 首页首屏大卡（wall-feature）按日期取了这篇，重点内容位被一句话占据，稀释首页冲击力，也违背 PRD 5.1-B「重点内容区为真实重要内容提供突出位置」的本意 | 补写成完整随笔，或调整日期/ featured 选取逻辑让有实质内容的文章上位 |
| 10 | **关键样式依赖两个外部 CDN，故障即全站裸奔** | `themes/fluid/_config.yml` L352 iconfont（at.alicdn.com）、L1109-1158 static_prefix（lib.baomitu.com） | 首页实测 25 个请求中 10 个走外站（alicdn×4、baomitu×6），bootstrap CSS 与图标字体均为 head 内渲染阻塞；任一 CDN 故障，布局和图标全站失效 | ① 把 bootstrap.min.css 与两个图标字体 CSS（及 woff2）下载到 `source/` 自托管；② 其余 JS 加 `defer`；③ 至少给两个 CDN 域加 `<link rel="preconnect">` |
| 11 | **404 页 5 秒强制跳首页** | `public/404.html`（`setTimeout(redirect, 5000)`）；`themes/fluid/_config.yml` L1045 | 实测 404 状态码正确、标题"页面不存在"，但 5 秒后自动跳走，用户来不及读页面、也丢失了出错的 URL 上下文 | `redirect_delay` 调到 10000+，或干脆关闭自动跳转、在页面上放一个明显的"返回首页"链接 |

## 四、P2 可忽略（锦上添花）

- **站名拼写**："KASAI'S Bloger"（Bloger 疑为 Blogger 笔误）——若是有意品牌名则忽略，否则顺手改 `_config.yml` L6 与主题 L365。
- **归档导航项显示"文字"**（`themes/fluid/_config.yml` L385 name 覆盖）——全站一致、无功能障碍，仅非常规叫法。
- **`meta_generator: true`** 在页面输出 `Hexo 8.1.1` 版本号——想消掉可设 false。
- **`deploy.type: ""`**（`_config.yml` L104-105）——`npm run deploy` 是空操作，但实际发布走 Vercel/GitHub，无害；建议在 README 写清"勿用 hexo deploy"，避免误解。
- **`/admin/` 可公开访问**——页面本身是 SPA 外壳（18.7KB，无任何硬编码密钥），所有 API 实测有保护（`/api/session-check` 返回 401 UNAUTHENTICATED）。设计上可接受；P0-1 的 robots.txt 里已加 `Disallow: /admin/` 即可。
- **`/img/wx_2wm.jpg` 140KB**（微信二维码）——**已处理（2026-10-17，非压缩）**：查证这张是主题自带示例码，
  扫出来是主题作者的微信，不是本人的。已从关于页 `icons` 下架（配置内注释保留，主人给自己的码再启用）。
  压缩是错的方向——问题不在体积，在于挂了陌生人的二维码。
- **`/img/default.png` 391KB**——实测（2026-10-17）当前零渲染：各页 banner 已 `hide_banner`，
  唯一出现处是测试素材的封面，清掉测试素材后无引用。转 JPEG q85 只需 29KB，
  但此刻压缩零收益，等恢复 banner 或换真实头图时再处理。结论已写进主题配置注释。
- **文章页 og:image 输出 6 个**（取了正文所有图）、**og:url 带 `/index.html`**——属主题默认行为，社交分享卡片取第一张图，影响小。
- **无 RSS/Atom、无 JSON-LD 结构化数据**——装了 hexo-generator-feed 后自然解决 RSS；结构化数据可选。
- **`/links/` 友链页**——线上 200 可达但未进导航，内容还是主题默认示例（Fluid 官方三项）。要么自定义后放进导航，要么从主题配置关掉。
- **`games`/`collections` 数据为空时整段不渲染**——符合 PRD"无数据不渲染"铁律，是特性不是缺陷；但 modules.yml 注册了 `/games/` 页码，配合被污染的本地构建会产生死链（见 P0-3）。

## 五、PRD 功能需求核验表

| PRD 条目 | 状态 | 说明 |
|---------|------|------|
| 5.1-A 首屏个人展示（名称/定位/头像） | ✅ 已实现 | 线上首页：头像 + "KASAI'S Bloger" + "Be water, my friends." + 双 CTA |
| 5.1-B 重点内容区（视觉权重差异） | ⚠️ 部分实现 | FEATURED 大卡 + 入口格层级成立，但重点位被一句话文章占据（P1-9） |
| 5.1-C 近期文章区（标题/日期/摘要/归档入口） | ✅ 已实现 | "最新文字 /2" 两行带日期摘要，CTA"进入文字→"/archives/ |
| 5.1-D 其他内容入口 | ✅ 已实现 | 项目/分类/标签入口格，计数=真实数据；空模块不渲染 |
| 5.1 布局/验收（非传统列表首页） | ✅ 已实现 | 编辑式不对称网格，三档断点实测通过 |
| 5.2 文章页（安静阅读/宽度/目录/元数据） | ✅ 基本实现 | 38em 定宽、右侧 TOC、日期/分类/标签齐全；标题层级被源文破坏（P1-1） |
| 5.3 归档页 | ✅ 已实现 | 年份分组时间线，线上 200 |
| 5.4 分类页 | ✅ 已实现 | 3 个分类含文章数与折叠列表 |
| 5.5 标签页 | ✅ 已实现 | 5 个标签 chip + 真实计数 |
| 5.6 关于页（区别于几句话简介） | ⚠️ 部分实现 | 结构独立但内容仅两句（P1-7） |
| 5.7 搜索 | ✅ 已实现 | 实测：弹窗打开、输入"随笔"返回正确结果与摘要；输入框有 label 关联 |
| 5.8 项目与作品 | ⚠️ 部分实现 | 列表/详情架构齐全，但唯一条目只有标题+链接（P1-8） |
| 6.1 胶囊导航一致性 | ✅ 已实现 | 桌面胶囊/移动汉堡+九宫格，选中态明确，各页一致 |
| 6.2 交互原则（焦点可见/减少动效） | ✅ 基本实现 | focus-visible 样式、prefers-reduced-motion 均有 |
| 7 视觉系统（暖白/近黑/克制强调） | ✅ 已实现 | CSS token 体系完整，与后台 admin.css 双端同步且有测试锁定 |
| 8.1/8.2 响应式 | ✅ 实测通过 | 375/768/1440 四页面零横向溢出；断点行为正确 |
| 8.3 可访问性 | ❌ 有多项不符 | 对比度（P1-3）、alt（P1-2）、标题层级（P1-1）、许可证图标裁切（P1-4） |
| 9.2 内容与链接保护 | ✅ 已实现 | 旧永久链接 `/2023/04/18/C++-Job-StudyRoadMap/` 200，分类标签数据完好 |
| 9.5 性能 | ✅ 基本实现 | 实测首页 1.85s/25 请求/~86KB；自托管字体子集；lazyload；外站 CDN 依赖待治理（P1-10） |

## 六、健康的部分（已做对，不要动）

1. **PRD 设计落地质量高**：悬浮胶囊导航、首屏身份域+内容墙、三栏下半版、真实计数、空数据不渲染——与效果图和 PRD 的一致性罕见地扎实。
2. **响应式是真过了**：375/768/1440 × 4 页面实测 `scrollWidth == innerWidth`，导航 capsule/汉堡切换、wall 1/2/3 列全部正确。
3. **搜索真能用**：local-search.xml 由主题内置 generator 生成（不依赖未安装的 npm 插件，CI 全新安装也能产出），实测关键词命中。
4. **后台安全设计是教科书级**：HMAC 无状态会话 + `__Host-` cookie + timingSafeEqual + Origin CSRF 校验 + 默认 requireSession + 单一管理员白名单；`.env.local` 已被 gitignore；admin 前端零硬编码密钥。
5. **CI 门禁完善**：语法检查 + 后台冒烟 + 模块页 E2E（写入→生成→断言→还原）+ CSS token 双端一致性 + 文档账目核对 + Markdown 往返幂等 + hexo generate。
6. **性能底子好**：首页约 86KB 传输、无重框架、Archivo latin 子集自托管（34KB, swap, 失败不回退裸奔）、lazyload、动画有 reduced-motion 降级。
7. **可访问性亮点**：全局 focus-visible、搜索 label 关联、`lang="zh-CN"`、头像 alt 完备。
8. **内容保护到位**：永久链接、分类、标签、日期全部原样保留。

## 七、未验证项（如实标注）

1. **Vercel 部署配置**：仓库无 vercel.json，构建命令/输出目录在 Vercel Dashboard，无法从本地验证；线上与本地 public/ 的差异说明线上不是直接推本地目录，但主人若有 CLI 直推习惯需按 P0-3 防范。
2. **GitHub Actions 最近运行状态**：本次禁 git 操作，未查看远端 CI 结果（ci.yml 内容本身已核验，设计完备）。
3. **instagram.com/kasa1u 是否真实存在**：无法确认账号归属，建议主人自查。
4. **后台登录全流程**：OAuth 需真实 GitHub 账号，未实测登录→写稿→部署全链路；仅验证了 API 侧 401 保护与前端无密钥。
5. **移动端九宫格菜单展开态**：汉堡按钮存在性已验证，展开后的交互未逐项点击实测。
6. **文章页 768–991px 区间侧栏（TOC/分类栏）隐藏后的阅读体验**：CSS 规则已确认（`.post-side` 在 ≤991.98px display:none），视觉未在该区间单独截图。

## 八、需要主人决策的待定项

1. C++ 文章的处置：授权转载标注 / 重写 / 删除（P0-2，涉版权，最优先）。
2. 站名 "Bloger" 是否有意为之。
3. 关于页扩充素材（关注领域/项目/经历），以及 `source/_data/site.yml` 四个空字段是否填写。
4. games / collections 两个模块是否计划填真实数据；不填则保持现状即可（会自动不渲染）。
5. Instagram 链接是否为本人账号。
6. 确认发布方式（Vercel 自动构建 vs CLI 直推），以决定 P0-3 的防范是否紧急。

**验收结论重申：⚠️ 修改后可交付。** P0 三项均为小范围可改项（改配置、处置一篇文章、clean 一次构建），无模块缺失、无工程性阻塞；改完 P0 后，建议按 P1 顺序排期处理可访问性四项（标题层级/alt/对比度/图标裁切），这些直接影响真实访客的阅读与使用。
