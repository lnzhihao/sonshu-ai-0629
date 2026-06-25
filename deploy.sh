#!/bin/bash
# ═══════════════════════════════════════════════════════
# 新媒体工具 — 服务器端一键部署脚本
# 
# 在服务器上运行 (Ubuntu 20.04+ / Debian 11+):
#   chmod +x deploy.sh
#   sudo bash deploy.sh
# 
# 这会在 5 分钟内完成:
#   1. 安装 Node.js 22 + ffmpeg + nginx + PM2
#   2. 拷贝项目到 /opt/xinmeiti-app
#   3. 安装 npm 依赖
#   4. 配置环境变量
#   5. 配置 Nginx 反向代理
#   6. 启动 PM2 守护进程
# ═══════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BOLD="\033[1m"
OK="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
INFO="${BLUE}→${NC}"

APP_DIR="/opt/xinmeiti-app"
CURRENT_DIR="$(pwd)"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    新媒体工具 · 服务器一键部署         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════
# 检查是否为 root
# ═══════════════════════════════════════════════════════
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}⚠ 建议使用 sudo 运行此脚本${NC}"
  echo "  sudo bash deploy.sh"
  echo ""
fi

# ═══════════════════════════════════════════════════════
# 第 1 步：检查系统 & 安装基础依赖
# ═══════════════════════════════════════════════════════
echo -e "${BOLD}第 1 步: 安装系统依赖${NC}"
echo "──────────────────────────────────────────"

# 1.1 更新包管理器
echo -e "${INFO} 更新 apt..."
apt update -qq 2>/dev/null || true

# 1.2 安装 Node.js 22
echo -e "${INFO} 安装 Node.js 22..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null
  apt install -y nodejs
  echo -e "  ${OK} Node.js $(node -v)"
else
  echo -e "  ${OK} Node.js $(node -v) (已安装)"
fi

# 1.3 安装 ffmpeg
echo -e "${INFO} 安装 ffmpeg..."
if ! command -v ffmpeg &> /dev/null; then
  apt install -y ffmpeg
  echo -e "  ${OK} ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
else
  echo -e "  ${OK} ffmpeg 已安装"
fi

# 1.4 安装 nginx
echo -e "${INFO} 安装 nginx..."
if ! command -v nginx &> /dev/null; then
  apt install -y nginx
  echo -e "  ${OK} nginx $(nginx -v 2>&1 | awk -F/ '{print $2}')"
else
  echo -e "  ${OK} nginx 已安装"
fi

# 1.5 安装 PM2
echo -e "${INFO} 安装 PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
  echo -e "  ${OK} PM2 $(pm2 -v)"
else
  echo -e "  ${OK} PM2 $(pm2 -v) (已安装)"
fi

echo ""

# ═══════════════════════════════════════════════════════
# 第 2 步：部署项目文件
# ═══════════════════════════════════════════════════════
echo -e "${BOLD}第 2 步: 部署项目文件${NC}"
echo "──────────────────────────────────────────"

# 2.1 检查当前目录是否有项目文件
if [ -f "$CURRENT_DIR/server.js" ] && [ -f "$CURRENT_DIR/package.json" ]; then
  echo -e "  ${OK} 找到项目文件: $CURRENT_DIR"
  SOURCE_DIR="$CURRENT_DIR"
else
  echo -e "  ${FAIL} 未找到项目文件！"
  echo "  请先上传项目到服务器，再运行此脚本。"
  echo ""
  echo "  上传方法:"
  echo "  scp -r xinmeiti-app root@服务器IP:/tmp/"
  echo "  然后: cd /tmp/xinmeiti-app && sudo bash deploy.sh"
  exit 1
fi

