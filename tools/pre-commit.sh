#!/bin/sh
# 提交前检查 — npm run lint 零错误才允许提交

echo "🔍 Running lint checks..."
npm run lint
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Lint 失败！请先修复：npm run lint:fix"
  exit 1
fi
echo "✅ All checks passed"
