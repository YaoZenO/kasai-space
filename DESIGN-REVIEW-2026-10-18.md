# KASAI 个人主页 · 全面设计审查报告（2026-10-18）

**审查执行**：设计原型专家团 · 质量审查官 严过审（critique-reviewer）
**审查方式**：纯只读。本地源码全文核对（site.css 1617 行、主题 _config.yml、全部布局模板与 partials、5 份数据文件、3 篇文章）+ public/ 构建产物逐页核查（16:03 构建快照）+ 线上 https://www.040925.xyz 多页抓取（含 cache-buster 复抓）+ 两张效果图结构比对 + 三轮旧报告逐条核验 + Node 实测复现（js-yaml/moment/hexo 日期管线、WCAG 对比度复算）
**审查时点**：2026-10-18 16:00–16:45。注意：工作区在审查期间持续变动（16:02/16:03 重新构建，16:04/16:19 有新提交；games.yml 的人称在审查中途被改动并已落盘为第一人称，与线上一致）。数据诚信类事实（测试条目、avatar 空值）已在 16:03 构建与最新源文件上双重复核。
**文档角色**：本轮「审查 → 规范 → 排期」三步曲的事实基础（Phase 2 产出）。配套：《设计语言规范》（DESIGN-LANGUAGE.md）、《设计优化排期表》。

---

## 一、总结论与五维评分

**一段话定性**：这套站的设计骨架是成立且罕见的——「纸面 + 墨色 + 砖红」单色编辑体系有理念、有纪律、有效果图基准对应，真实数据铁律执行到牙齿；但它仍带着 **2 个 P0 对外运营**：projects/collections 的「【测试】」条目仍在首页与列表页可见（收藏条目外链 example.com 线上可点，已 curl 级取证），以及本地/线上文章 URL 日期漂移（04/23 vs 04/24，根因本轮已实证定位）。此外有一批「体系漏封」：文章页三色、进度条蓝、搜索橙红/深蓝、橙格 3.64:1、7 个未定义 token、圆角分裂、回到顶部失效、摘要双重转义（字节级实证）。修完 P0 与一批 P1 后，这是一个可以直接代表主人审美的个人主页。

| 维度 | 评分 | 说明 |
|---|---|---|
| 设计哲学 | 4/5 | 体系成立：token 单一数据源（主题 color 段→main.css→site.css 只引用不重定义）、真实计数、无数据不渲染、三轨排版（Archivo 展示/mono 元信息/系统黑体正文）、与效果图结构对应。扣 1 分：主题默认冷色在文章页/进度条/搜索三处漏封；「正文轨 38em/17px/1.75」承诺未覆盖模块详情页（选择器不命中，见 VD-9） |
| 视觉层次 | 4/5 | 首页「身份域→内容墙→三栏」视线流动清晰，主卡/入口格/排版格权重分级明确，2px 墨色顶线 + hairline 的编辑式语言全站统一。扣 1 分：首页墙右下留洞（RL-1）、精选栏无出口（UX-3）、近期动态栏链接/非链接混杂（UX-4）造成层级噪声 |
| 执行质量 | 3/5 | 构建管线整体健康（内容 hash 缓存破坏真实有效、E-028 日期修复落地、CI 八项门禁、31 页无死链）；但硬缺陷一批：摘要双重转义、模块详情页样式不命中、回到顶部失效、死资源 2.4MB+、死 preconnect、未渲染模板泄漏、橙格对比度、7 个未定义 token、文章页 padding 二次压缩 |
| 特异性 | 4/5 | 纸面墨色 + Archivo 900 紧字距 + 等宽元信息 + 身份词竖列 + 不对称编辑网格，不会被误认为通用模板。扣 1 分：favicon 仍是 Fluid 主题 Logo、首屏/关于页头像是主题作者示例图、页脚是主题作者署名——三处「模板残留」在访客第一视角直接扣辨识度 |
| 克制 | 4/5 | 动效只有 translateY(-2px)/颜色过渡/90° 旋转、阴影单 token、无 PV/UV、无评论、无装饰性社会证明，纪律罕见。扣 1 分：accent 在约 12 处静态信息上稀释成「淡红小字」、墙格与导航重复、双页脚堆叠 |

**总分：19/25。结论：需修正（P0 ×2、P1 ×19、P2 ×23；UX-16 并入 UX-8 不重复计，共 45 个编号条目 / 44 项独立问题）。P0 修完前不建议对外推广；P1 一批建议按「体系收拢」单批处理。**

---

## 二、四维问题清单（主表）

### A. 视觉设计

**VD-1｜文章页三色脱离暖纸体系 + 变量名笔误（P1，工程项）**
- 定位：`themes/fluid/_config.yml` L180 `post_text_color: "#2c3e50"`、L185 `#1a202c`、L190 `post_link_color: "#0366d6"`；`source/css/site.css` L1027、L1035
- 证据：public/css/main.css 编译输出 `--post-text-color: #2c3e50; --post-link-color: #0366d6;`；site.css L1035 写的是 `var(--post_link_color, #0366d6)`（下划线），主题实际输出连字符 `--post-link-color` → 变量永不命中，后台改色对文章页永不生效
- 影响：翻页时色温跳变（暖纸→蓝灰→hover 回砖红）；文章页与全站像两个设计系统
- 修复：主题配置三值改 `#2a251d`/`#2a251d`/`#b0482a`（链接色纸底实测 4.90:1）；site.css L1035 改 `var(--post-link-color)` 回归 token 管理。沿架构修，勿在 site.css 硬编码
- 预期：翻页不换设计系统；链接形成「墨→砖红」梯度且受后台管

**VD-2｜顶部加载进度条为主题默认蓝 #29d（P1，工程项）**
- 定位：`themes/fluid/_config.yml` L124 `color: "#29d"`；`_partials/plugins/nprogress.ejs` L6 只 configure 了 options，颜色根本没下发
- 证据：public/lib/nprogress/0.2.0/nprogress.min.css 内写死 `#nprogress .bar{background:#29d`；线上每页加载一条蓝光带扫过暖白纸面
- 修复：site.css 追加 `#nprogress .bar{background:var(--accent)} #nprogress .peg{box-shadow:0 0 10px var(--accent),0 0 5px var(--accent)} #nprogress .spinner-icon{border-top-color:var(--accent);border-left-color:var(--accent)}`（比改配置更稳，因为配置色当前是死配置）
- 预期：冷色破口归零；加载条变成纸面体系内的一条砖红线

**VD-3｜搜索高亮选择器落空 + 橙红/深蓝残留（P1，工程项）**
- 定位：`source/css/site.css` L1543 `.search-keyword` vs `themes/fluid/source/js/local-search.js` L113 输出的 `search-word`；public/css/main.css L781 `#local-search-result .search-word{color:#ff4500}`、L775 `.search-list-title{border-left:3px solid #0d47a1}`
- 证据：JS 输出 class 为 search-word；site.css 的 .search-keyword 规则零命中；实际高亮由 main.css 的 orangered + 深蓝竖边上色
- 修复：site.css 把 L1543 选择器改为 `.search-word`，并补 `#local-search-result .search-list-title{border-left:3px solid var(--accent)}`
- 预期：搜索命中词回归砖红，深蓝竖边消失；弹窗是全站交互功能，不能留冷色

