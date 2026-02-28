#!/usr/bin/env bash
set -euo pipefail

# 一键推送脚本：在仓库根（比价助手目录）执行
# 使用方法：
#   REPO_URL="https://github.com/<你的用户名>/<你的仓库名>.git" bash deploy.sh
# 可选：指定分支 BRANCH（默认 main）
#   BRANCH=main REPO_URL=... bash deploy.sh

BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-}"

if [[ -z "${REPO_URL}" ]]; then
  echo "[错误] 请设置 REPO_URL，例如： REPO_URL=\"https://github.com/USER/REPO.git\" bash deploy.sh"
  exit 1
fi

# 初始化仓库（如未初始化）
if [[ ! -d .git ]]; then
  git init
fi

# 建议设置一次用户信息（如未设置）
# git config user.name "你的名字"
# git config user.email "你的邮箱"

# 提交当前改动
git add .
if git diff --cached --quiet; then
  echo "[提示] 没有新的改动需要提交，继续推送"
else
  git commit -m "Deploy 比价助手"
fi

# 设置分支并绑定远程
git branch -M "${BRANCH}"
if git remote | grep -q '^origin$'; then
  git remote set-url origin "${REPO_URL}"
else
  git remote add origin "${REPO_URL}"
fi

# 推送到远程
git push -u origin "${BRANCH}"

echo "[完成] 已推送到 ${REPO_URL} 的 ${BRANCH} 分支。"
echo "接着到 GitHub 仓库 Settings → Pages，选择 main / root 以开启页面。"