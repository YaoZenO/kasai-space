# 节日文化详情页族（`/library/<slug>/`）视觉设计规格

| 项 | 值 |
|---|---|
| 版本 / 状态 | V1.0（2026-10-27）· 供 Phase 4A 前端工程师直接落地 |
| 范围 | 12 个节日页（法定 6：`yuandan/chunjie/qingming/duanwu/zhongqiu/guoqing`；传统 6：`yuanxiao/qixi/zhongyuan/chongyang/dongzhi/laba`） |
| 上游依据 | `DESIGN-LANGUAGE.md` §5.17/§5.17.1/§5.18、`site.css` §4.12/§4.13/§4.14、`zodiac.ejs`、`library.ejs`、`FESTIVAL-PRD-2026-10-27.md` §5/§6/§8.5、`FESTIVAL-CONTENT-2026-10-27.md` §1/§16、`ERRORS.md` E-040/E-043/E-049/E-052 |
| 产出范围 | 仅本文档。不改任何现有文件、不写 CSS/EJS |

---

## 0. 视觉调性判定（先声明，后展开）

**本站已有成熟设计语言，本次全部沿用，零另起炉灶。**

- **判定依据（SOP 第 2 条 + 项目事实）**：本站是「纸面 + 墨色 + 砖红」编辑体系，且 `/holidays/`、`/zodiac/`、`/library/` 三族已共用 `.cal-page` 作用域下的参考站视觉破例（§5.17.1，主人 2026-10-22 拍板）。节日页族是这条族谱的第四个成员，不是新设计课题。
- **落地口径**：根元素挂 `paper-page cal-page fs-page` 三个类——`paper-page` 给页首避让与纸面框架（复用），`cal-page` 给参考站配色 / 字体作用域（复用 §4.12 一处定义，**§4.15 绝不重定义色值**，E-052 同型红线），`fs-page` 只作本族作用域钩子。
- **不采用「北欧风 × 现代风」等通用默认**——那适用于新建站点。
- 情绪关键词：纸上排印、工具页的安静、历法感、族内齐位。

---

## 1. 设计令牌表（一致性凭证）

### 1.1 复用既有（17 项，逐项标出处）

| Token / 值 | 取值 | 出处 | 本族用途 |
|---|---|---|---|
| 页底（`.cal-page` 作用域） | `#f7f6f4` | site.css §4.12 `.cal-page` | 页面底色 |
| `--text-color`（作用域覆盖值） | `#1a1a1a` | §4.12 | 标题 / 正文 / 组顶线 |
| `--sec-text-color`（作用域覆盖值） | `#6b6b6b` | §4.12 | 次级文字 / 目录 / 表头 |
| `--info-mark`（作用域覆盖值） | `#6b6b6b` | §4.12 | 计数 / 天数等静态信息 |
| `--accent`（作用域覆盖值） | `#c4463a`（hover `#a83a30`） | §4.12 | kicker / 当前态 / 进度环 / 链接 hover |
| `--z-link` | `#1b5fc1` | §4.13 | 正文内可跳转历法术语链（如有） |
| `--font-sans` | Nunito Sans + 系统中文栈 | `:root` §1 | 正文轨 |
| `--font-serif-title` | Fraunces 600 + 宋体系 | `:root` §1 | 页头标题 / 章节标题 |
| `--font-mono` | Cascadia Code 栈 | `:root` §1 | 元信息 / 表头 / 进度文案 |
| 表头沙色 | `#f7f5f0` | §4.12 `.cal-table thead th` | 全部表格表头底带 |
| `--rule` / `--rule-strong` | `.24 墨` 2px / 全墨 2px | `:root` §1 | 区块分隔 / 组顶线（两级线纪律 §4.3） |
| `--line-color` / `--line-strong` | 主题段 / `rgba(42,37,29,.24)` | 主题段 / `:root` | hairline / 描边强调 |
| `--site-float-shadow` / `--site-chip-border` | 既有唯一阴影 token / `rgba(42,37,29,.10)` | `:root` §1 | 移动端 FAB 与抽屉（全站唯一阴影，禁新增） |
| 圆角标尺 | 0 / 6px / 8px / **12px（`--r-tile`）** / 999px / 1.5px（日历格微圆角） | §4.4 + §4.12 | 容器一律 12px；控件 6/8px；FAB 999px |
| 间距值域 | 4–96px 既有标尺 + `clamp()` 流式 | §4.1 | 章节节奏 2.4rem、版心 `min(1200px, 100% - clamp(36px, 8vw, 96px))` |
| 版式既定值 | 正文 p 0.98rem/1.85；lede 1.0625rem/1.6 限宽 50rem；章节标题 clamp(1.3rem, 2.4vw, 1.65rem)/600 | §4.13 `.z-main` / `.cal-lede` / `.z-section-title` | 本族逐字沿用（见 §2 类名表） |
| 墨阶 alpha | `rgba(26,26,26,.06/.13/.24)` | §4.12 `.cal-cell` 系 | 纹样块的中性墨阶（见 §3） |

### 1.2 新增令牌（仅 12 个，全部【建议值 · 待主人确认】）

只新增一类：**12 个节日纹样主色变量 `--fs-fig-<slug>`**。间距、字阶、圆角、阴影、动效时长**零新增**。

成立理由：① `.fs-figure--css` 纹样需要每节一个可寻址的主色，写成变量才能被「只允许出现在纹样块规则里」的 grep 断言锁死；② 值域刻意压在同一饱和度 / 明度带（S≈25–45%、L≈30–55%）——同一套字体的不同变奏，而不是 12 张互不相干的彩图；③ 全部标【建议值 · 待主人确认】，对齐 DESIGN-LANGUAGE「找不到出处的新值一律标注」的铁律。

