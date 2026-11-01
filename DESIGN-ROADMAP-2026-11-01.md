# 前端改进排期 · 2026-11-01

依据：`DESIGN-REVIEW-2026-11-01.md`（缺陷 D-01～D-12）
方向：**C 暖纸 + 保留轻玻璃**（主人 2026-11-01 拍板，对比图 `design/design-directions-2026-11-01.png`）
本轮执行：**P0 + P1（缺陷 + 方向骨架）**；P2 仅记录，不在本轮扩面。

---

## P0 · 内容级与一致性缺陷（必修）

### S1 摘要数字实体解码（D-01）

- 文件：`themes/fluid/scripts/helpers/excerpt-text.js`
- 改动：`ENTITY_RE` 从白名单扩到「全部命名实体 + 十进制 + 十六进制数字实体」；
  解码顺序先命名后数字，避免 `&amp;#x2F;` 二次解码。
- 防复发：`test/module-dates.js` 或新增断言扫 `public/archives/index.html`
  文本，出现 `&#x2F;` / `&amp;amp;` 字面串即 FAIL。
- 验收：线上同款摘录文本输出为 `必看 / 选看`。

### S2 模块列表页 H1 字重收口（D-03）

- 文件：`source/css/site.css:2106`
- 改动：`.page-head-plain .page-head-title` 字重 700 → 600，与 V5「标题一律 600」一致。
- 验收：`games / projects / favorites` H1 计算字重 600。

---

## P1 · 方向骨架（暖纸化）

### S3 备份

- 目录：`design/backup-V6.3-blue-2026-11-01/`
- 内容：`source/css/site.css`、`themes/fluid/_config.yml`、`source/admin/admin.css`
- 纪律：备份只读保留，不做任何「顺手清理」。

### S4 site.css 色板迁移（D-11 / D-12）

- `:root` tokens 换值（见审查文档 §3 色值表）：`--accent / --accent-strong /
  --accent-soft / --info-mark / --surface-ink / --on-ink / --on-ink-sec /
  --on-ink-line / --line-strong / --cream / --block-yellow / --block-orange /
  --site-float-shadow / --site-chip-border`。
- 全文件字面色值同步（134 处命中）：`#0a7cff / #0066e6 / #1d1d25 / #4c4c58 /
  #858593 / #f6f7fb / #ccd3e0 / rgba(10,124,255,…) / rgba(29,29,37,…) /
  rgba(31,38,80,…) / rgba(246,247,251,…)`。
- 实现方式：Node 脚本按「旧值 → 新值」映射做全文替换，UTF-8 读写（**禁止**
  PowerShell `Set-Content`，E-026）；替换后逐条 diff 复核，不做正则模糊替换。

### S5 主题 color 段同步

- 文件：`themes/fluid/_config.yml` `color:` 段
- 键：`body_bg_color / navbar_bg_color / navbar_text_color / text_color /
  sec_text_color / board_color / post_text_color / post_heading_color /
  post_link_color / link_hover_color / link_hover_bg_color /
  button_hover_bg_color / line_color / scrollbar_color / scrollbar_hover_color`
- 规则：值必须与 S4 的 token 等值或为其透明度衍生；不新增键。

### S6 光场与玻璃暖化

- 文件：`source/css/site.css` `body::before` 多层背景 + 玻璃组（`.site-nav-capsule`、
  辅助胶囊、下拉、移动端九宫格、`.wall-cell`、`.module-card`、`.games-tile`）
- 改动：光斑四色 `#aec8f0 / #d4c6ee / #f6d9bd / #c0e6d3` → 暖调
  `#f0d6be（陶土）/ #e9e0c8（沙）/ #d4e1ce（鼠尾草）/ #e8c9b6（粉陶）`；
  ambient 线性渐变三档暖纸；玻璃底 `rgba(255,255,255,.45/.55/.66)` → 暖白
  `rgba(255,253,247,.52/.62/.72)`；高光描边保留 `rgba(255,255,255,.78)`。
- **纪律（V6.2）**：光场与玻璃成对改，不得只改玻璃不动光场。

### S7 测试与规范同步

