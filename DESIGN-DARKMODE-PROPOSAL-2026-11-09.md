# 暗色模式视觉设计方案（已确认）

**日期**：2026-11-09
**产出**：白观色（visual-designer），个人网站工作室团队 `kasai-darkmode`
**汇编**：沈知需（team-lead）
**状态**：**已确认（2026-11-09 主人整组采纳 D1–D13）**。已按本方案进入实现阶段；
本文件仍是 Phase 4A 的唯一对齐基准。

> 以下为视觉设计师产出的方案原文，作为规范引用存档。主理人只做汇编与转录，未改写专业结论。
> 主人的三项决策已写入前提：① 先出方案过目；② 两态 + 默认跟随系统（不做三态、不做时间兜底）；③ 验收通过后授权提交推送。
>
> **2026-11-11 修订**：移动端切换按钮按主人意见从九宫格移至顶栏 `.site-nav-actions`，与搜索、汉堡并排，所有视口直接可见；九宫格那一格移除，全站只保留一个按钮（九宫格 0 处）。
> 本修订覆盖存档正文 §3 断点表 / §4.1 / §4.2 / §4.3 / §9 D11 / §10 第 12、17 条：这些章节中「375/768 桌面按钮隐藏、仅九宫格最后一格可见」「沿用 Bootstrap `d-lg-flex`（≥992px）」「移动端标签深色/浅色」「移动端可见文字标签与 `aria-label` 同源」等描述，均以本修订为准。
> **§10-12 的移动端按钮计数与 §10-17 的可见文字标签自本次修订起失效，验收以 `test/darkmode-e2e.js` 56 条断言为准。**
> 以下方案原文保留不改。

---

# KASAI 个人站点 · 暗色模式视觉设计方案

**状态**：已确认（2026-11-09 主人整组采纳 D1–D13），方案阶段未改任何文件、未写实现代码；实现见 Phase 4A。
**范围**：只出方案，含完整暗色令牌表、切换按钮位置与页面骨架。后台 `/admin/` 不纳入。
**校准依据（已逐份读取）**：`DESIGN-LANGUAGE.md` §1.3 / §2.1–2.6 / §5.16 / §5.20 / §9.1–9.4 / §10 / §14；`themes/fluid/_config.yml` L134–240；`color-schema.styl` 全文（79 行）；`color-schema.js` 全文（299 行）；`source/css/site.css` 前 250 行 + 全量 HEX/rgba 统计 + 关键段；`src/components/SiteNav.astro` 全文；`nav.ejs` L88–182；`Styles.astro` / `Head.astro` / `layout.ejs` / `css.ejs` / `prepare-assets.mjs` / `qrcode.styl`；`PRD.md` §2.2 / §7 / §8；`ERRORS.md` §0；`test/css-tokens.js`。

**校准得到的既有事实（决定本方案取值）**：
1. 现行浅色基线是 **V6.5「暖纸 + 轻玻璃」**（`site.css` L29–34、DESIGN-LANGUAGE §14），不是 §2.1 旧表：纸 `#fdfaf4→#faf6ee→#f7f2ea`、墨 `#1b1712` / 次级 `#5a5247` / 弱 `#7a7062`、accent `#a8482c`（hover `#8c3a22`）、官方陶土橙 `#d97757` 仅作非文字装饰、玻璃暖白 `rgba(255,253,247,…)`、阴影暖棕 `rgba(90,70,50,.28)`、光场四色陶土/沙/粉陶/鼠尾草。§2.1 的 `#b0482a` / `#faf9f5` 是过期值，不作为暗色推导起点。
2. §2.5 的暗色建议值基于旧 accent `#b0482a` 推导，其中 `sec #a7a9ad`（R−B = −6）与 `text #c4c6c9`（R−B = −5）是**冷灰**，与 R-1「禁止任何冷色相大面积用色」冲突；`#c4c6c9` 还被 §2.3 列为滚动条冷灰观察项。本方案给出暖灰替代。
3. `color-schema.styl` L65–79 已有 `@media (prefers-color-scheme: dark) :root:not([data-user-color-scheme])` + `[data-user-color-scheme="dark"]` 两组规则，机制可复用。**但 `dark-colors()` 内含 `img { filter: brightness(.9) }`（L48–51）与 `.license-box { background rgba(#3e4b5e,.35) }`（L57–59）**，前者会二次压暗照片格，后者是冷蓝灰，两项都需在暗色定义处改写。
4. `color-schema.js` 现有实现与主人「两态 + 默认跟随系统」决策有 5 处不一致（详见 §5）：时间兜底（L76–81）、「等于默认值即清空 LS 回到自动」（L88–90）、初始化即写 `data-user-color-scheme` 属性（L55/L262，会屏蔽自动跟随）、桌面按钮缺 `#color-toggle-btn` id（`nav.ejs` L95，JS L12/L266 绑定落空）、`meta[name="theme-color"]` 仅在手动态更新（L185）。
5. **`site.css` L2360–2371 的 `.cal-page` 在作用域内硬编码重定义了 `--accent / --text-color / --sec-text-color / --info-mark / --z-link` 五个变量**，L2386 `.cal-pinyin { color: #5a5247 }` 硬编码。暗色覆盖 `:root` 对这一族页面完全无效——节假日页、生肖页、节日详情页族全部命中。这是本次头号漏改点。
6. `site.css` 共 7088 行，硬编码 **121 处 HEX（34 个唯一值）+ 136 处 rgba（63 个唯一值）**。分布：节日页 §4.15（L3761–4880）23 HEX + 59 rgba 最密；首页响应式（L1269–3054）31 HEX + 26 rgba；首屏身份域/内容墙（L549–955）15 HEX + 11 rgba；城市排行榜 §4.16（L4881–6704）仅 0 HEX + 1 rgba，几乎全走变量，是暗色适配成本最低的一族。
7. `test/css-tokens.js` 用正则 `--accent:\s*([^;]+);` 取**首个**定义，比对 `site.css` 与 `source/admin/admin.css`。只要 `:root` 里浅色 `--accent: #a8482c` 保持原值、保持首个定义位置不动，暗色新增的覆盖不会触发断言、后台无需改、也无需 bump 版本号。
8. Astro 侧三处接线缺口：`data-default-color-scheme` 属性（`layout.ejs` L7 有、Astro `Head.astro` 无）、导航切换按钮（`SiteNav.astro` 无）、`highlight-css-dark` link（`css.ejs` L24 有、`Styles.astro` 无）；`prepare-assets.mjs` L70/L77 有「dark_mode 关闭所以 dark 为 false」的既有假设。

---

## 1. 视觉调性

- **选定风格**：沿用你之前定的**「暖纸 + 轻玻璃 V6.5」**体系，暗色态是它的**同一色域反相延伸**，不是一套新皮肤。
- **选择依据**：主人本次未指定新风格 → 按团队规则第 2 条，沿用既有偏好。R-1 明令禁止科技蓝及任何冷色相大面积用色，因此不采用 Fluid 原厂蓝黑组，也不引入任何新色相。
- **情绪关键词**：暖墨、纸感、低饱和、安静、编辑式。
- **硬约束**：不新增个人标识、不新增对外文案与口号（R-9）；切换按钮只用功能性文案；不出现评论 / 留言 / UGC / 登录类元素（PRD §2.2、R-6）；暗色态同样遵守「全站纸色两档、层级靠线与反色不靠色差」（§2.6）。
- **色温判定法**：所有暗态色值保持 **R > G > B**（暖调）。本方案 19 个主题值 + 全部 site.css 层值的 R−B 差值均为正（+6 至 +144），可作为 grep 断言。

