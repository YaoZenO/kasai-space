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
  // fixture 从真实仓库播种；先把三个数据模块重置为空，保证测试不受仓库内容漂移影响
  // （只动临时 fixture，不触碰真实仓库）
  for (const m of ['projects', 'games', 'collections']) {
    const p = `source/_data/${m}.yml`;
    const f = await store.getFile(p).catch(() => ({ content: 'items: []\n', sha: null }));
    await store.commitFiles([{ path: p, contentUtf8: yaml.updateItems(f.content, []) }], `test: reset ${m}`, null);
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
    if (!opts.noCookie) headers.Cookie = cookie;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (opts.origin) headers.Origin = opts.origin;
    const rq = http.request({ port, method, path, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {} }); } catch (e) { resolve({ status: res.statusCode, body: buf }); } });
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

  h1 = await call('POST', '/api/content-save', { kind: 'post', action: 'update', path: 'source/_posts/../../evil.md' });
  ok('content-save: 文章路径目录穿越 → 400', () => {
    assert.strictEqual(h1.status, 400);
    assert.strictEqual(h1.body.error, 'BAD_FIELD');
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

  console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
