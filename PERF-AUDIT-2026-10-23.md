# 性能审查报告 — KASAI'S Personal Space

> ## ⚠️ 实施状态（2026-10-23 晚补记，读本文前先看这一节）
>
> 本报告已于 2026-10-23 晚**按 §6 顺序实施完毕**。实施过程中有 **3 条结论被实测推翻**，
> 正文相应位置已加「实测推翻」标注。以下是要点，避免拿过时数字对外承诺：
>
> | 报告原结论 | 实测结果 | 处置 |
> |---|---|---|
> | P0-1 子集化到 3500 字 → 3 个字体合计 350–480 KB（省 86%） | **实测 1,649,112 B（只省 36%）**。源字体本身已是 4560 glyph 子集，每字形约 273 B，报告按码位数线性外推严重低估（见 ERRORS.md E-060） | 主人改判：**放弃子集化，中文改系统字体栈**，中文字节归零 |
> | P0-4 「现有顺序是合法拓扑序，defer 不会断依赖」，仅 nprogress 一处陷阱 | **实测有 5 类内联脚本依赖 Fluid/jQuery**，加 defer 后会全部抛错（见 E-059） | 外部脚本 defer + 5 类内联块包 DOMContentLoaded，并用真实浏览器验收 |
> | P1 节假日图「77% 像素被裁」，可裁到容器尺寸 | 测试早已锁死「宽度 ≥800px、字节 >50KB」（详情卡支持放大）。保尺寸重编码 q85 仅省 10%，q70 质量不达标（见 E-061） | **放弃图片重编码**，原图原样保留 |
>
> **实际落地收益**（实测，非估算）：
> - 产物 **13,551,043 → 9,929,332 B（−26.7%）**
> - 首页首屏字体 **3,402,816 → 101,124 B（−97%）**，中文字体请求 **0 个**
> - 阻塞 CSS **66,397 → 34,206 B br（−48%）**（site.css 去注释压缩 −48.5%）
> - 全站静态资源 **1004 处**引用已带内容 hash，可安全 `immutable`
> - 换页条件请求 **31 → 1**（vercel.json 缓存头 + 全量 hash）
> - 导航预取已上线（Speculation Rules，CDP 实测 `PrefetchSuccessfulButNotUsed`）
> - 浏览器验收：6 页 0 JS 错误、`npm test` 全绿（含 52 项 holidays 断言）

- **审查日期**：2026-10-23
- **审计对象**：Hexo 8.1.1 + 自 vendored Fluid 主题，纯静态 MPA，Vercel 托管，域名 `https://www.040925.xyz`
- **审查范围**：资源体积 / 请求数量 / 渲染与加载流程 / 路由与跳转机制 / 缓存策略
- **审查性质**：只读诊断。未修改任何业务代码，未 commit / push。
- **证据基准**：`public/`（2026-10-23 23:08 构建产物）+ 线上 `curl` 实测响应头与 brotli 传输体积（快照 2026-10-23 15:27–15:36 GMT）
- **分项底稿**：
  - 传输与托管层 → `.workbuddy/output/perf-audit-assets.md`
  - 运行时与渲染 → `.workbuddy/output/perf-audit-render.md`

---

## 0. 一句话结论

**「首屏慢」是字太多，「切换慢」是每次都从零开始。** 这两件事根因不同，混着改会白做功。

| 主人感知 | 主要根因 | 主导指标 |
|---|---|---|
| 第一次打开要等 | 首屏要下载 **2.62 MB 字体**，其中 **96% 是中文**；且只有 1/7 被 preload；另有 **302 KB 阻塞渲染的 CSS** | FCP / LCP |
| 点导航要等 | **纯 MPA 整页重载 + 零预取**：无 prefetch / Service Worker / PJAX。每次导航 CSS/JS/字体全部重新解析、执行、解码 | 二次导航体感 |

---

## 1. 基线数据（实测）

`public/` 共 **294 个文件 / 13,551,043 B（12.93 MB）**。

| 类型 | 数量 | 原始 | brotli(q11) |
|---|---:|---:|---:|
| woff2 | 11 | 4,179,636 | 4,179,676（**几乎零收益**） |
| holidays HTML | 17 | 2,426,737 | 181,591 |
| jpg | 14 | 2,135,000 | 2,114,085（**几乎零收益**） |
| txt（stylekit base64） | 152 | 2,128,975 | 1,592,775 |
| 其它 HTML | 44 | 903,277 | 187,816 |
| png | 8 | 814,789 | 813,884（**几乎零收益**） |
| js | 27 | 388,690 | 111,028 |
| css | 12 | 362,856 | 60,688 |
| xml | 3 | 137,097 | 43,701 |
| **总计** | **294** | **13,551,043** | **9,344,454** |

**关键事实**：woff2 + jpg + png 合计 **7.13 MB（占 52.6%）在 brotli 下几乎零收益**，线上原样传输。

**首页冷缓存首次加载实测 = 2,901,736 B（2.77 MB）**，其中字体 **2,624,360 B（87%）**。