| slug | Token | 建议值 | 色名 / 意象 | 场底 | 备注 |
|---|---|---|---|---|---|
| `yuandan` | `--fs-fig-yuandan` | `#B5793A` | 初光铜金（新年初光） | 亮 | — |
| `chunjie` | `--fs-fig-chunjie` | `var(--accent)` | 朱砂（引作用域强调色，不另设值） | 深（本色铺底） | 最盛大的节日用全站强调色 |
| `qingming` | `--fs-fig-qingming` | `#7E8E6A` | 柳色（雨、柳） | 亮 | — |
| `duanwu` | `--fs-fig-duanwu` | `#5E7A55` | 艾绿（粽叶、艾草） | 亮 | 与柳色刻意拉开明度 |
| `zhongqiu` | `--fs-fig-zhongqiu` | `#33465C` | 靛夜（月夜） | 深 | ⚠ 唯一冷色相之一，见下方边界 |
| `guoqing` | `--fs-fig-guoqing` | `#A03226` | 绛红（旗） | 亮 | 比朱砂深一档 |
| `yuanxiao` | `--fs-fig-yuanxiao` | `#BF6B2F` | 灯橙（花灯） | 深 | — |
| `qixi` | `--fs-fig-qixi` | `#46586E` | 星桥蓝（鹊桥、银河） | 亮 | ⚠ 冷色相之二；样板纹样，见 §3.3 |
| `zhongyuan` | `--fs-fig-zhongyuan` | `#3F4A52` | 夜水青（河灯、夜河） | 深 | 灯点用 accent，一页至多 1 处 |
| `chongyang` | `--fs-fig-chongyang` | `#C09A3E` | 菊黄（登高、菊） | 亮 | — |
| `dongzhi` | `--fs-fig-dongzhi` | `#A5544A` | 素梅（九九消寒点染） | 亮 | — |
| `laba` | `--fs-fig-laba` | `#7A5C42` | 粥褐（腊八粥） | 亮 | — |

**边界纪律（必须写进 §4.15 段头注释 + 测试断言）**：

1. `--fs-fig-*` **只允许出现在 `.fs-figure--css` 及其子元素规则中**；用于文字、边框、背景、交互元素、进度元素即 FAIL（grep 断言可照抄 `test/zodiac-e2e.js` 对 `--z-link` 的边界锁法）。
2. 这是 §5.17.1「单页视觉破例」机制的**族级延伸**：破例边界 = `.fs-page` 作用域 + 装饰纹样块。纹样块 `aria-hidden="true"`、无任何交互元素、无文字压底，满足 R-2 对装饰色块的豁免前提；且**不在 `:root` 定义**，只随 `.fs-page` 作用域下发（与 `--z-link` 同法）。
3. 若主人不批两个冷色（`zhongqiu` / `qixi`），回退值为墨青 `#3F4A52`（两页共用，构图差异仍在）。

### 1.3 动效时长（零新增，全部落在白名单）

| 动效 | 值 | 出处 |
|---|---|---|
| 链接颜色 / 下划线粗细与偏移过渡 | 0.2s ease | §7 水波基线 |
| 卡 / 格上浮 | 本族**不用**（目录、表格、纹样块均无 hover 位移） | — |
| 目录收起箭头旋转 | 0.18s ease，`rotate(-90deg)` | §4.13 `.z-toc-chevron` 既有先例 |
| 移动抽屉滑入 | transform 0.22s ease；遮罩 opacity/visibility 0.2s | §4.13 `.z-toc-sheet` 既有先例 |
| 进度环 | stroke-dashoffset 0.1s linear（进度指示，非装饰） | §4.13 `.z-ring-fill` 既有先例 |

---

## 2. 页面骨架规格

### 2.1 区块顺序与 `.fs-*` 全表

页内顺序（自上而下）：

| 序 | 区块 | 类名 | 规格要点 | PRD 依据 |
|---|---|---|---|---|
| 1 | 面包屑 | 复用 `.cal-crumb`（**不新建**） | `资料库 / 节日文化 / <节日名>`，中段链 `/library/#topic-festivals` | §5.4 |
| 2 | 页头 | 复用 `.page-head` + `.page-head-kicker`（`FESTIVAL`）+ `.page-head-title` | 标题只写节日名 | §5.4 |
| 3 | 导语 | 复用 `.cal-lede` | 一段，内容清单 §B 页头导语 | §6.1 砍「引导段」并入此处 |
| 4 | 元信息行 | 复用 `.archive-total` | `更新于 <date> · <拼音> · 法定假日 N 天 / 非法定`，全等宽轨 | §5.4 |
| 5 | 12 slug 导航条 | `.fs-nav-strip` + `.fs-nav-strip-label` + `.fs-nav-current` | 版式逐字复制 `.z-nav-strip`（见 §3.1 窄屏方案） | §5.4 / E-049 |
| 6 | 主图位 | `.fs-figure` > `.fs-figure-media`（实图 `<img>` 或 `.fs-figure--css`）+ `figcaption` 署名行 | 16:9、12px 圆角、1px hairline 边框（见 §3.2） | §5.4 / §6.3 / 8.5 裁决 |
| 7 | 两栏主体 | `.fs-layout` > `.fs-main` + `.fs-toc` | `minmax(0,1fr) 15rem`，gap `clamp(2rem, 4vw, 3.5rem)`，`align-items: start` | §5.3 |
| 8 | 章节 ×9–11 | `.fs-section` + `.fs-section-title`（h2，锚 `#sec-<id>`）+ `.fs-sub-title`（h3，不进目录） | 节间 `margin-top: 2.4rem`，首节 0 | §6.1 |
| 9 | facts 表（`what` 节内） | `.fs-facts`（基座复用 `.cal-table` + `.cal-table-wrap`） | 见 §5 | §6.1 |
| 10 | 逐年日期表（`when` 节内） | `.fs-years`（`<table class="cal-table fs-years">` + `tfoot` 展开按钮行） | 见 §4 | §5.2 / S12 |
| 11 | 词汇表（`vocab` 节内） | `.fs-vocab`（基座复用 `.cal-table` + `.cal-name` / `.cal-pinyin`） | 列宽复制 `.z-vocab`：第 2 列 7rem、第 4 列 11rem | §6.1 / E-063 教训：拼音列必须 `display: table-cell` |
| 12 | FAQ（`faq` 节内） | `.fs-faq` 内直接放复用的 `.cal-faq-item`（`<details>`） | 折叠样式零新建 | §6.1 |
| 13 | 相关阅读 | `.fs-related` + `.fs-related-list` + `.fs-related-item` | 模板自动生成：另 11 个节日 + 当年节假日页 | §5.6 |
| 14 | 底部口径 | 复用 `.cal-after` + `.cal-note` | 历法依据 / 官方与预计口径 / 民俗说法声明 | §5.5 |
| 15 | 移动目录 | `.fs-toc-fab` / `.fs-toc-overlay` / `.fs-toc-sheet`（+ `-head` / `-close`） | 逐字复制 `.z-toc-fab` 三件套的量值 | §5.3 |