**VD-4｜橙色入口格对比度 3.64:1 不达 AA（P1，设计项）**
- 定位：`source/css/site.css` L32 `--block-orange: #dd5a2f`、L555-557
- 证据：本轮 WCAG 复算 `#fdfbf6 on #dd5a2f = 3.64:1`（<4.5）；格子小字 .wall-cell-item 0.74rem≈11.84px 低于中文 12px 下限；games 格有封面时白字压图是当前主形态，无封面条目（如未来的「想玩」）必踩此雷
- 修复：`--block-orange` 加深至 `#c0491f`（实测纸色字 4.82:1 达标）；条目小字升 0.8rem/700；黄格 #e6b23c 保留（墨字 7.82:1 已达标）并在 :root 注释锁定「黄块内只能用墨色」
- 预期：首屏两个入口块都过 AA；「谁能用什么字」写进 token 层

**VD-5｜圆角标尺分裂 + 7 个 token 只在 fallback 里存在 + 第三个纸色（P1，工程项）**
- 定位：`source/css/site.css` L1556/L1567/L1572/L1584/L1588 使用 `var(--r-tile, 22px)`、`var(--r-card, 12px)`、`var(--cream, #f9f6f1)`、`var(--ink-warm, #2a251d)`、`var(--cream-on-dark, #f5f1e9)`、`var(--line-strong, …)`、`var(--accent-soft, …)`；`:root` L22-40 均未定义
- 证据：模块列表卡实际渲染 22px 大圆角 + #f9f6f1 底（与纸底 #f5f1e9 实测仅 1.05:1），全站其余组件 ≤12px；列表页与首页/详情页之间圆角语言突变
- 修复：`:root` 补齐 7 个 token；`--r-tile` 定 12px 对齐全站；`--cream` 复用 `#fdfbf6` 消灭第三个纸色。**红线遵守：不得把 22px 扩散到首页入口格**
- 预期：圆角与纸色单一入口，后台可管、全局可 grep

**VD-6｜favicon/apple-touch-icon 仍是主题默认图（P1，设计项，待素材）**
- 定位：`themes/fluid/_config.yml` L21/L25 `/img/fluid.png`；线上 31 页 head 实证
- 证据：浏览器标签页/书签显示 Fluid 主题 Logo，是访客第一视觉印象
- 修复：制作个人图标（32px/180px，建议 #b0482a + 墨/纸字母标）放入 source/img/ 替换两处——需主人出素材
- 预期：标签页即品牌位

**VD-7｜首屏与关于页使用主题作者示例头像（P1，设计项，待素材）**
- **更正（2026-10-18 晚，主人指出）**：`themes/fluid/source/img/avatar/11.jpg` 是**主人本人在提交 `a90325e`「更新关于页面：更换个人头像与社交配置」中替换的个人头像**，只是沿用了主题的文件名。「md5 与主题原图一致」只能证明它与主题目录下的同名文件相同，不能推出它是主题示例图——**本条按误报处理，头像无需更换，已回退到原状**（详见 DESIGN-ROADMAP 执行记录）。
- 定位：`source/_data/site.yml` L8 `avatar: ""` → 回退 `themes/fluid/_config.yml` L1039 `/img/avatar/11.jpg`；`index.ejs` L153/L176-180、`about.ejs` L12/L44-48
- 证据：public/index.html 与 public/about/index.html 均渲染 `src="/img/avatar/11.jpg"`（md5 与主题原图一致，上轮主理人已验）
- 修复：短期把 site.yml avatar 显式置空触发首字母 monogram 降级（index.ejs L179 已支持），比展示陌生插画专业；正式替换时改圆形 + 1px 描边 + 去阴影（方卡读作图片占位）
- 预期：身份最像「装饰」的两个位置不再由模板作者占据

**VD-8｜摘要双重转义 + 代码行号泄漏进摘要（P1，工程项）【本轮新发现】**
- 定位：`themes/fluid/layout/index.ejs` L73-77 `postExcerpt`、`archive.ejs` L43-44
- 证据（字节级）：public/index.html 内为 `1if (!featuredPost &amp;amp;&amp;amp; postsArr.length)`；根因已实证——Hexo 8.1.1 的 `strip_html`（hexo-util/dist/strip_html.js）只去标签**不解码 HTML 实体**，EJS `<%= %>` 二次转义 → 访客看到字面 `&amp;&amp;`；行首「1」是 highlight.js 行号泄漏
- 影响：首页大卡摘要、最新文字摘要、归档页精选摘录凡含代码的文章全部中招，纸面档案上出现机器转义痕迹
- 修复：按 fmt-item-date.js 的同架构加一个 helper（如 `excerptText`）：strip_html 后做实体解码（&amp;/&lt;/&gt;/&quot;/&#39;→原字符）+ 折叠空白，模板改调该 helper；顺手剥离开头行号
- 预期：摘要回归人话；这是「元信息认真度」的直接信号

**VD-9｜模块详情页正文轨样式不命中（P1，工程项）【本轮新发现】**
- 定位：`themes/fluid/layout/project.ejs` L35 `<article class="about-body markdown-body">`、`game.ejs` L32 同款
- 证据：site.css L1446 的规则是 `.about-body .markdown-body`（后代选择器），而模板把两个 class 放在**同一元素**上 → 规则不命中；模块详情页实际落到主题 `.markdown-body` 基线（markdown.styl L2-5：16px/1.6）+ 颜色 `--post-text-color` #2c3e50 + 全宽无 38em 定宽。public/games/lol/index.html 实证
- 影响：「安静阅读」定宽轨道只在文章页/关于页成立，游戏/项目详情页是另一种排版；且与 VD-1 叠加，模块详情页是冷色字
- 修复：project.ejs/game.ejs 改为嵌套结构 `<article class="about-body"><div class="markdown-body">…</div></article>`（与 about.ejs/paper.ejs 一致），一行改动
- 预期：全站长文同一阅读轨

**VD-10｜代码块底温与纸面轻微色温差（P2，设计项）**
- 定位：`themes/fluid/_config.yml` L66 `style: "github gist"`；本轮核查 highlight.css 未发现 `.hljs` 背景规则（旧报告 C-2 中「代码块底 #f6f8fa」子项与现状不符，已修正为「色温差存在但无硬编码白底规则」）
- 修复（可选）：`pre` 背景改 `#fdfbf6` + 1px `--line-color` 细边框
- 预期：代码块融进纸面

**VD-11｜accent 从「稀缺强调」稀释为「淡红小字」（P2，设计项，未采纳项）**
- 定位：`.col-count`（site.css L631-638）、`.post-cat`（L707-714）、`.feed-type`（L786-792）、`.page-head-kicker`（L912-919）、`.cat-count`（L1255-1261）、`.tag-chip-count`（L1380-1384）、`.post-head-tags a`（L1011-1014）、tocbot-active-link（L1106-1108）等约 12 处静态信息
- 修复（旧报告 C-4，本轮复核仍未采纳）：:root 新增 `--info-mark: #6b6255`（纸底 5.32:1 达 AA），静态信息迁中性，kicker（每页 1 处）保留 accent。**这不是引入第二彩色，是给静态信息降级为中性**，不越红线
- 预期：砖红每次出现都有分量

