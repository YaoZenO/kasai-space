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

- **优先级：** P0 ｜ **依赖：** P0-3 ｜ **状态：** ✅ 已完成（2026-10-14 三条验收已实测）
  - 验收 1：site.yml 填 `intro: "测试签名"` → about 页含「测试签名」，**且不含**主题兜底值（是优先而非叠加）
  - 验收 2：intro 置空 → 回退 `Be water, my friends.`；avatar 置空 → 回退主题 `/img/avatar/11.jpg`
  - 验收 3：首页身份域与 about 页读同一数据源，同填同显；入口格正常，构建无 error
  - 验证后 site.yml 已还原（git 无改动），产物无测试残留
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

| ID | 事项 | 验收标准（草案） | 状态 |
|---|---|---|---|
| P2-1 | 图片上传 sha 去重 + 单文件走 contents API | 同 sha 二次上传不产生新 commit；单图上传 GitHub 调用从 4 次降为 1 次 | ✅ 已完成（`8f8d6ca`，Contents API 一次 PUT + sha 去重） |
| P2-2 | admin.js 拆分为 editor/upload/poll/preview 多文件 | 单文件 ≤ 300 行；登录页不加载编辑器代码 | ✅ 已完成（`cc49793`，1257 行 → 8 个模块，最大 289 行） |
| P2-3 | admin.css 与 site.css token 对齐 | 两处 --accent 等值一致，注释标明来源 | ✅ 已完成（`4c86141`，对齐为 #b0482a + `test/css-tokens.js` 锁定） |
| P2-4 | 部署轮询指数退避 + 构建日志链接 | 轮询间隔 8s→16s→32s，上限 3 分钟；pill 可点开 Vercel 部署页 | ✅ 已完成（`3e386dc`） |
| P2-5 | mock/真实存储行为对齐（双跑同一 smoke） | getLogin/head sha/getCommitStatus 三处语义对齐并有测试锁定 | ✅ 已完成（`fae4006`，补齐 auth-callback 端到端覆盖） |
| P2-6 | 预览部署分支（admin 提交→preview→验证→合入） | 存在 preview 分支；后台写目标可按配置切换；preview→main 合入脚本 | ⛔ 不做（2026-10-21 主人明确「第一个不需要」；单管理员站点无彩排需求，「本地验证→授权推送」链路维持现状） |
| P2-7 | 个人 favicon / apple-touch-icon 替换主题默认图 | 32px + 180px 两档图标落入 `source/img/`；主题配置 `favicon` / `apple_touch_icon` 指向新文件；构建后全站 `<link rel="icon">` 不再出现 `/img/fluid.png` | ✅ 已完成（2026-10-18 落位候选 B：`source/img/favicon-16/32.png`、`apple-touch-icon.png`、`source/favicon.ico`，配置三处已改；2026-10-21 复核确认在位。DESIGN-ROADMAP §四 T2-2✅） |
| P2-8 | 留言 / 评论互动 | **不做**：站点未备案，上用户生成内容（UGC）有合规风险；PRD §2.2 亦将「评论管理后台」列为非目标 | ⛔ 不做（2026-10-15 主人明确；配置已还原为关闭并加约束注释） |
| P2-9 | 碎片 / 说说内容流 | 待主人选实现路径：轻量＝短文发到「碎片」分类（导航项指向分类页，零开发）；完整＝新增内容类型（modules.yml + 校验白名单 + 生成器 + 后台表单 + 测试，属独立建设轮次） | ⬜ 待主人决策 |
| P2-10 | 前台静态资源缓存破坏 | `site.css` 链接带内容 hash（`?v=<sha1 前8位>`）；内容不变 hash 不变，内容一变立即刷新 | ✅ 已完成（`themes/fluid/scripts/filters/asset-version.js` + `test/asset-version.js` 14 项断言；未用手动 bump，避免「改了样式忘了 bump」） |
| P2-11 | 下架主题自带示例二维码 | 关于页 `icons` 不再指向 `themes/fluid/source/img/wx_2wm.jpg`（主题作者的码，扫出来是陌生人） | ✅ 已完成（主人提供自己的二维码后启用，图片放 `source/img/`） |
| P2-12 | 私密文章：只想自己看、不删除、不上线 | 私密文章存于 `_private/`（source/ 之外，Hexo 任何构建模式均不渲染）+ 仓库私有，双不可见；后台列表独立「私密」分区，与草稿分离（草稿＝没写完，私密＝写完了只是不给别人看）；卡片上直接「转私密 / 发布」，不必开编辑器；验收：`hexo generate` 产物不含该文、`/api/content-list` 的 private 分区含该文 | ✅ 功能已完成（2026-10-22 两轮）：第一轮做了编辑器内「转为私密」；第二轮按主人两点反馈改造——① 私密不再混进草稿，独立 `_private/` 目录与列表分区（已把他转过的两篇从 `_drafts/` 迁入）；② 转私密/发布外置为列表卡片按钮，编辑器内保留私密文章的「保存修改/发布到线上」。13 条断言锁死（行为往返 8 + 校验 2 + 结构 3），变异自检通过（把目的地打回草稿区即红） |

> **写作规范：** 本账本凡出现「PRD 要求 / 文档依据」类表述，必须给出可核对的位置
> （`§` 章节号，或引号包裹的原文）。写不出位置的一律标注「工程自定目标，无 PRD 依据」。
> 该规范由 `test/docs-claims.js` 断言锁死（见 E-015）。

> **待排期（2026-10-15 全面审查遗留）：** 关于页扩充、Ties 项目页补内容、
> 前台静态资源缓存破坏、CDN 自托管等未动项见 `SITE-AUDIT-2026-10-15.md` 的 P1/P2 清单；
> 浏览器图标见 P2-7。

**P2-6 涉及分支与部署策略变更，需主人单独授权。**

授权范围（三项，可分别授权）：

| # | 需要授权的动作 | 影响面 | 不做会怎样 |
|---|---|---|---|
| A | 在 GitHub 远端创建 `preview` 分支（当前远端只有 `main` + 一个 dependabot 分支） | 仓库出现新分支；Vercel 若开启「全部分支部署」会多一份预览环境 | 没有承载预览内容的分支，整个 P2-6 无从落地 |
| B | 后台写目标从「固定 `main`」改为「可切换」——当前 `api/_lib/config.js:6` 是模块级常量 `const BRANCH = process.env.GITHUB_BRANCH \|\| 'main'`，被 `github.js` 5 处引用 | 触碰全部写路径（文章保存、图片上传、数据文件、回收站）。做成「默认 main，显式指定才走 preview」时现有行为不变 | 后台只能写 main，预览分支无内容可验证 |
| C | preview → main 的合入方式（GitHub PR API 自动合 / 生成 PR 由主人手动合 / 本地脚本合） | 决定「验证通过后谁把内容放到线上」 | 内容停在 preview，永远上不了线 |

