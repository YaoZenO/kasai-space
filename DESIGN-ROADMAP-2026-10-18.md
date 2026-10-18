# KASAI 个人主页 · 设计优化排期表（2026-10-18）

**编制**：设计原型专家团 · 主理人 画统筹（Hua）
**依据**：`DESIGN-REVIEW-2026-10-18.md`（Phase 2 审查，45 个编号条目：P0×2 / P1×19 / P2×23；UX-16 并入 UX-8 不重复计，独立问题 44 项）+ `DESIGN-LANGUAGE.md`（Phase 3 规范 V1.0）+ Phase 1 需求摘要
**定位**：把复核后的问题转成按优先级、可落地的执行计划。读者：主人（排期与授权）、执行者（干活）。
**时间基准**：2026-10-18（周日）。下列日期为建议窗口，主人可整体平移；批次顺序与依赖关系不建议颠倒。

---

## 一、总览

### 1.1 批次逻辑

```
批次 0 · 数据诚信与发布一致性（P0）          建议 10.18–10.19
   ├─ 删测试条目 + CI 断言（纯数据，不碰前端）
   └─ Vercel TZ 环境变量 + 重定向决策（需主人网页端操作）
        ↓（批 0 的 IA-3 决策落地后，批 1 可并行启动）
批次 1 · 体系收拢前端批次（P1 主体）          建议 10.20–10.22
   ├─ 1A 色彩收拢（依赖 A 组设计值确认）
   ├─ 1B 版式与阅读轨
   ├─ 1C 交互与可访问性
   └─ 1D 工程与 SEO（sitemap）
        ↕（与批 2 并行，互不依赖）
批次 2 · 品牌与内容决策批次（P1）             建议 10.20 起，阻塞于主人
   ├─ 头像 / favicon 素材（需主人出图）
   └─ 真名 / 站名 / 联系方式 / 页脚署名（需主人拍板）
        ↓
批次 3 · 打磨批次（P2）                      建议 10.23 后择机
   ├─ 3A 工程清理与性能
   ├─ 3B 体验打磨
   └─ 3C 设计演进（随 A 组确认项）
```

**为什么这样拆**：批 0 全是数据/配置/部署层，不碰前端代码，改完即可上线止损（沿用 HOMEPAGE-REVIEW §七批次逻辑）；批 1 集中在 site.css 与模板，一次构建一次验证，避免多次部署；批 2 的素材与决策只能等主人，与批 1 并行不浪费时间；批 3 动资源文件与构建产物结构，需单独验证。

### 1.2 执行纪律（每批通用）

1. **工作区有主人在途未提交改动**（AGENTS.md / ERRORS.md / package.json / games.yml / test/module-dates.js 已修改，3 篇新文章未跟踪）。实施每批前先 `git status` 报告，**只提交本批次改动**，不擅自带上主人在途改动（AGENTS.md §5.3-3）。
2. **数据文件改前先比对线上实际内容**——本地副本可能落后于远端（主人在后台直接改过 GitHub）（AGENTS.md §5.3-5）。
3. **验收不只看构建输出**：Hexo 渲染失败会写 0 字节 HTML 但构建仍报「N files generated」退出码 0（E-029）；每批改完必须抽查 `public/**.html` 字节数与 `<time>` 格式（AGENTS.md §5.2）。
4. **每批涉及线上生效的改动，交付时需主人授权后推进 commit → push**（Vercel 自动构建）；本排期表不含任何 git/deploy 执行步骤（AGENTS.md §3、§5.3）。
5. 测试一律 mock 模式（`ADMIN_DEV_MOCK=1`），不跑真实仓库（E-001）；新增脚本放 `test/`，不放项目根 `scripts/`（E-004）；含中文源文件的批量替换走 edit 工具，禁 PowerShell Set-Content（E-026）。

---

## 二、批次 0 · 数据诚信与发布一致性（P0，建议 10.18–10.19）

| # | 任务 | 类型 | 优先级 | 依赖 | 预期产出 | 验收方式 |
|---|---|---|---|---|---|---|
| D0-1 | **删 projects.yml / collections.yml 剩余「【测试】」条目**（IA-1：projects L71-94、collections L16-20，后者外链 example.com 线上可点） | 数据 | P0 | 无（B8 可选并行：是否趁手补第二条真实项目） | 两个 yml 只剩真实条目（projects 剩 Ties、collections 剩 Esports Manager 2026 mods）；首页精选栏/列表页/动态栏数据全部真实 | grep `_data/*.yml` 无「测试」/`example.com`；`hexo generate` 后首页 HTML 无测试条目；npm test 全绿 |
| D0-2 | **CI 加数据诚信断言**（IA-1 防复发） | 工程 | P0 | D0-1 | 新测试断言：`_data/` 不得出现 example.com 外链与「测试」标题条目；测试数据禁入生产构建（规范 §8.7） | 变异验证：塞入测试条目 → FAIL；删除 → PASS |
| D0-3 | **统一构建时区，消除 URL 漂移**（IA-3：线上文章 URL /04/23 vs 本地 /04/24，归档页日期与链接自相矛盾；根因已实证=permalink 用构建机系统时区格式化） | 部署 | P0 | ① 代码内固定（`themes/fluid/scripts/permalink-timezone.js`，已落地）；② GitHub Actions `env: TZ: Asia/Shanghai`（已加，双保险）；③ Vercel 的 `TZ` 为保留名不可设——无需操作；④ 已上线两个 /04/23 URL 的重定向方向待主人（B14） | 本地/CI/线上三处 URL 一致；日期显示与 URL 不再矛盾；permalink 规则不变（红线 R-7） | 重新部署后线上文章 URL 与本地构建逐字节一致；`/04/23/` 旧链 301 到新链（若选重定向方案） |
| D0-4 | **标注 design/design-language.html 为历史提案**（规范附录 B-1：该文件定义了一整套与现行实现不同的 token，后人照它改色即破体系，三轮审查均未提及它存在） | 文档 | P1 | 无 | 文件顶部加醒目标注「历史提案 v1.0，token 已分叉，以 DESIGN-LANGUAGE.md 为准」；或按现行 token 更新（B15） | 打开文件首屏可见标注；无实施会话再引用其色值 |

