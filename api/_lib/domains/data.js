'use strict';
// 数据模块域（projects / games / collections）。
// 字段白名单由 modules.yml 单一数据源驱动，详见 ../modules.js。

const store = require('../store');
const yaml = require('../yaml');
const validate = require('../validate');
const registry = require('../modules');
const { HttpError } = require('../http');
const { assertModule, normTags, DATA_DIR } = require('../shared');

async function saveData(input) {
  const m = assertModule(input.module, await registry.load());
  // 先按模块字段白名单校验原始入参（未知字段拒绝），再拷贝白名单内字段
  validate.validateItem(m, input.item || {});
  const fields = validate.MODULE_FIELDS[m];
  const item = {};
  for (const k of fields) {
    const v = input.item ? input.item[k] : undefined;
    if (v === undefined || v === null) continue;
    if (k === 'tags') item[k] = normTags(v);
    else if (k === 'media') item[k] = (Array.isArray(v) ? v : [v]).map((s) => String(s).trim()).filter(Boolean);
    else if (k === 'links') item[k] = (Array.isArray(v) ? v : []).map((l) => ({ label: String(l.label || '').trim(), url: String(l.url || '').trim() })).filter((l) => l.label && l.url);
    else item[k] = String(v).trim();
  }
  const p = `${DATA_DIR}/${m}.yml`;
  const file = (await store.getFile(p).catch(() => null)) || { content: 'items: []\n', sha: null };
  const items = yaml.parseItems(file.content);
  const idx = input.index === null || input.index === undefined ? -1 : Number(input.index);
  if (idx === -1) items.push(item);
  else {
    if (idx < 0 || idx >= items.length) throw new HttpError(400, 'BAD_INDEX', { hint: '条目序号不存在' });
    items[idx] = item;
  }
  const text = yaml.updateItems(file.content, items);
  const r = await store.commitFiles([{ path: p, contentUtf8: text }], `后台：${idx === -1 ? '新增' : '更新'}${m}条目「${item.title}」`, input.expectedHeadSha);
  return { path: p, items: items.length, headSha: r.headSha, commitSha: r.commitSha };
}

module.exports = { saveData };
