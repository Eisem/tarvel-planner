#!/bin/bash
set -e

echo "=== Trip Planner 部署脚本 ==="
echo "时间: $(date)"
echo ""

# 配置
APP_DIR="/opt/trip-planner"
GIT_REPO="https://github.com/Eisem/tarvel-planner.git"
BRANCH="main"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，正在安装..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js 版本: $NODE_VERSION"

# 检查 Git
if ! command -v git &> /dev/null; then
    echo "❌ Git 未安装，正在安装..."
    apt-get update && apt-get install -y git
fi

echo "✅ Git 版本: $(git --version)"

# 创建目录
echo ""
echo "=== 创建应用目录 ==="
mkdir -p $APP_DIR

# 拉取代码
echo ""
echo "=== 拉取最新代码 ==="
cd $APP_DIR

if [ -d ".git" ]; then
    git pull origin $BRANCH
else
    git clone -b $BRANCH $GIT_REPO .
fi

# 检查并加载环境变量
echo ""
echo "=== 检查环境变量 ==="
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "⚠️  已创建 .env 文件，请编辑 $APP_DIR/.env 填写配置"
        echo "   然后重新运行此脚本"
        exit 1
    else
        echo "❌ 未找到 .env 文件"
        exit 1
    fi
fi

source .env

# 安装依赖
echo ""
echo "=== 安装依赖 ==="

echo "安装后端依赖..."
cd $APP_DIR/apps/server
npm install

echo "安装前端依赖..."
cd $APP_DIR/apps/web
npm install

# 构建
echo ""
echo "=== 构建应用 ==="

echo "构建前端..."
cd $APP_DIR/apps/web
npm run build

echo "构建后端..."
cd $APP_DIR/apps/server
npx prisma generate
npm run build

# 执行数据库迁移
echo ""
echo "=== 执行数据库迁移 ==="
npx prisma migrate deploy

# 停止旧进程
echo ""
echo "=== 停止旧进程 ==="
pkill -f "node dist/main.js" || true
sleep 2

# 启动服务
echo ""
echo "=== 启动服务 ==="
cd $APP_DIR/apps/server
export PORT=5000
export NODE_ENV=production
nohup node dist/main.js > $APP_DIR/app.log 2>&1 &
sleep 3

# 检查服务状态
if curl -s http://localhost:5000 > /dev/null; then
    echo ""
    echo "✅ 部署成功！"
    echo "访问地址: http://$(curl -s ifconfig.me):5000"
    echo ""
    echo "日志文件: $APP_DIR/app.log"
    echo "查看日志: tail -f $APP_DIR/app.log"
else
    echo ""
    echo "❌ 服务启动失败，请查看日志: $APP_DIR/app.log"
    tail -20 $APP_DIR/app.log
fi
