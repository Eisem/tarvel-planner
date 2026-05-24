#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== 构建 Trip Planner 应用 ==="

# 使用 docker-compose 构建所有服务
docker-compose build

echo "=== 构建完成 ==="
