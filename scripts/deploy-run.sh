#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== 启动 Trip Planner 服务 ==="

# 使用 docker-compose 启动所有服务（DB + Server + Web）
docker-compose up -d

# 等待服务启动
sleep 5

# 检查服务状态
docker-compose ps

echo "=== 服务已启动 ==="
echo "前端: http://localhost:5000"
echo "后端 API: http://localhost:5001/api"
