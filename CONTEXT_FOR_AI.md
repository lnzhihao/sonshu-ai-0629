# 新媒体工具 — AI 对话上下文

> 喂给 Codex / Claude Code / 任意 AI 工具，即可继续开发。

---

## 项目概览

**名称**：新媒体工具  
**定位**：一站式 AI 新媒体内容生产工具  
**功能**：智能选题 → 脚本生成 → 素材匹配 → 批量混剪 → AI 配音 → 发布中心  
**技术栈**：Electron + Express + 豆包大模型 API（LLM / Seedance 视频生成 / TTS 语音）  
**本地代码**：`~/Desktop/新媒体-app/`（17 个文件，3.2MB）  
**线上地址**：`http://159.75.130.35`

---

## 文件清单及用途

| 文件 | 行数 | 作用 |
|------|------|------|
| `server.js` | ~1700 | 核心后端。Express API + 豆包 LLM/TTS/Seedance 集成、autopilot 流水线、混剪合成 |
| `prod-server.js` | 66 | 生产环境入口。加载环境变量后 `require('./server')`，不依赖 Electron |
| `main.js` | 50 | Electron 主进程。创建 BrowserWindow，启动 Express 后端 |
| `preload.js` | 10 | Electron preload。暴露 `window.API_PORT` 给渲染进程 |
| `src/renderer/index.html` | ~2900 | 全部前端。侧边栏导航 + 6 个页面 + 发布中心 + 创作记录 |
| `package.json` | 20 | 依赖：express, axios, multer, dotenv 等 |
| `package-lock.json` | ~5000 | 锁定依赖版本 |
| `ecosystem.config.js` | 50 | PM2 配置（内存 512M、自动重启、日志路径） |
| `nginx.conf` | 100 | Nginx 反向代理（API 代理 localhost:8787 + 静态文件 + SSE websocket） |
| `deploy.sh` | 300 | 服务器端一键部署（装 Node.js/ffmpeg/nginx/pm2 + 部署代码 + 启动） |
| `deploy-pack.sh` | 100 | Mac 端打包（tar.gz + 显示 scp 上传命令） |
| `assets/` | - | 应用图标 icon.png / icon.icns |
| `README.md` | - | 项目使用说明 |
| `DEPLOY.md` | - | 图文部署教程 |
| `PRODUCT_ARCHITECTURE.md` | - | 产品架构优化方案 |

---

## 架构设计

```
┌─────────────────────────────────────┐
│           浏览器 / Electron          │
│         src/renderer/index.html      │
│  (单页应用，6个页面，侧边栏导航)      │
└──────────────┬──────────────────────┘
               │ apiBase() 自动适配
               ├─ Electron: http://127.0.0.1:XXXX
               └─ Web:     相对路径（Nginx 代理）
               │
┌──────────────▼──────────────────────┐
│          Nginx (端口 80)             │
│  ├─ /api/*  → localhost:8787        │
│  ├─ /*.html → /root/xinmeiti-app/   │
│  ├─ /output-video/* → 成品视频      │
│  └─ SSE 代理（关闭 buffering）       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Express API (端口 8787)           │
│    server.js / prod-server.js        │
│  ┌─────────────────────────────────┐ │
│  │ AI 引擎层                        │ │
│  │ • 豆包 LLM (doubao-1-5-pro-32k) │ │
│  │ • Seedance 视频生成              │ │
│  │ • TTS 语音合成                   │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │ 业务逻辑层                        │ │
│  │ • autopilot 9 步流水线           │ │
│  │ • 混剪合成 (ffmpeg)              │ │
│  │ • 文案生成 (5种风格)             │ │
│  │ • 创作记录 CRUD                  │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  文件存储                           │
│  /root/xinmeiti-output/ (成品视频)   │
│  /root/xinmeiti-output/media/ (素材)│
│  ~/.xinmeiti/.env (API 密钥)        │
└──────────────────────────────────────┘
```

---

## API 端点

### 配置
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET | 获取当前配置 |
| `/api/config` | POST | 更新配置（ARK_API_KEY 等） |

### AI 创作
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ai/autopilot` | POST (SSE) | 自动创作流水线。入参 `{url, target_platform, target_account}`。返回 SSE 事件流，共 9 步 |
| `/api/ai/generate-caption` | POST | 文案生成。入参 `{url, style}`。style 可选：痛点型/开箱型/对比型/故事型/悬念型 |

### 混剪
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/mixcut/autopilot-render` | POST | 自动混剪合成。入参 `{video_id, script_segments, seedance_tasks}` |
| `/api/mixcut/render` | POST | 手动混剪合成 |

