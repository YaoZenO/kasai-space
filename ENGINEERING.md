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
| P2-12 | 私密文章：只想自己看、不删除、不上线 | 文章移入 `source/_drafts/` 后线上与 GitHub 双不可见（仓库私有 + `render_drafts: false`，`_config.yml:48`）；后台草稿列表可打开编辑，「发布」一键转正且保留原 date；验收：`hexo generate` 产物不含该文、`/api/content-list` 草稿列表含该文 | 🔶 需求已登记（2026-10-21 主人提出）；方案＝既有草稿机制零开发，通俗方案已出，待主人点名哪几篇后执行迁移 |

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
| 6 | 私密文章迁移（P2-12） | 极小（git mv + push） | 待主人点名哪几篇 |
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
