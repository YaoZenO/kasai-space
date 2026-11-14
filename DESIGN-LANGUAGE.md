# KASAI 个人主页 · 设计语言规范（DESIGN-LANGUAGE.md）

**版本**：V1.0（2026-10-18）｜ **状态**：待主人确认后作为唯一对齐基准
**定位**：后续所有设计与实施的唯一对齐基准。主人确认用；实施会话（agent）照此干活。
**读者**：未参与本轮审查的 agent 也能读懂并照做，不依赖对话上下文。
**依据**（本规范所有结论可回溯至以下文件）：

| 依据 | 用途 |
|---|---|
| `DESIGN-REVIEW-2026-10-18.md` | Phase 2 审查报告（VD/UX/IA/RL 编号问题清单、旧结论核验、做得好的部分） |
| `HOMEPAGE-REVIEW-2026-10-17.md` | §1.3 红线清单、§二 色彩体系 C-1~C-8 建议值 |
| `UI-AUDIT-2026-10-17.md` | §五 做得好的部分（token 单源、双字体轨、动效克制） |
| `source/css/site.css` | 现行 token 与组件规范层（V3.2，1617 行） |
| `themes/fluid/_config.yml` | 主题 color / font / fun_features 段（token 上游） |
| `PRD.md` | §7 视觉系统、§8 响应式与可访问性、§11 验收标准 |
| 效果图（`效果图.png` / `导航栏效果图.png`） | 首页结构基准（结构级比对，非像素级） |

**token 单一数据源声明**：本规范中的每个色值 / 圆角 / 字号，必须能在 `site.css` `:root`（L22-40）、`themes/fluid/_config.yml` color 段（L140-225，经 main.css `:root` L960 起输出）或既有组件规则中找到出处。找不到出处的新值一律标注 **【建议值 · 待主人确认】** 并附对比度算式。工程修复步骤（改哪个文件哪一行）不写进本规范，只规定 token 与规则；token 的定义位置在表中注明。

---

## 一、设计哲学与总纲

### 1.1 一句话定义

**这是一份排印在暖纸上的个人档案——「纸面 + 墨色 + 砖红」单色编辑体系（Editorial 纸面体系）。**

关键词与 PRD §7.1 一致：暖纸白（Warm Off-white）、近黑排版（Near-black Typography）、编辑式布局（Editorial Layout）、不对称网格（Asymmetric Grid）、大量留白（Generous Whitespace）、克制强调色（Restrained Accent）、轻度新粗野主义影响（Light Neo-brutalist Influence）、悬浮胶囊导航（Floating Capsule Navigation）。

它的对立面是：通用模板博客、卡片网格、科技蓝、统计面板式站点。三项既有资产定义了它的辨识度：**Archivo 900 紧字距站名 + 等宽元信息轨 + 不对称编辑网格**（DESIGN-REVIEW §一「特异性 4/5」）。

### 1.2 三条立身之本

| # | 立身之本 | 规则内容 | 出处 |
|---|---|---|---|
| 1 | **token 单一数据源** | 主题 `_config.yml` color 段 → main.css 变量 → `site.css` 只引用、不重定义；`--accent` 在 `site.css` 与后台 `source/admin/admin.css` 双端等值，由 `test/css-tokens.js` 锁定。**任何色值 / 圆角 / 字号的修改必须落到定义处，不得在组件规则里硬编码新值。** `site.css` 引用主题 token 时，变量名必须与 main.css 输出逐字一致（连字符），**禁止用 `var(--x, fallback)` 的 fallback 掩盖变量名笔误**——VD-1 的 `--post_link_color`（下划线）笔误正是该架构价值的反证 | UI-AUDIT §五.1；site.css L23-25 注释；VD-1 |
| 2 | **真实数据铁律** | 所有可见计数 = 真实条目数；不虚构项目、文章、统计数据、个人经历（PRD §2.2）；测试 / 示例数据不得进入生产构建 | UI-AUDIT §五.2；PRD §2.2；IA-1 |
| 3 | **无数据不渲染** | 数据为空的模块整段不渲染，不留占位空壳；类型无独立列表页时入口格降级为非链接元素；空态只允许出现在「容器本身有理由存在」的位置，且文案必须诚实 | UI-AUDIT §五.2；模块 yml 文件头注释 |

### 1.3 红线清单（逐条转为禁止规则）

以下每条都是**可 grep、可断言的禁止项**，违反即按缺陷处理，不进入「风格偏好」讨论。出处：HOMEPAGE-REVIEW §1.3 六条 + PRD §2.2 / §9.2。

| 红线 | 禁止规则 | 验收方式 |
|---|---|---|
| R-1 <br>（2026-10-19 修订） | 纸底 `#f5f1e9` 与墨 `#2a251d` 是人格载体，**不得改**；禁止引入「科技蓝」及任何冷色相大面积用色（冷色破口须清零，见 §2.3）。**新增豁免：允许每屏最多一个反色墨底整屏区块作为节奏锚点**——反相属同一色域，不是新色相。墨底上一切文字只用纸色及其透明度衍生 | grep 全站 CSS 不得出现 §2.3 禁止色表中的色值（暗色 _dark 配置段除外，见 §2.5）；全站墨底整屏区块每屏 ≤1 个 |
| R-2 <br>（2026-10-19 修订） | **从「token 数」改为「色相数」约束**：全站**交互**色相仍只有砖红一个（此条保留）。**允许装饰性非交互色块存在**，前提是：该色块上无任何交互元素、不承载 hover/focus 状态、不改变链接色。全站装饰色相总计 ≤2 个 | 全站仅 `--accent` 一个**交互**色 token；链接 / hover 色全部指向 `--accent` 或墨色；装饰色块内不得出现可点击元素 |
| R-3 <br>（2026-10-19 修订） | 禁止的是**均质卡片阵列**（图标 + 标题 + 文字 ×N 的同款卡），不是「有图」本身。**允许：非均质拼贴、跨列、尺寸不等、无阴影或极弱阴影、圆角 ≤12px。** 禁止项收窄为三条：① 均质阵列 ② 投影浮起 ③ Hero 大图横幅 | 首页不得出现统一等大的卡片阵列；首页入口格圆角 ≤12px；无全宽 Hero 大图；拼贴块尺寸须不等 |
| R-4 | **禁止补装饰性社会证明**：不开 PV/UV 大数字，不加「共 XXX 篇文章」「最后更新于」「访问量」类统计露出 | grep 模板不得出现 busuanzi / leancloud / umami 计数渲染；页脚 statistics 保持 `enable: false` |
| R-5 | **禁止在首屏身份域加 Emoji、图标符号或手写体装饰。** 桌面身份域只允许：头像（或 monogram）+ 站名 + tagline + CTA 组（身份词铭牌 A9 已于 2026-10-21 被主人整块撤回，见 §10） | 身份域 DOM 内不得出现 emoji / 手写体 font-family；关于页既有颜文字属既有信息，去留待主人确认 |
| R-6 | **禁止评论 / 留言 / UGC / 用户登录类功能。** 站点未备案，PRD §2.2 已列为非目标 | `_config.yml` 全部 comments 段保持 `enable: false` |
| R-7 | **禁止改变 permalink 规则**（`:year/:month/:day/:title/`）。URL 日期漂移的修法是统一构建环境时区（IA-3），不是改规则 | `_config.yml` L22 permalink 行不得改动 |
| R-8 | **禁止删除分类 / 标签数据；禁止重写文章正文。** 文章正文、永久链接、发布日期、已有元数据受保护（PRD §9.2） | 分类 / 标签数据文件与文章 Markdown 正文 diff 为空 |
| R-9 | **禁止替主人表态**：文案 / 口号 / 品牌名 / 露出位只写规则框架与占位，决策项一律进 §10 待确认清单 | 规范与实施产物中不得出现未经确认的新增对外文案 |

---

## 二、色彩体系

### 2.1 色彩 token 总表

定义位置两处：**主题段** = `themes/fluid/_config.yml` color 段（编译进 main.css `:root`，L960 起）；**site 段** = `source/css/site.css` `:root`（L22-40）。「对比度」列为该色作为**文字色**时对最常见底色的 WCAG 比值（本规范复算，与审查报告实测一致）。

| Token | 值 | 定义位置 | 用途 | 使用位置 | 对比度（文字场景） |
|---|---|---|---|---|---|
| `--body-bg-color` | `#faf9f5` 纸底 | 主题段 L143 | 全站页面底色，「纸」 | 全站 | —（基准底色） |
| `--board-color` | `#fffefb` 面板 | 主题段 L175 | 浮层底：下拉、搜索弹窗、模块卡（VD-5 改后） | 导航下拉、`#modalSearch`、`.module-card` | 墨字 18.28:1 |
| `--text-color` | `#141413` 墨 | 主题段 L165 | 正文 / 标题 / 2px 顶线 / 反色块底 | 全站 | 对纸底 **17.50:1**；对面板 18.28:1 |
| `--sec-text-color` | `#6b6862` 次级 | 主题段 L170 | 摘要 / 日期 / 说明 / 空态文案 | 全站 | 对纸底 **5.27:1**；对面板 5.50:1 |
| `--line-color` | `#cfc6b2` 分隔线 | 主题段 L205 | 1px hairline / 表格线 | 全站 | 1.51:1（非文字，禁止作文字用） |
| `--accent` | `#b0482a` 砖红 | **site 段 L25**（与 admin.css 等值，test/css-tokens.js 锁定） | 全站唯一交互强调色 | hover / focus / active / 当前态 / kicker | 对纸底 **5.24:1**；对面板 5.47:1 |
| `--navbar-bg-color` | `rgba(250,249,245,.88)` | 主题段 L150 | 菜单胶囊底（纸色半透明） | 导航胶囊 | — |
| `--navbar-text-color` | `#141413` | 主题段 L155 | 导航文字 | 导航 | 同墨 |
| `--link-hover-color` | `#b0482a` | 主题段 L195 | 主题链接 hover（与 accent 同值） | 全站链接 hover | 同 accent |
| `--block-yellow` | `#e2bc6a` | **site 段 L31** | 项目入口格底 | `.cell-yellow` | 格内**仅墨色** 10.4:1 |
| `--block-orange` | `#c0491f` | **site 段 L32** | 游戏入口格底 | `.cell-orange` | 格内**仅纸色** 4.73:1；墨字 3.70:1 ✗ |
| `--font-display` | Archivo 栈 | site 段 L28 | 展示轨（见 §3.1） | 全站标题 / 站名 | — |
| `--font-mono` | Cascadia Code 栈 | site 段 L35 | 等宽元信息轨（见 §3.1） | 全站元信息 | — |
| `--site-float-shadow` | `0 12px 32px -14px rgba(20,20,19,.28)` | site 段 L38 | 全站唯一阴影 token | 胶囊 / 下拉 / 弹窗 / 模块卡 hover | — |
| `--site-chip-border` | `rgba(20,20,19,.10)` | site 段 L39 | 浮层 1px 边界 | 胶囊 / 弹窗 | — |
| `--surface-ink` | `#141413` | **site 段 L57**（2026-10-19 新增） | 墨底整屏区块背景（§5.16） | `.ink-band` | 与 `--text-color` 等值，单独命名以区分「墨」与「墨底面」 |
| `--on-ink` | `#faf9f5` | **site 段 L58** | 墨底区块主文字 | `.ink-band` | 对 `--surface-ink` **17.50:1** |
| `--on-ink-sec` | `rgba(250,249,245,.72)` | **site 段 L59** | 墨底区块次级文字（计数 / 类型词 / 日期） | `.ink-band` | 复合后 **9.40:1** ✓ |
| `--on-ink-line` | `rgba(250,249,245,.16)` | **site 段 L60** | 墨底区块 hairline | `.ink-band .feed-row` | 非文字线；纸面 `--line-color` 对墨底仅 1.62:1，**禁止透传** |

**fallback-only token（VD-5：只以 `var(--x, fallback)` 存在，`:root` 未定义）必须补齐**，补齐值与使用口径：

| Token | 补齐值 | 用途 | 备注 |
|---|---|---|---|
| `--r-tile` | `12px` | 封面图 / 模块卡圆角 | 原 fallback 22px 废止（VD-5）；**不得扩散到首页入口格**（红线 R-3） |
| `--r-card` | `12px` | 媒体墙图片圆角 | 与全站一致 |
| `--cream` | 复用 `#fffefb` | 模块卡底 | 原 fallback `#f9f6f1` 废止——消灭第三纸色（§2.6） |
| `--ink-warm` | `#141413` | 墨的别名 | 与 `--text-color` 等值 |
| `--cream-on-dark` | `#faf9f5` | 墨底反色块上的字 | 与 `--body-bg-color` 等值 |
| `--line-strong` | `rgba(20,20,19,.24)` | 模块卡 hover 边框、归档精选行顶线 | — |
| `--accent-soft` | `rgba(176,72,42,.12)` **【建议值 · 待主人确认】** | 实心 tag 底、引用竖边 | **注意：现行 L1554 用 fallback `.12`、L1612 用 fallback `.28`，两处视觉不同；补齐时必然改变其中一处。定值前须主人过目**（本规范新发现，见附录 B-2） |

### 2.2 块色与反色块：「谁能用什么字」

| 底色 | 允许的文字色 | 对比度 | 禁止的文字色 | 原因 |
|---|---|---|---|---|
| 黄块 `#e2bc6a` | 墨 `#141413` | **10.4:1** ✓ | 纸 `#faf9f5` | 1.71:1，任何样式回退都踩雷（C-3） |
| 橙块 `#c0491f` | 纸 `#faf9f5` | **4.73:1** ✓ | 墨 `#141413` | 3.70:1 ✗——**不得照黄格模式把橙块改成墨字** |
| 墨底反色块 `#141413`（主卡 / CTA solid / active 胶囊 / 分页 active） | 纸上 `#faf9f5` 及其透明度衍生 `.72 / .78 / .88` | 17.50:1；复合后 9.40 / 10.9 / 13.0:1 ✓ | accent（3.34:1 ✗）、次级（3.32:1 ✗）、info-mark（3.08:1 ✗） | 反色块上一切非纸上色系文字均不达 AA |
| 照片格 / 主卡照片形态 | 纸上白字 + 渐变 mask 保底 | 取决于封面图明度（见下） | 移除 mask 后无保底 | mask 是唯一兜底，见 §5.3 照片格规则 |

**照片格对比度保底规则（本规范新增，审查报告未覆盖，见附录 B-5）**：照片格 / 照片主卡的文字对比度取决于封面图明度，静态色值无法保证。规则：① 照片格必须保留 `.wall-cell-mask` / `.wall-feature-mask` 渐变（底部 80% / 82% 墨色遮罩），**不得移除或削弱**；② 选用高明亮度封面图（白底、雪景、过曝）时，须人工核对文字可读性，不达标则换图或改用排版格形态。

### 2.3 禁止出现的颜色（冷色破口清单）

以下色值**不得出现在纸面体系的任何文字、边框、背景、进度元素上**。每行附现存位置与出处；「状态」列标明该破口截至 2026-10-18 审查是否仍在。