---

## 2. 暗色设计令牌

### 2.0 对比度计算口径

基准底 `#1a1814` 的相对亮度 **L = 0.00923**（沿用 DESIGN-LANGUAGE §2.5 既有建议值，非本次新增）。通式：

```
L(c) = 0.2126·lin(R) + 0.7152·lin(G) + 0.0722·lin(B)
lin(x) = x/255 ÷ 12.92            (x/255 ≤ 0.03928)
       = ((x/255 + 0.055)/1.055)^2.4  (其余)
对比度 = (L_lighter + 0.05) / (0.00923 + 0.05)
```

下表每行「算式」列给出代入结果。文字色按 §9.1 从严口径一律 ≥4.5:1 验收；hairline / 滚动条 / 阴影为非文字，按层级线 1.2–3:1 口径。**除标注「沿用 §2.5」的 `#1a1814` 外，本表全部值均为【建议值 · 待主人确认】**，汇总见 §9。

### 2.1 主题段：`_config.yml` color 段 19 个 `*_dark` 语义

定义位置：`themes/fluid/_config.yml` L157–237（`highlight/inlinecode` 两项定义在 `_variables/base.styl` L66/L68，不在 yml）。**§2.3 冷蓝组 8 值（`#181c27 #1f3144 #252d38 #435266 #1589e9 #30a9de #364151 #46647e`）一个都不使用。**

| # | 语义名（CSS 变量 / 配置键） | 建议 HEX / 值 | 用途 | 对 `#1a1814` 的算式结果 | 标记 |
|---|---|---|---|---|---|
| 1 | `--body-bg-color` / `body_bg_color_dark` | `#1a1814` | 全站暗底「暖墨」 | 基准底，L=0.00923 → **1.00:1** | 沿用 §2.5 |
| 2 | `--board-bg-color` / `board_color_dark` | `#242019` | 浮层 / 下拉 / 模块卡 / 城市卡底 | L=0.01478 → (0.01478+0.05)/0.05923 = **1.09:1**（非文字；与浅色纸底↔面板 1.05:1 同档） | 【建议值·待主人确认】 |
| 3 | `--text-color` / `text_color_dark` | `#e5ded2` | 正文 / 标题（暗色下的「纸」） | L=0.73554 → (0.73554+0.05)/0.05923 = **13.26:1** ✓ AA | 【建议值·待主人确认】 |
| 4 | `--sec-text-color` / `sec_text_color_dark` | `#b3aa9c` | 摘要 / 日期 / 元信息 / 空态 | L=0.40733 → (0.40733+0.05)/0.05923 = **7.72:1** ✓ AA | 【建议值·待主人确认】 |
| 5 | `--post-text-color` / `post_text_color_dark` | `#e5ded2` | 文章正文 | 同 #3 → **13.26:1** ✓ | 【建议值·待主人确认】 |
| 6 | `--post-heading-color` / `post_heading_color_dark` | `#e5ded2` | 文章标题（分层靠字体轨与字重，不靠色差） | 同 #3 → **13.26:1** ✓ | 【建议值·待主人确认】 |
| 7 | `--post-link-color` / `post_link_color_dark` | `#d97757` | 文章正文链接 = accent 暗值 | L=0.28633 → (0.28633+0.05)/0.05923 = **5.68:1** ✓ AA | 【建议值·待主人确认】 |
| 8 | `--link-hover-color` / `link_hover_color_dark` | `#eea883` | 链接 hover（暗态**提亮**，与浅态加深 `#8c3a22` 反相） | L=0.47821 → (0.47821+0.05)/0.05923 = **8.92:1** ✓ | 【建议值·待主人确认】 |
| 9 | `--link-hover-bg-color` / `link_hover_bg_color_dark` | `rgba(217,119,87,.12)` | 链接 hover 底 | 叠在 body 上复合 `#31231c`（L=0.01939）→ **1.17:1**（非文字）；其上正文 `#e5ded2` **11.32:1**、accent `#d97757` **4.85:1** ✓ | 【建议值·待主人确认】 |
| 10 | `--line-color` / `line_color_dark` | `#413a30` | 1px hairline / 表格线 | L=0.04363 → (0.04363+0.05)/0.05923 = **1.58:1**（层级线，非文字；浅态 `#e2d8c6` 约 1.3:1 同档） | 【建议值·待主人确认】 |
| 11 | `--navbar-bg-color` / `navbar_bg_color_dark` | `rgba(36,32,25,.62)` | 导航胶囊玻璃底 | 复合 `#201d17`（L=0.01248）→ **1.05:1**（非文字）；其上正文 **12.57:1**、次级 **7.32:1**、accent **5.38:1**、弱 **4.73:1** ✓ | 【建议值·待主人确认】 |
| 12 | `--navbar-text-color` / `navbar_text_color_dark` | `#e5ded2` | 导航文字 | 同 #3 → **13.26:1** ✓（对玻璃复合底 12.57:1 ✓） | 【建议值·待主人确认】 |
| 13 | `--subtitle-color` / `subtitle_color_dark` | `#b3aa9c` | 副标题 | 同 #4 → **7.72:1** ✓ | 【建议值·待主人确认】 |
| 14 | `--scrollbar-color` / `scrollbar_color_dark` | `#4a4238` | 滚动条 | L=0.05638 → (0.05638+0.05)/0.05923 = **1.80:1**（非文字） | 【建议值·待主人确认】 |
| 15 | `--scrollbar-hover-color` / `scrollbar_hover_color_dark` | `#6b6255` | 滚动条 hover | L=0.12517 → (0.12517+0.05)/0.05923 = **2.96:1**（非文字） | 【建议值·待主人确认】 |
| 16 | `--button-bg-color` / `button_bg_color_dark` | `transparent` | 主题按钮底 | 不产生对比度，沿用现值 | 沿用现值 |
| 17 | `--button-hover-bg-color` / `button_hover_bg_color_dark` | `rgba(229,222,210,.06)` | 按钮 hover 底 / 切换按钮 hover 底 | 复合 `#26241f`（L=0.01773）→ **1.14:1**（非文字）；其上正文 **11.60:1** ✓ | 【建议值·待主人确认】 |
| 18 | `--highlight-bg-color` / `highlight_bg_color_dark` | `#242019` | 代码块底（复用面板，不引入第三纸色） | 同 #2 → **1.09:1**（非文字）；其上正文 `#e5ded2` **12.13:1** ✓ | 【建议值·待主人确认】 |
| 19 | `--inlinecode-bg-color` / `inlinecode_bg_color_dark` | `rgba(229,222,210,.10)` | 行内 code 底 | 复合 `#2e2c27`（L=0.02529）→ **1.27:1**（非文字）；其上正文 **10.43:1** ✓ | 【建议值·待主人确认】 |

补充：`--fold-title-color` / `--fold-border-color`（`color-schema.styl` L45–46）分别复用 #3 与 #10，不单列新值。