### 2.2 右栏 sticky 目录 + 进度环规格（对齐 zodiac 既有实现，逐值锁定）

| 项 | 值 | 出处 |
|---|---|---|
| 容器 | `.fs-toc { position: sticky; top: 5.5rem; padding-left: 1.2rem; border-left: 1px solid var(--rule); }` | §4.13 `.z-toc` |
| 目录列表 | 模板按 `sections` 数据渲染 `<li><a href="#sec-<id>">`；**无 JS 时锚点必须可跳**；JS 只做进度环 / scrollspy / 收起 | §5.3 强制 |
| 列表项 | 字号 0.85rem、行高 1.5、`padding: .28rem .5rem`、圆角 6px、次级色；当前章 `.is-active` = 墨色 700 + `rgba(26,26,26,.05)` 底 | §4.13 `.z-toc-list` |
| 收起按钮 | 16px SVG chevron，`stroke: currentColor; stroke-width: 2`，收起态 `rotate(-90deg)`，0.18s | §4.13 `.z-toc-toggle` |
| 进度环 | SVG `width/height 36`，`viewBox 0 0 36 36`，两圆 `r=15.5`，`stroke-width 2.5`；底环 `stroke: var(--line-color)`，进度环 `stroke: var(--accent)`（作用域 `#c4463a`）、`stroke-dasharray: 97.4`、`rotate(-90deg)`，offset 由 JS 驱动 | §4.13 `.z-ring` 逐值 |
| 进度文案 | `已读 0%`（JS 更新数字），`--font-mono` 0.78rem，`font-variant-numeric: tabular-nums` | §4.13 `.z-toc-progress-text` |
| 进度区分隔 | 环块上方 `border-top: 1px solid var(--rule)`，`margin-top .9rem / padding-top .8rem` | §4.13 |

### 2.3 章节标题与锚点

- `.fs-section-title`：`--font-serif-title`，`clamp(1.3rem, 2.4vw, 1.65rem)`，600，`letter-spacing: -0.01em`（= `.z-section-title` 逐值）。`title` 允许变体（裁决 15-2），`id` 锁死 11 值集合。
- `.fs-sub-title`：1.02rem / 700，`margin: 1.6rem 0 .7rem`（= `.z-sub-title`）。
- **锚点落点**：`.fs-section` 不在 `.markdown-body` 内，主题的 `-5rem` 避让 hack 不命中——跳转后标题可能顶进悬浮胶囊下沿。规格：给 `.fs-section { scroll-margin-top: 5.5rem; }`，并在 1440 / 390 两档实测一次。

---

## 3. 栅格与断点方案

### 3.1 两栏栅格定义（对齐 zodiac）

- 版心：`min(1200px, 100% - clamp(36px, 8vw, 96px))`（`.home-wrap` 复用）。
- 主体：`grid-template-columns: minmax(0, 1fr) 15rem; gap: clamp(2rem, 4vw, 3.5rem); align-items: start; margin-top: 2rem`（= `.z-layout` 逐值；15rem 右栏与 zodiac 目录同宽，用户在两族间横跳时右栏不跳）。
- 页首留白：`clamp(104px, 14vh, 150px)`（`.paper-page` 复用）；页头块 `margin-bottom: 1.5rem`（`.cal-page .page-head` 既有覆盖）。

### 3.2 断点行为表（统一 .98 家族，§7.2）

| 视口 | 布局行为 |
|---|---|
| ≥1440 | 两栏 `1fr + 15rem`，gap 吃 `clamp` 上限 3.5rem；日期表全列展开；纹样 / 实图 16:9 满左栏宽（约 950px） |
| 1024 | 与 1440 同构（gap 收窄至 ~2.6rem）；无独立变化 |
| 992–1439 | 同上；**≥992 恒为两栏**（.98 家族断点），右栏目录常驻 |
| 768–991.98 | 单列：`.fs-layout` 转一列、`.fs-toc` 隐藏、FAB + 底部抽屉出现；日期表列随容器收窄，`cal-table-wrap` 内部横向滚动 |
| ≤575.98（含 390） | ① 导航条 wrap 换行（§3.3）；② 日期表 `min-width: 34rem` 装在 `.cal-table-wrap`（overflow-x:auto）里内滚，**页面级横向溢出必须为 0**（S11）；③ `.fs-facts tbody th` 收 6.5rem（「是否法定节假日」7 字在 0.92rem 下 ≈ 100px，6.5rem=104px 恰容一行，超出即FAIL 的口径见 E-043 实测法）；④ 纹样 / 实图保持 16:9 不裁切（`aspect-ratio` 天然成立）；⑤ 抽屉 `max-height: 72vh` 内滚 |

### 3.3 12 slug 导航条窄屏行为（E-049 前科的最终方案）

**最终选择：换行（`flex-wrap: wrap`），禁止横向滚动、禁止缩字距、禁止压缩间距到不可点。**

