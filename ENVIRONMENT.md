# 环境变量清单

管理后台所需的服务端环境变量说明。**所有值只存放在 Vercel 项目环境变量中，严禁写入源码、提交进仓库或发送给任何对话。**

- 配置位置：Vercel → 项目 `my-hexo-blog` → Settings → Environment Variables
- 环境选择：全部勾选 **Production**
- 修改任何变量后必须**重新部署**（push 到 main 或在 Deployments 页 Redeploy）才生效

## 生产环境变量（9 个必填 + 1 个可选）

| 变量 | 作用 | 值的来源 |
|---|---|---|
| `GITHUB_APP_ID` | 生成 App JWT，换取 Installation Token | GitHub → Settings → Developer settings → GitHub Apps → 本站 App → 首页顶部 App ID |
| `GITHUB_CLIENT_ID` | OAuth 登录授权 | 同上页面，Client ID（`Iv23lib` 开头） |
| `GITHUB_CLIENT_SECRET` | OAuth code 换用户身份（用后即弃） | 同上页面 → Client secrets（生成后只显示一次） |
| `GITHUB_PRIVATE_KEY` | App JWT 签名私钥 | 同上页面 → Private keys → Generate 下载 `.pem`，**整段内容**（含 BEGIN/END 行与换行）粘贴 |
| `GITHUB_INSTALLATION_ID` | 定位 App 安装实例，限定可写仓库 | App 安装页 URL 中的数字（`/installations/<数字>`），安装对象必须是生产仓库 |
| `ADMIN_GITHUB_LOGIN` | 允许进入后台的 GitHub 用户名 | 当前为 `YaoZenO`（唯一管理员） |
| `SESSION_SECRET` | 登录会话 Cookie 的 HMAC 签名密钥 | 自行生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。⚠️ 更换后所有登录立即失效；勿复用曾在任何对话/文档中出现过的旧值 |
| `VERCEL_TOKEN` | 部署状态查询（主通道） | Vercel → Account Settings → Tokens 创建（作用域选本账号） |
| `VERCEL_PROJECT_ID` | 部署状态查询定位项目 | Vercel → 项目 Settings → General → Project ID（`prj_` 开头）；本地 `.vercel/project.json` 中也有 |
| `VERCEL_TEAM_ID`（可选） | 多团队账号时指定 scope | Vercel 团队 Settings → General → Team ID（`team_` 开头） |

## 本地 `.env.local`（已 gitignore，不进仓库）

| 变量 | 作用 |
|---|---|
| `SESSION_SECRET` | 本地 `vercel dev` 或 mock 模式调试用；与生产值独立，勿共用 |
| `SESSION_TTL_SECONDS` | 会话有效期（秒），默认 604800（7 天） |
| `VERCEL_OIDC_TOKEN` | vercel CLI 自动维护，勿手改 |

## 相关配置（非环境变量，但同属凭据面）

- GitHub App 的 **Callback URL** 必须精确为 `https://www.040925.xyz/api/auth-callback`（另可加本地回调用于调试）
- App 权限仅：**Contents 读写 + Metadata 只读**；Webhook 关闭
- 回调、App ID、Installation ID 等如需变更，同步更新 Vercel 环境变量并重新部署

## 构建时区（TZ）

**必须设 `TZ=Asia/Shanghai`**：Vercel → 项目 `my-hexo-blog` → Settings → Environment Variables，全部环境勾选，改后重新部署生效。GitHub Actions 侧已在 `.github/workflows/ci.yml` 的 job 级加 `env: TZ: Asia/Shanghai`。

**原因**：Hexo 的 permalink（`:year/:month/:day/:title/`）用**构建机系统时区**格式化 front-matter 日期。Vercel 与 GitHub Actions 构建机默认 UTC，与本地（Asia/Shanghai）不一致：本地构建产出 `/2026/04/24/…`，线上稳定产出 `/2026/04/23/…`（Node 双时区实测复现：同一 `date: "2026-04-24 05:12:39"`，TZ=UTC 时 permalink 落到 04-23，而页面显示时间两边都是 4 月 24 日——日期显示走 `config.timezone` 修正，permalink 不走）。受影响范围为 front-matter 时间在 00:00–08:00(+08) 的文章（当前 2 篇：`a-dream-from-nobody` 05:12、`personal-reflectio` 04:52）；夜间写作会反复踩此陷阱。permalink 规则本身不变（红线 R-7）。

**待主人决策（B14）**：已上线的两个 `/2026/04/23/` URL，在设好 TZ 重新部署后会变为 `/2026/04/24/`——旧链是否加 301 重定向保护已分享外链，待主人定；二者（重定向 / 接受线上既有形态）必须清其一，不允许长期双形并存。
