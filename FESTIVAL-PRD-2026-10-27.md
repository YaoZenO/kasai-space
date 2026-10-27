# 节日文化详情页族 PRD（`/library/<节日>/`）

| 项 | 值 |
|---|---|
| 版本 / 状态 | V1.0（2026-10-27）· 待主人确认，确认后作 Phase 2/3 依据 |
| 范围 | 已有站点上新增一个页面族：12 个中国节日的文化长文详情页 |
| 参考源 | studycli.org/zh-CN/category/chinese-holidays/（只借鉴信息架构，不复制文案） |
| 现状依据（已实地读） | `holidays.yml`、`library.yml`、`zodiac.yml`、`library.ejs`、`zodiac.ejs`、`ZODIAC-RESTRUCTURE-2026-10-25.md` |
| 硬约束 | `AGENTS.md` §5.2；`ERRORS.md` E-028/E-029/E-042/E-047/E-049/E-052；`PRD.md` §2.2 非目标 |

---

## 1. 项目背景与目标

本站已有两条专题页面族：节假日日历页族（`/holidays/2021/`–`/holidays/2036/`，按年份组织，回答「哪天放假」）与生肖页族（`/zodiac/<动物>/`）。2026-10-25 建成的资料库 `/library/` 把两者收进一个可扩展的聚合入口。

缺的是第三条腿：**按节日组织的文化长文**。日历页不回答「端午为什么要赛龙舟」「中元节在祭谁」，而这正是搜索流量入口。参考源 studycli 的「中国节假日」板块正是两半——逐年日历 + 单节日文化长文——我们只做后半。

目标：在 `/library/` 下新增 12 个节日文化详情页，与日历页形成「日期 ↔ 文化」的补充，且**不新增需要人工重复维护的第二份日期数据**。

非目标：不改造 `/holidays/` 页面族与 `holidays.yml` 既有字段；不做节日索引页；不做 UGC（站点未备案，`PRD.md` §2.2）。

---

## 2. 目标用户与使用场景

| 用户 | 场景 | 要求 |
|---|---|---|
| 搜索引擎来客（主力） | 搜「2027 年中秋是几号」「重阳节的来历」落地 | 日期准、标题层级与表格可抓取 |
| 资料库浏览者 | 在 `/library/` 逐条点进 12 个节日 | 面包屑清晰、可横向跳转、可回资料库 |
| 日历页读者 | 在 `/holidays/2026/` 看到「中秋 9/25」，想知道它是什么 | 两族可互链（本期单向：节日页 → 日历页锚点） |
| 主人（唯一维护者） | 每年 11 月官方通知发布后更新日历数据 | 节日页日期自动跟随，不许手工再改一遍 |

**口径提醒**：参考站读者是学中文的外国人，其「词汇表/祝福语」带教学口吻。本站是个人空间，不是语言教学站——拼音保留（对「腊八」「中元」等生僻字有读音价值），但**不写教学口吻**。

---

## 3. 核心目标与成功标准

一律写成可被 `test/festival-e2e.js` 断言的形式（判据口径沿用 `test/zodiac-e2e.js`）：

| 编号 | 标准 | 断言形式 |
|---|---|---|
| S1 | 12 页全部生成且非半成品 | `public/library/<slug>/index.html` 存在且 `size > 15000` |
| S2 | 骨架完整、目录可用 | 每页 `#sec-` 锚点 ≥ 7；右栏目录 `<li>` 数 == 数据 `sections` 数 |
| S3 | 配图合规（含无图降级） | **有图**：作者非空 + 授权匹配 `/^(CC0\|CC BY\|CC BY-SA\|公有领域\|Public domain)/` + 链接匹配 `/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/` + 页面渲染出署名行；**无图**：必须命中 `.fs-figure--css` 且页面无 `src=""` 的空 `<img>`；两种形态都不允许「图位空着」 |
| S12 | 年份表渐进增强 | 默认态 HTML 里已含全部 11 行（断言 `<tbody>` 行数 == 11）；「5 行 + 展开」由 JS/CSS 收紧，**无 JS 时 11 行仍全部可见**；`<details>` 或类名方案均可，但不得用「默认 `display:none` 靠 JS 打开」 |
| S4 | 跨源日期一致（最关键） | 12 slug × 11 年 = 132 行日期全非空；2026 行 == `holidays.yml` 2026 年记录的 `date`；法定 6 个的 `start/end` 逐字相同 |
| S5 | 资料库入口完整 | `#topic-festivals` 列出 12 条 entries 且每条 `link` 的 `public` 文件存在；`holidays` 专题仍 2 条未被改动 |
| S6 | 缺数据时不静默 | 任一 slug 在 `holidays.yml` 任一年取不到记录 → FAIL（E-047 防复发） |
| S7 | 无 UGC | 12 页 HTML 不含 `<form`、不含评论容器 |
| S8 | 中文无折行插空格 | 数据所有 `body` 字段不含换行符（E-042 防复发） |
| S9 | 日期不渲染成 GMT | 页面文本不出现 `GMT+0000`；数据日期字段是字符串而非 Date（E-028） |
| S10 | 全站测试不退化 | `npm test` 九套 → 十套（新增 `test:festival`），全绿 |
| S11 | 两视口无横向溢出 | 桌面 1440 / 移动 390 溢出为 0；目录 sticky、进度环滚到 60% 显示「已读 60%」 |