**替换理由（配色红线核心）**：§2.5 的 `sec #a7a9ad`（7.53:1）与 `text #c4c6c9`（10.36:1）数值达标但 R−B 为负（−6 / −5），是冷灰，铺满正文即违反 R-1，且与暖纸玻璃体系不同偶。本方案 #4 / #3 保持近似亮度档位（7.72 / 13.26）而色相转暖（R−B = +23 / +19）。accent 不用 §2.5 的 `#d9724a`（5.45:1），改用 **V6.5 已定义的官方陶土橙 `#d97757`（5.68:1）**：浅色下它只做非文字装饰（2.98:1 不达 AA），暗色下自动成为合格的文字/交互色——明暗两态共用同一个色值、同一个色相，不引入任何新颜色。浅色 accent `#a8482c` 对暗底仅 **3.06:1 ✗**，印证「必须单独提亮」。

### 2.2 `site.css` 层暗色变量（定义处：`site.css` `:root` 的暗态覆盖块）

| 语义名 | 建议值 | 用途 | 算式结果 / 验收值 | 标记 |
|---|---|---|---|---|
| `--accent` | `#d97757` | 全站唯一交互强调色 | 对 body **5.68:1** ✓；对面板 `#242019` **5.19:1** ✓；对玻璃复合底 **5.38:1** ✓ | 【建议值·待主人确认】 |
| `--accent-strong` | `#eea883` | hover / strong（暗态提亮） | **8.92:1** ✓ | 【建议值·待主人确认】 |
| `--info-mark` | `#8f877a` | 静态信息（计数 / 分类 / 类型词） | L=0.24573 → (0.24573+0.05)/0.05923 = **4.99:1** ✓；对面板 **4.56:1** ✓ | 【建议值·待主人确认】 |
| `--accent-soft` | `rgba(217,119,87,.12)` | 实心 tag 底 / 引用竖边 | 复合 `#31231c` → **1.17:1**（非文字）；其上正文 **11.32:1** ✓ | 【建议值·待主人确认】 |
| `--cream` | `rgba(36,32,25,.62)` | 模块卡 / 城市卡轻玻璃底 | 复合 `#201d17` → **1.05:1**（非文字） | 【建议值·待主人确认】 |
| `--site-chip-border` | `rgba(229,222,210,.10)` | 浮层 1px 边界 / 玻璃高光描边（替代浅态 `rgba(255,253,247,.85/.70)`） | 复合 `#2e2c27` → **1.27:1**（非文字线） | 【建议值·待主人确认】 |
| `--site-float-shadow` | `0 12px 32px -14px rgba(8,6,4,.65)` | 全站唯一阴影（暗底上需更重才可见，保持暖黑不发蓝） | 阴影非文字；不参与对比度 | 【建议值·待主人确认】 |
| `--line-strong` / `--rule` | `rgba(229,222,210,.22)` | 模块卡 hover 边框 / 归档精选行顶线 | 复合 `#35312a` → 约 **1.6:1**（层级线） | 【建议值·待主人确认】 |
| `--rule-strong` | 跟随 `--text-color` → `#e5ded2` | 组顶线（2px 全墨→全纸，自动反相） | **13.26:1**（线，非文字） | 【建议值·待主人确认】 |
| `--block-yellow` | `rgba(217,119,87,.16)` | 淡陶土装饰块底 | 复合 `#39271f` → **1.25:1**（非文字）；其上正文 **10.59:1** ✓、accent **4.53:1** ✓ | 【建议值·待主人确认】 |
| `--block-orange` | `#d97757` | 深陶土装饰块底（与 accent 同值，浅态同构） | 对 body **5.68:1**；**其上必须用墨字 `#1b1712` = 5.71:1 ✓，亮纸字 `#e5ded2` 仅 2.34:1 ✗** | 【建议值·待主人确认】 |
| `--ink-warm` | `#1b1712`（保持） | 墨的别名，用于反色块上的字 | 对亮纸块 `#e5ded2` **13.34:1** ✓ | 沿用现值 |
| `--cream-on-dark` | `#fdfaf4`（保持） | 城市卡名次角标浅纸片底 | 对 body **17.01:1**；**其上字必须用墨 `#1b1712`（15.15:1 ✓），不可用 `--text-color`** | 决策项 D7 |
| `--surface-ink` | `#e5ded2` | `.ink-band` 反色块 → 暗态改为**亮纸块** | 对 body **13.26:1**（区块底）；块内墨字 **13.34:1** ✓ | 【建议值·待主人确认】 |
| `--on-ink` | `#1b1712` | 反色块主文字 | 对亮纸块 `#e5ded2` **13.34:1** ✓（对 body 1.01:1，不适用） | 【建议值·待主人确认】 |
| `--on-ink-sec` | `rgba(27,23,18,.72)` | 反色块次级（计数 / 类型词 / 日期） | 复合 `#544f48`，对亮纸块 **6.07:1** ✓ | 【建议值·待主人确认】 |
| `--on-ink-line` | `rgba(27,23,18,.16)` | 反色块 hairline | 复合 `#c5beb3`，对亮纸块 **1.38:1**（非文字线） | 【建议值·待主人确认】 |
| `::selection` 底 | `rgba(229,222,210,.18)` | 选中文字淡底（替代 `rgba(27,23,18,.12)`，暗底上墨色淡底不可见） | 复合约 `#38352e`；其上正文 `#e5ded2` ≥ **9:1** ✓ | 【建议值·待主人确认】 |

**反色块说明**：浅态 `.ink-band` 是「墨底 + 纸字」的节奏锚点（R-1 每屏 ≤1 个豁免）。暗态页面本身已是暖墨，若继续用墨底则与页面融为一体、失去锚点作用，因此**反相为亮纸块 + 墨字**，仍属同一色域、不新增色相、不违反 R-2（块内不出现 accent 与装饰色块，`site.css` L2283–2302 的用字锁定保持，只换 token 值）。

### 2.3 光场四色与渐变底（`body::before`，`site.css` L177–190）

V6.5 纪律「光场与玻璃层成对存在」；暗态若直接沿用浅色光场会在暗底上出现亮斑。建议**保留结构、压暗底色、把四色透明度降到 .07–.10**：

```
radial-gradient(46vw 46vw at 82% 6%,  rgba(217,119,87,.10), transparent 68%)   陶土
radial-gradient(42vw 42vw at 10% 82%, rgba(176,146,96,.08), transparent 68%)   沙
radial-gradient(34vw 34vw at 4% 42%,  rgba(200,120,96,.09), transparent 68%)   粉陶
radial-gradient(30vw 30vw at 72% 90%, rgba(126,142,106,.07), transparent 68%)  鼠尾草
linear-gradient(180deg, #1a1814 0%, #1c1916 55%, #1f1b17 100%)
```

四色均为非文字装饰、不发亮边；`html { background: #faf6ee }`（L170）暗态改为 `#1a1814`。三段渐变属 §14 明列的 ambient 例外，不违反 §2.6「两档纸色」——两档指 `--body-bg-color` / `--board-bg-color` 两个不透明 token 值，暗态仍只有 `#1a1814` 与 `#242019` 两档。**全部【建议值·待主人确认】**，备选「完全关闭光场只留纯暗底」见 D4。

### 2.4 照片 mask / 纹样画布 / 二维码兜底

