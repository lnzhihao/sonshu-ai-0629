# 新媒体工具 · 今日工作交接（2026-06-24/25）

> 给 Claude / Codex / 任意 AI：读这份就能接着干。线上 `http://159.75.130.35`。

---

## 一句话现状
今天修复了「上线后一直用不了」的一堆问题，配音(语音合成)已接通新版接口；三大工作流 UI 做了工作台卡片。**配音出声还没实测、工作台新 UI 还没部署**——这是 9 点要做的第一批。

---

## ⚠️ 服务器关键事实（最容易踩的坑，务必先读）
- **SSH 只能微信扫码登录**（腾讯云 WeChat QR）。没有密钥/密码。做法：把命令准备成单条，用户在自己终端粘贴运行并扫码，再把输出贴回。`< 本地文件` 或 `'cat > 远程' ` 重定向**不影响**扫码鉴权。
- **pm2 实际运行的是 `/opt/xinmeiti-app/`**（`script: /opt/xinmeiti-app/prod-server.js`, `cwd: /opt/xinmeiti-app`）。
  - ✅ 改后端 = 改 **`/opt/xinmeiti-app/server.js`** 然后 `pm2 restart xinmeiti`。
  - ❌ `/root/xinmeiti-app/` 是**没在运行的旧副本**，别动它（之前误改过这里，白费）。
- **Nginx 前端**从 `/opt/xinmeiti-app/src/renderer/index.html` 提供。改前端要推到 /opt（顺手也推 /root 保持一致）。
- 成品视频 `/root/xinmeiti-output/`；上传素材 `/root/.xinmeiti/uploads/mixcut/`；env `/root/.xinmeiti/.env`。

---

## 今天做完了什么

### 已部署上线（live）
1. **502/打不开** → 实为已恢复（复测 200）。
2. **批量混剪合成失败**（方案引用越界素材）→ 后端改为「跳过无效片段继续合成」(skipSet)。**已部署到 /opt**。
3. **成品库播放/下载 404** → Nginx 占位符路径 `/home/你的用户名` 改成 `/root` + `chmod o+x /root`。已 reload。
4. **素材库预览** → 同 Nginx 修复一并解决。
5. **前端「TTS 配音」全改名「AI 配音」**（保留内部字段 TTS_APP_ID 等）。已部署。
6. **批量混剪/配音 加「工作原理」分步面板**，混剪还能运行时实时点亮步骤。已部署。
7. **配音接口换成新版 v3 HTTP**（`api/v3/tts/unidirectional`，X-Api-Key 鉴权）+ 写入语音密钥到 .env。**已部署，/health 显示 hasTtsCredentials:true**。

### 已落盘本地、但【未部署】（9 点要 deploy）
8. **工作台「三大工作流」卡片 UI** → 在本地 `src/renderer/index.html`（166KB），线上还是旧版（164KB）。**需要部署才能看到。**

---

## 还没做 / 待办（9 点继续，按优先级）
1. **【必做第一件】实测配音出声**：v3 接口代码是按规格写的、**没真跑过**。去配音页生成一句，确认出 mp3。不出声就调 `synthVoiceV3` 的流式返回解析（见 server.opt.js）。
2. **部署工作台新 UI**（见下方命令）。
3. **三大核心功能打磨**：
   - ② 批量 AI 配音：素材库/配音页做成「多段文案→选音色/语种→批量出 mp3」。
   - 多语种（葡/法/德/英）：配音页加语种下拉；确认音色是否跨语种，不够就去音色库订阅对应音色。
   - ① 拆解创作：autopilot 已有；接通素材库（注意 autopilot 的 local_files 目前读 /opt 的 Desktop，云端为空，需改成读上传素材库）。
   - ③ 本地混剪+自动配音：已有，配音现在带人声。