| 禁止色值 | 名称 | 出现位置（现存） | 状态 / 依据 |
|---|---|---|---|
| `#29d` | Material 蓝 | nprogress 进度条（`public/lib/nprogress/0.2.0/nprogress.min.css` 写死；`_config.yml` L124 是死配置，颜色未下发） | 仍存在，VD-2 |
| `#0366d6` | GitHub 蓝 | 文章页链接（`--post-link-color`，主题段 L190；`site.css` L1035 fallback） | 仍存在，VD-1 |
| `#2c3e50` | 蓝灰 | 文章页正文（`--post-text-color`，主题段 L180） | 仍存在，VD-1 |
| `#1a202c` | 冷黑 | 文章页标题（`--post-heading-color`，主题段 L185） | 仍存在，VD-1 |
| `#ff4500` | orangered | 搜索命中词高亮（main.css 编译输出 `.search-word`） | 仍存在，VD-3 |
| `#0d47a1` | 深蓝 | 搜索结果标题 3px 左边框（main.css 编译输出） | 仍存在，VD-3 |
| `#181c27` `#1f3144` `#252d38` `#435266` `#1589e9` `#30a9de` `#364151` `#46647e` | Fluid 原厂暗色冷蓝组 | 曾位于 `_config.yml` 各 `*_dark` 配置项 | **已清除**（2026-11-09 全量校准，见 §2.5），C-7 |
| `#BBBBEE` → `#337ab7` | 标签云冷蓝渐变 | `_config.yml` L1026-1027（`tags.ejs` 读取但未使用，当前为死配置） | 潜在（本规范新发现，附录 B-7）：恢复字号渐变时不得同时恢复渐变色 |
| `#f8f9fa` / `#f2f3f5` | 主题默认冷灰 hover 底 | `_config.yml` L200 / L223（`link_hover_bg_color` / `button_hover_bg_color`） | 观察项（本规范新发现，附录 B-8）：纸面组件一旦回退主题 hover 态即露出冷灰，按缺陷处理 |
| `#c4c6c9` / `#a6a6a6` | 滚动条中性灰 | `_config.yml` L210 / L214 | 观察项：不属本轮整改范围，维持现状；不得扩散到滚动条以外 |

**旧结论修正（如实记录）**：C-2 中「代码块底 `#f6f8fa`」子项经 VD-10 复核**不成立**——现行 highlight.css 无 `.hljs` 背景硬编码规则，代码块与纸面存在轻微色温差但无白底规则。代码块底色优化（`pre` 底 `#fdfbf6` + 1px `--line-color`）为可选项，标注待确认（§10-A7）。

### 2.4 accent 使用纪律：交互色与静态信息分流

`--accent` 的定位是**交互色**（稀缺强调），不是装饰色。现行它承担约 39 处使用，其中约 12 处是静态信息（计数 / 分类名 / 类型词 / kicker），已被稀释成「淡红小字」（VD-11、C-4）。

**分流规则（C-4 / VD-11，建议值待主人确认后生效）**：

1. **交互态**（hover / focus-visible / active / 当前页 / 链接强调）：保持 `--accent`；
2. **静态信息**（`.col-count`、`.post-cat`、`.feed-type`、`.cat-count`、`.tag-chip-count`、`.post-head-tags a`、tocbot-active-link 等约 12 处）：迁移到中性色。首选 `--sec-text-color`；需要与正文区分时用新增 `--info-mark: #6b6255` **【建议值 · 待主人确认】**（对纸底 **5.32:1** ✓，对面板 5.80:1 ✓）；
3. **kicker 例外**：`.page-head-kicker` / `.post-head-kicker` 每页仅 1 处，保留 `--accent`——它是「这一页是什么」的仪式位，不是被稀释的小字；
4. **验收口径**：迁移后任取一页截图，砖红出现次数可数、每次都有交互含义；静态信息区（三栏计数、标签计数）为中性色。

**这不是引入第二彩色**（红线 R-2 不违反）：`--info-mark` 是中性墨阶的补充，`#6b6255` 与次级 `#736a5c` 同色相，仅明度略深。

### 2.5 暗色模式规则

> **2026-11-09 主人确认启用，全量校准完成。** `dark_mode.enable: true`、`default: auto`；
> 唯一对齐基准 `DESIGN-DARKMODE-PROPOSAL-2026-11-09.md`（D1–D13 整组采纳）。
> 状态机是**两态 + 三层决策**（2026-11-11 Phase 4A 修订）：`手动值 > 当地日出日落 > 系统偏好`；
> 仍是 light / dark 两态，系统偏好保留为最后兜底，不新增第三态切换器、不新增任何 UI。
> 存储键 `Fluid_Color_Scheme` 只写 `light` / `dark`，没有 `auto`、没有第三态、不按设备本地钟点兜底；
> 时间层用独立 DOM 标记 `data-sun-scheme` 施加明暗，绝不写 `data-user-color-scheme`
> （写它会屏蔽 `:root:not([data-user-color-scheme])` 分支，让系统兜底彻底失效）。
> 时间层的判定在独立模块 `themes/fluid/source/js/sun-scheme.js`，端点 `/api/sun-times` 只读派生结果，
> 缓存只写 `date` / `sunrise` / `sunset` / 坐标指纹四个字段；视觉与过渡口径沿用下文本节全部条款。
> 暗态是「暖纸 + 轻玻璃 V6.5」的同一色域反相延伸，不是新皮肤；全部不透明色值 `R > G > B`。

1. **Fluid 原厂 `_dark` 冷蓝组一个都不能用**（§2.3 的 8 值，以及 `#c4c6c9` / `#a7a9ad` /
   `#d0d0d0` / `#687582` / `#9da8b3` 等冷灰）。C-7 的「顺手开启得到蓝黑站点」风险已由
   `test/darkmode-e2e.js` 的冷色断言锁死，不再靠注释提醒。
2. **主题段 19 个暗值**（`themes/fluid/_config.yml` color 段 17 项 +
   `themes/fluid/source/css/_variables/base.styl` 的 `$highlight-bg-color-dark` /
   `$inlinecode-bg-color-dark` 2 项）：

| 语义键 | 暗值 | 语义键 | 暗值 |
|---|---|---|---|
| `body_bg_color_dark` | `#1a1814` | `board_color_dark` | `#242019` |
| `text_color_dark` | `#e5ded2` | `sec_text_color_dark` | `#b3aa9c` |
| `post_text_color_dark` | `#e5ded2` | `post_heading_color_dark` | `#e5ded2` |
| `post_link_color_dark` | `#d97757` | `link_hover_color_dark` | `#eea883` |
| `link_hover_bg_color_dark` | `rgba(217,119,87,.12)` | `line_color_dark` | `#413a30` |
| `navbar_bg_color_dark` | `rgba(36,32,25,.62)` | `navbar_text_color_dark` | `#e5ded2` |
| `subtitle_color_dark` | `#b3aa9c` | `scrollbar_color_dark` | `#4a4238` |
| `scrollbar_hover_color_dark` | `#6b6255` | `button_bg_color_dark` | `transparent` |
| `button_hover_bg_color_dark` | `rgba(229,222,210,.06)` | `highlight_bg_color_dark` | `#242019` |
| `inlinecode_bg_color_dark` | `rgba(229,222,210,.10)` | | |

   `color-schema.styl` 的 `dark-colors()` 中 `img` 压暗降为 `brightness(.97)`（照片格已有 mask，
   .9 是二次压暗）；`.license-box` 底由冷蓝灰改 `rgba(36,32,25,.35)`。

3. **`site.css` 层暗值**（§15 成对双分支：`:root:not([data-user-color-scheme])` 走 `@media
   (prefers-color-scheme: dark)`，`[data-user-color-scheme="dark"]` 走 `@media not print`）：

| token | 暗值 | token | 暗值 |
|---|---|---|---|
| `--accent` | `#d97757` | `--accent-strong` | `#eea883` |
| `--info-mark` | `#8f877a` | `--accent-soft` | `rgba(217,119,87,.12)` |
| `--cream` | `rgba(36,32,25,.62)` | `--site-chip-border` | `rgba(229,222,210,.10)` |
| `--site-float-shadow` | `0 12px 32px -14px rgba(8,6,4,.65)` | `--line-strong` / `--rule` | `rgba(229,222,210,.22)` |
| `--block-yellow` | `rgba(217,119,87,.16)` | `--block-orange` | `#d97757` |
| `--surface-ink` | `#e5ded2` | `--on-ink` | `#1b1712` |
| `--on-ink-sec` | `rgba(27,23,18,.72)` | `--on-ink-line` | `rgba(27,23,18,.16)` |
| `::selection` 底 | `rgba(229,222,210,.18)` | `html` 底 | `#1a1814` |

   `--cream-on-dark: #fdfaf4` 与 `--ink-warm: #1b1712` **两态保持不动**；两档不透明纸色只有
   `#1a1814`（body）与 `#242019`（面板）。`.ink-band` 暗态反相为亮纸块 + 墨字；`.cell-orange` /
   `.cta-solid` / 活动分页 / 复制 toast / 二维码浮层一律亮纸底墨字。
   `.cal-page` 作用域内 5 个变量与 `.cal-pinyin` **必须同步覆盖**（否则节假日 / 生肖 / 节日详情页
   全族失效）；12 个 `--fs-fig-*` 纹样主色一个不改、只许出现在 `.fs-figure--css` 规则内。
   光场四色透明度压到 `.07–.10`、渐变底 `#1a1814 → #1c1916 → #1f1b17`；照片 mask 渐变结构
   保持不削弱。字体 / 字阶 / 间距 / 圆角 / `aspect-ratio` 暗色零改动；过渡只给颜色类属性 ≤200ms。

4. **单源与后台**：浅色 `:root` 的 `--accent: #a8482c` 保持原值与首个定义位置，
   `test/css-tokens.js` 不受影响；`source/admin/` 本次不改（D13）、不 bump 版本号；
   前台缓存破坏由内容 hash 自动生成。
5. **配置源与上线链路（架构约束：主题目录仍是 Astro 输入源，不得误删）**：
   `dark_mode.enable` 的定义位置仍是 `themes/fluid/_config.yml`；消费方是
   `src/lib/site-config.ts` l. 33（取出 `darkModeEnable`，供 Astro 页面条件渲染）与
   `tools/prepare-assets.mjs` l. 61（把该配置喂给 `hexo-config()` 的 styl 编译上下文，并从
   `themes/fluid/source/` 复制 `main.styl` / `highlight*.styl` / `color-schema.js` 等静态资源）。
   线上一直走 Astro：`vercel.json` 的 `buildCommand: npm run astro:build`、
   `outputDirectory: dist`；验收产物口径是 `dist/` 与 `static-public/`。
   提交 `724fc3f` 下线的是 **Hexo CLI 与页面生成器**，不是主题目录——`themes/fluid/` 仍是 Astro 的
   配置源、styl 源与静态资源源，**不得因「Hexo 已下线」而整块删除**；旧 Hexo CLI 产物目录只作源码
   可编译性检查，不再是暗色模式的验收对象。
   4 个 EJS 模板（`layout.ejs` / `head.ejs` / `css.ejs` / `nav.ejs`）
   降级为兼容层、不再验收，但同样保留。
   防复发：`test/darkmode-e2e.js` 的「配置源存活」断言锁死 `_config.yml` 的
   `dark_mode.enable === true`、19 个暗值齐全、`src/lib/site-config.ts` 对 `themes/fluid/_config.yml`
   的引用、`tools/prepare-assets.mjs` 的 `THEME` 常量，以及 6 个构建输入文件存在；任一被删即 FAIL。

### 2.6 第三纸色消除规则

- 全站纸色只允许**两档**：纸底 `#f5f1e9`、面板 `#fdfbf6`。第三个纸色值 `#f9f6f1`（与纸底仅 1.05:1）废止，模块卡等一律复用 `#fdfbf6`（VD-5 / C-5）。
- **层级不靠色差，靠线与反色**：纸底与面板仅差 1.05:1，任何「换底色表示分层」的做法无效。分层语言见 §4.3。
- **验收口径**：grep 全站 CSS 与主题配置，纸色 HEX 只出现 `#f5f1e9` / `#fdfbf6` 两个值（`rgba(245,241,233,.88)` 胶囊底与 mask 衍生除外）。

---

## 三、字体规范

### 3.1 三轨排版

| 轨道 | Token / 栈 | 用途 | 禁用场景 |
|---|---|---|---|
| **展示轨** | `--font-display`：`"Archivo", "Arial Black", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`（latin 子集 34KB 自托管 + swap + unicode-range） | 站名等品牌字与大写字母展示；当前唯一用点是 `.identity-name`（site.css L318） | 不得用于中文长文本；不得用于正文；紧字距只随拉丁字符（unicode-range 保证中文回退黑体，不得移除该机制） |
| **等宽元信息轨** | `--font-mono`：`"Cascadia Code", "JetBrains Mono", Consolas, "SF Mono", Menlo, "Courier New", monospace` | 日期、计数、kicker、外链标注、tag 行、目录标题、归档年份 | 不得用于正文长文；不得用于栏目标题 / 文章标题 |
| **正文轨** | 系统黑体：主题 `font.family` 为空 → 继承 Bootstrap `--font-family-sans-serif` 系统栈（`-apple-system / Segoe UI / Roboto / Helvetica Neue / Arial / Noto Sans` + 系统中文字体回退） | tagline、正文、列表行标题、摘要、描述 | 不得用于 kicker / 计数 / 日期（那是等宽轨职责） |

**混用验收口径**：任一文字元素的 `font-family` 必须落在三轨之一；不得出现第四种字体栈；展示轨元素 grep 只得 `.identity-name` 一处（新增须经 §10 确认）。

### 3.2 字阶表

基准：主题 `font.font_size: 16px`，故 1rem = 16px。`clamp()` 为流式字号，桌面 / 移动自适应。

| 级别 | 字号 | 字重 | 行高 | 字距 | 轨道 | 用在哪 |
|---|---|---|---|---|---|---|
| D0+ 主卡标题档 | `clamp(2rem, 3.2vw, 2.9rem)`（token `--fs-hero`） | 700 | 1.12 | — | 展示 | `.wall-feature-title`（V4.0：900→700、3.4rem→2.9rem，不再靠单点超大字号制造层级，仍为卡内最大字但不越过站名一档；演进记录见 site.css token 注释） |
| D0 站名 | `clamp(2.4rem, 4.4vw, 3.6rem)` | 800 | 1.1 | **-0.02em** | 展示 | `.identity-name`（V4.0：900→800、4.6rem→3.6rem） |
| D1 页头标题 | `clamp(1.9rem, 3.6vw, 2.6rem)` | 700 | 1.18 | — | 展示 | `.page-head-title`（文章页等） |
| D1- 模块列表页标题 | `clamp(1.9rem, 3.6vw, 2.6rem)` | 700 | — | — | 展示 | `.page-head-plain .page-head-title`（V4.0 与 D1 合流为同一档） |
| D2 文章标题 | `clamp(1.8rem, 3.2vw, 2.35rem)` | 700 | 1.24 | — | 展示 | `.post-head-title` |
| D3 主卡标题（已停用） | `clamp(1.9rem, 3.6vw, 3rem)` | 900 | 1.18 | — | 正文轨 | 原 `.wall-feature-title` 档位；2026-10-19 起该元素改走 `--fs-hero`（D0+），本档已无用点，留档备查 |
| D4 栏标题 | `clamp(1.15rem, 1.9vw, 1.35rem)` | 700 | — | — | 展示 | `.col-title`、详情页 `rich-section h2` |
| D5 归档年份 | 1.5rem | 700 | — | 0.06em | 等宽 | `.archive-year-title` |
| B0 全站基准 | 继承主题 16px | 400 | **1.7** | — | — | `body`（2026-11-04 新增）：兜住所有没写 `line-height` 的元素；标题另降 1.3 |
| B1 正文 | 1.0625rem（17px） | 400 | 1.75 | — | 正文轨 | 正文轨全部长文（§4.2） |
| B2 行标题 | `clamp(1rem, 1.5vw, 1.15rem)` | 700 | **1.55** | — | 展示 | `.post-title`、`.pick-title`（1.45→1.55，2026-11-04）；`.archive-row-title` 单行不折，仍 1.5 |
| B3 次级正文 | 1.02rem / 0.87rem / 0.85rem | 400 | 1.9 / 1.75 / 1.7 | — | 正文轨 | tagline / 行描述 / 摘录描述 |
| M1 kicker | 0.76rem | 700 | — | 0.22em | 等宽 | `.page-head-kicker`、`.post-head-kicker`（每页 1 处） |
| M2 元信息 | 0.8rem / 0.78rem / 0.76rem | 400 | — | 0.04–0.16em | 等宽 | 日期、meta、tag、导航品牌 |
| M3 计数 / 小字 | `clamp(1.7rem, 2.6vw, 2.3rem)`（大数字）/ 0.75rem（小字，见 §3.3） | 700 | 1.1 / — | — | 等宽 | `.wall-cell-count`、`.tag-chip-count` |
| C1 控件文字 | 0.92rem | 600 | 1.5 | — | 正文轨 | `.cta-solid`、`.cta-link` |

