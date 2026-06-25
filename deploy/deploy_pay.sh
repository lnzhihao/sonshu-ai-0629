#!/bin/bash
set -e
APP=/opt/xinmeiti-app
CFG=/root/.xinmeiti
TS=$(date +%Y%m%d_%H%M%S)
BK=/root/xm-backup-$TS
mkdir -p "$BK" "$CFG" "$APP/src/renderer"

echo "—— 1/4 备份当前线上版本 ——"
cp "$APP/server.js"                  "$BK/" 2>/dev/null || true
cp "$APP/src/renderer/index.html"    "$BK/" 2>/dev/null || true
cp "$APP/src/renderer/admin.html"    "$BK/" 2>/dev/null || true
echo "✅ 已备份到 $BK"

echo "—— 2/4 部署新文件 ——"
cp ./server.js   "$APP/server.js"
cp ./index.html  "$APP/src/renderer/index.html"
cp ./admin.html  "$APP/src/renderer/admin.html"
cp ./pay-qr.jpg  "$CFG/pay-qr.jpg"
echo "✅ server.js / index.html / admin.html / 收款码 已更新"

echo "—— 3/4 写入配置（仅当不存在）——"
ENV="$CFG/.env"; touch "$ENV"
grep -q '^PAY_CONTACT='    "$ENV" || printf 'PAY_CONTACT=微信 13352774776\n' >> "$ENV"
grep -q '^ADMIN_PASSWORD=' "$ENV" || printf 'ADMIN_PASSWORD=songshu2024\n'   >> "$ENV"
echo "✅ PAY_CONTACT / ADMIN_PASSWORD 就绪"

echo "—— 4/4 重启服务 ——"
pm2 restart xinmeiti 2>/dev/null || pm2 restart all
sleep 2

echo "—— 验证 ——"
echo -n "支付信息接口: "; curl -s http://127.0.0.1/api/pay/manual | head -c 300; echo
curl -s -o /dev/null -w "收款码图片: HTTP %{http_code}\n" http://127.0.0.1/api/pay/qr
echo ""
echo "🎉 部署完成！"
echo "   网站：http://159.75.130.35   （客户开会员）"
echo "   后台：http://159.75.130.35/admin.html   密码 songshu2024"
