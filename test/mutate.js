'use strict';
/* 变异测试工具（E-032 防复发）。
 *
 * 铁律：不得用 `git checkout --` / `git restore` 做测试后还原。那是对整个文件的
 * 回滚，会把同文件里**他人未提交的改动**一起冲掉（E-032 已实际发生一次，
 * 弄丢了主人未提交的五款游戏文案，且不可恢复）。
 *
 * 用法：
 *   const mut = require('./mutate');
 *   mut.run('描述', '文件路径', (text) => text.replace(a, b));
 * 内部：内存备份原字符串 → 应用变异 → 执行 fn → finally 写回原始字符串。
 * 若目标文件本身就有未提交改动，直接跳过并告警（变异只能在干净文件上做）。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// 目标文件是否带未提交改动（git status --porcelain 有输出即为脏）
function isDirty(rel) {
  try {
    const out = execSync(`git status --porcelain -- ${JSON.stringify(rel)}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch (e) {
    return true; // 查不到状态就当它是脏的，宁可不测也不能冲掉别人东西
  }
}

/**
 * @param {string} label   变异描述
 * @param {string} rel     相对 ROOT 的文件路径
 * @param {(text: string) => string} mutate  变异函数；返回新内容
 * @param {() => void} fn  变异后要执行的验证（通常是断言，预期它会 FAIL）
 * @returns {{ran: boolean, reason?: string}}
 */
function run(label, rel, mutate, fn) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { ran: false, reason: '文件不存在' };
  if (isDirty(rel)) {
    console.log(`  SKIP  ${label}（${rel} 有未提交改动，不做变异——E-032）`);
    return { ran: false, reason: '目标文件有未提交改动' };
  }
  const orig = fs.readFileSync(abs, 'utf8');
  const next = mutate(orig);
  if (next === orig) {
    fs.writeFileSync(abs, orig, 'utf8'); // no-op，但仍确保文件未被改动
    return { ran: false, reason: '变异未生效' };
  }
  try {
    fs.writeFileSync(abs, next, 'utf8');
    fn();
    return { ran: true, reason: '变异后断言未按预期失败（检测方法可能无效！）' };
  } finally {
    fs.writeFileSync(abs, orig, 'utf8'); // 只写回内存里的原始字符串
    const after = fs.readFileSync(abs, 'utf8');
    if (after !== orig) {
      throw new Error(`还原失败：${rel} 未被写回原内容。请立即检查并手动恢复。`);
    }
  }
}

module.exports = { run, isDirty, ROOT };