- 结构与量值逐字复制 `.z-nav-strip`：外层 `display:flex; flex-wrap: wrap; gap: .55rem 1.1rem; padding: .7rem 0; border-top/bottom: 1px solid var(--rule)`；内层 `ul` 同为 flex wrap、`gap: .3rem 1.05rem`（≤991.98px 收 `.3rem .85rem`）；`li` 字号 0.95rem / 行高 1.7。
- **防 E-049 三条硬规则**（写进注释 + 测试断言）：① `.fs-nav-strip` 与其 `ul` **不得出现 `flex: none`**；② 外层必须 `min-width: 0`；③ 导航条是版心内全宽块，不放进任何定宽列——E-049 的根因（外层不收缩、max-content 撑爆）在结构上被消掉，与 zodiac 16 项 2–3 字词的既有验证同构。
- **防 E-043 一条**：`li a` 与 `.fs-nav-current` 设 `white-space: nowrap`——2–3 字词任何情况下不得从词中断行；换行只发生在 `li` 之间。
- 390px 预期形态：「按节日查看」标签占首行左端，12 个词自然流成 3 行左右；每行 4–5 词。这是 zodiac 已上线的同款观感，族内一致优先于新方案。
- 当前项：`.fs-nav-current { font-weight: 700; color: var(--text-color); box-shadow: inset 0 -2px 0 var(--text-color); }`（= `.z-nav-current`，墨色加粗 + 2px 下划线，不用胶囊、不用砖红）。

### 3.4 移动端 FAB 与底部抽屉（逐值复制 zodiac）

| 项 | 值 |
|---|---|
| FAB | `position: fixed; right: 1rem; bottom: 1.2rem; z-index: 1050`；`#fdfbf6` 底 + 1px `--site-chip-border` + 999px 圆角 + `--site-float-shadow`；内 16px 三线 SVG + 「目录」（0.85rem / 700）；`padding: .55rem .9rem` |
| 遮罩 | `inset: 0; z-index: 1060; background: rgba(42,37,29,.32)`；关闭态 `opacity: 0; visibility: hidden; pointer-events: none`，0.2s |
| 抽屉 | `bottom sheet`，`z-index: 1070; max-height: 72vh; overflow-y: auto`；`#f7f6f4` 底、`16px 16px 0 0` 圆角、上投阴影 `0 -12px 32px -14px rgba(42,37,29,.28)`；关闭态 `translateY(102%)`，0.22s |
| 行为 | 复制 zodiac.js 逻辑到 festival.js（选择器换 `.fs-` 前缀，**不改 zodiac.js**）；无 JS 时 FAB / 遮罩 / 抽屉三者 `display:none`，正文与锚点照常可用 |

### 3.5 中文长词不词中断行的保障（E-043 / E-040）

1. **禁用清单**：`.fs-section-title`、`.fs-sub-title`、`.fs-nav-strip a`、`.cal-name`、表内 `th`、`.fs-figure figcaption` 一律不得出现 `overflow-wrap: anywhere` / `word-break: break-all`（anywhere 会击穿 min-content，E-040 实锤）。需要保护的长标题容器只允许 `overflow-wrap: break-word` 或不设。
2. **列宽显式化**：窄屏所有被压缩的列（facts 左列、日期表名称列）必须给显式 `min-width`/`width`（§3.2 表），不给浏览器自动分配的机会——E-043 的根因就是「留给容器的宽度小于文字 min-content」。
3. **验收法**：沿用 E-043 实测口径——390 档渲染层量 `clientHeight`，标题 / 词项 > 单行行高即 FAIL。

---

## 4. 逐年日期表规格

### 4.1 结构（法定 6 节 · 默认形态）

`<table class="cal-table fs-years">`，列：**年份 / 当天（月日 + 星期 + 农历）/ 放假区间 / 天数 / 标签**。样式全部复用既有件：

- 表头：`.cal-table thead th`（沙色 `#f7f5f0` 底带、mono 0.75rem/600、无下边框）。
- 单元格：当天走 `.cal-when`（`<time>` mono 0.86rem）+ `.cal-weekday`；区间走 `.cal-range` + `.cal-arrow`；天数走 `.cal-days`（mono 700 `--info-mark`，静态信息不沾 accent）。
- 标签列：`<span class="cal-tag">官方 / 预计</span>`——由 `holidays.yml` 的 `label` 决定，禁止文案手写。
- 行尾链：`/holidays/<年>/#holiday-<id>`，链接样式走 `.cal-after-line a` 同款（墨色 + 下划线，hover accent）。

### 4.2 「5 行 + 展开全部 11 行」——推荐实现：JS 类名方案（不是 `<details>`）

**推荐**：单表 11 行直出 + `<html>` 挂 `js` 类后收窄。

```html
<table class="cal-table fs-years" data-collapsed="true">
  <thead>…</thead>
  <tbody>
    <tr>…第 1–5 行（当前年起）…</tr>
    <tr data-fs-extra>…第 6 行…</tr>  ← 第 6–11 行均带 data-fs-extra
    …
  </tbody>
  <tfoot><tr><td colspan="5"><button class="fs-years-toggle" type="button"
    aria-expanded="false">展开全部 11 年 ↓</button></td></tr></tfoot>
</table>
```

- CSS：`.fs-years [data-fs-extra] { /* 默认可见，什么都不写 */ }`；仅当 JS 已在 `<html>` 挂上 `js` 类且表格处于收起态时才收：`html.js .fs-years[data-collapsed="true"] [data-fs-extra] { display: none; }`。
- **这样天然满足 S12**：无 JS → 11 行全部可见；有 JS → 默认 5 行 + 按钮。展开按钮切 `data-collapsed` 与 `aria-expanded`，文案在「展开全部 11 年 ↓ / 收起至最近 5 年 ↑」间切换。
- **明确否决 `<details>` 包表格行**：`<details>` 不是 `<table>` 的合法子元素（table 内容模型只允许 caption/colgroup/thead/tbody/tfoot/tr），要么渲染出非法 DOM，要么被迫拆成两张表（表头重复、行连续性断裂）。若前端坚持零 JS 方案，备选结构是「两张相邻表 + 第二张去 thead、`border-top: 0`」，但**首选上述类名方案**。
- 按钮样式：`--font-mono` 0.82rem、`--sec-text-color`、无底无框、下划线 offset 走 §7 水波基线；hover `--accent`。按钮是交互元素，允许 accent hover（不违反「静态信息迁中性」）。
- 展开状态的高度突变允许直切（无过渡）——高度动画不在动效白名单内。

