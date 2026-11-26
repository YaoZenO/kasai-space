# AGENTS.md — Development Protocol

This file is the operating protocol for any AI agent working on this repository.
Its purpose: protect existing assets and get authorized work done efficiently, without
stalling on unnecessary confirmations and without touching things that were not asked for.

---

## 1. Before starting

- Read project-level rules and any relevant design/architecture documents first.
- **Read `ERRORS.md` before starting.** It is the record of every mistake already made
  in this repo. Do not repeat any of them.
- For any UI, page, visual, motion, or interaction task, read
  `DESIGN-PHILOSOPHY.md` before planning or editing.
- `DESIGN-PHILOSOPHY.md` is the highest-level authority for creative direction,
  visual expression, motion, and interaction. Existing pages and legacy visual
  rules are references, not automatic constraints.
- If it conflicts with `DESIGN-LANGUAGE.md` or visual sections of `PRD.md`,
  follow `DESIGN-PHILOSOPHY.md`; preserve factual product, data, security,
  accessibility, and URL constraints.
- Do not declare a design task complete based only on build/test success.
  Follow the design proposal, prototype, browser verification, and acceptance
  requirements in `DESIGN-PHILOSOPHY.md`.
- Inspect Git state: current branch, HEAD, staged area, working tree, and untracked files.
- Inspect the actual source, config, dependencies, and existing implementation.
- Separate changes that already existed before the task from changes you create.
- **Never assume** that a directory, dependency, script, or feature exists. Verify first.
- **核实数量与内容事实必须读全文件、逐条点名核对，严禁只读片段或凭印象下结论糊弄主人。** 涉及条目数、页面内容、数据明细时，必须完整读取源数据与产物并列出实际清单；若与主人印象不一致，直接亮出真实条目清单核对，不得敷衍顺从或含糊带过。
- If the repo state contradicts a document, trust the repo state and report the discrepancy.

## 2. How to execute

- For low-risk, reversible, in-scope operations: proceed autonomously and continuously.
  Do not ask for confirmation step by step.
- For non-critical choices: decide yourself using project conventions.
- Prefer the **minimum necessary change**. Preserve the existing architecture and
  compatibility unless the task explicitly requires otherwise.
- Pause and request authorization only when architecture, data, security, cost, or
  irreversible impact is materially at stake.
- Do not create communication overhead by artificially splitting the task into phases or
  reporting every single command.

## 3. Safety boundaries

Without explicit authorization for **this** task, you MUST NOT:

- `git commit`, `git push`, deploy, or publish.
- Run destructive cleanup, rewrite history, or delete backups.
- Overwrite or revert the user's existing uncommitted changes.
- Modify published content, permalinks, or production data on your own initiative.
- Upgrade all dependencies, or install unnecessary third-party tooling.
- Send credentials, private files, or unauthorized data to any external service.
- **不私自提交非本次任务的改动。** `git push` 推的是整条分支，不是单个 commit。
  push 前必须先 `git fetch`，再用 `git log origin/main..HEAD --oneline` 逐条确认
  每个提交的归属；凡属本次任务之外的提交（其他会话已提交、尚未推送的），一律不得
  随带——发现即停，列出清单，等主人决定。
  反例 E-102：一次只含两篇文章相关文件的提交，push 时把其他会话三个未推送提交
  （`712e073` / `1bb84df` / `083d54c`）一起带上了生产。
  一句话原则：只提交自己改的文件，只推送自己该推的东西；范围不明就停。

Authorization applies only to the actions and scope explicitly stated.
If you make a mistake, report it immediately and fix it. Never silently repair and hide it.

### 3.1 Error recording (mandatory)

**Every mistake must be recorded in `ERRORS.md` in the same batch as its fix.**
No exceptions for small ones, and no "I'll log it later".

- Applies to: defects you introduce, defects you discover and fix, defects the user
  reports, and anything a test exposes.
- Each entry must end with a **prevention mechanism** — a test assertion, a scripted
  restore, a defensive code check, or directory isolation.
  "I'll be more careful next time" does not count.
- Update the index table in `ERRORS.md` §2 in the same edit.
- Use the template in `ERRORS.md` appendix.

**Anti-patterns already recorded — treat as hard prohibitions:**

- Never run tests against the real repository. Always use mock mode
  (`ADMIN_DEV_MOCK=1`). See E-001: this polluted the live repo with 18 commits
  and corrupted a production data file.
- Never put non-plugin scripts in project-root `scripts/` — Hexo auto-loads
  everything there. Test code goes in `test/`. See E-004.
- Never trust a silent success. If a library returns output without erroring,
  verify the output actually changed. See E-002.
- **Never use `git checkout --` / `git restore` to undo test damage.** It rolls
  back the *whole file*, silently destroying the owner's uncommitted work in it.
  See E-032: this destroyed an in-progress `games.yml` rewrite. Mutation tests
  must back up the original string in memory and write it back in `finally`
  (`test/mutate.js`), and must skip files that already have uncommitted changes.

