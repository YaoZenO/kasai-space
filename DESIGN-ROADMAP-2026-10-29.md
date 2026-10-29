# 前端 V4「静纸」改造步骤（2026-10-29）

**依据：** `DESIGN-REVIEW-2026-10-29.md`
**原则：** 分层重构，不推倒主题；每一步都可单独回退、单独验收；不触碰 `inject_point` / 加密 / 搜索 / 后台接口契约。

---

## 0. 改动面

| 文件 | 动作 |
|---|---|
| `themes/fluid/_config.yml` | color 段 6 个值改色（仅改值，不重构结构） |
| `source/css/site.css` | 色值字面量替换、标题轨与字阶、首屏网格、页脚、页壳间距、导航断点 |
| `themes/fluid/layout/_partials/site/nav.ejs` | 导航断点类名（`d-lg-*` → 自有 class） |
| `test/css-tokens.js` | 同步 `--surface-ink` / `--on-ink` 期望值 |
| `DESIGN-LANGUAGE.md` | 追加 V4 修订案（token 表与字阶表就地更新） |
| `DESIGN-REVIEW-2026-10-29.md` / 本文 | 新增 |

不改：`themes/fluid/layout/**` 其余模板、`source/admin/*`、`api/*`、`.cal-page` 作用域。

---

## P0 色板迁移

1. `themes/fluid/_config.yml` color 段：
   - `body_bg_color` `#f5f1e9` → `#faf9f5`
   - `navbar_bg_color` `rgba(245, 241, 233, 0.88)` → `rgba(250, 249, 245, 0.88)`
   - `navbar_text_color` / `text_color` / `post_text_color` / `post_heading_color` `#2a251d` → `#141413`
   - `sec_text_color` `#736a5c` → `#6b6862`
   - `board_color` `#fdfbf6` → `#fffefb`
2. `site.css` 内字面量统一替换：
   - `#2a251d` → `#141413`；`#f5f1e9` → `#faf9f5`；`#fdfbf6` → `#fffefb`
   - `rgba(42, 37, 29` → `rgba(20, 20, 19`；`rgba(245, 241, 233` → `rgba(250, 249, 245`；`rgba(26, 22, 16` → `rgba(20, 20, 19`
3. token 段：`--surface-ink`、`--ink-warm`、`--on-ink`、`--cream-on-dark`、`--cream`、`--line-strong`、`--site-float-shadow`、`--site-chip-border` 同步。
4. `--block-yellow` `#e6b23c` → `#e2bc6a`。
5. `test/css-tokens.js` 两条断言改期望值（`--surface-ink: #141413`、`--on-ink: #faf9f5`）。

**验收：** `npm run test:tokens` 通过；grep 无旧纸色残留（`.cal-page` 段除外）。

---

## P1 标题轨与字阶

1. `site.css` 顶部标题轨规则：`--font-serif-title` → `--font-display`，字重 600 → 700，去掉 `font-optical-sizing`。
2. `--font-serif-title` 注释改为「仅 §4.12 节假日页保留」。
3. 字阶按 REVIEW §4.2 表改：站名 800 / 3.6rem 封顶；`--fs-hero` 2.9rem 封顶；页头 2.6rem；文章标题 2.35rem；栏标题 1.35rem；列表标题 1.15rem。
4. `#modalSearch .modal-title` 900 → 700。
5. `DESIGN-LANGUAGE.md` §3.2 字阶表同步（`--fs-hero` 行被 `test/css-tokens.js` 锁定，必须同批改）。

**验收：** grep `font-weight: 900` 只剩 `.cal-page` 例外；文章页 / 首页 / 归档三页标题均为无衬线；`npm run test:tokens` 通过。

---

## P2 构图、导航与页脚

1. `.home-hero` 5fr:7fr → 4fr:8fr，`gap` 上限提到 5rem。
2. `.wall` 行高：`grid-auto-rows: minmax(158px, auto)` → `grid-template-rows: repeat(2, 196px)`（桌面）；≤991 改 `repeat(2, 170px)`；≤575 单列 `auto`。
3. 关于页：`.about-head` 加 `max-width: 42rem`；头像 148 → 132px。
4. 页脚：`footer .footer-inner` 收口到容器宽度、左对齐、上方 2px 墨线；首页 `.home-end` 底距收一档，避免两个收尾之间出现大空带。
5. 页壳：新增 `--space-page-top: clamp(104px, 12vh, 136px)`，`.home` / `.paper-page` 共用。
6. 导航断点：`nav.ejs` 去掉 `d-none d-lg-flex` / `d-lg-none`，改挂 `site-nav-center` / `site-nav-toggle` / `site-mobile-menu`；`site.css` 里用 `@media (min-width: 840px)` 控制胶囊与汉堡互斥。
7. 动效：首屏 `.identity` / `.wall` 一次性 `fade-rise` 420ms，`prefers-reduced-motion` 关闭。

**验收：** 1440 / 968 / 598 三档截图；968 档出现胶囊；无横向溢出；页脚左右两端对齐容器；关于页头像与正文左缘对齐。

---

## P3 文档与回归

1. `DESIGN-LANGUAGE.md` 追加 §11「V4 修订案」：色板、字阶、首屏比例、页脚、导航断点五项，并标注替代条款编号。
2. 全量 `npm test`（admin / pages / tokens / claims / blocks / assets / dates / holidays / zodiac / festival / cityrank）。
3. 构建后抽查新首页、文章页、关于页产物字节数。
4. 交付报告：改动文件、验证命令、未验证项、是否需要推送。

**回退：** 每阶段改动集中在 `site.css` 的对应分区 + `nav.ejs` + 主题 color 段，`git diff` 可按文件回退；不涉及数据文件与模板结构。

---

## 风险

| 风险 | 处置 |
|---|---|
| 色板替换误伤 `.cal-page` 单页例外 | `.cal-page` 段自带字面量（`#f7f6f4` / `#1a1a1a`），不受全局 token 影响；替换后单独截图节假日页 |
| `--accent` 若被顺手改成陶土橙，AA 失效 | 本轮不碰 accent；REVIEW §4.1 已写明理由 |
| 导航断点改动导致 840–1199 辅助入口丢失 | 辅助导航在该区间保留在胶囊右侧，仅在 <840 进九宫格 |
| 行高固定后内容溢出（长标题格） | 先实测三档；溢出则把 196 → `minmax(196px, auto)` 并复核 |
| 测试按旧 token 断言 | P0 同批更新 `test/css-tokens.js`，不放宽判据 |
