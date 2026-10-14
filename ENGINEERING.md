# ENGINEERING.md — 工程改进计划与任务账本

**文档版本：** V1.0（2026-10-12）
**适用范围：** `api/`（Vercel 后台函数）、`source/admin/`（后台前端）、`themes/fluid/layout/`（受后台影响的前台模板）
**上游依据：** 前台 × 后台架构对比评审（2026-10-12）
**配套协议：** AGENTS.md（提交/推送需授权，本文件不构成授权）

---

## 0. 总则

- 每条任务必须满足：**边界清晰、可独立验证、可独立回滚**。
- 验收标准全部可执行（命令或可观察行为），不写「体验更好」这类不可验证项。
- 依赖关系图（自上而下执行）：

```
P0-3 测试固化 ──┬─→ P0-1 身份域统一 ──→ P0-2 错误契约
                ├─→ P1-5 路由中间件 ──→ P1-4 content.js 拆分 ──→ P1-8 写操作校验
                │                    └─→ P1-7 列表瘦身
                └─→ P1-6 模块注册表 ──→（影响 index.ejs / api 校验 / admin UI 注释）
```

- 状态图例：`待办` / `进行中` / `已完成` / `已验证`

---

## P0 — 正确性问题（先修）

### P0-1 身份配置数据源统一

- **优先级：** P0 ｜ **依赖：** P0-3 ｜ **状态：** ✅ 已完成
  （代码已改：about.ejs 优先读 `site.data.site`、`theme.about.*` 回退。
  **验收未实测**——「填 intro → 生成后 about 页含该文字」这条没跑过，待补验）
- **问题定位：** `themes/fluid/layout/about.ejs:8` 只读 `theme.about.introduce || theme.about.intro`；
  `about.ejs:40` 头像只读 `theme.about.avatar`。而后台「设置」页写的是 `source/_data/site.yml`，
  `index.ejs` 已优先读 site.yml → **后台改 intro/avatar，首页生效、关于页不变**。
- **任务边界：**
  - 做：`about.ejs` 的 intro 与 avatar 改为 `site.data.site` 优先、`theme.about.*` 回退；
    在 ENGINEERING.md 记录唯一数据源规则（site.yml 优先，主题配置为 legacy 回退）。
  - 不做：不迁移主题配置里已有的值；不改 `name`/`icons`（社交图标仍属主题配置）。
- **验收标准：**
  1. `source/_data/site.yml` 填 `intro: "测试签名"` → `hexo generate` 后 `public/about/index.html` 含「测试签名」；
  2. 置空 intro → 关于页回退渲染 `theme.about.intro` 的值；
  3. 首页 `public/index.html` 行为不变（回归）。
- **影响文件：** `themes/fluid/layout/about.ejs`

### P0-2 错误契约收敛

- **优先级：** P0 ｜ **依赖：** P0-3 ｜ **状态：** ✅ 已完成
  （`HINTS` 映射表 + 统一 `respondError`；409 带 `conflict:true`；500 只返 `INTERNAL`。
  测试已锁：4xx 必带 hint、yml 损坏 → 500 无内部细节）
- **问题定位：**
  1. `api/_lib/content.js` 多处 `HttpError(400,'BAD_MODULE')` 等无 hint，前端只显示裸错误码；
  2. `api/_lib/http.js:91` 500 分支把 `String(err.message)` 返给前端，泄漏内部细节；
  3. `http.js:89` HEAD_MOVED 冲突响应缺 `conflict:true` 标志 → 前端 `handleOpError` 的冲突弹窗不触发，
     只 toast 一个「CONFLICT」字样（真实 bug）。
- **任务边界：**
  - 做：所有 4xx 错误统一 `{error, hint}`；500 只返 `{error:'INTERNAL'}`（细节仅进 console）；
    冲突响应统一带 `conflict:true`。
  - 不做：不改 HTTP 状态码语义；不动 OAuth 相关端点（auth-* 保持现状，理由：重定向流语义不同）。
