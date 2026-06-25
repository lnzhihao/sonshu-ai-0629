# 🚀 新媒体工具 — 服务器上线完整教程

> 从零到上线，手把手教你部署。

---

## 📋 你将得到什么

| 阶段 | 产出 | 耗时 |
|------|------|------|
| 买服务器 | 一台 Ubuntu 云服务器 | 5 分钟 |
| 传代码 | 项目文件传到服务器 | 2 分钟 |
| 一键部署 | 运行 `deploy.sh` 自动完成 | 5 分钟 |
| 配置密钥 | 填写 API Key | 2 分钟 |
| 访问上线 | 浏览器打开就可用 | 即刻 |

**总计: 15 分钟完成上线。**

---

## 第一步：购买云服务器

### 推荐配置

| 项目 | 配置 |
|------|------|
| **供应商** | 腾讯云轻量应用服务器 |
| **CPU** | 2 核 |
| **内存** | 2 GB |
| **硬盘** | 40 GB SSD |
| **带宽** | 3 Mbps |
| **系统** | Ubuntu 22.04 LTS |
| **价格** | ¥50-80 / 月 |

### 购买步骤

1. 打开 [腾讯云轻量服务器](https://cloud.tencent.com/product/lighthouse)
2. 点击「立即购买」
3. 选择「应用镜像」→ **Ubuntu 22.04**
4. 选择地域（建议选离你最近的）
5. 套餐选 **2核2G**（最基础的就够）
6. 设置 root 密码（**务必记住！**）
7. 付款

> 💡 买完后在控制台「安全组」里放行 **80 端口**（HTTP），不然访问不了。

---

## 第二步：在 Mac 上准备代码

打开终端（Terminal），进入项目目录：

```bash
cd ~/Desktop/xinmeiti-app
```

运行打包脚本：

```bash
./deploy-pack.sh
```

这会生成一个打包文件并显示上传命令，类似：

```
📦 打包完成！

上传到服务器:
  scp xinmeiti-app-20260624-120000.tar.gz \
    root@你的服务器IP:/tmp/
```

复制那条 `scp` 命令，把「你的服务器IP」替换成你服务器的公网 IP。

---

## 第三步：上传代码到服务器

```bash
# 粘贴上一步复制的命令，例如：
scp xinmeiti-app-20260624-120000.tar.gz root@123.456.789.0:/tmp/
```

输入服务器密码（购买时设置的），等待上传完成（约 10 秒）。

---

## 第四步：SSH 登录服务器，一键部署

```bash
# 登录服务器
ssh root@你的服务器IP

# 解压
cd /tmp
tar xzf xinmeiti-app-*.tar.gz
cd xinmeiti-app

# 🎯 一键部署
sudo bash deploy.sh
```

脚本会自动完成：
- ✅ 安装 Node.js 22
- ✅ 安装 ffmpeg（视频合成）
- ✅ 安装 nginx（Web 服务器）
- ✅ 安装 PM2（进程守护）
- ✅ 部署项目代码
- ✅ 安装 npm 依赖
- ✅ 配置防火墙
- ✅ 启动服务

看到 `✅ 部署完成！` 就说明成功了。

---

## 第五步：填写 API 密钥

```bash
nano ~/.xinmeiti/.env
```

编辑以下内容（**ARK_API_KEY 必须填写**）：

```env
ARK_API_KEY=你的火山引擎API密钥
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DEFAULT_VIDEO_MODEL=doubao-seedance-2-0-260128
DEFAULT_LLM_MODEL=doubao-1-5-pro-32k-250115
TTS_APP_ID=你的TTS_APP_ID（可选）
TTS_ACCESS_TOKEN=你的TTS_TOKEN（可选）
TTS_CLUSTER=volcano_mega
PORT=8787
BIND_HOST=0.0.0.0
OUTPUT_DIR=/root/xinmeiti-output
PUBLIC_URL=http://你的服务器IP
```

> 📌 把你的 ARK_API_KEY 替换进去。获取方式：登录 [火山引擎控制台](https://console.volcengine.com/ark) → API 密钥管理。

完成后按 `Ctrl+O` 保存，`Ctrl+X` 退出。

然后重启服务：

```bash
pm2 restart xinmeiti
```

---

## 第六步：访问你的应用

在浏览器打开：

```
http://你的服务器IP
```

你应该看到「新媒体工具」工作台首页！

> 💡 如果打不开，检查云服务器安全组是否放行了 **80 端口**。

---

## 🛠 日常维护命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs xinmeiti

# 重启应用（修改代码后）
pm2 restart xinmeiti

# 修改配置后
nano ~/.xinmeiti/.env
pm2 restart xinmeiti

# 重载 Nginx（修改 nginx 配置后）
sudo nginx -t && sudo systemctl reload nginx

# 查看磁盘空间
df -h
```

---

## 🔒 安全建议

1. **改 SSH 端口**（防暴力破解）：
```bash
sudo nano /etc/ssh/sshd_config
# 把 Port 22 改为 2222 或其他
sudo systemctl restart sshd
```

2. **配置 HTTPS**（需要域名）：
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

3. **定期备份**：
```bash
# 备份配置文件
cp ~/.xinmeiti/.env ~/backup/env-$(date +%Y%m%d).bak
# 备份创作记录
cp ~/.xinmeiti/creative-sessions.json ~/backup/
```

---

## 📁 服务器文件结构

```
/opt/xinmeiti-app/          ← 项目代码
├── server.js               ← API 服务
├── prod-server.js          ← 生产环境入口
├── ecosystem.config.js     ← PM2 配置
├── nginx.conf              ← Nginx 配置模板
├── deploy.sh               ← 一键部署脚本
├── src/renderer/index.html ← 前端页面
└── node_modules/           ← 依赖包

/root/.xinmeiti/            ← 配置和数据
├── .env                    ← API 密钥配置
├── creative-sessions.json  ← 创作记录
└── logs/                   ← 应用日志

/root/xinmeiti-output/      ← 成品视频库
```

---

## 💰 费用一览

| 项目 | 月费 |
|------|------|
| 腾讯云轻量 2核2G | ¥50-80 |
| 域名（可选） | ¥3-5 |
| 豆包 LLM API | 按量 ¥0.8/百万token |
| 豆包 Seedance 视频 | 按量 ¥0.2/秒 |
| 火山 TTS | 按量 ¥2/万字符 |
| **基础月费** | **约 ¥60-100** |

---

## ❓ 常见问题

**Q: 部署后页面空白？**
A: 按 F12 打开开发者工具 → Console 看报错。通常原因是 API Key 没填或 Nginx 没启动。

**Q: 视频生成失败？**
A: 检查 `ARK_API_KEY` 是否正确，登录火山引擎确认有余额。

**Q: 如何更新代码？**
```bash
# 本地打包上传
cd ~/Desktop/xinmeiti-app
./deploy-pack.sh
scp /tmp/xinmeiti-deploy/xinmeiti-app-*.tar.gz root@服务器IP:/tmp/

# 服务器上
ssh root@服务器IP
cd /tmp && tar xzf xinmeiti-app-*.tar.gz
rsync -av xinmeiti-app/ /opt/xinmeiti-app/
pm2 restart xinmeiti
```

**Q: 域名怎么绑定？**
A: 在域名控制台添加 A 记录指向服务器 IP，然后修改 `~/.xinmeiti/.env` 中的 `PUBLIC_URL=http://你的域名`，重启 `pm2 restart xinmeiti`。

---

> 📧 有问题随时问我。