---

## 4. 信息架构与站点地图

```
/                                  首页
└─ /library/                       资料库（library.ejs）
   ├─ #topic-zodiac    十二生肖   → /zodiac/ 、/zodiac/<12 动物>/
   ├─ #topic-holidays  中国节假日 → /holidays/ 、/holidays/<2021–2036>/
   └─ #topic-festivals 节日文化   → /library/<12 节日>/   ← 本期新增
```

### 4.1 slug 清单（与 `holidays.yml` 对齐）

法定 6 个沿用 `holidays.yml` 里 `years[].holidays[].id`（已实地核对，不得改拼）：

| # | 节日 | slug | 关联键 | 取值位置 |
|---|---|---|---|---|
| 1 | 元旦 | `yuandan` | `id: yuandan` | `holidays[]` |
| 2 | 春节 | `chunjie` | `id: chunjie` | `holidays[]` |
| 3 | 清明节 | `qingming` | `id: qingming` | `holidays[]`（不取 `terms[]`） |
| 4 | 端午节 | `duanwu` | `id: duanwu` | `holidays[]` |
| 5 | 中秋节 | `zhongqiu` | `id: zhongqiu` | `holidays[]` |
| 6 | 国庆节 | `guoqing` | `id: guoqing` | `holidays[]` |
| 7 | 元宵节 | `yuanxiao` | 中文名「元宵节」 | `festivals[]` |
| 8 | 七夕节 | `qixi` | 中文名「七夕节」 | `festivals[]` |
| 9 | 中元节 | `zhongyuan` | 中文名「中元节」 | `festivals[]` |
| 10 | 重阳节 | `chongyang` | 中文名「重阳节」 | `festivals[]` |
| 11 | 冬至 | `dongzhi` | 中文名「冬至」 | `festivals[]`（不取 `terms[]`） |
| 12 | 腊八节 | `laba` | 中文名「腊八节」 | `festivals[]` |

规则：全小写拼音、无连字符、与既有 id 逐字相同。禁用值：`index`、`festivals`、`holidays`、`zodiac`（前一个是 `/library/index.html` 本身，后三个是 `library.yml` 的 topic key）。

**两条已核实的数据陷阱，必须在 helper 里写死**：冬至在 `holidays.yml` 里同时出现在 `festivals[]`（带 `note` 与 `lunar`）与 `terms[]`（只有日期），取前者；清明既是法定假日又是节气，取 `holidays[]`。取错会得到缺字段的裸记录且不报错，是 E-047 同款静默失败。

### 4.2 为什么不做劳动节，为什么保留元旦

`holidays.yml` 里有 `id: laodong`，参考站也有 `chinese-labor-day`，本次排除：它是 19 世纪起源的现代纪念日，无历法规则、无传说、无节令食物，可写的只有放假与出行——与日历页的劳动节条目重复，且凑不满 §6 骨架。日后补做则 slug 沿用 `laodong`。

元旦保留，是因为其文化含量来自名称本身的历史：「元旦」原指农历正月初一，1914 年起才被移作公历 1 月 1 日，原义让位给「春节」。可核实、有增量。

### 4.3 `library.yml` 改造 —— 推荐新增专题

**推荐：新增第三条 topic**（key `festivals`，title「节日文化」，kicker `FESTIVALS`，12 条 entries）；既有 `holidays` 专题保持不动（仍 2 条年份条目）。