| 位置 | 建议处理 | 对比度依据 | 标记 |
|---|---|---|---|
| `.wall-feature-mask`（L729）`rgba(27,23,18,.06→.82)`、`.wall-cell-mask`（L851–853）`rgba(27,23,18,.16→.82)` + `rgba(168,72,44,.12)` | **渐变结构保持**（这是压图白字唯一兜底，§2.2 明令不得移除/削弱）；淡陶土层改 `rgba(217,119,87,.10)` | 白字 `#fdfaf4` 对遮罩后底部墨色 ≥4.5:1；遮罩压在照片上，与页面底色无关 | 【建议值·待主人确认】 |
| `.wall-cell-mask ~ .wall-cell-body { color: #fdfaf4 }`（L867） | **保持浅纸字不变** | 照片不变，白字压暗图逻辑不变 | 沿用现值 |
| `dark-colors()` 的 `img { filter: brightness(.9) }`（`color-schema.styl` L48–51） | 暗态**取消或降到 `brightness(.97)`** —— 照片格已有 mask，再叠 .9 是二次压暗 | 防止照片格文字蒙版过暗、封面细节丢失 | 【建议值·待主人确认】 |
| `.license-box { background: rgba(#3e4b5e,.35) }`（L57–59） | 改 `rgba(36,32,25,.35)` | 去冷蓝灰，与面板同色域 | 【建议值·待主人确认】 |
| `.fs-figure--css` 四个纹样页 | **分两组**：`yuanxiao`（`background: #bf6b2f` 实心陶土）与 `zhongyuan`（`#3f4a52` 实心）自带底，暗态保持；`qixi`（`background: transparent` + `rgba(27,23,18,.15/.35)` 墨点）与 `laba`（`transparent` + `border 2px #7a5c42`）在暗底上几乎不可见，改挂**固定浅纸画布 `#e5ded2`** | 画布上原纹样色：`#46586e` **5.45:1** ✓、`#7a5c42` **4.57:1** ✓；12 个 `--fs-fig-*` 纹样主色**一个都不改**（§4.15 破例边界：只许出现在 `.fs-figure--css` 规则内，写进 `:root` 即 FAIL） | 【建议值·待主人确认】 |
| `.qr-img`（`qrcode.styl` L9–17，`background-color: transparent` + `hsla(0,0%,62%,.2)` 灰阴影） | 二维码图源是白底 PNG，暗态浮层改：底 `#fdfaf4` + `padding: .5rem` + `border-radius: var(--r-xs)` + 阴影换 `--site-float-shadow` 暗值；二维码本体白底保持不变 | 白底二维码在暗页上是明确的「纸片浮层」，不加发光边 | 【建议值·待主人确认】 |

### 2.5 字体 / 间距 / 圆角 —— 暗色零改动

沿用 V6.5，不改任何值（暗色只换颜色与阴影）：

- 字体三轨：`--font-display: "Archivo","Arial Black","PingFang SC","HarmonyOS Sans SC","MiSans","Microsoft YaHei",sans-serif`；`--font-sans: "Nunito Sans","PingFang SC","HarmonyOS Sans SC","MiSans","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei",sans-serif`；`--font-serif-title: "Fraunces","Songti SC","STSong","SimSun","Source Han Serif SC","Noto Serif CJK SC",Georgia,"Times New Roman",serif`；`--font-mono: "Cascadia Code","JetBrains Mono",Consolas,"SF Mono",Menlo,"Courier New",monospace`。
- 字阶 / 行高：正文 17px / 1.75，正文轨 `line-height: 1.7` 兜底（`site.css` L164），标题 `line-height: 1.3`，字重 400/600/700，字阶见 DESIGN-LANGUAGE §3.2。暗态不新增第四种字体栈、不加载 Web Font。
- 间距：`--space-page-top: clamp(104px,12vh,136px)`；组件间距沿用 rem 标尺（0.42 / 0.7 / 1.1 / 1.6 / 2.6rem 等），不引入新档。
- 圆角三档 + 胶囊：`--r-xs: 8px` / `--r-sm: 12px` / `--r-tile,--r-card: 16px` / 胶囊 `999px`；首页入口格 ≤12px（R-3）。暗态不变。
- 图片固定宽高比：`.cr-tile-cover { aspect-ratio: 16/9 }`（L5201）、窄屏 16:8、`.cr-tile-cover--none`（L5233）无图兜底——**全部保持**，兜底区底色跟 `--board-color` 暗值 `#242019` 走，避免挂图后布局崩（§5.20 规则 4/5/6）。

### 2.6 token 单一数据源与后台约束（本方案怎么处理）

1. 全部色值只落在两处定义层：`_config.yml` color 段（19 个 `*_dark`）与 `site.css` 的 `:root` 暗态覆盖块。组件规则里**不得新增任何硬编码 HEX/rgba**；现有硬编码只做「改写为暗态对应值」，不新增。
2. **浅色 `:root` 的 `--accent: #a8482c` 保持原值、保持首个定义位置不动**；暗态 accent 通过新增 `#d97757` 的暗态覆盖实现。因此 `test/css-tokens.js` 的正则仍取到 `#a8482c`，与 `source/admin/admin.css` 等值，断言仍 PASS，后台本次不改、不 bump 版本号。
3. 前台 `site.css` 缓存破坏由内容 hash 自动完成；本方案不涉及 `source/admin/`。
4. `.cal-page` / `.pg-holidays` / `.fs-figure--css` 等作用域变量属既有单页破例（`test/zodiac-e2e.js` / `test/holidays-e2e.js` 锁边界），暗态覆盖必须**同步写进这些作用域**，不得只在 `:root` 改一次就以为全站生效。
5. 两档纸色：暗态不透明底只有 `#1a1814`（body）与 `#242019`（board）；玻璃 `rgba` 与 mask 衍生属 §2.6 明列例外。层级靠 1px `--line-color` 与反色块，不靠底色深浅。

---

## 3. 页面骨架与响应式断点

暗色**不改变任何区块顺序、布局方式、栅格列数**（这是「已有页面改视觉」路径，PRD 与内容清单已存在）。骨架表只标注暗态发生变化的区块：

| 顺序 | 区块 | 布局 | 暗态变化 | 首屏 |
|---|---|---|---|---|
| 1 | 固定导航胶囊 + `.site-nav-actions` | fixed 满幅 | 玻璃底 / 描边 / 阴影换暗值；新增一处切换按钮 | 是 |
| 2 | 首屏身份域（头像 + 站名 + tagline + CTA） | 左 4 : 右 8 | `.cta-solid` 反相为亮纸底墨字；头像描边换 `--line-strong` 暗值 | 是 |
| 3 | 内容墙（主卡 + 入口格） | 网格 | 照片 mask 保留；`.cell-yellow/orange/plain` 三格字色反相 | 是 |
| 4 | 两栏 / 精选 / `.ink-band` | 两栏 + full-bleed 反色块 | `.ink-band` 反相为亮纸块 + 墨字（每屏 ≤1 个不变） | 否 |
| 5 | 页脚 / 归档 / 详情 / 资料页族 | 正文轨 646px（文章页 780px） | 全部走变量；单页作用域变量同步覆盖 | 否 |

