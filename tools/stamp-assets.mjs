// Astro 构建完成后：压缩 CSS → 盖 ?v=hash → 改写 HTML/CSS（逐字沿用现站机制）

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampAll } from './lib/stamp.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');

stampAll(DIST);
console.log('[stamp-assets] 已完成:', path.relative(ROOT, DIST));