> **批次 0 交付即授权推送**：这三项是「对外形象止损」，每落地一项即可单独授权 commit→push，不必等齐。

---

## 三、批次 1 · 体系收拢前端批次（P1 主体，建议 10.20–10.22）

**总策略**：一次改同一批验证。全部改动落在 `source/css/site.css`、`themes/fluid/_config.yml` 与少量模板，沿 token 单一数据源架构修（不在 site.css 硬编码新值）。**A 组设计值确认（见 §八）是 1A 的前置**，建议主人在 10.19 前过目。

### 1A 色彩收拢（依赖 A1–A5 确认）

| # | 任务 | 优先级 | 预期产出 | 验收方式 |
|---|---|---|---|---|
| T1-1 | **文章页三色回归暖纸体系 + 修变量名笔误**（VD-1）：主题配置 `post_text_color`/`post_heading_color` 改 `#2a251d`、`post_link_color` 改 `#b0482a`；site.css L1035 `var(--post_link_color, …)` 改 `var(--post-link-color)` | P1 | 翻页不换设计系统；文章页链接色回归 token 管理（后台改色即生效） | grep site.css 无 `--post_link_color`（下划线写法）；产物文章页正文色 `#2a251d`；链接 hover 走 accent |
| T1-2 | **进度条蓝 #29d 改砖红**（VD-2）：site.css 追加 nprogress 三规则（bar/peg/spinner 全走 `var(--accent)`） | P1 | 冷色破口清零；加载条是纸面体系内的一条砖红线 | grep 产物 main.css/site.css 的 nprogress 规则无 `#29d` |
| T1-3 | **搜索高亮收口**（VD-3）：site.css L1543 选择器 `.search-keyword` 改 `.search-word`；补 `#local-search-result .search-list-title{border-left:3px solid var(--accent)}` | P1 | 命中词回归砖红；深蓝竖边消失 | grep site.css 有 `.search-word` 规则；产物无 `#ff4500`/`#0d47a1` 生效路径 |
| T1-4 | **橙格加深 + 小字号达标**（VD-4，A1）：`--block-orange` `#dd5a2f`→`#c0491f`（纸字 4.82:1）；`.wall-cell-item` 升 0.8rem/700；`.wall-cell-tag`/`.feed-type`/`.feed-date`/`.tag-chip-count`/`.detail-tag` 等 0.74rem 类统一升 0.75rem；`.pick-ext`/`.pick-meta` 0.7rem 同级处理（规范 §3.3 全清单） | P1 | 首屏两个入口块都过 AA；中文小字全部 ≥12px | Node 复算对比度 ≥4.5:1；grep site.css 无 <12px 中文类名遗漏 |
| T1-5 | **圆角与 token 收口**（VD-5，A4/A5）：`:root` 补齐 7 个 fallback-only token（`--r-tile 12px`/`--r-card 12px`/`--cream` 复用 `#fdfbf6`/`--ink-warm`/`--cream-on-dark`/`--line-strong`/`--accent-soft` 定值）；22px 废止且**不得扩散到首页入口格**（红线 R-3） | P1 | 圆角语言统一；第三纸色消灭；token 单一入口可 grep | grep site.css 无 `var(--x, fallback)` 形态残留（除兼容期）；模块卡渲染 12px；首页入口格圆角 ≤12px |
| T1-6 | **accent 静态信息分流**（VD-11，A2）：新增 `--info-mark: #6b6255`（纸底 5.32:1）；`.col-count`/`.post-cat`/`.feed-type`/`.page-head-kicker`/`.cat-count`/`.tag-chip-count`/`tocbot-active-link` 等约 12 处静态信息迁中性；kicker（每页 1 处）保留 accent | P1 | 砖红成为稀缺资源；静态信息回归中性、层级清楚。**不是引入第二彩色，是静态信息降级**（红线 R-2 不越） | grep 静态信息类名无 `var(--accent)`；对比度复算 ≥4.5:1 |

### 1B 版式与阅读轨

| # | 任务 | 优先级 | 预期产出 | 验收方式 |
|---|---|---|---|---|
| T1-7 | **文章页正文轨等宽**（RL-3）：site.css 加 `.post-content{padding-left:0;padding-right:0}`（移动端 theme 的 2rem/1rem 保留） | P1 | 「安静阅读」定宽承诺在文章页成立，与关于页同轨（38em≈646px） | 产物文章页正文容器计算宽度 = 关于页 |
| T1-8 | **首页墙留洞收口**（RL-1）：主卡 `grid-row` 跨度随格子数自适应（6 格时 span 3），或末格跨剩余列 | P1 | 首屏右侧满填；不对称构图成立（与 D0-1 删测试条目同属一个改动面，先 D0-1 后本项） | 1440/768 两档无右下空洞（推导 + 浏览器实测各一次，实测标注） |
| T1-9 | **模块详情页正文轨修复**（VD-9）：`project.ejs`/`game.ejs` 的 `<article class="about-body markdown-body">` 改嵌套结构 `<article class="about-body"><div class="markdown-body">…</div></article>`（与 about.ejs/paper.ejs 一致） | P1 | 全站长文同一阅读轨（38em/17px/1.75） | 产物模块详情页正文容器命中 `.about-body .markdown-body` 规则；与文章页等宽 |
| T1-10 | **摘要双重转义修复**（VD-8）：按 fmt-item-date.js 同架构新增 `excerptText` helper（strip_html 后实体解码 + 折叠空白 + 剥离开头行号），`index.ejs`/`archive.ejs` 改调 | P1 | 摘要回归人话；纸面档案无机器转义痕迹 | 产物首页/归档页无 `&amp;amp;` 形态；helper 单文件自包含（放 `themes/fluid/scripts/helpers/`） |
| T1-11 | **精选栏补「查看全部项目 →」出口**（UX-3）：index.ejs 精选栏 col-head 补 col-more 链接 | P1 | 三栏出口齐整，栏头节奏统一 | 产物首页精选栏有 more 链接且指向 /projects/ |