### 3.3 中文 12px 下限（硬规则）

**所有承载中文的可见文字不得低于 0.75rem（12px）。** 现行低于下限的类名清单（VD-4 只点名了第一处，本规范逐类补齐，见附录 B-6）：

| 类名 | 现值 | 承载内容 | 处置 |
|---|---|---|---|
| `.wall-cell-item` | 0.74rem（11.84px） | 入口格条目名（中文） | 升 **0.8rem / 700**（VD-4 定点） |
| `.wall-cell-tag` | 0.74rem | 入口格 tag 行（模块名+计数，中文） | 升 0.75rem |
| `.feed-type` | 0.74rem | 动态栏类型词（中文） | 升 0.75rem |
| `.feed-date` | 0.74rem | 动态栏日期（数字） | 升 0.75rem |
| `.tag-chip-count` | 0.74rem | 标签计数（数字） | 升 0.75rem |
| `.detail-tag` | 0.74rem | 详情页标签（中文） | 升 0.75rem |
| `.pick-ext` | 0.7rem | 外链标注 | 升 0.75rem |
| `.archive-picks .pick-meta` | 0.7rem | 精选摘录 meta | 升 0.75rem |

**验收口径**：grep `site.css` 中 `font-size` 小于 `0.75rem` 的规则数为 0。

### 3.4 日期格式统一规则

1. 全站可见日期一律 `YYYY-MM-DD`（Hexo `date_format`，`_config.yml` L86）。模块条目日期走 helper `fmtItemDate`（AGENTS.md §5.2 / E-028）。
2. 文章页元信息现行 `format: "LL a"`（`_config.yml` L615）渲染为「2026年10月18日 晚上」，与全站等宽 `YYYY-MM-DD` 轨不一致（UX-9）——须改为 `YYYY-MM-DD HH:mm` 或 `config.date_format`。
3. **禁止**：ISO 长串（`2026-10-15T00:00:00.000Z`，F-9 已修，保持）、裸 `Date` 对象进 `<%= %>`（AGENTS.md §5.2）、「X 天前」相对时间与绝对日期混用。
4. `/now/` 页「更新于」日期：由文件 mtime 或 front-matter `updated` 字段渲染，**禁止手写**——手写日期忘改即主动说谎（A-2）。

### 3.5 排印资产保护条款

1. **站名排印三件套受保护**：Archivo 900 + `letter-spacing: -0.02em` + `clamp` 流式字号（site.css L316-326）。任何改站名、改字重、改字距的提案，先过本条；N-3「站名去 Blog」待主人确认——若改，只改字符串，不动排印三件套。
2. 中文不进紧字距的 unicode-range 机制不得移除。
3. `::selection` 已于 2026-10-19 按 H-4 采纳改为墨色 `rgba(42,37,29,.12)`（选中是阅读行为，不是交互行为，砖红只留给交互与强调）。原 `rgba(176,72,42,.18)` 已停用。
4. 等宽轨的 `letter-spacing` 既有分工（kicker 0.22em / 元信息 0.04–0.08em）不得拉平成单一值。

---

## 四、间距标准

### 4.1 间距标尺

现行间距值域（从 site.css 归纳）：**4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 32 / 40 / 48 / 56 / 72 / 96 px**。

- 组件内微间距（<16px 的 padding / gap）：允许 4–14 区间（含 14px 墙格专用 gap）；
- 组件内边距 / 行节奏：导航项 `0.42rem 0.95rem`、CTA `0.66rem 1.45rem`、列表行 `0.95–1.15rem` 上下；
- 区块节奏：hero 间距 `clamp(2rem, 4vw, 4rem)`、栏间距 `clamp(2.2rem, 4vw, 3.6rem)`、大节距 `clamp(3rem, 7vh, 5rem)`；
- **新间距必须落在上述值域**；禁止魔法数（如 13px、17px、22px 间隔）。
- **验收口径**：新增规则中的间距值可在值域表中找到，或为 `clamp()` 流式表达。

### 4.2 正文轨规格与适用范围（堵住 VD-9 漏洞）

**正文轨 = `max-width: 38em`（≈646px @17px）+ `font-size: 17px` + `line-height: 1.75` + 墨色**（site.css L1022-1032 设计语言定稿）。

**适用范围（全覆盖，一个都不能少）**：

| 页面 | 命中选择器 | 状态 |
|---|---|---|
| 文章页 | `.post-content .markdown-body` | 仍命中选择器；但 2026-11-02 起文章页为**宽度例外**：正文放宽至主列全宽 ≈780px（≈45.9em），与标题右缘同轨（主人拍板「正文往右走」），不再是 646px。仍须先中和主题 `10%` 左右 padding（RL-3）。**文章页的验收宽度改查 780px** |
| 关于页 | `.about-body .markdown-body` | 已命中（646px） |
| 模块详情页（项目 / 游戏） | `.about-body .markdown-body` | **不命中**——模板把两个 class 放在同一元素（VD-9），实际落到主题 16px/1.6 + `#2c3e50` 全宽基线；须改为嵌套结构后命中 |
| 档案页（now / uses / links） | `.about-body .markdown-body` | 已命中（与 about.ejs 同构） |

**基准行高（2026-11-04）**：`body { line-height: 1.7 }`，标题轨 `h1–h6 { line-height: 1.3 }`。
主题 main.css 只声明字体栈、不声明行高，此前凡没写 `line-height` 的元素全部落在浏览器
`normal`（≈1.2）——中文方块字没有上下伸部留白，1.2 就是「字挤在一起」。
新增组件时：正文长文一律显式写 1.75 以上；图注、小字注释不低于 1.65；
只有单行按钮、徽标、标签这类不折行的控件可以用 1.4–1.5。

**规则**：任何长文正文容器必须命中 `.about-body .markdown-body` 或 `.post-content .markdown-body` 之一。
**验收口径**：构建后抽查关于页、`/games/<任意 slug>/`、`/projects/<任意 slug>/`、`/now/` 四个页面的正文计算宽度均为 646px、字号 17px、行高 1.75；文章页为宽度例外（2026-11-02 主人拍板放宽到主列全宽 ≈780px，与标题同轨），字号行高口径不变。

### 4.3 纸面层级语言（不靠色差）

层级表达只有三种手段，按此优先级使用：

1. **2px 墨色顶线**（`--text-color`）：列表组分界。用点：`.post-list`、`.pick-list`、`.feed-list`、`.cat-group`、`.archive-year-title::after`、`.archive-picks` 首行；
2. **1px hairline**（`--line-color`）：行分隔、表格线、卡边框；
3. **反色墨块**（`#2a251d` 底 + `#f5f1e9` 字）：主卡、CTA solid、导航 active 胶囊、分页 active。

**禁止**：用底色深浅表示层级（纸底与面板仅 1.05:1，无效）；同一组件同时堆叠边框 + 阴影 + 圆角 + 强调色（PRD §7.5）。面板 `#fdfbf6` 只用于浮层，且必须同时带 1px `--site-chip-border` 或 `--line-color` 边界。

### 4.4 圆角标尺

| 档 | 值 | 用在哪 |
|---|---|---|
| 0 | — | 正文轨、列表行、搜索输入框（底线形态） |
| 6px | `.cta-solid` | 首页主 CTA |
| 8px | 下拉项、`.pick-img`、分页项 | 小控件 |
| **12px** | **入口格、主卡、模块卡（VD-5 改后）、封面图、下拉浮层、搜索弹窗、媒体墙图** | 全站标准容器圆角 |
| 999px | 导航胶囊、`.tag-chip`、`.detail-tag`、`.detail-links` | 全圆角形态 |
| 1px | `.rich-section h2::before` 竖标 | 装饰条 |

- **22px 废止**（VD-5）：模块卡 / 封面图从 22px 降 12px，对齐全站；**不得扩散到首页入口格**（红线 R-3）。
- **头像 = 圆形 50%**（A10，2026-10-21 主人确认）：圆角标尺的**唯一例外**。头像从 12px 方卡改为圆形 + 1px 描边（`--line-strong`）+ 去阴影；84px → 96px 是面积补偿（圆面积 = 方形的 π/4 ≈ 0.785，96 = 84/√0.785，保持视觉重量等价）。
- **验收口径**：grep `border-radius` 值 ∈ {0, 6px, 8px, 12px, 999px, 1px, 50%}；其中 **50% 只允许出现在 `.identity-avatar` 一处**；`22px` 出现次数为 0。

### 4.5 容器与页首留白

- 页面容器：`width: min(1200px, 100% - clamp(36px, 8vw, 96px))`（`.home-wrap` / `.post-wrap`）；
- 页首留白：`clamp(104px, 14vh, 150px)`（避让悬浮胶囊导航，`.home` / `.paper-page` 同值）；
- 文章页双栏：`.post-side` 230px + `.post-main-col` `max-width: 780px`；RL-3 修复后关于页与文章页同轨。宽度沿革：2026-11-01 曾把 `.post-content` 整列收窄到 646px 去对齐正文（主人截图反馈标题宽正文窄），2026-11-02 被主人推翻——「应该让下面往右走，而不是让目录往左边走」，正文轨在文章页放宽到主列全宽 ≈780px，标题与正文右缘一刀齐；646px 定稿继续适用于关于页等其余纸面页；
- 内容墙：`grid-auto-rows: minmax(158px, auto)` + `gap: 14px`。

---

## 五、组件风格

每个组件规定：构成 / 状态（默认 · hover · active · focus-visible · 禁用 · 空态）/ 可访问性。类名以 `site.css` 现行规则为准。

### 5.1 导航胶囊（`_partials/site/nav.ejs` + site.css §3.1 / §3.2）

- **构成**：三段式 grid（`1fr auto 1fr`）——左「裸品牌」文字（`.site-brand`，800 字重，+0.02em，hover 变 accent）；中「菜单胶囊」（`.site-nav-capsule`：999px、纸色 0.88 半透明底、backdrop blur、1px chip border、`--site-float-shadow`）；右「裸搜索图标 + 移动端汉堡」（去 chip，方案 C）。
- **下拉「更多」**：纸面浮层（`#fdfbf6` + 12px 圆角 + chip border + float shadow）；**`margin-top: 0` 是防 hover 断链的既有踩坑记录，不得加间隔**（site.css L123-126 注释）。
- **状态**：hover / focus-visible → accent 字 + `rgba(42,37,29,.05)` 底；**当前页 → 墨底实心胶囊 + 纸上字（形状 + 颜色双编码）**；「更多」父项按子链接匹配补 active（IA-11，访问 /now/ /links/ 时须有「你在这里」）。
- **移动端九宫格**：纸底 + `rgba(42,37,29,.045)` 格底 + hairline；关闭态 `visibility: hidden`（UX-6，现状只有 opacity/pointer-events，关闭态 10+ 链接仍在 Tab 序列）；选中态描边 + 形状变化双编码（IA-11）。
- **可访问性**：`#navbar` 内 focus-visible = 2px accent outline + offset 2px（既有，保持）；搜索按钮 `aria-label` 与可见文案同源（UX-15，现状硬编码英文 "Search" 须改）；胶囊不压制主内容（PRD §6.1）。
- **禁止**：胶囊内加图标（图标仅归移动端九宫格）；下拉加 margin-top；导航项加序号（PRD §6.1）；磨砂 chip 回潮（2026-10-15 已按效果图改回裸文字 / 裸图标，注释在案）。

### 5.2 首页身份域（`.identity`）

- **构成**（自上而下）：头像（96px 圆形、1px `--line-strong` 描边、无阴影，A10）→ 站名 h1（`.identity-name`，D0）→ tagline（系统黑体 1.02rem / 1.9、次级色，`max-width: 44ch`）→ CTA 组（一实一虚）。身份词铭牌（A9）曾位于站名下方，2026-10-21 被主人整块撤回（原话「01 Developer / 02 Writer 这哪好看」），`site.yml` 的 `identity_words` 数据保留但不渲染；恢复须走 §10 拍板流程。
- **状态**：`.cta-solid` hover → accent 底 + `#fdfbf6` 字；`.cta-link` hover → accent + 下划线（粗细与 offset 由 §7 水波基线接管，本处只声明 `text-decoration`）；头像卡无独立 hover（非链接）。
- **空态 / 降级**：`site.yml avatar` 为空 → 触发首字母 monogram 降级（VD-7 短期方案：比展示主题作者示例图专业）；`identity_words` 空 → 竖列不渲染。
- **可访问性**：头像 `alt` 为站名或主人名（待 §10 确认后定值）；h1 全页唯一。
- **待确认（进 §10）**：真名上首屏及形式（F-2 / H-1，建议副行「KASAI · 韩耀宇」）；档案页入口行文案与形式（IA-10）；头像素材与形态（VD-7）。
- **禁止**：Emoji / 图标符号 / 手写体（红线 R-5）；社交证明（红线 R-4）。

### 5.3 内容墙（`.wall`）

- **构成**：3 列网格 `minmax(0,3fr) / 1.25fr / 1.25fr` + `grid-auto-flow: dense` + 行高 `minmax(158px, auto)`；主卡 `.wall-feature` 跨 2 行 1 列（墨底反色块）；入口格三形态：
  - **照片格**（有 cover）：`img` + `mask` 渐变 + 纸上白字；
  - **色块格**（`modules.yml` accent 决定）：黄 = 项目、橙 = 游戏，格内用字遵守 §2.2；
  - **排版格**（无 cover 且无色块）：纸底 + 1px hairline + 墨字。
- **主卡内容**：mono meta（0.76rem、复合白 0.72）→ 标题（**D0+ 超大档**，方向 B 的尺度断崖）→ 一句话描述（0.94rem / 1.85，复合白 0.78）→ 「阅读全文」式链接（mono 700）。
- **入口格内容**：tag 行（模块名 + 真实计数，mono）→ 主文案（IA-7：有 cover 的格子主文案回模块名 + 计数，`items[0].title` 仅作「最新一条」并加前缀；无 cover 的排版格可保留「最新：xxx」）→ 大数字计数（M3）。
- **入口格清单**：模块格（黄=项目 / 橙=游戏 / 排版格=收藏，由 `modules.yml` accent 决定）+ **分类格**。**标签格已撤**（2026-10-19 主人拍板方案 A：8 标签 / 6 文章的规模提供不了导航价值，标签降级为详情页检索——`/tags/` 与所有标签 URL 保留可访问，文章详情页的标签行是它该在的地方；零 permalink 风险）。
- **网格纪律（RL-1）**：主卡 `.wall-feature` 占 col1 两行 → 前两行留给入口格的空位固定为 **4 个**。入口格 ≤4 时正好铺满、不产生第三行；超过 4 个时末格（分类格）跨 2 列兜住（`wallOverflow` 条件挂 `.wall-cell-wide`）。格子总数因数据增减变化时必须重新推导，**不得留下右下空洞**。验收：1440px 与 768px 两档截图右侧满填。
- **状态**：可点格 hover `translateY(-2px)`（0.2s）；排版格 hover 边框变 accent；主卡标题 hover 下划线（3px、offset 6px）。
- **可访问性**：色块格内小字 ≥12px / 700（VD-4）；照片格 mask 保底（§2.2）；类型无独立列表页时该格渲染为**非链接元素**（数据铁律，UI-AUDIT §五.2）。
- **待确认（进 §10）**：墙格与顶部导航去重方向（IA-8 / W-2）。

### 5.4 两栏区（`.home-cols`）