- **验收标准：**
  1. smoke 中断言：未知 module → 400 且 payload 含非空 `hint`；
  2. 过期 headSha 写操作 → 409 且 `conflict === true`（前端弹窗契约）；
  3. 人为触发内部错误 → 500 body 只有 `{error:'INTERNAL'}`，无 message 字段。
- **影响文件：** `api/_lib/content.js`、`api/_lib/http.js`（及拆分后的新模块）

### P0-3 测试与 CI 固化

- **优先级：** P0（最先做，保护其余全部任务）｜ **依赖：** 无 ｜ **状态：** ✅ 已完成
  （`test/admin-smoke.js` 49 项 + `test/module-pages-e2e.js` 19 项 = 68 项断言；
  `npm test` 串联；CI 含语法门禁 + 两个测试 + hexo generate。
  验收第 3 条「故意改坏→测试失败」已在 P1-8/P1-5/P1-7 用变异测试各自验证过）
- **问题定位：** 仓库零测试零 CI；2026-10-11 的 24+7 项 smoke 为临时文件，跑完即删，无回归保护。
- **任务边界：**
  - 做：`scripts/admin-smoke.js`（mock 模式服务端全链路：列表/数据模块/site/文章/图片/回收站/冲突/乐观锁）
    + HTTP 级用例（CSRF、未登录 401、非法 module）；`package.json` 增加 `"test:admin"` 脚本；
    `.github/workflows/ci.yml`：`node --check`（api 与 admin）+ `test:admin` + `hexo generate`。
  - 不做：不上浏览器端 E2E（admin.js 的 UI 交互）；不引入测试框架（零依赖，原生 node:assert）。
- **验收标准：**
  1. `npm run test:admin` 退出码 0，覆盖 ≥25 条断言；
  2. CI 配置存在且在 push/PR 时触发（以 workflow 文件为准，不实跑 Actions）；
  3. 故意改坏一个行为（如删掉 saveSite 导出）→ `npm run test:admin` 失败（抽查一次后还原）。
- **影响文件：** 新增 `scripts/admin-smoke.js`、`.github/workflows/ci.yml`；修改 `package.json`

---

## P1 — 架构问题（本周内）

### P1-4 `content.js` 按域拆分

- **优先级：** P1 ｜ **依赖：** P1-5 ｜ **状态：** ✅ 已完成
  （428 → 85 行；拆出 shared.js 与 domains/{posts,data,site,images,trash}.js。
  行为等价经机械验证：22 个顶层函数体逐字比对全部一致）