> ⚠️ 初版底稿曾按「最小必拉集」推成 1.61 MB，把 `noto-sans-sc-500/700` 当成最坏情况。复核 `site.css` 的字重密度（`font-weight:700` ×27、600 ×15、900 ×5、800 ×3、500 ×2）后确认：**首页确实存在 500 / 700 的中文文本，两个字体真实拉取**。正确值为 2.77 MB，中文占首屏字体 **96%**。
>
> **参考系**：全部 CSS + JS 加起来约 105 KB（线上 br）。**中文字体是所有 CSS + JS 总和的 24 倍。**
>
> **两个口径不要混用**：`node tools/perf-baseline.js` 输出的是**上界**（全站 font-weight 并集）= 8 个 / 3,402,816 B；首页首屏真实触发 = 7 个 / 2,624,360 B，少的那个是 `noto-serif-sc-700`（778,456 B），因为 `--font-serif-title` 只声明了 600，首页没有 700 字重的宋体文本。报告正文统一用**首页首屏口径**。

**每页请求数**：首页 24 + 5 字体 = 29；文章页 25 + 5 = 30；关于页 26 + 5 = 31。换页条件请求 **28～33 个**。协议为 **HTTP/2（h2 已生效）**，故请求数不是首要瓶颈。

---

## 2. 问题清单：具体位置与表现

### 2.1 【P0-1】中文字体 2.52 MB 压在首屏关键路径上

**位置**
- 声明：`source/css/site.css` L32-L38（sans 400）、L40-L46（sans 500）、L48-L54（sans 700）、L56-L62（serif 600）、L64-L70（serif 700）
- 文件：`source/fonts/noto-{sans,serif}-sc-*.woff2`
- preload：`themes/fluid/layout/_partials/head.ejs` L26（产物 `public/index.html` L14）

**表现**
- 5 条中文 `@font-face` **全部没有 `unicode-range`** → 任意一个汉字命中就整包下载
- 首页首屏实际触发 **4 个中文字体**（`body`→sans-400；`.nav-link{font-weight:500}` L249→sans-500；`.feed-title{700}` L929→sans-700；`.post-title/.pick-title{600}` L821/L888→serif-600），合计 **2,523,236 B**
- 加上 3 个拉丁字体，**首屏共 7 个字体文件 / 2,624,360 B**，中文占 96.1%
- **preload 覆盖率 1.3%**（只 preload 了 34,928 B 的 Archivo，中文一个都没有）
- `font-display` 全是 `swap` → 不是 FOIT 而是 FOUT：4 个中文字重陆续到达，**首屏至少 4 次文字重排 + 重绘**（黑体与宋体度量差异大，行高/换行位置会变）
- 字体是在 CSS 之后才被发现的**第三层依赖**：HTML → 5 个阻塞 CSS 下载解析完 → CSSOM 建好才发现 `@font-face` → 才开始发字体请求，中间隔着 1～2 个 RTT

**孤儿**：`noto-serif-sc-500.woff2`（758,904 B）全站无 `@font-face` 引用，纯死重。

### 2.2 【P0-2】缓存策略：全站 `max-age=0, must-revalidate`

**位置**：仓库根**无 `vercel.json`**、无 `_headers`、无 netlify.toml（已 `find` 全库确认）

**表现**（线上 `curl -D -` 实测，所有资源响应头完全一致）
```
Cache-Control: public, max-age=0, must-revalidate
```
- 每次换页，浏览器必须对 **26～31 个资源逐个发 `If-None-Match`**，拿到 304 才敢用本地副本
- HTTP/2 多路复用下这批发条件请求约 1 个 RTT，但**渲染仍要等它结束才能用上本地 CSS**
- 1.34 MB 中文字体每次换页都要 revalidate，且**不带 `Content-Encoding`**（brotli 对 woff2 无收益）
- `themes/fluid/scripts/filters/asset-version.js` 的 hash **只覆盖 3 个文件**（`main.css` / `site.css` / `holidays.js`）。**4.18 MB 字体 + 5.09 MB 图片 + 468 KB lib/css/js 全是裸路径** → 既吃不到长期缓存，也省不掉 revalidate
- 已验证 ETag + 304 确实生效（`X-Vercel-Cache: HIT`），CDN 边缘缓存没问题，问题在浏览器端策略

### 2.3 【P0-3】导航零预取 —— 「切换慢」的直接根因

**位置**：全站 `grep -rni "prefetch|serviceWorker|pjax|turbolinks|instantclick|quicklink"` → **0 命中**；`public/` 无 `sw.js`

**表现**：即使 HTTP 缓存 100% 命中（字节不用重下），每次导航仍完整重来：

| 环节 | 每次重复的成本 |
|---|---|
| HTML 文档请求 | 1 次 TTFB（无预取则无法提前拿到） |
| HTML 解析 | 首页 ~309 个标签；节假日页 ~1106 个标签 / 146 KB |
| **CSSOM 重建** | **302,895 B CSS 重新解析**，Chrome 无跨导航 CSSOM 缓存 |
| **JS 重新执行** | jQuery 89,795 + Bootstrap JS 62,440 + 主题脚本 ~27,000 = **~180 KB 重新 parse/eval**，首屏不需要 |
| **字体重新解码** | **2,624,360 B woff2 重新解码 + 重新匹配 + FOUT 重排** |
| 布局 + 绘制 | 整页重排重绘 |
| 插件重初始化 | `boot.js` 的 `registerEvents()` 每页重跑一遍 |

**这是「每次切页面又白/晃一下」的直接来源**——不是网络慢，是**解码 + 重排的 CPU 开销被完整重复了一遍**。跨文档之间什么都不共享。