- **构成**：`cols-2` = `1.2fr / 1fr`（精选内容 / 最新文字）；栏头 `.col-head` = 栏标题（D4）+ 计数（mono）+ `col-more` 出口（`margin-left: auto`，mono 0.78rem 次级，hover accent）。
- **栏头节奏纪律（UX-3）**：栏头必须齐整——**每栏都要有出口链接**。
- **行式列表通用形态**：**组顶 2px 墨线 + 行底 1px hairline**；行内 mono 日期 / 类型词 + 墨色标题 + 次级描述。
- **分隔职能分层（方向 B，2026-10-19）**：hairline 只保留**描边**（卡片 / 图片 / tag 边）与**行分隔**（feed-row / post-row / pick-row 的行底，含墨底区块的 `.ink-band .feed-row`——它与纸面侧行分隔的 1.62:1 对称，是行分隔不是分组线）；**组分隔**一律 2px，两个显式 token：
  - `--rule`：区块分隔（`.home-end` / `.post-prevnext` / `.rich-section h2` / `.detail-foot` / `.archive-picks .pick-row`），2px、`.24` 墨、1.62:1——与纸面 hairline 的 1.51:1 同口径（层级线，可辨识而非 3:1）；
  - `--rule-strong`：组顶线（列表组第一条之上），2px、全墨、13.5:1。
  两级是显式设计而非顺手取值；新增区块分隔不要再写 1px。
- **精选栏**：`88×60` 封面（8px 圆角）+ 标题 + 一句描述；外链条目挂 `.pick-ext`（mono、次级色、↗ 标注）。
- **最新文字栏**：mono 日期 + 标题 + 单行描述截断 + 分类名。
- **计数口径**：栏头计数 = **实际渲染行数**（2026-10-19 统一：原「最近更新」栏用 `feed.length` 13 冒充总数，实际 `FEED_MAX` 截断后只渲染 6 条，与同页其它计数一页两义；现已改为 `feedRows.length`）。
- **「最近更新」已迁出**：见 §5.16 墨底整屏区块（方向 A，2026-10-19 落地），不再占用栏位。
- **待确认（进 §10）**：栏名「近期动态」改为「最近更新 / 更新记录」（IA-9 / L-2：现名暗示社交动态，站点无互动属性）。

### 5.5 按钮与 CTA

- **构成**：一实一虚——`.cta-solid`（墨底、纸上字、6px 圆角、`0.66rem 1.45rem`）+ `.cta-link`（虚文字链）。
- **状态**：solid hover → accent 底 + `#fdfbf6` 字（0.2s 颜色过渡）；link hover → accent + 下划线 offset 4px；focus-visible 全站统一 2px accent。
- **纪律**：一屏一个实心主 CTA；主题按钮 token（`button_bg_color: transparent` / `button_hover_bg_color: #f2f3f5` 冷灰）**不得在纸面组件上使用**（§2.3 观察项）；模块详情页 `.detail-links` 用墨底胶囊 + hover accent，与 CTA 同一语言。

### 5.6 chip / 标签 / 徽标

- `.tag-chip`：999px 胶囊 + 1px hairline + 名称（0.92rem / 700 墨）+ 计数（mono）；hover 边框与名称变 accent。
- **标签不伪装热度**（PRD §5.5）：计数 = 真实文章数；排序按真实文章数（tags.ejs 既有注释）；主题 tagcloud 字号渐变 + 冷蓝渐变（`_config.yml` L1022-1027）为死配置，**不得恢复**（§2.3）。
- `.detail-tag`：999px + hairline + 次级字；`.detail-tag-solid`：`--accent-soft` 底 + accent 字。
- `.cat-toggle`：折叠箭头 `rotate(90deg)` 过渡（动效白名单成员），collapsed 态 `rotate(0)`。

### 5.7 卡片（`.module-card` / `.media-wall`）

- **构成**：面板底（VD-5 改后 `#fdfbf6`）+ 1px hairline + **12px 圆角**（VD-5 改后）+ 封面（16:9 / 16:10，object-fit cover）+ 标题（1rem / 700）+ 摘要（0.84rem 次级）+ meta 行。
- **状态**：hover `translateY(-2px)` + 边框 `--line-strong`（0.12s）；无封面条目按数据条件降级，不造假封面。
- **纪律**：卡片只在有明确分组 / 交互 / 组织价值时使用（PRD §7.5）；**不得把所有文字、文章、导航项、模块都包装成统一圆角卡**；边框 / 阴影 / 圆角 / 强调色不堆叠。

### 5.8 页脚与署名

- **构成**：`.home-end`（1px hairline 顶线 + 左侧 motto 等宽 0.78rem + 右侧 `TOP ↑`）；主题页脚本 `yaoyu ♥ blog` 为第二层（F-5）。
- **署名规则（F-5 / F-6 定调，文案待确认）**：**品牌位用站名、身份位用真名、页脚用真名 + 站名**。现行四种署名口径（首页 `KASAI'S Blog` / 导航品牌站名 / 关于页真名+颜文字 / 页脚拼音 `yaoyu`）必须收敛为一条规则。
- **禁止**：主题作者署名（`yaoyu ♥ blog`）继续露出；PV/UV 统计（红线 R-4）。
- `TOP ↑`：必须是真实锚点（`.home` 加 `id="top"`，href `#top`，UX-2：现行 `href="#"` 把 `#` 塞进 URL 且跳顶后 fixed 胶囊仍覆盖视口顶，键盘用户无法确认焦点位置）；保留 focus-visible。

### 5.9 搜索页（`/search/`，2026-11-04 取代原导航弹窗）

- **变更原因**：原 `#modalSearch` 弹窗只有一屏高、移动端被键盘压掉一半、结果无法分享；驱动它的 `local-search.js` 只遍历文章与 Markdown 页，站内 600+ 资料页（城市/榜单/生肖/节日/节假日）全部由 generator 直接挂路由、不在 Page 模型里，**一条都进不了索引**（实测长期只有 6 条 entry）。现改为独立页 + 构建期全站索引，方案见 `PLAN-V3-CURATION-HOMEPAGE-2026-11-04.md` §4。
- **构成**：页头 kicker `SEARCH` + h1「搜索」+ 一句范围说明；输入框无底、**2px 墨色底线**、等宽字体、focus 时底线转 accent；类型 chip 行（全部 / 文章 / 城市 / 榜单 / 生肖 / 节日 / 节假日 / 资料库），激活态为墨底纸字；结果计数一行等宽小字；结果行 hairline 分隔，标题 600 + 摘要次级 + 右侧类型标签；命中词用 `<mark>` 走 accent。
- **状态**：空查询只留骨架与 chips，不显示「没有结果」；有查询但无命中走独立空态（标题 + 三条检索建议）；索引加载失败必须有可见提示，不能静默空白。
- **可访问性**：结果区 `aria-live="polite"`；chips 用 `aria-pressed` 表达选中；导航搜索按钮 `aria-label="搜索站内内容"`；输入框带 `aria-describedby` 指向拼音提示。
- **禁止**：orangered / 深蓝（§2.3）；在模板里写死结果条数或类型清单（类型与数量必须来自索引本身，否则加一类内容就要改模板）。
- **样式作用域**：`site.css` 的 `.sr-*` 全部收在 `.sr-page` 内，不复用主题原厂 `.search-*`（那套已随弹窗一起下线）。

### 5.10 404 页

- **构成**：kicker + h1 + 副标题（引导文案）+ 回首页出口。
- **规则**：主副标题不得重复（UX-8：现行主副标题同为「页面不存在」）；自动跳转须有可见倒计时与明确出口——**是否保留 10s 强制跳转待主人确认**（UX-8，建议取消自动跳转只留按钮，或延长至 30s）；跳转不得丢失错误 URL 上下文（UX-16）。
- **禁止**：跳转陷阱（无出口、不可取消）。

### 5.11 回到顶部

- **现状（如实记录）**：主题 `#scroll-top-button` 全站失效——`registerScrollTopArrowEvent` 的 `#board` 守卫在全站自定义页面提前 return，按钮永停 `bottom:-60px`，**静默失效不抛错**（UX-1 / A-2，旧「抛 TypeError 中断后续事件」结论已修正）；且与首页 `TOP ↑` 功能重复。
- **规则（二选一，裁决后写入实施）**：
  - 方案① 复活并纸面化：`#fdfbf6` 底 + `--site-chip-border` + 12px 圆角 + `--site-float-shadow`，**hover 去无限弹跳**，改用颜色过渡；
  - 方案② 停用主题按钮（`scroll_top_arrow.enable: false`），只保留首页 `TOP ↑` 并修好锚点（§5.8）。
- **验收口径**：长文页（文章 / 归档 / 模块详情）有可用回顶路径；**全站不得同时存在两个回顶入口**；无隐形死控件（不可见但可聚焦 / 可点击）。

### 5.12 模块列表与详情页（项目 / 游戏 / 收藏）

- **列表页**（`.module-grid` + `.module-card`）：`repeat(auto-fill, minmax(260px, 1fr))` + `gap: 1rem`；卡片规范见 §5.7；`modules.yml` 的 `page` 为空的类型无列表页，其入口格降级为非链接（§8.3）。
- **游戏列表页专用形态 · 封面网格**（`.games-wall`，2026-10-19 主人拍板「封面网格」）：4 列 × 行高 130px，第 1 项 2×2、其余 1×1，无洞铺满；≤720px 退化 2 列（行高 108px）。每格封面（`object-fit: cover`）+ 底部墨色半透明标题条（`rgba(42,37,29,.72)`），**摘要默认收起、hover / focus-visible 展开**（小格限 3.2em，大图格 5.2em——超过格子高度会被 `overflow:hidden` 切掉标题，2026-10-19 实测修正）；格 hover 上浮 2px（§6.2 保留项）。`cover` 缺失的条目降级为纸底斜纹格，不制造空图位。
  - 这是修订后 R-3 允许的形态（非均质拼贴）；**不得回退成均质卡片阵列**，测试已锁死（e2e 断言游戏列表页必须含 `games-wall` 且不得含 `module-grid`）。
  - 布局两次实测修正记录在 `site.css` §4.9.1 注释里：初版的「1 宽(2×1) + 1 横幅(4×1)」让 600×900 竖封面的可见比例掉到 4.9%，且小格 hover 展开后标题被切，故改为现行布局。
- **详情页构成**：kicker（可回列表页）→ 标题 → meta 行（日期 `YYYY-MM-DD` + tags + **可选 `status` 位**，D-2：与 games.yml 既有 status 字段同构，无值不渲染）→ 封面（1px hairline + 12px 圆角）→ 若干段 `rich-section`（每个有内容的长文字段一段，**无内容段不渲染**，全空落「详细介绍整理中」）→ `.media-wall`（16:10 截图网格）→ `.detail-links`（墨底胶囊外链组）→ `.detail-foot`（返回列表 + **同模块前后条目导航**，D-3：数据在 `page.items` 内可取，无数据不渲染）。
- **壳标题条件渲染**（2026-10-19）：`rich-section` 的壳标题（「玩法介绍」「项目背景」等）**仅在正文不以 `<h2` 开头时渲染**。正文自带小标题时壳标题是冗余层级，且两个 h2 直接相邻、中间只隔 22px，读起来像两个标题打堆（实测 lol 一处、Ties 四处）。判断依据是**渲染后** HTML 的行首，不猜 Markdown 原文；测试已锁死「不存在两个相邻 h2」。
- **正文轨**：详情页长文必须命中 §4.2 正文轨（VD-9 修复方向：模板改嵌套结构，与 about.ejs / paper.ejs 一致）。
- **文风（数据层纪律）**：第一人称「我在玩什么 / 为什么 / 卡在哪」，不抄官方介绍；虚构战绩 / 局数 / 时长禁止（games.yml 文件头既有约定，提升为全模块规则）。

### 5.16 墨底整屏区块（`.ink-band`，方向 A · 2026-10-19 落地）

- **定位**：全站唯一一处反相区块，R-1 豁免的**唯一**落点（每屏最多一个墨底整屏区块）。现行唯一实例是首页「最近更新」。新增第二个墨底区块须重新过 R-1 豁免，不得默认复制。
- **构成**：full-bleed `<section class="ink-band">`（背景 `--surface-ink: #2a251d`）+ 内部 `.home-wrap`（1200px 居中）+ `.col-head` 栏头 + `.feed-grid`（`auto-fill minmax(300px, 1fr)` 多列 feed 行）。
- **用字锁定**：区块内一切文字只用纸色及其透明度衍生——标题 13.5:1、次级（计数 / 类型词 / 日期，`.72` 纸色）7.69:1，均过 AA；hairline 用 `--on-ink-line`（.16 纸色）。**不得出现 `var(--accent)` 或任何装饰色块**（R-2），测试已锁死。
- **结构纪律**：必须与 `.home-cols` **平级**。装进两栏容器会变成网格的第三个格子、只占第一列宽，墨底通不了铺（2026-10-19 实测踩到，e2e 已加模板结构断言）。
- **hover**：区块内文字链只加下划线（`text-underline-offset: .28em`），不变色、不上浮——反相区块不做位移动效。

### 5.13 档案页范式（/now/ /links/）

- **定位**：全站最像「人在经营的空间」（DESIGN-REVIEW §四.12），**立为档案页范式**——后续新增档案类页面照此执行。
- **构成**：`.paper-page` 框架（页首留避让胶囊）+ kicker + 标题 + 副标题 + 正文轨（§4.2）。
- **纪律**：内容真实、第一人称；`/now/` 的「更新于」由结构化字段 `show_updated` 渲染（A-2，不用文件 mtime——Vercel 全新 checkout 会让 mtime 恒等于部署时刻）；工具清单与项目内容互链（A-3：工具清单 ↔ `/projects/Ties/`）；`/links/` 空态诚实——现行文案「从站内任意一个社交图标找到我」在仅 2 个图标且其一未验证时兑现率约一半（M-3），2026-10-28 起社交图标已补齐到 4 个（GitHub / 邮箱 / 微信二维码 / Instagram），该文案方才成立；诚实标注「还没写」是**受保护的既有资产**，不得为填满而编造。
- **合并记录**：原 `/uses/`（我在用什么）2026-10-28 并入 `/now/`——两页说的是同一件事。旧地址由 `vercel.json` 的 redirects 308 到 `/now/`，不留在站内的任何导航与链接里。合并后的小节用 `h3`（原标题缩进一档），避免与顶层 `h2` 抢层级。
- **联系方式交互**：邮箱**不用 mailto**——mailto 依赖访客本机注册了默认邮件客户端，没装的机器上点了没反应或弹「找不到应用」。统一改成「点按图标复制 + 提示条」（`source/js/about.js` + `.about-copy-toast`）；微信走悬浮二维码（`.qr-trigger`），二维码图放在 `source/img/wechat-qr.jpg`，**不得使用主题自带的 wx_2wm.jpg**（那是主题作者的码）。
- **可访问性**：与文章页同正文轨、同焦点规则；标题层级不跳级。

### 5.14 文章页

- **构成**：`.post-head`（kicker 每页 1 处 accent + 标题 D2 + meta 行：日期 `YYYY-MM-DD` + 分类链 + 标签，全等宽次级色）→ 正文轨（§4.2）→ 文末元信息 / 版权 / CC（纸面配色，`post-metas` 次级 + 链接 accent）→ `.post-prevnext`（上下篇，标题 0.92rem / 700，hover accent）→ `.post-foot`（版权 + **「回到身份域」低调文字链**，UX-14：指向 `/` 或 `/about/`，与首页身份域叙事闭环）。
- **目录（右栏）**：`.post-side-right` sticky `top: 96px`；空目录容器 `visibility: hidden` 是既有自愈机制（R-1 可见部分已修，保持）；**短文不渲染字数 / 阅读时长**的门控规则（UX-10：按正文字数门控，如 <50 字不渲染，与「空则不渲染」铁律同构）。
- **左栏**：`category_bar` specific 模式（front-matter 驱动）。
- **正文链接**：颜色回归暖纸体系（VD-1：`#0366d6` → 建议 `#b0482a`，纸底 4.90:1；C-1 备选 `#a03f22`，纸底 5.77:1——**建议值待确认**）。因链接即 accent，**hover 不再靠变色相表达**（现行「暖纸→蓝→hover 回砖红」的色相反转随之消失），改由下划线 / offset 过渡表达。
- **代码块**：github gist 高亮与纸面有轻微色温差，无硬编码白底规则（VD-10 修正记录）；可选优化 `pre` 底 `#fdfbf6` + 1px hairline **【建议值 · 待主人确认】**。
- **禁止**：重写正文（红线 R-8）；改 permalink（红线 R-7）；把正文塞进装饰卡（PRD §5.2）；文章页出现 §2.3 任何冷色。