## 4. Verification requirements

- Pick the appropriate build, test, and browser verification for the task at hand.
- UI changes: verify actual rendering on both desktop and mobile viewports where possible.
- Feature changes: verify the happy path, important edge cases, and affected existing behavior.
- On failure: diagnose the cause first, fix within scope, then re-verify.
- **Never claim a task passed just because code was written or a command exited.**
- Anything you could not verify must be explicitly labeled as "unverified" in the report.

## 5. Delivery requirements

End the task with a single concise report containing:

1. What was completed.
2. Which files were modified, and why.
3. The verification commands actually executed, and their results.
4. Git changes compared to the pre-task state.
5. Unfinished items, risks, and limitations.
6. Whether the user needs to make a next-step decision.

### 5.1 后台前端改动的缓存破坏约定（E-018）

改动 `source/admin/` 下任何前端文件（js / css / index.html）后，**必须同步 bump
两处缓存破坏版本号**，否则浏览器继续渲染旧副本，表现为「代码已上线但看不到改动」：

1. `source/admin/index.html`：`/admin/admin.css?v=<版本>` 与 `/admin/admin.js?v=<版本>`
2. `source/admin/admin.js`：全部 import（静态 `from` 与动态 `import()`）加同一 `?v=<版本>`

版本号用日期（`YYYYMMDD`）。漏改会被 `test/admin-smoke.js` 的 E-018 断言直接判失败。
bump 后需强制刷新（Ctrl+F5）或无痕窗口验证一次。

Interrupt the user mid-task only when there is a hard blocker, a major risk, or a
request for authorization. Do not expand beyond the original scope.

### 5.2 前台日期/时间渲染约定（E-028 / E-029）

1. **禁止在 EJS 模板里把 `Date` 对象交给 `<%= %>` 直出。**
   `<%= new Date(x) %>` 会渲染成 `Sun Oct 18 2026 00:00:00 GMT+0000 (Coordinated
   Universal Time)`。模块的 `it.date` 一律走 helper：
   `<%= fmtItemDate(it.date) %>`（可选第二参数指定格式）。
   helper 在 `themes/fluid/scripts/helpers/fmt-item-date.js`。
2. **`source/_data/*.yml` 里 `date: 2026-10-18`（无引号）会被 js-yaml 解析成
   Date 对象**，不是字符串。它只有「日期」粒度，没有真实时分秒；任何显示
   「00:00:00」的地方都是把日期当时间显示了。
3. **helper 必须放 `themes/fluid/scripts/` 下且自包含**（实现与注册同一文件）。
   项目根 `scripts/` 在 `hexo server` 预览时不加载；跨文件 `require` 在 Hexo 的
   vm 加载上下文里解析失败。
4. **改模板 / helper 后必须抽查产物字节数。** Hexo 渲染抛错会写入 **0 字节 HTML**，
   但构建仍打印「N files generated」、退出码 0（E-029）。只看构建输出必漏。
   `test/module-dates.js` 已锁死这四类问题并串入 `npm test`。

### 5.3 线上可见性铁律：本地改完 ≠ 主人看得到（主人明确要求，2026-10-18）

**这个站的发布链路是：本地改文件 → `git commit` → `git push` 到 GitHub → Vercel
自动构建部署 → 主人在 <https://www.040925.xyz> 上看到。**

仓库里没有 `deploy` 脚本，`_config.yml` 的 `deploy.type` 也是空的；本地 `dist/` 同样不会自动上传。
**所以只改本地文件、只跑 `npm run astro:build`，主人在域名上永远看不到改动。**

因此：

1. **任何会影响线上内容的改动（数据文件、模板、样式、文章），交付时必须主动推进到
   `commit` + `push`**，而不是停在"本地已验证"。做完却不说、不推，等于没做——
   主人看到的是一个毫无变化、可能还是旧数据的站点。
2. 推送前必须明确列出：改了哪些文件、commit message 用了什么、推到了哪个分支。
3. 若工作区里有**主人自己未提交的改动**（如 admin 相关文件、文档），
   先报告再问：只提交本次任务的改动，还是一起提交——**不要擅自把主人的在途改动带上去**。
4. 若本轮因权限/授权原因未推送，必须在交付报告里用醒目的一句话说明
   「**改动尚未推送，域名上还看不到**」，并给出待执行的命令。
5. 数据文件（`source/_data/*.yml`）尤其要小心：本地副本可能**落后于远端**
   （主人在后台直接改过 GitHub）。改之前先比对线上实际内容，别用陈旧本地副本
   覆盖掉主人已经在线上录好的数据。

### 5.4 页面文案铁律：禁止防御性文案与操作说教（主人明确要求，2026-11-26）

