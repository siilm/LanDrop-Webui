# =============================================================================
# LanDrop-WebUI — Docker 镜像构建文件
# =============================================================================
# 构建镜像:
#   docker build -t landrop-webui .
#
# 运行容器（默认端口 3000）:
#   docker run -d --name landrop-webui -p 3000:3000 landrop-webui
#
# 自定义端口（通过环境变量 PORT）:
#   docker run -d --name landrop-webui -p 8080:3000 -e PORT=3000 landrop-webui
#
# 用户登录后，在「服务器配置」中填入后端 API 地址即可使用。
# =============================================================================

# ── Stage 1: 构建阶段 ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件，充分利用 Docker 构建缓存层
COPY package*.json ./
RUN npm ci

# 复制源码并构建
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: 运行阶段 ──────────────────────────────────────────────────────
FROM nginx:alpine

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置模板和容器入口脚本
COPY deploy/landrop-docker-nginx.conf /etc/nginx/conf.d/default.conf.template
COPY deploy/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 默认端口 3000，可通过 -e PORT=xxxx 覆盖
EXPOSE 3000
ENV PORT=3000

STOPSIGNAL SIGQUIT

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