### 5.15 跨页复用列表行通用状态表

`.post-row` / `.pick-row` / `.feed-row` / `.archive-row` / `.cat-row` / `.tag-chip` 共用：

| 状态 | 表现 |
|---|---|
| 默认 | 纸底透明、墨色标题、次级元信息、行底 1px hairline |
| hover | 标题变 accent（行式）；卡 / 格 `translateY(-2px)`；下划线类用 offset / 粗细过渡（§6.2） |
| active / 当前 | 墨底反色（导航 / 分页）或 accent 字（`.cat-post.is-active`、toc 当前项） |
| focus-visible | 2px accent outline + offset 2px（全站统一） |
| 禁用 | 站点无禁用态交互，不引入 |
| 空态 | 整段不渲染；容器有理由存在时（links 页）用诚实文案 + 出路（§6.6） |

---

### 5.17 节假日页（`/holidays/`，2026-10-21 新增，2026-10-22 对齐参考站观感，2026-11-02 图例/详情卡修订）

- **定位**：工具型纸面页，全站唯一的「数据可视化」落点——一整年的日历格。它不进首页墙格、不做入口卡，只在导航「更多」下拉里有一项。
- **构成（对齐 studycli.org 的双栏）**：页头（kicker CALENDAR + 标题 + 更新于/预计）→ 导语（预计说明，纯段落无框）→ **左「法定节假日表」+ 右「全年一览格」双栏** → 「其他节日和纪念日」双列表 + 「二十四节气」流 → 正文说明 + 常见问题（`<details>`）→ 数据来源。
- **格子状态编码（底色 + 圆点形态双重编码，不靠颜色单独表达，§9.4）**：

| 状态 | 形态 | 色 |
|---|---|---|
| 放假 | 实心圆点 | `--accent`（砖红，一年仅 28 天，稀缺性即信号） |
| 周末 | 淡底圆点 | `rgba(26,26,26,.13)` |
| 节日 / 节气 | 透明底 + 格内 3px 墨点（透明度 .5，圆角 999px） | `--text-color` |
| 普通工作日 | 近不可见底圆点 | `rgba(26,26,26,.06)` |
| 调休上班（数据有值时才渲染） | 周末淡底圆点 + 1.5px 砖红内描边 | — |

> 格子本身是约 12px 的方形 + `--r-xs`（8px）圆角，几何上已经是一个圆点；图例色块必须与格子同形（`.cal-swatch` 用 `border-radius: 999px`），不允许再出现「上面圆圈、下面方框」两套形态（E-095，`test/holidays-e2e.js` 断言锁定）。

- **纪律**：① 格子**不放数字**——31 列在 1200px 版心下每格约 12px，放数字会退化成表格；日期靠刻度尺（1/5/10/15/20/25/30）与悬停浮层；② 放假格上不再叠节日点，实心圆点上不可辨；③ 圆点用 `border-radius: 999px`，**不得用 `50%`**（§4.4：50% 是全站唯一例外，只归头像）；④ **图例必须与格子同形**——底部「官方放假 / 周末 / 调休上班」色块同样用 `border-radius: 999px`，改格子形态时同步改图例（E-095）。

#### 5.17.1 单页视觉破例（2026-10-22 主人拍板）

主人明确「冲突无所谓，参考站的字体 / 排版 / 配色都喜欢」，因此这一页在 `.cal-page` **作用域内**换成参考站那套视觉，站点 token 与其它页面一律不动：

| 项 | 参考站实测值 | 本页落地 |
|---|---|---|
| 纸底 | `#f7f6f4` | `.cal-page { background: #f7f6f4 }` |
| 墨 / 次级 | `#1a1a1a` / `#6b6b6b` | `.cal-page` 内覆盖 `--text-color` / `--sec-text-color` / `--info-mark` |
| 强调 | `#c4463a`（hover `#a83a30`） | `.cal-page` 内覆盖 `--accent` |
| 标题字体 | Fraunces 600（拉丁子集，中文回退宋体） | 自托管 `fraunces-600-latin.woff2`（SIL OFL） |
| 正文字体 | Avenir W01（Monotype **商业授权**） | **不可随仓库分发**，以同为 OFL 的 Nunito Sans（可变字重 200-1000，拉丁子集）替代 |
| 拼音字体 | Avenir Next / Segoe UI 一系 | Nunito Sans |

- 破例边界由 `test/holidays-e2e.js` 锁死：参考站的色值**只能出现在 `.cal-page` 规则里**，写进 `:root` 即 FAIL（防止单页破例溢出成全站换色）；`font-family` 里出现 Avenir 即 FAIL（商业字体不得入库，判据先剥 CSS 注释，避免被 §4.12 的说明文字误报——E-031 同型）。
- 两个 woff2 共 66KB，`font-display: swap`，加载失败回退系统字体，布局不塌；中文一律走系统栈（参考站同样如此：Avenir / Fraunces 都不含 CJK 字形）。
- **悬停浮层**：面板底 `#f7f6f4` **不透明纸面**（禁止 `backdrop-filter`——卡片每换一格都要移动/重绘，毛玻璃会连带重算它下方的整张年历与玻璃表格，快速划过即掉帧，E-096）；16px 圆角（内侧封面 15px）+ chip border + 全站唯一阴影 token；节日名走 Fraunces 600（对齐参考站 `.hc-tip__name`）；内容一律 `textContent` 写入，不拼 `innerHTML`；`position: fixed` + 视口坐标：贴在年览左侧、纵向对准所指格子，越界时钳在视口内；出现无动效（§6.1 白名单）。性能纪律：`pointerover` 用 `requestAnimationFrame` 合并，一帧最多开一张卡；假期聚焦按 `data-h` 预分组，只改前后两个假期的格子，不遍历全部 365 格；同一张配图不重复赋 `src`。开启节日/节气格（无 `data-h`）时必须清掉上一假期的残留高亮，保证卡片与年览高亮始终同指一天（E-097）。
- **无脚本降级**：年历格是图形总览，逐日信息在左方法定节假日表与下方节日列表里都有；脚本没加载时页面仍然完整可读。
- **年份族（2026-10-22 对齐参考站，当晚补齐）**：`/holidays/<年份>/` 一页一年，页头右侧年份块横排所有年份。数据范围 **2021–2036 共 16 年**：2021–2026 六年为国务院办公厅正式通知（逐条核对），2027 起为按同一规则推算的预期值。
  - **年份块版式（2026-10-23 照参考站量值）**：页头两栏 `minmax(0,1fr) 300px`、`align-items: end`；年份块左侧 1px 竖线 + 1.5rem 内距，标签在上、年份 4 列网格（`repeat(4, minmax(0,1fr))`，行高 1.9、等宽数字）。**当前年用墨色加粗 + 2px 下划线**（`box-shadow: inset 0 -2px 0`），不再用砖红实心胶囊——胶囊读起来像按钮，参考站是把它当正文强调。窄屏断点改单列，竖线去掉。
  - **表头**：沙色底带 `#f7f5f0`、600 字重、`--sec-text-color`、无下边框（底带本身已分隔表头与数据行，再加一条线会变成三层）。
  - **官方年份多一列「调休上班日」**，一个日期一行；预计年份不加这一列（没有公布的调休日，不编）。
  - **来源**：不设独立版块。只在年一览下方给一行小字 `来源：国务院办公厅 <日期>的通知（中文）。`，且**只对官方年份标**——这是参考站的做法。预计年份靠「以上均为预计日期」那段说明，不标来源。
- **两栏底边必须齐平**：`.cal-top` 用 `align-items: stretch`，`.cal-year` 纵向 flex，页尾那组小字（说明 / 调休释义 / 来源）`margin-top: auto` 沉到栏底。说明区同理：两侧共用组顶全墨线与 1.25rem 组顶间距让标题落同一基线，问答列 `flex: 1` 均分拉满整列——**任何一栏比另一栏矮一截，都会被看成「下面是空的」**。
  - **2021–2024 不照抄参考站**：那四页是纯表格、没有年历网格，且只列法定假日日本身，与国务院通知对不上（2024 国庆它写 10/1–10/3，官方是 10/1–10/7；2021 端午它写 6/14–6/16，官方是 6/12–6/14）。这四个年份一律按官方通知录。
  - **法定假日天数有两档**：2024 及以前 11 天、2025 起 13 天（2024-11 修订的《全国年节及纪念日放假办法》自 2025-01-01 施行）。断言按年份分档写死。
  - **跨年元旦截断到本年**：2023、2024 官方年的元旦假期从上一年 12 月 30/31 日起，本页只统计落在本年的天数，完整区间写进 `arrange`。2029/2030/2034/2035/2036 五个预计年同样处理（E-048）。
- **二十四节气**：每年 24 个，用通用寿星公式算出（产出即北京时间，不再 +8h）。与数据里原有的 48 个节气逐年比对 0 处不一致；2023 年夏至按官方值修正一天。必须每年都有——曾经 `terms` 一直为空，模板 `if` 兜底让这一整节从来没渲染过（E-047）。
- **年份导航必须允许收缩**：`.cal-years` 写 `flex: none` 会按 max-content 撑开，年份一多就在窄屏把整页顶出横向滚动条（E-049）。现在是 `flex: 0 1 auto; min-width: 0`，窄屏页头改为上下堆叠。
- **常驻详情卡（2026-10-22 主人明确要求）**：鼠标移到格子上即开出卡片，**移开不消失**，只有点右上角 ×、按 Esc 或点到页面别处才收起；滚动时卡片跟着格子走。位置优先贴在格子左侧（格子在最右列时卡片盖在表格上方），左侧放不下翻右侧，再放不下回落到格子上方，纵向以格子为中心并钳在视口内。内容**居中**排布，字段与参考站一一对应：日期 · 星期 / 农历（仅数据里有的日子）/ 状态 kicker / 名称（Fraunces 600）/ 拼音 / 「第 N 天，共 M 天」/ 说明 / 放假区间 / 法定假日天数 / 锚点链接。卡片是纯增强：脚本不加载时，左表与下方节日列表仍完整可读。
- **数据单一来源**：`source/_data/holidays.yml`。页面上的每一个数字、每一句文案（含正文三节与常见问题）都在数据文件里，模板不含手写日期与正文；「预计」与「官方」由数据里的 `official` / `label` 决定，不由文案决定。内部维护说明（怎么改数据）只写在 ENGINEERING.md，**不上发布页**。

### 5.18 生肖页（`/zodiac/`，2026-10-23 新增，与节假日页同族）

- **定位**：工具型纸面页，节假日页的姊妹篇——导航「更多」下拉进，不进首页墙格、不做入口卡。数据来自 `source/_data/zodiac.yml`，模板 `themes/fluid/layout/zodiac.ejs`，计算层 `themes/fluid/scripts/helpers/zodiac-data.js`，样式 `site.css` §4.13（`.z-*` 规则）。
- **视觉作用域复用 `.cal-page`**：生肖页根元素同时挂 `cal-page z-page` 两个类（见 zodiac.ejs 头部注释），参考站纸底 / 墨色 / 强调色 / Fraunces + Nunito 全族共用 §4.12 一处定义；§4.13 只写版式规则，**不重复定义色值**——两处各写一份必然漂移（E-052 同型）。
- **页面构成**：索引页（十二生肖一览表 / 按出生年份查生肖 / 五行与传统方位颜色 / 三合与相冲 / 正文与常见问题）；生肖年页（页头 + 左「该生肖的年份」表 + 右「基本信息」表 + 性格两栏 + 传统配对表 + 幸运数字与颜色 + 相关词汇表 + 正文与常见问题 + 上一页/下一页）。
- **蓝色生肖年术语链（主人 2026-10-23 明确要求）**：可跳转的生肖年词语——节假日页引导段的「火马年 / 丙午马年」、生肖年页正文里的「蛇年 / 羊年」等——用 `<a class="z-link">` 标注，色值 `--z-link: #1b5fc1`（对参考站纸底 `#f7f6f4` 为 **5.7:1**，过 AA），hover 走 `--accent`，下划线 offset 2px。蓝色是参考站视觉的一部分，与 §4.12 的参考站配色同一破例边界：**只允许出现在 `.cal-page` 作用域内，不进 `:root`、不上其他页面**，`test/zodiac-e2e.js` 锁死。
- **页头导航两种形态**：索引页与生肖年页都是右侧 12 生肖 4 列网格；当前生肖用墨色加粗 + 2px 下划线（`.z-animal-current`，与 `.cal-year-current` 同一规则），不用胶囊。生肖是汉字，覆盖 `.cal-years li` 的等宽轨（中文进等宽栈会掉到系统默认字体）。
- **数据纪律（与节假日页同律）**：① 页面上的每个日期由 helper 从 `meta.springFestival`（2021–2033）算出，模板不含手写日期；生肖年以春节为界（GB/T 33661-2017），起止与节假日页春节日期由测试锁一致；② featured 年份覆盖 2021–2032，与节假日页年份范围（2021–2036）衔接，节假日的 16 个年份引导段全部带对应生肖页链接；③ 干支、五行、三合/六合/六冲/六害/相刑全部由传统规则计算，测试按参考站公布值钉死锚点（如鼠六合牛、马六合羊）；④ 幸运数字与颜色只录有出处的民间说法，没有的一律留空并显示「各来源说法不一」说明——不为了填满版面编数据；⑤ 中文长文案单行书写（E-042）。
- **诚实口径**：性格、配对、幸运物在页面上明确标注「民间说法」；配对表注明「传统命理看整张命盘，不凭生肖一句定论」；来源行说明干支与日期的依据（公开历法资料 + GB/T 33661-2017）。

### 5.19 分组规格表（城市档案 `/city/<slug>/`，2026-11-04 新增）

- **定位**：数据型页面里「字段多且分属不同口径」时的排布范式。首个落点是城市档案的「城市档案」一节（`.cr-spec`），样式 `site.css` §4.16。
- **为什么需要**：一列 dt/dd 同构横条在字段超过 12 项后就不成立——21 行等宽同构、每行一条 hairline，读到第十行时读者已经丢了坐标（主人 2026-11-04：「下面全是一条一条的列出来的，谁喜欢看啊」）。字段再多也只是把这一列拉得更长。
- **构成**：**组名左列 + 字段两列**。

| 部位 | 规格 |
|---|---|
| 组名（`.cr-spec-title`） | `--font-mono` 0.75rem / 700 / letter-spacing .16em / 次级墨色，排成左侧一竖列 |
| 字段格（`.cr-spec-item`） | 右区 `grid-template-columns: repeat(2, minmax(0,1fr))`，标签左、值右对齐 |
| 组顶线 | 1px `--line-strong`（比行底线重一档，靠线重区分组与行，不靠色块） |
| 行底线 | 1px `--line-color` |
| 最末组 | 补一条 `border-bottom`，让整表有下沿 |
| 组名列宽 | `max-content`，不写定宽——四字组名（如「公共服务」）不会被挤成两行 |

