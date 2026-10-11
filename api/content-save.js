'use strict';
// POST /api/content-save —— 统一保存入口
// {kind:'post', action:'save-draft'|'publish-draft'|'publish-new'|'update', ...}
// {kind:'data', module, index, item, expectedHeadSha}
// {kind:'site', intro, motto, avatar, identity_words, expectedHeadSha}
// 返回统一带 commitSha（内容已提交）与 headSha，发布状态由 /api/deploy-status 单独判定。
const { requireSession } = require('./_lib/session');
const { json, readJson, respondError, originAllowed } = require('./_lib/http');
const content = require('./_lib/content');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED', hint: '仅支持 POST 请求' });
    if (!originAllowed(req)) return json(res, 403, { error: 'BAD_ORIGIN', hint: '跨站请求被拒绝' });
    requireSession(req);
    const body = await readJson(req);
    const kind = body.kind;
    if (kind === 'post') {
      let r;
      if (body.action === 'save-draft') r = await content.saveDraft(body);
      else if (body.action === 'publish-draft') r = await content.publishDraft(body);
      else if (body.action === 'publish-new') r = await content.publishNew(body);
      else if (body.action === 'update') r = await content.updatePost(body);
      else return json(res, 400, { error: 'BAD_ACTION', hint: '不支持的操作类型' });
      return json(res, 200, Object.assign({ ok: true, status: 'committed' }, r));
    }
    if (kind === 'data') {
      const r = await content.saveData(body);
      return json(res, 200, Object.assign({ ok: true, status: 'committed' }, r));
    }
    if (kind === 'site') {
      const r = await content.saveSite(body);
      return json(res, 200, Object.assign({ ok: true, status: 'committed' }, r));
    }
    return json(res, 400, { error: 'BAD_KIND', hint: '不支持的保存类型' });
  } catch (e) {
    return respondError(res, e);
  }
};
