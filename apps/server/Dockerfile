# 后端 Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖（只安装 prod）
COPY package*.json ./
RUN npm ci --only=production

# 复制源码和 prisma
COPY prisma/ ./prisma/
COPY src/ ./src/
COPY tsconfig.json ./

# 生成 Prisma Client
RUN npx prisma generate

# 构建
RUN npm run build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 安装生产依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制 Prisma schema 和迁移文件
COPY prisma/ ./prisma/

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 生成 Prisma Client（运行时需要）
RUN npx prisma generate

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# 启动命令：自动迁移 + 启动服务
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