### 创作记录
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/creative/sessions` | GET | 获取所有创作记录 |
| `/api/creative/sessions` | POST | 创建创作记录 |
| `/api/creative/sessions/:id` | DELETE | 删除创作记录 |

### 素材 & 成品
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/media/upload` | POST | 上传素材 |
| `/api/media/list` | GET | 素材列表 |
| `/output-video/:name` | GET | 下载成品视频（Nginx 直出） |
| `/local-media/:path` | GET | 本地素材访问 |

---

## 前端页面（单文件 index.html）

侧边栏结构：
```
📊 工作台（Dashboard）
📝 内容生产
  ├─ 🧠 智能创作（autopilot 流水线 + 创作记录面板）
  ├─ 📂 素材库（上传/管理）
  └─ ✂️ 批量混剪（对标拆解 → 合成）
📦 内容管理
  ├─ 🎬 成品库（视频浏览/下载）
  ├─ 📢 发布中心（AI 文案 + 一键复制）
  └─ 📅 发布排期
👤 账号运营
  └─ 🔗 账户库
⚙️ 系统设置
  └─ API 密钥配置
```

### 关键前端逻辑
- `apiBase()` 函数自动判断 Electron/Web 环境，返回正确的 API 前缀
- 智能创作页使用 EventSource 接收 SSE 进度推送
- 发布中心支持 5 种文案风格独立生成，一键盘复制
- 成品库支持视频预览和下载

---

## 当前服务器状态

| 项目 | 详情 |
|------|------|
| IP | 159.75.130.35 |
| 系统 | Ubuntu 22.04 LTS |
| 配置 | 2核 CPU + 2GB 内存 |
| Node.js | v20.x |
| PM2 | 已安装，管理 xinmeiti 进程 |
| Nginx | 已安装，配置在 /etc/nginx/sites-enabled/xinmeiti |
| 项目路径 | /root/xinmeiti-app |
| 输出目录 | /root/xinmeiti-output |
| 环境变量 | /root/.xinmeiti/.env |
| API 密钥 | ARK_API_KEY=ark-REDACTED（真实值在服务器 /root/.xinmeiti/.env） |
| 启动命令 | `pm2 start ecosystem.config.js` |
| 端口 | 外部 80 → Nginx → 内部 8787 |

---

## 当前待解决问题

1. **npm 依赖安装**：服务器上 `/root/xinmeiti-app/` 的 `npm install` 需要完成
2. **应用 502**：Nginx 返回 502 Bad Gateway 因为后端没启动（依赖没装好）
3. **修复命令**：
   ```bash
   ssh root@159.75.130.35
   cd /root/xinmeiti-app
   npm config set registry https://registry.npmmirror.com   # 用国内源加速
   npm install
   pm2 restart xinmeiti
   pm2 save
   ```

---

## 开发历史关键节点

1. **初版**：Electron 桌面应用，智能创作 + 批量混剪
2. **流水线重构**：autopilot 从 6 步扩展到 9 步（增加素材匹配、缺口分析、话术优化）
3. **bug 修复**：ffmpeg 超时保护、视频流预检、空值崩溃保护
4. **创作记录**：新增 /api/creative/sessions CRUD + 前端面板
5. **发布中心**：豆包 LLM 文案生成 + 一键复制（5 种风格）
6. **UI 优化**：侧边栏重排 + Dashboard 工作台 + 素材库独立页
7. **生产化**：prod-server.js + Nginx + PM2 + 环境变量配置
8. **上线部署**：腾讯云 159.75.130.35

---

## 常用运维命令

```bash
pm2 status                  # 查看应用状态
pm2 logs xinmeiti           # 实时日志
pm2 logs xinmeiti --lines 50 # 最近 50 行日志
pm2 restart xinmeiti        # 重启应用
pm2 stop xinmeiti           # 停止
pm2 save                    # 保存进程列表
pm2 startup                 # 设置开机自启
systemctl status nginx      # Nginx 状态
systemctl restart nginx     # 重启 Nginx
nginx -t                    # 测试 Nginx 配置
cat /root/.xinmeiti/.env    # 查看环境变量
```

---

## 本地开发启动

```bash
cd ~/Desktop/新媒体-app
npm install
npm start           # Electron 桌面端
# 或
node prod-server.js # 纯 Web（localhost:8787）
```

---

## 安全提醒

- **ARK_API_KEY 已包含在本文档中**，请勿公开分享此文件
- 服务器 SSH 密码请妥善保管
- 豆包 API 有调用额度限制，注意监控用量