**VD-12｜死资源 2.4MB+ 随每次构建发布（P2，工程项）**
- 定位与证据：public/img/avatar/1.jpeg(448KB)+2.jpeg(415KB)+3.jpeg(985KB)=1.85MB 主题示例头像（仅 11.jpg 被引用）；public/img/default.png 400,730B **全站 HTML 零引用**（本轮 grep 实证，各页 banner 已 hide_banner）；public/img/random/default.png 400KB（random_img:false）；public/img/wx_2wm.jpg 140KB（微信码已下架但文件仍发布）；public/css/gitalk.css、highlight-dark.css、public/js/leancloud.js、openkounter.js、umami-view.js（评论/统计/暗色全未启用）
- 修复：从 themes/fluid/source/ 删除未用文件（删除前确认后台媒体库无引用）
- 预期：每次部署少传 2.4MB+；消除「还在用」的维护误判

**VD-13｜400KB default.png 零渲染（P2，工程项）**
- 与 VD-12 同源，单列是因为旧报告 P1-15 曾按「LCP 元素」定级；本轮核实其**已不在 LCP 区**（首页格子图用真实封面），降为纯死资源。当前不压缩（零收益），待恢复 banner 或换真实头图时再处理

---

### B. 用户体验

**UX-1｜「回到顶部」浮动按钮全站失效（P1，工程项）**
- 定位：`themes/fluid/source/js/events.js` L122-130 `registerScrollTopArrowEvent`；public/css/main.css L745-758
- 证据：L127-130 `var board = jQuery('#board'); if (board.length === 0) { return; }`——全站自定义页面均无 `#board` 元素（layout.ejs 只在非 paper 分支渲染 #board）→ 函数提前 return，按钮永远停在 `bottom:-60px` 不可见、无点击处理。**旧报告 A-2 所称「抛 TypeError 中断后续事件」与现状不符：guard 存在，不抛错，只是静默失效**（记录修正）
- 影响：文章页/归档页/模块页没有任何可用的回到顶部；与首页页脚 `TOP ↑`（href="#"，见 UX-2）功能重复且一个失效一个粗暴
- 修复（二选一）：① 改 guard 为 `window.pageYOffset` 方案让按钮复活并纸面化（#fdfbf6 底 + --site-chip-border + 12px 圆角 + --site-float-shadow，去 hover 无限弹跳）；② 删主题按钮（scroll_top_arrow.enable: false），只保留首页 TOP ↑ 并修好锚点。**二者留一**
- 预期：长文页有体面的回顶路径；不再有隐形死控件

**UX-2｜首页 `TOP ↑` 是死锚点 href="#"（P1，工程项）**
- 定位：`themes/fluid/layout/index.ejs` L330
- 证据：`<a class="end-top" href="#">TOP ↑</a>`；浏览器跳顶但 URL 被塞 `#`；fixed-top 胶囊跳顶后仍覆盖视口顶，键盘用户无法确认焦点位置
- 修复：`.home` 加 `id="top"`，href 改 `#top`，保留 :focus-visible
- 预期：跳顶有真实目标且可聚焦确认

**UX-3｜精选内容栏缺「查看全部项目 →」出口（P1，设计项）**
- 定位：`themes/fluid/layout/index.ejs` L261-265 vs L286
- 证据：「最新文字」栏有 col-more 链接，「精选内容」栏没有；效果图基准三栏齐整
- 修复：精选栏 col-head 内补 `<a class="col-more" href="<%= url_for(featuredModule.page || '/projects/') %>">查看全部项目 →</a>`
- 预期：三栏出口齐整，栏头节奏统一

**UX-4｜「近期动态」栏模块条目不可点击（P1，工程项）**
- 定位：`themes/fluid/layout/index.ejs` L134 `link: it.link || ''`
- 证据：public/index.html L640-659，游戏条目（英雄联盟/CS2/守望先锋）全部渲染为非链接 `<span class="feed-title">`，而同条目在精选栏/墙格可点；旧报告 L-3 只点名了 projects 的 Ties，实际 games 五条全不可点（比旧结论更广）
- 修复：feed 聚合时对模块条目复用详情页 slug 拼接逻辑（有 m.page 用 `/games/<slug>/`，it.link 仅作外链叠加），与精选栏行为一致
- 预期：同一内容全站可点性一致；动态栏从「目录」变「入口」

**UX-5｜「近期动态 /6」用截断数冒充总数（P1，数据项）**
- 定位：`themes/fluid/layout/index.ejs` L139-144、L307
- 证据：`col-count` 显示 `/6`（FEED_MAX 截断值），真实聚合总量为 15 条（6 文章 + 2 项目 + 5 游戏 + 2 收藏，按 date 排序去重后）；同页「精选 /2」「分类 4」「标签 8」都是真实总数，`/` 前缀一页两义
- 修复：计数改 `feed.length`（真实总数），仍渲染前 6，末条后加「更早 N 条 →」或接受纯展示；「计数=真实」铁律的同页自洽
- 预期：`/` 前缀在全站只表达一种含义

**UX-6｜移动端九宫格菜单关闭态仍可 Tab 聚焦（P1，工程项）**
- 定位：public/css/main.css L468-486（`#mobile-grid-menu` 只有 `opacity:0; pointer-events:none`，无 `visibility:hidden`）
- 证据：关闭态内部 10+ 个链接仍在 Tab 序列，键盘/读屏用户在导航与正文之间逐一穿越看不见的菜单
- 修复：`#mobile-grid-menu{visibility:hidden}` + `#mobile-grid-menu.show{visibility:visible}`，或容器加 `inert`
- 预期：焦点顺序干净；WCAG 2.4.3 焦点顺序

**UX-7｜搜索弹窗 aria-labelledby 悬空（P1，工程项）**
- 定位：`themes/fluid/layout/_partials/search.ejs` L1 `aria-labelledby="ModalLabel"` vs L6 `<h4 class="modal-title">`（无该 id）
- 证据：public/index.html L684-689 实证
- 修复：h4 加 `id="ModalLabel"`，或对话框改 `aria-label="搜索"`
- 预期：读屏打开弹窗能报出对话框名称

**UX-8｜404 页主副标题同为「页面不存在」+ 10 秒强制跳转（P2，设计项/待决策）**
- 定位：`themes/fluid/layout/404.ejs` L23-25、L30；`_config.yml` L1073-1080
- 证据：public/404.html `<h1>页面不存在</h1>` + `<p class="archive-total">页面不存在</p>` 完全重复；10s 后 location.href 强制跳首页
- 修复：副标题改引导文案（如「你要找的内容不在这个位置」）；跳转时长建议取消自动跳转只留按钮，或延长至 30s——**需主人定**
- 预期：404 像纸面档案的一页而不是陷阱

