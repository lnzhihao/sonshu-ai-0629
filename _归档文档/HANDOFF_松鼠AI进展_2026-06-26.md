# 松鼠AI 交接文档 — 2026-06-26（晚）

> 给接力的 AI / 协作者：看这一份即可上手。本项目是单文件前端 `src/renderer/index.html` + 后端 `server.opt.js`，纯静态前端 + Express 后端，部署在腾讯云 `159.75.130.35`。

## 一句话现状
松鼠AI（AI 短视频创作平台，跨境电商/社媒起号）已克隆成 **SeeAny/即梦 风格**：浅紫渐变、首页=工作台、免费额度漏斗、真后端松果体系、个人收款码人工开通会员、安全已加固。**全部已上线**。唯一硬伤是"付款秒到账"——因**个人账号无营业执照、当面付签不了**，只能人工开通（执照问题，非代码）。

---

## 一、本会话已完成（都已部署上线，GitHub main 最新）

### 门面（仿 SeeAny/即梦）
- **营销落地页**：白底紫蓝渐变，Hero「上传商品图，一句话生成爆款带货视频」+ 仿真创作卡 + 4 类视频卡（UGC种草/带货短剧/产品口播/产品演示）+ **真实案例视频墙**（6 张，从 `~/Desktop/TikTok运营/已完成视频/0509 真人` ffmpeg 抽帧 → `src/renderer/case1-6.jpg`）。
- **P1** 全站浅紫渐变（accent `#7c5cff`，深紫侧栏 `#1a1535`，浅主区 `#f7f8fc`）。
- **P2 首页=工作台合一**：侧栏常驻、`#landing` 只盖主区（`left:232`）、同壳切换不跳转；`showPage('dashboard')`→显示首页，其它→切对应工具页。
- **P4 登录弹窗**仿即梦（紫渐变头 + 新用户送福利框架）。
- 右下角**在线客服浮窗**含用户微信二维码 `/wechat-qr.jpg`。
- **手机响应式**：顶栏 + ☰ 抽屉、弹窗 `width:min(宽,92vw)` 防溢出。

### 收款 + 会员
- **个人收款码人工开通**：套餐卡 → 支付弹窗（两步式：① 支付宝收款码 ② 客服微信码 + “5分钟内到账”）→「我已付款」生成订单 → 店主在 **`http://159.75.130.35/admin.html`（密码 `songshu2024`，须改）** 一键开通。
- **会员中心**（侧栏「💎 会员中心」，原"设置"改名）：免费版 vs 会员版**权益对比表** + 三档套餐。
- **套餐**：体验 ¥79/800松果 · 标准 ¥239/2600(送210) · 专业 ¥649/7500(送1010)，均月卡。

### P3 免费漏斗 + Step2 真后端松果（即梦式闭环）
- **匿名**：本地 2 次免费 → 提示登录。
- **真后端松果**（存 `~/.xinmeiti/users.json`，清缓存清不掉）：注册送 **300**；每日签到 **+30**（登录/进站自动发，服务器记日期）；生成扣减 **成片300/配音10/混剪10**（`POST /api/usage/consume` body `{kind:video|audio|mixcut}`，不足返回 `need:recharge`）；开会员套餐松果**到账余额**；`POST /api/checkin`；`auth/me`+`login` 自动发每日。
- 侧栏显示**真实"松果余额 X 🌰"**，生成实时减少。

### 安全
- `POST /api/config` **之前零鉴权**（任何人可改/清空平台密钥）→ 已加 `isAdmin` 管理员保护。
- 设置页 **API 密钥卡已隐藏**（普通用户看不到，只见会员中心）。**副作用：店主改密钥目前走服务器 `.env`**，未来可挪进 `/admin.html`。

---

## 二、关键技术事实（接力必读）