**PRD 依据更正：** PRD.md 中**没有**「预览部署分支」相关条款（grep `预览|发布前|分支|preview` 无匹配）。
原文只有「在本地完成构建、功能和页面验证后，再决定是否发布」（PRD.md:67）与「所有改动首先在本地验证」（PRD.md:485）。
因此 P2-6 属**工程自定目标，无 PRD 依据**——此前账本写的「PRD『发布前验证』要求有技术抓手」是失实表述，已更正（E-015）。

> **P2-2 已完成**（`cc49793`）：1257 行 → 8 个模块，单文件全部 ≤300 行（最大 admin-item.js 289）。
> 采用 ES module + hooks 注册表，依赖方向单向无循环；HTML 改 `<script type="module">`，
> core/list 静态加载，编辑器等五个重模块在登录成功后动态 import，实现「登录页不加载编辑器代码」。
> 因 admin.js 的 UI 交互不在自动化测试范围内，本轮仅有静态校验与构建产物核对，
> **需主人在后台实际点一遍确认无回归**。

---

## 附：本轮内容管理功能改造（2026-10-15，主人点名三项）

来源：主人要求「补删除 / 上传改富文本发布形式 / 修编辑入口卡顿」。三项全部落地，
过程中另发现并修复两个已存在缺陷（E-016 / E-017）。

| 项 | 做法 | 验证 |
|---|---|---|
| ① 删除功能补齐 | 文章列表（草稿 + 已发布）与编辑器内均补「删除」按钮；走后端已有的 `/api/content-delete`（post/draft path 模式），移入回收站可恢复。编辑器删除后同步 `S.lastListSha` 与部署 pill | `npm test` 67+12 项通过 |
| ② 上传改富文本发布形式 | 新增 `admin-composer.js`（块编辑器）+ `admin-md-blocks.js`（Markdown⇄块纯转换）：文字块/图片块交错、拖拽排序、拖放与粘贴上传、alt 编辑、图库选图。**存储格式不变**（仍写 Markdown，Hexo 渲染不变） | `test/md-blocks.js` 12 项往返断言；变异验证（改坏块分隔 → 5 项失败） |
| ③ 编辑入口卡顿 | 视图切换与忙态提前到 `await` 之前；`getFile`/`getHead` 并行；字数统计 250ms 防抖 | `admin-smoke.js` 三条结构锁；变异验证（退化即失败） |

**顺带修复（已记档）：** E-016 多图上传第二张起必 409（上传成功不回写 `S.lastListSha`，
代码走查发现）；E-017 即卡顿根因之一。

**未验证项（明确告知主人）：** UI 交互（拖拽排序、拖放上传、粘贴上传、图片块删除）
不在自动化测试覆盖范围内，本轮仅有语法检查、单测与构建产物核对，
**需主人打开后台实际走一遍**：登录 → 文章 tab → 编辑一篇 → 增删文字块/图片块 →
拖拽排序 → 保存草稿 → 发布 → 回收站恢复。

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
| 竖标验收用 Range 口径会误报回归 | Range 的 rect 顶比真实墨迹顶高约 0.24em（24px 时 ≈5.8px），光学居中后读数必然 ≈+5.84px，会被旧的「\|GAP\| ≤4px」判成失败。验收一律用 **4x 像素复核**，判据已写在 `site.css` 竖标注释里 |
| 模块页「壳 h2 + markdown 首个 h2」零内容相邻 | 80px 避让清零后只剩 22px 间距，视觉上像两个标题打堆（lol 1 处、Ties 4 处）。修法在模板层（markdown 以 h2 开头时不渲染壳 h2，或正文 h2 降 h3），与竖标改动分开做 |
| 渲染层验收只读 computed style，会漏掉「已配置但未生效」 | E-034 已证明主题 CSS 覆盖能让规则层断言全绿、浏览器里却不长这样。凡涉及 `border-radius` / `overflow` / 伪元素这类「规则生效但可能被层叠废掉」的视觉改动，补一层像素复核（`npm run test:a10-render`，判据用占比不用全零，见 E-039） |
| 桌面站名 3 行换行 + 头像体量比（E-040 已兑现并修复） | 实测 1440×900：`.identity-name` 在 5fr 列宽 + D0 4.6rem 下换 3 行（h1 高 238px）；横排铭牌时进一步被挤压成「Persona / l Space」词中断行（E-040，2026-10-21 修复：铭牌改竖排，回归 DESIGN-LANGUAGE「自上而下」构成）。残留项：96px 头像对照 238px 标题的体量比仍偏小，归 B 组决策（站名去 Blog 后缀 / 真名副行）一并处理 |

---

## 附：2026-10-21 后台修复批次与后续排期（主人授权「待排期工程项你可以排期」）

### 本轮已完成（2026-10-21，代码 + 4 条断言锁死，变异自检通过）

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 部署 pill 回传真实 commitSha（E-036 遗留） | `admin-item.js` / `admin-site.js` 的 content-save 调用点由硬编码 `setDeployCommitted(null)` 改为 `r.commitSha \|\| null`，项目/游戏/收藏/设置的保存现在都进入构建轮询 | smoke 断言：两文件必须含 `setDeployCommitted(r.commitSha` 且不得含 `setDeployCommitted(null)` |
| 2 | 保存后重开编辑器（REVIEW-PM §2.4.1 摩擦②） | 数据条目保存成功后按 slug/标题重开刚保存的条目，不再跳回列表 | smoke 断言：保存分支必须调 `openItemEditor(ie.module` 且不得 `switchTab` |
| 3 | 切 tab / 关页面丢稿拦截（摩擦③） | `admin-core.js` 新增 `markDirty/clearDirty` 与 `S.dirty`；`switchTab` 有未保存时弹确认；`admin.js` 加 `beforeunload` 拦截；三个编辑器（文章/数据/设置）输入即标脏 | smoke 断言：switchTab 必须含 `if (S.dirty)` + confirmDialog；admin.js 必须含 beforeunload 且判 `S.dirty` |
| 4 | E-018 缓存破坏 bump | `source/admin/` 全部 `?v=20261019` → `?v=20261021`（index.html 2 处 + admin.js 8 处 import 及其他模块） | 既有 E-018 三条断言 |
| 5 | 清理测试残留 | 删除 `source/_drafts/test-draft.md`（【测试】演练草稿，含 example.com 外链） | — |

### 文档纠偏（以仓库为准，本轮同步）

- ROADMAP §十/§十三：标签降级（✅ 2026-10-19 `2f196ac`）、快捷入口 ③（✅ 2026-10-19 `admin-quick.js`）、A10 头像圆形化（✅ 2026-10-20 `a4999a6`）三项「待排期/仍未定」与实际状态不符，已更正。
- SITE-AUDIT-2026-10-15：P0/P1 清单逐条复核已关闭，结论附于该文 §九。
- P2-7 favicon「待办」已过期，本账本行已更新为已完成。

