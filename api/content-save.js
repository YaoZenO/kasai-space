'use strict';
// POST /api/content-save —— 统一保存入口
// {kind:'post', action:'save-draft'|'publish-draft'|'publish-new'|'update'|'unpublish', ...}
// {kind:'data', module, index, item, expectedHeadSha}
// {kind:'site', intro, motto, avatar, identity_words, expectedHeadSha}
// 返回统一带 commitSha（内容已提交）与 headSha，发布状态由 /api/deploy-status 单独判定。
const { route } = require('./_lib/router');
const { HttpError } = require('./_lib/http');
const content = require('./_lib/content');
// data / site 的校验在 content.js 内部（saveData / saveSite）；
// post 无统一入口，校验放在本端点的分支里，保证三个 kind 都有把关。
const validate = require('./_lib/validate');

const committed = (r) => Object.assign({ ok: true, status: 'committed' }, r);

module.exports = route(async ({ body }) => {
  const kind = body.kind;
  if (kind === 'post') {
    validate.validatePost(body); // 原地校验并归一化（featured / tags / categories）
    if (body.action === 'save-draft') return committed(await content.saveDraft(body));
    if (body.action === 'publish-draft') return committed(await content.publishDraft(body));
    if (body.action === 'publish-new') return committed(await content.publishNew(body));
    if (body.action === 'update') return committed(await content.updatePost(body));
    if (body.action === 'unpublish') return committed(await content.unpublishPost(body));
    throw new HttpError(400, 'BAD_ACTION', { hint: '不支持的操作类型' });
  }
  if (kind === 'data') return committed(await content.saveData(body));
  if (kind === 'site') return committed(await content.saveSite(body));
  throw new HttpError(400, 'BAD_KIND', { hint: '不支持的保存类型' });
}, { methods: ['POST'] });