- **服务器**：腾讯云 `159.75.130.35`（Ubuntu 2核2G）。**SSH 仅微信扫码**，无密钥密码 → 给用户**单条命令**让他扫码跑。
- **拓扑**：pm2 进程 `xinmeiti` 跑 `/opt/xinmeiti-app/prod-server.js` → `require('./server.js')`，端口 **8787**；nginx(80) 静态根 `/opt/xinmeiti-app/src/renderer/`，`/api` 反代 8787；`/opt` 非 git、无 cron。配置/数据在 `/root/.xinmeiti/`（`.env`/`users.json`/`orders.json`/`pay-qr.jpg`）。
- **部署方法（已验证）**：
  - 纯前端改动（index.html）：`ssh root@159.75.130.35 'cp .../index.html /root/xm-index-bak-$(date +%H%M%S).html; cat > /opt/xinmeiti-app/src/renderer/index.html && echo ✅' < 本地index.html`（不重启，秒生效）。
  - 含后端：打 tgz（server.js+index.html+go.sh），`ssh root@... 'mkdir -p /tmp/xmd && cd /tmp/xmd && cat > p.tgz && tar xzf p.tgz && bash go.sh && cd / && rm -rf /tmp/xmd' < 包`（go.sh 备份+cp到/opt+`pm2 restart xinmeiti`+自检）。
  - **每次部署后必从外网 `curl http://159.75.130.35/...` 验证**（曾因多 AI 互相覆盖部署"回退"过）。
- **GitHub**：私有库 `github.com/lnzhihao/xinmeiti-app`（gh CLI 在 `~/.local/bin/gh`，已登录 lnzhihao）。**main 为唯一真相源；一次只用一个 AI；改前 git pull、收工 git push**。
- **本地项目**：`~/Desktop/新媒体-app/`（`server.opt.js`=线上 server.js 的源、`src/renderer/index.html`=前端、`src/renderer/admin.html`=后台、`deploy/`=收款码+脚本）。
- **密钥**：ARK/TTS 真实值只在服务器 `.env`；GitHub 提交里脱敏。

## 三、⛔ 被外部卡死的（别再投入，等条件）
- **付款秒到账 / 自动收款**：个人账号无营业执照 → 当面付/网页支付/微信支付商户**全签不了**。唯一正规出路：**办个体工商户执照**（网上免费/几天）。
- **TikTok/抖音/小红书/视频号 一键发布**：均无"非企业"开放发布 API。现"复制文案+打开网页"已是现实最优。

---

## 四、后续任务路线图（按价值排序）

1. **⭐接口实测 Step2**（快）：注册测试号 → 查 300 松果 → consume 扣 → checkin +30，确认真扣减闭环。明天用户有 token 时做。
2. **⭐⭐兑换码系统**（高价值，绕过执照实现"秒解锁"）：店主后台生成兑换码 → 卖给用户 → 用户站内输码 → **松果/会员秒到账**。这是当前约束下最接近"即梦秒到账"的方案。
3. **会员权益真实生效**：权益表承诺的"去品牌水印/优先通道"目前只是文案，给会员**真的去水印**等。
4. **按秒精确扣费**（Step2 精修）：成片按真实时长扣（现 flat 300=15秒），consume 时前端传 duration。
5. **API 密钥配置挪进 `/admin.html`**（带管理员密码），恢复店主改密钥的 UI（现只能走 .env）。
6. **办营业执照 → 切回官方当面付**（业务动作）：执照到位后，把 `.env` 的 `ALIPAY_PUBLIC_KEY`（现是孤儿公钥 mY1O…，错的）换成支付宝后台给的真支付宝公钥；上传 `~/Desktop/支付宝_应用公钥_上传这个.txt`（与服务器私钥配对的 pn+NzOLw…）。
7. **产品 backlog**（另一 AI 给的 10 条里还没做的）：实时生成预览、素材库搜索/标签、数据分析面板(ROI)、新手引导+Demo、忘记密码/快捷登录、混剪时间线可编辑。
8. **改默认管理员密码** `songshu2024`（在 `.env` 的 `ADMIN_PASSWORD`）。

---

## 五、给其他 AI 协作的提醒
- **一次只用一个 AI 改/部署**，改前 `git pull`、收工 `git push`，从 GitHub main 走，避免互相覆盖回退。
- 改动后**自检**（结构平衡/语法）+ **外网 curl 验证**再交付。
- 别碰被卡死的两项（自动收款、平台一键发布）。