### 后续排期（按序，阻塞项单独标注）

| 顺序 | 事项 | 规模 | 阻塞 |
|---|---|---|---|
| 1 | 后台聚合发布页（REVIEW-PM 方案①，~200 行新模块 + index.html tab + E-018 bump） | 中（半天~一天） | 无 |
| 2 | 数据模块草稿态（项目/游戏/收藏改到一半可中途保存，摩擦①） | 中，需先定草稿存储设计（`_drafts/` 现仅支持文章） | 无 |
| 3 | 方向 B 非素材部分（1px hairline → 2px 墨线、尺度断档、异质拼贴） | 中，随下一轮设计批次 | 无 |
| 4 | 三档视口实测截图（375/768/1440，REVIEW-PM §九未验证项） | 小 | 无 |
| 5 | 档案页入口文案（T3-14） | 小 | B11 文案待主人 |
| 6 | 私密文章转换（P2-12） | 零（列表卡片按钮自助） | ✅ 功能已完成（2026-10-22）：已发布卡片点「转私密」、私密卡片点「发布」，不必开编辑器 |
| 7 | P2-6 预览部署分支 | — | ⛔ 已关闭（2026-10-21 主人明确不需要） |
| 8 | P2-9 碎片/说说内容流 | 小或一轮建设 | 待主人选路线 |
| 9 | 方向 B 素材部分（游戏截图墙、文章封面、个人照） | — | 主人明示素材暂不提供 |
| 10 | E-032 games.yml 文案丢失处置 | — | 待主人（恢复或接受现状） |

---

## 附：2026-10-21 前台渲染修复批次（E-040 / E-041，主人反馈驱动）

### 问题归因（主人要求「找出是哪些任务造成的这些问题，总结下来不要再犯」）

| 问题 | 直接引入的任务 / 提交 | 潜伏→激活链条 |
|---|---|---|
| E-040 站名「Personal」词中断行，显示成「Persona / l Space」 | `023f763`（2026-10-11 首页改造与管理后台）：`.identity-title-row` 横排 + `.identity-name { overflow-wrap: anywhere }` | 当时站名是「KASAI'S Blog」，最长词 4 字符，栏宽够用，**缺陷潜伏**；`5ad01c9`（2026-10-18 E-034/E-035 修复批次，顺带把站名改为「KASAI'S Personal Space」）**激活**：最长词「Personal」@73.6px 约 370px，加铭牌自然宽约 161px 与间距 22.4px 共约 553px，超出身份栏 476px，flex 收缩把 h1 压到 331px，`anywhere` 击穿 min-content 使词中断行成为可能 |
| E-041 主卡标题 76.5px「太大、刺眼」 | `22f9b56`（2026-10-19 任务 4「方向 B 的排版部分」）新增 `--fs-hero` 5.5rem 断崖档；`2d3e6df`（2026-10-20 方向 B 复测收尾）微调 | 无潜伏期，**上线即缺陷**：调档依据是「字号断崖」设计主张，验收只测了折叠线（卡片是否出界），没把可读性/刺眼纳入判据；主人 2026-10-21 反馈后回落 |

### 本轮已完成（2026-10-21 晚，渲染层五视口实测）

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | E-040 修复 | `.identity-title-row` 改竖排（对齐 DESIGN-LANGUAGE「自上而下」构成与 R-5「身份词竖列」——横排本来就是偏离文档的实现）；`.identity-name` 的 `overflow-wrap: anywhere` → `break-word`；≤576px 媒体查询里已冗余的 column 规则删除 | `css-tokens.js` 两条断言：① `.identity-name` 禁用 `overflow-wrap:anywhere`；② `.identity-title-row` 必须 `flex-direction: column`。变异验证：改回 anywhere → FAIL；竖排改横排 → FAIL |
| 2 | E-041 修复 | `--fs-hero` 回落 `clamp(2.2rem, min(4.2vw, 6vh), 3.4rem)`（1440×900 档 76.5px → 54px，主卡标题 6 行 → 4 行）；vh 上限保留 | `css-tokens.js` doc-sync 断言：token 值与 DESIGN-LANGUAGE 字阶表必须一致，只改一边即 FAIL |
| 3 | 文档同步 | DESIGN-LANGUAGE 字阶表 D0+ 行改值、D3 行标「已停用」、身份域构成补竖排说明；本账本风险登记「站名 3 行换行」条目标注已兑现 | E-041 断言即文档↔代码一致性锁 |

**验证口径：** 1440×900 / 1366×768 / 1280×800 / 1024×768 / 390×844 五档 CDP 实测——站名换行全部落在词边界（桌面「KASAI'S / Personal / Space」、移动「KASAI'S / Personal Space」），无词中断行、无横向溢出；`hexo clean && hexo generate` 108 文件、42 个 HTML 无 0 字节（E-029 口径）。

### 通用教训（跨任务，防的不只是这两条）

1. **文案变长是布局缺陷的激活条件，不是新缺陷。** E-040 的写法在「KASAI'S Blog」时代就成立，改名后同样的代码开始出错——改站点标题这类「只改字符串」的操作，必须连带做一次渲染层复核（效果图/截图），不能只核对「配置生效了」。这与 E-034/E-035/E-037「改了不看渲染结果」是同一条裂纹。
2. **flex 行里放文本 + `overflow-wrap: anywhere` = 词中断行待爆。** `anywhere` 会击穿 flex 子项的 min-content（塌成 1 字符宽），同行任何元素变宽都会把文本从词中间切开。文本容器的超长保护用 `break-word`；flex 行的几何要先算「最长词宽 + 兄弟项宽 + 间距 ≤ 栏宽」，算不过就竖排，不挤压。
3. **设计主张类改动（方向 B 断崖）要把「人看着舒不舒服」写进验收。** 尺度档改动当时只验了「卡片是否出折叠线」这一条几何判据；本次回落后，`--fs-hero` 的任何后续调整都被 doc-sync 断言强制过一次显式评审。

### A9 撤回与主卡留白收口（2026-10-21 晚，主人连续两轮反馈）

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 4 | A9 身份词铭牌整块撤回 | 主人原话「01 Developer / 02 Writer 这哪好看」——对自己 10-19 拍板方案的逆转。`index.ejs` 删除身份词模板块与 `identityWords` 变量；`.identity-words` 四条规则与 ≤576px 横排变体、`.identity-title-row` 规则全删；`site.yml` 的 `identity_words` 数据保留不删但不渲染 | `css-tokens.js` 缺失锁：`.identity-words` 不得出现在 site.css（变异验证：注入样本 → FAIL → 恢复 → PASS）；E-040 的「竖排结构锁」随之退役，`overflow-wrap:anywhere` 禁令独立保留 |
| 5 | 主卡卡顶留白收口 | 撤铭牌使身份栏矮约 90px，1440×900 档留白 127px → 35px；但 `6vh` 项在 1366×768 / 1280×800 把标题压到 46–48px 少排一行，卡顶仍空约 110px（主人反馈「卡片上面一小部分区域是空的」）。去掉 vh 项改纯 `4.2vw`，桌面全宽度稳定吃 3.4rem 上限 | E-041 doc-sync 断言（token↔字阶表一致）同步改值；五档实测卡顶净留白 ≤35px、无词中断行、无横向溢出 |

