'use strict';
// 环境配置解析。所有敏感值只来自服务端环境变量，绝不写入代码或前端。

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'YaoZenO';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'kasai-space';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

// 本地 mock 模式：仅在显式设置 ADMIN_DEV_MOCK=1 且非 Vercel 生产环境时生效
const isProductionEnv = process.env.VERCEL_ENV === 'production' || process.env.VERCEL === '1';
const mockMode = process.env.ADMIN_DEV_MOCK === '1' && !isProductionEnv;

module.exports = {
  REPO_OWNER,
  REPO_NAME,
  REPO_FULL: `${REPO_OWNER}/${REPO_NAME}`,
  BRANCH,

  mockMode,
  fixtureDir: process.env.ADMIN_DEV_FIXTURE_DIR || '',

  GITHUB_APP_ID: process.env.GITHUB_APP_ID || '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
  GITHUB_PRIVATE_KEY: (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  GITHUB_INSTALLATION_ID: process.env.GITHUB_INSTALLATION_ID || '',

  ADMIN_GITHUB_LOGIN: process.env.ADMIN_GITHUB_LOGIN || 'YaoZenO',
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  SESSION_TTL_SECONDS: parseInt(process.env.SESSION_TTL_SECONDS || '604800', 10), // 7 天
  SESSION_COOKIE_NAME: mockMode ? 'kasai_admin_dev' : '__Host-kasai_admin',

  VERCEL_TOKEN: process.env.VERCEL_TOKEN || '',
  VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID || '',
  VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID || '',

  // 上传限制
  MAX_IMAGE_BYTES: 4 * 1024 * 1024,
  IMAGE_EXT: ['jpg', 'jpeg', 'png', 'webp', 'gif'],

  requiredForRealMode() {
    const missing = [];
    if (!this.GITHUB_APP_ID) missing.push('GITHUB_APP_ID');
    if (!this.GITHUB_CLIENT_ID) missing.push('GITHUB_CLIENT_ID');
    if (!this.GITHUB_CLIENT_SECRET) missing.push('GITHUB_CLIENT_SECRET');
    if (!this.GITHUB_PRIVATE_KEY) missing.push('GITHUB_PRIVATE_KEY');
    if (!this.GITHUB_INSTALLATION_ID) missing.push('GITHUB_INSTALLATION_ID');
    if (!this.SESSION_SECRET) missing.push('SESSION_SECRET');
    return missing;
  },
};
