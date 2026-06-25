#!/bin/bash
# ═══════════════════════════════════════════════════════
# 新媒体工具 — Mac 端打包上传脚本
# 
# 使用方法:
#   chmod +x deploy-pack.sh
#   ./deploy-pack.sh
# 
# 这会:
#   1. 打包项目代码 (排除 node_modules)
#   2. 生成 .env 配置文件
#   3. 提示 SCP 上传命令
# ═══════════════════════════════════════════════════════

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PACK_DIR="/tmp/xinmeiti-deploy"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PACK_NAME="xinmeiti-app-${TIMESTAMP}.tar.gz"

echo "📦 新媒体工具 — 准备部署包"
echo "============================"
echo ""

# 1. 清理旧的打包
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR/xinmeiti-app"

# 2. 拷贝文件 (排除 node_modules 和不需要的)
echo "📋 拷贝项目文件..."
cd "$APP_DIR"

# 核心文件
cp \
  server.js \
  prod-server.js \
  main.js \
  preload.js \
  package.json \
  package-lock.json \
  ecosystem.config.js \
  nginx.conf \
  "$PACK_DIR/xinmeiti-app/"

# 保留目录结构
mkdir -p "$PACK_DIR/xinmeiti-app/src"
cp -r src/renderer "$PACK_DIR/xinmeiti-app/src/"
[ -d assets ] && cp -r assets "$PACK_DIR/xinmeiti-app/" || true

# 如果有 deploy.sh 也带上
if [ -f deploy.sh ]; then
  cp deploy.sh "$PACK_DIR/xinmeiti-app/"
fi

# 3. 生成 .env 模板
echo "🔑 生成环境变量模板..."
cat > "$PACK_DIR/xinmeiti-app/.env.template" << 'ENVEOF'
# ═══════════════════════════════════════════════
# 新媒体工具 — 生产环境配置
# 部署到服务器后，复制此文件并填写真实值
# ═══════════════════════════════════════════════

# 火山引擎 ARK (豆包大模型) — 必须
ARK_API_KEY=你的ARK_API_Key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DEFAULT_VIDEO_MODEL=doubao-seedance-2-0-260128
DEFAULT_LLM_MODEL=doubao-1-5-pro-32k-250115

# 火山引擎 TTS (语音合成) — 可选
TTS_APP_ID=
TTS_ACCESS_TOKEN=
TTS_CLUSTER=volcano_mega

# TikTok OAuth — 可选
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=

# 生产环境配置
PORT=8787
BIND_HOST=0.0.0.0
OUTPUT_DIR=/home/你的用户名/xinmeiti-output
TMP_DIR=/tmp
PUBLIC_URL=http://你的服务器IP或域名
ENVEOF

# 4. 读取并合并本地 .env 文件 (如果存在)
echo "🔍 检查本地配置..."
ENV_FILE="$HOME/.xinmeiti/.env"
if [ -f "$ENV_FILE" ]; then
  echo "   ✓ 发现本地 .env 文件"
  # 读取本地 API Key 注入到服务器配置
  while IFS='=' read -r key value; do
    case "$key" in
      ARK_API_KEY|ARK_BASE_URL|DEFAULT_VIDEO_MODEL|DEFAULT_LLM_MODEL|TTS_APP_ID|TTS_ACCESS_TOKEN|TTS_CLUSTER)
        if [ -n "$value" ]; then
          echo "   → 注入 $key"
        fi
        ;;
    esac
  done < "$ENV_FILE"

  # 直接复制 API 相关键值
  cp "$ENV_FILE" "$PACK_DIR/xinmeiti-app/.env.local"
  echo "   ✓ 已复制本地配置 (请部署时检查)"
else
  echo "   ⚠ 未找到本地配置文件，部署后需要手动配置"
fi

# 5. 打包
echo ""
echo "🗜️  打包中..."
cd "$PACK_DIR"
tar czf "$PACK_NAME" xinmeiti-app/

PACK_SIZE=$(du -sh "$PACK_NAME" | cut -f1)
echo "   ✓ 打包完成: $PACK_SIZE"

# 6. 显示上传命令
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║           打包完成！                    ║"
echo "╠══════════════════════════════════════════╣"
echo "║  文件: $PACK_NAME"
echo "║  大小: $PACK_SIZE"
echo "║  位置: /tmp/xinmeiti-deploy/"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  上传到服务器:                           ║"
echo "║                                          ║"
echo "║  scp $PACK_NAME \\"
echo "║    root@你的服务器IP:/tmp/               ║"
echo "║                                          ║"
echo "║  然后 SSH 登录服务器:                    ║"
echo "║  ssh root@你的服务器IP                   ║"
echo "║  cd /tmp                                 ║"
echo "║  tar xzf $PACK_NAME   ║"
echo "║  cd xinmeiti-app                         ║"
echo "║  bash deploy.sh                          ║"
echo "║                                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "📌 下一步:"
echo "   1. 购买服务器 (推荐腾讯云轻量 2核2G Ubuntu 22.04)"
echo "   2. 复制上面 scp 命令，替换「你的服务器IP」"
echo "   3. 上传后 SSH 登录，运行 bash deploy.sh"