**nprogress 是净负收益**（`public/index.html` L762-L771）：
- 它在 body 末尾才跑，**覆盖不到真正的空白期**
- `done()` 绑在 `window.load`，要等所有脚本 + 图片就位
- `trickleSpeed:100` 让它慢慢爬
- **只把等待可视化了，一毫秒没减少**

### 2.4 【P0-4】11 个脚本全部无 `defer`/`async`

> **2026-10-23 实施修正（本节可行性判断有误，见 ERRORS.md E-059）：**
> 本节下方写「已验证改造可行性：现有顺序本身是合法拓扑序，`defer` 保序不会断依赖」，
> 只识别出 nprogress 一处陷阱。**实测有 5 类内联脚本会因此抛错**：
> `Fluid.plugins.codeWidget()` / `Fluid.plugins.imageCaption()` /
> `Fluid.utils.createScript(anchor.min.js / fancybox / tocbot)`。
> 原因是内联脚本在**解析期**立即执行，而 `defer` 外部脚本要等文档解析完才执行——
> 两者不是同一个队列，`defer` 保序管不到内联块。
> 另外 `encrypt.ejs` 原本给**内联**脚本写了 `defer`，而 defer 对内联脚本无效，一直是无效写法。
>
> 实际改法：外部脚本全部 defer；上述 5 类内联块 + nprogress 内联块统一包
> `DOMContentLoaded`；`local-search.js`（IIFE、解析期直接调 jQuery）改 defer 保序。
> 已用真实 Edge 逐页验收（`tools/verify-runtime.js`）：6 页 0 JS 错误，功能全部正常。

**位置**：`themes/fluid/layout/_partials/scripts.ejs` L1-L5/L32、`head.ejs` L55-L56

**表现**
| 脚本 | raw | 阻塞? | 首屏必需? |
|---|---:|---|---|
| `js/utils.js`（head） | 7,341 | ✅ | 否 |
| `js/color-schema.js`（head） | 9,849 | ✅ | **否**（暗色模式已关闭） |
| `lib/jquery/3.6.4/jquery.min.js` | 89,795 | ✅ | 否 |
| `lib/bootstrap/4.6.1/js/bootstrap.min.js` | 62,440 | ✅ | 否 |
| 其余 7 个 | ~24,000 | ✅ | 否 |

head 里解析阻塞 **17,190 B**；body 里 jQuery + Bootstrap JS **152,235 B** 同步阻塞解析，且与字体下载**争抢同一条 HTTP/2 连接的带宽**，拖慢 LCP 图片到达。

**已验证改造可行性**：现有顺序本身是**合法拓扑序**，`defer` 保序不会断依赖；`boot.js` 绑的是 `DOMContentLoaded`，defer 脚本在其之前执行，不会漏绑事件。
**陷阱**：`nprogress.min.js` 若加 defer，紧随的 inline 块（L765-L771）会先执行导致 `NProgress` undefined，必须一并外置或删除。
**落地方式**：`themes/fluid/scripts/helpers/url.js` L11-L13 的 `js_ex(base, relative, ex)` 第三参数会插进标签，改调用即可，无需手写标签。

### 2.5 【P0-5】渲染阻塞 CSS 302 KB，bootstrap 约 80% 是死代码

**位置**：`themes/fluid/layout/_partials/css.ejs` L1；`source/css/site.css`

**表现**（`public/index.html` L45-L72 + L763）
| 文件 | raw | gzip | 阻塞 |
|---|---:|---:|---|
| `bootstrap.min.css` | 162,017 | 24,089 | ✅ |
| `site.css?v=f37385b7` | 83,870 | 26,248 | ✅ |
| `main.css?v=1f509b2d` | 49,467 | 8,469 | ✅ |
| iconfont ×2 | 6,441 | 1,507 | ✅ |
| `nprogress.min.css`（在 body 里） | 1,100 | 446 | ⚠️ |
| **合计** | **302,895** | **60,759** | |

- **Bootstrap 类名交集 51 / 1553 = 3.3%**（全站 61 个 HTML 去重出 411 个类名）。按规则字节口径，宽松命中 19.9%、严格 4.4%。**约 80%（≈130 KB raw / ≈19 KB gzip）是死代码**，且是渲染阻塞的
- **`site.css` §4 逐页样式占 66,059 B（78.8%），在每个页面都被完整下载**。其中**节假日页 21,375 B 在首页、文章页、归档页全量下发**；首页自己只需 14,269 B
- **`site.css` 未压缩**：83,870 B / 2,738 行 / 155 个注释块共 16,170 B。实测去注释 + 去空白后 brotli 从 21,913 → **7,527 B**，线上单页可省约 18 KB
- 无 `@import`（已核验），不存在 CSS 串行请求链，这点没问题

### 2.6 【P1】图片体积与尺寸失配

> **2026-10-23 实施结论：本条未执行，收益不成立（见 ERRORS.md E-061）。**
> 报告说节假日图「约 77% 像素被裁」，但 `test/holidays-e2e.js` L584-594 早已锁死
> 「宽度 ≥ 800px、字节 > 50KB」——因为**详情卡支持放大查看**。
> 按容器尺寸裁到 700px 会直接让该测试 FAIL。
> 保尺寸重测：q85 仅省 10.0%（PSNR ≈ 35.9 dB），q70 省 43.7% 但 PSNR 掉到 27.2 dB
> （放大后会糊）。**结论：放弃重编码，原图原样保留。**
> stylekit `.txt`（base64 包装）与 games 封面的同类优化同样未执行——理由相同：
> 需先与既有设计约束对账，不能只从性能单一视角改。

