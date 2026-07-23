#!/bin/sh
# 安装 Git hooks
# 运行方式：sh tools/setup-hooks.sh

cp tools/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "✅ pre-commit hook installed"