### 1C 交互与可访问性

| # | 任务 | 优先级 | 预期产出 | 验收方式 |
|---|---|---|---|---|
| T1-12 | **回到顶部二选一**（UX-1）：① 复活主题按钮并纸面化（`#fdfbf6` 底 + `--site-chip-border` + 12px 圆角 + `--site-float-shadow`，去 hover 无限弹跳）；② 或 `scroll_top_arrow.enable: false` 只保留首页 TOP ↑ 并修好锚点（T1-13）。**推荐方案①**（长文页有回顶路径） | P1 | 长文页有体面回顶路径；不再有隐形死控件 | 文章页到底部按钮可见可点；hover 无无限弹跳动画 |
| T1-13 | **TOP ↑ 真实锚点**（UX-2）：`.home` 加 `id="top"`，href 改 `#top`，保留 `:focus-visible` | P1 | 跳顶有真实目标且可聚焦确认 | 点击后 URL 为 `#top`；键盘 Tab 可聚焦 |
| T1-14 | **动态栏条目可点性一致**（UX-4）：feed 聚合对模块条目复用详情页 slug 拼接逻辑（`it.link` 仅作外链叠加） | P1 | 同一内容全站可点性一致（games 五条当前全非链） | 产物首页动态栏模块条目为 `<a>` 且指向 `/games/<slug>/` 等 |
| T1-15 | **动态栏计数改真实总数**（UX-5）：`/6`（FEED_MAX 截断值）改 `feed.length` 真实总数；仍渲染前 6，末条后加「更早 N 条 →」 | P1 | `/` 前缀在全站只表达一种含义（规范 §8.1） | 产物首页动态栏计数 = 真实聚合数 |
| T1-16 | **九宫格关闭态 visibility**（UX-6）：`#mobile-grid-menu{visibility:hidden}` + `.show{visibility:visible}`（或容器 `inert`） | P1 | 焦点顺序干净（WCAG 2.4.3） | 375px 关闭态 Tab 不进入菜单链接 |
| T1-17 | **搜索弹窗 aria 修复**（UX-7）：h4 加 `id="ModalLabel"` 或对话框改 `aria-label="搜索"` | P1 | 读屏打开弹窗能报出对话框名称 | grep 产物 aria-labelledby 有对应 id |

### 1D 工程与 SEO

| # | 任务 | 优先级 | 预期产出 | 验收方式 |
|---|---|---|---|---|
| T1-18 | **sitemap 覆盖补齐**（IA-4）：注册 generator 路由数据，补 `/archives/`、`/links/`、`/projects/`、`/games/`、`/collections/`、`/categories/`、`/tags/` 索引页；统一 permalink 风格（目录式） | P1 | 模块长文对搜索引擎可达；sitemap 无混合 URL 形式 | 重新生成后 sitemap 含上述路由；`/about/index.html` 形式统一 |

### 批次 1 验收（整批）

`npm test`（当前 126 项）全绿 + `hexo generate` 后 `public/**.html` 无 0 字节（E-029）+ 对比度复算脚本全过 + 375/768/1440 三档无横向溢出（浏览器实测，标注实测人/时间）+ 产物 grep 无禁止色表破口（规范 §2.3）。

---

## 四、批次 2 · 品牌与内容决策批次（P1，建议 10.20 起并行，阻塞于主人）

| # | 任务 | 优先级 | 阻塞点 | 预期产出 | 验收方式 |
|---|---|---|---|---|---|
| T2-1 | **头像处置（已更正为误报）**：`11.jpg` 是主人个人头像（`a90325e` 替换），不是主题示例图——无需更换、无需 monogram 过渡。仅剩可选项：是否把方卡改为圆形 + 1px 描边（A10，纯外观偏好，主人定） | P1 | 无（B3 已消解） | 头像保持现状 | 产物两处 img src 仍为 `/img/avatar/11.jpg` |
| T2-2 | **favicon 落地**（VD-6）：制作 32px/180px 个人图标（建议 `#b0482a` + 墨/纸字母标）放入 `source/img/`，替换 `_config.yml` L21/L25 两处 | P1 | **B4 素材** | 标签页/书签即品牌位 | 全站 head 无 `/img/fluid.png` |
| T2-2✅ | **T2-2 已执行（2026-10-18）**：主人选定候选 B（纸框墨牌 + 纸色 K，四版比选过程见 `design/favicon-candidates/`）。已落位 `source/img/favicon-16/32.png`、`source/img/apple-touch-icon.png`、`source/favicon.ico`（16/32/48），配置改 favicon / favicon_16 / apple_touch_icon 三处，`head.ejs` 补双 sized 链接并校正 apple-touch-icon sizes 180x180 | P1 | B4 已决（B 版） | 标签页/书签即品牌位 | 全站 head 无 `/img/fluid.png` || T2-3 | **真名上首屏**（F-2/H-1，B1）：`identity-title-row` 内补副行「KASAI · 韩耀宇」，复用现有排版语言不新增视觉元素 | P1 | **B1 决策**（真名已公开属既有信息，首屏是新露出位） | 首屏同时给出两层身份 | 产物首页含真名；隐私自查通过（不新增其他标识） |
| T2-4 | **站名去 Blog 后缀**（N-3，B2）：`_config.yml` title/blog_title/subtitle + 导航品牌位联动改为 `KASAI`；效果图基准「YaoZenO / Personal Space」无 Blog | P1 | **B2 决策**（品牌资产） | 站名评判标准从「更新勤不勤」切到「这个人有意思没意思」；Archivo 900 紧字距在 5 字母上显现 | 全站署名无 `Blog` 字样；导航/页脚/OG 一致 |
| T2-5 | **联系方式补强**（M-2，B5）：建议补 `mailto:` 邮箱（about.ejs L30 对非 qrcode 项统一走 url_for，加 mailto 无需改模板）；核实或移除 Instagram | P1 | **B5 决策**（邮箱涉隐私暴露；Instagram 归属未验证） | 「怎么找到这个人」有确定答案 | 关于页社交图标全部可达且归属明确 |
| T2-6 | **页脚署名规则落地**（F-5/F-6/E-1，B12）：首页隐藏主题页脚「yaoyu ♥ blog」或改 `footer.content` 为站点版权行；署名规则一次定清：品牌位用站名、身份位用真名、页脚用真名+站名 | P1 | **B12 文案决策** | 落款归属清晰；不再有主题作者署名与「人名四处分裂」 | 首页无双页脚；全站署名三种口径统一 |

