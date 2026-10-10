'use strict';
// GET /api/deploy-status?sha=<commitSha> —— 部署状态（主通道 Vercel REST API，备用 GitHub Status）
// 返回原始状态列表，由前端结合自身 commitSha 判定：
//   已提交 ≠ 已发布；只有 READY 且 sha 匹配才算部署成功。
const { requireSession } = require('./_lib/session');
const { json, respondError, originAllowed } = require('./_lib/http');
const config = require('./_lib/config');
const store = require('./_lib/store');

module.exports = async (req, res) => {
  try {
    if (!originAllowed(req)) return json(res, 403, { error: 'BAD_ORIGIN' });
    requireSession(req);
    const url = new URL(req.url, 'http://x');
    const sha = url.searchParams.get('sha') || '';

    // 主通道：Vercel REST API
    if (config.VERCEL_TOKEN && config.VERCEL_PROJECT_ID) {
      let qs = `projectId=${encodeURIComponent(config.VERCEL_PROJECT_ID)}&target=production&limit=8`;
      if (config.VERCEL_TEAM_ID) qs += `&teamId=${encodeURIComponent(config.VERCEL_TEAM_ID)}`;
      const r = await fetch(`https://api.vercel.com/v6/deployments?${qs}`, {
        headers: { Authorization: `Bearer ${config.VERCEL_TOKEN}` },
      });
      if (r.ok) {
        const data = await r.json();
        const deployments = (data.deployments || []).map((d) => ({
          sha: (d.meta && d.meta.githubCommitSha) || '',
          state: d.readyState, // QUEUED | BUILDING | READY | ERROR | CANCELED
          url: d.url ? `https://${d.url}` : '',
          createdAt: d.createdAt,
        }));
        return json(res, 200, { source: 'vercel', available: true, deployments, ourSha: sha });
      }
      // 掉落到备用通道
    }

    // 备用通道：GitHub Commit Status（Vercel GitHub App 集成会回写状态）
    if (sha && !config.mockMode) {
      try {
        const state = await store.getCommitStatus(sha); // success | pending | failure
        const map = { success: 'READY', pending: 'BUILDING', failure: 'ERROR', error: 'ERROR' };
        return json(res, 200, {
          source: 'github',
          available: true,
          deployments: [{ sha, state: map[state] || 'BUILDING', url: '', createdAt: null }],
          ourSha: sha,
        });
      } catch (e) {
        /* 继续兜底 */
      }
    }

    return json(res, 200, { source: 'none', available: false, deployments: [], ourSha: sha });
  } catch (e) {
    return respondError(res, e);
  }
};