**文档同步**：DESIGN-LANGUAGE 八处（R-5 允许清单、等宽轨/M2 用途枚举、§3.5 字距分工、身份域构成、待确认清单、响应式表、§10 A9 行标「已撤回」）；DESIGN-ROADMAP 三处（T3-19 行、A9 状态行、已落地表）；ERRORS.md E-040/E-041 各补「后续」段。

**遗留**：真名副行（F-2/H-1）与站名去 Blog 后缀仍待 B 组决策；身份词若将来要恢复，走 DESIGN-LANGUAGE §10 拍板流程后加回模板块。

### A9 撤回与主卡留白收口（2026-10-21 晚，主人连续两轮反馈）

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 4 | A9 身份词铭牌整块撤回 | 主人原话「01 Developer / 02 Writer 这哪好看」——对自己 10-19 拍板方案的逆转。`index.ejs` 删除身份词模板块与 `identityWords` 变量；`.identity-words` 四条规则与 ≤576px 横排变体、`.identity-title-row` 规则全删；`site.yml` 的 `identity_words` 数据保留不删但不渲染 | `css-tokens.js` 缺失锁：`.identity-words` 不得出现在 site.css（变异验证：注入样本 → FAIL → 恢复 → PASS）；E-040 的「竖排结构锁」随之退役，`overflow-wrap:anywhere` 禁令独立保留 |
| 5 | 主卡卡顶留白收口 | 撤铭牌使身份栏矮约 90px，1440×900 档留白 127px → 35px；但 `6vh` 项在 1366×768 / 1280×800 把标题压到 46–48px 少排一行，卡顶仍空约 110px（主人反馈「卡片上面一小部分区域是空的」）。去掉 vh 项改纯 `4.2vw`，桌面全宽度稳定吃 3.4rem 上限 | E-041 doc-sync 断言（token↔字阶表一致）同步改值；五档实测卡顶净留白 ≤35px、无词中断行、无横向溢出 |

**文档同步**：DESIGN-LANGUAGE 八处（R-5 允许清单、等宽轨/M2 用途枚举、§3.5 字距分工、身份域构成、待确认清单、响应式表、§10 A9 行标「已撤回」）；DESIGN-ROADMAP 三处（T3-19 行、A9 状态行、已落地表）；ERRORS.md E-040/E-041 各补「后续」段。

**遗留**：真名副行（F-2/H-1）与站名去 Blog 后缀仍待 B 组决策；身份词若将来要恢复，走 DESIGN-LANGUAGE §10 拍板流程后加回模板块。


---

## 附：2026-10-21 节假日页（/holidays/）建设批次

**来源**：主人搜到 studycli.org 的 2027 年中国节假日页，要「自己站上也能查」。
**定位**：不是收藏夹，是一个独立的查询页——导航「更多」下拉里第 3 项。

### 本批已完成（2026-10-21 晚，代码 + 22 条断言 + 三视口实测）

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 数据层单一来源 | `source/_data/holidays.yml`：7 个法定节假日（放假区间/天数/法定天数）、14 个其他节日、24 节气、meta（是否官方公布 + 来源）。日期全部写成带引号的字符串，避开 js-yaml 的 Date 对象（E-028） | `test/holidays-e2e.js`：法定假日合计 13 天、放假合计 28 天、跨度与 days 字段一致、节日都落在本年 |
| 2 | 计算层 | `themes/fluid/scripts/helpers/holiday-calendar.js`：纯函数（365 天状态表 / 12 个月行 / 统计 / 悬停数据），星期用 `Date.UTC` 算，与构建时区无关 | 测试里把日期换成 Date 对象重算，断言与字符串输入逐日状态完全一致（跨时区不变式） |
| 3 | 展示层 | `themes/fluid/layout/holidays.ejs`：法定节假日表（左）+ 统计（右）+ 全年 12×31 一览格（整幅）+ 其他节日双列 + 节气流 + markdown 说明 + `<details>` 常见问题 + 来源 | 产物断言：365 格 / 28 个放假格 / 12 行 / 7 行表格 / 页面非 0 字节（E-029、E-038 口径） |
| 4 | 交互层 | `source/js/holidays.js`：悬停浮层（日期 · 星期 / 状态 / 名称+拼音 / 说明 / 放假区间 / 锚点链接），触屏点按钉住，Esc 与滚动收起。纯增强，脚本不加载时表格仍完整 | 实测：1440/1280/390 三档浮层不越界、页面无横向溢出 |
| 5 | 样式层 | `site.css` §4.12：放假=实心砖红、周末=墨 11%、节日=格内墨点、普通=墨 4.5%。格内不放数字，横轴靠刻度尺 | 格子 1440 档 35.1px、390 档容器内部横向滚动（页面本身 scrollWidth==clientWidth） |
| 6 | 入口 | `themes/fluid/_config.yml` 导航「更多」增加「节假日」；`layout.ejs` 的 `paperLayouts` 登记 `holidays` | 测试断言首页 HTML 含 `href="/holidays/"` |

### 事实边界（页面上也写明了，不是藏在注释里）

- **2027 年的放假区间是预计值。** 国务院办公厅通常在前一年 11 月前后发布次年通知（2026 年的通知发布于 2025 年 11 月 4 日），当前尚未发布。页面顶部有「预计」条幅，表格与统计都带「预计」字样。
- **节日当天的日期是确定的**：春节 2 月 6 日（丁未羊年正月初一）、端午 6 月 9 日、中秋 9 月 15 日等已核对；24 节气按北京时间，与日本国立天文台 2027 年历要项换算一致。
- **调休上班日留空**：数据里 `makeup: []`，模板有 `is-makeup` 样式但本年不渲染（无数据不渲染）。官方通知发布后填进数组即出现。
- **农历日期只做到「有节日的那天」**：没有全量农历表，不在格子上逐日标农历（那是另一个数据源，需要另外核对）。

### 后续排期（主人决策后再动）

| 顺序 | 事项 | 阻塞 |
|---|---|---|
| 1 | 参考站观感对齐（纸底/墨/强调色微调 + 标题字体换 Fraunces 之类可自托管的开源字体） | 待主人定：只动 token，还是连正文字体一起换 |
| 2 | 官方通知发布后校准 2027 放假区间与调休 | 国务院办公厅发布（预计 2026-11 前后） |
| 3 | 增加年份切换（2028 及以后） | 数据层已支持 `years[]`，缺后续年份数据 |


