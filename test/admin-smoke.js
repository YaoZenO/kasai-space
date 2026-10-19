'use strict';
// ============================================================
// admin-smoke — 后台服务端冒烟测试（零依赖，mock 模式）
// 覆盖：列表 / 数据模块 / site 配置 / 文章（草稿·发布·编辑）/
//       图片上传 / 回收站 / 乐观锁冲突 / CSRF / 会话 / HTTP 管线
// 运行：npm run test:admin   （fixture 落在系统临时目录，不触碰真实仓库）
// ============================================================
process.env.ADMIN_DEV_MOCK = '1';
process.env.ADMIN_DEV_FIXTURE_DIR = require('node:os').tmpdir() + '/kasai-admin-fixture-' + Date.now();
process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_GITHUB_LOGIN = 'YaoZenO';

const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// 清掉 store 缓存，确保 mock 环境变量生效后再加载
for (const k of Object.keys(require.cache)) {
  if (k.includes(`${require('node:path').sep}api${require('node:path').sep}`)) delete require.cache[k];
}

const content = require('../api/_lib/content');
const yaml = require('../api/_lib/yaml');
const store = require('../api/_lib/store');
const validate = require('../api/_lib/validate');
const handlers = {
  '/api/content-list': require('../api/content-list'),
  '/api/content-save': require('../api/content-save'),
  '/api/upload-image': require('../api/upload-image'),
  '/api/session-check': require('../api/session-check'),
  '/api/deploy-status': require('../api/deploy-status'),
  '/api/auth-callback': require('../api/auth-callback'),
};
const { sign } = require('../api/_lib/session');

let passed = 0;
function ok(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS', name);
  } catch (e) {
    console.error('  FAIL', name, '—', e.message);
    process.exitCode = 1;
  }
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