理由三条：**①语义**——`holidays` 的自我定义是「2021–2036 年的放假安排」，塞进 12 篇文化长文后，一个专题会同时装「2026 年节假日」与「中秋节」，读者无法预判点进去看什么。**②成本**——`library.yml` 文件头已写明「新增专题只在这里追加一条 topic——模板、样式、测试都不用动」，新增专题正是这条约定的正确用法、零模板改动；塞进既有专题反而要改 `title`/`desc`，等于推翻已上线的表述。**③可读性**——`library.ejs` 第 67–76 行把 entries 渲染成 `.lb-entries` 行式列表（不是卡片），`.lb-entry a` 为 `7.5rem + 1fr` 两列，左名称右注解；生肖 12 条读着舒服，holidays 若变 14 条，左列会出现两种性质的词并排，像串了行。

**entries 约束**（已量过列宽）：`name` ≤ 5 汉字、`note` ≤ 20 字，否则折行。示例：`{ name: "中秋节", note: "八月十五 · 赏月与月饼 · 法定假日 1 天" }`。另在 `holidays` 专题的 `desc` 末尾补一句指向新专题的话（`link` 已占用，只改 `desc`），让两个专题互相可见。

---

## 5. 功能需求

### 5.1 跨数据源联动 —— 推荐方案 C（架构决策）

| 方案 | 做法 | 判定 |
|---|---|---|
| A | 详情页直接从 `holidays.yml` 读元数据与日期 | **否决**：`holidays.yml` 是年份维度、无节日维度；文化正文无处安放，强塞会让 155KB 文件再翻倍 |
| B | 新建 `festivals.yml`，日期在其中自维护一份 | **否决**：132 条日期手工抄录即第二份真相；2027 年官方通知改区间后日历页变、节日页不变。本站对这类不一致零容忍（`test/zodiac-e2e.js` 已锁死「生肖页春节日期 == `holidays.yml` 春节日期」），B 是主动制造 E-047 的复发条件 |
| **C** | **元数据与正文进 `festivals.yml`；逐年日期与放假区间由 helper 构建时从 `holidays.yml` 现算** | **推荐** |

取舍：**收益**①单一真相——日期只有一份，每年 11 月更新后 17 个日历页与 12 个节日页同时生效；②职责清晰——两文件只通过一个关联键耦合。**代价**①helper 需同时吃两个数据源（`festivalData(festivalsRaw, holidaysRaw, slug)`）；②6 个非法定节日在 `holidays.yml` 里只有中文名、无 id，字符串匹配是隐式耦合——**消解**：helper 内置显式映射表 `FESTIVAL_KEY = { yuanxiao: '元宵节', qixi: '七夕节', zhongyuan: '中元节', chongyang: '重阳节', dongzhi: '冬至', laba: '腊八节' }`，由 S6 锁死「每个 slug 在每一年取到且仅取到一条记录」。

### 5.2 逐年日期表（P0）

- 范围 **2026–2036 共 11 行**（数据边界即 `holidays.yml` 上限，不越界）。
- 法定 6 个：年份 / 当天（月日+星期+农历）/ 放假区间 / 天数 / 官方·预计标签；行尾链 `/holidays/<年>/#holiday-<id>`（该锚点已由 `holiday-calendar.js` 的 `anchor: 'holiday-' + id` 产出，可直接用）。
- 非法定 6 个：年份 / 日期（月日+星期+农历）/ 星期；不列放假区间，行尾链 `/holidays/<年>/`。
- **展示方式（2026-10-27 主人拍板）**：默认渲染**当前年起 5 行**，其余 6 行由「展开全部 11 行」按钮放出。
  必须是**渐进增强**：无 JS 时全部 11 行直接可见（`<details>` 或 JS 加类均可，但默认态不能是 JS 控制的隐藏），
  否则禁用脚本的读者看不到后半段日期。
- **固定日期节日特殊处理**：元旦（1/1）与国庆（10/1）当天日期逐年不变，重复 11 行无信息量。这两个改为**放假日历表**（年份 / 放假区间 / 天数 / 调休上班日），表头随数据切换；同样走「5 行 + 展开」。
- 「官方/预计」标签**由 `holidays.yml` 的 `label` 字段决定**，不得在文案里手写。

### 5.3 页面结构（P0）