---

## 附：2026-10-22 节假日页视觉对齐批次（单页破例 + E-045）

**触发**：主人看了参考站与本站的并排截图后明确「冲突也无所谓，人家的字体、排版、配色都喜欢」，要求把这一页的观感对齐过去。

### 本批已完成

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 双栏结构 | `holidays.ejs` 改成「左法定节假日表 + 右全年一览格」（原为表 + 统计在上、整幅格在下），月份标签改「1月」式，格子从 35px 收到约 12px | CDP 实测：1440 档表格 680px / 格 469px / 格子 12px；1280 档同构；390 档容器内横向滚动 |
| 2 | 配色对齐 | `.cal-page` 作用域内覆盖 `--accent:#c4463a`、`--text-color:#1a1a1a`、`--sec-text-color/--info-mark:#6b6b6b`、`background:#f7f6f4`；节日名改砖红 | `holidays-e2e.js`：参考站色值写进 `:root` 即 FAIL（破例不得溢出成全站换色） |
| 3 | 字体对齐 | 自托管 `fraunces-600-latin.woff2`（标题，OFL）+ `nunito-sans-var-latin.woff2`（正文，可变字重 200-1000，OFL），共 66KB，`font-display: swap`；**Avenir 是 Monotype 商业授权字体，不入库**，用 Nunito Sans 替代 | 断言：`font-family` 里出现 Avenir 即 FAIL（判据先剥 CSS 注释，防 E-031 型误报）；文件存在 + magic 为 `wOF2` |
| 4 | E-045 修复 | `<% } %>` 被打成 `<% end %>`，layout 编译失败、产出 17KB 残页而构建仍报成功 | 产物断言四件套（字节数 > 20000 / 365 格 / 7 行表 / JSON 可解析）+ 变异自检已验 |
| 5 | 测试扩到 26 条 | 新增字体文件、@font-face 注册、破例边界三类断言 | `npm run test:holidays` 26 项全绿 |

### 实测口径（本批）

- 1440×900：表格 680px / 年历格 469px / 单格 12px；`document.fonts` 里 Fraunces 600 与 Nunito Sans 200-1000 均为 `loaded`；探针宽度 Fraunces 669 / Georgia 646 / Nunito 657 / Arial 632（证明真在渲染，不是回退）。
- 1280×800：表格 673px / 格 464px / 单格 11.9px。
- 390×844：格 560px 容器内横向滚动，页面 `scrollWidth == clientWidth`（无横向溢出）；浮层三档均不越界。
- `hexo clean && hexo generate` 122 文件、无 0 字节 HTML。

### 仍与参考站不同的地方（已知，未改）

1. **顶部品牌栏**：参考站是自家红色 Banner + 主导航，本站是悬浮胶囊导航——这是站点骨架，不跟着单页改。
2. **农历**：参考站每个格子带 `data-l="冬月廿四|11|24"` 全量农历，本站只标注有节日那天的农历（数据里没做全量农历表）。
3. **正文字体**：Avenir 不可合法复用，Nunito Sans 是替代品，观感接近但不同名。


---

## 附：2026-10-22 节假日页视觉对齐批次（单页破例 + E-045）

**触发**：主人看了参考站与本站的并排截图后明确「冲突也无所谓，人家的字体、排版、配色都喜欢」，要求把这一页的观感对齐过去。

### 本批已完成

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 双栏结构 | `holidays.ejs` 改成「左法定节假日表 + 右全年一览格」（原为表 + 统计在上、整幅格在下），月份标签改「1月」式，格子从 35px 收到约 12px | CDP 实测：1440 档表格 680px / 格 469px / 格子 12px；1280 档同构；390 档容器内横向滚动 |
| 2 | 配色对齐 | `.cal-page` 作用域内覆盖 `--accent:#c4463a`、`--text-color:#1a1a1a`、`--sec-text-color/--info-mark:#6b6b6b`、`background:#f7f6f4`；节日名改砖红 | `holidays-e2e.js`：参考站色值写进 `:root` 即 FAIL（破例不得溢出成全站换色） |
| 3 | 字体对齐 | 自托管 `fraunces-600-latin.woff2`（标题，OFL）+ `nunito-sans-var-latin.woff2`（正文，可变字重 200-1000，OFL），共 66KB，`font-display: swap`；**Avenir 是 Monotype 商业授权字体，不入库**，用 Nunito Sans 替代 | 断言：`font-family` 里出现 Avenir 即 FAIL（判据先剥 CSS 注释，防 E-031 型误报）；文件存在 + magic 为 `wOF2` |
| 4 | E-045 修复 | `<% } %>` 被打成 `<% end %>`，layout 编译失败、产出 17KB 残页而构建仍报成功 | 产物断言四件套（字节数 > 20000 / 365 格 / 7 行表 / JSON 可解析）+ 变异自检已验 |
| 5 | 测试扩到 26 条 | 新增字体文件、@font-face 注册、破例边界三类断言 | `npm run test:holidays` 26 项全绿 |

### 实测口径（本批）

- 1440×900：表格 680px / 年历格 469px / 单格 12px；`document.fonts` 里 Fraunces 600 与 Nunito Sans 200-1000 均为 `loaded`；探针宽度 Fraunces 669 / Georgia 646 / Nunito 657 / Arial 632（证明真在渲染，不是回退）。
- 1280×800：表格 673px / 格 464px / 单格 11.9px。
- 390×844：格 560px 容器内横向滚动，页面 `scrollWidth == clientWidth`（无横向溢出）；浮层三档均不越界。
- `hexo clean && hexo generate` 122 文件、无 0 字节 HTML。

### 仍与参考站不同的地方（已知，未改）

1. **顶部品牌栏**：参考站是自家红色 Banner + 主导航，本站是悬浮胶囊导航——这是站点骨架，不跟着单页改。
2. **农历**：参考站每个格子带 `data-l="冬月廿四|11|24"` 全量农历，本站只标注有节日那天的农历（数据里没做全量农历表）。
3. **正文字体**：Avenir 不可合法复用，Nunito Sans 是替代品，观感接近但不同名。


---

## 附：2026-10-22 深夜 节假日页多年份 + 详情卡批次

**触发**：主人连续指出七处偏差——详情卡一闪而过没法细看、位置不固定、没有配图、正文不对齐、字体不一样、内部维护说明漏到发布页、只有一年没有年份切换、节日列表丢了三三三与四个节气、备注列缺失、预计说明位置不对。