(async () => {
  // ============ 第一段：域逻辑（直接调 _lib） ============
  console.log('\n[1] 域逻辑 · mock 存储');

  let l = await content.listAll();
  // fixture 从真实仓库播种；先把三个数据模块与 site.yml 重置为已知初始态，保证测试不受仓库内容漂移影响
  // （只动临时 fixture，不触碰真实仓库）。site.yml 同样必须重置：主人的站点身份内容
  // 是真实数据、会变（intro/motto/身份词），见 E-020
  for (const m of ['projects', 'games', 'collections']) {
    const p = `source/_data/${m}.yml`;
    const f = await store.getFile(p).catch(() => ({ content: 'items: []\n', sha: null }));
    await store.commitFiles([{ path: p, contentUtf8: yaml.updateItems(f.content, []) }], `test: reset ${m}`, null);
  }
  {
    const p = 'source/_data/site.yml';
    const f = await store.getFile(p).catch(() => ({ content: '', sha: null }));
    await store.commitFiles(
      [{ path: p, contentUtf8: yaml.updateSite(f.content, { intro: '', motto: '', avatar: '', identity_words: [] }) }],
      'test: reset site',
      null
    );
  }
  l = await content.listAll();
  ok('listAll: 初始 posts≥3、三模块空、site 空配置', () => {
    assert.ok(l.posts.length >= 3);
    for (const m of ['projects', 'games', 'collections']) assert.deepStrictEqual(l.data[m], []);
    assert.strictEqual(l.site.intro, '');
    assert.deepStrictEqual(l.site.identity_words, []);
  });
  const head0 = l.headSha;
  const initialPosts = l.posts.length;

  // --- 数据模块 ---
  let r = await content.saveData({
    module: 'projects', index: null,
    item: { title: '测试项目', link: 'https://github.com/YaoZenO', desc: '冒烟测试', date: '2026-10-11' },
    expectedHeadSha: head0,
  });
  l = await content.listAll();
  ok('saveData: 新增/回读/中文与链接序列化', () => {
    assert.strictEqual(r.items, 1);
    assert.strictEqual(l.data.projects.length, 1);
    assert.strictEqual(l.data.projects[0].link, 'https://github.com/YaoZenO');
    assert.strictEqual(l.data.projects[0].date, '2026-10-11');
  });

  // --- 图片 ---
  r = await content.uploadImage({ module: 'projects', filename: '项目 封面.PNG', dataBase64: PNG_1X1.toString('base64'), expectedHeadSha: l.headSha });
  l = await content.listAll();
  ok('uploadImage: 落指定模块目录、非法文件名安全化、列表可见', () => {
    assert.match(r.path, /^source\/img\/projects\/\d{12}-.*\.png$/);
    assert.ok(!/[^\x00-\x7F]/.test(r.path));
    assert.strictEqual(l.images.length, 1);
    assert.strictEqual(l.images[0], r.path);
  });
  r = await content.saveData({
    module: 'projects', index: 0,
    item: { title: '测试项目', link: 'https://github.com/YaoZenO', desc: '冒烟测试', cover: l.images[0].replace(/^source/, ''), date: '2026-10-11' },
    expectedHeadSha: l.headSha,
  });
  l = await content.listAll();
  ok('saveData: 封面路径回填一致', () => assert.strictEqual(l.data.projects[0].cover, l.images[0].replace(/^source/, '')));

  // --- site 配置 ---
  await content.saveSite({ intro: 'Be water, my friends.', motto: 'Stay hungry.', avatar: '/img/avatar/11.jpg', identity_words: '写作\n健身\n代码', expectedHeadSha: l.headSha });
  l = await content.listAll();
  ok('saveSite: 多行 identity_words 解析为数组', () => {
    assert.strictEqual(l.site.identity_words.join(','), '写作,健身,代码');
    assert.strictEqual(l.site.motto, 'Stay hungry.');
  });
  await content.saveSite({ intro: 'Be water, my friends.', motto: '', avatar: '', identity_words: ['写作', '代码'], expectedHeadSha: l.headSha });
  l = await content.listAll();
  const siteText = (await store.getFile('source/_data/site.yml')).content;
  ok('saveSite: 二次保存值正确且注释保留', () => {
    assert.strictEqual(l.site.motto, '');
    assert.strictEqual(l.site.identity_words.join(','), '写作,代码');
    assert.ok(siteText.includes('站点身份配置'));
  });

  // --- 文章：发布 → 编辑 → 未知 front matter 保留 ---
  r = await content.publishNew({ slug: 'smoke-test-post', title: '冒烟文章', tags: '测试,后台', categories: '技术', body: '正文内容。', featured: true, cover: l.images[0].replace(/^source/, ''), expectedHeadSha: l.headSha });
  ok('publishNew: permalink 形如 /YYYY/MM/DD/slug/', () => assert.match(r.permalink, /^\/\d{4}\/\d{2}\/\d{2}\/smoke-test-post\/$/));
  let f = await content.getPostFile('source/_posts/smoke-test-post.md');
  ok('publishNew: featured/cover 写入并回读', () => {
    assert.strictEqual(f.frontmatter.featured, true);
    assert.strictEqual(f.frontmatter.cover, l.images[0].replace(/^source/, ''));
  });
  r = await content.updatePost({ path: 'source/_posts/smoke-test-post.md', title: '冒烟文章改', expectedHeadSha: r.headSha });
  f = await content.getPostFile('source/_posts/smoke-test-post.md');
  ok('updatePost: 未传 featured/cover 时原值保留、标题更新', () => {
    assert.strictEqual(f.frontmatter.featured, true);
    assert.strictEqual(f.frontmatter.cover, l.images[0].replace(/^source/, ''));
    assert.strictEqual(f.frontmatter.title, '冒烟文章改');
  });
  const raw = await store.getFile('source/_posts/smoke-test-post.md');
  await store.commitFiles([{ path: 'source/_posts/smoke-test-post.md', contentUtf8: raw.content.replace('---\n', '---\nencrypt: \n') }], 'test: add unknown fm', null);
  await content.updatePost({ path: 'source/_posts/smoke-test-post.md', title: '冒烟文章改2', expectedHeadSha: await store.getHead() });
  const afterUnknown = (await store.getFile('source/_posts/smoke-test-post.md')).content;
  ok('updatePost: 未知 front matter 行原样保留', () => assert.ok(afterUnknown.includes('encrypt:')));

  // --- 草稿 ---
  const headNow = await store.getHead();
  r = await content.saveDraft({ slug: 'smoke-draft', title: '草稿甲', tags: 'x', categories: '', body: '内容', expectedHeadSha: headNow });
  l = await content.listAll();
  ok('saveDraft: 草稿入库且标题可提取', () => {
    assert.strictEqual(l.drafts.length, 1);
    assert.strictEqual(l.drafts[0].title, '草稿甲');
  });
  r = await content.publishDraft({ slug: 'smoke-draft', expectedHeadSha: r.headSha });
  l = await content.listAll();
  ok('publishDraft: 草稿转正式文且 date 注入', () => {
    assert.strictEqual(l.drafts.length, 0);
    assert.strictEqual(l.posts.length, initialPosts + 2);
    assert.ok(/^\/\d{4}\/\d{2}\/\d{2}\/smoke-draft\/$/.test(r.permalink));
  });

  // --- P1-7：summary 模式（跳过草稿逐篇读取） ---
  const headForProbe = await store.getHead();
  await content.saveDraft({ slug: 'summary-probe', title: '摘要探测', tags: '', categories: '', body: '正文', expectedHeadSha: headForProbe });
  const full = await content.listAll();
  const brief = await content.listAll({ summary: true });

  ok('summary: posts/images/data/site/trash/headSha 与全量一致', () => {
    assert.deepStrictEqual(brief.posts, full.posts);
    assert.deepStrictEqual(brief.images, full.images);
    assert.deepStrictEqual(brief.data, full.data);
    assert.deepStrictEqual(brief.site, full.site);
    assert.deepStrictEqual(brief.trash, full.trash);
    assert.strictEqual(brief.headSha, full.headSha);
  });

  ok('summary: drafts 数量一致但不含 title（避免逐篇读取）', () => {
    assert.ok(full.drafts.length >= 1, '全量模式应有草稿');
    assert.strictEqual(brief.drafts.length, full.drafts.length);
    const fd = full.drafts.find((d) => d.name === 'summary-probe.md');
    const bd = brief.drafts.find((d) => d.name === 'summary-probe.md');
    assert.ok(fd && fd.title === '摘要探测', '全量模式草稿应有 title');
    assert.ok(bd && !('title' in bd), 'summary 模式草稿不应有 title');
    assert.deepStrictEqual(Object.keys(bd).sort(), ['name', 'path']);
  });

  // --- 回收站 ---
  l = await content.listAll();
  r = await content.deleteItem({ module: 'projects', index: 0, title: '测试项目', expectedHeadSha: l.headSha });
  l = await content.listAll();
  ok('deleteItem: 条目进回收站', () => {
    assert.strictEqual(l.data.projects.length, 0);
    assert.strictEqual(l.trash.length, 1);
    assert.strictEqual(l.trash[0].type, 'data');
  });
  await content.restore({ trashId: l.trash[0].id, expectedHeadSha: l.headSha });
  l = await content.listAll();
  ok('restore: 条目恢复到原索引', () => {
    assert.strictEqual(l.data.projects.length, 1);
    assert.strictEqual(l.data.projects[0].title, '测试项目');
  });

  // --- 乐观锁 ---
  let conflict = false;
  try {
    await content.saveData({ module: 'games', index: null, item: { title: 'x' }, expectedHeadSha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
  } catch (e) { conflict = e.conflict === true; }
  ok('乐观锁: 过期 headSha 触发 conflict', () => assert.ok(conflict));

  // --- yaml 单测 ---
  ok('yaml.parseFlowList: 引号与中文', () => assert.strictEqual(yaml.parseSite('identity_words: ["写作", 开发]').identity_words.join(','), '写作,开发'));

  // --- P1-9-A：富文本 / 数组 / 对象列表 round-trip ---
  const richText = '第一段：项目背景。\n\n包含 # 井号行、- 列表行、key: value 行。\n末行无换行';
  r = await content.saveData({
    module: 'projects', index: null,
    item: {
      slug: 'smoke-project', title: '冒烟项目', date: '2026-10-12',
      summary: '一句话简介', cover: '/img/projects/x.jpg', link: 'https://github.com/YaoZenO/x',
      tags: ['Hexo', 'Node.js'], background: richText, process: '过程内容', tech: '## 技术方案\n- A\n- B', outcome: '',
    },
    expectedHeadSha: await store.getHead(),
  });
  l = await content.listAll();
  const proj = l.data.projects.find((p) => p.slug === 'smoke-project');
  ok('projects: 富文本四段 round-trip 无损', () => {
    assert.strictEqual(proj.background, richText);
    assert.strictEqual(proj.process, '过程内容');
    assert.strictEqual(proj.tech, '## 技术方案\n- A\n- B');
    assert.strictEqual(proj.outcome, '');
    assert.deepStrictEqual(proj.tags, ['Hexo', 'Node.js']);
    assert.strictEqual(proj.slug, 'smoke-project');
  });
  const projYml = (await store.getFile('source/_data/projects.yml')).content;
  ok('projects: 序列化为块标量且可被再次解析', () => {
    assert.ok(projYml.includes('background: |-'));
    assert.ok(projYml.includes('tags: [Hexo, Node.js]'));
  });

  r = await content.saveData({
    module: 'games', index: null,
    item: {
      slug: 'smoke-game', title: '冒烟游戏', date: '2026-10-12',
      cover: '/img/games/cover.jpg', genre: '角色扮演', platform: 'PC', status: '在玩',
      summary: '一句话', gameplay: '玩法介绍长文\n第二行',
      media: ['/img/games/a.jpg', '/img/games/b.jpg'],
      video: 'https://b23.tv/xxxx',
      links: [{ label: '下载', url: 'https://a.com/x' }, { label: '试玩', url: 'https://b.com/y' }],
    },
    expectedHeadSha: await store.getHead(),
  });
  l = await content.listAll();
  const game = l.data.games.find((g) => g.slug === 'smoke-game');
  ok('games: media 数组与 links 对象数组 round-trip 无损', () => {
    assert.deepStrictEqual(game.media, ['/img/games/a.jpg', '/img/games/b.jpg']);
    assert.deepStrictEqual(game.links, [{ label: '下载', url: 'https://a.com/x' }, { label: '试玩', url: 'https://b.com/y' }]);
    assert.strictEqual(game.genre, '角色扮演');
    assert.strictEqual(game.gameplay, '玩法介绍长文\n第二行');
  });

  // --- P1-9-A：分类型校验 ---
  const rejects = [];
  const trySave = async (module, item) => {
    try { await content.saveData({ module, index: null, item, expectedHeadSha: await store.getHead() }); rejects.push('ACCEPTED'); }
    catch (e) { rejects.push(e.statusCode === 400 && e.extra && e.extra.hint ? e.extra.hint : String(e.message)); }
  };
  await trySave('projects', { title: '' });                                   // 缺标题
  await trySave('projects', { title: 'x', background: 'y' });                 // 合法（回归）
  await trySave('games', { title: 'x', links: [{ label: '下载' }] });          // links 缺 url
  await trySave('games', { title: 'x', media: ['not-a-path'] });               // media 非法路径
  await trySave('projects', { title: 'x', date: '2026/10/12' });               // 非法日期
  await trySave('collections', { title: 'x', background: 'y' });               // 跨模块未知字段
  ok('validate: 分类型校验全部按预期拒绝/放行', () => {
    assert.match(rejects[0], /title: 标题不能为空/);
    assert.strictEqual(rejects[1], 'ACCEPTED');
    assert.match(rejects[2], /links\[0\]\.url/);
    assert.match(rejects[3], /media\[0\]/);
    assert.match(rejects[4], /date: 日期格式/);
    assert.match(rejects[5], /background: 该板块不支持此字段/);
  });

  // --- P1-8：文章（post）写入校验 ---
  const postRejects = [];
  const tryPost = (body) => {
    try {
      validate.validatePost(body);
      postRejects.push('ACCEPTED');
    } catch (e) {
      postRejects.push(e.statusCode === 400 && e.extra && e.extra.hint ? e.extra.hint : String(e.message));
    }
  };
  tryPost({ kind: 'post', action: 'save-draft', slug: 'hello' });                            // 0 合法（回归）
  tryPost({ kind: 'post', action: 'save-draft', slug: 'hello', bogus: 1 });                  // 1 未知字段
  tryPost({ kind: 'post', action: 'nope', slug: 'hello' });                                  // 2 非法 action
  tryPost({ kind: 'post', action: 'save-draft' });                                           // 3 缺 slug
  tryPost({ kind: 'post', action: 'update' });                                               // 4 缺 path
  tryPost({ kind: 'post', action: 'save-draft', slug: 'Hello_World' });                      // 5 非法 slug
  tryPost({ kind: 'post', action: 'update', path: 'source/_posts/../../evil.md' });          // 6 目录穿越
  tryPost({ kind: 'post', action: 'save-draft', slug: 'hello', title: 'x'.repeat(201) });    // 7 标题过长
  tryPost({ kind: 'post', action: 'save-draft', slug: 'hello', cover: 'javascript:alert' }); // 8 非法封面
  tryPost({ kind: 'post', action: 'save-draft', slug: 'hello', body: 'x'.repeat(200001) });  // 9 正文过长
  ok('validatePost: 文章写入校验按预期拒绝/放行', () => {
    assert.strictEqual(postRejects[0], 'ACCEPTED', '合法请求被误拒');
    assert.match(postRejects[1], /bogus/);
    assert.match(postRejects[2], /action: 不支持的操作/);
    assert.match(postRejects[3], /slug: 缺少文件名/);
    assert.match(postRejects[4], /path: 缺少文章路径/);
    assert.match(postRejects[5], /slug: 仅允许小写字母/);
    assert.match(postRejects[6], /path: 文章路径不合法/);
    assert.match(postRejects[7], /title: 标题过长/);
    assert.match(postRejects[8], /cover:/);
    assert.match(postRejects[9], /body: 正文过长/);
  });

  // featured 归一化：updatePost 用 !!input.featured 取值，
  // 若前端误传字符串 "false"，!!"false" 会得到 true —— 静默反转用户意图。
  const featBody = { kind: 'post', action: 'save-draft', slug: 'a', featured: 'false' };
  validate.validatePost(featBody);
  ok('validatePost: featured 字符串 "false" 归一化为 false（避免 !! 反转）', () => {
    assert.strictEqual(featBody.featured, false);
  });

  const tagBody = { kind: 'post', action: 'save-draft', slug: 'a', tags: 'Hexo, 测试' };
  validate.validatePost(tagBody);
  ok('validatePost: tags 逗号字符串归一化为数组', () => {
    assert.deepStrictEqual(tagBody.tags, ['Hexo', '测试']);
  });

  const catBody = { kind: 'post', action: 'publish-new', slug: 'a', categories: ['随笔', '技术'] };
  validate.validatePost(catBody);
  ok('validatePost: categories 数组原样通过', () => {
    assert.deepStrictEqual(catBody.categories, ['随笔', '技术']);
  });

  // --- P1-6：模块注册表单一数据源 ---
  const registry = require('../api/_lib/modules');
  const mods = await registry.load();
  ok('registry: 从 modules.yml 读出模块定义（key/title/accent/page）', () => {
    assert.deepStrictEqual(registry.keysOf(mods), ['projects', 'games', 'collections']);
    const g = mods.find((m) => m.key === 'games');
    assert.strictEqual(g.title, '游戏');
    assert.strictEqual(g.accent, 'orange');
    assert.strictEqual(g.page, '/games/');
  });

  // 一致性护栏：modules.yml 的每个 key 都必须在 validate.MODULE_FIELDS 里有字段白名单。
  // 否则「加了模块却漏改校验白名单」会等到保存时才炸（运行时故障 → 测试期故障）。
  const missingWhitelist = registry.keysOf(mods).filter((k) => !validate.MODULE_FIELDS[k]);
  ok('registry: 每个模块都有对应字段白名单（防止加模块漏改 validate）', () => {
    assert.deepStrictEqual(missingWhitelist, [], '缺少字段白名单的模块：' + missingWhitelist.join(', '));
  });

  // 新增模块可被识别：写一条进去，saveData 应接受（不再依赖硬编码常量）
  await store.commitFiles([{
    path: registry.MODULES_PATH,
    contentUtf8: yaml.updateItems(await store.getFile(registry.MODULES_PATH).then((f) => f.content), [
      { key: 'projects', title: '项目', accent: 'yellow', page: '/projects/' },
      { key: 'games', title: '游戏', accent: 'orange', page: '/games/' },
      { key: 'collections', title: '收藏', accent: '', page: '' },
    ]),
  }], 'test: seed modules', null);
  ok('registry: 模块列表来自文件而非硬编码常量', () => {
    assert.strictEqual(typeof require('../api/_lib/content').registry.load, 'function');
    assert.ok(!('MODULES' in require('../api/_lib/content')), 'content.js 不应再导出硬编码 MODULES 常量');
  });

  // 回退：modules.yml 损坏时不得升级成全站 500
  const origModulesContent = await store.getFile(registry.MODULES_PATH).then((f) => f.content).catch(() => null);
  try {
    await store.commitFiles([{ path: registry.MODULES_PATH, contentUtf8: 'items:\n  - key: x\n坏行在这里\n' }], 'test: corrupt modules', null);
    const fallback = await registry.load();
    ok('registry: modules.yml 损坏 → 回退内置默认列表（不 500）', () => {
      assert.deepStrictEqual(registry.keysOf(fallback), ['projects', 'games', 'collections']);
    });
    // 顺带验证：modules.yml 损坏时 listAll 也仍能正常返回（不因配置问题瘫痪）
    const before = (await content.listAll()).data.projects.length;
    await content.saveData({ module: 'projects', index: null, item: { title: '回退验证' }, expectedHeadSha: await store.getHead() });
    const after = (await content.listAll()).data.projects.length;
    ok('registry: 回退后写操作与列表读取仍正常（BAD_MODULE 不应出现）', () => {
      assert.strictEqual(after, before + 1);
    });
  } finally {
    if (origModulesContent != null) {
      await store.commitFiles([{ path: registry.MODULES_PATH, contentUtf8: origModulesContent }], 'test: restore modules', null);
    }
  }

  // --- P2-5：mock 与真实存储语义对齐 ---
  // getHead：mock 的 headSha 须与真实 git sha 同格式（40 位十六进制），
  // 否则 optimistic lock 的 expectedHeadSha 比对在两种模式下语义不同。
  const headSha = await store.getHead();
  ok('store.getHead: 40 位十六进制，与真实 git sha 同格式', () => {
    assert.match(headSha, /^[0-9a-f]{40}$/);
  });

  // getCommitStatus：返回值须落在真实 GitHub Commit Status 的合法集合内
  const commitState = await store.getCommitStatus(headSha);
  ok('store.getCommitStatus: 返回值在真实合法集合内', () => {
    assert.ok(['success', 'pending', 'failure', 'error'].includes(commitState), `非法状态: ${commitState}`);
  });

  // OAuth 两段式：code → token → login，与真实流程同构（消除隐式契约）
  const mockToken = await store.exchangeCode('mock');
  const mockLogin = await store.getLogin(mockToken);
  ok('store OAuth: code → token → login 两段式与真实同构', () => {
    assert.ok(mockToken && mockToken !== 'mock', 'token 不应等于 code');
    assert.strictEqual(mockLogin, 'YaoZenO');
  });
  const otherToken = await store.exchangeCode('mock-other');
  const otherLogin = await store.getLogin(otherToken);
  ok('store OAuth: 非管理员 code → 解析出非管理员登录名', () => {
    assert.strictEqual(otherLogin, 'visitor-not-admin');
  });

  let loginErr = '';
  try { await store.getLogin('not-a-mock-token'); } catch (e) { loginErr = e.message; }
  ok('store OAuth: 无效 token 抛错而非返回假登录名', () => assert.strictEqual(loginErr, 'USER_INFO_FAILED'));

  // 注意：stamp() 精度到秒，同一次运行内想复用同一路径，必须钉住同一个 Date.now。
  // 这几次上传都钉在同一时刻，才能落到同一路径观察去重。
  const realDateNow = Date.now;
  Date.now = () => 1750000000000;
  let up1;
  let up2;
  let up3;
  let headBeforeDup;
  let headAfterDup;
  let up4;
  try {
    up1 = await content.uploadImage({ module: 'projects', filename: 'dup.png', dataBase64: PNG_1X1.toString('base64'), expectedHeadSha: await store.getHead() });
    up2 = await content.uploadImage({ module: 'projects', filename: 'dup.png', dataBase64: PNG_1X1.toString('base64'), expectedHeadSha: up1.headSha });
    headBeforeDup = await store.getHead();
    up3 = await content.uploadImage({ module: 'projects', filename: 'dup.png', dataBase64: PNG_1X1.toString('base64'), expectedHeadSha: headBeforeDup });
    headAfterDup = await store.getHead();
    up4 = await content.uploadImage({ module: 'projects', filename: 'other.png', dataBase64: PNG_1X1.toString('base64').slice(0, 40) + 'AAAA', expectedHeadSha: headAfterDup });
  } finally {
    Date.now = realDateNow;
  }
  ok('P2-1: 首次上传产生 commit（unchanged=false）', () => {
    assert.strictEqual(up1.unchanged, false);
    assert.ok(up1.commitSha, '首次应有 commitSha');
  });
  ok('P2-1: 同内容二次上传 unchanged=true 且无 commitSha', () => {
    assert.strictEqual(up2.unchanged, true);
    assert.ok(!up2.commitSha, '内容未变化不应产生 commit');
  });
  ok('P2-1: 去重上传不推进 headSha（仓库历史未增长）', () => {
    assert.strictEqual(up3.unchanged, true);
    assert.strictEqual(headAfterDup, headBeforeDup);
  });
  ok('P2-1: 不同内容仍产生新 commit', () => {
    assert.strictEqual(up4.unchanged, false);
    assert.ok(up4.commitSha, '不同内容应产生 commit');
  });

  // ============ 第二段：HTTP 管线（真实走 api 端点） ============
  console.log('\n[2] HTTP 管线 · 端点级');
  const server = http.createServer((req, res) => {
    const h = handlers[req.url.split('?')[0]];
    if (!h) { res.statusCode = 404; return res.end('{}'); }
    Promise.resolve(h(req, res)).catch((e) => { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const cookie = 'kasai_admin_dev=' + encodeURIComponent(sign({ v: 1, sub: 'YaoZenO', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, jti: 'test' }));

  const call = (method, path, body, opts = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (opts.cookie !== undefined) headers.Cookie = opts.cookie;
    else if (!opts.noCookie) headers.Cookie = cookie;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (opts.origin) headers.Origin = opts.origin;
    const rq = http.request({ port, method, path, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {}, headers: res.headers }); } catch (e) { resolve({ status: res.statusCode, body: buf, headers: res.headers }); } });
    });
    rq.on('error', reject);
    if (data) rq.write(data);
    rq.end();
  });

  let h1 = await call('POST', '/api/content-save', { kind: 'site', intro: 'x' }, { origin: 'https://evil.example' });
  ok('CSRF: 跨站 Origin 403 BAD_ORIGIN', () => assert.strictEqual(h1.status, 403));

  h1 = await call('GET', '/api/content-list', null, { noCookie: true });
  ok('AUTH: 无 Cookie 401', () => assert.strictEqual(h1.status, 401));

  h1 = await call('GET', '/api/content-list');
  ok('content-list: 200 且含 site/headSha', () => {
    assert.strictEqual(h1.status, 200);
    assert.ok(h1.body.site);
    assert.ok(h1.body.headSha);
  });
  const liveHead = h1.body.headSha;

  h1 = await call('POST', '/api/content-save', { kind: 'site', intro: '写作 / 归档 / 痕迹', motto: '', avatar: '', identity_words: ['WRITER'], expectedHeadSha: liveHead });
  ok('content-save kind=site: 200 且回显', () => {
    assert.strictEqual(h1.status, 200);
    assert.strictEqual(h1.body.site.intro, '写作 / 归档 / 痕迹');
  });

  h1 = await call('POST', '/api/upload-image', { module: 'games', filename: 'cover.png', dataBase64: PNG_1X1.toString('base64'), expectedHeadSha: h1.body.headSha });
  ok('upload-image: 200 且落 games 目录', () => {
    assert.strictEqual(h1.status, 200);
    assert.match(h1.body.path, /^source\/img\/games\//);
  });

  h1 = await call('POST', '/api/upload-image', { module: 'hacker', filename: 'x.png', dataBase64: PNG_1X1.toString('base64') });
  ok('upload-image: 非法 module 400 且带 hint', () => {
    assert.strictEqual(h1.status, 400);
    assert.strictEqual(h1.body.error, 'BAD_MODULE');
    assert.ok(h1.body.hint && h1.body.hint.length > 0, 'hint 不应为空');
  });

  // --- P0-2 错误契约：409 统一 conflict 标志 ---
  h1 = await call('POST', '/api/content-save', { kind: 'data', module: 'projects', index: null, item: { title: 'x' }, expectedHeadSha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
  ok('content-save: 过期 headSha → 409 且 conflict=true（前端弹窗契约）', () => {
    assert.strictEqual(h1.status, 409);
    assert.strictEqual(h1.body.conflict, true);
    assert.ok(h1.body.hint && h1.body.hint.length > 0);
  });

  // --- P0-2 错误契约：未知 kind → 400 带 hint ---
  h1 = await call('POST', '/api/content-save', { kind: 'nope' });
  ok('content-save: 未知 kind → 400 且带 hint', () => {
    assert.strictEqual(h1.status, 400);
    assert.strictEqual(h1.body.error, 'BAD_KIND');
    assert.ok(h1.body.hint && h1.body.hint.length > 0);
  });

  // --- P1-8：文章校验已接入端点（防止只写校验器、忘记在 content-save 接线） ---
  h1 = await call('POST', '/api/content-save', { kind: 'post', action: 'save-draft', slug: 'Hello' });
  ok('content-save: 文章非法 slug → 400 且 hint 指明字段', () => {
    assert.strictEqual(h1.status, 400);
    assert.strictEqual(h1.body.error, 'BAD_FIELD');
    assert.match(h1.body.hint, /slug/);
  });

  // --- P1-5：路由中间件（统一方法检查 / Origin / 会话 / 错误出口） ---
  h1 = await call('GET', '/api/content-save');
  ok('router: GET 访问 POST 端点 → 405 且带 hint', () => {
    assert.strictEqual(h1.status, 405);
    assert.strictEqual(h1.body.error, 'METHOD_NOT_ALLOWED');
    assert.ok(h1.body.hint && h1.body.hint.length > 0);
  });

  // content-list 改造前没有方法检查（任意方法都放行），改造后由 router 统一收敛
  h1 = await call('POST', '/api/content-list', {});
  ok('router: POST 访问 GET 端点 → 405（收敛了此前放行的口子）', () => {
    assert.strictEqual(h1.status, 405);
    assert.strictEqual(h1.body.error, 'METHOD_NOT_ALLOWED');
  });

  // deploy-status 改造前 BAD_ORIGIN 不带 hint（P0-2 的遗漏），router 统一后自动补齐
  h1 = await call('GET', '/api/deploy-status', null, { origin: 'https://evil.example' });
  ok('router: deploy-status 跨站 → 403 BAD_ORIGIN 且带 hint', () => {
    assert.strictEqual(h1.status, 403);
    assert.strictEqual(h1.body.error, 'BAD_ORIGIN');
    assert.ok(h1.body.hint && h1.body.hint.length > 0);
  });

  // session-check 保持不做 Origin 校验（只读自检，改造前即如此）
  h1 = await call('GET', '/api/session-check', null, { origin: 'https://evil.example' });
  ok('router: session-check 不做 Origin 校验（行为与改造前一致）', () => {
    assert.strictEqual(h1.status, 200);
  });

  h1 = await call('POST', '/api/content-save', { kind: 'post', action: 'update', path: 'source/_posts/../../evil.md' });
  ok('content-save: 文章路径目录穿越 → 400', () => {
    assert.strictEqual(h1.status, 400);
    assert.strictEqual(h1.body.error, 'BAD_FIELD');
  });

  // --- P1-7：端点层 ?summary=1 ---
  h1 = await call('GET', '/api/content-list?summary=1');
  ok('content-list: ?summary=1 → drafts 无 title，其余字段齐全', () => {
    assert.strictEqual(h1.status, 200);
    assert.ok(Array.isArray(h1.body.drafts));
    assert.ok(Array.isArray(h1.body.posts));
    assert.ok(h1.body.site);
    assert.ok(h1.body.data);
    assert.ok(h1.body.headSha);
    for (const d of h1.body.drafts) {
      assert.ok(!('title' in d), 'summary 模式 drafts 不应含 title');
    }
  });

  // --- P2-1：端点层 status 语义 ---
  // 用不同文件名，避开域逻辑段已上传过的同一路径（stamp 精度到秒，同刻会同名）
  const headBeforeHttp = await store.getHead();
  Date.now = () => 1750000000001;
  let upA;
  let upB;
  try {
    upA = await call('POST', '/api/upload-image', { module: 'projects', filename: 'dup-http.png', dataBase64: PNG_1X1.toString('base64'), expectedHeadSha: headBeforeHttp });
    upB = await call('POST', '/api/upload-image', { module: 'projects', filename: 'dup-http.png', dataBase64: PNG_1X1.toString('base64'), expectedHeadSha: upA.body.headSha });
  } finally {
    Date.now = realDateNow;
  }
  ok('upload-image: 首次 status=committed', () => {
    assert.strictEqual(upA.status, 200);
    assert.strictEqual(upA.body.status, 'committed');
    assert.ok(upA.body.commitSha);
  });
  ok('upload-image: 同内容二次 status=unchanged 且无 commitSha', () => {
    assert.strictEqual(upB.status, 200);
    assert.strictEqual(upB.body.status, 'unchanged');
    assert.ok(!upB.body.commitSha);
  });

  // --- P2-5：mock 与真实存储语义对齐（此前 login/status 链路完全无覆盖） ---
  // mock 的 OAuth 保持两段结构：code → token → login，与真实流程同构。
  h1 = await call('GET', '/api/auth-callback?state=st-ok&code=mock', null, { cookie: 'kasai_oauth_dev=st-ok' });
  ok('auth-callback: 合法 code → 302 且签发言 session cookie', () => {
    assert.strictEqual(h1.status, 302);
    assert.ok(Array.isArray(h1.headers['set-cookie']), '应下发 session cookie');
    const raw = (h1.headers['set-cookie'] || []).join(';');
    assert.ok(raw.includes('kasai_admin_dev='), 'cookie 名应为 kasai_admin_dev');
  });

  h1 = await call('GET', '/api/auth-callback?state=st-x&code=mock-other', null, { cookie: 'kasai_oauth_dev=st-x' });
  ok('auth-callback: 非管理员账号 → 403 且提示账号名', () => {
    assert.strictEqual(h1.status, 403);
    assert.ok(String(h1.body).includes('visitor-not-admin'), '应提示当前账号');
    assert.ok(String(h1.body).includes('不是本站管理员'), '应说明拒绝原因');
  });

  h1 = await call('GET', '/api/auth-callback?state=wrong&code=mock', null, { cookie: 'kasai_oauth_dev=right' });
  ok('auth-callback: state 与 Cookie 不一致 → 400（防 CSRF）', () => {
    assert.strictEqual(h1.status, 400);
  });

  // 链路闭环：callback 下发的 session cookie 能直接通过 session-check
  const cb = await call('GET', '/api/auth-callback?state=st-tok&code=mock', null, { cookie: 'kasai_oauth_dev=st-tok' });
  const sessCookie = (cb.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  h1 = await call('GET', '/api/session-check', null, { cookie: sessCookie });
  ok('auth-callback: 下发的 session 可通过 session-check 自检（链路闭环）', () => {
    assert.strictEqual(cb.status, 302);
    assert.strictEqual(h1.status, 200);
    assert.strictEqual(h1.body.login, 'YaoZenO');
  });

  h1 = await call('GET', '/api/session-check');
  ok('session-check: 200 且登录名为 YaoZenO', () => {
    assert.strictEqual(h1.status, 200);
    assert.strictEqual(h1.body.login, 'YaoZenO');
  });

  // --- P0-2 错误契约：500 不泄漏内部细节（损坏 yml 让解析器抛错） ---
  await store.commitFiles([{ path: 'source/_data/projects.yml', contentUtf8: 'items:\n  - title: 正常\n坏行在这里\n' }], 'test: corrupt yml', null);
  h1 = await call('POST', '/api/content-save', { kind: 'data', module: 'projects', index: null, item: { title: 'y' }, expectedHeadSha: await store.getHead() });
  ok('content-save: yml 损坏 → 500 仅 INTERNAL 无内部细节', () => {
    assert.strictEqual(h1.status, 500);
    assert.strictEqual(h1.body.error, 'INTERNAL');
    assert.ok(!('message' in h1.body), '500 body 不得包含 message');
  });

  h1 = await call('GET', '/api/deploy-status?sha=abc');
  ok('deploy-status: 200 且 available=false（mock 无配置）', () => {
    assert.strictEqual(h1.status, 200);
    assert.strictEqual(h1.body.available, false);
  });

  server.close();

  // ============ 结构锁（E-016 / E-017 防复发） ============
  // 这三条不是行为断言，而是「防退化」的结构锁：跑在 mock 上的行为测试
  // 测不出串行/并发与 headSha 回写（mock 立即 resolve），一旦有人重构时
  // 把并行改回串行、或把回写挪走，功能不会坏、测试也不会红——直到线上变慢
  // 或多图上传第二张开始 409。因此用源码结构把它们钉死。
  {
    const fs = require('node:fs');
    const read = (p) => fs.readFileSync(require('node:path').join(__dirname, '..', p), 'utf8');
    const sliceFn = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end));

    const postsSrc = read('api/_lib/domains/posts.js');
    const getPostFile = sliceFn(postsSrc, 'async function getPostFile', 'function buildPostText');
    ok('E-017: getPostFile 内容与 headSha 并行读取', () => {
      assert.ok(
        /Promise\.all\(\[store\.getFile\(path\), store\.getHead\(\)\]\)/.test(getPostFile),
        '应使用 Promise.all([store.getFile(path), store.getHead()])',
      );
      assert.ok(!/await store\.getHead\(\)/.test(getPostFile), 'headSha 不得单独 await（会退化为串行往返）');
    });

    const postFeSrc = read('source/admin/admin-post.js');
    const openFe = sliceFn(postFeSrc, 'async function openPostEditor', 'function collectEditor');
    ok('E-017: 编辑器视图切换先于数据拉取（等待期有反馈）', () => {
      const switchAt = openFe.indexOf("$('view-post-editor').hidden = false");
      const fetchAt = openFe.indexOf('await api(');
      assert.ok(switchAt > -1 && fetchAt > -1, '未找到视图切换或数据拉取');
      assert.ok(switchAt < fetchAt, '视图切换必须发生在 await api(...) 之前');
      assert.ok(/setEditorBusy\(true\)/.test(openFe), '拉取期间应置忙态');
    });

    const mediaSrc = read('source/admin/admin-media.js');
    const uploadOne = sliceFn(mediaSrc, 'async function uploadOneImage', 'export async function uploadImages');
    ok('E-016: 上传成功后回写 S.lastListSha（多图连传不冲突）', () => {
      assert.ok(
        /if \(r && r\.headSha\) S\.lastListSha = r\.headSha/.test(uploadOne),
        'uploadOneImage 必须在返回前回写 S.lastListSha，否则第二张起 expectedHeadSha 过期必 409',
      );
    });

    // E-018：后台静态资源缓存破坏。曾出现「代码已部署但浏览器仍用旧副本」，
    // 表现为主人从域名看不到任何改动。要求：index.html 的 css/js 引用与
    // admin.js 的全部 import（静态+动态）都带 ?v=，且版本号一致。
    // 版本号以 index.html 为单一事实来源动态读取——不必每次 bump 都来改测试
    // （bump 是 AGENTS.md §5.1 的常规操作，硬编码会让忘记改测试的人误判为回归失败）。
    const html = read('source/admin/index.html');
    const entryJs = read('source/admin/admin.js');
    const refsAll = html.match(/(?:href|src)="\/admin\/[^"]+"/g) || [];
    const versions = refsAll.map((r) => (r.match(/\?v=(\d{8})/) || [])[1]).filter(Boolean);
    assert.ok(versions.length >= 2, 'index.html 未找到带版本号的后台资源引用');
    const V = versions[0];
    ok('E-018: index.html 各处后台资源版本号一致', () => {
      assert.ok(versions.every((v) => v === V), `版本号不一致：${versions.join(', ')}`);
    });
    ok('E-018: index.html 的后台资源引用均带 ?v=', () => {
      refsAll.forEach((r) => assert.ok(/\?v=\d{8}"$/.test(r), `缺少缓存破坏版本号：${r}`));
    });
    ok('E-018: admin.js 全部 import 带 ?v= 且与 index.html 版本一致', () => {
      const specs = entryJs.match(/from '\.\/admin-[a-z-]+\.js[^']*'/g) || [];
      const dyn = entryJs.match(/import\('\.\/admin-[a-z-]+\.js[^']*'\)/g) || [];
      assert.ok(specs.length + dyn.length >= 6, `import 数量异常：${specs.length + dyn.length}`);
      [...specs, ...dyn].forEach((s) => assert.ok(s.includes(`?v=${V}`), `import 缺少 ?v=${V}：${s}`));
      assert.ok(html.includes(`?v=${V}`), `index.html 未使用版本号 ${V}`);
    });

    // E-026：源文件编码完整性。曾用 PowerShell 批量替换 ?v=，GBK→UTF-8 双重编码把
    // 7 个 admin 文件的中文全部写成乱码（合法 UTF-8、能跑、只有人看不懂），
    // 连用户可见的 toast / 确认弹窗文案都是乱的。这里做硬失败断言。
    ok('E-026: 后台与前台样式源文件均为无 BOM 的干净 UTF-8', () => {
      const roots = ['source/admin', 'source/css'];
      const files = [];
      for (const r of roots) {
        if (!fs.existsSync(r)) continue;
        for (const e of fs.readdirSync(r)) {
          const p = path.join(r, e);
          if (fs.statSync(p).isFile() && /\.(js|css|html)$/.test(e)) files.push(p);
        }
      }
      assert.ok(files.length >= 5, `待检文件数量异常：${files.length}`);
      for (const p of files) {
        const buf = fs.readFileSync(p);
        assert.ok(!(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF), `${p} 不应带 UTF-8 BOM（shell 写入的典型特征）`);
        const t = buf.toString('utf8');
        assert.ok(!t.includes('\uFFFD'), `${p} 含 U+FFFD 替换字符，不是合法 UTF-8`);
      }
    });
    ok('E-026: 源文件不含 mojibake（与 git HEAD 原文逐字一致）', () => {
      // 检测思路：mojibake 字符也落在 CJK 区（「列表渲染」→「鍒楄〃娓叉煋」是
      // U+9352/U+6944…），且与正常中文混排——码位范围、生僻字密度这类启发式
      // 全部不可靠（已实测误报正常文件）。可靠判据只有一个：
      // 被 shell 写坏的文件，其首行注释**一定**与仓库里原本的首行不同。
      // 做法：从 git HEAD 取原文，逐文件比对首行注释。
      const { execFileSync } = require('node:child_process');
      const roots = ['source/admin', 'source/css'];
      let checked = 0;
      for (const r of roots) {
        if (!fs.existsSync(r)) continue;
        for (const e of fs.readdirSync(r)) {
          const p = path.join(r, e);
          if (!fs.statSync(p).isFile() || !/\.(js|css|html)$/.test(e)) continue;
          let head;
          try {
            head = execFileSync('git', ['show', `HEAD:${p.split(path.sep).join('/')}`],
              { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          } catch (err) {
            continue; // HEAD 里没有（新文件），不检
          }
          const headFirst = head.split('\n')[0];
          if (!/[\u4e00-\u9fff]/.test(headFirst)) continue; // 原文无中文首行
          const curFirst = fs.readFileSync(p, 'utf8').split('\n')[0];
          // 去掉尾部 \r：Windows 上 git 可能按 core.autocrlf 检出 CRLF，
          // 与 HEAD 里的 LF 版本做严格相等会误报（本次实测踩到）。
          const norm = (s) => s.replace(/\r$/, '');
          checked += 1;
          assert.strictEqual(
            norm(curFirst), norm(headFirst),
            `${p} 首行注释与 git HEAD 不一致，疑似编码损坏。\n  当前: ${curFirst}\n  原版: ${headFirst}`
          );
        }
      }
      assert.ok(checked >= 5, `比对文件数异常：${checked}`);
    });

    // E-027：列表卡片的按钮组必须真的挂到卡片上。曾出现「编辑 / 删除」按钮
    // 都创建了、也 append 进 acts 了，但漏了 c.appendChild(acts)，
    // 结果两个按钮都不进 DOM，主人在后台看不到任何操作入口。
    // 这类「创建了但没挂上去」的缺陷，功能测试全绿也发现不了——只能靠结构断言。
    ok('E-027: 列表卡片的按钮组已挂到 DOM（acts → card）', () => {
      // 判据用行锚定而非括号配平：每个 `const acts = el(...)` 之后的 12 行内，
      // 必须出现 `c.appendChild(acts)`。卡片渲染块都很短（3~18 行），
      // 这个窗口足够覆盖，又不会跨越到下一个循环。
      // 曾用括号配平法，因为 `=>` 定位错乱会扫到无关的箭头函数，导致漏判（实测踩到）。
      const lines = read('source/admin/admin-list.js').split('\n');
      // 窗口 26 行：条目卡片块有内联的删除回调（confirmDialog + api + toast），
      // 声明到挂载实测 20 行，14 行窗口会误报（本次实测踩到）。
      const WINDOW = 26;
      let checked = 0;
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].includes("const acts = el('div', 'card-actions')")) continue;
        checked += 1;
        const seg = lines.slice(i, i + WINDOW).join('\n');
        assert.ok(
          seg.includes('c.appendChild(acts)'),
          `admin-list.js:${i + 1} 创建了 acts 按钮组但后续 ${WINDOW} 行内没有 c.appendChild(acts)，按钮不会进 DOM`
        );
      }
      assert.ok(checked >= 4, `卡片按钮组挂载点数量异常：${checked}（应为 草稿/已发布/条目/回收站 共 4 处）`);
    });
  }

  // E-036 防复发：没有 commitSha 时，部署 pill 不许再冒「已提交」。
  // 曾经前端两个调用点硬编码传 null，后端返回的真 sha 被丢弃，pill 永久停在
  // 「已提交」却从不轮询部署状态——页面上的状态是伪造的，主人无从判断是否已上线。
  ok('E-036 无 commitSha 时部署 pill 不冒「已提交」', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'source/admin/admin-deploy.js'), 'utf8');
    const start = src.indexOf('export function setDeployCommitted');
    assert.ok(start !== -1, 'admin-deploy.js 找不到 setDeployCommitted');
    const body = src.slice(start, src.indexOf('\n}', start));
    const hits = (body.match(/已提交/g) || []).length;
    assert.strictEqual(hits, 1, `无 sha 分支也在冒「已提交」：函数内出现 ${hits} 次（应只在有 sha 分支出现 1 次）`);
    assert.match(body, /待部署/, '无 sha 分支应如实写明「待部署」，而不是伪装成已提交');
  });

  // 快捷入口「发一条」（2026-10-19，主人拍板「先③再①」的③）
  ok('快捷入口 DOM 与接线齐全（FAB + 菜单 + 5 个菜单项）', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'source/admin/index.html'), 'utf8');
    assert.ok(html.includes('id="fab-compose"'), 'index.html 缺少 FAB 按钮');
    assert.ok(html.includes('id="fab-menu"'), 'index.html 缺少 FAB 菜单容器');
    const quick = fs.readFileSync(path.join(__dirname, '..', 'source/admin/admin-quick.js'), 'utf8');
    for (const k of ['post', 'projects', 'games', 'collections', 'images']) {
      assert.ok(quick.includes(`key: '${k}'`), `快捷菜单缺少「${k}」项`);
    }
    const js = fs.readFileSync(path.join(__dirname, '..', 'source/admin/admin.js'), 'utf8');
    assert.ok(/admin-quick\.js\?v=/.test(js), 'admin.js 没有 import admin-quick.js');
    assert.ok(/initQuick\(\)/.test(js), 'admin.js 没有调用 initQuick()');
  });

  ok('快捷入口不含自己的保存逻辑（只导航到既有新建表单）', () => {
    // 边界断言：聚合发布页（①）做成前，快捷入口不得复制出第二套提交流程。
    // 保存必须继续走 admin-post.js / admin-item.js 的 hooks.openPostEditor / openItemEditor。
    const quick = fs.readFileSync(path.join(__dirname, '..', 'source/admin/admin-quick.js'), 'utf8');
    assert.ok(!/await api\(/.test(quick), 'admin-quick.js 里出现了 api 调用——保存逻辑不应在这里');
    assert.ok(!/content-save/.test(quick), 'admin-quick.js 里出现了 content-save——不得自建提交流程');
    assert.ok(/hooks\.openPostEditor/.test(quick) && /hooks\.openItemEditor/.test(quick),
      'admin-quick.js 没有复用既有的 openPostEditor / openItemEditor 钩子');
  });

  console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