| 断点 | 暗态 / 切换按钮布局变化 |
|---|---|
| **375px** | 单列堆叠。桌面切换按钮隐藏（`<992px`），仅移动端九宫格最后一格 `col-4` 可见；九宫格玻璃底 `rgba(36,32,25,.85)`、描边 `--site-chip-border` 暗值；城市大图卡 1 列、封面保持 16:8 不隐藏；纹样页画布铺满不溢出；内边距沿用既有窄屏值，无横向溢出（PRD §8.2）。 |
| **768px** | 两列网格；桌面按钮**仍隐藏**（阈值 992px），切换仍走九宫格；城市卡 2 列；字阶沿用既有中档，暗态不改字号。 |
| **1440px** | 三列网格，内容区最大宽沿用既有；桌面切换按钮显示于 `.site-nav-actions`，九宫格隐藏；城市卡 3 列、`aspect-ratio: 16/9`；`test/css-tokens.js` 与既有 31 页 h1 唯一性断言保持。 |

桌面按钮显示阈值沿用 Bootstrap `d-lg-flex`（≥992px），与 §7.2「.98 家族」断点体系一致。

---

## 4. 切换按钮方案

### 4.1 位置与形态

| 端 | 位置 | 形态 | 显示条件 |
|---|---|---|---|
| 桌面 | `SiteNav.astro` / `nav.ejs` 的 `.site-nav-actions` 内，`#search-btn` **之后**、`#navbar-toggler-btn` **之前** | 与搜索按钮同款的裸图标按钮（`nav-link`，无文字、无 chip、无磨砂），尺寸沿用相邻图标；图标用站点既有 `iconfont` 的 `icon-light` / `icon-dark` 线性图标 | `d-none d-lg-flex`（≥992px） |
| 移动 | `#mobile-grid-menu` 九宫格**最后一格** `col-4`，沿用 `nav.ejs` L167–178 既有格位 | 与「搜索」格同构：`mobile-grid-item` 内图标 + 可见文字标签 | 关闭态九宫格不进 Tab 序列（§9.2） |

**必须补的接线事实**：`color-schema.js` L12/L266 绑定 `#color-toggle-btn`，而 `nav.ejs` L95 的桌面 `<a>` **没有这个 id**，全仓仅 JS 中出现该 id。桌面按钮必须带 `id="color-toggle-btn"`，否则点击无绑定。Astro `SiteNav.astro` L119–135 的 `.site-nav-actions` 目前只有搜索与汉堡，需新增一处；移动端九宫格需新增 `#mobile-color-toggle-btn` 一格。两处各一处、不重复。

### 4.2 图标语义与三态

- **图标语义**：图标表示「点击后将切到的模式」——当前浅色 → 显示 `icon-dark`（切到深色）；当前深色 → 显示 `icon-light`（切到浅色）。沿用 `color-schema.js` L147–183 的 `setButtonIcon` 双图标逻辑与移动端文字标签同步。**不用太阳/月亮 emoji，不用彩色图标。**
- **hover**：底色 `--button-hover-bg-color` 暗值 `rgba(229,222,210,.06)`（对 body 复合 1.14:1，其上正文 11.60:1 ✓）；图标色转 `--accent` 暗值 `#d97757`（5.68:1 ✓）；可保留原厂 `mouseenter` 图标预览切换；**零位移、零缩放、零发光**。
- **focus-visible**：`2px solid var(--accent)` outline + `outline-offset: 2px`，与 `#navbar` 既有焦点口径（§5.1）一致；暗态 accent 对底 5.68:1，可见。
- **active（按下）**：底色 `--accent-soft` 暗值 `rgba(217,119,87,.12)`；无 scale、无弹跳、无循环动画（§6.1 动效白名单）。

### 4.3 `aria-label` 与键盘可达性

- 元素用 `<button type="button">`（不用 `<a href="javascript:;">`），Enter / Space 原生触发，Tab 顺序 = DOM 顺序 = 视觉顺序（§9.2）。
- `aria-label` 随当前态切换，**只用功能性文案**：当前浅色 → `切换到深色模式`；当前深色 → `切换到浅色模式`。移动端可见文字标签与 `aria-label` **同源**（§9.3 规则 1，避免重蹈搜索按钮「可见中文 / aria 英文」的既有缺陷）；移动端标签用「深色 / 浅色」两词，不写口号、不新增品牌位（R-9）。
- 补 `aria-pressed`（`true` = 当前深色）表达按下态；状态不单靠颜色表达，图标 + 文字标签 + `aria-pressed` 三重编码（§9.4）。
- 桌面按钮在 Tab 序列中位于搜索按钮之后、汉堡之前；移动端九宫格关闭态不得进入 Tab 序列。

### 4.4 导航下拉 hover 陷阱（必须避开）

`site.css` L344–351 已注明：主题下拉是 `.navbar .dropdown:hover > .dropdown-menu` **hover 驱动**，菜单与 `li` 必须相接，否则鼠标下移经过间隙时 hover 断开、菜单收回、选项点不到；现行规则 `margin-top: 0` + `padding: 0.45rem` 就是为此。

本方案的规避：
1. **切换按钮不放进任何下拉面板**，桌面是 `.site-nav-actions` 里的独立按钮，移动是九宫格独立格——从结构上不产生新的 hover 链路。
2. 下拉面板自身保持 `margin-top: 0`；触发项 `li` 与 `.dropdown-menu` 之间**不留 margin / 间隙**，所有间距只写在面板内部 `padding`（L351）。暗态改写 L352 `border: 1px solid rgba(255,253,247,.85)`、L354 `background: rgba(255,253,247,.72)`、L370 hover 底 `rgba(27,23,18,.05)` 时，**只换颜色值，不动 margin / padding / 定位量**。
3. 切换按钮与导航胶囊之间同样不留会中断 hover 的间隙；`focus-visible` outline 用 `outline-offset` 绘制，不占布局空间、不撑开间隙。
4. 若后续有人把切换按钮挪进下拉，必须保留「零 margin + 面板内 padding」这条，否则按缺陷处理（ERRORS §0：防复发须为可断言机制，不是「下次注意」）。

---

## 5. 两态 + 默认跟随系统的状态机

**状态定义（只有两态，没有第三态）**：`light` / `dark`。`default: auto` 不是第三态，是「尚未手动选择时的取值来源」。存储键沿用 `Fluid_Color_Scheme`（`color-schema.js` L8），只存 `light` / `dark` 两个值之一。DOM 用 `data-user-color-scheme` 属性表达「访客已手动选择」；**属性不存在 = 跟随系统**。

**优先级**：`localStorage 手动值 > 系统 prefers-color-scheme > 浅色`。系统深色则暗，系统浅色或未表态则浅。

| 情形 | localStorage | 系统偏好 | DOM 属性 | 结果 | 说明 |
|---|---|---|---|---|---|
| **首次访问** | 空 | dark | **不写** | 暗 | 由 `@media (prefers-color-scheme: dark) :root:not([data-user-color-scheme])` 的 CSS 规则直接生效 |
| **首次访问** | 空 | light / 未表态 | **不写** | 浅 | `:root` 浅色值生效；`--color-mode` 保持 `"light"` |
| **系统偏好中途切换**（未手动选过） | 空 | light ↔ dark | **保持不写** | 跟随切换 | 纯 CSS `@media` 自动响应，无需 JS 重算属性；JS 仅用 `matchMedia().change` 同步按钮图标、`aria-label`、`aria-pressed`、`meta[name="theme-color"]` |
| **手动点击**（任一态） | 写入相反态 `light`/`dark` | 任意 | 写入 `data-user-color-scheme="light\|dark"` | 切到该态 | 写 LS + 写属性；`[data-user-color-scheme="dark"]` 规则优先级高于 `@media` 分支，因为 `:root:not([data-user-color-scheme])` 不再命中 |
| **手动后系统偏好再切换** | 保留手动值 | 任意变化 | 保留 | **不再随系统变** | 属性存在 → `:not([data-user-color-scheme])` 不命中，CSS 自动跟随分支被屏蔽；`matchMedia().change` 监听器须先判断「属性不存在」才更新 UI |
| **刷新 / 新开页** | 有手动值 | 任意 | 首屏内联脚本同步写入 | 保持手动值 | 与上次一致，不回退到系统 |
| **清除 localStorage** | 空 | 当前系统值 | 移除属性（或首屏不写） | 回到跟随系统 | 刷新后按当前系统偏好重新决定 |