### 本批已完成

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 十二年数据 | 抓取并解析参考站 2025–2036 共 12 个年份页（节假日表 / 节日列表 / 年历格子的逐日状态与农历）；2025、2026 与国务院办公厅通知逐条核对（2026 的 6 个调休上班日完全对上） | `holidays-e2e.js`：年份数组精确相等、每年 7 个节假日、2026 标官方 / 2027 标预计 |
| 2 | 年份页族 | `source/holidays/<年份>/index.md` 十二个页面，模板按 `page.year` 取数；页头右侧年份导航，当前年砖红胶囊 | 产物断言：12 个年份页全部存在且 > 20000 字节 |
| 3 | 常驻详情卡 | 重写 `source/js/holidays.js`：悬停即开、**移开不消失**、× / Esc / 点别处才收起、滚动时跟着格子走；位置优先贴格子左侧，纵向以格子为中心并钳在视口内；内容居中 | CDP 实测：移开鼠标后 `hidden === false`、`卡片右边缘 ≤ 格子左边缘`、三档不越界 |
| 4 | 内容对齐 | 预计说明从页面顶部移到日历栏下方；删掉「悬停查看当天」；节日列表补「日期 / 节日 / 备注」表头；节日名改回墨色（参考站不是红色）；FAQ 标题与正文标题对齐 | 断言：发布页不含「这一页怎么维护」「悬停查看」，必须含「>备注<」与「以上均为预计日期」 |
| 5 | 文案收进数据 | 正文三节与五条常见问题从 `index.md` 移入 `holidays.yml` 的 `meta.prose` / `meta.faq`，模板不含正文 | 断言：正文 h2 数量为 3、FAQ 条目为 5 |
| 6 | E-045 复发 | 重写模板时 `<% } %>` 又被打成 `<% end %>`，Hexo 静默产出 15KB 残页 | 新增**模板编译断言**（`ejs.compile()` 直接编译模板），与产物断言两道并存；变异自检已验 |

### 仍未做（待主人决策）

1. **配图**：参考站每张节日卡带一张照片。版权照片不能搬；合法路径有两条——(a) 从 Wikimedia Commons 取自由授权图并署名；(b) 用绘图工具生成 7 张插图（约 35–70 积分）。两条都要主人点头我才动。
2. **2021–2024**：参考站旧版表格的年份数据未逐条核对，不排除与国务院办公厅通知有出入，因此不录入。要补的话我逐条核对四个年度的官方通知后再上。


---

## 附：2026-10-22 深夜 节假日页补齐 2021–2024 + 二十四节气批次

**触发**：主人「他这个都能查到 36 年了，往前都能到 21 年，能不能移植就移植的明白一点」。

### 本批已完成

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 2021–2024 四年 | 逐条核对四份国务院办公厅通知（国办发明电〔2020〕27 号 /〔2021〕11 号 /〔2022〕16 号 /〔2023〕7 号），放假区间、调休上班日、法定天数全部按官方通知录；**不照抄参考站**——它那四页只列法定假日日本身，与通知对不上（2024 国庆它写 10/1–10/3，官方 10/1–10/7） | 全年份断言：法定合计 ≤2024 为 11 天、≥2025 为 13 天；来源链接写进 `meta.sources` 并逐条验过可达（2023 那条首版拼错 404，已换成人民网） |
| 2 | 农历节日 | 用 `lunar-javascript` 现算腊八 / 元宵 / 三月三 / 七夕 / 中元 / 重阳（该库只在一次性脚本里用，**不进项目依赖**）；正月初一、元宵、七夕与官方通知及参考站共 12 个校验点全部对上 | 数据落在 `festivals[].lunar` 与 `lunar` 映射 |
| 3 | 二十四节气（E-047） | 通用寿星公式生成 2021–2036 全部 24 个节气；与数据里已有的 48 个节气（2025–2036 每年 4 个）逐条比对 0 处不一致；2023 夏至公式差一天按官方值修正 | 断言：每年 24 个、名字不重复、日期落在本年；清明节气日 == 官方年份清明节放假当天（独立锚点）；两条变异自检 |
| 4 | 跨年元旦（E-048） | 2029/2030/2034/2035/2036 五个预计年的元旦 `start` 原写在上一年 12 月 30/31 日，逐日表少标格子；统一截断到本年、`days` 按跨度重算、完整区间写进 `arrange` | 断言：`start` / `end` 必须以本年份开头，`days == spanDays == 声明值` |
| 5 | 窄屏溢出（E-049） | 年份 12→16 后 `.cal-years { flex: none }` 按 max-content 撑到 621px，390 档整页溢出 351px；改 `flex: 0 1 auto; min-width: 0`，窄屏页头改上下堆叠 | CDP 实测两档 `pageOverflow = 0`；CSS 断言 + 变异自检 |
| 6 | 2025 国庆天数 | `days: 7` 与 `end: 2025-10-08` 跨度不符（渲染用的是跨度值所以一直是 8，只有数据字段写错） | 改成 8；全年份天数断言覆盖 |
| 7 | 节日列表错位（E-050） | `.cal-fest-cols` 两列网格里塞了「表头 + 两个列表」三个子元素，表头占 (1,1)、两个列表被挤到 (1,2) 和 (2,1)，左侧空出约 600px；表头「备注」也被排到日期列下。改为每列自带表头（`.cal-fest-col`），表头与行共用同一套 `grid-template-areas` | 断言：`.cal-fest-col` / `.cal-fest-head` / `.cal-fest-list` 三者数量必须都等于 2；表头 `grid-template-areas` 必须与 `.cal-fest-row` 一致 |

### 仍未做（待主人决策）

1. **配图**：参考站每张节日卡带一张照片。版权照片不能搬；合法路径两条——(a) Wikimedia Commons 自由授权图 + 署名；(b) 绘图工具生成 7 张插图（约 35–70 积分）。要主人点头我才动。
2. **数据来源区块要不要保留**：主人问「数据来源有必要标吗？这个我倒是不确定」。当前保留 6 条（四份 2021–2024 通知 + 2025 / 2026 通知 + 推算来源）。
3. **分割线一致性**：主人说「我看你这个中间的分割线用得挺好的，别的地方咋没见你用」——两级线（组顶 2px 全墨线 + 行底 hairline）目前只在节假日表用了，其它板块尚未统一。


---

## 附：2026-10-23 凌晨 节假日页对齐参考站收口批次

**触发**：主人五张截图逐条指出——表头不像参考站、页头两栏与右栏底部留白、说明区左边顶空右边底空、参考站有「来源」而我没有。

### 本批已完成

