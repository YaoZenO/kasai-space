'use strict';
// 端点守卫的统一入口，消除各端点复制的样板代码：
//   方法检查 → Origin 校验（CSRF）→ 会话校验 → 读取 JSON → 统一错误出口
//
// 用法：
//   module.exports = route(async ({ req, body, session }) => {
//     return await content.someOp(body)      // 返回值统一以 200 输出
//   }, { methods: ['POST'] })
//
// 约定：
//   - handler 的返回值统一以 200 输出；返回 undefined 表示 handler 已自行写响应。
//   - methods    未指定则不限制方法（默认行为与改造前的 GET 端点一致）
//   - origin:false  关闭 Origin 校验（仅限无副作用的自检端点，如 session-check）
//   - auth:false    关闭会话校验（OAuth 相关端点走自己的显式流程）
//   - body:false    跳过 readJson（GET 端点）
//   - maxBytes      自定义请求体上限（仅 upload-image 需要，保持其既有语义）

const { requireSession } = require('./session');
const { json, readJson, respondError, originAllowed } = require('./http');

function route(handler, opts) {
  const o = opts || {};
  return async function (req, res) {
    try {
      if (o.methods && !o.methods.includes(req.method)) {
        return json(res, 405, { error: 'METHOD_NOT_ALLOWED', hint: `仅支持 ${o.methods.join(' / ')} 请求` });
      }
      if (o.origin !== false && !originAllowed(req)) {
        return json(res, 403, { error: 'BAD_ORIGIN', hint: '跨站请求被拒绝' });
      }
      const session = o.auth === false ? null : requireSession(req);
      const body = o.body === false ? null : await readJson(req, o.maxBytes);
      const out = await handler({ req, res, body, session });
      if (out === undefined) return undefined;
      return json(res, 200, out);
    } catch (e) {
      return respondError(res, e);
    }
  };
}

module.exports = { route };