**落地要点（现有 `color-schema.js` 与上述状态机的 5 处差异，实施时须对齐；本节只写规则不写代码）**：

1. **移除时间兜底**：`getDefaultColorSchema()` L76–81 的 `new Date().getHours()` / 18:00–6:00 分支删除。`default: auto` 只走 `prefers-color-scheme`，未表态一律 `light`。
2. **移除「切回默认即清空」**：`applyCustomColorSchemaSettings()` L88–90 `if (current === getDefaultColorSchema()) { resetSchemaAttributeAndLS(); }` 删除。这段会隐性造出第三态——系统深色时手动切浅再切回深，LS 被清空、回到跟随系统，违反「手动后不再随系统变」。改为：LS 一旦写入就永久保留，只有访客清浏览器数据才消失。
3. **未手动选择时不写属性**：`resetSchemaAttributeAndLS()` L54–57 目前会 `setAttribute(data-user-color-scheme, getDefaultColorSchema())`，把系统偏好**固化到 DOM**；之后系统偏好变化 CSS 自动分支失效、且 JS 无 `change` 监听。改为：LS 为空时移除属性、不写值，让 `:root:not([data-user-color-scheme])` 的 `@media` 规则接管跟随。
4. **补桌面按钮 id**（§4.1）与**补 `meta[name="theme-color"]` 跟随态同步**：`setButtonIcon()` L185 只在属性存在时更新 theme-color；跟随系统态需按当前生效底色写入（浅态 `rgba(255,253,247,.42)` / 暗态 `rgba(36,32,25,.62)` 对应的实色值，具体取值由实现层按 `getComputedStyle` 定，方案不新增硬编码）。
5. **无三态 UI**：不做「浅 / 深 / 跟随系统」三选一，不做时间开关，不在按钮上显示「自动」字样。

---

## 6. 逐页适配要点（每页列最可能漏改的硬编码浅色位置）

**通用头号漏改点**：`site.css` **L2360–2371 `.cal-page` 作用域内 5 个变量硬编码重定义**（`--accent #a8482c`、`--text-color #1b1712`、`--sec-text-color / --info-mark #5a5247`、`--z-link #a8482c`）与 **L2386 `.cal-pinyin { color: #5a5247 }`**。它盖掉 `:root` 的暗态覆盖，命中节假日页、生肖页、节日详情页族全部页面。暗态必须同步改写这 6 处（或改为消费 `:root` 变量、消除重复定义）。

| 页面族 | 最可能漏改的硬编码浅色位置 |
|---|---|
| **首页身份域与主卡** | `.cta-solid` L663/664 `background:#1b1712; color:#fdfaf4`、L673 hover `color:#ffffff` → 暗态改亮纸底 `#e5ded2` + 墨字 `#1b1712`（13.34:1），hover 底 `#d97757` + **墨字**（亮纸字仅 2.34:1 ✗）；`.cta-link` 走 `--text-color` 安全。`#pagination .page-item.active .page-link` L1711–1713 `#1b1712`/`#fdfaf4` 硬编码同样反相。`.wall-feature-mask` L729 与 `.wall-cell-mask` L851–853 渐变**保留**（§2.2 唯一兜底），只改淡陶土层。`.games-tile-meta` L2254 `rgba(253,250,244,.72)` 是 `.ink-band` 内的纸色衍生，反相块后须改 `rgba(27,23,18,.72)`。 |
| **文章详情页** | 19 个主题变量中的 `post_*` 四项；`site.css` §6（L6844–6883）代码块三处硬编码：`pre` 底、行号槽分隔线 `#999`、行内 code 底；`Styles.astro` L35–36 缺 `highlight-css-dark` link，暗态代码高亮不切换；`::selection` L6889 `rgba(27,23,18,.12)` 在暗底不可见，改 `rgba(229,222,210,.18)`；`.markdown-body a` 链接色走 `--accent` 暗值 + 细下划线。 |
| **节日详情页族（11 固定章节 + 4 CSS 纹样页）** | §4.15 L3761–4880 是全站硬编码最密处（23 HEX + 59 rgba）。重点：`.fs-nav-strip` L3782 `border: 1px solid rgba(255,253,247,.85)`、L3787 `inset 0 1px 0 rgba(255,253,247,.7)` 白色高光描边/内高光，暗态改 `rgba(229,222,210,.10/.06)`；同类玻璃描边/高光在该段多处重复出现，需全段扫描而非逐条改。`.cal-page` 作用域 6 处（见上）。12 个 `--fs-fig-*` 纹样主色**保持不动**；4 个纹样页按 §2.4 分两组：`qixi`(L3928) / `laba`(L4478) 透明底改挂浅纸画布 `#e5ded2`，`yuanxiao`(L4271 `#bf6b2f`) / `zhongyuan`(L4341 `#3f4a52`) 自带底保持不变。`yuanxiao` 的 `rgba(253,250,244,.9)` 纹样元素压在陶土底上，保持。 |
| **城市排行榜卡片页（`.cr-tile-*`）** | 该族几乎全走变量（0 HEX），成本最低但有一处致命陷阱：`.cr-tile-rank` L5226–5228 是 `color: var(--text-color)` + `background: var(--cream-on-dark)`（`--text-color` 暗态变亮纸、`--cream-on-dark` 仍是浅纸片）→ **白字白底，1.3:1 ✗**。必须把角标字色改墨 `#1b1712`（15.15:1），底保持 `#fdfaf4`（照片上的纸片，明暗两态一致）。`.cr-tile > a` / `.cr-tile-cover` L5192/5203 的 `var(--board-color, var(--cream))` 靠暗态 `--board-color` / `--cream` 覆盖即可；`.cr-tile-key b` L5284 accent 走暗态；16:9 `aspect-ratio`、`.cr-tile-cover--none` L5233 无图兜底**保持**，兜底底走 `#242019`。 |
| **节假日 / 生肖页** | 两者共用 `.cal-page` 作用域变量（DESIGN-LANGUAGE §5.18 明确「§4.13 只写版式、不重复定义色值」）——改一处即可，但 `.cal-pinyin` L2386 与节假日页印章红作用域 `.pg-holidays`（§14 保留不动）需单独核对：印章红属暖红族，暗态不新增色相，只核对对比度。生肖导航条 L3062 玻璃化的暖白描边/高光需同步暗态值。 |
| **关于页** | `.about-copy-toast` L1942/1943 `rgba(27,23,18,.94)` 墨底 + `#ffffff` 白字 → 暗态墨底融入页面，改亮纸底 `#e5ded2` + 墨字 `#1b1712`（13.34:1），与反色块同一语言；`box-shadow` 走暗态阴影。二维码悬浮层 `qrcode.styl` L9–17（透明底 + 中性灰阴影、白底二维码图）按 §2.4 处理。`.about-avatar-box` L1968 `rgba(27,23,18,.05)` → `rgba(229,222,210,.06)`；`hint.css` 提示气泡为第三方组件，需核对底色。 |
| **404 与归档** | `.page-404-note` L1723 走 `--sec-text-color`，安全；`#pagination .page-item.active .page-link` L1711–1713 硬编码反相（同首页）；`.archive-picks` L2310–2324 基本走变量，但 L2314 `2px solid var(--rule)` 依赖 `--line-strong` 暗值、L2315 `var(--line-color)` 依赖 hairline 暗值；`.pick-img` 图片不叠 `brightness(.9)` 二次压暗；404 的倒计时/跳转文案不改（B10 待确认项，与暗色无关）。 |