---

## 五、批次 3 · 打磨批次（P2，建议 10.23 后择机）

### 3A 工程清理与性能

| # | 任务 | 优先级 | 预期产出 | 验收方式 |
|---|---|---|---|---|
| T3-1 | **删 2.4MB+ 死资源**（VD-12/13）：avatar 1/2/3.jpeg、random/default.png、wx_2wm.jpg、gitalk.css、highlight-dark.css、leancloud.js、openkounter.js、umami-view.js（删除前确认后台媒体库无引用） | P2 | 每次部署少传 2.4MB+；消除「还在用」误判 | public/ 无上述文件；后台媒体库无死链 |
| T3-2 | **自托管收尾**（旧 P1-17 + P1-13）：tocbot/anchor/clipboard 三个 baomitu 脚本下载至 `source/lib/` 自托管；随自托管完成删死 preconnect | P2 | 零 CDN 依赖；文章页目录/锚点不靠外部域 | grep 产物无 `lib.baomitu.com` 请求 |
| T3-3 | **渲染阻塞 CSS 分级**（旧 P1-14）：highlight/hint/github-markdown 改 `media="print" onload` 异步化；bootstrap 按组件裁剪 | P2 | FCP/LCP 杠杆（gzip 后约 55-60KB 阻塞） | 首屏 CSS 字节下降；site.css 仍在 main.css 之后（顺序不动） |
| T3-4 | **local-search.xml 模板泄漏收口**（IA-6）：模板移出 theme `source/` 或 CI 加「public/ 不得含 `{%`」断言 | P2 | 产物洁净 | 重新构建后 public/xml/ 无可公开访问的未渲染模板 |
| T3-5 | **断点双约定统一**（RL-2）：site.css 与主题 styl 的 767/424 整数断点改 .98 家族 | P2 | 断点行为单一可推导 | grep 全站 CSS 媒体查询统一 `.98` |
| T3-6 | **og:url 去 index.html**（IA-12）；**typed.js 空载收口**（UX-11）；**utils.js defer + Archivo preload**（UX-12） | P2 | 分享 URL 规范；每页少一个死请求；首屏品牌字不闪 | 产物 og:url 与 canonical 一致；typed 不再加载或按需加载 |

### 3B 体验打磨

| # | 任务 | 优先级 | 预期产出 | 验收方式 |
|---|---|---|---|---|
| T3-7 | **404 页重做**（UX-8，B10）：副标题改引导文案；**去自动跳转、只留返回首页按钮（已定 2026-10-18）** | P2 | 404 像纸面档案的一页 | 产物 404 无重复标题、无自动跳转脚本 |
| T3-8 | **文章页元信息统一**（UX-9）：日期格式改 mono `YYYY-MM-DD`（或 `YYYY-MM-DD HH:mm`），与全站一致 | P2 | 等宽元信息轨全站一致 | 产物文章页 meta 区无「2026年10月18日 晚上」形态 |
| T3-9 | **短文门控**（UX-10）：正文字数 <50 不渲染字数/阅读时长 | P2 | 短文页不像加载失败 | 7 字短文页无字数/时长 |
| T3-10 | **文章页脚补「回到身份域」出口**（UX-14）：post-foot 加指向 `/` 或 `/about/` 的低调文字链 | P2 | 读完文章有「回到这个人」的路径 | 产物文章页脚有该链接 |
| T3-11 | **懒加载标记清理**（UX-13）：index.ejs 加 `page.lazyload = false` 或白名单 `.identity-avatar-img` | P2 | 无非标准 srcset 标记 | 产物头像 img 无无描述符 srcset |
| T3-12 | **导航当前页指示补齐**（IA-11 + 规范 §9.3）：「更多」下拉父项按子链接匹配加 `.active`；九宫格选中描边（形状+颜色双编码）；aria-current="page" | P2 | /now/ /uses/ /links/ 有「你在这里」（WCAG 2.4.8） | 访问三页导航父项 active；读屏报当前位置 |
| T3-13 | **栏名与入口语义修正**（IA-9/IA-7，B7/B9）：「近期动态」改「最近更新」；入口格主文案回模块名+计数（items[0].title 加「最新」前缀） | P2 | 栏名与内容同构；模块格读作模块入口 | 产物首页栏名/格子主文案按 B7/B9 结论 |
| T3-14 | **档案页入口上提**（IA-10/F-7/A-1，B11）：身份域 CTA 组后补并排文字链「现在 / 我在用什么」 | P2 | 首屏叙事与档案页连成路径 | 产物首页有两条入链且页面存在 |
| T3-15 | **详情页与档案页增强**（D-2/D-3/A-2/A-3）：项目页补 status 标签位；详情页补同模块前后条目导航；now 页日期改渲染 mtime/updated 字段（禁人手）；uses 页补指向 /projects/Ties/ 的链接 | P2 | 详情页信息量与导航完整；档案页日期不再「忘改即说谎」 | 各页面按「无数据不渲染」铁律落地 |
| T3-16 | **墙格与导航去重**（IA-8，B9）：墙格不重复导航可点模块，或导航把三者移入「更多」 | P2 | 首屏同一目标只出现一次 | 按 B9 结论二选一落地 |
| T3-17 | **C++ 标签 URL**（IA-5）：接受（无害）或加 slug 覆盖 | P2 | URL 与标签名一致 | 低优先，可长期接受现状 |

### 3C 设计演进（随 A 组确认）