4. **账号登录 + 会员按钮**（左上角，账号密码/手机号登录、不强制、不发验证码）。注意：真收钱要另接支付（微信/支付宝商户），登录+会员标记可先做。
5. 素材库 vs 成品库 信息架构梳理。

---

## 部署命令（都要扫码）

### 部署前端（工作台新 UI 上线）
```bash
ssh root@159.75.130.35 'OPT=/opt/xinmeiti-app/src/renderer/index.html; ROOT=/root/xinmeiti-app/src/renderer/index.html; cat > /tmp/i.html; for T in "$OPT" "$ROOT"; do [ -f "$T" ] && cp "$T" "$T.bak.$(date +%s)" && cp /tmp/i.html "$T" && echo "已更新 $T"; done; echo 前端已部署' < ~/Desktop/新媒体-app/src/renderer/index.html
```
部署后浏览器 Cmd+Shift+R 强刷。

### 部署后端（改了 server.opt.js 后）
```bash
ssh root@159.75.130.35 'cat > /tmp/s.js && node --check /tmp/s.js && cp /opt/xinmeiti-app/server.js /opt/xinmeiti-app/server.js.bak.$(date +%s) && mv /tmp/s.js /opt/xinmeiti-app/server.js && pm2 restart xinmeiti && echo OK后端已部署' < ~/Desktop/新媒体-app/server.opt.js
```

### 把线上运行版拉回本地（改后端前先同步，避免覆盖线上更新）
```bash
ssh root@159.75.130.35 'cat /opt/xinmeiti-app/server.js' > ~/Desktop/新媒体-app/server.opt.js
```

---

## 测试清单
- 配音：配音页 → 输入英文一句 → 加载声音(应有 VV/小何/温暖阿虎/解说小明) → 生成 → 出 mp3 = ✅
- 混剪：批量混剪 → 上传几个视频 → AI 生成方案 → 开始合成 → 进度条走、成品库出片 = ✅
- 成品播放：成品库 → 播放/下载 = ✅（已修）

---

## 文件清单（本地 ~/Desktop/新媒体-app/）
- `server.opt.js` —— **线上运行版后端**(1802行，含混剪修复+v3配音)。改后端改这个，部署到 /opt。
- `src/renderer/index.html` —— **最新前端**(含改名+工作原理面板+三大工作流卡片)。已落盘，**待部署**。
- `server.js`（旧 1724 行）、其他 —— 旧变体，仅参考，别部署。
- 本文件 `HANDOFF_今日进展.md` —— 交接说明。

---

## 密钥 / 接口参考
- **ARK（豆包LLM/Seedance视频）**：`ARK_API_KEY=ark-REDACTED`（在 .env）。LLM 只产文字，不产声音。
- **语音合成（AI配音）v3 HTTP**：
  - 端点 `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`
  - 头：`X-Api-Key`(= TTS_API_KEY=KEY-REDACTED) + `X-Api-Resource-Id: seed-tts-2.0`(= TTS_RESOURCE_ID) + `X-Api-Request-Id`(uuid) + `Content-Type: application/json`
  - 体：`{"req_params":{"text":"...","speaker":"zh_female_vv_uranus_bigtts","audio_params":{"format":"mp3","sample_rate":24000}}}`
  - 返回：流式多段 JSON，每段 `data` 是 base64 音频块，拼接得完整 mp3。
  - 可用音色(中文 seed-tts-2.0)：`zh_female_vv_uranus_bigtts`、`zh_female_xiaohe_uranus_bigtts`、`zh_male_wennuanahu_uranus_bigtts`、`zh_male_jieshuoxiaoming_uranus_bigtts`。多语种音色去控制台音色库订阅。
  - 已充值 ¥50；计费约 ¥2/万字符。key 用户表示不在意泄露（额度有限用完即弃）。
- **计价（用于成本提示「钱花哪」）**：Seedance 视频 ¥0.2/秒；豆包 LLM ¥0.8/百万token；TTS ¥2/万字符。