**UX-9｜文章页元信息日期格式与全站不一致（P2，设计项）【本轮新发现】**
- 定位：`themes/fluid/_config.yml` L615 `format: "LL a"`；`_partials/post/meta-top.ejs` L12-14
- 证据：public/2026/10/18/games-i-play/index.html L436-438 渲染「2026年10月18日 晚上」（moment 长格式 + 时段词），而全站元信息一律 mono `YYYY-MM-DD`
- 修复：改 `full_date(page.date, 'YYYY-MM-DD HH:mm')` 或 `date(page.date, config.date_format)`，与首页/归档统一
- 预期：等宽元信息轨全站一致

**UX-10｜短文仍渲染字数/阅读时长（P2，设计项）**
- 定位：`post.ejs` L118-120 无条件渲染 TOC 侧栏；`_partials/post/meta-top.ejs` L20-44
- 证据：空目录容器已靠 site.css L1085-1091 `visibility:hidden` 隐身（旧 R-1 的可见部分已自愈）；但 7 字短文仍显示「N 字 · N 分钟」
- 修复：meta 区按正文字数门控（如 <50 字不渲染字数/时长），与「空则不渲染」铁律同构
- 预期：短文页不像加载失败

**UX-11｜typed.min.js 全站空载（P2，工程项）**
- 定位：`_partials/plugins/typed.ejs` L1-9；built HTML L743
- 证据：全站无 `#subtitle`（banner 已全清），插件每页加载后 early return；typed.min.js 仍在每页脚本列表
- 修复：加 `#subtitle` 存在性判断后再 import，或 `fun_features.typing.enable: false`
- 预期：每页少一个死请求

**UX-12｜head 内 utils.js 同步阻塞 + Archivo 无 preload（P2，工程项）**
- 定位：`_partials/head.ejs` L49；`site.css` L13-20
- 修复：utils.js 挪 body-end 或 defer（color-schema.js 留 head 防抖可接受）；首页 preload `/fonts/archivo-latin-var.woff2`
- 预期：FCP 杠杆；首屏品牌字不闪

**UX-13｜头像懒加载标记（P2，工程项）【旧结论修正】**
- 定位：`scripts/events/lib/lazyload.js` L24-31；built HTML L420
- 证据：过滤器保留真实 `src`、只追加无描述符的 `srcset="/img/loading.gif" lazyload`；按 HTML 规范无描述符的 srcset 整体解析失败被忽略 → 真实头像立即加载，**LCP 并未延迟**（旧报告 H-3 的推断不成立，记录修正）
- 修复：顺手把该标记清理干净（给 index.ejs 加 `page.lazyload = false` 或白名单 .identity-avatar-img），消除非标准标记
- 预期：标记语义干净，无潜在解析分歧

**UX-14｜文章页脚缺「回到身份域」出口（P2，设计项）**
- 定位：`post.ejs` L83-112 post-foot 只有版权与上下篇
- 修复：post-foot 加一处指向 `/` 或 `/about/` 的低调文字链
- 预期：读完文章有「回到这个人」的路径，与首页身份域叙事闭环

**UX-15｜搜索按钮 aria-label 为英文 "Search"（P2，工程项）**
- 定位：`_partials/site/nav.ejs` L56/L118；zh-CN 站点
- 修复：两处改同源取值（`__('search.title')`）
- 预期：读屏与视觉用户同一控件同一名字

**UX-16｜404 自动跳转丢失错误 URL 上下文（P2，待决策）**——并入 UX-8，不重复计。

---

### C. 信息架构

**IA-1｜projects/collections 测试条目仍在生产构建且线上可点（P0，数据项）**
- 定位：`source/_data/projects.yml` L71-94「【测试】项目模块全字段演练」（link 指向 github.com/YaoZenO）；`source/_data/collections.yml` L16-20「【测试】收藏模块演练」（link: https://example.com）
- 证据（三重）：① 16:03 构建 public/index.html「精选内容」栏渲染该测试条目（带 github.com/YaoZenO ↗ 外链标注）；public/projects/index.html、public/collections/index.html 均含；② 线上 https://www.040925.xyz/?cachebust 抓取，「精选内容 /2」第二条即测试条目；③ 线上 /collections/ 页 example.com 为**可点击外链**（已抓取实证）。games.yml 已清并补 5 款真实游戏（上轮 P0-1 的 1/3 已修）
- 影响：访客第一眼看到「测试」字样与假链；「计数=真实条目数」立身之本被破；搜索引擎收录假页面；首页精选栏（首屏之下第一视觉焦点）直接被污染
- 修复：删两条 items（各模块删后仍有真实条目：projects 剩 Ties、collections 剩 Esports Manager 2026 mods，**不会触发空模块**，见 IA-2）；CI 加断言：_data/ 不得出现 example.com 与「测试」标题条目
- 预期：首页/列表页/动态栏数据全部真实；这是 P0 不是因为难看，是因为它破的是全站数据铁律

**IA-2｜空模块导航 404 隐患（P2，工程项）【旧结论修正】**
- 定位：`themes/fluid/scripts/generators/module-pages.js` L31 `if (!valid.length) continue;`；`_partials/site/nav.ejs` L15-49 无条件渲染菜单
- 修正：旧报告 P0-2 称「删测试数据后游戏/收藏导航必 404」——**当前数据状态下不成立**（三模块删测试后各余 ≥1 真实条目，页面仍生成）。但潜在风险仍在：未来任一模块清空即出现导航死链
- 修复：导航渲染时校验 `site.data.<key>.items` 非空，空模块导航项不渲染（与「无数据不渲染」铁律一致）
- 预期：录入链路再出空模块时不再产死链

**IA-3｜本地/线上文章 URL 日期漂移，根因已实证定位（P0，工程项/部署）**
- 定位：`_config.yml` L17 `timezone: Asia/Shanghai`、L22 `permalink: :year/:month/:day/:title/`
- 证据链（完整闭环）：① 线上文章 URL 为 `/2026/04/23/a-dream-from-nobody/`（线上 sitemap.xml 同），本地构建为 `/2026/04/24/`；线上 `/2026/04/24/…` 返回 404。② 代码级根因：`node_modules/hexo/dist/plugins/filter/post_permalink.js` L26-28 `date.format('YYYY')` 用的是**构建机系统时区**；而 `plugins/processor/common.js` `adjustDateForTimezone` 只把**显示**修正到 config.timezone。③ Node 实测复现：同一 front-matter `date: "2026-04-24 05:12:39"`，TZ=Asia/Shanghai → permalink 04-24；TZ=UTC → permalink 04-23，而两者显示都是「2026年4月24日 凌晨」。GitHub Actions（ubuntu-latest）与 Vercel 构建机均为 UTC → 线上稳定产出 04/23。④ 受影响范围：仅 front-matter 时间在 00:00–08:00(+08) 的文章（当前 2 篇：a-dream-from-nobody 05:12、personal-reflectio 04:52）——主人有夜间写作习惯，这是会反复踩的陷阱
- 影响：本地构建与部署产物 URL 不一致（验证成本、分享外链 404 风险、sitemap/canonical 双形）；旧两轮「根因未定位」悬案至此闭环
- 修复（保持 permalink 规则不变，不越红线）：① Vercel 项目设置构建环境变量 `TZ=Asia/Shanghai`（GitHub Actions 亦加 `env: TZ: Asia/Shanghai`）——需主人在 dashboard 操作，本地无法代改；② 已上线的两个 /04/23 URL 加 Vercel 重定向到 /04/24（或反向接受线上既有形态，二者一定清）；③ 长期可在 themes/fluid/scripts/ 加 post_permalink filter 用 config.timezone 格式化，彻底摆脱环境依赖
- 预期：本地/CI/线上三处 URL 一致；日期显示早已一致，只差 permalink