### 4.3 元旦 / 国庆「放假日历表」变体

- 表头切换为：**年份 / 放假区间 / 天数 / 调休上班日**（数据驱动，模板条件渲染，样式不变）。
- 调休上班日复用 `.cal-makeup-day`（每日期一行、mono 0.8rem / 1.8）与 `.cal-makeup-none`；区间与天数复用 `.cal-range` / `.cal-days`。
- 同样走 5 行 + 展开（§4.2 结构原样适用，`colspan="4"`）。

---

## 5. facts 表规格：新建 `.fs-facts`（不复用 `.z-facts`）

**判定：新建 `.fs-facts`，但基座 100% 复用 `.cal-table`，新增规则只有一行列宽。**

```css
.fs-facts tbody th { width: 8rem; }   /* §4.15 内唯一一条 facts 规则 */
```

理由：

1. `.z-facts` 在 §4.13 只是一条列宽声明（`width: 7.5rem`），视觉本体全在 `.cal-table`——复用它省不了任何视觉代码，却让节日页族与生肖页族在样式段上互相耦合。生肖页日后重构改列宽 / 改结构，节日页会**静默**跟着变或静默断掉，这正是 E-052 要防的跨段漂移。
2. 本族 facts 有自己的演化方向：6 行固定行序（别称 / 农历 / 公历规则 / 是否法定 / 天数 / 当年日期）、法定 6 节带统一说明句、元旦 / 国庆两行由 helper 取值——列宽需求（8rem 容「是否法定节假日」7 字）也与生肖的 7.5rem 不同。
3. 成本极低：一行规则。视觉零重复（表格观感由 `.cal-table` 单源保证），族间解耦由命名边界保证。

---

## 6. `.fs-figure--css` 抽象纹样（本次核心交付）

### 6.1 设计逻辑：为什么这套图案能代表节日又不沦为装饰噪音

1. **母题来自站内既有语言，不外来**。本站已经有一种「几何纹样」：`/holidays/` 的 31 列年历格——ink-alpha 方块、accent 实心格、3px 墨点、细刻度。纹样体系是它的延伸：**同一套词汇（点阵 / 方格 / 细线 / 实心几何 / 一处 accent），换一种构图讲每个节日**。读者不需要学习新的视觉语言。
2. **一节一形，形有出处**。每个纹样 = 该节日**一个**核心意象的几何化（元旦＝初升的半轮日、端午＝舟、中秋＝满月……），不是「几个节日元素拼贴」。单一母题 + 大留白，才像主动选择的表达。
3. **克制的色彩叙事**。全体系只有三种墨：纹样主色 `--fs-fig-<slug>`（12 个 token）、中性墨阶 `rgba(26,26,26,.06/.13/.24)`（年历格既有值）、至多一处 accent 点。没有渐变色板、没有多色插画——12 页横排浏览时，是「同一套印章的不同印文」。
4. **亮场 / 深场交替**。12 页里 4 页深场（春节 / 中秋 / 元宵 / 中元——它们在文化里本来就是「夜」的节日）、8 页亮场（透纸底）。深场纹样的地位等价于一张深色照片（其上无文字无交互），让横向浏览有明暗节奏而不是 12 块同质色板。

### 6.2 类名与结构约定（模板渲染契约）

```html
<!-- 分支一：实图（6+ 页大概率走这条） -->
<figure class="fs-figure">
  <div class="fs-figure-media">
    <img src="/img/festival/<slug>.jpg" alt="<≥4 字描述>" loading="lazy" decoding="async">
  </div>
  <figcaption>图：<a href="<Commons 原文件页>" target="_blank" rel="noopener"><作者></a> / <授权></figcaption>
</figure>

<!-- 分支二：CSS 纹样（qixi 已判定；zhongyuan/chongyang/dongzhi/laba 可能跟随） -->
<figure class="fs-figure">
  <div class="fs-figure-media fs-figure--css" data-slug="qixi" aria-hidden="true">
    <i class="fs-fig-a"></i><i class="fs-fig-b"></i><i class="fs-fig-c"></i>
  </div>
  <!-- 无 figcaption：没有授权需要署，也不渲染空署名行 -->
</figure>
```

- 两分支共享同一个外壳盒：`aspect-ratio: 16/9; border-radius: var(--r-tile); border: 1px solid var(--line-color); overflow: hidden; position: relative`。实图分支的 `img` 在盒内 `width/height: 100%; object-fit: cover`。**两分支的唯一差异是填充物**——宽高比、圆角、边框、上下留白（figure `margin: 1.6rem 0 0`）完全一致，这就是「齐位」的全部保障。注意：实图分支多一行约 26px 的署名行，属预期内容差异，不算破位。
- `data-slug` 是纹样规则的唯一寻址钩子：`.fs-figure--css[data-slug="qixi"] { … }`。12 套规则互不引用。
- `aria-hidden="true"`：纹样是纯装饰、不承载信息（PRD alt 要求只约束有意义的图），S3 对该分支的断言是「命中 `.fs-figure--css` 且无空 `<img>`」，不要求 alt。
- 子元素统一用 `<i class="fs-fig-a/b/c">`（至多 3 个，无语义、无文字），配合容器自身的多层 `background` 与 `::before/::after`。

### 6.3 技术路线（为什么是 CSS 渐变，而不是 SVG / 图片）

