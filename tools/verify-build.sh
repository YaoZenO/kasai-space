#!/usr/bin/env bash
# E-087 防复发：构建验证三件套。
# 用法：npm run build; bash tools/verify-build.sh [$BUILD_EXIT]
#   ① 构建退出码必须为 0（$1 传入，缺省则只查产物）
#   ② dist 下 HTML 页数 ≥ 590（2026-11-14 全量基线 623，留 5% 余量，与旧口径 947→900 一致）
#   ③ 关键页存在且非空
# 构建自身打印的计数不可信（E-037 / E-087 / E-029），以本脚本实测为准。
#
# E-161：本脚本原先检查 $ROOT/public，那是 Hexo 时代的产物目录。724fc3f 之后构建输出
# 改到 dist/，public/ 变成残留（304 个文件、连 index.html 都没有），本脚本于是永远报
# FAIL、且因为不在 npm test 链里而无人发现。此后口径一律以 dist/ 为准。
#
# 注意：Astro 构建收尾（stamp-assets.mjs）会重写 dist 内的资源，必须等构建进程退出后
# 再跑本脚本，否则会读到写了一半的产物、出现假 MISS。

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
BUILD_EXIT="${1:-0}"
FAIL=0

if [ "$BUILD_EXIT" != "0" ]; then
  echo "FAIL ① 构建退出码为 $BUILD_EXIT（要求 0）"
  FAIL=1
else
  echo "PASS ① 构建退出码 0"
fi

if [ ! -d "$DIST" ]; then
  echo "FAIL ② dist/ 不存在——构建未产出（E-087）"
  echo "VERIFY-BUILD: FAILED"
  exit 1
fi

# 只数 HTML：Astro 的「N page(s) built」把端点算法与 HTML 页数不完全对齐（2026-11-14 报
# 622 routes / 623 个 .html），拿它当基线口径含糊，所以用能代表「页面漏生成」的 HTML 计数。
COUNT=$(find "$DIST" -type f -name '*.html' 2>/dev/null | wc -l)
if [ "$COUNT" -lt 590 ]; then
  echo "FAIL ② HTML 页数 $COUNT < 590——可能构建半途而废或路由未真正输出（E-087）"
  FAIL=1
else
  echo "PASS ② HTML 页数 $COUNT"
fi

# E-108 保留 city/library 两个索引页：它们是模板改动最频繁的两页，渲染抛错时会写出
# 0 字节文件、构建照样报成功（E-029）。E-161 追加 games/festivals/zodiac：模块索引页
# 同样是被重构波及的高频页。
for p in \
  "index.html" \
  "city/index.html" \
  "library/index.html" \
  "cityrank/index.html" \
  "cityrank/waimaoshiqiangchengshi/index.html" \
  "about/index.html" \
  "games/index.html" \
  "festivals/index.html" \
  "holidays/index.html" \
  "zodiac/index.html"; do
  if [ -f "$DIST/$p" ] && [ -s "$DIST/$p" ]; then
    echo "PASS ③ dist/$p 存在且非空"
  else
    echo "FAIL ③ dist/$p 缺失或 0 字节（E-029 / E-087）"
    FAIL=1
  fi
done

if [ "$FAIL" != "0" ]; then
  echo "VERIFY-BUILD: FAILED"
  exit 1
fi
echo "VERIFY-BUILD: OK"
