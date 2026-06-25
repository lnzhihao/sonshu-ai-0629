/**
 * 新媒体工具 — 生产环境服务器入口
 * 
 * 使用方法:
 *   node prod-server.js
 *   或: PORT=8787 OUTPUT_DIR=/data/videos PUBLIC_URL=https://xxx.com node prod-server.js
 * 
 * 环境变量:
 *   PORT        - 监听端口 (默认 8787)
 *   BIND_HOST   - 监听地址 (默认 0.0.0.0)
 *   OUTPUT_DIR  - 成品库目录 (默认 ~/xinmeiti-output)
 *   TMP_DIR     - 临时文件目录 (默认 /tmp)
 *   PUBLIC_URL  - 公网访问地址 (默认 http://127.0.0.1:PORT)
 *   STATIC_DIR  - 前端文件目录 (默认 ./src/renderer)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ═══════════════════════════════════════════════════════
// 设置生产环境变量
// ═══════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT, 10) || 8787;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(os.homedir(), 'xinmeiti-output');
const TMP_DIR = process.env.TMP_DIR || '/tmp';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`;

// 确保目录存在
[OUTPUT_DIR, TMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 设置进程环境 — server.js 会读取这些变量
process.env.OUTPUT_DIR = OUTPUT_DIR;
process.env.TMP_DIR = TMP_DIR;
process.env.PUBLIC_URL = PUBLIC_URL;
process.env.NODE_ENV = 'production';

console.log('╔══════════════════════════════════════════╗');
console.log('║       新媒体工具 · 生产环境启动         ║');
console.log('╠══════════════════════════════════════════╣');
console.log(`║  端口:    ${PORT}`);
console.log(`║  绑定:    ${BIND_HOST}`);
console.log(`║  成品库:  ${OUTPUT_DIR}`);
console.log(`║  公网URL: ${PUBLIC_URL}`);
console.log('╚══════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════
// 启动 API 服务器
// ═══════════════════════════════════════════════════════
const { startServer } = require('./server');

startServer(PORT, BIND_HOST).then((apiPort) => {
  console.log(`✅ 服务器已启动: http://${BIND_HOST}:${apiPort}`);
  console.log(`📂 成品库目录: ${OUTPUT_DIR}`);
  console.log('');
  console.log('💡 下一步:');
  console.log('   1. 配置 Nginx 反向代理 (参考 nginx.conf)');
  console.log('   2. 使用 PM2 守护进程: pm2 start ecosystem.config.js');
  console.log('   3. 浏览器访问: 你的域名或IP');
}).catch((err) => {
  console.error('❌ 启动失败:', err.message);
  process.exit(1);
});
