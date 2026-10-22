/* 部署状态：提交后的构建跟踪轮询与状态 pill。
 * 依赖 core；入口在 init() 登记到 core.hooks。
 */
'use strict';

import { S, $, api, toast, hooks } from './admin-core.js?v=20261024';

// 轮询策略：指数退避 8s → 16s → 32s（封顶），总上限 3 分钟。
// 固定 8s × 45 次既拖慢又浪费：Vercel 一次构建通常 1-2 分钟，
// 后期高频轮询毫无意义，退避后请求次数从 45 次降到 7 次左右。
const POLL_FIRST_MS = 8000;
const POLL_MAX_MS = 32000;
const POLL_TIMEOUT_MS = 180000;

// commitSha 为空表示「本次保存没有可跟踪的 commit」（data/site 类保存不走 publish 链路，
// 或后端未回传）。此时不能只点亮「已提交」就收工——pill 会永久停在这个状态，
// 主人无法判断内容到底有没有上线。改为直接显示「已保存，待部署」，并给出自查入口。
export function setDeployCommitted(commitSha) {
  stopPolling();
  const pill = $('deploy-pill');
  pill.hidden = false;
  if (commitSha) {
    pill.dataset.state = 'committed';
    pill.textContent = '已提交';
    startPolling(commitSha);
    return;
  }
  pill.dataset.state = 'committed';
  pill.textContent = '已保存，待部署（无构建跟踪）';
}

function startPolling(commitSha) {
  stopPolling();
  S.pollStartedAt = Date.now();
  S.lastDeployUrl = '';
  schedulePoll(commitSha, POLL_FIRST_MS);
}

// 用 setTimeout 递归而非 setInterval：间隔要随次数增长，必须每次重新调度
function schedulePoll(commitSha, delay) {
  S.pollTimer = setTimeout(async () => {
    if (Date.now() - S.pollStartedAt >= POLL_TIMEOUT_MS) {
      stopPolling();
      setPill('committed', '已提交（构建跟踪超时）');
      return;
    }
    try {
      const st = await api('/api/deploy-status?sha=' + encodeURIComponent(commitSha));
      if (!st.available) {
        setPill('committed', '已提交（部署状态查询未配置）');
      } else {
        const mine = (st.deployments || []).find((x) => x.sha === commitSha);
        if (mine && mine.url) S.lastDeployUrl = mine.url;
        if (!mine) {
          setPill('committed', '已提交，等待构建');
        } else if (mine.state === 'READY') {
          stopPolling();
          setPill('ready', '部署成功 ↗');
          toast('部署成功，站点已更新');
          return; // 终态，不再调度
        } else if (mine.state === 'ERROR' || mine.state === 'CANCELED') {
          stopPolling();
          setPill('error', '部署失败 ↗');
          toast('部署失败，点击状态查看日志');
          return; // 终态，不再调度
        } else if (mine.state === 'BUILDING' || mine.state === 'INITIALIZING') {
          setPill('building', '构建中');
        } else {
          setPill('building', '构建排队中');
        }
      }
    } catch (e) {
      /* 下次重试 */
    }
    schedulePoll(commitSha, Math.min(delay * 2, POLL_MAX_MS));
  }, delay);
}

export function stopPolling() {
  if (S.pollTimer) clearTimeout(S.pollTimer);
  S.pollTimer = null;
}

function setPill(state, text) {
  const pill = $('deploy-pill');
  pill.hidden = false;
  pill.dataset.state = state;
  pill.textContent = text;
}

export function init() {
  // pill 可点击：有部署链接时新开 Vercel 部署页看构建日志（P2-4）
  $('deploy-pill').onclick = () => {
    if (S.lastDeployUrl) {
      window.open(S.lastDeployUrl, '_blank', 'noopener');
    } else {
      toast('暂无部署链接（部署状态查询未配置）');
    }
  };

  hooks.setDeployCommitted = setDeployCommitted;
  hooks.stopPolling = stopPolling;
}
