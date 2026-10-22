/* 站点身份设置：首页身份域（介绍 / 座右铭 / 头像 / 身份词）的编辑与保存。
 * 依赖 core 与 media。
 */
'use strict';

import { S, $, api, toast, guard, reloadList, hooks , handleOpError, markDirty, clearDirty } from './admin-core.js?v=20261023';
import { uploadOneImage, sitePath } from './admin-media.js?v=20261023';

// 设置 tab 直接展示编辑器视图（无列表态）；进入时填充表单
export function renderSiteEditor(box, site) {
  clearDirty();
  const filled = ['intro', 'motto', 'avatar'].filter((k) => site && site[k]).length + ((site && site.identity_words && site.identity_words.length) ? 1 : 0);
  fillSiteEditor(site);
  $('view-list').hidden = true;
  $('view-site-editor').hidden = false;
  $('site-hint').textContent = `已配置 ${filled}/4 · 保存后自动提交，部署完成后首页生效`;
}

function fillSiteEditor(site) {
  $('site-intro').value = site.intro || '';
  $('site-motto').value = site.motto || '';
  $('site-avatar').value = site.avatar || '';
  $('site-identity').value = (site.identity_words || []).join('\n');
}

export function init() {
  // 设置表单的文本输入标记未保存（切 tab / 关页面前拦截用，2026-10-21）。
  // 视图可见性守卫见 E-046：设置编辑器未展示时不得置脏。
  document.addEventListener('input', (e) => {
    if (!$('view-site-editor').hidden && e.target.closest && e.target.closest('#view-site-editor')) markDirty();
  });

  $('btn-save-site').onclick = guard(async () => {
    const body = {
      kind: 'site',
      intro: $('site-intro').value,
      motto: $('site-motto').value,
      avatar: $('site-avatar').value,
      identity_words: $('site-identity').value,
      expectedHeadSha: S.lastListSha,
    };
    const r = await api('/api/content-save', { method: 'POST', body });
    // 2026-10-21：回传真实 commitSha（此前硬编码 null，pill 无构建跟踪）
    hooks.setDeployCommitted(r.commitSha || null);
    clearDirty();
    toast('站点身份已保存并提交');
    await reloadList();
  });

  // 设置页头像直传（存入 /img/avatar/，成功后回填路径）
  $('btn-site-avatar-upload').onclick = guard(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        await uploadOneImage(file, 'avatar');
        await reloadList();
        const mine = (S.data.images || []).filter((p) => p.startsWith('source/img/avatar/')).sort();
        const latest = mine[mine.length - 1];
        $('site-avatar').value = latest ? sitePath(latest) : '';
        toast('头像上传成功，路径已回填');
      } catch (e) {
        handleOpError(e);
      }
    };
    input.click();
  });
}