| # | 任务 | 优先级 | 预期产出 | 验收方式 |
|---|---|---|---|---|
| T3-18 | **水波下划线 hover 母题**（H-4，A8）：hover 上浮 `translateY(-2px)` 部分替换为下划线粗细/offset 过渡、零位移；`::selection` 不再发红 | P2 | 去模板感收益最大的一项；水波与 motto「Be water, my friends.」同一个人的两处签名 | grep 动效白名单（规范 §6.1）；浏览器实测 hover 无位移 |
| T3-19 | **身份词升格为「身份铭牌」**（H-2，A9）：等宽装饰升格为墨色 0.9rem + `ls .2em` + 词间 hairline，或加 `01/02` 序数前缀 | P2 | 身份词读作署名规格表而非标签 | 产物身份域排版按 A9 结论 |
| T3-20 | **代码块融纸面**（VD-10，A7）：`pre` 背景 `#fdfbf6` + 1px `--line-color` 细边框 | P2 | 代码块与纸面同温 | 产物代码块无冷白底 |
| T3-21 | **暗色模式标注**（C-7）：配置加「未校准，勿启用」标注；`dark_values` 原厂冷蓝保留但注明若启用的校准值（body `#1a1814`、accent 提亮 `#d9724a`） | P2 | 防止某次「顺手」启用得到蓝黑站点 | `_config.yml` 有标注；dark_mode.enable 保持 false |

---

## 六、任务明细总表（速查）

| 批次 | 任务数 | 编号 | 优先级 | 阻塞性质 |
|---|---|---|---|---|
| 批 0 | 4 | D0-1~D0-4 | P0×3 + P1×1 | D0-3 需主人网页端操作；D0-4 文档即办 |
| 批 1 | 18 | T1-1~T1-18 | 全 P1 | 1A 六项依赖 A 组确认；T1-8 依赖 D0-1 先落地 |
| 批 2 | 6 | T2-1~T2-6 | 全 P1 | 全部阻塞于主人决策/素材（B 组） |
| 批 3 | 21 | T3-1~T3-21 | 全 P2 | T3-7/T3-13/T3-16 阻塞于 B10/B7/B9；3C 阻塞于 A7/A8/A9 |
| **合计** | **49** | — | P0×3、P1×25、P2×21 | 决策项 25 项见 §七 |

> **计数口径说明**：审查报告的 45 个编号条目按「问题」计为 P0×2 / P1×19 / P2×23（IA-3 计入 P0：线上归档页存在访客可见的「日期与链接自相矛盾」；UX-16 并入 UX-8 不重复计，独立问题 44 项）；本表按「任务」计，差异来自：① IA-1 拆为「修复 + CI 防复发断言」两个任务；② 规范附录 B 新增的 B-15（design/design-language.html 标注）单列任务 D0-4；③ 部分 P2 问题按同一改动面合并为一个任务（如 T3-6 合并 IA-12/UX-11/UX-12）。

> 任务编号与审查报告问题编号对照：D0-1=IA-1、D0-3=IA-3、T1-1=VD-1、T1-2=VD-2、T1-3=VD-3、T1-4=VD-4、T1-5=VD-5、T1-6=VD-11、T1-7=RL-3、T1-8=RL-1、T1-9=VD-9、T1-10=VD-8、T1-11=UX-3、T1-12=UX-1、T1-13=UX-2、T1-14=UX-4、T1-15=UX-5、T1-16=UX-6、T1-17=UX-7、T1-18=IA-4、T2-1=VD-7、T2-2=VD-6、T2-3=F-2、T2-4=N-3、T2-5=M-2、T2-6=F-5/F-6/E-1、T3-1=VD-12/13、T3-2=旧 P1-17/P1-13、T3-3=旧 P1-14、T3-4=IA-6(部分)、T3-5=RL-2、T3-6=IA-12/UX-11/UX-12、T3-7=UX-8、T3-8=UX-9、T3-9=UX-10、T3-10=UX-14、T3-11=UX-13、T3-12=IA-11、T3-13=IA-9/IA-7、T3-14=IA-10/F-7/A-1、T3-15=D-2/D-3/A-2/A-3、T3-16=IA-8、T3-17=IA-5、T3-18=H-4、T3-19=H-2、T3-20=VD-10、T3-21=C-7。

---

## 七、需主人决策事项（25 项）

### A 组 · 设计值（影响 token，确认后即改；10.19 前过目即可解锁批 1）

| # | 事项 | 建议 | 不确认的后果 |
|---|---|---|---|
| A1 | 橙格加深 `#dd5a2f`→`#c0491f` | 加深（纸字 4.82:1 过 AA） | 橙格文字不达 AA 状态持续 |
| A2 | 新增 `--info-mark: #6b6255`，静态信息从 accent 迁中性 | 采纳（砖红恢复稀缺） | accent 继续稀释成「淡红小字」 |
| A3 | 文章页三色回归 `#2a251d`/`#2a251d`/`#b0482a` | 回归（翻页不换设计系统） | 文章页继续像另一个站 |
| A4 | `--accent-soft` 定值（现行两处 fallback .12/.28 不同） | 建议 .12（更克制） | 补齐 token 时必然改变一处现有视觉 |
| A5 | 圆角 22px→12px + 7 个 fallback token 补齐 | 统一 12px（不得扩散到首页入口格） | 列表页与首页圆角语言继续分裂 |
| A6 | 暗色校准值（body `#1a1814`/accent `#d9724a`） | 仅备案，保持关闭 | 某次顺手启用得到蓝黑站点 |
| ~~A7~~ | ~~代码块底色 `#fdfbf6` + 细边框~~ **已定（2026-10-19）：采纳，已上线** | — | — |
| ~~A8~~ | ~~水波下划线 hover 母题 + selection 不发红~~ **已定（2026-10-19）：采纳，已上线**（卡/格上浮保留） | — | — |
| ~~A9~~ | ~~身份词升格「身份铭牌」~~ **已定（2026-10-19）：采纳，已上线**（含 01/02 序数前缀） | — | — |
| A10 | 头像圆形化 + 1px 描边 + 去阴影 | 建议（圆形读作「人」） | 方卡读作图片占位 |

### B 组 · 品牌、内容与露出位（主人决策，规范只给框架；15 项）