- **为什么不是两栏并流（`column-count: 2`）**：试过，组高不等时左右两栏的组顶线会错开 80–130px，横线不齐比单栏更难读。组名竖排之后组与组天然对齐，纵向长度同样只有单栏的一半。
- **要点表与档案表互补不重叠**：页头 `cr-glance`（最多 4 项）负责「一眼看全」，档案表只列它没展示过的字段。字段总数 ≤ 4 的城市反过来——页头不出要点表，档案全量呈现，避免同一个数字在上下两处各出现一次。
- **位次徽标收窄**：行内只留「第 N 位」，候选池总数（「共 36 城参比」）进 `title` 悬停。两列并排时「36 城参比 · 第 2 位」会把行撑破，而撑破一行就破坏了组内右对齐的基线。
- **数值必须加千分位**：`1152822.4` 读不出来，`1,152,822.4` 才读得出来。等宽栈下千分位不改变字宽节奏，只会让位数可数。
- **榜单类列表（`.cr-mention-cols`）同族**：名次前置成固定列（`3.6em`，容得下「第 45」），榜单名占剩余宽度；两栏并流在这里是**可用**的——条目高度一致、没有组内多级结构，不存在横线错开的问题。
- **窄屏降级**（≤719px）：组名从左侧列变成上方一行并改用正文墨色（此时它与字段标签同处一条竖线、同为小字，只靠字号拉不开层级），字段改单列，标签在上、值在下左对齐。

### 5.20 城市大图卡（`/city/`，2026-11-08 主人认定「可以留为优秀案例」）

- **定位**：一批同类对象、每项都有一张主视觉和 2–4 个可横比数字时的索引页范式，留作后续同类页面的参照。首个落点是 `/city/` 的「上榜最多的 30 座」。样式 `site.css` §4.16 `.cr-tile-*`。
- **构成（自上而下）**：16:9 封面 → 左上名次角标 → 对象名 + 归属 → **排序键大字 + 横条** → 次级数字两列。

| # | 可复用规则 | 原因 |
|---|---|---|
| 1 | 列数取总张数的约数（30 → 3 / 2 / 1 列） | `auto-fill` 只尽量多塞、不平均分配，末行半空很难看（P6 教训） |
| 2 | 排序键放正文第一行，等宽大字 + 横条 | 压在右下角灰字里会被读成「GDP 前 30」；排序键必须抢第一落点 |
| 3 | 横条按榜首满格换算，数字与横条并存 | 横条给直觉、数字给精度，不可互相替代 |
| 4 | 封面固定 `aspect-ratio`，正文 `flex: 1` + 数字行 `margin-top: auto` | 内容长度不一时卡片仍等高、数字行落在同一基线 |
| 5 | 无图不放假图、不放灰块，用对象名排进封面区兜底 | §8.2「无数据不渲染」 |
| 6 | 窄屏保留封面（16:8）而非隐藏 | 大图卡的主视觉就是内容；44px 行首缩略图那套「窄屏隐藏」不适用 |
| 7 | 配图双闸：登记表 + 文件同时存在才渲染 | 防死链与无出处图（`test/cityrank-e2e.js` S23） |

- **落地位置**：`src/pages/city/index.astro`（生产）、`themes/fluid/layout/cityindex.ejs`（Hexo 复刻）、`source/css/site.css` §4.16；断言 `test/cityrank-e2e.js` S23 / S24。
- **实测**（1280 / 390，CDP）：3 列 / 1 列，卡片 353px / 316px 等高，封面 214px / 176px，横向溢出 0。
- **案例配图**（2026-11-08 从生产产物 `dist/` 实测截取，存 `design/cases/`）：

**桌面网格（前两行，1280px）**

![城市大图卡网格前两行：封面、名次角标、排序键横条、次级数字](design/cases/city-tiles-desktop-2026-11-08.png)

**单卡信息层级**

![单卡：16:9 封面 → 名次角标 → 城市名 → 上榜次数大字与横条 → GDP 与人口](design/cases/city-tiles-card-2026-11-08.png)

**移动端单列（390px）**

![移动端单列：封面保留、卡片等高](design/cases/city-tiles-mobile-2026-11-08.png)

---

### 5.21 首页三屏（`/`，2026-11-15 第二轮重构，完整规范见 `DESIGN-HOME-SPATIAL.md`）

- **结构**：固定画布 `#sd-canvas` → `#hero` / `#desk` / `#outro` 三屏 → 原生 `<dialog>` 浮层。
  第三屏用 `<section>`，不得用 `<footer>`（`body.is-home footer` 会被整站规则隐藏，E-071 / E-170）。
- **四窗**：`.sd-win` 只定义一次外壳——`var(--cream)` 底 + `1px var(--site-chip-border)` 描边 +
  `var(--r-tile)` 圆角 + `0 22px 52px -32px` 阴影。**任何窗口不得覆盖外壳**，也不得出现反相变体。
  抬头只放标题，不放篇数、个数、分类计数。
- **背景**：`#sd-canvas` 是 WebGL 三维场景（三档色阶平面着色的程序化柱廊），几何与相机都在
  `source/js/home-study.js`；§4.26 内不出现任何渐变声明。禁用 2D 画布画「光斑 + 细线 + 圆点」。
- **行**：`.row-t` + `.row-k` 两段，标签 `white-space: nowrap` 完整显示；行内不放第二行摘要。
- **导航**：DOM 不动；首页隐藏 `.site-brand` 与 `.site-nav-center`（选择器须带 `#navbar`），
  只留右上角搜索 / 明暗切换 / 移动端菜单。全站入口由四窗承担。
- **作废**：§5.2 身份域、§5.3 内容墙、§5.4 两栏区、§5.16 墨底区块在首页不再使用
  （`.wall` 仍被 `/games/`、`/links/` 使用，不得删除）。
## 六、交互原则

### 6.1 动效与交互的上位原则

本节不再维护全站动效白名单。动效和交互的设计原则、创意方向、动态密度、
页面差异化、性能与可访问性要求，统一以 `DESIGN-PHILOSOPHY.md` 为准。

本文件只记录已经实际落地、仍然有效的组件级实现细节。不得将当前组件的
transition、时长或动画属性推广为全站限制；不得以「白名单外禁止」限制新页面。

（2026-11-15 废止：原「全站只许 transform: translateY(-2px) / 颜色过渡 /
rotate(90deg) 三种动效」与「时长上限 0.25s」两条，按 `DESIGN-INTEGRATION.md`
§2 解除。§6.2 水波母题、§6.3 阴影纪律、§6.4 焦点可见性仍然有效。）

### 6.2 「水波下划线」hover 母题（H-4，2026-10-19 主人拍板采纳，已落地）

- 内容：文字链 hover 用 `text-underline-offset` 3px→6px + `text-decoration-thickness` 1px→2px 过渡，**零位移**；不适配色移。
- 理由：「hover 上浮」是最容易被读成模板的手法（所有模板都做）；motto 已是「Be water, my friends.」——水波与 motto 是同一个人的两处签名，投入最小、去模板感收益最大（H-4）。
- 边界：不取代全部 `translateY(-2px)`（卡 / 格保留上浮，那是「可提起的物件」；文字链是「纸上的字」，不该浮起来）；配套 `::selection` 不再发红（§3.5.3）。
- **落地方式（2026-10-19 主人拍板采纳）**：`site.css` §7 定义全站文字链基线（默认 thickness 1px / offset 3px，hover 2px / 6px）作为**唯一定义处**；各组件的 hover 只声明「要不要显示下划线」（`text-decoration`），粗细与位置一律不再写死，原先散落 6 处的 offset 值已删除收归基线。调水波只需改这一处。

### 6.3 阴影纪律

- 全站唯一阴影 token：`--site-float-shadow`（`0 12px 32px -14px rgba(42,37,29,.28)`）。**禁止新增阴影 token，禁止 Material 双阴影**（主题回到顶部按钮的 `0 12px 15px 0 rgba(0,0,0,.24), 0 17px 50px 0 rgba(0,0,0,.19)` 是反面教材，A-2）。
- 可用阴影的位置仅限浮层与「可提起」元素：胶囊、下拉、弹窗、模块卡 hover。**头像卡已移除**（A10，2026-10-21）：头像不是浮层也不可提起，改圆形后阴影会让圆形「贴」在纸面上发虚。

### 6.4 焦点可见性

- 全站 focus-visible 必须可见：2px `--accent` + `outline-offset: 2px`（导航既有规则 L195-200 推广为全站基线）。
- **禁止 `outline: none`**；禁止用 `:hover` 样式代替 `:focus-visible`。

### 6.5 减少动态效果

遵循 `DESIGN-PHILOSOPHY.md` §6.1。`prefers-reduced-motion: reduce` 不等于
全站无条件移除所有 transition / animation。应移除大幅位移、视差、连续旋转、
强烈缩放和非必要循环，同时保留必要的状态反馈、焦点指示、内容可达性和操作结果。

（2026-11-15 修订：原作「reduce 时全站 transition: none; animation: none」，
按 `DESIGN-INTEGRATION.md` §3 解除——一律清零会把「操作已生效」的反馈也一起
抹掉，用户反而不知道点击有没有成功。）

### 6.6 空态与诚实文案规则

1. **诚实**：空态不得伪造数据、不得用装饰填充；links 页现行空态是全站范式（UI-AUDIT §五.2）；
2. **不社交化**：不用「快来」「互动」「留言」口径（站点无互动属性，IA-9 同构问题）；
3. **给出路**：空态必须指向一个可操作入口（回首页 / 进归档 / 联系方式待补则说明原因）；
4. **短内容门控**：内容不足时不渲染配套元信息（UX-10 字数 / 时长门控、R-1 目录门控）——「不像加载失败」是验收标准。

### 6.7 反馈时限

任何操作（hover / focus / 展开 / 打开弹窗 / 切换当前页）的视觉反馈须在 **0.2s 内可感知**或即时；站点无表单与后台异步，不引入 loading 态。

### 6.8 交互禁止事项

| 禁止 | 依据 |
|---|---|
| 运动失控或无法暂停 | 循环与持续运动可以用于环境、叙事或功能表达；必须控制注意力占用，并按场景提供暂停、离开视口后暂停或减少动态效果方案 |
| 用装饰动画掩盖导航 / 链接 / 功能缺失 | 动效不能代替功能本身 |
| 强制滚动、强制跳转或阻止正常浏览 | 用户必须保有浏览器与页面控制权 |
| Material 双阴影 | A-2 |
| 装饰性社会证明（PV/UV、「共 N 篇」、「访问量」） | 红线 R-4 |
| 10s 强制跳转类「陷阱」交互（未确认前） | UX-8 |

---

## 七、布局与响应式原则

### 7.1 不对称编辑网格构成规则

1. **首屏 hero**：`minmax(0,5fr) / minmax(0,7fr)` 左身份域 + 右内容墙（约 5:7）；≤991.98px 单列堆叠（身份域在上）。
2. **内容墙**：3 列 `3fr / 1.25fr / 1.25fr`，主卡跨 2 行 1 列；**主卡 `grid-row` 跨度随格子数自适应**（6 格 span 3）或末格跨剩余列——消除 RL-1 右下留洞（1440px 约 158px 空洞；768px 2 列第 5 格孤悬）。格子数因数据增减变化时必须重新推导并截图验收。
3. **三栏区**：`4fr / 3.4fr / 2.8fr`；≤991.98px 单列。
4. **不对称是内容权重的表达，不是随意错位**：每一格的尺寸差异必须有数据 / 编辑意图支撑；允许跨列、不同尺寸、大面积留白（PRD §5.1）；**不得为填满而造数据，也不得因数据真实存在而留洞**——两者都靠 §7.1.2 的自适应规则与 §8 数据纪律共同保证。

### 7.2 断点体系（统一 .98 家族）

| 断点 | 形态 |
|---|---|
| ≥992px | 桌面全形态：hero 双栏、wall 3 列、三栏、文章页双栏 + 右栏 TOC |
| 768–991.98px | hero 单列、wall 2 列、三栏单列、文章页无侧栏、正文全宽 |
| 576–767.98px | wall 2 列、身份域标题行准备竖排 |
| ≤575.98px | wall 1 列、页脚纵排 |

- **双约定消灭（RL-2）**：site.css 现行 `991.98 / 767.98 / 575.98`（.98 家族）与主题 styl 的 `767 / 424` 等整数断点并存，767.01–767.98px 区间两套规则可能同时生效。规则：**全站断点统一 .98 家族**，主题 styl 源一并收拢；验收：该区间只有一套规则生效。
- 流式排版用 `clamp()`（既有纪律，保持）；上轮 375 / 768 / 1440 三档零横向溢出是**保持项**，不是历史成绩。

### 7.3 移动端转译规则

1. 无横向溢出、无内容遮挡、无可点元素失效（PRD §8.2；既有 375/768/1440 实测口径保持）；
2. 导航在窄屏转译为九宫格：关闭态 `visibility: hidden`（UX-6）、选中态双编码（IA-11）；
3. 不要求机械保留桌面端跨列关系（PRD §8.2）；堆叠顺序 = 内容优先级顺序（身份域 → 主卡 → 入口格 → 三栏）；
4. 搜索弹窗 / 菜单适配触控；长 URL 有 `word-wrap` 保护（`.markdown-body` 既有，保持）。

### 7.4 768–991px 文章页区间规则

≤991.98px 时 `.post-side` 全隐藏、`.post-main-col` `max-width: none` 全宽；>991.98px 才有右栏 TOC。规则层无矛盾（RL-4）；**该区间视觉未实测**——列为未验证项：下轮补 768 / 900 两档截图，确认正文宽度与标题排版无异常。

---

## 八、数据呈现规则

### 8.1 计数真实铁律与 `/` 前缀唯一语义

1. 所有可见计数 = 真实条目数（分类数、标签数、模块条目数、聚合总数）；
2. **`/` 前缀在全站只表达一种含义：真实总数**。现行「近期动态 /6」用 `FEED_MAX` 截断数冒充总数（真实聚合 15 条），而同页「精选 /2」「分类 4」「标签 8」都是真实总数——一页两义必须消除（UX-5 / L-1 / F-10）；
3. 截断展示的规则：计数显示真实总数，渲染仍可取前 N 条，**截断处另标「更早 N 条 →」或纯展示不加斜杠计数**；
4. 验收：任取一页，所有 `/N` 与该模块真实条目数一致；grep 模板不得出现用截断常量充当计数的写法。

### 8.2 无数据不渲染

模块 `items` 为空 → 首页栏、入口格、列表页、详情页**整段不渲染**（模块 yml 文件头既有约定，UI-AUDIT §五.2）；不为填满版面造占位卡（PRD §5.1）。

### 8.3 类型无汇总页时入口格降级

`modules.yml` 中 `page` 为空的类型（无独立列表页），其首页入口格渲染为**非链接元素**（div，不是 a）——不制造失效链接（UI-AUDIT §五.2 既有资产）。

### 8.4 同一内容全站可点性一致

同一条目在首页墙格、精选栏、动态栏、列表页的可点性必须一致（UX-4 / L-3：现行 games 五条在动态栏全为非链接 `<span>`，而同条目在精选栏 / 墙格可点）。规则：模块条目统一复用详情页 slug 拼接逻辑（有 `m.page` 用 `/<模块>/<slug>/`，数据 `link` 仅作外链叠加）。

### 8.5 外链标注

外链统一挂 `.pick-ext`（mono、次级色、↗ 标注，site.css L1597）；外链在新标签打开（Hexo `external_link` 既有配置）。

### 8.6 空模块导航守卫

导航渲染时校验 `site.data.<key>.items` 非空，**空模块导航项不渲染**（IA-2：generator 对空模块不产页，无条件渲染导航即产死链；旧「删测试必 404」结论在当前数据下不成立，但潜在风险仍在）。与「无数据不渲染」铁律同构。

### 8.7 测试 / 示例数据禁止进生产构建

`source/_data/` 不得出现 `example.com` 外链与「测试」标题条目（IA-1：P0，收藏条目 example.com 线上可点已 curl 级取证）；CI 加断言。删除后模块各有 ≥1 真实条目，不触发空模块（IA-2 修正记录）。

### 8.8 摘要是人话