| # | 事项 | 做法（全部照参考站量出来的值） | 锁死方式 |
|---|---|---|---|
| 1 | 页头年份块 | 由「一行挤 16 个」改成 `minmax(0,1fr) 300px` 两栏网格、年份 4 列 16 行、左侧 1px 竖线 + 24px 内距；当前年由砖红胶囊改成**墨色加粗 + 2px 下划线**（参考站 `box-shadow: inset 0 -2px 0`） | CSS 断言：`.cal-years` 不得 `flex:none`、必须有 `min-width:0`；窄屏断点必须单列 |
| 2 | 表头 | 沙色底带 `#f7f5f0`、600 字重、`--sec-text-color`、去掉下边框（参考站 `--sand` 值） | 产物断言官方/预计两页表头差异 |
| 3 | 调休上班日列 | 官方年份表加第 4 列「调休上班日」，一个日期一行；预计年份不加这列（参考站的预计页也没有） | 断言 + 2021 归属数组写死 + 每年「分完」 |
| 4 | 来源 | 撤掉整块「数据来源」，改成参考站那样**表下一行小字**：`来源：国务院办公厅 2025 年 11 月 4 日的通知（中文）。`，只给官方年份标 | 断言官方页有、预计页没有、`>数据来源<` 不出现 |
| 5 | 调休释义 | 加一行 `调休上班日 是为了凑出连休而需要上班的周末…`（参考站同位置也有），只给官方年份 | 同上 |
| 6 | 两栏底边齐平 | `.cal-top` 改 `align-items: stretch`；`.cal-year` 改 flex 纵向；页尾那组小字（说明/释义/来源）`margin-top:auto` 沉到栏底。实测两栏 bottom 都是 958 | CDP 量 `.cal-after` 底 == 表底 |
| 7 | 说明区 | 两侧各一条组顶全墨线 + 统一 1.25rem 组顶间距，标题落同一基线；问答列 `flex:1` 均分拉满整列（此前比说明矮 500px），标题行内垂直居中 | CDP 量 FAQ 高度 == 说明高度 |
| 8 | 配图落位 | 七张 Wikimedia Commons 自由授权图（元旦烟花 / 春节灯笼 / 清明上河图 / 深圳电子厂 / 龙舟 / 中秋餐桌 / 国庆花坛），按节日类型挂在 `meta.images`，卡内署名 + 授权 + 链回原文件页 | 断言：署名/授权/原文件页齐全、文件是真 JPEG 且宽 ≥800、产物 JSON 带署名 |

### 关键判断

- **「数据来源」不是删掉了事**：参考站其实**有**来源，只是做成表下一行小字、且**只对官方年份**标。原来那块六条的独立版块是我自己加戏。
- **调休归属不能手填**：同一份信息存两处必然走偏（E-051 就是这么来的）。改成从年份级列表就近推导，十六年逐条对上官方通知。


---

## 附：2026-10-23 下午 节假日页交互与首屏收口批次

**触发**：主人十张截图逐条指出八处问题（详情卡乱弹/串卡、页头没对齐、默认年份不对、
2021 跳首页、首屏截断、右栏空白、字体不像、统计重复、缺聚焦效果、格子没圆角）。

### 本批已完成

| # | 事项 | 做法（照参考站 holiday-calendar.js / CSS 量值） | 锁死方式 |
|---|---|---|---|
| 1 | 详情卡只给有内容的日子 | 只有法定节假日 / 其他节日 / 节气开卡；普通工作日与周末一律不出卡（周末除了「周末」两个字没别的内容） | 断言：`2027-01-07`、`2027-01-09` 不进悬停数据，元宵节进 |
| 2 | 不再串卡 | 从春节格移到旁边普通格时，卡片**保持原样**不换内容也不消失（此前会变成那一格的样式）；仍只有 × / Esc / 点别处才收起 | CDP 实测：移格后 `卡内容` 不变、`仍开` 为 true |
| 3 | 一览聚焦 | 移植参考站 `light()`：悬停左表行或一览假期格 → 该假期的格子保持不透明、其余 `opacity:.28`，左表对应行高亮 `#fbf3f1`；格子与行都加 `data-h` | 断言 data-h 存在 + 两条 CSS 规则；CDP 实测高亮 8 格 / 变淡 357 格 / 移出即清 |
| 4 | 格子圆角 | `border-radius: 1.5px`（参考站值） | CSS 断言 |
| 5 | 页头 | 加面包屑「中国节假日 / 2026」；引导段（节假日数、两个长假、春节当天与星期、生肖年、正式/预计说明）由数据算出；十六个年份补生肖数据（2026=丙午马、2027=丁未羊，与参考站一致） | 断言面包屑、引导段四要素、生肖 |
| 6 | 默认年份 | 默认页从 2027 改为 **2026**（当前年），标题改「2026 年中国节假日」 | 断言默认页标题带 2026、2026 为当前年 |
| 7 | 2021 跳首页（E-053） | 删掉「默认页把第一年链回首页」的特例，一律 `/holidays/<年份>/` | 断言默认页含 `href="/holidays/2021/"` |
| 8 | 首屏不截断 | 表头沙色带下移一档；名称+拼音同行（th 列 6.4rem→9.5rem，否则「中秋节 Zhōngqiūjié」折行把行高顶起来）；放假说明与区间同行；行 padding .95→.68rem。行高 74px→47px，表底 1042→854，**1440×900 首屏装下完整 7 行表** | CDP 实测 `表底 <= 视口高` |
| 9 | 右栏空白 | 撤掉上一批的「沉底齐平」，改回自然流——参考站就是自然收口，差距靠内容（调休释义 + 来源）补 | CSS 注释写明理由 |
| 10 | 字体 | `.cal-prose h2` / `.cal-faq .col-title` 此前落在 `.markdown-body h2` 默认规则上，变成 Nunito Sans 700 / 32px；参考站是 **Fraunces 600 / 27px**，已改齐 | CDP 实测字号字重字族 |
| 11 | 统计去重 | 删掉「年一览」下面那一行统计（与页头重复），把「其他节日 / 节气」计数并进页头那一行 | 断言页面不含 `cal-stats-line` |

### 未做（待主人决策）

1. **生肖年链接**：参考站把「火羊年」链到 `/chinese-zodiac/year-of-the-goat/`。本站没有生肖页，
   所以现在只渲染文字不链接。要链接的话得先有一个目标页——可以做一个「生肖年」页，
   或者链到参考站那个页面（不太合适）。
2. **.ics 订阅**：参考站在一览下方有「将 2027 年法定节假日添加到你的日历（.ics）」。
   要的话我生成十六个年份的 ics 文件。

---

## 附：2026-10-23 深夜 三处返工（来源截断 / 刻度尺竖排 / 普通日期无提示）

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 「来源」那行被视口截断 | 右栏比左表多一行图例说明，页头再松一档就超了。节假日页的 `.page-head` 间距单独收一档（不动其它纸面页）、`.cal-page .col-head` 同样单独收、引导段行高 1.65→1.6、图例/说明/来源三处间距各收一档。右栏底 896→857，1440×860 下左右两栏都完整 | CDP 实测 `右栏底 <= 视口高` |
| 2 | 刻度尺 10/15/20/25/30 竖着排 | `.cal-tick` 加 `white-space: nowrap; text-align: left`。一格只有 1/31 宽（约 13px），不设 nowrap 两位数会被折成「1」在上「0」在下；允许溢出到右邻格、按左边缘读数，与参考站 `.hc-gl__scale span` 一致 | CSS 断言锁 nowrap + text-align |
| 3 | 普通日期悬停没有小框框 | 参考站是**每个格子都有原生 `title`**（普通格 `title="1月9日，周六"`，假期格 `title="1 月 1 日，星期五。预计放假：元旦"`），自定义详情卡只给有内容的格子。照此给 365 个格子都加了 title，文案在 helper 里一次算好 | 断言：365 个格子全带「几月几日，星期X」title，春节/元旦格还带节假日名 |

