'use strict';
// 内容域编排层：组合子域并对外暴露统一入口。
// 子域实现见 ./domains/{posts,data,site,images,trash}.js；共享常量与工具见 ./shared.js。
// 不变量：
//  - 已发布文章的文件名与 date 字段永不因编辑而改变（永久链接稳定）
//  - 草稿位于仓库根 _drafts/（source/ 之外），回收站位于 _trash/（source/ 之外），均不进入 Hexo 构建
//  - 所有变更都是单次原子提交；manifest 与内容同 commit 更新

const store = require('./store');
const yaml = require('./yaml');
const posts = require('./posts');
const registry = require('./modules');
const postDomain = require('./domains/posts');
const dataDomain = require('./domains/data');
const siteDomain = require('./domains/site');
const imageDomain = require('./domains/images');
const trashDomain = require('./domains/trash');
const shared = require('./shared');

const { POSTS_DIR, DRAFTS_DIR, IMG_DIR, DATA_DIR, SITE_PATH, MANIFEST_PATH } = shared;

async function listAll() {
  const tree = await store.getTree();
  const paths = tree.filter((e) => e.type === 'blob').map((e) => e.path);
  const posts_ = [];
  const drafts = [];
  const images = [];
  for (const p of paths) {
    if (p.startsWith(`${POSTS_DIR}/`) && p.endsWith('.md')) posts_.push({ path: p, name: p.slice(POSTS_DIR.length + 1) });
    else if (p.startsWith(`${DRAFTS_DIR}/`) && p.endsWith('.md')) drafts.push({ path: p, name: p.slice(DRAFTS_DIR.length + 1) });
    else if (p.startsWith(`${IMG_DIR}/`) && /\.(jpe?g|png|webp|gif)$/i.test(p)) images.push(p);
  }
  const data = {};
  for (const m of registry.keysOf(await registry.load())) {
    const p = `${DATA_DIR}/${m}.yml`;
    const entry = paths.includes(p);
    data[m] = entry ? yaml.parseItems((await store.getFile(p)).content) : [];
  }
  // 站点身份配置（site.yml 不存在时返回空配置）
  const site = paths.includes(SITE_PATH)
    ? yaml.parseSite((await store.getFile(SITE_PATH)).content)
    : { intro: '', motto: '', avatar: '', identity_words: [] };
  let trash = [];
  if (paths.includes(MANIFEST_PATH)) {
    try {
      trash = JSON.parse((await store.getFile(MANIFEST_PATH)).content).items || [];
    } catch (e) {
      trash = [];
    }
  }
  // 草稿标题
  const draftsFull = await Promise.all(
    drafts.map(async (d) => {
      const f = await store.getFile(d.path);
      return Object.assign({}, d, { title: posts.extractTitle(f.content, d.name), sha: f.sha });
    })
  );
  return { posts: posts_, drafts: draftsFull, data, site, images: images.sort(), trash, headSha: await store.getHead(), mockMode: store.mockMode };
}

// 对外契约保持不变：调用方无需感知内部已拆分。
module.exports = {
  // 模块列表不再以常量导出：改由 registry（source/_data/modules.yml）动态读取，
  // 用法 await content.registry.load() / content.registry.keysOf(list)
  registry,
  MANIFEST_PATH,
  POSTS_DIR,
  DRAFTS_DIR,
  IMG_DIR,
  shared,
  nowCst: shared.nowCst,
  slugify: shared.slugify,
  normTags: shared.normTags,
  listAll,
  getPostFile: postDomain.getPostFile,
  saveDraft: postDomain.saveDraft,
  publishDraft: postDomain.publishDraft,
  publishNew: postDomain.publishNew,
  updatePost: postDomain.updatePost,
  saveData: dataDomain.saveData,
  saveSite: siteDomain.saveSite,
  deleteItem: trashDomain.deleteItem,
  restore: trashDomain.restore,
  uploadImage: imageDomain.uploadImage,
};
