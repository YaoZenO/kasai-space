'use strict';
// 内容模块注册表 —— 单一数据源为 source/_data/modules.yml。
//
// 设计取舍：
// - 不做缓存。后台写操作是人工低频操作，一次额外读取可接受；
//   缓存会带来「改了配置却不生效」的困惑，也让测试难以断言回退行为。
// - 任何异常（文件缺失、YAML 损坏、字段缺失）一律回退内置默认列表，
//   绝不让配置文件的问题升级成全站 500。

const yaml = require('./yaml');
const store = require('./store');

const MODULES_PATH = 'source/_data/modules.yml';

const DEFAULT_MODULES = [
  { key: 'projects', title: '项目', accent: 'yellow', page: '/projects/' },
  { key: 'games', title: '游戏', accent: 'orange', page: '/games/' },
  { key: 'collections', title: '收藏', accent: '', page: '' },
];

function normalize(items) {
  const list = (items || [])
    .filter((it) => it && it.key)
    .map((it) => ({
      key: String(it.key),
      title: String(it.title || it.key),
      accent: String(it.accent || ''),
      page: String(it.page || ''),
    }));
  return list.length ? list : DEFAULT_MODULES;
}

// 读取模块列表；失败回退默认。不抛异常。
async function load() {
  let raw;
  try {
    const f = await store.getFile(MODULES_PATH);
    raw = f && f.content;
  } catch (e) {
    return DEFAULT_MODULES;
  }
  if (!raw) return DEFAULT_MODULES;
  try {
    return normalize(yaml.parseItems(raw));
  } catch (e) {
    return DEFAULT_MODULES;
  }
}

function keysOf(list) {
  return (list || DEFAULT_MODULES).map((m) => m.key);
}

module.exports = { MODULES_PATH, DEFAULT_MODULES, load, keysOf, normalize };