---

## 7. 明暗过渡与动效

遵循全站 `prefers-reduced-motion: reduce` 规则（`site.css` L195–197 已有 `body::before { animation: none }`；DESIGN-LANGUAGE §6.5）。

**需要过渡的（≤200ms，仅颜色类属性）**：`body` / `html` 背景色、文字色、`border-color`、`background-color` 于导航胶囊、下拉、卡片、按钮、`::selection`、代码块、toast；`img` 的 `filter`（`brightness`）过渡沿用 `color-schema.styl` L51 的 `.2s ease-in-out`。建议统一 `transition: background-color .18s ease, color .18s ease, border-color .18s ease`，不写进组件规则里散落定义。

**必须不过渡的**：
1. **首屏防 FOUC**：暗态判定必须在 `<head>` 用**内联、同步、阻塞**脚本读取 `localStorage` 并写 `data-user-color-scheme`，位置在 CSS link 之前。现有 `Head.astro` L77 的 `<script defer src="/js/color-schema.js">` 在 HTML 解析完成后才执行——已存 dark 的访客会先看到一帧浅色再跳暗。**首屏切换本身不做任何淡入过渡**，直接以正确态渲染。
2. `ambient-drift` 光场漂移（56s）：保持既有 `@media (prefers-reduced-motion: reduce) { animation: none }`；暗态不新增漂移动画。
3. 布局量：`margin` / `padding` / `aspect-ratio` / 栅格列数 / 字号 / 圆角**全部不参与过渡**（避免切换时抖动与 reflow）。
4. 卡 / 格的 `translateY(-2px)` hover 上浮、水波下划线 `text-decoration-thickness / offset` 过渡沿用 §6.2 基线，明暗切换不叠加。
5. 不新增任何淡入 / 淡出 / 缩放 / 旋转作为模式切换的表现（§6.8 交互禁止事项）。

---

## 8. 反 AI 味清单

本方案明确避免：

- 发光边框、彩色 glow、`box-shadow` 彩色外扩；暗态阴影只用 `rgba(8,6,4,.65)` 暖黑，不做「暗色就该发光」。
- 渐变按钮、渐变文字、玻璃拟态堆砌；玻璃层只保留 V6.5 既有的 blur 24–28px / saturate 1.8–2 / 暖白低透明描边，参数**一个不动**，只换色温。
- 太阳 / 月亮 emoji、emoji 图标、图标配文字的通用仪式感；切换按钮只用既有 `iconfont` 线性双图标 + 功能性文案。
- 居中大标题配副标题的通用暗色落地页套路；页面骨架与内容顺序一律不变。
- 「科技蓝 / 深空蓝 / 紫蓝渐变」暗色皮肤；本方案所有值 R > G > B，冷色相一个不引入。
- 假磨砂：不用高饱和半透明色块冒充玻璃、不在暗底上盖亮斑光场（光场透明度压到 .07–.10）。
- 大圆角、彩色强调色铺满、装饰性插画堆砌、持续循环动画、切换时的旋转/缩放特效。
- 新增社会证明、计数徽标、互动社区元素（R-4 / R-6）。

---

## 9. 待主人拍板清单

全文【建议值 · 待主人确认】汇总，逐条可回答「同意 / 改成 X / 保持 §2.5 原值」：

| # | 问题 | 本方案建议 | 备选 / 影响面 |
|---|---|---|---|
| **D1** | 暗态正文与次级文字用暖灰还是沿用 §2.5 的冷灰？ | `#e5ded2` 正文（13.26:1）/ `#b3aa9c` 次级（7.72:1），R−B 为正 | 沿用 §2.5 `#c4c6c9` / `#a7a9ad`（10.36 / 7.53:1，但冷灰，与 R-1 冲突）。影响全站文字。 |
| **D2** | 暗态 accent 用哪个值？ | **V6.5 已有官方陶土橙 `#d97757`（5.68:1）**，明暗共用同一色值，浅态它只做装饰、暗态升为文字色 | §2.5 `#d9724a`（5.45:1，基于旧 accent 推导，与 V6.5 不同源）。影响链接 / hover / kicker / 排序键大字。 |
| **D3** | 暗态 hover 是否反相为「提亮」？ | 是：`#eea883`（8.92:1），浅态 hover 是加深 `#8c3a22` | 若不反相，暗态 hover 会变暗、可见性下降。 |
| **D4** | 暗态光场保留还是关闭？ | 保留结构、四色透明度压到 .07–.10、渐变底改 `#1a1814→#1c1916→#1f1b17` | 完全关闭 `body::before` 只留纯暗底（更克制，但玻璃「液」的透射感会消失）。 |
| **D5** | `.ink-band` 暗态反相为亮纸块？ | 是：`--surface-ink #e5ded2` + 墨字 `#1b1712`（13.34:1） | 保持深块只加亮 hairline（更保守，但锚点作用消失）。 |
| **D6** | 深陶土块（`.cell-orange` / `.block-orange`）暗态字色？ | 改**墨字** `#1b1712`（5.71:1），与浅态纸字反相 | 亮纸字仅 2.34:1 ✗，不可选。 |
| **D7** | 城市卡名次角标暗态保持浅纸片？ | 保持 `#fdfaf4` 底 + 墨字（15.15:1），照片上的「纸片」明暗一致 | 改暗底亮字（与照片格 mask 白字一致，但角标识别度下降）。**注意无论哪种，字色都不能继续用 `--text-color`**。 |
| **D8** | 4 个 CSS 纹样页的暗态处理？ | `qixi` / `laba` 加浅纸画布 `#e5ded2`，`yuanxiao` / `zhongyuan` 自带底保持；12 个纹样主色全不动 | 逐个重定 12 个 `--fs-fig-*`（工作量大且会溢出单页破例边界，不建议）。 |
| **D9** | 暗态 `img` 的 `brightness` 怎么处理？ | 取消或降到 `.97`（`dark-colors()` 原为 `.9`） | 保持 `.9`（照片格已有 mask，会二次压暗）。 |
| **D10** | 关于页复制 toast 与二维码浮层暗态？ | toast 改亮纸底墨字；二维码浮层加浅纸底 + padding + 暗态阴影 | 保持墨底 toast（会融入暗底不可见）。 |
| **D11** | 切换按钮桌面位置与文案？ | `.site-nav-actions` 内搜索之后、汉堡之前；`aria-label`「切换到深色/浅色模式」，移动端标签「深色 / 浅色」 | 放进「更多」下拉（不推荐：会引入 hover 断链风险，见 §4.4）。 |
| **D12** | 反色块 / 装饰块 / 玻璃层 / 阴影 / hairline 的整组暗值（§2.1 #2/9/10/11/14/15/17/18/19、§2.2 全表、§2.3 光场）是否整组采纳？ | 整组采纳（数值与算式已在表中逐项给出） | 逐项给值也可，但需保持「两档纸色 + 层级靠线」不破。 |
| **D13** | 后台 `/admin/` 是否一起做暗色？ | 本次不做（按主理人路由说明）；浅色 `--accent` 不动，`test/css-tokens.js` 不受影响 | 若要一起做，须另开一轮：`admin.css` 改值 + bump 版本号 + 扩 `test/css-tokens.js` 的 SHARED 列表。 |