| # | 事项 | 出处 |
|---|---|---|
| B1 | 真名是否上首屏（建议副行「KASAI · 韩耀宇」） | F-2/H-1 |
| B2 | 站名是否去 Blog 后缀（效果图基准无 Blog） | N-3 |
| B3 | ~~头像素材~~ **已消解**：现有 `11.jpg` 即主人个人头像（`a90325e` 替换），仅剩「是否改圆形」（A10）可选 | VD-7（已更正） |
| B4 | favicon 素材（建议砖红+墨/纸字母标） | VD-6 |
| B5 | 是否补邮箱；Instagram（yaozenx）是否本人账号 | M-2 |
| B6 | motto 位置维持首页左下收尾；主题 about.intro 与 motto 同值删哪处 | E-3 |
| B7 | ~~「近期动态」改名~~ **已定（2026-10-18）：改为「最近更新」**，已上线 | IA-9 |
| B8 | 删测试条目后是否趁手补第二条真实项目 | IA-1 |
| B9 | ~~墙格与导航去重方向~~ **已定（2026-10-18）：保持现状，不砍**（导航解决「去哪」，墙格解决「有什么」） | IA-8 |
| B10 | 404 自动跳转：保留 10s / 改纯按钮 / 延长 30s | UX-8 |
| B11 | 身份域 CTA 与档案页入口文案 | IA-10 |
| B12 | 页脚署名文案（建议「© 2026 韩耀宇 · KASAI」形态） | F-5/F-6 |
| B13 | 纸面黄调：维持 `#f5f1e9`（建议）/ 备选 `#f7f4ee` | C-8 |
| B14 | ~~旧 /04/23 链接 301~~ **已定（2026-10-18）：不加重定向**，接受旧链失效（构建时区已在代码内固定） | IA-3 |
| B15 | design/design-language.html：标注历史提案 or 按现行 token 更新 | 规范附录 B-1 |

---

## 八、时间节点建议

| 阶段 | 建议窗口 | 工期 | 前置条件 | 阶段出口（验收锚点） |
|---|---|---|---|---|
| **批 0** | 10.18（今晚）–10.19 | 1–2 天 | 无（D0-3 需主人 10.19 前操作 Vercel） | 线上无测试条目与假链；URL 三处一致；CI 断言在位 |
| **批 1** | 10.20–10.22 | 2–3 天 | A 组 10 项确认（10.19 前过目）；D0-1 先落地（T1-8 依赖） | 冷色破口清零；token 单一入口；正文轨全站统一；npm test 全绿；三档视口实测 |
| **批 2** | 10.20 起并行（素材与决策到位即落地） | 视主人 | B1/B2/B3/B4/B5/B12 决策 + 头像 favicon 素材 | 模板残留清零（示例头像/主题 favicon/主题页脚）；身份两层次清晰 |
| **批 3** | 10.23 后择机 | 每项 0.5–1 天 | 批 1 完成；B7/B9/B10 决策；A7/A8/A9 确认 | 死资源清零；性能指标改善；设计母题落地 |

**节奏说明**：① 日期可整体平移，但「批 0 → 批 1 → 批 3」的顺序与「A 组先于 1A、D0-1 先于 T1-8、批 2 素材先于 T2-1/T2-2」的依赖不建议颠倒；② 每批落地并本地验证后，授权 commit→push 由主人把关（AGENTS.md §5.3）；③ 若主人希望一次性全部做完，最短路径为 10.19 晚 A 组确认 → 10.20–10.23 连续四周批次合并推进，但违背「一次改一批验证」的纪律，不建议。

---

## 九、生效方式与每批验收清单

**生效链路**（AGENTS.md §5.3）：本地改文件 → 本地验证（`npm test` + `hexo generate` + 产物抽查）→ **主人授权** → commit → push → Vercel 自动构建部署 → 线上复核。本地 `public/` 不是发布源；只改本地不推送，域名上永远看不到。

**每批必过的通用验收**：
1. `npm test` 全绿（当前 126 项：admin 69 / pages 20 / tokens 9 / claims 2 / blocks 12 / assets 14）；
2. `hexo generate` 后 `public/**.html` 无 0 字节文件（E-029 防复发）；
3. 产物 grep：无规范 §2.3 禁止色表破口、无 `&amp;amp;` 双重转义、无 `GMT+`/ISO 日期泄漏；
4. 涉及模板的改动，抽查改动页面的 `<time>` 内容为 `YYYY-MM-DD`（E-028 防复发）；
5. 涉及 `source/admin/` 前端的改动（本排期表暂无），同步 bump 两处缓存破坏版本号（AGENTS.md §5.1）；
6. 浏览器实测（375/768/1440）：无横向溢出、交互可用——未实测的项在报告中标注「未实测」，不冒充通过。

**每批交付物**：改动文件清单 + commit message + 验证命令与结果 + 未验证项声明 + 「是否已推送」状态（AGENTS.md §5 交付六条）。

---

## 十、与 PRD §11 验收锚点对照

| 锚点 | 本排期覆盖 |
|---|---|
| 产品验收（内容真实、无虚构） | 批 0（D0-1/D0-2 数据诚信）、规范 §8 数据呈现规则 |
| 视觉验收（PRD §7 视觉系统） | 批 1（1A 色彩收拢 + 1B 版式）+ 规范 §2/§3/§4 |
| 功能验收（导航/搜索/模块/交互） | 批 1（1C 交互与可访问性）+ 批 3（T3-12/T3-13） |
| 工程验收（构建/部署/性能） | 批 0（D0-3 部署一致性）+ 批 1（T1-18）+ 批 3（3A） |

---

**排期完** ｜ 编制：主理人 画统筹（Hua） ｜ 2026-10-18
**关联文档**：`DESIGN-REVIEW-2026-10-18.md`（审查报告）、`DESIGN-LANGUAGE.md`（设计语言规范 V1.0）
**说明**：本表为计划文档，不含任何 git/deploy 执行步骤；所有涉及线上生效的批次，待主人授权后推进。

---

## 十一、执行记录（2026-10-18 晚）