---

## 附：2026-10-23 深夜 三处返工（来源截断 / 刻度尺竖排 / 普通日期无提示）

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 「来源」那行被视口截断 | 右栏比左表多一行图例说明，页头再松一档就超了。节假日页的 `.page-head` 间距单独收一档（不动其它纸面页）、`.cal-page .col-head` 同样单独收、引导段行高 1.65→1.6、图例/说明/来源三处间距各收一档。右栏底 896→857，1440×860 下左右两栏都完整 | CDP 实测 `右栏底 <= 视口高` |
| 2 | 刻度尺 10/15/20/25/30 竖着排 | `.cal-tick` 加 `white-space: nowrap; text-align: left`。一格只有 1/31 宽（约 13px），不设 nowrap 两位数会被折成「1」在上「0」在下；允许溢出到右邻格、按左边缘读数，与参考站 `.hc-gl__scale span` 一致 | CSS 断言锁 nowrap + text-align |
| 3 | 普通日期悬停没有小框框 | 参考站是**每个格子都有原生 `title`**（普通格 `title="1月9日，周六"`，假期格 `title="1 月 1 日，星期五。预计放假：元旦"`），自定义详情卡只给有内容的格子。照此给 365 个格子都加了 title，文案在 helper 里一次算好 | 断言：365 个格子全带「几月几日，星期X」title，春节/元旦格还带节假日名 |

---

## 附：2026-10-23 后台操作卡顿与状态逻辑批次（GitHub Issue #2 / #3）

来源：主人 2026-10-22 在 GitHub 提的两个 Issue——#2「后台管理页运行缓慢」（发表/编辑/删除后
卡几秒）、#3「后台管理页操作逻辑有问题，样式较丑」。本批次只做后台（`source/admin/` 前端 +
`test/admin-smoke.js`），未动 API 服务端与任何数据文件。

### 根因（三层，E-056）

1. 每次 mutation 后都全量 `listAll`：重读每一篇草稿与私密文章（各一次 GitHub 往返）。
   启动路径早有 `?summary=1` 轻量模式，mutation 后的刷新从未采用。
2. 刷新在关键路径上：`await reloadList()` → `switchTab()`，toast 之后视图切换还要干等。
3. 操作期间零反馈：`guard()` 只在连点第二下才弹提示，首次点击后的 1~3 秒界面无变化。

### 本批已完成

| # | 事项 | 做法 | 锁死方式 |
|---|---|---|---|
| 1 | 操作后卡顿（Issue #2） | `markListStale()` 列表脏标记：编辑器内操作只打标记，返回列表时按需刷新（文章 tab 全量顺带补草稿标题，其余 tab `summary` 轻量）；列表内操作立即轻量刷新 | 断言 E-056：五个 mutation 文件不得有无参 `reloadList()`，轻量调用必须显式 `summary: true` |
| 2 | 操作期间无反馈（Issue #2） | `admin-core.js` 新增 `busyStart/busyEnd` 忙态条，`guard()` 自动套用；`index.html` 加 `#busy-bar`，CSS 滑动条 + `prefers-reduced-motion` 降级 | 断言：`#busy-bar` 存在、`guard` 驱动 busyStart/End、CSS 含 `@keyframes busy-slide` |
| 3 | 视图切换等网络（E-058） | 发布/删除改为 `clearDirty → markListStale → if (编辑器仍可见) switchTab`；用户已离开编辑器时不拽回 | 断言 E-058：两函数内必须 `markListStale()` 且 `switchTab('posts')` 带可见性守卫 |
| 4 | 草稿与正式文重复（E-057） | 新建文章「保存草稿」后补 `ed.mode = 'draft'` + 按钮文案同步（抽 `applyModeUI` 复用）；修复前再点发布走 `publish-new`，`_drafts/` 草稿仍在，列表出现两条 | 断言 E-057：`saveCurrentEditing` 必须含 `ed.mode = 'draft'` 与 `applyModeUI('draft')` |
| 5 | 卡片操作可交错提交 | 删文章/删条目/转私密/发布私密/恢复统一套 `guard()`；修复前连删两张卡带同一个 `expectedHeadSha`，第二张必 409 | 断言：`admin-list.js` 受 guard 保护的卡片操作 ≥5 处 |
| 6 | 部署 pill 状态伪装（Issue #3） | 无 `commitSha` 分支 `dataset.state` 从 `committed` 改 `saved`（CSS 的 saved 规则一直存在却无人使用）；E-036 修了文案，状态可视化仍在伪装 | 断言：无 sha 分支必须 `dataset.state = 'saved'` |
| 7 | 样式细节（Issue #3） | 键盘焦点环（此前几乎所有交互元素无 focus 样式）、列表卡片 hover 反馈、toast 手机端抬升避让 FAB（原 5.2rem 与 FAB 顶 7.8rem 重叠） | 无机器断言（视觉层），改动均在 `admin.css` 可 diff |

### 验证

- `npm run test:admin`：100 项断言通过（原 94 + 本批 6）。
- `npm test` 全量八套：本批交付时全绿。此后复跑时 `test:dates` 报过一次
  「缺页面 index.html」——并行会话正在同一工作区重建 `public/`（`hexo clean` 后
  生成未完成）的并发时序，与本次改动无关（本批只碰 `source/admin/` 与
  `test/admin-smoke.js`，不参与构建产物）。
- 六条新断言全部做过变异自检（构造失败样本确认会红，6/6，见 ERRORS.md E-056~E-058 各条）。
- `?v=` 已按 E-018 bump 至 `20261023`（index.html + admin.js 全部 import，断言锁一致）。
- 上线后主人侧需强制刷新（Ctrl+F5）一次方可看到后台改动（E-018 缓存破坏约定）。

### 未做 / 后续

- Issue #3 的「样式较丑」是主观项，本批只修了可客观判定的反馈与状态缺陷（忙态条、焦点环、
  hover、toast 避让、pill 态）；整体视觉重构需主人给出具体不满点再排期。
- 并行会话当时正在同一仓库作业（zodiac / 字体性能审计），本批只提交 `source/admin/` 与
  `test/admin-smoke.js`，未并提交其在途改动；ERRORS.md 的记录与其在途条目同处一个文件，
  提交范围经主人确认后处理。