摘要经 helper 做 HTML 实体解码 + 空白折叠，**禁止机器转义痕迹（`&amp;&amp;`）与代码行号泄漏进摘要**（VD-8：Hexo `strip_html` 不解码实体 + EJS 二次转义，字节级实证）。

---

## 九、可访问性底线

### 9.1 对比度实测数据表（WCAG 2.1）

正文 ≥4.5:1；大文本 ≥3:1；本规范从严：**承载信息的文字一律按 4.5:1 验收**。

| 组合 | 比值 | 判定 | 出处 / 备注 |
|---|---|---|---|
| 墨 `#2a251d` on 纸底 `#f5f1e9` | **13.50:1** | AAA ✓ | DESIGN-REVIEW §四.1 |
| 墨 on 面板 `#fdfbf6` | 14.71:1 | AAA ✓ | 本规范复算 |
| 次级 `#736a5c` on 纸底 | **4.73:1** | AA ✓（正文） | SITE-AUDIT P1-3 已修 |
| 次级 on 面板 | 5.15:1 | AA ✓ | 本规范复算 |
| accent `#b0482a` on 纸底 | **4.90:1** | AA ✓ | DESIGN-REVIEW §四.1 |
| accent on 面板 | 5.33:1 | AA ✓ | 本规范复算 |
| 墨 on 黄块 `#e6b23c` | **7.82:1** | AAA ✓ | SITE-AUDIT P1-3 |
| 纸 on 黄块 | 1.88:1 | ✗ **禁止** | C-3 |
| 纸 on 橙块 `#dd5a2f`（现） | **3.64:1** | ✗ 不达 AA | VD-4 / P1-4 |
| 纸 on 橙块 `#c0491f`（加深后） | **4.82:1** | AA ✓ | VD-4 建议值 |
| 墨 on 橙块 `#c0491f`（加深后） | 3.05:1 | ✗ **禁止** | 本规范复算（§2.2） |
| 纸上 `#f5f1e9` on 墨底 `#2a251d` | 13.50:1 | AAA ✓ | 反色块 |
| 复合白 `.72 / .78 / .88` on 墨底 | 7.69 / 8.75 / 10.81:1 | AAA ✓ | 主卡 meta / desc / tag |
| accent on 墨底 | 2.76:1 | ✗ **禁止** | 本规范复算（§2.2） |
| `--info-mark` `#6b6255` on 纸底 | **5.32:1** | AA ✓ | VD-11 建议值 |
| 分隔线 on 纸底 | 1.21:1 | 非文字 | — |
| 墨字 on `::selection` 复合底 | 10.58:1 | AAA ✓ | 本规范复算 |

**红线**：不达 AA 的组合（纸 on 黄块、墨 on 加深橙块、accent / 次级 / info-mark on 墨底、纸 on 现橙块）在任何页面、任何状态下不得出现。

### 9.2 键盘可达

1. Tab 顺序 = DOM 顺序 = 视觉顺序；关闭态九宫格不得进入 Tab 序列（UX-6）；
2. 全站加「跳到主内容」skip link（P2-2，现行缺失）；
3. 搜索模态焦点圈禁（P2-2：BS4 模态不锁 Tab，现行缺失）；
4. 焦点圈可见（§6.4）；
5. 所有功能可纯键盘完成（PRD §8.3）。

### 9.3 ARIA 规则

1. **控件可访问名与可见文案同源**：搜索按钮 `aria-label` 改同源取值（UX-15 / N-2，现行硬编码英文 "Search" 而可见文案是中文「搜索」）；
2. **对话框必须有关联标题**：`aria-labelledby` 指向真实存在的 id，或用 `aria-label`（UX-7）；
3. 导航当前页视觉双编码之外，补 `aria-current="page"`（**本规范新增**：IA-11 只规定了视觉层，读屏层同需位置感知，WCAG 2.4.8；审查报告未覆盖，见附录 B-9）；
4. 图标按钮（搜索 / 汉堡 / 关闭）须有可访问名；
5. 懒加载图片的非标准 `srcset` 标记清理（UX-13：无描述符 srcset 被规范忽略，LCP 不延迟，仅剩标记语义干净问题）。

### 9.4 状态不靠颜色单独表达

当前页 / 选中态 / 展开态必须形状 + 颜色双编码：导航 active = 墨底实心胶囊；九宫格选中 = 描边 + 形状变化；错误 / 空态 = 文案 + 结构，不单靠色（PRD §8.3；IA-11）。

### 9.5 标题层级

每页 h1 唯一（P1-1 已修，31/31，保持）；标题不跳级——唯一现存跳级源是搜索弹窗 h4（P2-1，改 h2 或补 role 后屏蔽）；文章页 heading 序列实测无跳级（保持）。

### 9.6 图片替代文本

有意义图片必须有描述性 `alt`；纯装饰图片 `alt=""`；全站 alt 覆盖率 100%（P1-2 已修，保持）；头像 / 封面 / favicon 的 alt 与文件名随素材确认后定值（§10-A13 / A14）。

---

## 十、附：待主人确认事项清单

> 本清单汇总规范中全部 **【建议值 · 待主人确认】** 项与审查报告开放项。未确认前，实施方按「现行值维持」处理；确认后逐条销项并更新本规范版本号。

### A. 设计值（影响 token，确认后即改）

| # | 事项 | 现值 → 建议值 | 依据 |
|---|---|---|---|
| A1 | 橙格加深 | `--block-orange` `#dd5a2f` → `#c0491f`（纸字 3.64 → 4.82:1）；条目小字升 0.8rem/700 | VD-4 / C-3 |
| A2 | accent 拆分：静态信息迁中性 | 新增 `--info-mark` `#6b6255`（5.32:1），约 12 处静态信息迁移；kicker 保留 accent | VD-11 / C-4 |
| A3 | 文章页三色回归 | `#2c3e50`/`#1a202c`/`#0366d6` → `#2a251d`/`#2a251d`/`#b0482a`（或 C-1 备选链接 `#a03f22` 5.77:1） | VD-1 / C-1 |
| A4 | `--accent-soft` 定值 | 现行两处 fallback `.12` / `.28` 不一致，补齐时必改一处视觉 | 本规范新发现（附录 B-2） |
| A5 | 圆角与 7 token 补齐 | `--r-tile` 22px → 12px；`--cream` 复用 `#fdfbf6`；补齐 `--r-card/--ink-warm/--cream-on-dark/--line-strong/--accent-soft` | VD-5 / C-6 |
| A6 | 暗色校准值（仅当启用） | body `#1a1814` / sec `#a7a9ad` / text `#c4c6c9` / accent 提亮 `#d9724a`（5.45:1） | C-7 |
| ~~A7~~ | ~~代码块底色~~ **已定（2026-10-19 采纳）** | `pre` 底 `#fdfbf6` + 1px hairline；行号槽分隔线与行内 code 底同步去冷灰 | VD-10 |
| ~~A8~~ | ~~水波下划线母题~~ **已定（2026-10-19 采纳）** | 文字链 hover：offset 3→6px、粗细 1→2px、零位移；`::selection` 改墨色 12%；卡 / 格上浮保留 | H-4 |
| ~~A9~~ | ~~身份词竖列升格~~ **已撤回（2026-10-21 主人：「01 Developer / 02 Writer 这哪好看」）**：模板块与 `.identity-words` 样式全删，`site.yml identity_words` 数据保留不渲染；2026-10-19 的「已定（采纳）」作废 | mono 0.78rem 次级 → 墨色 0.9rem + ls .2em + 词间 hairline + `01 / 02` 序数前缀 | H-2 |
| ~~A10~~ | ~~头像圆形化~~ **已定（2026-10-21 采纳）** | 12px 方卡 → 96px 圆形 + 1px `--line-strong` 描边 + 去阴影；84→96px 为面积补偿（π/4≈0.785）；圆角标尺唯一例外 | VD-7 / F-1 |

### B. 品牌、内容与露出位（主人决策，规范只给框架）

| # | 事项 | 说明 | 依据 |
|---|---|---|---|
| B1 | 真名上首屏 | 真名已公开属既有信息，但首屏是新露出位；若上，建议副行「KASAI · 韩耀宇」 | F-2 / H-1 |
| B2 | 站名去 `Blog` 后缀 | 效果图基准「YaoZenO / Personal Space」无 Blog；品牌资产决策，只给依据不替定。排印三件套不动 | N-3 |
| B3 | ~~头像素材~~ **已消解** | 现有 `11.jpg` 即主人个人头像（提交 `a90325e` 替换）；形态问题（A10）已定：96px 圆形 + 1px `--line-strong` 描边 + 无阴影，2026-10-21 确认落地 | VD-7（已更正） / F-1 |
| B4 | favicon 素材 | 32px / 180px，建议砖红 + 墨 / 纸字母标；现仍 `/img/fluid.png` | VD-6 |
| B5 | 联系方式 | 是否放邮箱（最稳）；`instagram.com/yaozenx` 归属核实；links 空态文案随渠道补齐方成立 | M-2 / M-3 |
| B6 | motto 位置与去重 | 效果图基准在首页左下收尾（现行正确，建议维持）；`about.intro` 与 motto 同值，删哪处定 | E-3 |
| B7 | 「近期动态」栏改名 | 改「最近更新 / 更新记录」；勿用暗示社交语义的词 | IA-9 / L-2 |
| B8 | 测试条目删除后是否补真实项目 | 删后精选栏从 2 条变 1 条；补不补第二条真实项目 | IA-1 决策项 |
| B9 | 墙格与导航去重方向 | 墙格不重复导航可点模块，或导航把三者移入「更多」（两种都成立） | IA-8 / W-2 |
| B10 | 404 自动跳转 | 10s 强制跳转是否保留，或改纯按钮 / 延长 30s | UX-8 |
| B11 | 身份域 CTA 与档案页入口文案 | CTA 组后补「现在 / 我在用什么」并排文字链的措辞；CTA 现有文案占位 | IA-10 / F-7 |
| B12 | 页脚署名具体文案 | 规则已定（品牌位站名 / 身份位真名 / 页脚真名+站名），具体字符串待定 | F-5 / F-6 |
| B13 | 纸面黄调 | 维持 `#f5f1e9`（人格载体）；备选 `#f7f4ee` 有定量数据 | C-8 |
| B14 | URL 日期漂移处置（部署向） | Vercel 加 `TZ=Asia/Shanghai`；已上线 `/04/23` URL 是否加重定向 | IA-3 |
| B15 | `design/design-language.html` 处置 | 历史提案文档与现行 token 分叉（附录 B-1）：标注为历史提案，或按现行 token 更新 | 本规范新发现 |

---

## 附录 A：引用编号索引

| 编号前缀 | 出处 |
|---|---|
| VD-1 ~ VD-13 | DESIGN-REVIEW-2026-10-18 §二.A 视觉设计 |
| UX-1 ~ UX-16 | DESIGN-REVIEW-2026-10-18 §二.B 用户体验 |
| IA-1 ~ IA-12 | DESIGN-REVIEW-2026-10-18 §二.C 信息架构 |
| RL-1 ~ RL-4 | DESIGN-REVIEW-2026-10-18 §二.D 响应式布局 |
| C-1 ~ C-8 | HOMEPAGE-REVIEW-2026-10-17 §二 色彩体系 |
| F-1 ~ F-10 | HOMEPAGE-REVIEW-2026-10-17 §1.2 框架层 |
| N-1 ~ N-3 / H-1 ~ H-4 / W-1 ~ W-2 / L-1 ~ L-3 / D-1 ~ D-3 / A-1 ~ A-3 / M-1 ~ M-3 / R-1 ~ R-3 / E-1 ~ E-3 | HOMEPAGE-REVIEW-2026-10-17 §三 各板块 |
| P0-x / P1-x / P2-x | UI-AUDIT-2026-10-17 §二 / §三 / §四 |
| E-0xx | ERRORS.md / ENGINEERING.md 工程记录 |

## 附录 B：本规范新增 / 补强条款（审查报告未覆盖）

1. **`design/design-language.html` 与现行实现的 token 分叉**：该文件（纸面档案 v1.0 静态提案）定义了一整套与现行不同的值——`--paper: #f5f4ef`（现行纸底 `#f5f1e9`）、`--ink: #0f0f0e`（现行墨 `#2a251d`）、`--r-tile: 22px`、`--r-ctrl: 8px`、`--muted: #6b675e`、`--accent-on-dark: #e2967f` 等。后人若照它改色即破体系。建议处置：标注为历史提案，或按现行 token 更新（待确认 B-15）。
2. **`--accent-soft` 两个不同 fallback**：site.css L1554 用 `rgba(176,72,42,.12)`、L1612 用 `rgba(176,72,42,.28)`。VD-5「补齐 7 个 token」时必然改变其中一处现有视觉，补齐前须定值（待确认 A4）。
3. **橙块墨字陷阱**：VD-4 只验了「纸色字 4.82:1 达标」；加深后墨字仅 3.05:1（现行橙上墨字 4.04:1 也不足 4.5:1）。若有人照黄格模式「统一块内用墨色」会踩雷——本规范 §2.2 已明令橙块禁墨色。
4. **反色块用色禁令**：墨底反色块上 accent 2.76:1 / 次级 2.86:1 / info-mark 2.54:1 均不达 AA，审查报告未列此条。本规范 §2.2 补齐。
5. **照片格压图白字无对比度保底**：审查实测只覆盖静态色值；照片格文字对比度取决于封面图明度，mask 是唯一兜底。本规范 §2.2 立保底规则 + 选图人工核对。
6. **低于 12px 的可见文字不止一处**：VD-4 只点名 `.wall-cell-item`；`.wall-cell-tag` / `.feed-type` / `.feed-date` / `.tag-chip-count` / `.detail-tag`（0.74rem）与 `.pick-ext` / `.archive-picks .pick-meta`（0.7rem）同样低于中文 12px 下限。本规范 §3.3 列全清单并统一处置。
7. **主题 tagcloud 冷蓝渐变色为潜在破口**：`_config.yml` L1026-1027（`#BBBBEE` → `#337ab7`）被 tags.ejs 读取但未使用，当前死配置；若恢复字号渐变会同时引入冷蓝渐变。本规范 §2.3 列入禁止表。
8. **主题默认冷灰未入禁止清单**：`link_hover_bg_color` `#f8f9fa`、`button_hover_bg_color` `#f2f3f5`、滚动条 `#c4c6c9` / `#a6a6a6`。纸面组件一旦回退主题 hover 态即露出冷灰。本规范 §2.3 列为观察项。
9. **导航当前页缺读屏层感知**：IA-11 只规定视觉双编码；`aria-current="page"` 为读屏层同需项（WCAG 2.4.8）。本规范 §9.3 补规则。

---

## 十一、V4「静纸」修订案（2026-10-29）

依据 `DESIGN-REVIEW-2026-10-29.md`（缺陷 D-1~D-11）与 `DESIGN-ROADMAP-2026-10-29.md`
（P0–P3 执行步骤）落地。原则不变：纸面档案的「无装饰」立身之本；
变化集中在**色温归一、字重收口、构图主次**三件事，不引入新装饰、新彩色、
新动效母题。以下五项为对既有条款的**替代**，被替代条款以本表为准。