| 组 | 现状 | 问题 |
|---|---|---|
| `img/holidays/*.jpg`（7 张，1,375,314 B） | 源 960×~600，渲染在 **148 px 高**容器（`site.css` `.cal-panel-img`） | **约 77% 像素被裁掉**，可省 0.95–1.09 MB |
| `img/stylekit/*.txt`（150 个，2,124,408 B） | 内容是 base64 包装的 WebP，真实 640×400，渲染 240–360 px 宽 | **base64 膨胀 1.333×（+531,258 B）**；`Content-Type: text/plain`；JS 需 fetch + 解码，**无法享受 `<img>` 原生渐进解码与图片缓存** |
| `img/games/*.jpg`（5 张，732,478 B） | 600×900 / 810×1080 | 按卡片尺寸输出可省 0.53–0.61 MB |
| 首页首屏格子图 `202610180235-...-1440.jpg` | 1440×810 / 111,162 B | **LCP 候选元素**，占首页子资源传输 36%，且**无 `loading="lazy"` 也无 `fetchpriority`** |

### 2.7 【P1】孤儿资源 1.56 MB

产物中零引用，逐项 grep 已验证：

| 文件 | 字节 |
|---|---:|
| `fonts/noto-serif-sc-500.woff2` | 758,904 |
| `img/default.png` ≡ `img/random/default.png`（md5 相同） | 400,730 ×（冗余 1 份） |
| iconfont 的 ttf/woff 回退格式 ×4 | 54,524 |
| `img/avatar.png` / `fluid.png` / `police_beian.png` | 11,633 |
| `fonts/OFL-Noto.txt` | 4,481 |
| **合计** | **1,631,002 B** |

删除后产物 **12.93 MB → 11.37 MB（−12.0%）**。对首屏传输 0 收益（本来就没被请求），但部署包、边缘存储、仓库体积是净收益。

### 2.8 【P1】holidays 页：17 份 140 KB 的 HTML

`public/holidays/{2021..2036}/` 17 个年份页，每个 138–146 KB，目录合计 **2,426,737 B（占产物 17.9%）**。365 天逐日 JSON 内联，`"img"` 去重后只有 7 个值却内联了 33 次。
压缩率极高（146,740 → br 15,374，10.5%），所以对**传输**伤害不大，主要是产物体积与解析成本。

### 2.9 【P2】其余

- **主题 lazyload 100% 空转**：`grep 'srcset="/img/loading.gif"' public` → **0 个文件**；`<img...lazyload...>` → **0 处**；`lazyload: true` front-matter → **0 处**。而 `img-lazyload.js` 仍在每个文章页/自定义页加载
- **`color-schema.js`（9,849 B）是纯负担**：暗色模式 `enable: false`，`data-user-color-scheme` 在 CSS 里 0 命中，却在 head 阻塞解析，还挂了 2 个 `{childList:true,subtree:true}` 全文档 MutationObserver，选择器永远匹配不到
- `highlight.css` 的 `media="print"` 异步化对 2 KB 文件是过度工程，换来文章页代码块一帧 FOUC，建议直接并进主 CSS
- 两条 iconfont 的 `@font-face` 没写 `font-display`（默认 `auto` ≈ 3 秒 block 期），图标可能先显示豆腐块 `□`
- 图片容器都有确定尺寸 + `object-fit:cover`，**无 CLS 风险**，这点没问题

---

## 3. 按影响程度排序的原因分析

| 排名 | 瓶颈 | 影响面 | 主影响指标 | 处置成本 |
|---:|---|---|---|---|
| **1** | 中文字体 2.52 MB 无切分、无 preload | 首屏 + 每次导航（解码+重排） | **LCP / FCP** | 中 |
| **2** | 全站 `max-age=0`，26–31 个条件请求/次导航 | 每次导航 | 二次导航 FCP | 低（需先配 hash） |
| **3** | 导航零预取，整页重载重付全部固定成本 | 每次导航 | 二次导航体感 | 低（~30 行 JS 或 0 JS） |
| **4** | 11 个脚本无 defer，jQuery+Bootstrap 152 KB 同步阻塞 | 首屏带宽竞争 | LCP | **极低**（改 helper 调用） |
| **5** | 阻塞 CSS 302 KB，bootstrap 80% 死代码 + site.css 逐页样式全量下发 | 首屏 | FCP | 中（需全站回归） |
| 6 | 图片尺寸失配 + base64 包装（约 2.8 MB 可省） | 重图片页 | LCP / 总字节 | 中 |
| 7 | 孤儿资源 1.56 MB | 部署包 / 仓库 | — | **极低** |
| 8 | holidays 数据内联 2.4 MB | 产物体积 | 解析成本 | 中 |
| 9 | lazyload 空转 / color-schema.js / highlight.css | 边际 | — | 低 |

---

## 4. 优化建议

### P0-0 定字重预算：该留的档位必须留（已定，方案已推翻过一次）

**主人已拍板**：`.nav-link` 取 **700**（与 `.feed-title` 同档）。

`site.css` 现有字重密度分布：

