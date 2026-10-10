# AGENTS.md — Development Protocol

This file is the operating protocol for any AI agent working on this repository.
Its purpose: protect existing assets and get authorized work done efficiently, without
stalling on unnecessary confirmations and without touching things that were not asked for.

---

## 1. Before starting

- Read project-level rules and any relevant design/architecture documents first.
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

Interrupt the user mid-task only when there is a hard blocker, a major risk, or a
request for authorization. Do not expand beyond the original scope.

---

# Project snapshot

Verified on 2026-10-10. Re-verify if this section drifts from reality.

**What it is:** a personal Hexo blog ("KASAI'S Bloger"), deployed to
<https://www.hyy.baby>. Chinese-language writing.

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