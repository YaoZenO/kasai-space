#!/usr/bin/env bash
# E-087 防复发：构建验证三件套。
# 用法：npm run build; bash tools/verify-build.sh
#   ① 构建退出码必须为 0（$1 传入，缺省则只查产物）
#   ② public 产物文件数 ≥ 900（2026-11-02 全量基线 947）
#   ③ 关键页存在：首页 + 城市榜索引 + 若干代表页
# stdout 的「N files generated」不可信（E-037 / E-087），以本脚本实测为准。

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_EXIT="${1:-0}"
FAIL=0

if [ "$BUILD_EXIT" != "0" ]; then
  echo "FAIL ① 构建退出码为 $BUILD_EXIT（要求 0）"
  FAIL=1
else
  echo "PASS ① 构建退出码 0"
fi

COUNT=$(find "$ROOT/public" -type f 2>/dev/null | wc -l)
if [ "$COUNT" -lt 900 ]; then
  echo "FAIL ② 产物文件数 $COUNT < 900——可能 clean 半途而废或 generate 未真正输出（E-087）"
  FAIL=1
else
  echo "PASS ② 产物文件数 $COUNT"
fi

for p in "index.html" "cityrank/index.html" "cityrank/waimaoshiqiangchengshi/index.html" "about/index.html"; do
  if [ -f "$ROOT/public/$p" ] && [ -s "$ROOT/public/$p" ]; then
    echo "PASS ③ public/$p 存在且非空"
  else
    echo "FAIL ③ public/$p 缺失或 0 字节（E-029 / E-087）"
    FAIL=1
  fi
done

if [ "$FAIL" != "0" ]; then
  echo "VERIFY-BUILD: FAILED"
  exit 1
fi
echo "VERIFY-BUILD: OK"