| 字重 | 出现次数 | 载体示例 |
|---|---:|---|
| 400 | 3 | `body` 正文 |
| 500 | 2 | `.nav-link`（已改为 700） |
| 600 | 15 | `.post-title` / `.pick-title`（宋体） |
| **700** | **28** | `.feed-title` / `.col-title` 等标题 |
| 800 / 900 | 3 / 5 | 站名、栏目标题 |

**⚠️ 这里踩过一个坑，方案已被推翻**：初版写的是「把字重收敛到 400 + 600 两档，700 交给浏览器合成」。**这个方案落不了地**——字体目录里黑体轨只有 400 / 500 / 700 三个文件，**没有 `noto-sans-sc-600`**。「收敛到 600」在黑体轨无法执行，真实路径会变成「删掉 sans-700，28 条规则的中文粗体全部走合成加粗」。

**为什么不这么做**（font-weight:700 是本站出现最多的一档，占 28 条规则）：
- CJK 合成粗体是算法把笔画整体加粗，**不加白、不重排字面**，结果偏糊、笔画粘连，在 15px 的导航与标题上尤其明显
- 合成是浏览器各自实现，**Chrome / Safari / Firefox 观感不一致**，等于把设计语言交给浏览器
- 中文粗体在本站是**高频视觉元素**（导航、feed 标题、栏目标题），不是边角情况
- 拉丁字形不受影响，但本站中文是主体

**正确做法 —— 先定预算再子集化**：

| 字体族 | 保留档位 | 理由 |
|---|---|---|
| Noto Sans SC | **400 + 700** | 400 = 正文；700 = 28 条标题规则，必须真字体 |
| Noto Serif SC | **600** | 15 条标题规则用的就是 600 |
| 删除 | `noto-sans-sc-500`（586,964 B）、`noto-serif-sc-700`（778,456 B） | 500 因 `.nav-link` 改 700 而失去引用；serif-700 无任何选择器使用 |

**收益**：中文 **2,523,236 → 1,936,272 B（−23.3%）**；首屏字体文件 **7 → 6**，体积 **2,624,360 → 2,037,396 B（−22.4%）**。

> 这一步只有 **−23%**，确实不算高——**它本来就不是主力，它的作用是把「要子集化几个文件」从 4 个降到 3 个**。真正的减重在下面的 P0-1 子集化（−83%）。
> 上界口径的另一版方案「删 sans-500 + sans-700，700 走合成」能多省 592,844 B（子集化后约 130–160 KB），**不采纳**，理由见上。

### P0-1 中文字体子集化到 3500 字（❌ 实测推翻，已改为系统字体栈）

> **2026-10-23 实施结论：本节的体积估算被实测推翻，方案已整体放弃。**
> 实测 3500 字子集：sans-400 **494,348 B** / sans-700 **507,568 B** /
> serif-600 **647,196 B**，合计 **1,649,112 B（只省 36%）**，不是本节估的 350–480 KB。
> 根因：源字体本身已是 4560 glyph 子集（每字形约 273 B，glyf 占 95%），
> 「减 693 个码位」只减掉 15% 字形，而本节按码位数比例外推成 83%。
> 实测边际成本：每加 500 汉字约 +70 KB。详见 ERRORS.md **E-060**。
>
> **主人据此改判：放弃子集化，中文改走系统字体栈**（推翻原 V3.4 自托管决策）。
> 落地结果：`--font-sans` = PingFang SC / HarmonyOS Sans SC / MiSans / Microsoft YaHei；
> `--font-serif-title` = Songti SC / STSong / SimSun。中文字体文件全部删除，
> 首屏字体 **2,037,396 → 101,124 B**，中文字体请求 **0 个**（浏览器实测）。
>
> 以下原文保留，作为「为什么当时的估算错了」的记录。

**位置**：`source/css/site.css` L32-L70；`head.ejs` L26

**主人已拍板**：走**子集化**路线（保留 Noto Sans/Serif 现有观感）。

**做法**：用 `pyftsubset`（`pip install fonttools brotli`）按站点实际用字切片。

```bash
# 1) 从产物抽取全站实际用到的字符（含 stylekit 的 149 个 slug、节假日名称等）
python tools/collect-chars.py > chars.txt

# 2) 逐文件切片
pyftsubset noto-sans-sc-400.woff2 \
  --text-file=chars.txt --layout-features='' \
  --no-hinting --desubroutinize \
  --flavor=woff2 --output-file=noto-sans-sc-400.subset.woff2
# serif-600 同理
```

参数说明：`--layout-features=''` 与 `--desubroutinize` 对 CJK 各有约 10–20% 的额外收益；`--no-hinting` 对屏幕渲染无影响。

**收益**：定完字重预算后保留 **3 个中文文件**（sans-400 / sans-700 / serif-600）。CJK 子集到 ~3000 码位时单文件约 **110–160 KB**，3 个合计约 **350–480 KB**。

**中文 2,523,236 → 约 350–480 KB（−81%～−86%）**；**首屏总量 2.77 MB → 约 620–750 KB**。

> 与「删 sans-700 走合成」相比，多留一个真 700 只多约 **130–160 KB**（子集化后口径），换来的是 28 条标题规则的中文粗体保持 Noto 真实字形、跨浏览器一致。**这个代价值得付。**