| 候选 | 判定 |
|---|---|
| **多层 CSS background + 少量子元素（选定）** | PRD §6.3 写明「纯 CSS 绘制」；零网络请求、零额外 DOM 体积（12 页 × 每页 <1KB 规则）；`background` 多层合成足以表达点阵 / 线阵 / 实心几何 |
| inline SVG | 精度更高但违背「纯 CSS」裁决；12 页 × 每页数 KB 的重复标记；且 EJS 分支复杂度上升 |
| base64 / 雪碧图 | 与「每页 ≤1 张主图」性能约束冲突，否决 |
| Canvas / JS 生成 | 无 JS 时整块消失，违反渐进增强，否决 |

**老浏览器降级**：不支持多层背景 / `aspect-ratio` / `clip-path` 时——`aspect-ratio` 失效则盒子按内容高度塌陷，需补一行 `min-height: 13rem`（390 档 16:9 高 ≈ 197px，`min-height` 只在极老内核生效时不碰现代布局）；`clip-path` 失效退化为矩形（星形变方、山形变条）；多层背景失效退化为最后一层底色。**统一降级验收口径：纯色 / 纯矩形的色块即可接受**（等价于一张纯色照片），但不允许出现「空盒子 + 无边框」的消失态。

### 6.4 纹样技法速查（实现层映射）

| 母题元素 | 技法 |
|---|---|
| 点阵 / 银河渐隐 | `background-image: radial-gradient(circle, <色> 1.2px, transparent 1.3px)` + `background-size` 排布 + 外层 `mask` 或叠一层向边缘透明的同色渐隐 |
| 线阵（雨丝 / 刻度 / 水线） | `repeating-linear-gradient(<角度>, <色> 0 1px, transparent 1px Npx)` |
| 半轮日 / 碗弧 / 拱桥 | 半圆：`border-radius` 上半圆 + 只留 `border-top`；拱弧：宽横条 + `border-radius: 50%` 顶边描边（注意 50% 圆角只归头像的全站例外**不适用于 aria-hidden 装饰块内部的几何作图**，此处是绘图手段不是容器圆角，验收 grep 时以 `.fs-fig-*` 子元素规则为界） |
| 山形 / 五角星 | `clip-path: polygon(...)`；降级 = 矩形 |
| 描边圆 / 月轮 | `border: 1.5px solid` + `border-radius: 50%`（同上，作图语境） |
| 灯笼 / 满月实心圆 | `radial-gradient` 单点或子元素实心圆 |

### 6.5 12 个纹样方案一览（重点：`qixi` 写到可实现）

通用前提：亮场 = 容器透明（`.cal-page` 纸底 `#f7f6f4` 透出），深场 = 容器 `background: var(--fs-fig-<slug>)` 铺满。所有纹样**静止**（无 animation，A-2 禁循环动画）。

**① `qixi` 七夕 ——「纸上鹊桥」（样板，亮场，写最细）**

意象：版画式夜空。银河以墨点阵斜贯画面，一座细线拱桥跨过，桥两端各一颗星（牛郎 / 织女）。

- 容器：亮场 + `overflow: hidden`。
- 银河（`::before`）：`background-image: radial-gradient(circle, rgba(26,26,26,.35) 1.2px, transparent 1.4px)`，`background-size: 11px 11px`，整体旋转 `-24deg` 后放大出血（`position:absolute; inset:-30% -10%`），再叠一层 `linear-gradient(115deg, #f7f6f4 12%, transparent 45%, transparent 60%, #f7f6f4 92%)` 让点阵只在中央斜带可见——即「银河带」。带内墨点用两级 alpha（叠第二个 radial 点阵、alpha .15、`background-size: 23px 23px`）做出疏密。
- 拱桥（`.fs-fig-a`）：`position:absolute; left:14%; right:14%; bottom:22%; height:34%`；`border-top: 2px solid var(--fs-fig-qixi); border-radius: 50% 50% 0 0 / 100% 100% 0 0;`——一条上拱弧线。桥面下加三根短竖线（`::after` 用 `repeating-linear-gradient(90deg, var(--fs-fig-qixi) 0 2px, transparent 2px 22%)` 限高 12%）示意桥柱，柱只在弧线以下可见。
- 双星（`.fs-fig-b/.fs-fig-c`）：两枚实心圆，`width/height: 10px` 与 `7px`（织女大、牛郎小），色 `var(--fs-fig-qixi)`，分别钉在弧线两端点上方（坐标按 16:9 比例定位：`left:15.5%` / `right:15.5%`，`top` 对齐弧端）。
- 一处 accent（可选，二选一实现）：桥中点上方一枚 4px `var(--accent)` 点——鹊群先导。若嫌多余可省，全图只保留单一主色。
- 降级：多层背景失效 → 纸底 + 弧线 + 双星仍在（子元素规则独立于背景层）；全部失效 → 透明块 + hairline 边框，仍是合规色块。

**② `yuandan` 元旦 ——「初光」（亮场）**：水平地平线一条（`::before`，1px `rgba(26,26,26,.24)`，`bottom: 30%`）；半轮日（`.fs-fig-a`，直径 26% 宽的下半隐圆：`background: var(--fs-fig-yuandan); border-radius: 50%; bottom: 30%` 被 `overflow:hidden`…不，需完整半圆——用 `height: 13%` + `border-radius: 999px 999px 0 0` 的实心半圆坐地平线上）；地平线下方三行刻度点阵渐隐（`repeating-linear-gradient` 横线两条 + 透明度阶梯），读作「倒计时读秒的纸面刻度」。

**③ `chunjie` 春节 ——「爆竹光点」（深场）**：容器铺 `var(--fs-fig-chunjie)`（= 作用域 accent `#c4463a`）；其上两枚竖排灯笼轮廓（`.fs-fig-a/b`：`border: 1.5px solid rgba(245,241,233,.55); border-radius: 50%` 的椭圆 + 顶部/底部短竖线提绳与流苏，纸色 alpha）；背景一层稀疏光点阵（`radial-gradient` 白 alpha .18，`background-size: 34px 34px`，向边缘渐隐）。无墨色——春节是唯一「双色」（朱 + 纸 alpha）纹样。