---

## 10. 验收口径（可被 grep / 测试断言锁死）

以下每条都可写成断言脚本，作为实施后的验收条件；按 ERRORS §0，实施中若出现偏差须当场记入 `ERRORS.md` 并附机制型防复发。

**配色红线**
1. grep `themes/fluid/_config.yml` 全部 `*_dark` 值，**不得命中** §2.3 冷蓝组 8 值：`#181c27 #1f3144 #252d38 #435266 #1589e9 #30a9de #364151 #46647e`；也不得命中 `#c4c6c9 #a7a9ad #d0d0d0 #687582 #9da8b3`。
2. grep `_variables/base.styl` 的 `$highlight-bg-color-dark` / `$inlinecode-bg-color-dark` 与 `color-schema.styl` 的 `.license-box`，不得含 `#2d333b` / `rgba(99,110,123,.4)` / `rgba(#3e4b5e,.35)` 等冷蓝灰。
3. 暗态所有不透明色值的 `R > G > B`（脚本解析 HEX 逐通道断言）；冷色相破口数 = 0。
4. 暗态不透明底只有 `#1a1814` 与 `#242019` 两档（§2.6）；不得出现第三个不透明纸色值。
5. 按 WCAG 公式脚本断言：`--accent` 暗值对 `#1a1814` **≥4.5:1**、对 `#242019` **≥4.5:1**；`--text-color` / `--sec-text-color` / `--info-mark` / `--post-link-color` / `--navbar-text-color` 暗值对 `#1a1814` 与 `#242019` 均 **≥4.5:1**；`--on-ink` 对 `--surface-ink` **≥4.5:1**；`.cr-tile-rank` 字色对其底 **≥4.5:1**；`.cell-orange` 字色对 `#d97757` **≥4.5:1**。

**token 单源 / 后台**
6. `node test/css-tokens.js` **全 PASS**；`site.css` 首个 `--accent` 定义仍为 `#a8482c`，`source/admin/admin.css` 未改动、无版本号 bump。
7. 暗态新增 HEX/rgba **只出现在** `_config.yml` color 段与 `site.css` 的 `:root` / 暗态覆盖块；组件规则内新增硬编码色值数 = 0（脚本统计切换前后 diff）。
8. `.cal-page` 作用域内 5 个变量 + `.cal-pinyin` 的暗态值已同步；`--fs-fig-*` 12 个纹样主色**一个未改**，且只出现在 `.fs-figure--css` 规则内（写进 `:root` 即 FAIL）。
9. 前台 `site.css` 缓存破坏由内容 hash 自动生成；`source/admin/` diff 为空。

**功能接线 / 状态机**
10. 构建产物 HTML 中 `data-default-color-scheme` 属性存在（Astro 与 Hexo 两侧都有）；`@media (prefers-color-scheme: dark)` 规则存在，且 `:root:not([data-user-color-scheme])` 选择器存在；`[data-user-color-scheme="dark"]` 规则存在。
11. `#highlight-css-dark` link 存在（`Styles.astro` 与 `css.ejs` 两侧）；`tools/prepare-assets.mjs` 中「dark_mode 关闭所以 dark 为 false」的假设已更新。
12. 桌面 `#color-toggle-btn` **恰好 1 处**、移动 `#mobile-color-toggle-btn` **恰好 1 处**；两者都绑定 click 且点击后 `localStorage['Fluid_Color_Scheme']` 写入 `light` 或 `dark`。
13. `color-schema.js` 中 `getHours` / `18` / `6` 时间兜底相关代码不存在；`resetSchemaAttributeAndLS` 不被「等于默认值」分支调用；LS 为空时 DOM 上 `data-user-color-scheme` 属性**不存在**。
14. 状态机 5 情形端到端断言：首次 dark / 首次 light / 未手动时系统切换跟随 / 手动后系统切换不跟随 / 清除 LS 后回跟随；写入值集合只含 `{'light','dark'}`，不含 `auto`、不含第三态。
15. 首屏无 FOUC：`<head>` 中存在内联同步暗态判定脚本，且其位置早于首个 CSS link；用 CDP 截取首帧，已存 dark 的访客首帧底色为 `#1a1814`。
16. `meta[name="theme-color"]` 在跟随系统态与手动态都与当前生效底色一致。

**切换按钮 / 可访问性**
17. 按钮元素为 `<button type="button">`，带 `aria-label`（值属于 `切换到深色模式` / `切换到浅色模式` 两字符串之一）与 `aria-pressed`；移动端可见文字标签与 `aria-label` 同源；全仓不得出现新增的对外文案 / 口号 / 个人标识字符串（R-9）。
18. `aria-label` 不含 emoji；切换按钮 DOM 内不含 emoji / 太阳月亮字符 / 发光渐变 / 彩色 glow；`focus-visible` outline 为 `2px solid var(--accent)` + `offset 2px`。
19. 导航下拉 `#navbar .site-nav-list .dropdown-menu` 的 `margin-top` 为 `0`；触发项与面板之间无 margin/间隙，间距只来自面板 `padding`；切换按钮不在任何 `.dropdown-menu` 内。
20. 关闭态九宫格不进入 Tab 序列；Tab 顺序 = DOM 顺序；31 页 h1 唯一性断言保持。

**动效 / 页面**
21. `@media (prefers-reduced-motion: reduce)` 下所有明暗过渡与 `ambient-drift` 均为 `none`；过渡属性白名单只含 `background-color / color / border-color / filter`，时长 ≤200ms；布局量 / 字号 / 圆角 / `aspect-ratio` 不参与过渡。
22. 所有页面在 375 / 768 / 1440 三档无横向溢出；`.cr-tile-cover` 保持 `aspect-ratio: 16/9`（窄屏 16:8）、`.cr-tile-cover--none` 兜底仍在；图片挂入后布局不崩。
23. `.wall-feature-mask` / `.wall-cell-mask` 渐变规则仍存在且未被削弱（§2.2 唯一兜底）；照片格白字对比度抽样 ≥4.5:1。
24. 全站不出现评论 / 留言 / UGC / 登录元素；`_config.yml` comments 段保持 `enable: false`（R-6 / PRD §2.2）。

---

**本方案只规定 token、规则与验收口径，不含「改哪个文件哪一行」的实施步骤，不含 HTML/CSS 实现代码。主人确认 §9 全部拍板项后，方可进入实现阶段。**
