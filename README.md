# 新媒体工具

一站式 AI 新媒体内容生产工具。支持智能选题、脚本生成、批量混剪、AI 配音、发布中心。

## 技术栈

- **后端**: Node.js + Express（API 服务器）
- **前端**: 原生 HTML/CSS/JS（单页应用）
- **AI 引擎**: 豆包大模型（LLM / Seedance 视频生成 / TTS 语音合成）
- **视频处理**: ffmpeg
- **进程守护**: PM2
- **反向代理**: Nginx

---

## 本地开发（macOS 桌面端）

### 1. 安装依赖

```bash
cd 新媒体-app
npm install
```

### 2. 启动 Electron 桌面应用

```bash
npm start
```

这会同时启动 Electron 窗口和后端 API 服务器（localhost:8787）。

### 3. 仅启动 Web 服务（无 Electron）

```bash
node prod-server.js
```

浏览器访问 `http://localhost:8787`

---

## 服务器部署（Linux）

### 1. 上传代码到服务器

```bash
cd 新媒体-app
bash deploy-pack.sh
# 按提示执行 scp 命令上传
```

### 2. 服务器上一键部署

```bash
ssh root@你的服务器IP
cd /tmp && tar xzf xinmeiti-app-*.tar.gz && cd xinmeiti-app
bash deploy.sh
```

部署脚本会自动安装：Node.js、npm、ffmpeg、Nginx、PM2。

### 3. 配置 API 密钥

```bash
cat > ~/.xinmeiti/.env << 'EOF'
ARK_API_KEY=你的豆包大模型API密钥
PORT=8787
BIND_HOST=0.0.0.0
OUTPUT_DIR=/root/xinmeiti-output
PUBLIC_URL=http://你的服务器IP
EOF

pm2 restart xinmeiti
```

---

## 项目文件说明

| 文件 | 用途 |
|------|------|
| `server.js` | 核心后端 API（豆包 LLM/Seedance/TTS 集成） |
| `prod-server.js` | 生产环境入口（无 Electron 依赖） |
| `main.js` | Electron 主进程 |
| `preload.js` | Electron preload 脚本 |
| `src/renderer/index.html` | 全部前端界面（单文件） |
| `package.json` | 项目依赖配置 |
| `ecosystem.config.js` | PM2 进程守护配置 |
| `nginx.conf` | Nginx 反向代理配置 |
| `deploy.sh` | 服务器一键部署脚本 |
| `deploy-pack.sh` | Mac 本地打包脚本 |
| `assets/` | 应用图标 |

---

## 功能模块

### 内容生产
- **智能创作**：AI 选题 → 脚本生成 → 素材匹配 → 全场景出片
- **素材库**：上传/管理视频素材、AI 生成素材
- **批量混剪**：对标拆解 → 话术优化 → 自动合成

### 内容管理
- **成品库**：已生成视频浏览/下载
- **发布中心**：AI 文案生成 + 一键复制（支持 5 种文案风格）
- **创作记录**：历史会话管理

### 账号运营
- **账户库**：多平台账号管理

---

## API 端点概览

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/config` | GET/POST | 配置管理（API Key 等） |
| `/api/ai/autopilot` | POST | AI 自动创作流水线（9 步） |
| `/api/ai/generate-caption` | POST | AI 文案生成 |
| `/api/mixcut/autopilot-render` | POST | 自动混剪合成 |
| `/api/mixcut/render` | POST | 手动混剪合成 |
| `/api/creative/sessions` | GET/POST/DELETE | 创作记录管理 |
| `/api/media/upload` | POST | 素材上传 |
| `/api/media/list` | GET | 素材列表 |
| `/output-video/*` | GET | 成品视频直出 |
| `/local-media/*` | GET | 本地素材访问 |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ARK_API_KEY` | - | **必填**。豆包大模型 API 密钥 |
| `PORT` | 8787 | 服务端口 |
| `BIND_HOST` | 0.0.0.0 | 绑定地址 |
| `OUTPUT_DIR` | ~/xinmeiti-output | 成品视频输出目录 |
| `PUBLIC_URL` | http://127.0.0.1:PORT | 公网访问地址 |
| `TTS_APPID` | - | TTS 语音合成 AppID |
| `TTS_TOKEN` | - | TTS 语音合成密钥 |
| `SEEDANCE_API_KEY` | - | Seedance 视频生成密钥 |

---

## 常用运维命令

```bash
pm2 status              # 查看应用状态
pm2 logs xinmeiti       # 查看日志
pm2 restart xinmeiti    # 重启应用
pm2 stop xinmeiti       # 停止应用
pm2 save                # 保存当前进程列表
systemctl status nginx  # 查看 Nginx 状态
systemctl restart nginx # 重启 Nginx
nginx -t                # 测试 Nginx 配置
```