**④ `qingming` 清明 ——「雨与山影」（亮场）**：斜雨线阵（`::before`，`repeating-linear-gradient(105deg, rgba(26,26,26,.10) 0 1px, transparent 1px 9px)`，只铺上半 70%）；山影（`.fs-fig-a`，底部两段重叠三角 `clip-path`，前层 `rgba(26,26,26,.24)`、后层 `.10`）；柳（`.fs-fig-b/c`，两枚小实心叶点 = 8px 圆 + `border-radius: 0 50% 50% 50%` 转角，色 `var(--fs-fig-qingming)`，挂在上半右侧）。

**⑤ `duanwu` 端午 ——「一舟」（亮场）**：三条水线（`::before`，`repeating-linear-gradient(180deg, rgba(26,26,26,.13) 0 1px, transparent 1px 18px)` 限在中带）；长舟（`.fs-fig-a`，`width: 58%; height: 7%; background: var(--fs-fig-duanwu); border-radius: 0 0 999px 999px` 的下弧舟底 + 左端翘头用 `clip-path` 补一角）；舟上四根竖桨（`.fs-fig-b`，`repeating-linear-gradient(90deg, rgba(26,26,26,.24) 0 2px, transparent 2px 14%)` 限高 16%，立在舟线上方）。

**⑥ `zhongqiu` 中秋 ——「满月」（深场）**：容器铺 `var(--fs-fig-zhongqiu)`；满月（`.fs-fig-a`，直径 30% 的实心圆 `rgba(245,241,233,.92)`，右上偏置，月面两枚浅坑：内叠 radial 暗点 alpha .08）；底部云带（`::before`，两条 1.5px 纸色 alpha .25 横线，不等长、左出血）。

**⑦ `guoqing` 国庆 ——「旗与星」（亮场）**：旗杆（`::before`，2px `rgba(26,26,26,.24)` 竖线，左侧 18% 处、高 64%）；旗面（`.fs-fig-a`，`width: 40%; aspect-ratio: 3/2; background: var(--fs-fig-guoqing)`，右缘切一阶梯角？不切，直角矩形 + 波动感由右缘三枚缺口 `clip-path` 给出，降级=矩形）；一大四小星（`.fs-fig-b` + `::after`，主星 12px `clip-path: polygon(五角)` 色纸白，四小星沿弧排 alpha .8；降级全为圆点/方块）。

**⑧ `yuanxiao` 元宵 ——「灯市」（深场）**：容器铺 `var(--fs-fig-yuanxiao)`；三盏异形灯一排（圆灯：纸白 alpha .9 实心圆；椭圆灯：同色 `border-radius: 50%` 拉高；方灯：`border-radius: 6px` 方块 alpha .75），各自顶部一根 1.5px 纸色 alpha .5 悬线不等长；灯下各一枚 4px alpha .4 倒影点。三灯大小不等（非均质，R-3 精神）。

**⑨ `zhongyuan` 中元 ——「河灯」（深场）**：容器铺 `var(--fs-fig-zhongyuan)`；一排水面灯点（`.fs-fig-a`，`repeating-radial-gradient` 不可控，改用子元素内 5–7 枚 5px `var(--accent)` 圆点以不等间距横排于画面下 1/3——这是全体系唯一 accent 落点）；每枚灯下一条 1px 纸色 alpha .3 短竖倒影线（`::after` 同法排布）；上方留大面积夜水青的空——安静是这个纹样的全部。

**⑩ `chongyang` 重阳 ——「登高」（亮场）**：两重山（`.fs-fig-a` 后层 `rgba(26,26,26,.10)`、`.fs-fig-b` 前层 `rgba(26,26,26,.24)`，各为单峰三角 `clip-path`，前山偏右压后山）；前山顶端一枚 8px `var(--fs-fig-chongyang)` 实心圆——登顶的人 / 一朵菊，全图唯一的饱和色落点；右上角一轮细描边圆（`::before`，1.5px `rgba(26,26,26,.24)` 圆环，残月位）。

**⑪ `dongzhi` 冬至 ——「九九消寒」（亮场）**：一枝梅（`.fs-fig-a`，两段折线枝：`border-left: 2px solid rgba(26,26,26,.24)` + 旋转段，或简化为一条 75° 斜线）；枝上九枚瓣（`.fs-fig-b` 与 `::after` 排布：8 枚 1.5px 描边圆 + 第 9 枚实心 `var(--fs-fig-dongzhi)`——「冬至起，日填一瓣」的消寒图本义；九枚沿枝不等距）。

**⑫ `laba` 腊八 ——「三碗」（亮场）**：三只碗（`.fs-fig-a/b/c`，宽度 22% / 18% / 14% 不等，各为上半开口的碗形：`border: 2px solid var(--fs-fig-laba); border-top: 0; border-radius: 0 0 999px 999px; height: 12%`），横排基线对齐、大小递减；每只碗上方两条竖向热气短线（容器 `::after` 用 `repeating-linear-gradient(90deg, rgba(26,26,26,.13) 0 1.5px, transparent 1.5px 10%)` 限高、错位排布）。

### 6.6 纹样块的三条禁止项

1. 禁止任何 `animation` / 循环动效（含「微光扫过」「呼吸」——那是 skeleton/loading 的观感，正是要避免的「缺图占位」联想）。
2. 禁止在纹样块上压任何文字、水印、节日名——文字解释越位，纹样就退化成横幅。
3. 禁止一个纹样引用另一个节日的 token（`data-slug` 规则互不引用），防止横向「串味」。

---

## 7. 相关阅读区块（`.fs-related`）