**字表安全垫（新实测，重要）**：扫全站 61 个 HTML 的所有文本节点后去重，**全站唯一 CJK 字符只有 1124 个**，字符表文件大小 3,499 B。这意味着：

| 安全垫方案 | 字表规模 | 单文件体积（估） | 2 个中文文件合计 | 适用 |
|---|---:|---:|---:|---|
| 0（刚好够） | 1124 | 约 130 KB | 约 260 KB | **改一个字就出现豆腐块，不可维护** |
| +2000（推荐） | 约 3,000 | 约 150–200 KB | 约 300–400 KB | 日常更新够用 |
| **主人已选** | **3,500** | 约 180–220 KB | **约 350–440 KB** | 偏保守，留了 2,376 字余量 |
| +8000 | 约 9,000 | 约 400 KB | 约 800 KB | 冗余过多，不建议 |

**主人选的 3,500 落在推荐区间偏保守一侧，可以。** 但字表抽取**必须包含**：
- 可见文本节点（已含）
- `<title>` / `<meta name="description">` / `alt` 属性
- 页脚、日期格式（年月日、星期）
- **节假日页的 365 天数据**（节日名 + 拼音 + 农历 + 描述）— 这块的汉字量不小，务必纳入
- `local-search.xml` 的正文
- 常见标点与全角符号（，。、；：？！「」）—— **标点不在 CJK 统一表意文字区间内，单独统计容易漏**

**注意**：子集字表必须**随内容增长重跑**。建议把 `collect-chars.py` 与切片命令写成 `package.json` 的一个 script，并在 CI 里加一条断言（抽查若干汉字仍在字表内），防止新增文章出现豆腐块。

**其余配套做法**（可与子集化组合）：
1. **补 preload**：给子集化后的 2 个中文 + Nunito 加 `<link rel="preload" as="font" crossorigin>`，让字体请求与 CSS **并行**发出，省掉 1～2 个 RTT。**改一行 `head.ejs` L26 即可，是性价比最高的单条改动**
2. **补 `unicode-range`**：让浏览器只下载命中的片（子集化后收益变小，优先级下调）
3. **备选（未采用）**：中文改系统字体栈 `"PingFang SC","HarmonyOS Sans SC","MiSans","Microsoft YaHei"`（`site.css` 的 `--font-sans` 里**已经写了这些 fallback**，只是排在 `"Noto Sans SC"` 之后）→ 省 100%，但会改变 DESIGN-LANGUAGE 里定下的中文观感。若日后觉得子集化维护成本高，可回退到此方案。

**收益**：首屏字体 **2,624,360 → 约 450 KB**（2 个中文子集 ~350 KB + 3 个拉丁 101 KB）。**首屏 FOUT 重排次数从 4 次降到 2 次。**

### P0-2 新建 `vercel.json` 加缓存头

**位置**：仓库根目录（当前不存在）

```json
{
  "headers": [
    { "source": "/fonts/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]},
    { "source": "/lib/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]},
    { "source": "/img/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]},
    { "source": "/css/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=600, stale-while-revalidate=86400" }]},
    { "source": "/js/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=600, stale-while-revalidate=86400" }]},
    { "source": "/(.*)\\.(html|xml)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]}
  ]
}
```

⚠️ **前提**：`/fonts`、`/lib`、`/img` 设 `immutable` 必须先让文件名或 URL 带内容 hash（见 P1-3）。否则改图后用户会一直吃旧副本。退一步可先只上 `max-age=86400, stale-while-revalidate=604800`。

**收益**：换页条件请求 **31 → 1**（仅 HTML）；1.34 MB 字体第二次访问起 **0 字节传输**；每次导航省 1 个 RTT。

### P0-3 导航预取

**位置**：`_config.yml` L255 `custom_head` 即可注入，无需改主题逻辑

1. **Speculation Rules API**（推荐，零 JS，Chromium 原生，Safari/Firefox 静默忽略）：
   ```html
   <script type="speculationrules">
   {"prefetch":[{"where":{"href_matches":"/*"}}]}
   </script>
   ```
2. **~30 行 defer 兜底**：hover / IntersectionObserver 视口预取，用 `navigator.connection.effectiveType` 在 2g 下跳过
3. **关闭 nprogress**：`_config.yml` L127 `progressbar.enable: false`

**收益**：**二次导航 TTFB → 0**，是二次导航体感的单项最大改善。

**明确不建议做 PJAX**：本站重度依赖 jQuery 插件（modal / dropdown / fancybox / tocbot / anchor-js / clipboard），每个都要改造为可重入 + destroy 旧实例，泄漏与双绑风险高。P0-3 与 P0-4/P0-5 做完大概率就不需要了。

### P0-4 全部脚本加 `defer`

**位置**：`scripts.ejs` L2-L5（调 `js_ex(..., 'defer')`）；`head.ejs` L55-L56

**做法**：10 个外部脚本统一 `defer`，保留 `#fluid-configs` inline。`nprogress` 的 inline 块（L765-L771）必须一并外置或整体移除。

**收益**：head 阻塞 17,190 B 归零；~180 KB JS 移出首屏关键路径，缓解与字体下载的带宽竞争。

### P0-5 裁剪 bootstrap + 压缩/拆分 site.css

**位置**：`css.ejs` L1；`source/css/site.css`

