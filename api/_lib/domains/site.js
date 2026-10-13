'use strict';
// 站点身份配置域（intro / motto / avatar / identity_words）。

const store = require('../store');
const yaml = require('../yaml');
const validate = require('../validate');
const { SITE_PATH } = require('../shared');

async function saveSite(input) {
  validate.validateSite({
    intro: input.intro, motto: input.motto, avatar: input.avatar, identity_words: input.identity_words,
  });
  const cfg = {
    intro: String(input.intro == null ? '' : input.intro).trim(),
    motto: String(input.motto == null ? '' : input.motto).trim(),
    avatar: String(input.avatar == null ? '' : input.avatar).trim(),
    identity_words: Array.isArray(input.identity_words)
      ? input.identity_words.map((s) => String(s).trim()).filter(Boolean)
      : String(input.identity_words || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
  };
  const file = (await store.getFile(SITE_PATH).catch(() => null)) || { content: '', sha: null };
  const text = yaml.updateSite(file.content, cfg);
  const r = await store.commitFiles([{ path: SITE_PATH, contentUtf8: text }], '后台：更新站点身份配置', input.expectedHeadSha);
  return { path: SITE_PATH, site: cfg, headSha: r.headSha, commitSha: r.commitSha };
}

module.exports = { saveSite };