- **问题定位：** `api/_lib/content.js` 411 行混合文章/草稿/发布/数据模块/回收站/图片/site 七个域。
- **任务边界：**
  - 做：拆为 `_lib/domains/{posts,data,site,images,trash}.js` 五个域模块 + `_lib/shared.js`
    （nowCst/stamp/assertSlug/assertModule/normTags/slugify）；`content.js` 仅保留 `listAll` 编排
    与对外导出（**导出签名保持不变**，api/*.js 零感知）。
  - 不做：不改任何端点行为与响应结构；不引入新依赖。
- **验收标准：**
  1. `node --check` 全部通过；`npm run test:admin` 全绿（行为等价证明）；
  2. `content.js` ≤ 120 行；单文件行数均有界；
  3. `git diff` 中 api/*.js 无逻辑变化（仅 import 行）。
- **影响文件：** `api/_lib/content.js`（重写）、新增 `api/_lib/domains/*`、`api/_lib/shared.js`

### P1-5 路由中间件

- **优先级：** P1 ｜ **依赖：** P0-3 ｜ **状态：** ✅ 已完成
  （`_lib/router.js` 的 route()；八个端点守卫样板收敛，端点最少 6 行）
- **问题定位：** 12 个 `api/*.js` 每个复制 4 行守卫（requireSession/originAllowed/readJson/respondError）。
- **任务边界：**
  - 做：`_lib/router.js` 导出 `route(handler, opts)`，统一方法检查/Origin 校验/会话/JSON 读取/错误出口；
    content-*、upload-image、deploy-status、session-check 八个端点改用 `route()`。
  - 不做：不改 auth-start/auth-callback/auth-logout（OAuth 重定向流，保持显式）；不改 readJson 体积上限语义。
- **验收标准：**
  1. 每个被改造端点 diff ≤ 10 行；
  2. smoke 中 405/403/401/400 行为与改造前一致（用例已覆盖则直接回归）；
  3. 新增用例：GET 访问 POST 端点 → 405 带 hint。
- **影响文件：** 新增 `api/_lib/router.js`；改 `api/content-{list,get,save,delete,restore}.js`、
  `api/upload-image.js`、`api/deploy-status.js`、`api/session-check.js`

### P1-6 模块注册表单一数据源

- **优先级：** P1 ｜ **依赖：** P0-3 ｜ **状态：** ✅ 已完成
  （`source/_data/modules.yml` 为单一数据源，api 与前台共用，损坏时回退内置默认）
- **问题定位：** 内容模块定义四处存放：`api/_lib/content.js` 的 `MODULES`、`themes/fluid/layout/index.ejs`
  的 `HOME_MODULES`、`source/admin/index.html` tabbar、`source/admin/admin.js` 的 `MODULE_META`。
  加一种内容类型要改四个地方，漏一个即静默故障。
- **任务边界：**
  - 做：新增 `source/_data/modules.yml`（key/title/accent/page 四字段，parseItems 可直接解析）；
    `index.ejs` 的 `HOME_MODULES` 改读 `site.data.modules`；api 侧 `assertModule` 改读该文件
    （读取失败回退内置默认列表，防止配置文件损坏导致全站 500）。
  - 不做：tabbar 保持静态 HTML（UI 导航不属于数据域，加注释指向 modules.yml）；
    `admin.js` 的 UI 文案（link_label 等）保持在前端（属展示层 copy）。
- **验收标准：**
  1. `modules.yml` 中把 `games` 的 title 改成「游戏库」→ 首页入口格文字随之变化（hexo generate 后 grep）；
  2. 删除/损坏 `modules.yml` → api 写操作仍用内置默认列表正常工作（smoke 覆盖）；
  3. `npm run test:admin` 全绿。
- **影响文件：** 新增 `source/_data/modules.yml`；改 `themes/fluid/layout/index.ejs`、
  `api/_lib/content.js`（assertModule）

### P1-7 列表读取并行化 + summary 模式

- **优先级：** P1 ｜ **依赖：** P1-4 ｜ **状态：** ✅ 已完成
  （串行阶段 8 → 2；`?summary=1` 已实现并接入 admin 启动。
  请求次数无法运行时测量，并行化以代码审查为准）
- **问题定位：** `listAll` 串行 await：1 次 getTree + N 次 getFile（3 数据 yml + site + manifest + 每篇草稿），
  admin 首屏 6+ 次串行 GitHub 请求；且每次操作后前端全量重拉。
- **任务边界：**
  - 做：`listAll` 内所有独立读操作用 `Promise.all` 并行；新增 `?summary=1` 查询参数——
    summary 模式跳过草稿逐篇读取（列表只回文件名，标题在打开编辑器时按需取），其余不变；
    admin 启动用 summary，进入文章 tab 时如需草稿标题再全量拉一次。
  - 不做：不做分页；不改响应字段名（向后兼容）。
- **验收标准：**
  1. smoke 中断言 summary 与全量模式的 posts/images/data/site 内容一致，仅 drafts 缺 title 字段；
  2. 真实模式请求次数：mock 无法直接测次数，以代码审查为准（listAll 内无串行 await 链）——
     此项标注为「代码审查通过」，不谎称运行时验证；
  3. admin 启动走 `?summary=1`（admin.js diff 可见）。
- **影响文件：** `api/_lib/content.js`、`api/content-list.js`、`source/admin/admin.js`

### P1-8 写操作入参校验

- **优先级：** P1 ｜ **依赖：** P1-4、P1-6 ｜ **状态：** ✅ 已完成
  （post / data / site 三个 kind 全覆盖；`validatePost` 补上后三个 kind 都有把关）
- **问题定位：** `content-save` 按 kind 字符串分发，无 schema 校验，未知字段静默接受；
  字符串拼写错误（kind/action/module）只能到 400 才暴露。
- **任务边界：**
  - 做：`_lib/validate.js` 按 kind（post/data/site）提供校验器：必填、长度上限、slug 模式、
    link 仅 http(s) 或站内路径、date 仅 `YYYY-MM-DD`、拒绝未知字段；在 content-save 端点统一调用。
  - 不做：不加 JSON Schema 依赖（手写校验器，零依赖）；不改 upload-image 的既有校验（已够用）。
- **验收标准：**
  1. smoke 覆盖：超长 title / 非法 date / 未知字段 / 非法 link → 400 且 hint 指明字段；
  2. 合法请求全部不受影响（回归全绿）；
  3. `content-save.js` 端点 diff 中能看到三个 kind 的校验调用点。
- **影响文件：** 新增 `api/_lib/validate.js`；改 `api/content-save.js`（及各域模块入口）

---

## P1-9 分类内容体系（项目富文本 / 游戏专属字段）

- **优先级：** P1 ｜ **依赖：** P0-3 ｜ **状态：** ✅ 已完成（2026-10-12；A/B/C 三项验收全部通过）
- **问题定位：** 三个内容模块共用同一套扁平字段（title/link/desc/cover/date）与同一个条目编辑器；
  项目需要长篇图文（背景/过程/技术/成果），游戏需要专属字段（分类/平台/状态/玩法/截图视频/下载试玩链接），
  现状无法承载，后台录入体验不完整。
- **任务边界：**
  - 做：
    - A 数据层：`yaml.js` 扩展块标量（`|`）、字符串数组（flow/block）、对象数组（`links:`）；
      `_lib/validate.js` 按模块分字段白名单与类型校验；`content.js` 的 `saveData` 按模块接受不同字段集。
    - B 后台：项目编辑器（摘要 + 背景/过程/技术/成果四段 markdown + 插图）；
      游戏编辑器（分类/平台/状态/玩法长文 + 截图媒体区（本模块直传）+ 视频链接 + 下载/试玩链接对 repeater）；
      收藏编辑器保持现状。三类型**不共用**表单组件。
    - C 前台：`scripts/generators` 注册模块页生成器，为每个项目/游戏条目生成详情页
      （`/projects/<slug>/`、`/games/<slug>/`）与列表页（`/projects/`、`/games/`）；
      新增 `project.ejs`/`game.ejs`/`module-index.ejs` 布局；首页入口格与精选列表打通详情页。
  - 不做：不做富文本 WYSIWYG（坚持 markdown 源码编辑 + 预览，与文章编辑器一致）；
      不动收藏模块字段；不引入前端框架；不改文章（posts）体系。
- **数据模型（owner 文档，改字段先改这里）：**
  - projects：`slug, title, date, summary, cover, link, tags[], background, process, tech, outcome`（后四者为块标量长文）
  - games：`slug, title, date, cover, genre, platform, status, summary, gameplay, media[], video, links[{label,url}]`
  - collections：`title, link, desc, cover, date`（不变）
  - slug 缺省时由 title 编码生成；详情页只渲染有内容的 section（真实数据铁律）。
- **验收标准：**
  1. smoke：projects 富文本四段 round-trip（含换行/冒号/`#` 开头行/空行）无损；
     games 的 media 数组与 links 对象数组 round-trip 无损；
  2. smoke：分类型校验生效（项目缺 title / 游戏 links 缺 url / 未知字段 → 400 带 hint）；
  3. `hexo generate` 后 `public/projects/<slug>/index.html` 与 `public/games/<slug>/index.html` 存在，
     且只渲染非空 section；空 section 不出现在 HTML 中；
  4. 首页项目入口格可进入 `/projects/` 列表页，列表页可进入详情页；
  5. 后台三个 tab 的表单字段互不相同（项目四段长文 / 游戏媒体区+链接对 / 收藏原样）。
- **影响文件：** `api/_lib/yaml.js`、`api/_lib/validate.js`(新)、`api/_lib/content.js`、
  `source/admin/{index.html,admin.js,admin.css}`、`themes/fluid/layout/index.ejs`、
  `themes/fluid/layout/{project,game,module-index}.ejs`(新)、
  `themes/fluid/scripts/generators/*`(新)、`source/css/site.css`、
  `source/_data/{projects,games}.yml`(头注释更新)、`test/admin-smoke.js`、
  `test/module-pages-e2e.js`(新)

### 落地记录（验证期发现并修复的缺陷）

| # | 缺陷 | 根因 | 修法 | 锁定方式 |
|---|---|---|---|---|
| 1 | 详情页正文出现**裸 Markdown 源码** | `hexo.render.render({engine:'marked'})` —— `marked` **不是已注册扩展名**（只有 `markdown`/`md`）。Hexo 找不到渲染器时**静默返回原文**，不抛错 | 改用 `engine:'markdown'`；并加「输出 == 输入」判定，命中则降级 `<pre>`，杜绝同类静默失败再次上线 | E2E §3 断言 `<strong>/<code>/<li>`；单独跑一次 `engine:'marked'` 会红 |
| 2 | 长文字段**往返不幂等** | 块标量用 `\|-`（strip chomping），结尾换行被吃掉；「保存→读回」与原始输入不等，重复保存产生 diff 抖动 | `serializeEntry` 写入前规约尾部换行，往返稳定 | E2E §1「往返幂等」断言：二次 `updateItems` 输出必须与原文件逐字节相同 |
| 3 | `yaml.js` 中 `parseFlowList` 被定义两次 | 复制粘贴残留；后者因函数提升覆盖前者，无功能影响但属死代码 | 删除前一个定义 | `node --check` |
| 4 | 手工构造测试 YAML 造出两个 `items:` 键，导致构建解析失败 | 用 `head -N + cat >>` 拼文件 | 改为走后台真实写入链路（`validate → updateItems`）构造，并用 `finally` 无条件还原 | E2E 脚本本身即防复发 |

---

## P2 — 体验与长期健康（后续排期，本期只登记）

| ID | 事项 | 验收标准（草案） |
|---|---|---|
| P2-1 | 图片上传 sha 去重 + 单文件走 contents API | 同 sha 二次上传不产生新 commit；单图上传 GitHub 调用从 4 次降为 1 次 |
| P2-2 | admin.js 拆分为 editor/upload/poll/preview 多文件 | 单文件 ≤ 300 行；登录页不加载编辑器代码 |
| P2-3 | admin.css 与 site.css token 对齐 | 两处 --accent 等值一致，注释标明来源 |
| P2-4 | 部署轮询指数退避 + 构建日志链接 | 轮询间隔 8s→16s→32s，上限 3 分钟；pill 可点开 Vercel 部署页 |
| P2-5 | mock/真实存储行为对齐（双跑同一 smoke） | getLogin/head sha/getCommitStatus 三处语义对齐并有测试锁定 |
| P2-6 | 预览部署分支（admin 提交→preview→验证→合入） | 存在 preview 分支与合并脚本；PRD「发布前验证」要求有技术抓手 |

**P2 依赖 P1 完成后再启动；P2-6 涉及分支策略变更，需主人单独授权。**

---

## 附：风险登记

> 本表登记**尚未发生**的风险。已经发生的错误一律记入 **`ERRORS.md`**（错误档案与防复发清单），
> 两者不混用。开工前请先读 `ERRORS.md`。

| 风险 | 缓解 |
|---|---|
| 拆分 content.js 期间行为漂移 | P0-3 测试先行；导出签名不变；分小步提交 |
| modules.yml 损坏导致 api 全量 500 | assertModule 读取失败回退内置默认列表 |
| summary 模式让草稿标题从列表消失 | 产品决策已记录：列表显示文件名，编辑器内显示真标题；主人不接受可回退 |
| CI 在公开仓库运行消耗 Actions 额度 | 仅在 push/PR 到 main 触发；node --check + smoke + generate 均为秒级 |
