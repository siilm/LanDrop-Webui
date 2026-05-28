#!/bin/sh
# =============================================================================
# LanDrop-WebUI — Docker 容器入口脚本
# =============================================================================
# 在容器启动时，使用 envsubst 将 nginx 配置模板中的 ${PORT} 替换为
# 环境变量 PORT 的值（默认 3000），然后启动 nginx。
# =============================================================================

set -e

PORT="${PORT:-3000}"

# 将 PORT 导出为环境变量，供 envsubst 使用
export PORT

# 渲染 nginx 配置模板
envsubst '${PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# 执行主进程（nginx）
exec "$@"