沿用 `zodiac.ejs` 两栏：左正文 + 右 sticky 目录 + SVG 阅读进度环，移动端 FAB + 底部抽屉。目录列表由**模板按 `sections` 数据渲染**（无 JS 时锚点仍可用），JS 只增强——必须与生肖页一致，不得改成 JS 扫 DOM 生成。骨架见 §6.1。

### 5.4 页头与导航（P0）

- 面包屑 `资料库 / 节日文化 / <节日名>`，中间段链 `/library/#topic-festivals`（本期不建索引页）。
- 12 个 slug 横排导航条，当前项墨色加粗 + 2px 下划线（对齐 `.z-nav-strip`）；**CSS 必须锁死窄屏不溢出**（E-049 前科：16 个年份的导航条曾溢出 351px）。
- 页头下方 1 张主图 + 署名行（作者 / 授权 / 原文件页链接）。

### 5.5 底部口径（P0）· 5.6 相关阅读（P1）· 5.7 节内配图（P2）

5.5 沿用 `.cal-after` / `.cal-note`：写明历法依据、放假区间的官方与预计口径、「民俗传说属民间流传说法」。5.6 由模板自动生成、不进数据：同专题另 11 个节日 + 当年节假日页（+ 相关生肖页，[待定]）。5.7 第 2 张图放 `food` 或 `customs` 节内，同样带三要素署名。

---

## 6. 内容规划

### 6.1 章节骨架（参照 studycli 中秋页，本站精简改造版）

| 序 | id | 标题模式 | 优先级 | 处理 |
|---|---|---|---|---|
| 1 | `what` | 什么是XX节 | P0 | 并入参考站「要点速览」，做成 `facts` 表（别称 / 农历日期 / 公历日期规则 / 是否法定 / 法定天数 / 2026 年日期），复用 `.z-facts` |
| 2 | `when` | XX节在什么时候 | P0 | 当年日期 + 放假区间 + 未来 11 年表（helper 现算）+ 「日期怎么定出来的」 |
| 3 | `origin` | 起源与传说 | P0 | **传说与史实分开写**，史实注明出处年代 |
| 4 | `history` | 简史 | P0 | — |
| 5 | `customs` | 习俗与今天怎么过 | P0 | 合并参考站「今天人们怎么过」，补「不放假的节日现在怎么过」 |
| 6 | `food` | 特色食物 | P0 | 保留（生肖页无对应物，是本站差异点） |
| 7 | `vocab` | 词汇表与祝福语 | P0 | 表格（中文/拼音/含义/备注）+ 祝福语行；去掉教学口吻 |
| 8 | `faq` | 常见问题 | P0 | 3–6 条 |
| 9 | `end` | 结语 | P0 | — |
| 10 | `places` | 各地差异 | P1 | **有料才写**，无料整节不渲染，不许凑章节编造 |
| 11 | `poems` | 诗词与文化意象 | P1 | **只写有确切出处的**（作者+朝代+篇名+原句），查不到不写 |
| — | 参考站「要点速览」块 | — | 砍 | 并入 `what` 的 facts 表 |
| — | 参考站「引导段」块 | — | 砍 | 并入页头 `.cal-lede` |
| — | 参考站「相关阅读」 | — | P1 | 改模板自动生成（§5.6） |

**标题层级约定（不遵守会导致目录与 scrollspy 失效）**：`<h2 class="fs-section-title">` = 章节标题，进目录一级，锚点 `#sec-<id>`；`<h3 class="fs-sub-title">` = 章内小标题，**不进目录**（同 `zodiac.ejs` 的 `z-sub-title`）。

### 6.2 每页内容量预算（硬约束，防写崩）

| 项 | 预算 |
|---|---|
| 全页正文（去标签后计） | 1800–2600 汉字 |
| `what`/`when`/`origin`/`history`/`customs`/`food` | 250–400 / 150–250 / 300–450 / 250–400 / 300–450 / 200–350 字（`when` 表格不计） |
| `vocab` | 表 10–16 行，每行 ≤ 30 字；祝福语 2–4 条 |
| `faq` / `end` | 3–6 条（每条 40–90 字）/ 80–150 字 |
| `places`、`poems`（可选） | 各 150–300 字 |
| 段落 | 每节 2–4 段，每段 60–140 字 |
| 数据体积 | 单条目 ≤ 12KB，`festivals.yml` ≤ 130KB（对照 `zodiac.yml` 73KB / `holidays.yml` 155KB） |

### 6.3 配图与内容纪律

