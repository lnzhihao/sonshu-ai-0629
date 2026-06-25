/**
 * PM2 进程管理配置 — 新媒体工具
 * 
 * 使用方法:
 *   启动: pm2 start ecosystem.config.js
 *   状态: pm2 status
 *   日志: pm2 logs xinmeiti
 *   重启: pm2 restart xinmeiti
 *   停止: pm2 stop xinmeiti
 *   删除: pm2 delete xinmeiti
 * 
 * 环境变量在 .env.production 或通过 PM2 env 字段配置
 */

module.exports = {
  apps: [{
    // 应用名称
    name: 'xinmeiti',

    // 启动脚本
    script: 'prod-server.js',
    cwd: __dirname,

    // 进程数量: 1 个 (单机模式)
    instances: 1,
    exec_mode: 'fork',

    // 环境变量
    env: {
      NODE_ENV: 'production',
      PORT: 8787,
      BIND_HOST: '0.0.0.0',
      OUTPUT_DIR: process.env.HOME + '/xinmeiti-output',
      TMP_DIR: '/tmp',
      // 部署后替换为你的域名: https://你的域名
      PUBLIC_URL: 'http://localhost:8787',
    },

    // 自动重启
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,

    // 内存限制: 超过 512MB 自动重启
    max_memory_restart: '512M',

    // 日志
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: process.env.HOME + '/.xinmeiti/logs/error.log',
    out_file: process.env.HOME + '/.xinmeiti/logs/out.log',
    merge_logs: true,

    // 监听文件变化自动重启 (生产环境建议关闭)
    watch: false,

    // 优雅退出: 给服务器 10 秒时间处理完当前请求
    kill_timeout: 10000,
  }]
};