**IA-4｜sitemap 覆盖不全 + URL 形式漂移（P1，工程项）**
- 定位：public/sitemap.xml（22 条）
- 证据：缺失 `/archives/`、`/links/`、`/projects/`(+Ties+test-entry)、`/games/`(+5 详情)、`/collections/`、`/categories/`、`/tags/` 索引页（generator 路由不进 sitemap）；且文章为目录式（/2026/10/18/x/）而 about/now/uses 带 index.html，两种形式混用；`/tags/C/`（C++ 标签的 ++ 被剥，见 IA-5）
- 修复：放宽 sitemap 生成范围（注册 generator 路由数据）或接受现状但在 robots/Search Console 手动补；统一 permalink 风格
- 预期：模块内容（项目/游戏长文）对搜索引擎可达

**IA-5｜标签「C++」URL 为 /tags/C/（P2，工程项）【本轮新发现】**
- 证据：public/tags/index.html `<a href="/tags/C/"># C++</a>`，sitemap.xml 同；页面可开但 URL 丢信息
- 修复：接受（无害）或给该标签加 slug 覆盖；低优先
- 预期：URL 与标签名一致

**IA-6｜搜索索引仅覆盖文章 + local-search.xml 模板泄漏（P2，工程项）**
- 定位：`themes/fluid/_config.yml` L420 `field: post`；public/xml/local-search.xml（1421B）
- 证据：① 项目/游戏长文、now/uses 不可搜索；② public/xml/local-search.xml 含裸 `{% if posts %}` 未渲染模板且可公开访问（旧 A-1，本轮 16:03 构建复验仍存在）
- 修复：field 改 `all`（或接受）；模板移出 theme source/ 或 CI 加「public/ 不得含 {%」断言
- 预期：搜索覆盖全站内容；产物洁净

**IA-7｜入口格用 items[0].title 代表整个模块（P2，设计项）**
- 定位：`index.ejs` L217-231
- 证据：游戏格主文案「英雄联盟 →」+ tag「# 游戏 / 5」——等于宣称「这个模块就是这一条」，主次颠倒（tag 行已带模块名+计数，部分缓解）
- 修复：有 cover 的格子主文案回模块名+计数，items[0].title 加「最新」前缀
- 预期：模块格读作「模块入口」而非「单条目」

**IA-8｜墙格与顶部导航重复（P2，设计项）**
- 定位：`_config.yml` L390-394 vs `index.ejs` L216-233
- 证据：项目/游戏/收藏在首屏出现两次（导航胶囊 + 墙格），两种心智（分类视角 vs 最近更新视角）在同一视口打架
- 修复：二选一——墙格不再重复导航可点模块，或导航把三者移入「更多」（L396-401 已有该模式）。倾向后者风险小，但属主人审美决策
- 预期：首屏同一目标只出现一次

**IA-9｜「近期动态」栏名不副实（P2，设计项）**
- 定位：`index.ejs` L307
- 证据：访客期待社交性「动态」，看到的是内容变更流水；站点无互动属性
- 修复：改「最近更新」/「更新记录」；勿用暗示社交语义的词
- 预期：栏名与内容同构

**IA-10｜档案页 /now/ /uses/ 在首页零入链（P2，信息架构）**
- 定位：`index.ejs` L193-196 身份域 CTA 只有「进入文字/关于我」
- 证据：两个最有个人档案感的页面只靠导航「更多」下拉暴露（首页正文 grep 入链数为 0）
- 修复：身份域 CTA 组后补一行并排文字链「现在 / 我在用什么」指向已存在页面（不新增页面、不造死链）
- 预期：「首屏介绍我 → 深入看我在做什么」叙事连贯

**IA-11｜「更多」下拉与九宫格无当前页指示（P2，工程项）**
- 定位：`_partials/site/nav.ejs` L39-42 isActive 只算顶层项
- 证据：访问 /now/ /uses/ /links/ 时导航零反馈（WCAG 2.4.8 位置）
- 修复：父项按子链接匹配加 .active；九宫格加选中描边（形状+颜色双编码，不靠颜色单独承担）
- 预期：三页有「你在这里」

**IA-12｜og:url 带 /index.html（P2，工程项）**
- 定位：`head.ejs` L22/L34 open_graph；built HTML L27 `og:url = https://www.040925.xyz/index.html`（canonical 反而是干净的）
- 修复：og url 去掉 index.html 后缀（或与 canonical 同源）
- 预期：分享卡片 URL 规范

---

### D. 响应式布局

**RL-1｜首页内容墙右下留洞（P1，设计项）**
- 定位：`source/css/site.css` L390-396（.wall 3 列 + grid-auto-flow: dense + 主卡 span 2）
- 证据（确定性推导，未跑浏览器）：当前 6 个墙元素（主卡 span r1-2c1 + 5 入口格），dense 放置后第 5 格（标签）落 r3c1，r3c2-3 空置 → 1440px 右下一个约 158px 高的洞；768px 2 列布局下第 5 格落 r4c1，r4c2 同样孤悬
- 影响：首屏右侧构图完整感受损，「编辑式不对称」变成「手调网格没调齐」
- 修复：主卡 grid-row 跨度随格子数自适应（6 格时 span 3），或末格跨剩余列（grid-column: span 2）；与 IA-1 删测试条目可恢复 4 格满填属同一改动面
- 预期：首屏右侧满填，不对称构图成立

**RL-2｜断点双约定并存（P2，工程项）**
- 定位：site.css L854/L876/L1080/L1110/L1457 用 991.98/767.98/575.98；main.css/post-page.styl 用 767/424 整数
- 证据：767.01–767.98px 区间两套规则可能同时生效（亚像素缝）
- 修复：统一 .98 家族（含主题 styl 源）
- 预期：断点行为单一可推导

**RL-3｜文章页 10% padding 二次压缩正文轨（P1，设计项）**
- 定位：`themes/fluid/source/css/_pages/_post/post-page.styl` L1-6 `padding-left/right: 10%`；site.css L1023-1032 未中和
- 证据：post-main-col 上限 780px × 80% ≈ 624px < 定稿 38em ≈ 646px（17px 字号）；关于页正文是 646px → 同一「正文轨」两种宽度
- 修复：site.css 加 `.post-content{padding-left:0;padding-right:0}`（移动端 theme 的 2rem/1rem 保留）
- 预期：「安静阅读」定宽承诺在文章页成立，与关于页同轨

**RL-4｜移动端 768–991px 文章页体验（P2，未实测项）**
- 规则推导：≤991.98px 时 .post-side 全隐藏（site.css L1110-1122）、正文 max-width:none 全宽；>991.98px 才有右栏 TOC。规则层无矛盾，该区间视觉未单独截图（旧未验证项延续）
- 建议：下轮若跑浏览器补 768/900 两档截图

---

## 三、旧结论核验表（三轮报告逐条）

### SITE-AUDIT-2026-10-15
| 条目 | 状态 | 证据 |
|---|---|---|
| P0-1 SEO 基础 | ✅ 已修复 | _config.yml L8/L9/L17 有值；canonical.enable:true；public/sitemap.xml(22条)/atom.xml/robots.txt（Disallow /admin/ + Sitemap 行）均在 |
| P0-2 C++ 转载版权 | ✅ 已修复 | 该文已重写为第一人称整理（front-matter 无 author，正文自称整理者）；文末资源外链保留属合理引用。**观察项**：资料源头仍可辨，建议留一行 courtesy 出处（不强制） |
| P0-3 public/ 污染 | ✅ 已修复 | 当前 public/ 为干净构建（16:03），无 e2e 死链 |
| P1-1 标题层级 | ✅ 已修复 | 文章页 h1 唯一，无跳级（built HTML 实证） |
| P1-2 图片 alt | ✅ 已修复 | 该文 0 图；全站 alt 100% |
| P1-3 对比度 | ✅ 已修复 | sec_text_color #736a5c 复算 4.73:1/5.15:1；黄格墨字 7.82:1 |
| P1-4 CC 图标裁切 | ✅ 已修复 | site.css L1080-1082 <768px display:none |
| P1-5 GitHub 链接 | ✅ 已修复 | /github.com/YaoZenO |
| P1-6 favicon | ❌ 仍存在 | 仍 /img/fluid.png（见 VD-6） |
| P1-7 关于页扩充 | ✅ 已修复 | 四段个人叙事 |
| P1-8 Ties 内容 | ✅ 已修复 | 四段长文详情 |
| P1-9 FEATURED 一句话文章 | ✅ 已修复 | index.ejs L48-51 40 字门槛 + 空壳过滤；线上 featured = games-i-play |
| P1-10 CDN 自托管 | ⚠️ 部分修复 | bootstrap/jquery/图标/nprogress/typed/fancybox/github-markdown/hint 全自托管；**tocbot/anchor/clipboard 仍走 lib.baomitu.com**（见 UI P1-17） |
| P1-11 404 5s 跳转 | ✅ 已修复（但引入新问题） | 10000ms；10s 仍偏长且主副标题重复（见 UX-8） |
| P2 站名 Bloger | ✅ 已修复 | 现 "KASAI'S Blog"（去 Blog 后缀属待决策，见 N-3） |
| P2 「文字」导航名 | 维持 | 全站一致，设计决定 |
| P2 meta_generator | ✅ 已修复 | _config.yml L80 false |
| P2 wx_2wm | ⚠️ 配置下架、文件仍发布 | 图标已注释；140KB 文件随构建发布（见 VD-12） |
| P2 default.png | ⚠️ 仍发布、零渲染 | 400KB 全站 HTML 零引用（见 VD-12/13） |
| P2 og:url /index.html | ❌ 仍存在 | 见 IA-12 |
| P2 RSS | ✅ 已修复 | atom.xml |
| P2 links 页 | ✅ 已修复 | 入导航「更多」+ 诚实空态文案 |
| P2 空模块不渲染 | 维持（特性） | 铁律保持 |

### UI-AUDIT-2026-10-17
| 条目 | 状态 | 证据 |
|---|---|---|
| P0-1 测试条目 | ⚠️ 部分修复 | games 已清（5 真实+封面）；projects/collections 仍在，线上可见（见 IA-1） |
| P0-2 删测试→导航 404 | ❌ 已不适用（结论修正） | 当前三模块删测试后各余 ≥1 真实条目，页面仍生成；潜在风险降为 P2 导航守卫（IA-2） |
| P0-3 线上漂移 | ❌ 仍存在（根因本轮定位） | 线上 /04/23 vs 本地 /04/24；根因：permalink 用构建机系统时区格式化（见 IA-3，附 Node 实证） |
| P0-4/A-1 搜索模板泄漏 | ❌ 仍存在 | public/xml/local-search.xml 含裸 {% %}，16:03 构建复验（见 IA-6） |
| P1-1 文章页三色+笔误 | ❌ 仍存在 | 见 VD-1 |
| P1-2 进度条 #29d | ❌ 仍存在 | 见 VD-2 |
| P1-3 搜索高亮 | ❌ 仍存在 | .search-keyword 落空；实际 #ff4500 + #0d47a1（见 VD-3） |
| P1-4 橙格对比度 | ❌ 仍存在 | 复算 3.64:1（见 VD-4） |
| P1-5 圆角/token | ❌ 仍存在 | 22px + 7 个未定义 token（见 VD-5） |
| P1-6 文章页 padding | ❌ 仍存在 | 780×0.8=624px（见 RL-3） |
| P1-7 墙留洞 | ❌ 仍存在 | 6 格推导（见 RL-1） |
| P1-8 精选栏 more | ❌ 仍存在 | 见 UX-3 |
| P1-9 FEATURED | ✅ 已修复 | 线上为 games-i-play |
| P1-10 favicon | ❌ 仍存在 | 见 VD-6 |
| P1-11 九宫格 Tab | ❌ 仍存在 | 无 visibility:hidden（见 UX-6） |
| P1-12 aria 悬空 | ❌ 仍存在 | 见 UX-7 |
| P1-13 死 preconnect | ⚠️ 论断修正 | 旧报告称「全站无 baomitu 资源」**不准确**：文章页仍加载 tocbot/anchor/clipboard 三个 baomitu 脚本 → preconnect 对文章页有效、对首页等页为死连接。**不应直接删**，应随 P1-17 自托管后一并删 |
| P1-14 阻塞 CSS | ❌ 仍存在 | 文章页 9 个样式表全量阻塞 |
| P1-15 default.png LCP | ❌ 已不适用 | 已零渲染、不在 LCP 区；降为 VD-13 死资源 |
| P1-16 2.4MB 死资源 | ❌ 仍存在 | 见 VD-12（本轮清点 2.4MB+ 属实） |
| P1-17 anchor/tocbot CDN | ❌ 仍存在 | +clipboard.js（三项） |
| P2-1 h4 跳级 | ❌ 仍存在 | 搜索弹窗 h4 |
| P2-2 skip link/焦点圈禁 | ❌ 仍存在 | 全站无 skip link；BS4 模态不锁 Tab |
| P2-3 更多无当前页 | ❌ 仍存在 | 见 IA-11 |
| P2-4 typed.js 空载 | ❌ 仍存在 | 见 UX-11 |
| P2-5 utils.js 无 defer | ❌ 仍存在 | 见 UX-12 |
| P2-6 archivo preload | ❌ 仍存在 | 见 UX-12 |
| P2-7 sitemap | ❌ 仍存在 | 见 IA-4（缺口已枚举） |
| P2-8 sitemap 漂移 | 未验证 | 本轮禁构建，未复跑；上轮结论保留 |
| P2-9 断点双约定 | ❌ 仍存在 | 见 RL-2 |
| P2-10 双页脚 | ❌ 仍存在 | .home-end + 主题 yaoyu ♥ blog（built HTML L668-721 实证） |
| P2-11 代码块色温/is-lead/banner 死配置 | ⚠️ 部分 | is-lead 死 class 实证（site.css/main.css 均无规则，archive.ejs 还给 4 行全挂 is-lead）；代码块底色子项与现状不符（无 hljs 背景规则，见 VD-10）；banner 死配置仍（无害） |
| A-2 回到顶部 | ❌ 仍存在（描述修正） | guard 存在不抛 TypeError，静默失效（见 UX-1） |
| A-3 scripts/ 认知 | 已不适用 | 主题插件在 themes/fluid/scripts/ 为 vendored 既有架构 |

### HOMEPAGE-REVIEW-2026-10-17
| 条目 | 状态 | 证据 |
|---|---|---|
| F-1 示例头像 | ❌ 仍存在 | 首页+关于页渲染 /img/avatar/11.jpg（见 VD-7） |
| F-2 真名不上首屏 | ❌ 仍存在 | grep 韩耀宇 public/index.html = 0 |
| F-3 主卡内容空 | ⚠️ 部分修复 | featured 已有实质内容（40 字门槛）；但无封面仍是纯墨底文字卡，效果图基准是照片主卡 |
| F-4 墙留洞 | ❌ 仍存在 | 见 RL-1 |
| F-5 双页脚 | ❌ 仍存在 | 第二层是主题作者署名 |
| F-6 人名四处分裂 | ❌ 仍存在 | KASAI'S Blog / 韩耀宇 ʕ´• ᴥ•̥`ʔ / yaoyu |
| F-7 档案页入口 | ❌ 仍存在 | 见 IA-10 |
| F-8 文章页定宽 | ❌ 仍存在 | 见 RL-3 |
| F-9 ISO 日期泄漏 | ✅ 已修复 | E-028 fmtItemDate 落地；模块页/详情页全部 YYYY-MM-DD（built HTML 实证） |
| F-10 计数语义/404 标题/items[0] | ⚠️ 部分仍存在 | /6 截断（UX-5）、404 重复（UX-8）、入口格主文案（IA-7） |
| C-1 文章页三色+笔误 | ❌ 仍存在 | 见 VD-1 |
| C-2 三处冷色 | ⚠️ 部分 | 进度条、搜索两处仍存在；代码块底子项已不适用（无硬编码白底规则） |
| C-3 黄橙定标 | ⚠️ 部分 | 橙格仍 3.64:1；黄格已锁定墨字 ✓ |
| C-4 accent 拆分 | ❌ 未采纳仍存在 | 见 VD-11 |
| C-5 第二纸色 | ❌ 仍存在 | #f9f6f1 与纸底 1.05:1 |
| C-6 圆角 token | ❌ 仍存在 | 见 VD-5 |
| C-7 暗色标注 | ❌ 仍存在 | 配置无「未校准勿启用」标注；dark_values 仍是 Fluid 原厂冷蓝 |
| C-8 纸面黄调 | 待主人决策 | 未动（建议维持，备选 #f7f4ee 有数据） |
| N-1 更多当前页 | ❌ 仍存在 | 见 IA-11 |
| N-2 aria-label Search | ❌ 仍存在 | 见 UX-15 |
| N-3 站名去 Blog | 待主人决策 | 效果图基准无 Blog；品牌资产决策 |
| H-1 头像+真名 | ❌ 仍存在 | 见 VD-7/IA 决策项 |
| H-2 身份词升格 | ❌ 未采纳 | 仍 mono 0.78rem 次级色，与 kicker 同质 |
| H-3 头像懒加载 | ❌ 已不适用（结论修正） | srcset 无描述符被规范忽略，LCP 不延迟；仅剩标记清理（UX-13） |
| H-4 水波下划线母题 | ❌ 未采纳 | hover 仍 translateY(-2px) |
| W-1 入口格主文案 | ⚠️ 部分仍存在 | tag 行已带模块名+计数；主文案仍首条名 |
| W-2 墙导航去重 | ❌ 仍存在 | 见 IA-8 |
| L-1 /6 计数 | ❌ 仍存在 | 见 UX-5 |
| L-2 栏名 | ❌ 仍存在 | 见 IA-9 |
| L-3 动态条目可点 | ❌ 仍存在且扩大 | games 五条也全非链（见 UX-4） |
| D-1 ISO 日期 | ✅ 已修复 | E-028 |
| D-2 项目 status | ❌ 仍存在 | project.ejs 无 status 位 |
| D-3 详情页前后条目 | ❌ 仍存在 | 只有「返回列表」 |
| A-1 档案入口 | ❌ 仍存在 | 同 F-7 |
| A-2 now 日期手写 | ❌ 仍存在 | front-matter subtitle「更新于 2026-10-15」人手维护，忘改即说谎 |
| A-3 uses 联动 | ❌ 仍存在 | uses 页未链 /projects/Ties/ |
| M-1 示例头像 | ❌ 仍存在 | 同 F-1 |
| M-2 邮箱/Instagram | ❌ 仍存在 | 仅 GitHub+Instagram；Instagram 归属未验证 |
| M-3 links 空态文案 | ❌ 仍存在 | 「从社交图标找到我」在仅 2 图标时兑现率一半 |
| R-1 短文 TOC | ⚠️ 部分修复 | 空容器已 visibility 隐身；字数/时长仍渲染（UX-10） |
| R-2 正文轨等宽 | ❌ 仍存在 | 同 F-8 |
| R-3 回到身份域 | ❌ 仍存在 | 见 UX-14 |
| E-1 双页脚 | ❌ 仍存在 | 同 F-5 |
| E-2 TOP 锚点 | ❌ 仍存在 | href="#"（UX-2） |
| E-3 motto 去重 | ⚠️ 部分修复 | 渲染层已不重复（关于页用 site.yml intro）；主题 _config.yml L1041 about.intro 仍与 site.yml motto 同值（潜在冗余，建议删配置值） |

---

## 四、做得好的部分（已做对，不要改坏）

1. **纸面墨色砖红体系是真体系不是涂装**：token 单一数据源（主题 color 段 → main.css 变量 → site.css 只引用不重定义），与后台 admin.css 双端同步且有 test/css-tokens.js 锁定；纸底/墨/次级/线/accent 实测对比度全部有账（13.50/4.73/4.90:1）。
2. **真实数据铁律执行到牙齿**：计数全部真实、无数据不渲染、类型无汇总页时入口格降为非链接 div、外链有 pick-ext 标注、links 页诚实空态、uses 页诚实标注「还没写」。
3. **导航方案 C 与效果图基准逐条对应**：裸品牌/裸搜索图标、居中胶囊、下拉浮层纸面化（含「margin-top:0 防 hover 断链」的踩坑注释）、active 态形状+颜色双编码、全局 focus-visible、prefers-reduced-motion 降级——注释里写着为什么，改动前先读注释。
4. **三轨排版纪律**：Archivo latin 子集 34KB 自托管 + swap + unicode-range 精确到「中文不进紧字距」，展示轨/等宽元信息轨/系统黑体正文轨无混用；站名 Archivo 900 + -0.02em 是全站最贵的排印资产。
5. **E-028 日期修复真实落地**：模块页/详情页/动态栏全部 YYYY-MM-DD，ISO 长串零泄漏（对比 F-9 旧证）。
6. **10-18 数据修复部分落地**：games 5 款真实条目+封面、collections 补真实条目+封面、后台删除按钮（E-027）、前台样式内容 hash（site.css?v=49671853 实证有效）。
7. **FEATURED 选取逻辑已治理**：40 字实质门槛 + 「标题即全文」空壳过滤 + 封面资格分级，首屏最大板块给讲得清楚的那篇。
8. **动效与阴影克制是体系性的**：全站交互只有 translateY(-2px)/颜色过渡/箭头 90° 旋转，阴影单 token——正因如此，蓝进度带/搜索橙红才显扎眼，修的时候往体系里收。
9. **响应式体系清晰**：992/576 两档主断点 + clamp 流式排版；上轮 375/768/1440 零横向溢出；长 URL 有 word-wrap 保护。
10. **文章页可访问性基础扎实**：h1 唯一 31/31、alt 100%、lang/viewport/charset 齐全、landmark 齐全、搜索 label 关联、焦点入输入框。
11. **CI 门禁八项**（语法/冒烟/E2E/token/账目/块往返/资源版本/日期），后台安全设计（HMAC 会话 + __Host- cookie + 401 保护）上轮已验。
12. **now/uses/links 三页是全站最像「人在经营的空间」**：内容真实、内链有效、空态诚实——Phase 3 规范文档应把这三页立为「档案页」范式。

---

## 五、需主人决策的开放项（为什么必须主人定）

1. **删 projects/collections 测试条目**（IA-1，P0）：数据层一键可删且不触发空模块，但删了首页精选栏从 2 条变 1 条——是否趁手补第二条真实项目，主人定。
2. **URL 漂移处置**（IA-3，P0）：Vercel dashboard 加 `TZ=Asia/Shanghai` 环境变量只能主人在网页端操作；且修后两个已上线 URL（/04/23）会变 /04/24，是否加重定向保护已分享外链，是发布策略决策。
3. **头像素材**（VD-7，P1）：`11.jpg` 是主人个人头像（`a90325e` 替换），**本条已消解**——无需换素材；仅剩可选项「是否改圆形 + 1px 描边」（A10，纯外观偏好）。
4. **favicon 素材**（VD-6，P1）：同上，需主人出图（建议砖红+墨/纸字母标）。
5. **真名是否上首屏**（F-2/H-1）：真名已公开属既有信息，但首屏是新露出位——按红线标注待主人确认；若上，建议副行形式「KASAI · 韩耀宇」。
6. **站名是否去 Blog 后缀**（N-3）：效果图基准「YaoZenO / Personal Space」无 Blog；品牌资产决策，只给依据不替定。
7. **Instagram 归属核实 + 是否补邮箱**（M-2）：instagram.com/yaozenx 是否本人账号访客无从判断；邮箱是最稳的联系方式但涉主人隐私暴露，必须主人定。
8. **C-8 纸面黄调**：建议维持 #f5f1e9（人格载体），备选 #f7f4ee 有定量数据，主观抉择。
9. **C-7 暗色模式**：建议保持关闭并在配置加「未校准勿启用」标注；若某天要开，需按纸面延伸值重新校准（accent 要提亮到 #d9724a）。
10. **motto 位置与 E-3 去重方式**：效果图基准在首页左下收尾（当前实现正确），建议维持；主题 about.intro 与 motto 同值属配置冗余，删哪处主人定。
11. **404 自动跳转**（UX-8）：10s 强制跳转是否保留，还是改为纯按钮。
12. **墙格与导航去重方向**（IA-8）：墙格不重复导航，还是导航把项目/游戏/收藏移入「更多」——两种都成立，审美决策。
13. **C-4 accent 拆分是否采纳**（VD-11）：给静态信息降级为中性 --info-mark，属设计语言演进，建议纳入 Phase 3 规范时一并定。

---

## 六、未验证项（如实标注）

1. **未运行浏览器**：所有交互（hover 下拉、九宫格展开、搜索弹窗、TOP ↑、回到顶部按钮、懒加载实际行为）均为代码/DOM/规范级核对，非实测；RL-1 留洞为 grid-auto-flow: dense 的确定性推导。
2. **未跑构建**：sitemap lastmod 漂移（旧 P2-8）未复验；16:02/16:03 的重新构建由主人在途触发，我只做了产物抽查（index/games/collections/now/uses/about/archives/404/tags/categories 均已核），未做全量 91 文件字节比对。
3. **Vercel dashboard 设置无法从本地验证**：IA-3 根因结论基于「Node 双时区实测复现 + 线上产物（URL/sitemap/404）三重比对 + GitHub Actions ubuntu-latest 默认 UTC」推断构建机为 UTC；未读 Vercel 构建日志。
4. **Core Web Vitals 未实测**：性能判断均为静态体积与加载顺序推断。
5. **效果图为结构/构成比对**：未做像素级 overlay；「与效果图基准不符」类结论（照片主卡、精选栏 more、品牌名无 Blog）基于结构比对，实际观感落差可能有偏差。
6. **头像 11.jpg 图像内容**未本轮查看（上轮视觉专家描述为柠檬黄底卡通举哑铃插画，主理人验过 md5）。
7. **Instagram 账号归属**未验证。
8. **后台管理面**（source/admin、api/）本轮未做设计审查（上轮工程向已覆盖：401 保护、无硬编码密钥）。
9. **审查期间工作区持续变动**（16:04/16:19 提交、games.yml 人称改动、test/mutate.js 出现）：数据诚信类结论已在 16:03 构建+最新源文件双重复核；若主人在此之后又有数据改动，IA-1 需以最新源为准。

---

## 附：红线遵守自查

本报告全部建议未越过红线：未建议纸底改冷白/纯白、未加科技蓝（反而建议清除三处冷色）、未引入第二强调色上链接/hover（VD-11 是给静态信息降中性，非新增彩色）、未建议首页回退卡片网格+大圆角+Hero 大图（圆角统一方向是 22px→12px 并明确不得扩散到首页入口格）、未补装饰性社会证明、未建议首屏身份域加 Emoji/图标/手写体（关于页既有颜文字属既有信息，仅列为待决策）、未建议评论/UGC/登录、未建议改 permalink 规则（IA-3 明确「保持 permalink 规则不变，只统一构建环境时区」）、未建议删分类标签数据或重写文章正文、未新增隐私露出建议（真名上首屏标注待主人确认）。

**报告完** ｜ 质量审查官 严过审（critique-reviewer） ｜ 2026-10-18 ｜ 纯只读审查，未改任何文件
