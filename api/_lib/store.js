'use strict';
// 存储门面：根据 config.mockMode 选择 GitHub 客户端或本地 mock。
// 所有内容端点只面向本模块，不直接感知底层实现。

const config = require('./config');
const real = require('./github');
const mock = require('./mockfs');

const impl = config.mockMode ? mock : real;

module.exports = {
  getHead: () => impl.getHead(),
  getTree: () => impl.getTree(),
  getFile: (p) => impl.getFile(p),
  commitFiles: (changes, message, expectedHeadSha) => impl.commitFiles(changes, message, expectedHeadSha),
  // 单文件内容快路径：内容未变化时不产生 commit；真实模式走 Contents API
  putFileContent: (p, contentBase64, message, expectedHeadSha) => impl.putFileContent(p, contentBase64, message, expectedHeadSha),
  exchangeCode: (code, redirectUri) => impl.exchangeCode(code, redirectUri),
  getLogin: (t) => impl.getLogin(t),
  getCommitStatus: (sha) => impl.getCommitStatus(sha),
  mockMode: config.mockMode,
};
