#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== 构建 Trip Planner 应用 ==="

# 1. 构建前端
echo "构建前端..."
cd apps/web
npm install
npm run build
cd ../..

# 2. 安装后端依赖并生成 Prisma Client
echo "构建后端..."
cd apps/server
npm install
npx prisma generate
npm run build
cd ../..

echo "=== 构建完成 ==="