| 批次 | 任务 | 状态 | 说明 |
|---|---|---|---|
| 批 0 | D0-1 删测试条目 | ✅ | projects / collections 各删 1 条；构建后两模块计数 1/1，test-entry 详情页随之消失 |
| 批 0 | D0-2 数据诚信断言 | ✅ | `module-pages-e2e.js` 第 [9] 组 3 条断言（干净样本通过 / 坏样本被抓 / 生产数据干净），坏样本走临时目录，不碰真实数据 |
| 批 0 | D0-3 构建时区 | ✅ | 改为**代码内固定**（`themes/fluid/scripts/permalink-timezone.js`，构建前把进程时区设为 config.timezone）——Vercel 把 `TZ` 列为保留环境变量名，dashboard 无法设置（主人实测报 reserved）；GH Actions 的 `env: TZ` 保留为双保险；TZ=UTC 构建实测链接仍为 /04/24。仅剩 B14（旧 /04/23 链接是否 301）待主人定 |
| 批 0 | D0-4 历史提案标注 | ✅ | `design/design-language.html` 顶部加横幅「历史提案 · token 已分叉 · 以 DESIGN-LANGUAGE.md 为准」 |
| 批 0 | 头像过渡（VD-7 短期） | ❌ 已回退 | **误报更正**：`11.jpg` 是主人本人在 `a90325e` 中替换的个人头像（沿用主题文件名），不是主题示例图；置空 monogram 的改动已撤销，头像恢复原状。该项无需处理 |
| 批 1 | T1-1 文章页三色 | ✅ | 正文/标题 `#2a251d`、链接 `#b0482a`；site.css 变量名笔误 `--post_link_color` 已修正为连字符 |
| 批 1 | T1-2 进度条 | ✅ | nprogress bar/peg/spinner 全走 `var(--accent)`，冷蓝 #29d 清零 |
| 批 1 | T1-3 搜索高亮 | ✅ | `.search-keyword` → `.search-word` 选择器修正；结果标题竖边改 accent |
| 批 1 | T1-4 橙格定标 | ✅ | `--block-orange` → `#c0491f`（纸字 4.82:1）；`.wall-cell-item` 0.8rem/700，其余 <12px 类统一 0.75rem |
| 批 1 | T1-5 圆角与 token | ✅ | :root 补齐 7 个 token；`--r-tile` 12px；`--cream` 复用 `#fdfbf6`；`--accent-soft` 取 .12（pick-note 竖边随之变浅） |
| 批 1 | T1-6 accent 分流 | ✅ | 新增 `--info-mark: #6b6255`；col-count / post-cat / feed-type / cat-count / tag-chip-count / post-head-tags / tocbot-active 迁中性；kicker 保留 accent |
| 批 1 | T1-7 正文轨 | ✅ | `.post-content` 桌面 padding 归零（≥768px），移动端保留主题 2rem |
| 批 1 | T1-8 墙格收口 | ✅ | 格子数为奇数时末格跨 2 列（≥576px），3 列/2 列布局均无洞；1 列布局不受影响 |
| 批 1 | T1-9 模块详情轨 | ✅ | project/game 改 `about-body > markdown-body` 嵌套，命中定宽规则 |
| 批 1 | T1-10 摘要转义 | ✅ | 新增 `excerpt-text.js`（去 `<pre>` 块、实体解码、折叠空白、行号兜底）；首页/归档零 `&amp;amp;` |
| 批 1 | T1-11 精选栏出口 | ✅ | 精选内容栏补「查看全部项目 →」 |
| 批 1 | T1-12 回到顶部 | ✅ 代码级 | events.js 补无 `#board` 分支（固定右下 24px）；site.css 纸面化（面板底/12px/单阴影，去无限弹跳）；未跑浏览器实测 |
| 批 1 | T1-13 TOP 锚点 | ✅ | `.home` 加 `id="top"`，链接改 `#top` |
| 批 1 | T1-14 动态栏可点 | ✅ | 模块条目改链站内详情页（如 `/games/lol/`），外链仅兜底 |
| 批 1 | T1-15 计数真实 | ✅ | 动态栏计数改 `feed.length`（当前 /13），仍渲染前 6 |
| 批 1 | T1-16 九宫格焦点 | ✅ | 关闭态 `visibility: hidden`，`.show` 恢复 visible（已编译进 main.css） |
| 批 1 | T1-17 搜索 aria | ✅ | 弹窗标题补 `id="ModalLabel"` |
| 批 1 | T1-18 sitemap | ⛔ blocked | `hexo-generator-sitemap` 只覆盖 posts/pages + tags/categories（已含）；模块列表/详情与归档索引是生成器路由，插件不支持，且不做产物级 hack。建议：接受现状（内部链接可达）或后续写专用 sitemap 生成器 |
| — | 验证 | ✅ | `hexo generate` 无错误、42 个 HTML 无 0 字节；`npm test` 七套全绿（含新增 3 条数据诚信断言） |

**遗留（需主人）**：A6/A7/A8/A9 属批 3 待确认（头像 B3 已消解：现有即主人个人头像；B14 已定：不加重定向）。**本地构建注意**：仅改主题配置时 Hexo 不会重编译已缓存的 `main.css`（源文件未变），需同步改一下 `main.styl` 内容触发；Vercel 全新构建不受影响。

---

## 十二、批次 3 执行记录（2026-10-18 夜）