每页 1 张主图（P0）+ 可选 1 张节内图（P2），全部 Wikimedia Commons 自由授权，宽 ≥ 800px，存 `source/img/festival/<slug>.jpg`，三要素写入 `meta.images.<slug>`，页面必须渲染署名行（CC 授权前提），`alt` ≥ 4 字。

**无图降级（2026-10-27 主人拍板）**：某节日在 Commons 上找不到合适自由授权图时，**不硬凑照片**，
该页降级为**纯 CSS 绘制的抽象纹样**（沿用 `.fs-figure--css` 分支，见下方硬约束）。
降级表现为「同一视觉位的另一种填充」，不能让读者看出「这里本来应该有张图但漏了」。

配套硬约束（三处同步，缺一不可，否则降级只是一句口号）：
1. **模板**：`festival.ejs` 的图位写成「有图走 `<img>` + 署名行，无图走 `<div class="fs-figure fs-figure--css" aria-hidden="true">`」两条分支；无图时不渲染署名行（没有授权需要署）。
2. **样式**：`site.css` §4.15 必须实现 `.fs-figure--css`（按节日主色变量的几何纹样，宽高比与实图位一致 16:9），保证 12 页视觉节奏统一。
3. **测试**：S3 断言改为「有图则三要素齐全；无图则必须命中 `.fs-figure--css` 且不存在空的 `<img src="">`」，即两种形态都必须有产物、都必须被断言覆盖。

内容纪律：事实性口径重写，不复制参考站文案（对方有版权）；**严禁虚构**——人物、年代、文献必须有据可查，查不到就留空或整节不写（对齐 `zodiac.yml` 纪律第 5 条）；不写作者身份块。

---

## 7. 非功能需求

| 项 | 要求 |
|---|---|
| 性能 | 每页 ≤ 1 张主图，单图 ≤ 200KB、宽 ≤ 1600px；`loading="lazy" decoding="async"`；不引入新 JS 库 |
| 渐进增强 | 禁用 JS 时正文、表格、目录锚点全部可用（同生肖页） |
| 可访问性 | 目录与面包屑各带 `aria-label`、表格 `th scope`、图片 `alt` ≥ 4 字、焦点可见 |
| 兼容性 | 桌面 1440 / 移动 390 横向溢出 0；窄屏中文不在词中断行（E-043） |
| SEO | 每页唯一 `title`，格式 `<节日名> - KASAI'S Personal Space`（**2026-10-27 修订**：原定 `<节日名>｜节日文化` 格式，验收时发现与 zodiac / holidays 两族的全站后缀不一致，按「族内一致优先」豁免原格式；唯一性已满足）；sitemap 由插件自动覆盖；每页仅一个 `<h1>` |
| 备案合规 | 无评论、无留言、无表单、无 UGC（`PRD.md` §2.2） |
| 构建 | 全量文件数 308 → 约 322；每处改动须抽查产物字节数（E-029：渲染失败产出 0 字节但构建报成功） |

---

## 8. 技术建议与约束

| 新增物 | 位置 | 说明 |
|---|---|---|
| 数据 | `source/_data/festivals.yml` | `meta`（updated / images / 口径说明）+ `festivals[]`（12 条：key、name、pinyin、kind、holidayKey、sections[]、vocab[]、faq[]） |
| 模板 | `themes/fluid/layout/festival.ejs` | 新 layout，并在 `layout.ejs` 的 `paperLayouts` 登记 `'festival'` |
| helper | `themes/fluid/scripts/helpers/festival-data.js` | **自包含**（跨文件 require 在 Hexo vm 上下文会失败）；导出 `buildFestival()` 供模板与测试共用；双出口（注册 helper + `module.exports`），同 `holiday-calendar.js` |
| 页面 | `source/library/<slug>/index.md` ×12 | front-matter：`title` / `kicker: FESTIVAL` / `layout: festival` / `festival: <slug>` |
| 样式 | `source/css/site.css` §4.15（`.fs-*`） | **新增独立段，不动 §4.13/§4.14**（E-052 前科：整份覆盖写回旧版） |
| 脚本 | `source/js/festival.js` | 新文件，复制 `zodiac.js` 逻辑、选择器换 `.fs-` 前缀；**不改 `zodiac.js`**；走 `versionedAsset()` |
| 测试 | `test/festival-e2e.js` | `package.json` 加 `test:festival` 并串进 `npm test`（九套 → 十套） |