- `test/css-tokens.js`：`--surface-ink` / `--on-ink` 断言值更新到新色；
  新增 `--accent` 与 admin.css 等值断言保持生效。
- `source/admin/admin.css`：`--accent` 改为 `#a8482c`（后台强调色与前台等值，
  两处必须同批改，否则 token 测试红）。
- `DESIGN-LANGUAGE.md`：追加 **§14 V6.5「暖纸玻璃」修订案**，列明被替代条款
  （§13 表第 1/2/3/6/8 行的冷色值），并写清「字体轨、圆角标尺、玻璃结构不变」。
- `ERRORS.md`：若本轮产生任何失误，同批立档；本计划不预设条目。

---

## P2 · 记录，不在本轮执行

| 编号 | 事项 | 说明 |
|---|---|---|
| D-02 | 单篇文章 11px 自定义标签 | 内容层；改文章自带 `<style>` 需主人确认是否保留该表格形态 |
| D-04 | 游戏封面自带艺术字与叠加信息撞车 | 内容选图；建议「封面不含大字」作为选图规则写进数据规范 |
| D-05 | 归档页精选与全量列表重复 | IA 决策：保留/改「精选即前 3 篇」/ 删精选 |
| D-07 | 年历横向滚动无提示 | 加右侧渐隐 + 「可横向滑动」小字，需 375 档实测 |
| D-08 | 首屏摘要悬空标点与元信息堆叠 | `excerptText` 增加句子边界收敛；摘要长度分档 |
| D-09 | 404 kicker 字距 | 数字型 kicker 单独降 letter-spacing |
| D-06 | 分类页组顶线累积视觉 | 改为组间 2px、组内 hairline，需截图对比后定 |

---

## 验收清单

1. `npm run build` → `public/` 生成，抽查 `public/index.html`、`public/archives/index.html`
   非 0 字节（E-029）。
2. `npm test` 全绿（admin / pages / tokens / claims / blocks / assets / dates /
   holidays / zodiac / festival / cityrank）。
3. Playwright 复核 1440 与 390：`docW == clientWidth`（无横向溢出）；
   归档页文本无 `&#x2F;`；`games` H1 字重 600；玻璃胶囊仍可见（`backdrop-filter` 生效）。
4. 截图归档：`design/v65-*.png`（首页 / 归档 / 游戏 / 节假日，桌面 + 移动）。
5. **不 commit / 不 push**（AGENTS §3：需显式授权）。

---

## 回滚

`design/backup-V6.3-blue-2026-11-01/` 三个文件拷回原位 + `git checkout` **禁止**
（E-032/E-033：不得用 checkout 还原，避免连带覆盖主人未提交改动）；
必要时用备份文件的**精确字节**回写对应文件。

---

## 执行记录（2026-11-01）

| 步骤 | 状态 | 证据 |
|---|---|---|
| S1 摘要实体解码 | 完成 | `excerpt-text.js` 加数字实体解码；`test/module-pages-e2e.js` 新增摘要泄漏断言；产物扫描 0 处 `&#x2F;` |
| S2 模块页 H1 字重 | 完成 | `site.css:2106` 600；`test/css-tokens.js` 新增断言；实测 `h1w=600` |
| S3 备份 | 完成 | `design/backup-V6.3-blue-2026-11-01/` 三文件 |
| S4 site.css 色板迁移 | 完成 | `:root --accent:#a8482c`；全文旧蓝/旧墨字面值 0 命中（仅注释提及历史） |
| S5 主题 color 段 | 完成 | `themes/fluid/_config.yml` 14 键全部暖纸值 |
| S6 光场与玻璃暖化 | 完成 | `body::before` 四色暖调；玻璃底暖白；实测 `backdrop-filter: blur(28px) saturate(2)` |
| S7 测试与规范同步 | 完成 | css-tokens / holidays-e2e / zodiac-e2e / admin.css（+ `?v=` bump 至 20261101）/ DESIGN-LANGUAGE §14 / ERRORS E-085~E-089 |

验收清单 1/2 见交付报告；3 已实测（12 组 `docW == clientWidth`，无横向溢出）；
4 截图落在 `design/verify-2026-11-01/`；5 未 commit / 未 push（待主人授权）。