| 任务 | 状态 | 说明 |
|---|---|---|
| T3-1 死资源清理 | ✅ | 删 avatar 1/2/3.jpeg（1.85MB）、wx_2wm.jpg（140KB）、gitalk.css、leancloud/openkounter/umami-view.js；本次部署少传约 2MB。random/default.png 因 `random_img:false` 且为 400KB 占位图，留待确认后处理 |
| T3-2 CDN 自托管 | ✅ | tocbot 4.20.1 / anchor-js 5.0.0 / clipboard.js 2.0.11 下载至 `source/lib/`，static_prefix 三项指向本地；删除死 preconnect；产物 HTML 中 `lib.baomitu.com` 引用为 0 |
| T3-4 搜索模板泄漏 | ✅ | 模板移到 `themes/fluid/templates/local-search.xml`（不能在 scripts/ 下，会被当 JS 执行），产物仅剩渲染后的 `/local-search.xml`（24KB，无 `{%`） |
| T3-6 og:url / typed / preload | ✅ | og:url 去 index.html；`fun_features.typing.enable:false`（无 #subtitle）；Archivo woff2 加 preload；utils.js defer 未做（依赖顺序风险，留待浏览器实测后再定） |
| T3-7 404 文案 | ✅ 部分 | 副标题改为引导文案；10 秒自动跳转是否保留仍待 B10 |
| T3-8 文章元信息日期 | ✅ | 主题 post.meta.date.format 由 "LL a" 改为 "YYYY-MM-DD" |
| T3-9 短文门控 | ✅ | 字数 <50 不渲染字数/阅读时长（7 字短文已验证无输出） |
| T3-10 文章页脚出口 | ✅ | 文章页脚补「← 回到首页」 |
| T3-12 导航当前页 | ✅ | 「更多」下拉父项 + 子项 active、`aria-current="page"`（/now/ 已验证） |
| T3-21 暗色标注 | ✅ | dark_mode 配置加「未校准，勿启用」标注与校准值说明 |
| T3-3 CSS 分级 / T3-5 断点统一 / T3-11 懒加载标记 | ⏸ 未做 | 分别为性能、断点、标记清理项，价值/风险比低于已完成项，留待下轮（T3-11 经复核影响极小） |
| T3-13~T3-20 | ⏸ 待决策 | 依赖 B7/B9/B10/B11 与 A7/A8/A9；列表页主文案、墙格去重、档案入口、详情页增强、水波母题、身份词升格、代码块底色 |
| 验证 | ✅ | generate 无错误、0 字节 HTML 为 0、`npm test` 七套全绿；搜索索引 24KB 且含文章标题 |

---

## 十三、A 组拍板与批次 3 收尾（2026-10-19）

主人 2026-10-19 拍板：**A7 / A8 / A9 三项全部采纳推荐方案**；批次 3 剩余工程项「全做」。

| 任务 | 状态 | 说明 |
|---|---|---|
| T3-20 代码块融纸面（A7） | ✅ | `pre` 底改 `--cream` + 1px hairline 细边框；行号槽分隔线由冷灰 `#999` 换 hairline；行内 code 底由 `rgba(175,184,193,.2)` 冷灰换墨色 8% 暖灰。产物结构为 Hexo 原生 `figure.highlight > table > td.gutter / td.code`，背景需两处同时覆盖 |
| T3-18 水波下划线（A8） | ✅ | 定义全站文字链基线：默认 thickness 1px / offset 3px，hover 变 2px / 6px，**元素零位移**；原先散落 6 处的 offset 写死值全部删除、收归基线（单一数据源）；`::selection` 由砖红改墨色 12%。卡 / 格的 `translateY(-2px)` 按规范 §6.2 边界**保留**；`prefers-reduced-motion` 降级由导航推广到全站 |
| T3-19 身份词铭牌（A9） | ✅ | mono 0.78rem 次级 → 墨色 0.9rem（14.4px，过中文 12px 下限）+ `ls .2em` + 词间 hairline + `01 / 02` 序数前缀（CSS counter，序数走 `--info-mark` 中性色）；窄屏横排时 hairline 由横线转竖线 |
| T3-13 入口格文案（IA-7） | ✅ | 主文案回「模块名 / 计数」，最新一条降为副行并加「最新 · 」前缀；照片格与排版格两种形态都加了空数组守卫 |
| T3-15 详情页与档案页（D-2/D-3/A-3） | ✅ | 生成器按 yml 条目顺序输出 `prevItem` / `nextItem`（首尾侧为 null）；project / game 页脚加前后条目导航（单条目模块不渲染）；项目页补 status 标签位（有数据才渲染，未替 Ties 编造状态值）；uses 页「写代码」段补指向 `/projects/Ties/` 的链接 |
| T3-15 now 页日期（A-2） | ⚠️ **改法变更** | **不采用文件 mtime**：Vercel 每次都是全新 git checkout，mtime 等于部署时刻，渲染出来永远是「今天」，比手填更假。改为 front-matter `show_updated` 结构化字段，`paper.ejs` 统一渲染「更新于 YYYY-MM-DD」，字段上方留注释说明为什么不能用 mtime |
| T3-3 CSS 异步 | ✅ 部分 | 实测：可异步的只有 hint(1.5KB gzip) / fancybox(3.1KB) / highlight(0.7KB)，合计约 5KB；bootstrap(24KB) 与 github-markdown（正文首屏就要用）保持同步。新增 `import_css_async` helper：`media="print"` + `onload` 切回 all + `noscript` 兜底 |
| T3-5 断点统一 | ✅ | 主题 styl 9 处 `767px` / `424px` 改 `.98` 家族（site.css 侧本已统一）；`links.styl` 的无冒号写法保留原风格 |
| T3-11 懒加载标记 | ✅ | `lazyload.onlypost` 改 `true`：首页与纸面页不再被注入 `srcset="/img/loading.gif"`（无描述符 srcset 会被浏览器直接采用，首屏头像先显示一张占位 gif）。文章页保留懒加载 |
| 验证 | ✅ | 42 页全部生成、0 字节 HTML 为 0；`npm test` 七套全绿（74 / 25 / 12 / 2 / 12 / 26 / 27） |
| E-038 已记录 | ✅ | 生成器 `for...of` 改 `forEach` 后循环体内的 `await` 语法错误，9 个详情页全部消失而构建仍报成功、退出码 0。新增「每个数据条目都有详情页且非 0 字节」断言，变异验证已确认能抓获 |

**A 组状态更新**：A7 ✅ 采纳 ｜ A8 ✅ 采纳 ｜ A9 ✅ 采纳 ｜ A10（头像圆形化）仍未定。
**未做**：T1-18 sitemap（blocked）、T3-14 档案页入口（待 B11 文案）、T3-16（B9 已定「保持现状」，本项关闭）、T3-17（低优先，可长期接受现状）。