数据纪律（违反有对应断言）：①日期带引号写成 `"YYYY-MM-DD"`，否则被 js-yaml 解析成 Date（E-028）；②中文长文案一律单行，`body` 用单引号 YAML 字符串整行书写，换行只允许出现在 HTML 标签之间（E-042）；③模板不出现手写日期，每个日期由 helper 从 `holidays.yml` 算出；④测试一律 mock 模式（`ADMIN_DEV_MOCK=1`），绝不碰真实仓库（E-001）。

## 8.5 待定项裁决（2026-10-27 主人拍板，已回填至正文）

| 待定项 | 裁决 | 落点 |
|---|---|---|
| 是否加 `meta description` | **加**。每页由数据的 `desc` 字段输出，长度 60–120 字 | §7 非功能需求 SEO 行 |
| 年份表 11 行直出 vs 收起 | **当前年起 5 行 + 「展开全部 11 行」**；必须渐进增强，无 JS 时 11 行全可见 | §5.2；断言 S12 |
| Commons 找不到合适自由授权图怎么办 | **不硬凑**，该页降级为**纯 CSS 绘制的抽象纹样**；模板/样式/测试三处同步支持「无图也能看」 | §6.3；断言 S3 |
| 是否另建 `/library/festivals/` 索引页 | **本期不做**，入口仍是 `/library/#topic-festivals`；留 P2 | §10 |

**本期剩余未决 —— 已全部关闭（2026-10-27 实现落地）**：12 张图选型最终为 **8 张实图 + 4 张 CSS 抽象纹样**。实图：6 张法定复用既有库（yuandan/chunjie/qingming/duanwu/zhongqiu/guoqing，其中 qingming 图注按纪律写实描述）+ dongzhi（天坛圜丘，CC BY 2.0）+ chongyang（恽寿平菊图册页，MET CC0）经 Commons 检索取得；纹样降级 4 页：yuanxiao / qixi（既定样板）/ zhongyuan / laba（限时检索未获合格自由授权图，按 §6.3 降级裁决执行）。

---

## 9. 上线里程碑

沿用 `ZODIAC-RESTRUCTURE-2026-10-25.md` 的「每步一个 commit、message 以『节日N/7：』开头、任一步可独立回退」。回退：`git revert <对应 commit>`（未推送时用 `git reset --hard <上一步 commit>`）。

| 步 | 内容 | 涉及文件 |
|---|---|---|
| 1/7 | 数据骨架：`festivals.yml`（meta + 12 条元数据与关联键，正文先置最小可渲染版） | `festivals.yml` |
| 2/7 | helper：`festival-data.js` + 跨源取数 + 名称映射表；先跑通 S4/S6 | helper 文件 |
| 3/7 | 模板与页面：`festival.ejs` + `layout.ejs` 登记 + 12 个 `index.md` | layout ×2、页面 ×12 |
| 4/7 | 正文全量写入（建议拆 2 commit：法定 6 / 传统 6） | `festivals.yml` |
| 5/7 | 配图：12 张图下载 + 三要素入库 + 署名行渲染 | `img/festival/*`、`festivals.yml` |
| 6/7 | 样式与脚本：`site.css` §4.15 + `festival.js`（进度环 / scrollspy / 收起 / 抽屉） | `site.css`、`festival.js` |
| 7/7 | 入口与验证：`library.yml` 新增 12 条 + `test/festival-e2e.js` + 全量构建 + `npm test` 十套全绿 + CDP 两视口实测 | `library.yml`、`test/`、`package.json` |

每步结束都要抽查 12 个产物 HTML 的字节数（E-029），不能只看构建输出。

---

## 10. 后续可扩展方向

1. **反向互链（P1）**：`/holidays/<年>/` 的节假日详情卡加「了解这个节日 →」链到 `/library/<slug>/`。
2. **节日索引页（P2）**：`/library/festivals/`，按农历月份排序的 12 张卡片 + 一张「一年里的节日时间轴」。
3. **扩军（P2）**：三月三、夏至、教师节、儿童节等沿用同一套数据 + helper 追加；非法定节日走中文名关联键，模板与样式零改动。
4. **劳动节（P2）**：若主人改主意，slug 用 `laodong`，骨架需单独设计（`origin` 改为「国际劳动节的由来」）。
5. **节气专题（P3）**：`holidays.yml` 已有 16 年 × 24 节气数据，可复制本族模式做 `/library/<节气>/`。