- 组顶 2px `--rule-strong` 全墨线（两级线纪律），标题「相关阅读」（D4 档可降半档：1.02rem / 700）。
- 列表：`grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 clamp(2rem, 4vw, 3.2rem)`；每行 `padding: .62rem 0; border-bottom: 1px solid var(--line-color)`，左节日名（0.92rem / 700 墨，hover accent）右 nothing——不放 note，只放 12 个词 + 1 条年页链，行式与 `.lb-entries` 观感一致但零复用耦合。
- 末行固定为当年节假日页（mono 0.8rem 次级色 + ↗ 无、站内链不加外链标注）。

---

## 8. 反 AI 味清单（本站语境）

本族明确避免：

1. **纹样像缺图占位**：禁止骨架屏微光、禁止「暂无图片」灰块、禁止居中放一个大问号 / 图标占位符——纹样必须是完成态。
2. **12 页各配一套渐变色板 / 多色插画**：色板只有「主色 + 墨阶 + ≤1 处 accent」，越界即装饰噪音。
3. **均质卡片阵列**（R-3）：相关阅读是行式列表不是卡片；纹样块不是「卡片」，是图位。
4. **Emoji / 图标字体装饰**：全族无 emoji；SVG 仅限目录 chevron / FAB 三线 / 关闭叉（zodiac 同款三件）。
5. **渐变横幅 / 玻璃拟态 / 发光阴影 / 大圆角**：圆角锁定标尺；阴影只有移动抽屉与 FAB 两处（既有 token）。
6. **居中大标题 + 副标题通栏套路**：标题一律左对齐、进编辑排版流；kicker 每页 1 处（`FESTIVAL`，accent）。
7. **动效炫技**：只允许 §1.3 表内的既有先例；纹样块绝对静止。
8. **统计 / 社会证明露出**：无阅读量、无「共 N 字」。
9. **教学口吻排版**（参考站是语言教学站）：vocab 表不加「跟读」「例句」类栏目壳，表格就是表格。
10. **为齐位而造假**：CSS 纹样页不许渲染空 `figcaption` 或「图：CSS 生成」之类的伪署名。

---

## 9. 暗色模式策略

**本站无暗色模式，本期不引入。** `dark_mode.enable: false` 是现行正确状态（DESIGN-LANGUAGE §2.5：未全量校准前禁止启用）。

- `.fs-*` 的兜底表现：所有颜色一律**消费变量**（`.cal-page` 作用域覆盖值 + 既有 token），组件规则内不新增硬编码 HEX（表头沙色 `#f7f5f0`、抽屉 `#f7f6f4` / `#fdfbf6` 等沿用 §4.12/§4.13 既有硬编码口径，与族内现状一致）。未来若主人批准暗色全量校准，本族随作用域变量自动跟随，无需返工。
- 系统 `prefers-color-scheme: dark` 下不做任何适配（与全站一致）；`prefers-reduced-motion: reduce` 由全站既有规则（site.css §3.1 末尾 `transition/animation: none !important`）自动覆盖本族。
- 不发明暗色 token、不写 `@media (prefers-color-scheme)`。

---

## 10. `site.css` §4.15 写入纪律（E-052 防复发）

1. **插入位置**：§4.14 `.lb-*` 块结束之后、`/* ===== 5. 第三方组件纸面化` 段头注释**之前**。整段作为一次**插入式追加**完成，禁止「读旧副本改完整份覆盖写」——E-052 的教训：整份覆盖不报冲突、静默带回旧版。
2. **段头注释模板**（后来人一眼识别边界）：

```css
/* ===== 4.15 节日文化页（/library/<slug>/，2026-10-27 新增）=====
   本段由 FESTIVAL-DESIGN-2026-10-27.md 规定；只追加、不整写（E-052 红线）。
   数据 source/_data/festivals.yml · 模板 themes/fluid/layout/festival.ejs ·
   脚本 source/js/festival.js · 测试 test/festival-e2e.js
   视觉作用域：根元素挂 paper-page cal-page fs-page；色值一律消费 .cal-page
   作用域变量（§4.12 单源），本段不重定义任何色值（E-052 同型）；
   布局量值逐字对齐 §4.13 .z-*（15rem 右栏 / sticky 5.5rem / FAB / 抽屉）。
   --fs-fig-* 十二个纹样主色只允许出现在 .fs-figure--css 规则内，
   不进 :root、不上文字 / 边框 / 交互元素（§5.17.1 破例机制的族级延伸）。 */
```

3. **段完整性断言**（写进 `test/festival-e2e.js`，照抄 holidays-e2e 的 E-052 防复发机制）：按核心选择器清单 grep `site.css`，少一个即 FAIL——建议清单：`.fs-figure--css`、`.fs-figure-media`、`.fs-nav-strip`、`.fs-layout`、`.fs-toc`、`.fs-ring`、`.fs-section-title`、`.fs-facts`、`.fs-years`、`.fs-related`、`.fs-toc-fab`、`.fs-toc-sheet`、`.fs-fig-qixi`。
4. **负向断言**：`.fs-nav-strip` 规则内不得出现 `flex: none`、必须带 `min-width: 0`（E-049 同款锁法）；`.fs-*` 标题类规则内不得出现 `overflow-wrap: anywhere`（E-040/E-043）；`--fs-fig-*` 不得出现在 `.fs-figure--css` 与 `.fs-fig-*` 之外的选择器里。
5. 本段行数预期 300–400 行；若实现时发现要改 §4.12/§4.13/§4.14 任何一行，**停下来回报，不许顺手改**。

---

## 11. 交付核对清单（前端自验）

- [ ] 12 页根元素均挂 `paper-page cal-page fs-page`；S1–S12 断言全过。
- [ ] 390 / 1440 两档横向溢出为 0；导航条 wrap 换行、无词中断行。
- [ ] 无 JS：11 行日期全可见、目录锚点可跳、纹样块正常显示。
- [ ] `qixi` 纹样与 6 张实图页并排截图对比：宽高比 / 圆角 / 边框 / 上下留白一致。
- [ ] `site.css` diff 仅为 §4.15 插入段；`npm test` 十套全绿。
