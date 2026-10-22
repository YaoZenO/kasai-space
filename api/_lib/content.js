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

async function listAll(opts) {
  // opts.summary=1 时跳过草稿逐篇读取（列表只给文件名，标题在打开编辑器时按需取）
  const summary = !!(opts && opts.summary);

  // tree 必须先取到（路径清单决定后续读哪些文件）；其余全部并行。
  // 改造前这里是一条串行 await 链：3 个数据 yml + site + manifest + 每篇草稿各自排队，
  // admin 首屏要等 6+ 次串行 GitHub 请求；现在压缩为 tree → 一批并发 → 返回。
  const [tree, modKeys, headSha] = await Promise.all([
    store.getTree(),
    registry.load().then((list) => registry.keysOf(list)),
    store.getHead(),
  ]);
  const paths = tree.filter((e) => e.type === 'blob').map((e) => e.path);
  const posts_ = [];
  const drafts = [];
  const images = [];
  for (const p of paths) {
    if (p.startsWith(`${POSTS_DIR}/`) && p.endsWith('.md')) posts_.push({ path: p, name: p.slice(POSTS_DIR.length + 1) });
    else if (p.startsWith(`${DRAFTS_DIR}/`) && p.endsWith('.md')) drafts.push({ path: p, name: p.slice(DRAFTS_DIR.length + 1) });
    else if (p.startsWith(`${IMG_DIR}/`) && /\.(jpe?g|png|webp|gif)$/i.test(p)) images.push(p);
  }

  const [dataFiles, siteFile, trashFile, draftsFull] = await Promise.all([
    Promise.all(modKeys.map((m) => {
      const p = `${DATA_DIR}/${m}.yml`;
      return paths.includes(p) ? store.getFile(p) : null;
    })),
    paths.includes(SITE_PATH) ? store.getFile(SITE_PATH) : null,
    // 与原实现一致：manifest 读取或解析失败都静默降级为空回收站
    paths.includes(MANIFEST_PATH) ? store.getFile(MANIFEST_PATH).catch(() => null) : null,
    summary
      ? drafts
      : Promise.all(drafts.map(async (d) => {
        const f = await store.getFile(d.path);
        return Object.assign({}, d, { title: posts.extractTitle(f.content, d.name), sha: f.sha });
      })),
  ]);

  const data = {};
  modKeys.forEach((m, i) => {
    const f = dataFiles[i];
    data[m] = f ? yaml.parseItems(f.content) : [];
  });
  const site = siteFile
    ? yaml.parseSite(siteFile.content)
    : { intro: '', motto: '', avatar: '', identity_words: [] };
  let trash = [];
  if (trashFile) {
    try {
      trash = JSON.parse(trashFile.content).items || [];
    } catch (e) {
      trash = [];
    }
  }
  return { posts: posts_, drafts: draftsFull, data, site, images: images.sort(), trash, headSha, mockMode: store.mockMode };
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
  unpublishPost: postDomain.unpublishPost,
  saveData: dataDomain.saveData,
  saveSite: siteDomain.saveSite,
  deleteItem: trashDomain.deleteItem,
  restore: trashDomain.restore,
  uploadImage: imageDomain.uploadImage,
};