- **禁止在页面中写防御性免责/自我解释的括号补充**（例如「因出现在部分国际/对照榜单而被收录，不适用中国国内 5A 景区等本土口径」「（非中国省级行政区）」「（无该项数据的城市自动不入榜）」等）。数据结构和展示口径本身该处理好，不需要在页面文字里替自己辩解。
- **禁止在页面中写冗余的操作说教**（例如「点击任意生肖或右侧卡片锁定关系，旋转指针并绘制连线」「点月份卡上的月份可切换」）。交互与信息层级靠图形、状态和排印自己表达，文字只留自然、克制的事实陈述。

---

# Project snapshot

Verified on 2026-11-24 against `main` @ `cbc3142`. Re-verify if this section drifts from reality.

**What it is:** a personal static site ("KASAI'S Personal Space"), Chinese-language
writing, published to <https://www.040925.xyz> by pushing to GitHub — Vercel builds on push.

| Item | Value |
|---|---|
| Branch | `main` (remote: `origin` → `https://github.com/YaoZenO/kasai-space.git`) |
| Renderer | Astro 7.4.7 (`^7.4.7`), `output: 'static'`, no front-end framework |
| Node / npm | `engines.node: 24.x`; on this machine prefix `PATH=/e/Nodejs:$PATH` — the system default v22 is rejected by Astro |
| Build output | `dist/` (`build.format: 'directory'` → `path/index.html`) |
| Asset root | `static-public/` — the Astro `publicDir`, deliberately *not* `public/` |
| Site URL | `https://www.040925.xyz` (`astro.config.mjs` `site`, `_config.yml` `url`) |
| Permalink | `:year/:month/:day/:title/` |

**Commands** (`package.json` scripts):

| Command | Effect |
|---|---|
| `npm run server` | `astro dev` |
| `npm run build` | alias of `astro:build` |
| `npm run astro:build` | `prepare-assets.mjs` → `astro build` → `encode-module-paths.mjs` → `stamp-assets.mjs` |
| `npm run astro:verify` | `tools/verify-urls.mjs --mode=exact` against `docs/astro-migration/URL-BASELINE.txt` |
| `npm run clean` | deletes `dist/`, `.astro/`, `static-public/` |
| `npm test` | `test:deps` → full build → 16 assertion suites |
| — | there is no `deploy` script; publishing means `git push origin main` |

**Layout:**

- `src/pages/` — every route. `src/lib/` — data and config loaders. `src/components/`, `src/layouts/`.
- `source/_posts/*.md` — posts. `source/_data/*.yml` — data sets (cities, holidays, zodiac, library, cityrank).
- `source/css/site.css` — the only stylesheet. `source/js/*.js` — page scripts; new files must be
  stamped by `tools/stamp-assets.mjs` or they render stale.
- `source/img/`, `source/fonts/`, `source/lib/` — assets copied into `static-public/` by `tools/prepare-assets.mjs`.
- `api/` — Vercel serverless functions behind `/admin/`.
- `themes/fluid/` — **build input only**; see quirks before touching it.
- `tools/` — build pipeline. `test/` — assertion suites. `docs/astro-migration/` — migration plan, spec, URL baseline.

**Known quirks — do not "fix" without being asked:**

- `themes/fluid/` looks like a deletable Hexo leftover and is not. The build still reads
  `themes/fluid/_config.yml`, `source/css/*.styl`, `source/js/**`, `source/img/**` and
  `data/china-provinces.json` — that last one holds the province paths
  `src/lib/china-map.ts` turns into SVG. Its 40+ EJS layouts and its `scripts/` are dead;
  nothing renders them.
- `_config.yml` is still live: `src/lib/site-config.ts` takes title, description and URL from it.
  Only `deploy.type: ""` is a fossil.
- `ejs` sits in devDependencies solely so three legacy suites (`test/{holidays,zodiac,festival}-e2e.js`)
  can compile `themes/fluid/layout/*.ejs`. `moment-timezone` has no reference anywhere — removable.
- `js-yaml` is pinned to 4.x on purpose: 22 files mix `import` and `require` on it, and 5.x breaks
  both the CJS path and the YAML timestamp behaviour `src/lib/dates.ts` relies on (E-028).
- `hexo-util` is a real runtime dependency (`src/lib/markdown.ts`, `src/lib/posts.ts`,
  `src/pages/atom.xml.ts`, `src/pages/sitemap.xml.ts`), not a Hexo leftover.
- Never write `calc(a + b)` in source CSS: the minifier drops the spaces and silently
  invalidates the whole declaration (E-064).
- Front matter and config use full-width Chinese punctuation in places — preserve it.

**Git convention:** commit messages in this repo are short and human-readable in both
Chinese and English (e.g. `修改文章以及一些配置内容`, `Restore two recovered blog posts`).
Match that style when a commit is authorized.