#!/usr/bin/env bash
# =============================================================================
# LanDrop-WebUI — 构建 & 部署脚本
# =============================================================================
# 用法:
#   ./deploy/deploy.sh                构建并输出到 dist/
#   ./deploy/deploy.sh --preview      构建后启动本地预览 (http://localhost:3000)
#   ./deploy/deploy.sh --install      构建并安装到系统 (Nginx)
#   ./deploy/deploy.sh --clean        清理 dist/
#   ./deploy/deploy.sh --help         查看帮助
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist"

# ── 颜色 ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
print_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
print_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ── 帮助 ────────────────────────────────────────────────────────────────
show_help() {
    cat <<EOF
${CYAN}LanDrop-WebUI 构建 & 部署脚本${NC}

用法:  $(basename "$0") [选项]

选项:
  --preview           构建后启动本地预览服务器 (http://localhost:3000)
  --install [域名]    构建并安装到系统 Nginx（默认域名 _）
  --clean             清理 dist/ 目录
  --help              显示此帮助信息

示例:
  $(basename "$0")
  $(basename "$0") --preview
  $(basename "$0") --install chat.example.com
  $(basename "$0") --clean
EOF
    exit 0
}

# ── 清理 ────────────────────────────────────────────────────────────────
clean() {
    if [ -d "$DIST_DIR" ]; then
        print_info "清理 $DIST_DIR ..."
        rm -rf "$DIST_DIR"
        print_ok "已清理"
    else
        print_info "没有需要清理的内容"
    fi
    exit 0
}

# ── 构建 ────────────────────────────────────────────────────────────────
build() {
    # 前置检查
    if ! command -v node &>/dev/null; then
        print_error "Node.js 未安装，请先安装 Node.js (>=18)"
        exit 1
    fi

    # 安装依赖
    if [ ! -d "$PROJECT_DIR/node_modules" ]; then
        print_info "检测到 node_modules 不存在，正在安装依赖 ..."
        cd "$PROJECT_DIR" && npm install
        print_ok "依赖安装完成"
    fi

    print_info "开始构建 ..."
    cd "$PROJECT_DIR" && npm run build
    print_ok "构建完成！"

    # 输出统计
    echo ""
    print_info "构建产物："
    echo "  📁  $DIST_DIR"
    echo ""
    echo "  $(ls -lh "$DIST_DIR/index.html" | awk '{print $5 "  index.html"}')"
    local asset_count
    asset_count=$(ls -1 "$DIST_DIR/assets/" 2>/dev/null | wc -l)
    echo "  $asset_count 个资源文件 in $DIST_DIR/assets/"
    echo ""
}

# ── 预览（端口 3000）────────────────────────────────────────────────────
preview() {
    build
    print_info "启动预览服务器 (http://localhost:3000) ..."
    echo ""
    npx vite preview --host 0.0.0.0 --port 3000 --root "$PROJECT_DIR"
}

# ── 安装到系统 Nginx ────────────────────────────────────────────────────
install() {
    local domain="${1:-_}"
    local nginx_root="/var/www/landrop"
    local nginx_conf="/etc/nginx/sites-available/landrop"
    local nginx_enabled="/etc/nginx/sites-enabled/landrop"

    build

    # 创建目标目录
    print_info "创建目标目录 $nginx_root ..."
    sudo mkdir -p "$nginx_root"
    print_ok "目录已创建"

    # 复制构建产物
    print_info "复制构建产物到 $nginx_root ..."
    sudo cp -r "$DIST_DIR"/* "$nginx_root/"
    print_ok "文件已复制"

    # 生成并安装 Nginx 配置
    print_info "生成 Nginx 配置 ..."
    local tmp_conf
    tmp_conf=$(mktemp)
    sed "s/server_name _;/server_name ${domain};/" "$SCRIPT_DIR/landrop-nginx.conf" > "$tmp_conf"
    sudo cp "$tmp_conf" "$nginx_conf"
    rm -f "$tmp_conf"
    print_ok "Nginx 配置已写入 $nginx_conf"

    # 启用站点
    if [ ! -L "$nginx_enabled" ]; then
        sudo ln -sf "$nginx_conf" "$nginx_enabled"
        print_ok "站点已启用"
    fi

    # 测试并重载
    print_info "测试 Nginx 配置 ..."
    if sudo nginx -t; then
        sudo systemctl reload nginx || sudo nginx -s reload 2>/dev/null || true
        print_ok "Nginx 已重载"
    else
        print_error "Nginx 配置测试失败，请手动检查 $nginx_conf"
        exit 1
    fi

    echo ""
    print_ok "部署完成！"
    echo "  静态文件:  $nginx_root"
    echo "  Nginx 配置: $nginx_conf"
    echo "  访问地址:  http://${domain}/"
    echo ""
    print_info "提示：用户在登录页展开「服务器配置」填入后端地址即可使用。"
}

# ── 参数解析 ────────────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
    build
    print_info "部署方式："
    echo ""
    echo "  方式 A — 本地预览:  $(basename "$0") --preview"
    echo "  方式 B — 系统安装:  sudo $(basename "$0") --install [域名]"
    echo ""
    exit 0
fi

ACTION=""
DOMAIN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --preview)  ACTION="preview"; shift ;;
        --install)  ACTION="install"; shift; DOMAIN="${1:-}"; if [[ "$DOMAIN" == --* || -z "$DOMAIN" ]]; then DOMAIN="_"; else shift; fi ;;
        --clean)    clean ;;
        --help)     show_help ;;
        *)          print_error "未知选项: $1"; show_help ;;
    esac
done

case "$ACTION" in
    preview) preview ;;
    install) install "$DOMAIN" ;;
    *)       build ;;
esac