| # | 修订项 | 现行（V4 之后） | 替代条款 | 理由 |
|---|---|---|---|---|
| 1 | 纸色 / 墨色 | 纸 `#faf9f5`、面板 `#fffefb`、墨 `#141413`、次级 `#6b6862`、分隔线 `#cfc6b2` 保持 | §2.1 色彩 token 总表；附录 B-1 中 `design/design-language.html` 的历史值 | 原纸 `#f5f1e9` 偏黄、墨 `#2a251d` 偏暖褐，长时间阅读有「旧报纸」疲劳感；新值对齐 Anthropic 同源象牙白与中性墨。`--accent #b0482a` **不动**（对纸 5.24:1 过 AA；Anthropic 陶土橙 `#d97757` 仅 2.97:1，不可做文字） |
| 2 | 标题轨与字阶 | 全站标题走 `--font-display`（Archivo 变量字重 + 系统中文黑体）；宋体系 `--font-serif-title` 仅保留给 `.cal-page` 单页例外；字重 900 全线收口到 800/700 | §3.1 三轨排版；§3.2 字阶表 D0+/D0/D1-/D2/D4/B2 各行 | 原状同一屏出现黑体页头 + 宋体标题两套字体（D-1），且 900 字重在全站层级压缩成「全部一样响」（D-2）。收口后层级由字号与留白承担，不再靠字重与单点超大字号 |
| 3 | 首屏构图 | `.home-hero` 由 5:7 改为 4:8（`minmax(0,4fr) minmax(0,8fr)`），身份域收窄、内容墙加宽；`--fs-hero` 主卡标题 `clamp(2rem, 3.2vw, 2.9rem)` | §5.2 首页身份域；§7.1 不对称编辑网格构成规则 | 原 5:7 把「谁」与「写了什么」的主次做反了（D-3）；首页目的是读，身份域只需立得住 |
| 4 | 页脚 | 首页隐藏全局 `<footer>`（`body.is-home footer { display:none }`），只保留 `.home-end`；其余页统一 `.footer-inner` 1200px 定宽 + 2px `--rule` 顶线 + 左对齐 | §5.8 页脚与署名 | 原状首页同时出现 `.home-end` 与全局页脚两套收尾（D-5），视觉上是两个句号 |
| 5 | 导航断点 | 断点从 Bootstrap `lg=992` 改为 **840**：`<840` 收汉堡九宫格，`≥840` 显示居中胶囊 + 辅助导航 | §7.2 断点体系（统一 .98 家族）；§5.1 导航胶囊 | 原 768–991 平板段导航整段消失（D-7），只剩品牌与汉堡，平板用户少一层入口 |

**同批落地的结构修正（不新增设计语言，只是把已规定的原则做实）：**
`--space-page-top`（`clamp(104px, 12vh, 136px)`）统一首页与纸面页入口顶距（D-10）；
`.wall` 固定行高 `196px`（≤991 `170px`，主卡 `span 2`）让内容墙行基线对齐（D-4）；
`.about-head` 收 `max-width: 42rem`、`.about-avatar-box` 132px，修关于页头像贴右缘（D-6）。

**未采纳（明确不做）：** 换强调色为陶土橙（对比度不达标）、加圆角/阴影/渐变装饰
（违背无装饰立身之本）、引入第二套展示字体（D-1 反方向）、首页追加区块（信息增量无需求）。

---

## 十二、V5「归静」修订案（2026-10-31）

依据：**主人拍板「整体与节假日页保持一致」**。V4 把主站往参考站方向调了色温与字重，
但标题轨走了反方向（无衬线），导致主站与节假日页仍像两个站。V5 不再维持「单页例外」
结构——把 `.cal-page` 参考站视觉作用域的色板与字体轨升格为**全站基准**，例外条款作废。
以下为对既有条款（含 §11 V4 修订案）的**替代**，冲突处以本表为准。

| # | 修订项 | 现行（V5 之后） | 替代条款 | 理由 |
|---|---|---|---|---|
| 1 | 色板 | 纸 `#f7f6f4`、墨 `#1a1a1a`、次级 `#6b6b6b`、强调 `#c4463a`（朱红）；分隔线 `#cfc6b2` 保持 | §2.1 色彩 token 总表；§11 表第 1 行（`#faf9f5`/`#141413`/`#6b6862` 与「accent #b0482a 不动」） | 主人明确偏好节假日页气质。强调色做文字 4.57:1，仅限大字号与交互态；正文文字链接不使用强调色 |
| 2 | 标题轨与字重 | 全站标题衬线：Fraunces 600（拉丁，自托管）+ 宋体系（中文），字重一律 600；`--font-display` 保留定义、暂无标题消费者 | §3.1 三轨排版；§11 表第 2 行（无衬线 Archivo 700） | V4 后主站标题「硬」一档是两套风格落差的主因；长文与文化内容配衬线收益最大。字重 600 = 参考站口径，层级靠字号与留白 |
| 3 | 链接体系 | 正文链接：墨色 + 细下划线（`text-underline-offset: 2px`），hover 转 accent；蓝 `#1b5fc1` **仅**术语链（`.cal-page a.z-link`）；accent 只做交互态与图形点缀 | §6 交互原则中链接用色相关条款 | 参考站行为：正文不放彩色文字链接，蓝色只标注可跳转术语 |
| 4 | 视觉作用域 | `.cal-page` 作用域族（holidays / zodiac / festival / cityrank / city）与全站**同值**；其局部 token 覆盖保留为等值冗余隔离层 | 「单页例外」全部相关条款 | 例外升格为基准后，新增工具页不再产生第二套皮肤；未来若调全站色，cal 族隔离层需同步（test/css-tokens.js 与 holidays-e2e 正向断言已锁定） |
| 5 | 辅助导航 | `aux_menu` 4 项：节假日 / 资料库 / 生肖 / 城市榜；工具页不得出现无入口孤岛 | §5.1 导航（辅助组 2 项状态） | 生肖此前无导航入口、城市榜完全孤岛，发现路径不一致 |
| 6 | 可访问性补齐 | skip link（`.skip-link` → `#main-content`，`<main tabindex="-1">`） | §九 可访问性底线（键盘项） | 键盘用户此前须 Tab 穿过整个导航 |

**保留不动：** 黄块 `#e2bc6a` / 橙块 `#c0491f` 内容入口卡（内容层，不入色板体系）；
暗色模式仍不启用（未校准）；`.cal-page` 纸底断言、admin.css `--accent` 等值锁定照旧生效。

**开发态文案纪律（同批落地）：** 模板的数据缺失兜底文案不得向访客暴露仓库路径与
构建指令（F-6）；诊断信息降级为 HTML 注释 `<!-- dev: … -->`，且不含仓库路径。

---

## 十三、V6「归蓝」修订案（2026-10-31 深夜）

依据：**主人拍板「色系不好看，全盘学习本地项目 Ties（relationship）的风格，不做任何保留；
Liquid Glass 玻璃质感也要」。** token 上游：
`D:/02_Projects/D0202_Personal/relationship/web/src/styles/tokens.css`。
§12 的参考站暖色体系（纸 `#f7f6f4` / 朱红 `#c4463a`）整体退役。冲突处以本表为准。

| # | 修订项 | 现行（V6 之后） | 替代条款 | 备注 |
|---|---|---|---|---|
| 1 | 底色 | ambient 渐变 `#f6f7fb→#f1f3f8(55%)→#f4f2f7`，`body::before` fixed 承载，本体透明；主题 `body_bg_color=#f1f3f8` 为兜底 | §12 表第 1 行（纸 `#f7f6f4`） | Ties `--bg-ambient-grad` 同源 |
| 2 | 墨色阶 | 主 `#1d1d25`（ink-1）/ 次 `#4c4c58`（ink-2）/ info-mark `#4c4c58`；ink-3 `#858593` 仅 3.3:1，只准大字号或非文字 | §12（`#1a1a1a`/`#6b6b6b`） | AA 校验按 ambient 底 |
| 3 | 强调 | 品牌蓝 `#0a7cff`，hover/strong `#0066e6`；accent-soft `rgba(10,124,255,.12)` | §12 表第 1 行（朱红 `#c4463a`） | admin.css `--accent` 同步，css-tokens 锁等值 |
| 4 | 标题字体 | **保持 §12 的衬线轨（Fraunces 600 + 宋体）不变**——主人看过对比图后明确选择保留，色系迁移不扩到字体 | — | 唯一未随 Ties 走的一项，主人亲自拍板 |
| 5 | 链接 | 正文/术语链统一品牌蓝 + 细下划线，hover `#0066e6` | §12 表第 3 行（墨色链接） | 蓝即强调，不再有「墨色正文链接」态 |
| 6 | 内容块 | 黄 `#e2bc6a` / 橙 `#c0491f` 退役 → 淡蓝 `rgba(10,124,255,.12)`（墨字）+ 品牌蓝 `#0a7cff`（白字）；token 名 `--block-yellow/orange` 保留防断链 | §12「保留不动」中黄/橙条款 | 主人看过对比图拍板换蓝 |
| 7 | 玻璃材质 | 导航胶囊/下拉/移动端九宫格：半透明白（0.55–0.82）+ `backdrop-filter blur(20px) saturate(1.5)` + 白色高光描边 `rgba(255,255,255,.75)` + 蓝调阴影 `rgba(31,38,80,…)`；模块卡轻玻璃（半透明白 0.66，不加 blur）；圆角 12→16px | 纸面「无装饰」条款；§12 | Ties Liquid Glass L0–L3 分层的博客版裁剪 |
| 8 | hairline | 分隔线 `#cfc6b2`（暖）→ `#ccd3e0`（冷） | §2 分隔线 | 跟随底色色温 |

**保留不动：** 反色墨块机制（`--surface-ink #1d1d25` / `--on-ink #f6f7fb`，仅换值）；
等宽元信息轨；「无数据不渲染」纪律。**回滚：** V5 暖色版三件套备份于
`design/backup-V5-warm-2026-10-31/`（site.css / admin.css / fluid_config.yml），拷回原位即恢复。

**V6.1（2026-10-31 同日迭代，主人实测反馈）：**
① 玻璃液态化加强：胶囊透明度 0.55→0.45、blur 20→24px、saturate 1.5→1.8；
② 辅助导航（节假日/资料库/生肖/城市榜）从裸文字升级为第二枚玻璃胶囊；
③ 生肖页 `.z-nav-strip` 与节日页 `.fs-nav-strip` 的「上下 hairline 夹条」玻璃化
（裸 hairline 卡在 ambient 渐变上产生割裂感——凡悬浮于渐变之上的导航条一律玻璃化）；
④ 节假日页专属「印章红」：`.pg-holidays { --accent: #c4463a; --accent-strong: #a83a30; }`，
日历休块/圆环/面板小标随红，蓝留给术语链；冷色系与其它页面不动。

**V6.2（2026-10-31 深夜，主人反馈「除节假日红外看不出任何变化」）：**
根因是近白渐变底上玻璃不可见——玻璃的透与液必须有颜色可透射。移植 Ties
MainLayout `.ambient__blob` 四色光场（蓝 `#aec8f0` / 紫 `#d4c6ee` / 桃 `#f6d9bd` /
薄荷 `#c0e6d3`，radial 软边合并进 `body::before` 多层背景，避免大面积 filter
GPU 开销），56s 极慢漂移（reduced-motion 静止）。**纪律：凡 Liquid Glass 体系，
氛围光场与玻璃层成对存在，不得只改玻璃不动光场。**

---

## 十四、V6.5「暖纸玻璃」修订案（2026-11-01）

依据：**主人看过三方向对比图后拍板「C · 暖纸 + 保留轻玻璃」。** 目标是向 Anthropic
品牌气质靠拢（暖纸 `#faf9f5` / 陶土橙 / 衬线标题），但**不放弃已落地的 Liquid Glass
骨架**——玻璃的「液」需要暖色透射，所以光场随底色一起转暖。V6 的冷蓝 / 冷灰整体退役，
玻璃层、圆角、毛玻璃参数、heading 衬线轨全部保留。审查依据
`DESIGN-REVIEW-2026-11-01.md`，执行顺序 `DESIGN-ROADMAP-2026-11-01.md`。

| # | 修订项 | 现行（V6.5） | 替代条款 | 备注 |
|---|---|---|---|---|
| 1 | 底色 | ambient 渐变 `#fdfaf4→#faf6ee(55%)→#f7f2ea`；主题 `body_bg_color=#faf6ee` 兜底，`html` 底 `#faf6ee` | §13 表第 1 行（冷 `#f1f3f8`） | Anthropic Light `#faf9f5` 的略暖变体 |
| 2 | 墨色阶 | 主 `#1b1712`（纸底 17.1:1）/ 次 `#5a5247`（7.4:1，兼 --info-mark）/ 弱 `#7a7062`（3.3:1，限大字或非文字） | §13 表第 2 行（`#1d1d25`/`#4c4c58`） | 全部按暖纸底重新校验 AA |
| 3 | 强调 | 陶土深调 `#a8482c`（纸底 5.4:1），hover/strong `#8c3a22`；accent-soft `rgba(168,72,44,.12)` | §13 表第 3 行（品牌蓝 `#0a7cff`） | admin.css `--accent` 同值，css-tokens 锁 |
| 4 | 官方陶土橙 | `#d97757`（Anthropic Orange）**仅作非文字装饰**（分隔、下划线、图标、光场）；在暖纸上 2.98:1，做文字必然低于 AA | 无（新条款） | 想让字更橙只能加粗加字号，不许降底色 |
| 5 | 链接 | 正文/术语链统一陶土深调 + 细下划线，hover `#8c3a22`；`--z-link` 与 `--accent` 同值 | §13 表第 5 行 | 不再有「蓝色术语链」态 |
| 6 | 内容块 | 淡陶土块 `rgba(168,72,44,.12)`（墨字）+ 深陶土块 `#a8482c`（纸字 5.8:1，全字号达标）；token 名 `--block-yellow/orange` 沿用防断链 | §13 表第 6 行（蓝色系） | 与 §13 的「白字只在大字/粗体达标」相比，本条已全字号达标 |
| 7 | 光场 | 四色改暖：陶土 `rgba(240,214,190,.62)` / 沙 `rgba(233,224,200,.55)` / 粉陶 `rgba(232,201,182,.52)` / 鼠尾草 `rgba(212,225,206,.45)`；56s 漂移与 reduced-motion 静止不变 | §13 V6.2 的蓝紫桃薄荷 | **纪律沿用**：光场与玻璃层成对存在 |
| 8 | 玻璃层 | 参数（blur 24–28px / saturate 1.8–2 / 0.42–0.82 透明度 / 暖白高光描边）**不动**，只把底色调到暖白 `rgba(255,253,247,…)`、阴影转暖棕 `rgba(90,70,50,.28)` | §13 表第 7 行（冷白 + 蓝调阴影） | 方向 C 的核心：骨架留、色温换 |
| 9 | hairline | `line_color` `#e2d8c6`（对纸底约 1.3:1，层级线口径），组顶线仍用 `--rule-strong` 全墨 | §13 表第 8 行（冷灰 `#ccd3e0`） | 暖底上冷灰会发脏 |
| 10 | 标题轨 | **完整保留 V5 衬线轨（Fraunces 600 + 宋体）**，随 Anthropic「Lora/Poppins 组合」的气质走，不改回黑体 | §13 表第 4 行 | 本轮唯一零改动项 |

**保留不动：** Liquid Glass 全部分层参数与圆角三档（`--r-xs/--r-sm/--r-tile`）；
反色墨块机制（仅换值到 `#1b1712` / `#fdfaf4`）；等宽元信息轨；「无数据不渲染」纪律；
节假日页 `.pg-holidays` 的印章红作用域覆盖（与全站陶土色同属暖红族，可共存）。

**同批修复（P0）：** ①归档摘录实体泄漏——`excerpt-text.js` 补数字实体解码
（`&#x2F;` 这类渲染后实体此前原样输出）；②模块页页头 H1 字重 700→600，与衬线标题轨统一。

**回滚：** V6.3 冷蓝三件套备份于 `design/backup-V6.3-blue-2026-11-01/`
（site.css / fluid_config.yml / admin.css），拷回原位即恢复冷蓝版。
**禁止**用 `git checkout --` / `git restore` 回滚（E-032：会连带抹掉未提交改动）。

---

**规范完** ｜ 设计系统专家 彩格调（Cai） ｜ 2026-10-18 ｜ 本文只规定 token 与规则；「改哪个文件哪一行」留给排期表。
V4 修订案追加于 2026-10-29（§11）。
V5 修订案追加于 2026-10-31（§12）。
V6 修订案追加于 2026-10-31（§13）。
V6.5 修订案追加于 2026-11-01（§14）。