**做法**：
1. PurgeCSS 裁 bootstrap（保留 grid / utilities / modal / dropdown / navbar），**注意不要误删 `show`/`collapsing`/`d-*` 等动态类**，需全站三档宽度回归
2. `site.css` 构建期接入 `cssnano` / `clean-css`（去注释 + 去空白）
3. 更长线：把 `site.css` §4 逐页样式按页面拆分（节假日页那 21,375 B 单独出一张）

**收益**：bootstrap −10～16 KB gzip 阻塞 CSS；`site.css` 线上单页 **28,435 → 约 10 KB（−18 KB）**；首页阻塞 CSS 从 **66,397 B** → 约 48 KB。

> 阻塞 CSS 是 **6 个 / 66,397 B（线上 br）**，不是 7 个——`highlight.css` 用 `media="print" onload="this.media='all'"` 异步化、另一处在 `<noscript>` 里，都不阻塞。初版底稿漏看了这两点。

### P1 图片重编码 / 数据外置 / 内容 hash

| 项 | 做法 | 收益 |
|---|---|---|
| 节假日图 | 按面板实际尺寸（宽 1400@2x × 高 300）输出 WebP q80 | −0.95～1.09 MB |
| stylekit `.txt` | 丢掉 base64 包装，直接发布 `.webp`（320×200），`data-b64` 改 `data-src` + 现有懒加载 | −1.3 MB，省掉 fetch + 解码一层 |
| 游戏封面 | 按卡片尺寸（~400×600）输出 WebP | −0.53～0.61 MB |
| 首页 LCP 图 | 1440×810 → 按格子尺寸 WebP，并补 `fetchpriority="high"` | −76 KB |
| holidays 数据 | 抽成一份 `data.json`，17 页改骨架 + JS 渲染 | 产物 −2.2 MB |
| 内容 hash | 扩展 `asset-version.js` 的 `fileHash()` 到 `img/**`、`lib/**`、`fonts/**`（`@font-face` 的 src 走扫盘改写路径，与现有 `stampMainCss` 同构） | 解锁 P0-2 的 `immutable` 档位 |

### P2 收尾

删孤儿资源 1.56 MB（**零风险，可随手做**）→ 删 `img-lazyload.js` 空转 → 删/外置 `color-schema.js` → `highlight.css` 并入主 CSS → iconfont 补 `font-display: block` → 首页 2 张图补 `loading="lazy"` → `local-search.xml` 加页内缓存

---

## 5. 优化前后对比（汇总）

| 指标 | 当前（实测） | P0-0 收敛字重 | + P0-1 子集化 | P0+P1 全做完 |
|---|---:|---:|---:|---:|
| 产物总体积 | 13,551,043 B | 12,185,623 B（11.62 MB） | 约 11.2 MB | 约 7.5 MB |
| 首页冷缓存首次加载 | **2,901,736 B（2.77 MB）** | 约 2.32 MB | **约 620–750 KB** | 约 280 KB |
| 其中字体 | **2,624,360 B** | 2,037,396 B | **约 480 KB** | 约 480 KB |
| 首屏中文字体文件数 | 4 | 3 | 3（子集） | 3 |
| 首页请求数 | 29 | 28 | 28 | 约 13 |
| 换页时的条件请求 | **28～33 个** | 28～33 | 28～33 | 1 个（仅 HTML） |
| 中文粗体来源 | 真字体（现有） | 真 700 | 真 700 | 真 700 |
| 阻塞 CSS | **6 个 / 66,397 B**（线上） | 6 个 / 66,397 B | 6 个 / 约 48 KB | 1～2 个 / 约 48 KB |
| 字体长期缓存 | ❌ `max-age=0` | ✅ `immutable` | ✅ `immutable` |
| 二次导航 TTFB | 1 RTT | 0（预取命中） | 0 |

---

## 6. 建议执行顺序

| 步 | 动作 | 风险 | 收益 |
|---:|---|---|---|
| 1 | **删孤儿资源 1.56 MB** | 零 | 产物 −12% |
| 2 | **P0-0 收敛字重**：删 serif-700 + sans-500，`.nav-link` 改 700 | 低（改一个字重声明） | 中文 −47%，首屏字体 −45% |
| 3 | **P0-4 脚本全部 `defer`** | 极低（改 helper 调用） | ~180 KB 移出关键路径 |
| 4 | **P0-1 补 preload**（`head.ejs` L26 一行） | 零 | 省 1～2 个 RTT |
| 5 | **P0-1 子集化到 3500 字** | 中（需装 fonttools，字表要随内容重跑 + CI 断言） | 中文再 −74%，累计 −86% |
| 6 | **P0-3 预取 + 关 nprogress**（切换慢的正解） | 低 | 二次导航 TTFB → 0 |
| 7 | **P1-3 内容 hash + P0-2 缓存头**（必须配套，顺序不能反） | 中 | 换页条件请求 33 → 1 |
| 8 | **P0-5 裁 bootstrap + 压缩 site.css** | 中（需全站三档宽度回归） | −10～16 KB gzip 阻塞 CSS |
| 9 | **P1 图片重编码 / holidays 数据外置** | 中 | −2.8 MB / −2.2 MB |

## 6.1 已定决策（2026-10-23）

