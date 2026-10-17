# AGENTS.md — Development Protocol

This file is the operating protocol for any AI agent working on this repository.
Its purpose: protect existing assets and get authorized work done efficiently, without
stalling on unnecessary confirmations and without touching things that were not asked for.

---

## 1. Before starting

- Read project-level rules and any relevant design/architecture documents first.
- **Read `ERRORS.md` before starting.** It is the record of every mistake already made
  in this repo. Do not repeat any of them.
- Inspect Git state: current branch, HEAD, staged area, working tree, and untracked files.
- Inspect the actual source, config, dependencies, and existing implementation.
- Separate changes that already existed before the task from changes you create.
- **Never assume** that a directory, dependency, script, or feature exists. Verify first.
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

### 5.2 线上可见性铁律：本地改完 ≠ 主人看得到（主人明确要求，2026-10-18）

**这个站的发布链路是：本地改文件 → `git commit` → `git push` 到 GitHub → Vercel
自动构建部署 → 主人在 <https://www.040925.xyz> 上看到。**

`deploy.type` 是空的，`npm run deploy` 什么都不做；本地 `public/` 也不会上传。
**所以只改本地文件、只跑 `hexo generate`，主人在域名上永远看不到改动。**

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

---

# Project snapshot

Verified on 2026-10-10. Re-verify if this section drifts from reality.

**What it is:** a personal Hexo blog ("KASAI'S Bloger"), deployed to
<https://www.040925.xyz>. Chinese-language writing.

| Item | Value |
|---|---|
| Branch | `main` (remote: `origin` → `https://github.com/YaoZenO/my-hexo-blog.git`) |
| Hexo | 8.1.1 |
| Node / npm | v22.22.2 / 10.9.7 |
| Permalink | `:year/:month/:day/:title/` |

**Commands** (`package.json` scripts):

| Command | Effect |
|---|---|
| `npm run server` | local dev server on <http://localhost:4000> |
| `npm run build` | `hexo generate` → writes `public/` |
| `npm run clean` | `hexo clean` |
| `npm run deploy` | `hexo deploy` — **currently a no-op**, `deploy.type` is `""` in `_config.yml` |

**Layout:**

- `source/_posts/*.md` — blog posts (markdown with Hexo front matter)
- `source/about/index.md` — about page
- `scaffolds/*.md` — `hexo new` templates
- `themes/fluid/` — the vendored theme named by `_config.yml`
- `_config.yml` — main config; `_config.landscape.yml` — a secondary/landscape config
- `public/`, `db.json`, `node_modules/`, `.deploy*/` — gitignored build output

**Known quirks — do not "fix" without being asked:**

- `_config.yml` sets `theme: fluid` and `themes/fluid/` exists in git, but `package.json`
  only declares `hexo-theme-landscape`. The theme is vendored, not an npm dependency.
- `deploy.type` is empty, so `npm run deploy` will not publish anything.
- Front matter and config use full-width Chinese punctuation in places — preserve it.

**Git convention:** commit messages in this repo are short and human-readable in both
Chinese and English (e.g. `修改文章以及一些配置内容`, `Restore two recovered blog posts`).
Match that style when a commit is authorized.