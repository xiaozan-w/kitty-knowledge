#!/usr/bin/env bash
# 🎀 碎知识 Kitty · 一键本地启动
# 使用 Node.js 后端服务，支持文件持久化保存。
set -e

cd "$(dirname "$0")"

# 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未找到 Node.js，请先安装 Node 18+ : https://nodejs.org"
  exit 1
fi

PORT="${1:-8000}"
URL="http://localhost:${PORT}"

echo "🎀 碎知识 Kitty 启动中…"
echo "   本地地址: $URL"
echo "   数据保存在服务端 data/vault.json + 浏览器本地缓存"
echo "   按 Ctrl+C 停止服务"

# 创建数据目录
mkdir -p data

# 启动 Node 服务
node server.js &
SRV=$!

# 尝试自动打开浏览器
( sleep 1.5
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  elif command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v start >/dev/null 2>&1; then start "$URL"; fi
) >/dev/null 2>&1 &

# 捕获退出
trap 'kill $SRV 2>/dev/null; echo; echo "🎀 已停止服务。"; exit 0' INT TERM
wait "$SRV"