# 2.2 拷贝到 /opt
echo -e "${INFO} 拷贝项目到 $APP_DIR..."
if [ "$SOURCE_DIR" != "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
  cp -r "$SOURCE_DIR"/* "$APP_DIR/"
  echo -e "  ${OK} 已拷贝"
else
  echo -e "  ${OK} 已在目标位置"
fi

cd "$APP_DIR"

# ═══════════════════════════════════════════════════════
# 第 3 步：安装 npm 依赖
# ═══════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}第 3 步: 安装 npm 依赖${NC}"
echo "──────────────────────────────────────────"
echo -e "${INFO} npm install (可能需要 1-2 分钟)..."

# 只安装生产依赖 (express, cors, node-fetch, dotenv)
# Electron 不需要
npm install --production 2>&1 | tail -3

echo -e "  ${OK} npm 依赖安装完成"
echo ""

# ═══════════════════════════════════════════════════════
# 第 4 步：配置环境变量
# ═══════════════════════════════════════════════════════
echo -e "${BOLD}第 4 步: 配置环境变量${NC}"
echo "──────────────────────────────────────────"

ENV_DIR="$HOME/.xinmeiti"
ENV_FILE="$ENV_DIR/.env"
mkdir -p "$ENV_DIR"

# 4.1 检查是否有本地 .env 上传
if [ -f "$APP_DIR/.env.local" ]; then
  echo -e "  ${OK} 发现本地配置文件 .env.local"
  cp "$APP_DIR/.env.local" "$ENV_FILE"
  echo -e "  ${OK} 已导入配置"
elif [ ! -f "$ENV_FILE" ]; then
  echo -e "  ${YELLOW}⚠ 未找到配置文件，创建模板...${NC}"
  cp "$APP_DIR/.env.template" "$ENV_FILE" 2>/dev/null || \
  cat > "$ENV_FILE" << 'ENVEOF'
ARK_API_KEY=请填写你的ARK_API_Key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DEFAULT_VIDEO_MODEL=doubao-seedance-2-0-260128
DEFAULT_LLM_MODEL=doubao-1-5-pro-32k-250115
TTS_APP_ID=
TTS_ACCESS_TOKEN=
TTS_CLUSTER=volcano_mega
PORT=8787
BIND_HOST=0.0.0.0
OUTPUT_DIR=/root/xinmeiti-output
TMP_DIR=/tmp
PUBLIC_URL=http://localhost
ENVEOF
  echo ""
  echo -e "  ${YELLOW}⚠ 请立即编辑配置文件:${NC}"
  echo -e "    ${BOLD}nano $ENV_FILE${NC}"
  echo ""
  echo "  必须填写:"
  echo "    ARK_API_KEY=你的火山引擎API密钥"
  echo "  可选填写:"
  echo "    TTS_APP_ID / TTS_ACCESS_TOKEN (配音功能)"
  echo ""
  read -p "  按 Enter 继续 (稍后自行编辑)..." dummy
fi

# 4.2 创建输出目录
OUTPUT_DIR=$(grep "^OUTPUT_DIR=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "/root/xinmeiti-output")
mkdir -p "$OUTPUT_DIR"
echo -e "  ${OK} 输出目录: $OUTPUT_DIR"

# 4.3 创建日志目录
mkdir -p "$ENV_DIR/logs"
echo -e "  ${OK} 日志目录: $ENV_DIR/logs"

# 4.4 设置权限
chmod 600 "$ENV_FILE"
echo -e "  ${OK} 配置文件权限已锁定 (600)"
echo ""

# ═══════════════════════════════════════════════════════
# 第 5 步：配置 PM2
# ═══════════════════════════════════════════════════════
echo -e "${BOLD}第 5 步: 启动 PM2 服务${NC}"
echo "──────────────────────────────────────────"

# 更新 PM2 配置中的路径
if [ -f "$APP_DIR/ecosystem.config.js" ]; then
  # 用实际的 HOME 路径替换
  sed -i "s|process.env.HOME|$(dirname $ENV_DIR)|g" "$APP_DIR/ecosystem.config.js"
  sed -i "s|/home/你的用户名|$(dirname $ENV_DIR)|g" "$APP_DIR/ecosystem.config.js"
fi

# 停止旧的进程
pm2 delete xinmeiti 2>/dev/null || true

# 启动
pm2 start "$APP_DIR/ecosystem.config.js"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo -e "  ${OK} PM2 服务已启动"
echo ""

# ═══════════════════════════════════════════════════════
# 第 6 步：配置 Nginx
# ═══════════════════════════════════════════════════════
echo -e "${BOLD}第 6 步: 配置 Nginx 反向代理${NC}"
echo "──────────────────────────────────────────"

if [ -f "$APP_DIR/nginx.conf" ]; then
  # 更新 nginx 配置中的路径
  NGINX_CONFIG="/etc/nginx/sites-available/xinmeiti"
  
  # 获取实际用户主目录
  ACTUAL_HOME=$(dirname "$ENV_DIR")
  
  # 替换路径占位符
  sed "s|/home/你的用户名|$ACTUAL_HOME|g; s|/opt/xinmeiti-app|$APP_DIR|g" \
    "$APP_DIR/nginx.conf" > "$NGINX_CONFIG"
  
  # 如果有 PUBLIC_URL, 尝试提取域名
  PUBLIC_URL=$(grep "^PUBLIC_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "")
  if [ -n "$PUBLIC_URL" ] && [ "$PUBLIC_URL" != "http://localhost" ] && [ "$PUBLIC_URL" != "http://localhost:8787" ]; then
    SERVER_NAME=$(echo "$PUBLIC_URL" | sed 's|https\?://||' | sed 's|:.*||' | sed 's|/.*||')
    # 如果 SERVER_NAME 不是 IP 地址格式，替换
    if ! echo "$SERVER_NAME" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
      sed -i "s|server_name _;|server_name $SERVER_NAME;|" "$NGINX_CONFIG"
      echo -e "  ${OK} 已设置域名: $SERVER_NAME"
    fi
  fi
  
  # 启用站点
  ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/xinmeiti
  rm -f /etc/nginx/sites-enabled/default
  
  # 测试配置
  if nginx -t 2>&1; then
    systemctl reload nginx
    echo -e "  ${OK} Nginx 配置完成并已重载"
  else
    echo -e "  ${FAIL} Nginx 配置测试失败，请检查 $NGINX_CONFIG"
  fi
else
  echo -e "  ${YELLOW}⚠ 未找到 nginx.conf，跳过${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════
# 第 7 步：开放防火墙
# ═══════════════════════════════════════════════════════
echo -e "${BOLD}第 7 步: 防火墙${NC}"
echo "──────────────────────────────────────────"

if command -v ufw &> /dev/null; then
  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  echo -e "  ${OK} UFW 已放行 80/443 端口"
else
  echo -e "  ${INFO} 未检测到 UFW"
fi

echo -e "  ${INFO} 记得在云服务商控制台的安全组中放行 80 端口！"
echo ""

# ═══════════════════════════════════════════════════════
# 验证
# ═══════════════════════════════════════════════════════
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║           部署完成！                    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# 检查服务状态
echo -e "${BOLD}服务状态:${NC}"
echo "──────────────────────────────────────────"

# Node 进程
if pm2 list 2>/dev/null | grep -q "xinmeiti"; then
  echo -e "  ${OK} PM2 (xinmeiti): 运行中"
else
  echo -e "  ${FAIL} PM2: 未运行! 请查看日志: pm2 logs xinmeiti"
fi

# Nginx
if systemctl is-active --quiet nginx 2>/dev/null; then
  echo -e "  ${OK} Nginx: 运行中"
else
  echo -e "  ${FAIL} Nginx: 未运行!"
fi

# API 健康检查
sleep 2
if curl -sf http://localhost/health > /dev/null 2>&1; then
  echo -e "  ${OK} API 健康检查: 通过"
else
  echo -e "  ${FAIL} API 健康检查: 失败 (请检查 API Key 配置)"
fi

echo ""
echo -e "${BOLD}访问地址:${NC}"
echo "──────────────────────────────────────────"

# 获取服务器 IP
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$SERVER_IP" ]; then
  echo -e "  🌐 http://${SERVER_IP}"
fi

echo ""
echo -e "${BOLD}常用命令:${NC}"
echo "──────────────────────────────────────────"
echo "  pm2 status              # 查看进程状态"
echo "  pm2 logs xinmeiti       # 查看应用日志"
echo "  pm2 restart xinmeiti    # 重启应用"
echo "  systemctl reload nginx  # 重载 Nginx"
echo "  nano $ENV_FILE  # 编辑配置"
echo ""
echo -e "${BOLD}下一步:${NC}"
echo "──────────────────────────────────────────"
echo "  1. 编辑配置文件: nano $ENV_FILE"
echo "  2. 填写 ARK_API_KEY 等 API 密钥"
echo "  3. 重启服务: pm2 restart xinmeiti"
echo "  4. 打开浏览器访问"
echo ""
echo -e "${GREEN}✅ 部署完成！${NC}"
