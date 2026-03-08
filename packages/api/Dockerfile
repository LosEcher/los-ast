# los-ast API 服务 Docker 镜像
# 构建步骤:
# 1. 从项目根目录构建: docker build -f packages/api/Dockerfile -t los-ast-api .
# 2. 运行: docker run -p 3000:3000 los-ast-api

# ============================================
# 阶段 1: 依赖安装
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# 复制 workspace 配置
COPY package.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/

# 安装依赖
RUN npm install --omit=dev

# ============================================
# 阶段 2: 构建
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 TypeScript 编译器
RUN npm install -g typescript

# 复制源代码
COPY . .

# 安装所有依赖（包含 devDependencies）
RUN npm install

# 构建 TypeScript
RUN cd packages/api && tsc
RUN cd packages/shared && tsc

# ============================================
# 阶段 3: 运行
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# 安装 curl 用于健康检查
RUN apk add --no-cache curl

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 复制生产依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules

# 复制构建产物
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/core/src ./packages/core/src

# 复制 package.json
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY package.json ./

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/healthz/live || exit 1

# 启动命令
CMD ["node", "packages/api/dist/server.js"]
