# 松鼠AI（新媒体-app）

> **AI 短视频创作平台**，专为跨境电商 / 社媒起号。上传商品图，AI 一键生成爆款带货视频（AI 成片 / AI 配音 / 批量混剪 / 批量发布）。
> 单文件前端 `src/renderer/index.html` + Express 后端 `server.opt.js`，浅紫渐变 UI（仿 SeeAny/即梦），含松果积分体系与会员收款。
>
> **本文件是唯一最新项目文档**（2026-06-26）。历史/过程文档已移入 `_归档文档/`。

---

## 一、线上 & 现状
- **网站**：http://159.75.130.35 （未登录看营销页，登录进工作台）
- **管理后台**：http://159.75.130.35/admin.html （密码 `songshu2024`，⚠️须改）
- **GitHub**：`github.com/lnzhihao/xinmeiti-app`（私有，main 为唯一真相源）
- **状态**：门面 + 收款 + 免费漏斗 + 真后端松果体系 + 安全加固 + 手机适配，**全部已上线**。
- **唯一硬伤**：付款不能"秒到账"——个人账号无营业执照，当面付签不了，只能人工开通（执照问题，非代码）。

## 二、技术栈
后端 Node.js + Express（`server.opt.js` → 线上 `/opt/xinmeiti-app/server.js`）· 前端 原生 HTML/CSS/JS 单文件 · AI：豆包 ARK（LLM/Seedance 视频）+ 火山 TTS · ffmpeg · PM2 · Nginx。

## 三、服务器拓扑（接力必读）
- 腾讯云 `159.75.130.35`（Ubuntu 2核2G）。**SSH 仅微信扫码**，无密钥密码。
- pm2 进程 `xinmeiti` 跑 `/opt/xinmeiti-app/prod-server.js` → `require('./server.js')`，端口 **8787**。
- nginx(80) 静态根 `/opt/xinmeiti-app/src/renderer/`，`/api` 反代 `127.0.0.1:8787`。`/opt` 非 git、无 cron。
- 配置/数据：`/root/.xinmeiti/`（`.env` 密钥 / `users.json` 账号+松果 / `orders.json` 订单 / `pay-qr.jpg` 收款码）。

## 四、部署方法（已验证）
**SSH 仅微信扫码**：把命令给用户在他终端粘贴运行并扫码。`< 本地文件` 重定向不影响扫码。

- **纯前端改动**（只改 index.html，不重启，秒生效）：
  ```bash
  ssh root@159.75.130.35 'cp /opt/xinmeiti-app/src/renderer/index.html /root/xm-index-bak-$(date +%H%M%S).html; cat > /opt/xinmeiti-app/src/renderer/index.html && echo OK' < ~/Desktop/新媒体-app/src/renderer/index.html
  ```
- **含后端**（打 tgz：server.js+index.html+go.sh，go.sh 做 备份+cp到/opt+`pm2 restart xinmeiti`+自检）：
  ```bash
  ssh root@159.75.130.35 'mkdir -p /tmp/xmd && cd /tmp/xmd && cat > p.tgz && tar xzf p.tgz && bash go.sh && cd / && rm -rf /tmp/xmd' < 部署包.tgz
  ```
- **⚠️每次部署后必从外网 `curl http://159.75.130.35/...` 验证**（曾因多 AI 互相覆盖部署"回退"过）。

## 五、本地开发
```bash
cd ~/Desktop/新媒体-app
node prod-server.js          # 仅 Web 服务 → http://localhost:8787（需 ~/.xinmeiti/.env 有密钥）
# 或纯前端预览(无后端,改UI用)：
cd src/renderer && python3 -m http.server 8899   # → http://localhost:8899
```

## 六、文件结构
| 文件 | 用途 |
|---|---|
| `server.opt.js` | **后端**（部署为 `/opt/.../server.js`）。账号/松果/收款/AI 全在此 |
| `src/renderer/index.html` | **全部前端**（单文件，营销页+工作台+各工具+弹窗+JS） |
| `src/renderer/admin.html` | 收款管理后台（凭密码开通会员） |
| `src/renderer/case1-6.jpg` | 营销页真实案例视频封面 |
| `src/renderer/wechat-qr.jpg` | 客服微信二维码 |
| `deploy/` | 收款码 `pay-qr.jpg` + 部署脚本 |
| `prod-server.js` / `ecosystem.config.js` / `nginx.conf` | 生产入口 / PM2 / Nginx 配置 |
| `_归档文档/` | 历史过程文档（不再维护） |

## 七、核心功能
- **营销落地页**（未登录）：渐变 Hero + 仿真创作卡 + 4 类视频卡（UGC种草/带货短剧/产品口播/产品演示）+ 真实案例墙 + 客服浮窗。
- **首页=工作台**（登录后同壳）：AI 成片 / AI 配音 / 批量混剪 / 素材库 / 批量发布 / 会员中心。
- **会员中心**：免费版 vs 会员版权益对比 + 三档套餐（体验¥79/800松果 · 标准¥239/2600 · 专业¥649/7500）。
- **收款**：支付弹窗（支付宝收款码 + 客服微信码）→「我已付款」生成订单 → 后台一键开通。

## 八、松果（积分）经济模型 — 真后端，存 users.json
| 机制 | 规则 |
|---|---|
| 注册 | 送 **300** 松果 |
| 每日签到 | **+30**（登录/进站自动发，服务器记日期，一天一次）|
| 生成扣减 | 成片 **300** · 配音 **10** · 混剪 **10**（`POST /api/usage/consume`）|
| 开通会员 | 套餐松果到账余额 |
| 余额不足 | 提示开会员/签到，拦住生成 |
| 匿名 | 本地 2 次免费 → 引导登录 |

## 九、⛔ 被外部卡死（别再投入）
- **自动收款/秒到账**：个人无营业执照 → 当面付/微信支付商户签不了。出路：办**个体工商户执照**。
- **TikTok/抖音/小红书/视频号 一键发布**：无"非企业"开放发布 API。现"复制文案+打开网页"是现实最优。

## 十、后续路线图（按价值）
1. ⭐ 接口实测 Step2 扣减（注册→看300→生成扣→签到+30）
2. ⭐⭐ **兑换码系统**（绕执照实现"秒解锁"：后台生成码→卖→站内输码→松果/会员秒到账）
3. ⭐ 会员权益真生效（去水印/优先通道现仅文案）
4. 按秒精确扣费 · API密钥配置挪进 admin.html · 改默认管理员密码 `songshu2024`
5. 办执照 → 切官方当面付（届时把 `.env` 的孤儿公钥 `mY1O…` 换成支付宝后台给的真支付宝公钥）
6. backlog：实时生成预览 / 素材库搜索标签 / 数据面板(ROI) / 新手引导 / 忘记密码 / 混剪时间线可编辑

## 十一、协作规矩（多 AI 接力）
**一次只用一个 AI 改/部署；改前 `git pull`、收工 `git push`；从 GitHub main 走；改完自检 + 外网 curl 验证再交付。** 否则会互相覆盖回退。

## 十二、运维
```bash
pm2 status / pm2 logs xinmeiti / pm2 restart xinmeiti     # 应用
nginx -t / systemctl restart nginx                        # Nginx
```
关键 env（`/root/.xinmeiti/.env`）：`ARK_API_KEY`(豆包) · `TTS_API_KEY`/`TTS_RESOURCE_ID`(火山TTS) · `ALIPAY_APP_ID`/`ALIPAY_PUBLIC_KEY` · `PAY_CONTACT`(客服微信) · `ADMIN_PASSWORD`(后台密码) · `PUBLIC_URL`。
