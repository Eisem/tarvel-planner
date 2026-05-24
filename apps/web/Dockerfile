# 前端 Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci

# 复制源码
COPY src/ ./src/
COPY index.html ./
COPY tsconfig.json ./
COPY vite.config.ts ./

# 创建生产环境变量文件（高德密钥等）
ARG VITE_AMAP_JS_KEY
ARG VITE_AMAP_WEB_KEY
ENV VITE_AMAP_JS_KEY=$VITE_AMAP_JS_KEY
ENV VITE_AMAP_WEB_KEY=$VITE_AMAP_WEB_KEY
ENV VITE_API_BASE_URL=/api/v1
ENV VITE_SOCKET_URL=/

# 构建（Vite 会读取 ENV 中的 VITE_ 变量）
RUN npm run build

# 使用 nginx serving 静态文件
FROM nginx:alpine

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
