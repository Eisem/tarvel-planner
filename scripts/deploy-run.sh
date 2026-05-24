#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== 启动 Trip Planner 服务 ==="

# 清理 5000 端口残留进程
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# 启动后端（同时托管前端静态文件）
cd apps/server
export PORT=5000
export NODE_ENV=production
exec node dist/main.js
