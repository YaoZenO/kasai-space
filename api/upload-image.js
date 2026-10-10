'use strict';
// POST /api/upload-image —— 图片上传提交进仓库（Vercel 函数本体不落盘）
// {module:'posts'|'projects'|'games'|'collections', filename, dataBase64, expectedHeadSha}
const { requireSession } = require('./_lib/session');
const { json, readJson, respondError, originAllowed } = require('./_lib/http');
const content = require('./_lib/content');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    if (!originAllowed(req)) return json(res, 403, { error: 'BAD_ORIGIN' });
    requireSession(req);
    const body = await readJson(req, 8 * 1024 * 1024);
    const r = await content.uploadImage(body);
    return json(res, 200, Object.assign({ ok: true, status: 'committed' }, r));
  } catch (e) {
    return respondError(res, e);
  }
};