| 决策项 | 主人选择 |
|---|---|
| 中文字体减重路线 | **子集化**（保留 Noto Sans/Serif 现有观感），不走系统字体栈 |
| 字表安全垫 | **3,500 字**（全站唯一 CJK 仅 1124 个，留了 2,376 字余量，偏保守但可接受） |
| `.nav-link` 字重 | **700**（与 `.feed-title` 同档），据此删 `noto-sans-sc-500` |
| 粗体来源 | **保留真字体**。黑体留 400 + 700，宋体留 600；**不走浏览器合成加粗** |
| 「收敛到 400+600 两档」 | **已推翻** —— 黑体轨没有 600 文件，该方案会退化成「删 sans-700 全部合成」 |

### 6.2 关于「删 sans-700 走合成」的裁决

这一版方案曾被提出并**已被否决**，理由记录在 §P0-0：`font-weight:700` 在本站是出现最多的一档（28 条规则），中文粗体是高频视觉元素；CJK 合成粗体偏糊且跨浏览器不一致，等于把设计语言交给浏览器。多留一个真 700 的代价在子集化后只有约 130–160 KB。

**决定：保留 `noto-sans-sc-700` 并一起子集化。**

---

## 7. 未验证事项

- 本次为**静态分析 + 线上响应头实测**，**未跑真实 Lighthouse / DevTools Performance 面板**。所有 FCP/LCP 收益为按字节与链路推算的量级，不是实测毫秒数。
- 若需要前后对比的实测数字（FCP/LCP/CLS），需起本地 server 用 Edge headless + CDP 采集（本机已有可用路径），属另行任务。
- P0-5 的 bootstrap 裁剪**必须做全站三档宽度回归**后再上线。

### 7.1 子集化的收益是线性外推，不是实测

**没有跑 `pyftsubset`**（本机无 fontTools，只读诊断不装依赖）。报告里「单文件 110–160 KB」「3 个合计 350–480 KB」是按「码位数 4,193 → 3,500」线性外推的估算，**存在 ±30% 偏差**。

**落地前必须真跑一次拿实测值，不要拿本报告的数字对外承诺。** 跑法：

```bash
pip install fonttools brotli
pyftsubset noto-sans-sc-400.woff2 --text-file=chars.txt \
  --layout-features='' --no-hinting --desubroutinize \
  --flavor=woff2 --output-file=out/noto-sans-sc-400.woff2
ls -la out/   # 看真实字节
```

另外注意：全站唯一 CJK 的统计口径两位成员略有出入（1,124 vs 1,087，差 37），量级一致，**取 1,124（含标点与全角符号的那份）为保守值**。

### 7.2 站点在审计期间被重新部署过

线上 `site.css` 的版本参数在审计过程中从 `?v=f37385b7` 变成 `?v=8421576d`，线上 br 从 28,435 → 28,676 B；本地 `public/` 也在 23:08 → 23:40 被重新构建过（`source/css/site.css`、`themes/fluid/layout/holidays.ejs`、`scripts/helpers/holiday-calendar.js` 均有未提交改动）。

**本报告的数字基准是 23:08 那次构建。** 涉及 `site.css` 的精确字节（83,870 B、§4 66,059 B、§4.12 节假日页 21,375 B）可能已偏移（重建后分别约为 84,462 / 66,651 / 25,688 B）。**结论不受影响，精确数字请以 `npm run build` 后 `node tools/perf-baseline.js` 的输出为准。**

### 7.3 ✅ 已定性：hash 源不一致是 CRLF 造成的，**不是 bug**

**疑点**：`source/css/site.css`（87,210 B，sha1 `6a6c11fb`）与 `public/css/site.css`（84,462 B，sha1 `8421576d`）字节与 hash 都不一致。

**定性结果（已实测核实）**：差值是 **2,748 B = 被去掉的 CR 字节数**，根因是行尾符——

| 环境 | 行尾 | 证据 |
|---|---|---|
| 仓库存储 | **LF** | `git show HEAD:source/css/site.css \| od -c` 中 CR 计数 = **0** |
| 本机工作区 | **CRLF** | `core.autocrlf = true`，`source/css/site.css` 检出为 CRLF |
| Vercel（Linux 检出） | **LF** | 所以线上 source 与产物 hash **完全一致** |

**两端各自自洽，无功能影响**：`?v=` 只需要满足「内容不变 hash 不变、内容变 hash 变」，而 CRLF 偏移在每个环境内是常量，两个性质都成立。

**唯一边缘风险**：万一哪天行尾规则变了，会白重下一次 `site.css`（一次性）。

**可选加固（P2，非必须）**：仓库当前**没有 `.gitattributes`**。加一条 `* text=auto eol=lf` 可以把行尾钉死，顺带消除这类困惑。**不阻塞 P0-2 / P1-3，可以正常实施缓存头。**

### 7.4 「改系统字体栈」已被撤回

一度被提出作为 P0-1 首选方案（中文字节可归零）。**已撤回**，依据是你自己在 `source/css/site.css` L12-13 的明文设计决策：

> `V3.4：中文改走自托管子集 Web 字体——思源黑体（正文 400/500/700）+ 思源宋体（标题 600/700），不再依赖访客设备本地中文字体。`

改系统字体栈等于推翻 V3.4 的跨设备一致性决策，这不是性能侧能单方面决定的事。

**子集化反而更贴近你的原意**：V3.4 自己写的就是「自托管**子集**」，只是当前落地的是通用 4,193 码位，而不是本站真实用字（1,124 个，占 26%）。收紧到本站用字是在兑现决策，不是推翻它。
