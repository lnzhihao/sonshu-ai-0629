const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(os.homedir(), '.xinmeiti', '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Config ─────────────────────────────────────────────────────────────────
const CONFIG_DIR = path.join(require('os').homedir(), '.xinmeiti');
const CONFIG_FILE = path.join(CONFIG_DIR, '.env');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  const lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n');
  const cfg = {};
  for (const line of lines) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) cfg[m[1].trim()] = m[2].trim();
  }
  return cfg;
}

function saveConfig(updates) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const merged = { ...loadConfig(), ...updates };
  fs.writeFileSync(CONFIG_FILE, Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('\n'));
  Object.assign(process.env, merged);
}

function cfg(key) { return process.env[key] || loadConfig()[key] || ''; }

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    hasArkKey: !!cfg('ARK_API_KEY'),
    hasTtsCredentials: !!(cfg('TTS_APP_ID') && cfg('TTS_ACCESS_TOKEN')),
    hasTikTokKey: !!cfg('TIKTOK_CLIENT_KEY'),
  });
});

app.get('/api/config', (req, res) => {
  try {
    const c = loadConfig();
    const masked = {};
    for (const [k, v] of Object.entries(c)) {
      masked[k] = v && v.length > 8 ? v.slice(0, 4) + '****' + v.slice(-4) : (v ? '****' : '');
    }
    res.json(masked);
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const allowed = ['ARK_API_KEY', 'ARK_BASE_URL', 'DEFAULT_VIDEO_MODEL', 'DEFAULT_LLM_MODEL',
      'TTS_APP_ID', 'TTS_ACCESS_TOKEN', 'TTS_CLUSTER',
      'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined && req.body[key] !== '') updates[key] = req.body[key];
    }
    saveConfig(updates);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── ARK helpers ───────────────────────────────────────────────────────────
function arkBase() { return cfg('ARK_BASE_URL') || 'https://ark.cn-beijing.volces.com/api/v3'; }

async function arkPost(path, body) {
  const apiKey = cfg('ARK_API_KEY');
  if (!apiKey) throw new Error('请先在设置中填写 ARK API Key');
  const r = await fetch(`${arkBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function arkGet(path) {
  const apiKey = cfg('ARK_API_KEY');
  if (!apiKey) throw new Error('请先在设置中填写 ARK API Key');
  const r = await fetch(`${arkBase()}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  return r.json();
}

// ── 豆包 multimodal (视觉理解) ───────────────────────────────────────────
async function arkVision(userContent, systemPrompt) {
  const model = cfg('DEFAULT_LLM_MODEL') || 'doubao-1-5-pro-32k-250115';
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userContent });
  const d = await arkPost('/chat/completions', { model, messages, temperature: 0.5, max_tokens: 4096 });
  return d.choices?.[0]?.message?.content || '';
}

// ── 爆款自检 ─────────────────────────────────────────────────────────────
async function viralCheck(script, product) {
  const text = await arkVision(
    `你是 TikTok 爆款视频专家。请对以下脚本打分并给出改进建议。

产品：${product}
脚本：${JSON.stringify(script)}

请严格按 JSON 输出（只输出 JSON）：
{
  "score": 0-100的整数,
  "dimensions": {
    "hook_power": 0-20（前3秒钩子强度）,
    "pacing": 0-20（节奏紧凑度）,
    "emotion": 0-20（情绪共鸣感）,
    "cta_clarity": 0-20（行动号召清晰度）,
    "trend_fit": 0-20（当前 TikTok 趋势契合度）
  },
  "weaknesses": ["最大弱点1","弱点2"],
  "improvements": ["改进建议1","改进建议2"],
  "verdict": "通过|需优化|重写",
  "hook_rewrite": "改写后的前3秒钩子（英文）"
}`,
    '你是专业 TikTok 内容评审专家，只输出 JSON'
  );
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { score: 0, verdict: '需优化' };
}

// ── 素材库匹配 ──────────────────────────────────────────────────────────
// 让 LLM 分析分镜脚本，判断每个场景该用本地素材还是 AI 生成
async function matchMaterials(script, materials, product) {
  const matDesc = (materials || []).map((m, i) =>
    `素材${i+1}: ${m.name}（${m.type}，URL: ${m.url}）`
  ).join('\n');

  const txt = await arkVision(
    `你是视频剪辑师。根据分镜脚本和可用素材，给每个场景做匹配决策。

【产品】${product}
【分镜脚本】${JSON.stringify(script)}
【本地素材库】
${matDesc || '无本地素材'}

请输出 JSON（只输出JSON）：
{
  "matches": [
    {
      "scene_id": 1,
      "decision": "use_local | ai_generate | hybrid",
      "material_index": 0,
      "material_name": "如果 use_local，填素材名",
      "reason": "匹配理由",
      "seedance_prompt_override": "如果 ai_generate 或 hybrid，补充更详细的 Seedance prompt（英文）"
    }
  ],
  "summary": "匹配总结（一句话）"
}`,
    '你是视频剪辑师，只输出 JSON'
  );
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { matches: [], summary: '匹配失败' };
}

// ── 缺口分析与补缺提示词生成 ────────────────────────────────────────────
async function analyzeGaps(matchResult, script) {
  const unmatched = (matchResult.matches || []).filter(
    m => m.decision === 'ai_generate' || m.decision === 'hybrid'
  );
  const sceneIds = unmatched.map(m => m.scene_id);
  const gapScenes = (script.scenes || []).filter(s => sceneIds.includes(s.id));

  const txt = await arkVision(
    `你是短视频导演兼 Seedance prompt 工程师。以下场景无法用本地素材覆盖，需要 AI 生成。

【缺口场景】${JSON.stringify(gapScenes)}
【匹配分析】${JSON.stringify(matchResult)}

请为每个缺口场景生成高质量的 Seedance prompt，输出 JSON（只输出JSON）：
{
  "gap_scenes": [
    {
      "scene_id": 1,
      "scene_label": "场景名",
      "seedance_prompt": "极度详细的英文 Seedance prompt（包含：镜头运动、光线、配色、人物动作、场景氛围、画质要求、时长对应秒数）",
      "prompt_reasoning": "为什么这样写这个 prompt（中文）"
    }
  ],
  "total_gaps": 缺口数量,
  "note": "补充说明"
}`,
    '你是 Seedance prompt 专家，只输出 JSON'
  );
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { gap_scenes: [], total_gaps: 0 };
}

// ── 字幕/话术爆款化优化 ──────────────────────────────────────────────────
async function optimizeCopy(script, product, target) {
  const voiceover = script.voiceover_full
    || (script.scenes || []).map(s => s.voiceover).filter(Boolean).join(' ');

  const txt = await arkVision(
    `你是 TikTok 爆款文案专家。请优化以下视频脚本的字幕和旁白，使其更具感染力。

【产品】${product}
【目标用户】${target || '25-35岁美国年轻人'}
【原始脚本】${JSON.stringify(script)}
【配音稿】${voiceover}

优化要求：
- voiceover 要口语化、有节奏感、有情绪起伏
- on_screen_text 要简短有力、适合 9:16 竖屏
- 保留原意，但强化钩子和 CTA
- 全部输出英文

输出 JSON（只输出JSON）：
{
  "voiceover_full_optimized": "优化后的完整配音稿",
  "scenes_optimized": [
    {
      "scene_id": 1,
      "voiceover_optimized": "优化后配音",
      "on_screen_text_optimized": "优化后字幕",
      "emotion_note": "情感基调（如：紧迫/好奇/惊喜）"
    }
  ],
  "optimization_notes": ["优化要点"]
}`,
    '你是专业的 TikTok 文案优化师，只输出 JSON'
  );
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// ── 下载视频到临时目录 ─────────────────────────────────────────────────
async function downloadVideo(url, filename) {
  const tmpDir = path.join(os.tmpdir(), 'xinmeiti_generated');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dest = path.join(tmpDir, filename);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`下载失败 HTTP ${r.status}`);
  const buf = await r.buffer();
  fs.writeFileSync(dest, buf);
  return dest;
}

// ── 创作会话记录 (Creative Sessions) ─────────────────────────────────────
const SESSIONS_FILE = path.join(os.homedir(), '.xinmeiti', 'creative-sessions.json');

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function saveSessions(sessions) {
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

app.get('/api/creative/sessions', (_req, res) => {
  try {
    const sessions = loadSessions();
    res.json(sessions);
  } catch(e) {
    res.json([]);
  }
});

app.post('/api/creative/sessions', (req, res) => {
  try {
    const { prompt, script, score, output_name, output_url, product, target, seedance_tasks, scenes, status,
            publish_title, publish_caption, publish_tags, publish_hook } = req.body;
    const sessions = loadSessions();
    const session = {
      id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      created_at: new Date().toISOString(),
      product: product || '',
      target: target || '',
      prompt: prompt || `[AI全自动] ${product || ''}`,
      script: script || '',
      score: score || 0,
      output_name: output_name || '',
      output_url: output_url || '',
      seedance_tasks: seedance_tasks || [],
      scenes: scenes || [],
      status: status || 'completed',
      /* 发布文案 */
      publish_title: publish_title || '',
      publish_caption: publish_caption || '',
      publish_tags: publish_tags || [],
      publish_hook: publish_hook || '',
    };
    sessions.unshift(session); // 新会话放最前面
    // 最多保留 50 条
    if (sessions.length > 50) sessions.length = 50;
    saveSessions(sessions);
    res.json({ ok: true, session });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/creative/sessions/:id', (req, res) => {
  try {
    let sessions = loadSessions();
    sessions = sessions.filter(s => s.id !== req.params.id);
    saveSessions(sessions);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 全自动流水线 ─────────────────────────────────────────────────────────
app.post('/api/ai/autopilot', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // All events encoded as: data: {type, ...}\n\n
  const send = (type, extra) => res.write(`data: ${JSON.stringify({ type, ...extra })}\n\n`);

  const { ref_video_url, product, target, local_files, duration, ratio, generate_audio, watermark } = req.body;
  let { selling_points } = req.body;
  const dur = duration || 15;

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: 拆解对标视频
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'analyze', message: '🔍 豆包多模态拆解对标视频结构…' });
    send('log', { message: `[对标分析] 参考视频: ${ref_video_url || '无，基于通用爆款规律'}` });

    let refAnalysis = {};
    try {
      const userContent = ref_video_url
        ? [
            { type: 'text', text: '请拆解这个 TikTok 视频的内容结构：' },
            { type: 'video_url', video_url: { url: ref_video_url } },
          ]
        : '没有参考视频，请基于 TikTok 最新爆款规律分析。';

      const txt = await arkVision(userContent,
        `你是 TikTok 爆款分析专家。输出 JSON（只输出JSON）：
{"hook_type":"","hook_script":"","structure":[{"time":"","action":"","effect":""}],"pacing":"","visual_style":"","audio_style":"","emotion_arc":"","why_viral":"爆款原因","avoid":"规避点","replicable_elements":["可复用的元素"]}`
      );
      const m = txt.match(/\{[\s\S]*\}/);
      refAnalysis = m ? JSON.parse(m[0]) : { hook_type: '痛点', why_viral: '待分析' };
      send('step_done', { step: 'analyze', detail: `钩子类型：${refAnalysis.hook_type || '?'}` });
      send('log', { message: `[对标分析] ✓ 钩子：${refAnalysis.hook_type} · 节奏：${refAnalysis.pacing}` });
    } catch (e) {
      send('step_done', { step: 'analyze', detail: '分析失败，使用默认规律' });
      send('log', { message: `[对标分析] 失败: ${e.message}，继续` });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: 生成分镜脚本 + STEP 3: 爆款自检循环
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'script', message: '📝 豆包生成完整爆款分镜脚本…' });

    const matDesc = (local_files || []).map((f, i) =>
      `素材${i+1}: ${f.name}（${f.type}，${(f.size/1024/1024).toFixed(1)}MB，本地URL: ${f.url}）`
    ).join('\n');

    let bestScript = null, bestScore = 0, bestCheck = null;
    let currentSP = selling_points || product;

    for (let attempt = 1; attempt <= 3; attempt++) {
      send('log', { message: `[脚本生成] 第 ${attempt} 次…` });

      try {
      const scriptText = await arkVision(
        `你是顶级 TikTok 短视频导演。生成完整成片脚本（不是只做前3秒）。

【对标分析】${JSON.stringify(refAnalysis)}
【产品】${product}，卖点：${currentSP}
【目标用户】${target || '25-35岁美国年轻上班族'}
【本地素材】\n${matDesc || '无，全部 AI 生成'}
【总时长】${dur}秒

关键规则：
- 生成完整视频的所有场景（5-8个场景），不是只做开头
- 每个场景标注 type: "use_local" 或 "ai_generate"
- AI 场景写详细的英文 Seedance prompt（镜头运动/光线/配色/氛围/动作）
- voiceover 英文口语化，有情绪节奏
- voiceover_full = 连贯完整的英文配音稿
- 场景之间的视觉节奏有起承转合

输出 JSON（只输出JSON）：
{
  "title": "视频标题",
  "caption": "TikTok发布文案（英文+emoji）",
  "tags": ["标签"],
  "hook_strategy": "钩子策略",
  "voiceover_full": "完整英文配音稿（所有场景连贯）",
  "scenes": [
    {
      "id": 1,
      "label": "场景名",
      "duration": 3,
      "type": "ai_generate | use_local",
      "material_name": "如果use_local，填写素材名",
      "material_url": "如果use_local，填写URL",
      "seedance_prompt": "详细英文Seedance prompt（如果ai_generate）",
      "voiceover": "本段英文配音",
      "on_screen_text": "画面字幕（英文）",
      "visual_note": "视觉要点"
    }
  ]
}`,
        '你是顶级短视频导演，输出完整分镜（非仅钩子）'
      );

      const m = scriptText.match(/\{[\s\S]*\}/);
      if (!m) { send('log', { message: `[脚本] 第${attempt}次 JSON 解析失败` }); continue; }
      const script = JSON.parse(m[0]);
      send('script', { script, attempt });

      // 爆款自检
      send('step_start', { step: 'viralcheck', message: `🎯 爆款自检（第 ${attempt} 次）…` });
      const check = await viralCheck(script, product);

      const dims = check.dimensions || {};
      const scoreData = {
        score: check.score || 0,
        verdict: check.verdict || '需优化',
        hook_power: dims.hook_power || 0,
        pacing: dims.pacing || 0,
        emotion: dims.emotion || 0,
        cta_clarity: dims.cta_clarity || 0,
        trend_fit: dims.trend_fit || 0,
        weaknesses: check.weaknesses || [],
        improvements: check.improvements || [],
      };
      send('viral_score', { data: scoreData });
      send('log', { message: `[自检] 得分 ${scoreData.score}/100 · ${scoreData.verdict}` });

      if (scoreData.score > bestScore) {
        bestScore = scoreData.score;
        bestScript = script;
        bestCheck = scoreData;
      }
      if (scoreData.score >= 80 || scoreData.verdict === '通过') {
        send('step_done', { step: 'viralcheck', detail: `✅ ${scoreData.score}/100` });
        break;
      }
      if (attempt < 3) {
        send('step_done', { step: 'viralcheck', detail: `${scoreData.score}/100 需优化` });
        currentSP = `${currentSP}。改进：${scoreData.improvements.join('；')}`;
      } else {
        send('step_done', { step: 'viralcheck', detail: `最终 ${bestScore}/100` });
      }
    } catch (e) {
      send('step_done', { step: 'script', detail: `第${attempt}次失败: ${e.message}` });
      send('step_done', { step: 'viralcheck', detail: '跳过' });
      send('log', { message: `[脚本] 第${attempt}次 AI 调用失败: ${e.message}` });
    }
    }
    send('step_done', { step: 'script', detail: `${bestScore}/100 · ${bestScript?.scenes?.length || 0}场景` });
    send('log', { message: `[脚本] ✓ ${bestScript?.title || ''}` });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: 素材库智能匹配
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'match', message: '📂 豆包分析素材库匹配方案…' });
    let matchResult = { matches: [], summary: '无本地素材' };
    if (local_files && local_files.length > 0) {
      try {
        matchResult = await matchMaterials(bestScript, local_files, product);
        send('log', { message: `[素材匹配] ${matchResult.summary}` });
        send('step_done', { step: 'match', detail: matchResult.summary?.slice(0, 40) || '匹配完成' });
      } catch (e) {
        send('step_done', { step: 'match', detail: '匹配失败，全部AI生成' });
        send('log', { message: `[素材匹配] 失败: ${e.message}` });
      }
    } else {
      send('step_done', { step: 'match', detail: '无本地素材，全部AI生成' });
      send('log', { message: '[素材匹配] 无本地素材，跳过' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: 缺口分析 + 补缺提示词生成
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'gap', message: '🔎 豆包分析素材缺口 + 生成补缺 Prompt…' });
    let gapResult = { gap_scenes: [], total_gaps: 0 };
    try {
      gapResult = await analyzeGaps(matchResult, bestScript);
      send('log', { message: `[缺口分析] 发现 ${gapResult.total_gaps} 个缺口场景` });
      for (const gs of (gapResult.gap_scenes || [])) {
        send('log', { message: `  → 场景${gs.scene_id}「${gs.scene_label}」: ${(gs.seedance_prompt || '').slice(0, 80)}…` });
      }
      send('step_done', { step: 'gap', detail: `${gapResult.total_gaps} 个缺口 · ${gapResult.note || ''}` });
    } catch (e) {
      send('step_done', { step: 'gap', detail: '缺口分析失败' });
      send('log', { message: `[缺口分析] 失败: ${e.message}` });
    }

    // 将缺口 prompt 合并到脚本中
    if (gapResult.gap_scenes && gapResult.gap_scenes.length > 0) {
      const gapMap = {};
      for (const gs of gapResult.gap_scenes) {
        gapMap[gs.scene_id] = gs.seedance_prompt;
      }
      for (const s of (bestScript?.scenes || [])) {
        if (gapMap[s.id]) {
          s.seedance_prompt = gapMap[s.id];
          s._gap_filled = true;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: 字幕/话术爆款化优化
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'copy_opt', message: '✏️ 豆包优化字幕话术…' });
    let copyResult = null;
    try {
      copyResult = await optimizeCopy(bestScript, product, target);
      if (copyResult) {
        // 应用优化后的内容
        if (copyResult.voiceover_full_optimized) {
          bestScript.voiceover_full_original = bestScript.voiceover_full;
          bestScript.voiceover_full = copyResult.voiceover_full_optimized;
        }
        if (copyResult.scenes_optimized) {
          const optMap = {};
          for (const so of copyResult.scenes_optimized) {
            optMap[so.scene_id] = so;
          }
          for (const s of (bestScript?.scenes || [])) {
            const opt = optMap[s.id];
            if (opt) {
              if (opt.voiceover_optimized) s.voiceover = opt.voiceover_optimized;
              if (opt.on_screen_text_optimized) s.on_screen_text = opt.on_screen_text_optimized;
              s._emotion_note = opt.emotion_note;
            }
          }
        }
        send('log', { message: `[话术优化] ${(copyResult.optimization_notes || []).join('；')}` });
        send('step_done', { step: 'copy_opt', detail: '话术优化完成' });
      } else {
        send('step_done', { step: 'copy_opt', detail: '跳过（无文案）' });
      }
    } catch (e) {
      send('step_done', { step: 'copy_opt', detail: `优化失败: ${e.message}` });
      send('log', { message: `[话术优化] 失败: ${e.message}` });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: 全场景视频生成 → Seedance（每个 AI 场景都提交）
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'seedance', message: '🎬 全场景提交 Seedance 视频生成…' });
    const allScenes = bestScript?.scenes || [];
    const aiScenes = allScenes.filter(s =>
      s.type === 'ai_generate' || s.type === 'seedance_generate' || s._gap_filled || s.seedance_prompt
    );
    const localScenes = allScenes.filter(s =>
      s.type === 'use_local' || s.type === 'use_local_material' || (!s.seedance_prompt && s.material_url)
    );

    send('log', { message: `[场景分配] 共 ${allScenes.length} 场景：${aiScenes.length} AI生成 + ${localScenes.length} 本地素材` });

    const submittedTasks = [];
    for (const scene of aiScenes) {
      if (!scene.seedance_prompt) {
        send('log', { message: `  → 场景${scene.id} 无 prompt，跳过` });
        continue;
      }
      try {
        const taskData = await arkPost('/contents/generations/tasks', {
          model: cfg('DEFAULT_VIDEO_MODEL') || 'doubao-seedance-2-0-260128',
          content: [
            { type: 'text', text: scene.seedance_prompt },
            ...(ref_video_url ? [{ type: 'video_url', video_url: { url: ref_video_url }, role: 'reference_video' }] : []),
          ],
          ratio: ratio || '9:16',
          duration: Math.max(scene.duration || 5, 5),
          generate_audio: generate_audio !== undefined ? generate_audio : false,
          watermark: watermark || false,
        });
        const taskId = taskData.id || taskData.task_id;
        submittedTasks.push({
          scene_id: scene.id,
          label: scene.label,
          task_id: taskId,
          duration: scene.duration,
          seedance_prompt: scene.seedance_prompt,
        });
        send('seedance_task', { task_id: taskId, scene_id: scene.id, label: scene.label });
        send('log', { message: `  → 场景${scene.id}「${scene.label}」已提交: ${taskId?.slice(-10) || '?'}` });
      } catch (e) {
        send('log', { message: `  → 场景${scene.id} 提交失败: ${e.message}` });
      }
    }

    if (submittedTasks.length > 0) {
      send('step_done', { step: 'seedance', detail: `已提交 ${submittedTasks.length} 个 AI 场景` });
    } else {
      send('step_done', { step: 'seedance', detail: '无 AI 生成场景' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: TTS 配音
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'tts', message: '🔊 生成 TTS 配音…' });
    const voiceover = bestScript?.voiceover_full
      || (bestScript?.scenes || []).map(s => s.voiceover).filter(Boolean).join(' ');

    let audiob64 = null;
    const ttsAppId = cfg('TTS_APP_ID'), ttsToken = cfg('TTS_ACCESS_TOKEN'), ttsCluster = cfg('TTS_CLUSTER') || 'volcano_mega';
    if (ttsAppId && ttsToken && voiceover) {
      try {
        const ttsR = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
          method: 'POST',
          headers: { Authorization: `Bearer;${ttsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app: { appid: ttsAppId, token: ttsToken, cluster: ttsCluster },
            user: { uid: 'xinmeiti_autopilot' },
            audio: { voice_type: 'en_female_sarah_mars_bigtts', encoding: 'mp3', speed_ratio: 1.0, volume_ratio: 1.0, pitch_ratio: 1.0 },
            request: { reqid: 'ap_' + Date.now(), text: voiceover, operation: 'query' },
          }),
        });
        const ttsD = await ttsR.json();
        if (ttsD.code === 3000) {
          audiob64 = ttsD.data;
          send('tts_done', { audio_base64: audiob64 });
          send('step_done', { step: 'tts', detail: '配音完成' });
          send('log', { message: '[TTS] ✓ 配音生成完成' });
        } else {
          send('step_done', { step: 'tts', detail: `TTS ${ttsD.code}` });
          send('log', { message: `[TTS] 错误 ${ttsD.code}` });
        }
      } catch (e) {
        send('step_done', { step: 'tts', detail: `失败: ${e.message}` });
      }
    } else {
      send('step_done', { step: 'tts', detail: ttsAppId ? '无配音文案' : '未配TTS' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: 混剪方案（含本地+AI 视频清单）
    // ═══════════════════════════════════════════════════════════════════════
    send('step_start', { step: 'mixcut', message: '✂️ 规划最终混剪方案…' });

    const planLines = [];
    for (const s of (bestScript?.scenes || [])) {
      const matched = (matchResult.matches || []).find(m => m.scene_id === s.id);
      let sourceLabel;
      if (matched?.decision === 'use_local' && s.material_url) {
        sourceLabel = `📁 本地「${s.material_name || matched?.material_name || ''}」`;
      } else if (s.seedance_prompt) {
        const task = submittedTasks.find(t => t.scene_id === s.id);
        sourceLabel = task
          ? `🤖 Seedance 任务: ${task.task_id?.slice(-10) || '?'}`
          : `🤖 Seedance：${(s.seedance_prompt || '').slice(0, 50)}`;
      } else {
        sourceLabel = '⚠️ 未分配素材';
      }
      planLines.push(
        `场景${s.id}（${s.label}，${s.duration}s）→ ${sourceLabel}` +
        (s.voiceover ? `\n   🎤 配音：${s.voiceover.slice(0, 60)}` : '') +
        (s.on_screen_text ? `\n   📝 字幕：${s.on_screen_text.slice(0, 60)}` : '')
      );
    }

    send('mixcut', { plan: planLines.join('\n\n') });
    send('step_done', { step: 'mixcut', detail: `${bestScript?.scenes?.length || 0} 场景 · ${submittedTasks.length} AI任务` });

    // ── 最终汇总 ──────────────────────────────────────────────────────────
    send('done', {
      score: bestScore,
      total_scenes: allScenes.length,
      ai_scenes: submittedTasks.length,
      local_scenes: localScenes.length,
      seedance_tasks: submittedTasks.map(t => ({
        scene_id: t.scene_id,
        label: t.label,
        task_id: t.task_id,
      })),
      match_result: matchResult,
      scenes: bestScript?.scenes || [],
      voiceover_full: bestScript?.voiceover_full || '',
      local_files: local_files || [],
      product: product,
      dur: dur,
      /* 发布文案 */
      publish_title: bestScript?.title || '',
      publish_caption: bestScript?.caption || '',
      publish_tags: bestScript?.tags || [],
      publish_hook: bestScript?.hook_strategy || '',
      ref_url: ref_video_url || '',
      match_summary: matchResult.summary,
      gap_summary: gapResult.note,
    });
    send('log', { message: `🎉 全流程完成！得分 ${bestScore}/100 · ${allScenes.length}场景 · ${submittedTasks.length}个AI任务已提交` });

  } catch (e) {
    send('error', { message: e.message });
    send('log', { message: `❌ 错误: ${e.message}` });
  }
  res.end();
});

// ── AI 文案 (豆包) ────────────────────────────────────────────────────────
app.post('/api/ai/copywriting', async (req, res) => {
  const { product, selling_points, target, platform, count } = req.body;
  const model = cfg('DEFAULT_LLM_MODEL') || 'doubao-1-5-pro-32k-250115';
  const n = Math.min(count || 5, 10);

  const prompt = `你是一位专业的 TikTok 海外电商运营专家。请为以下产品生成 ${n} 条爆款短视频文案（英文），要求：
- 产品：${product || '未填写'}
- 卖点：${selling_points || '未填写'}
- 目标用户：${target || '25-35岁美国年轻人'}
- 平台：${platform || 'TikTok'}
- 每条文案包含：钩子开头（前3秒）、正文、CTA、3-5个话题标签
- 风格：真实感、UGC 风格，避免硬广感
- 每条用 JSON 格式输出：{"hook":"...","body":"...","cta":"...","tags":["..."],"title":"..."}
- 只输出 JSON 数组，不要其他内容`;

  try {
    const d = await arkPost('/chat/completions', {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
    });
    const text = d.choices?.[0]?.message?.content || '[]';
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    const items = match ? JSON.parse(match[0]) : [];
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI 脚本拆分 (豆包) ───────────────────────────────────────────────────
app.post('/api/ai/script', async (req, res) => {
  const { prompt, duration, count } = req.body;
  const model = cfg('DEFAULT_LLM_MODEL') || 'doubao-1-5-pro-32k-250115';

  const sysPrompt = `你是专业的短视频脚本导演。根据用户需求，生成分镜脚本。
输出格式为 JSON：{"title":"...","scenes":[{"id":1,"name":"场景名","duration":5,"shot":"画面描述（英文，用于AI绘图）","voiceover":"旁白/字幕（英文）","note":"拍摄备注"}]}
只输出 JSON，不要其他内容。共生成 ${count || 1} 个版本，放在数组里。`;

  try {
    const d = await arkPost('/chat/completions', {
      model,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `产品/主题：${prompt}，视频时长：${duration || 15}秒` },
      ],
      temperature: 0.7,
    });
    const text = d.choices?.[0]?.message?.content || '[]';
    const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    let scripts = [];
    if (match) {
      const parsed = JSON.parse(match[0]);
      scripts = Array.isArray(parsed) ? parsed : [parsed];
    }
    res.json({ ok: true, scripts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 视频生成 (Seedance/即梦) ──────────────────────────────────────────────
function inferContent(url) {
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  return { png:'image',jpg:'image',jpeg:'image',webp:'image',mp4:'video',mov:'video',mp3:'audio',wav:'audio' }[ext] || 'image';
}

// /api/video/create 支持完整 Seedance content 格式：
// { prompt, ratio, duration, generate_audio, watermark,
//   ref_images: [{url}], ref_videos: [{url}], ref_audios: [{url}], model }
app.post('/api/video/create', async (req, res) => {
  const {
    prompt, model, ratio, duration,
    generate_audio, watermark,
    ref_images, ref_videos, ref_audios,
  } = req.body;
  const taskModel = model || cfg('DEFAULT_VIDEO_MODEL') || 'doubao-seedance-2-0-260128';

  // Build content array in Seedance format
  const content = [];
  if (prompt) content.push({ type: 'text', text: prompt });
  for (const img of (ref_images || [])) {
    content.push({ type: 'image_url', image_url: { url: img.url }, role: img.role || 'reference_image' });
  }
  for (const vid of (ref_videos || [])) {
    content.push({ type: 'video_url', video_url: { url: vid.url }, role: vid.role || 'reference_video' });
  }
  for (const aud of (ref_audios || [])) {
    content.push({ type: 'audio_url', audio_url: { url: aud.url }, role: aud.role || 'reference_audio' });
  }

  const body = {
    model: taskModel,
    content,
    ratio: ratio || '9:16',
    duration: duration || 10,
  };
  if (generate_audio !== undefined) body.generate_audio = generate_audio;
  if (watermark !== undefined) body.watermark = watermark;

  try {
    const data = await arkPost('/contents/generations/tasks', body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/video/status/:taskId', async (req, res) => {
  try {
    res.json(await arkGet(`/contents/generations/tasks/${req.params.taskId}`));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 语音合成 (火山引擎 TTS) ───────────────────────────────────────────────
// 文档：https://www.volcengine.com/docs/6561/79817
const TTS_VOICES = [
  { id: 'zh_female_wanwanxiaohe_moon_bigtts', name: '温暖女声', lang: '中文' },
  { id: 'zh_male_qingsong_moon_bigtts', name: '轻松男声', lang: '中文' },
  { id: 'zh_female_shuangkuaisisi_moon_bigtts', name: '爽快思思', lang: '中文' },
  { id: 'en_female_sarah_mars_bigtts', name: 'Sarah (美式女)', lang: '英文' },
  { id: 'en_male_adam_mars_bigtts', name: 'Adam (美式男)', lang: '英文' },
  { id: 'en_female_emma_mars_bigtts', name: 'Emma (英式女)', lang: '英文' },
  { id: 'en_male_michael_mars_bigtts', name: 'Michael (英式男)', lang: '英文' },
  { id: 'zh_female_qingxin_mars_bigtts', name: '清新女声', lang: '中英混' },
];

app.get('/api/tts/voices', (req, res) => {
  res.json({ voices: TTS_VOICES });
});

app.post('/api/tts/create', async (req, res) => {
  const appId = cfg('TTS_APP_ID');
  const token = cfg('TTS_ACCESS_TOKEN');
  const cluster = cfg('TTS_CLUSTER') || 'volcano_mega';
  if (!appId || !token) return res.status(401).json({ error: '请在设置中填写 TTS_APP_ID 和 TTS_ACCESS_TOKEN' });

  const { text, voice_type } = req.body;
  if (!text) return res.status(400).json({ error: '请填写文案' });

  const reqId = 'req_' + Date.now();
  const payload = {
    app: { appid: appId, token, cluster },
    user: { uid: 'xinmeiti_user' },
    audio: {
      voice_type: voice_type || 'en_female_sarah_mars_bigtts',
      encoding: 'mp3',
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
    },
    request: { reqid: reqId, text, operation: 'query' },
  };

  try {
    const r = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer;${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (d.code !== 3000) return res.status(500).json({ error: d.message || '合成失败', code: d.code });
    // Return base64 audio
    res.json({ ok: true, audio_base64: d.data, format: 'mp3' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 本地素材服务 ──────────────────────────────────────────────────────────

// Serve local files so Seedance can access them via URL
app.use('/local-media', (req, res, next) => {
  // Only allow access to user's Desktop and Downloads
  const filePath = decodeURIComponent(req.path);
  const allowed = [os.homedir() + '/Desktop', os.homedir() + '/Downloads', os.homedir() + '/Movies'];
  const fullPath = path.join(os.homedir() + '/Desktop', filePath);
  const isAllowed = allowed.some(dir => fullPath.startsWith(dir));
  if (!isAllowed) return res.status(403).json({ error: 'Access denied' });
  res.sendFile(fullPath, err => { if (err && !res.headersSent) res.status(404).json({ error: 'File not found' }); });
});

// List local media files from Desktop
app.get('/api/local-files', (req, res) => {
  const dir = req.query.dir || os.homedir() + '/Desktop';
  const videoExts = ['.mp4', '.mov', '.avi', '.mkv'];
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
  try {
    const items = [];
    function scan(d, depth = 0) {
      if (depth > 2) return;
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(d, e.name);
        const ext = path.extname(e.name).toLowerCase();
        if (e.isDirectory() && depth < 2) scan(full, depth + 1);
        else if ([...videoExts, ...imageExts].includes(ext)) {
          const rel = path.relative(os.homedir() + '/Desktop', full);
          items.push({
            name: e.name,
            path: full,
            url: mediaUrl(rel),
            type: videoExts.includes(ext) ? 'video' : 'image',
            size: fs.statSync(full).size,
          });
        }
      }
    }
    scan(dir);
    res.json({ files: items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 成品库 ────────────────────────────────────────────────────────────────
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(os.homedir(), 'Desktop', '新媒体成品');
const TMP_DIR = process.env.TMP_DIR || os.tmpdir();
const PUBLIC_URL = process.env.PUBLIC_URL || `http://127.0.0.1:${server_port}`;

function outputUrl(name) {
  return `${PUBLIC_URL}/output-video/${encodeURIComponent(name)}`;
}
function mediaUrl(rel) {
  return `${PUBLIC_URL}/local-media/${encodeURIComponent(rel)}`;
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Serve finished videos
app.use('/output-video', (req, res) => {
  const filePath = decodeURIComponent(req.path).replace(/^\/+/, '');
  const full = path.join(OUTPUT_DIR, filePath);
  if (!full.startsWith(OUTPUT_DIR)) return res.status(403).end();
  res.sendFile(full, err => { if (err && !res.headersSent) res.status(404).end(); });
});

// List finished videos, newest first
app.get('/api/output/list', (req, res) => {
  ensureOutputDir();
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(n => /\.(mp4|mov)$/i.test(n))
      .map(n => {
        const full = path.join(OUTPUT_DIR, n);
        const stat = fs.statSync(full);
        return {
          name: n,
          size: stat.size,
          created: stat.birthtime.toISOString(),
          url: outputUrl(n),
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Download a remote video URL into the output dir
app.post('/api/output/download', async (req, res) => {
  const { url, filename } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  ensureOutputDir();
  const name = filename || `video_${Date.now()}.mp4`;
  const dest = path.join(OUTPUT_DIR, name);
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.buffer();
    fs.writeFileSync(dest, buf);
    res.json({
      ok: true,
      name,
      size: buf.length,
      url: outputUrl(name),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 豆包 LLM 文案生成 ──────────────────────────────────────────────────
// 独立端点：接收产品信息，生成多种风格的 TikTok 发布文案
app.post('/api/ai/generate-caption', async (req, res) => {
  try {
    const { product, selling_points, video_desc, style, num_variants } = req.body;
    if (!product) return res.status(400).json({ error: '请提供产品名称' });

    const model = cfg('DEFAULT_LLM_MODEL') || 'doubao-1-5-pro-32k-250115';
    const styleList = style ? [style] : ['pain_point', 'unboxing', 'comparison', 'story'];
    const count = Math.min(num_variants || 3, 5);

    const results = [];
    for (const s of styleList.slice(0, count)) {
      let stylePrompt = '';
      switch (s) {
        case 'pain_point':
          stylePrompt = '痛点钩子型：开头引发用户痛点共鸣，制造"你也有这个问题吧"的感觉，然后引出产品';
          break;
        case 'unboxing':
          stylePrompt = '开箱惊喜型：强调产品质感、开箱体验的满足感，带惊讶/惊喜情绪';
          break;
        case 'comparison':
          stylePrompt = '对比测评型：用"before/after"或"用了X个月"的时间线，突出产品真实效果';
          break;
        case 'story':
          stylePrompt = '故事叙述型：用一个小故事或用户场景引入，不着痕迹地展示产品';
          break;
        default:
          stylePrompt = s;
      }

      const prompt = `你是 TikTok Shop 短视频文案专家，专攻 US/UK 市场英文爆款文案。

【产品】${product}
【卖点】${selling_points || '高质量，性价比'}
【视频内容】${video_desc || '产品展示+使用场景+用户好评'}
【文案风格】${stylePrompt}

请为这个视频写一套完整的 TikTok 发布文案，输出 JSON（只输出 JSON）：
{
  "style": "${s}",
  "title": "视频标题（中文，≤20字，有爆款感）",
  "caption": "TikTok 发布正文（英文，包含 emoji，2-4行，每行不超过1句话，带换行分隔）",
  "hashtags": ["6-8个英文标签，混合热门标签和产品标签，每个以#开头"],
  "hook_line": "前3秒钩子文案（英文，一句话）",
  "cta_line": "行动号召文案（英文，一句话，引导用户点击购物车/查看链接）",
  "formatted": "完整的发布文案（标题+正文+标签合并格式，可直接复制到 TikTok）"
}`;

      try {
        const d = await arkPost('/chat/completions', {
          model, messages: [{ role: 'user', content: prompt }], temperature: 0.8, max_tokens: 2048
        });
        const text = d.choices?.[0]?.message?.content || '{}';
        const m = text.match(/\{[\s\S]*\}/);
        results.push(m ? JSON.parse(m[0]) : { style: s, error: 'JSON解析失败' });
      } catch (e) {
        results.push({ style: s, error: e.message });
      }
    }

    res.json({ ok: true, variants: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

let server_port = 8787;

// ── 完整创作流程 ───────────────────────────────────────────────────────────
// Step1: 对标账号分析 → 生成内容策略
app.post('/api/ai/strategy', async (req, res) => {
  const { account, product, selling_points, target } = req.body;
  const model = cfg('DEFAULT_LLM_MODEL') || 'doubao-1-5-pro-32k-250115';
  const prompt = `你是 TikTok 海外电商爆款内容策略师。
对标账号：${account || '未指定'}
产品：${product}
卖点：${selling_points}
目标用户：${target || '25-35岁美国年轻人'}

请输出以下 JSON（只输出 JSON，不要其他内容）：
{
  "account_style": "对标账号的内容风格分析（2句话）",
  "content_angle": ["3个差异化内容角度"],
  "hook_formulas": ["3个开场钩子公式"],
  "best_posting_times": ["最佳发布时间段"],
  "recommended_tags": ["8个推荐标签"],
  "video_structure": {
    "0-3s": "钩子开场",
    "3-8s": "痛点/场景展示",
    "8-12s": "产品解决方案",
    "12-15s": "CTA行动号召"
  }
}`;
  try {
    const d = await arkPost('/chat/completions', { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 });
    const text = d.choices?.[0]?.message?.content || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    res.json({ ok: true, strategy: match ? JSON.parse(match[0]) : {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step2: 基于素材 + 策略生成分镜脚本（含 Seedance prompt）
app.post('/api/ai/production-script', async (req, res) => {
  const { product, selling_points, strategy, materials, duration } = req.body;
  const model = cfg('DEFAULT_LLM_MODEL') || 'doubao-1-5-pro-32k-250115';

  const matDesc = (materials || []).map((m, i) => `素材${i+1}: ${m.name} (${m.type}, ${m.url})`).join('\n');
  const prompt = `你是专业的短视频导演，熟悉 Seedance AI 视频生成 prompt 写法。

产品：${product}
卖点：${selling_points}
内容策略：${JSON.stringify(strategy || {})}
可用素材：\n${matDesc || '无本地素材，全部 AI 生成'}
视频总时长：${duration || 15}秒

请生成一套完整的生产脚本，输出 JSON（只输出 JSON）：
{
  "title": "视频标题",
  "caption": "发布文案（英文）",
  "tags": ["标签"],
  "scenes": [
    {
      "id": 1,
      "duration": 3,
      "type": "ai_generate | use_material",
      "material_url": "如果 use_material 填素材 URL，否则留空",
      "seedance_prompt": "英文 Seedance prompt，详细描述画面（如果 ai_generate）",
      "voiceover": "英文旁白",
      "on_screen_text": "画面字幕"
    }
  ]
}`;
  try {
    const d = await arkPost('/chat/completions', { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 });
    const text = d.choices?.[0]?.message?.content || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    res.json({ ok: true, script: match ? JSON.parse(match[0]) : {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 批量混剪 ──────────────────────────────────────────────────────────────
const { spawn: spawnProc, execSync } = require('child_process');

const FFMPEG_BIN = (() => {
  try { return execSync('which ffmpeg').toString().trim(); } catch(e) { return 'ffmpeg'; }
})();

const FFPROBE_BIN = (() => {
  try { return execSync('which ffprobe').toString().trim(); } catch(e) { return 'ffprobe'; }
})();

// 探测视频：时长 + 是否有音轨
function probeMedia(filePath) {
  try {
    const out = execSync(
      `"${FFPROBE_BIN}" -v error -show_entries stream=codec_type,duration -show_entries format=duration -of json "${filePath}"`,
      { encoding: 'utf8' }
    );
    const j = JSON.parse(out);
    const hasAudio = (j.streams || []).some(s => s.codec_type === 'audio');
    let duration = parseFloat(j.format?.duration || 0);
    if (!duration) {
      const vs = (j.streams || []).find(s => s.codec_type === 'video');
      duration = parseFloat(vs?.duration || 0);
    }
    return { hasAudio, duration: duration || 0 };
  } catch(e) {
    return { hasAudio: false, duration: 0 };
  }
}

async function generateTTSToFile(text, lang) {
  if (!cfg('TTS_APP_ID') || !cfg('TTS_ACCESS_TOKEN')) return null;
  const voiceId = lang === 'zh' ? 'zh_female_shuangkuaisisi_moon_bigtts' : 'en_female_sarah_mars_bigtts';
  const payload = {
    app: { appid: cfg('TTS_APP_ID'), token: cfg('TTS_ACCESS_TOKEN'), cluster: cfg('TTS_CLUSTER') || 'volcano_mega' },
    user: { uid: 'mixcut' },
    audio: { voice_type: voiceId, encoding: 'mp3', speed_ratio: 1.0, volume_ratio: 1.0 },
    request: { reqid: `mc_${Date.now()}`, text, operation: 'query' },
  };
  const resp = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer;${cfg('TTS_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await resp.json();
  if (!d.data) throw new Error('TTS 返回为空');
  const tmpPath = path.join(os.tmpdir(), `mc_vo_${Date.now()}.mp3`);
  fs.writeFileSync(tmpPath, Buffer.from(d.data, 'base64'));
  return tmpPath;
}

app.post('/api/mixcut/plan', async (req, res) => {
  try {
    const { files, product, style, duration, voiceover_lang } = req.body;
    const fileList = (files || []).map((f, i) =>
      `file_index=${i}: ${f.name}（${(f.size/1024/1024).toFixed(1)}MB）`
    ).join('\n');

    const prompt = `你是专业 TikTok 短视频剪辑师。基于以下实拍素材，规划爆款混剪方案。

【素材列表】
${fileList}

【产品/场景】${product || '产品展示'}
【目标时长】${duration || 30}秒
【视频风格】${style || '开箱测评'}
【配音语言】${voiceover_lang === 'zh' ? '中文' : '英文'}

规则：
- file_index 必须是上面【素材列表】里列出的编号之一（取值范围 0 到 ${Math.max(0,(files||[]).length-1)}）。它是数组下标，不是文件名里的数字，绝对不要超出这个范围
- 前3秒必须是强钩子场景（选最冲击的素材）
- 每个片段使用时长3-8秒，节奏紧凑
- start/end 是从原素材截取的时间点（秒），start 从0开始
- voiceover 要口语化、有感染力、和画面紧密配合
- 按钩子→展示→信任→CTA 结构排列

只输出JSON（不要任何解释）：
{
  "voiceover": "完整配音稿（英文或中文连贯段落）",
  "style_note": "混剪风格说明（一句话）",
  "clips": [
    {
      "file_index": 0,
      "file_name": "片段名",
      "start": 0,
      "end": 4,
      "label": "场景标签",
      "voiceover_segment": "这段画面对应的配音",
      "note": "剪辑要点"
    }
  ]
}`;

    const planText = await arkVision(prompt, '你是专业短视频剪辑师，只输出JSON');
    const m = planText.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ error: 'AI 返回格式错误' });
    const plan = JSON.parse(m[0]);
    // 防御：AI 有时会把"片段N"或文件名里的数字当成索引导致越界，这里把 file_index 夹紧到有效范围
    const fileCount = (files || []).length;
    if (Array.isArray(plan.clips) && fileCount > 0) {
      plan.clips = plan.clips.map(c => {
        let fi = Number(c.file_index);
        if (!Number.isInteger(fi) || fi < 0) fi = 0;
        if (fi >= fileCount) fi = fileCount - 1;
        return { ...c, file_index: fi };
      });
    }
    res.json(plan);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mixcut/render', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (type, extra) => res.write('data: ' + JSON.stringify({ type, ...extra }) + '\n\n');

  const { plan, file_paths, keep_ambient, generate_voice, voiceover_lang } = req.body;

  let voicePath = null;
  try {
    // 1. 校验方案用到的文件：越界/缺失/无法解码的片段直接跳过，不再让整次合成失败
    const usedIndices = new Set((plan.clips || []).map(c => c.file_index));
    const skipSet = new Set();
    for (const idx of usedIndices) {
      const p = (file_paths || [])[idx];
      if (!p || !fs.existsSync(p)) { skipSet.add(idx); continue; }
      // 快速检查文件是否有可解码的视频流（避免 ffmpeg 半路卡死）
      try {
        const probe = execSync(
          `"${FFPROBE_BIN}" -v quiet -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "${p}"`,
          { timeout: 10000, encoding: 'utf8' }
        );
        if (!probe.trim()) skipSet.add(idx);
      } catch(pe) {
        skipSet.add(idx);
      }
    }
    if (skipSet.size) {
      send('progress', { pct: 4, msg: `⚠️ 跳过 ${skipSet.size} 个无效/越界素材，用其余片段继续合成` });
    }

    // 2. TTS voiceover
    if (generate_voice && plan.voiceover) {
      send('progress', { pct: 5, msg: '生成 AI 配音…' });
      try {
        voicePath = await generateTTSToFile(plan.voiceover, voiceover_lang || 'en');
        send('progress', { pct: 18, msg: '配音生成完成' });
      } catch(e) {
        send('progress', { pct: 18, msg: `配音失败(${e.message})，继续合成` });
      }
    }

    // 3. 探测每个素材（时长 + 音轨），只探测实际用到的文件
    send('progress', { pct: 20, msg: '分析素材…' });
    const probeCache = {};
    const clips = (plan.clips || [])
      .filter(c => file_paths[c.file_index] != null && !skipSet.has(c.file_index))
      .map(c => {
        const fp = file_paths[c.file_index];
        if (!probeCache[fp]) {
          try {
            probeCache[fp] = probeMedia(fp);
          } catch(e) {
            probeCache[fp] = { hasAudio: false, duration: 0 };
            send('progress', { pct: 20, msg: `⚠️ 跳过无法分析的素材: ${path.basename(fp)}` });
          }
        }
        const info = probeCache[fp];
        let s = Math.max(0, Number(c.start) || 0);
        let e = Number(c.end) || (s + 4);
        if (info.duration > 0) {
          e = Math.min(e, info.duration);
          if (s >= info.duration) s = Math.max(0, info.duration - 2);
        }
        if (e <= s) e = Math.min(info.duration || s + 3, s + 3);
        return { ...c, _s: s, _e: e, _hasAudio: info.hasAudio };
      })
      .filter(c => c._e > c._s);

    // 计算总时长前先检查有效片段
    const totalSec = clips.reduce((sum, c) => sum + (c._e - c._s), 0);
    if (!clips.length || totalSec <= 0) {
      throw new Error('没有有效的素材片段（检查方案裁剪时间或文件视频流是否正常）');
    }

    ensureOutputDir();
    const outName = `mixcut_${new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)}.mp4`;
    const outPath = path.join(OUTPUT_DIR, outName);

    send('progress', { pct: 24, msg: `共 ${clips.length} 段，${totalSec.toFixed(1)}s\n构建混剪方案…` });

    // Build ffmpeg args
    const args = [];
    clips.forEach(c => args.push('-i', file_paths[c.file_index]));
    const voiceIdx = clips.length;
    if (voicePath) args.push('-i', voicePath);

    const filterParts = [];
    const videoLabels = [];
    const audioLabels = [];
    const hasAudioClips = clips.some(c => c._hasAudio);

    clips.forEach((c, i) => {
      const s = c._s, e = c._e, segDur = e - s;
      // 视频：裁剪 → 统一 30fps → 缩放 9:16 letterbox
      filterParts.push(
        `[${i}:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,fps=30,` +
        `scale=1080:1920:force_original_aspect_ratio=decrease,` +
        `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`
      );
      videoLabels.push(`[v${i}]`);

      if (keep_ambient) {
        if (c._hasAudio) {
          filterParts.push(`[${i}:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,aresample=44100,volume=0.15[a${i}]`);
        } else {
          filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${segDur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
        }
        audioLabels.push(`[a${i}]`);
      } else if (voicePath && audioLabels.length !== i + 1) {
        // 保留环境音：生成静音轨用于后续混音
        filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${segDur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
        audioLabels.push(`[a${i}]`);
      }
    });

    // Concat video
    filterParts.push(`${videoLabels.join('')}concat=n=${clips.length}:v=1:a=0[vout]`);

    // Audio routing
    if (keep_ambient && audioLabels.length > 0) {
      filterParts.push(`${audioLabels.join('')}concat=n=${clips.length}:v=0:a=1[ambient]`);
      if (voicePath) {
        filterParts.push(`[${voiceIdx}:a]aresample=44100,apad,atrim=duration=${totalSec.toFixed(3)},asetpts=PTS-STARTPTS[vo]`);
        filterParts.push(`[ambient][vo]amix=inputs=2:duration=first:weights=1 1:normalize=0,alimiter=limit=0.95[aout]`);
      } else {
        filterParts.push(`[ambient]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`);
      }
    } else if (voicePath && audioLabels.length > 0) {
      // 有配音但没有留存环境音：用静音轨 + 配音混合
      filterParts.push(`${audioLabels.join('')}concat=n=${clips.length}:v=0:a=1[ambient]`);
      filterParts.push(`[${voiceIdx}:a]aresample=44100,apad,atrim=duration=${totalSec.toFixed(3)},asetpts=PTS-STARTPTS[vo]`);
      filterParts.push(`[ambient][vo]amix=inputs=2:duration=first:weights=0.2 1:normalize=0,alimiter=limit=0.95[aout]`);
    } else if (voicePath) {
      filterParts.push(`[${voiceIdx}:a]aresample=44100,apad,atrim=duration=${totalSec.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
    }

    const hasAudio = (keep_ambient && audioLabels.length > 0) || !!voicePath;
    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', '[vout]');
    if (hasAudio) args.push('-map', '[aout]');
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p');
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k');
    args.push('-movflags', '+faststart', '-y', outPath);

    send('progress', { pct: 28, msg: `ffmpeg 合成 ${totalSec.toFixed(1)}s 视频…` });

    // 4. Run ffmpeg with progress parsing + timeout + stderr capture
    const stderrLines = [];
    const FFMPEG_TIMEOUT_MS = 300_000; // 5 分钟超时，防止进程卡死
    await new Promise((resolve, reject) => {
      const ff = spawnProc(FFMPEG_BIN, args);
      let timer = setTimeout(() => {
        ff.kill('SIGTERM');
        stderrLines.push('[TIMEOUT] ffmpeg 超过 5 分钟未完成，已强制终止');
      }, FFMPEG_TIMEOUT_MS);

      ff.stderr.on('data', (d) => {
        const line = d.toString();
        stderrLines.push(line);
        const m = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (m && totalSec > 0) {
          const elapsed = parseInt(m[1])*3600 + parseInt(m[2])*60 + parseFloat(m[3]);
          const pct = Math.min(95, 28 + Math.round((elapsed / totalSec) * 67));
          send('progress', { pct, msg: `合成中 ${elapsed.toFixed(1)}/${totalSec}s` });
        }
      });

      ff.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else {
          // 保留最后 15 行 stderr 用于诊断
          const tail = stderrLines.slice(-15).join('\n').slice(0, 800);
          reject(new Error(`ffmpeg 退出码 ${code}\n\n诊断信息:\n${tail || '(无输出)'}`));
        }
      });
      ff.on('error', err => {
        clearTimeout(timer);
        reject(new Error(`ffmpeg 启动失败: ${err.message}`));
      });
    });

    if (voicePath) try { fs.unlinkSync(voicePath); } catch(e) {}
    send('progress', { pct: 98, msg: '写入成品库…' });
    send('done', {
      output_name: outName,
      output_url: outputUrl(outName),
      duration: totalSec.toFixed(1),
      msg: `合成完成！${outName} (${totalSec.toFixed(1)}s)`,
    });

  } catch(e) {
    if (voicePath) try { fs.unlinkSync(voicePath); } catch(_) {}
    send('error', { message: e.message });
  }
  res.end();
});

// ── 混剪合成（自动流水线输出）───────────────────────────────────────────
// 轮询 Seedance 任务直至完成
async function pollSeedanceTask(taskId, maxWaitSec = 300) {
  const start = Date.now();
  while (Date.now() - start < maxWaitSec * 1000) {
    const r = await arkGet(`/contents/generations/tasks/${taskId}`);
    const status = r.status || r.task_status || '';
    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      const videoUrl = r.content?.video_url || r.video_url || r.output_url || r.result_url || '';
      if (!videoUrl) {
        // 尝试从生成内容中提取
        const contents = r.content || r.generations || [];
        if (Array.isArray(contents)) {
          for (const c of contents) {
            if (c.video_url || c.url) return c.video_url || c.url;
          }
        }
      }
      return videoUrl || null;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Seedance 任务 ${taskId} 失败: ${r.error || r.message || '未知错误'}`);
    }
    await new Promise(rr => setTimeout(rr, 5000)); // 每 5 秒轮询一次
  }
  throw new Error(`Seedance 任务 ${taskId} 超时（等待 ${maxWaitSec}s）`);
}

// 下载 Seedance 生成的视频
async function downloadSeedanceResult(taskId, filename) {
  const videoUrl = await pollSeedanceTask(taskId);
  return await downloadVideo(videoUrl, filename);
}

app.post('/api/mixcut/autopilot-render', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (type, extra) => res.write('data: ' + JSON.stringify({ type, ...extra }) + '\n\n');

  const { seedance_tasks = [], local_files = [], scenes = [], match_result = {}, voiceover_full = '', product = '', dur = 30 } = req.body;

  try {
    // 1. 收集所有需要合成的文件路径
    const filePaths = [];    // 按场景顺序排列的文件路径
    const clipSegments = []; // 每段的裁剪信息
    let totalSec = 0;

    // 先下载所有 Seedance 视频
    if (seedance_tasks.length === 0) {
      send('progress', { pct: 45, msg: '无 Seedance 任务，直接使用本地素材…' });
    } else {
      send('progress', { pct: 5, msg: `等待 ${seedance_tasks.length} 个 Seedance 任务完成…` });
    }
    const seedanceMap = {};
    let completed = 0;
    for (const task of seedance_tasks) {
      try {
        send('progress', { pct: 5 + Math.round(40 * completed / seedance_tasks.length), msg: `下载场景${task.scene_id}: ${task.label}` });
        const filename = `seedance_scene${task.scene_id}_${Date.now()}.mp4`;
        const localPath = await downloadSeedanceResult(task.task_id, filename);
        seedanceMap[task.scene_id] = localPath;
        completed++;
        send('progress', { pct: 15 + Math.round(40 * completed / seedance_tasks.length), msg: `已完成 ${completed}/${seedance_tasks.length} AI视频` });
      } catch (e) {
        send('progress', { pct: 15 + Math.round(40 * completed / seedance_tasks.length), msg: `场景${task.scene_id}下载失败: ${e.message}` });
      }
    }

    // 2. 按场景顺序构建剪辑列表
    send('progress', { pct: 55, msg: '构建剪辑时间线…' });
    const allScenes = scenes || [];
    let lastAudioEnd = 0;

    for (const scene of allScenes) {
      const matched = (match_result?.matches || []).find(m => m.scene_id === scene.id);
      let videoPath = null;
      let useLocal = false;

      if (matched?.decision === 'use_local' && matched.material_url) {
        videoPath = matched.material_url;
        useLocal = true;
      } else if (seedanceMap[scene.id]) {
        videoPath = seedanceMap[scene.id];
      } else {
        continue; // 没有可用素材，跳过
      }

      if (useLocal && videoPath.startsWith('blob:') || videoPath.startsWith('file://')) {
        // 本地文件路径已经在 file_paths 格式中
        // Electron 的本地文件使用的是 file:// 协议
        // 这里需要通过 IPC 获取真实路径
        const localIdx = (local_files || []).findIndex(f =>
          f.url === videoPath || f.name === matched?.material_name
        );
        if (localIdx >= 0 && local_files[localIdx].path) {
          videoPath = local_files[localIdx].path;
        } else {
          continue; // 找不到文件
        }
      }

      if (videoPath && fs.existsSync(videoPath)) {
        const info = probeMedia(videoPath);
        const sceneDur = Math.min(scene.duration || 5, info.duration || 5);
        filePaths.push(videoPath);
        const idx = filePaths.length - 1;
        clipSegments.push({
          file_index: idx,
          start: 0,
          end: sceneDur,
          _s: 0,
          _e: sceneDur > 0 ? sceneDur : 5,
          _hasAudio: info.hasAudio,
          label: scene.label || `场景${scene.id}`,
          voiceover: scene.voiceover || '',
        });
        totalSec += sceneDur;
        lastAudioEnd += sceneDur;
      }
    }

    if (!clipSegments.length) {
      throw new Error('没有有效素材可以合成（Seedance 视频未下载成功或本地文件缺失）');
    }

    // 3. 配音
    let voicePath = null;
    const voText = voiceover_full || (allScenes.map(s => s.voiceover).filter(Boolean).join(' '));
    if (voText) {
      send('progress', { pct: 60, msg: '生成 AI 配音…' });
      try {
        voicePath = await generateTTSToFile(voText, 'en');
        send('progress', { pct: 68, msg: '配音完成' });
      } catch (e) {
        send('progress', { pct: 68, msg: `配音失败: ${e.message}` });
      }
    }

    // 4. ffmpeg 合成
    ensureOutputDir();
    const outName = `autopilot_${product?.slice(0, 12) || 'video'}_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}.mp4`;
    const outPath = path.join(OUTPUT_DIR, outName);

    send('progress', { pct: 70, msg: `ffmpeg 合成 ${totalSec.toFixed(1)}s 成片…` });

    const args = [];
    clipSegments.forEach(c => args.push('-i', filePaths[c.file_index]));
    const voiceIdx = clipSegments.length;
    if (voicePath) args.push('-i', voicePath);

    const filterParts = [];
    const videoLabels = [];
    const audioLabels = [];

    clipSegments.forEach((c, i) => {
      const s = c._s, e = c._e, segDur = e - s;
      filterParts.push(
        `[${i}:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,fps=30,` +
        `scale=1080:1920:force_original_aspect_ratio=decrease,` +
        `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`
      );
      videoLabels.push(`[v${i}]`);

      if (c._hasAudio) {
        filterParts.push(`[${i}:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,aresample=44100,volume=0.2[a${i}]`);
      } else {
        filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${segDur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
      }
      audioLabels.push(`[a${i}]`);
    });

    filterParts.push(`${videoLabels.join('')}concat=n=${clipSegments.length}:v=1:a=0[vout]`);
    filterParts.push(`${audioLabels.join('')}concat=n=${clipSegments.length}:v=0:a=1[ambient]`);

    if (voicePath) {
      filterParts.push(`[${voiceIdx}:a]aresample=44100,apad,atrim=duration=${totalSec.toFixed(3)},asetpts=PTS-STARTPTS[vo]`);
      filterParts.push(`[ambient][vo]amix=inputs=2:duration=first:weights=0.4 1:normalize=0,alimiter=limit=0.95[aout]`);
    } else {
      filterParts.push(`[ambient]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`);
    }

    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', '[vout]', '-map', '[aout]');
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-b:a', '128k');
    args.push('-movflags', '+faststart', '-y', outPath);

    const stderrLines2 = [];
    await new Promise((resolve, reject) => {
      const ff = spawnProc(FFMPEG_BIN, args);
      const timer = setTimeout(() => {
        ff.kill('SIGTERM');
        stderrLines2.push('[TIMEOUT] ffmpeg 超时被终止');
      }, 300_000);

      ff.stderr.on('data', (d) => {
        const line = d.toString();
        stderrLines2.push(line);
        const m = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (m && totalSec > 0) {
          const elapsed = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
          const pct = Math.min(95, 70 + Math.round((elapsed / totalSec) * 25));
          send('progress', { pct, msg: `合成 ${elapsed.toFixed(1)}/${totalSec}s` });
        }
      });
      ff.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else {
          const tail = stderrLines2.slice(-15).join('\n').slice(0, 800);
          reject(new Error(`ffmpeg 退出码 ${code}\n\n诊断信息:\n${tail || '(无输出)'}`));
        }
      });
      ff.on('error', err => {
        clearTimeout(timer);
        reject(new Error(`ffmpeg 启动失败: ${err.message}`));
      });
    });

    if (voicePath) try { fs.unlinkSync(voicePath); } catch (_) {}

    send('progress', { pct: 99, msg: '写入成品库…' });
    send('done', {
      output_name: outName,
      output_path: outPath,
      output_url: outputUrl(outName),
      duration: totalSec.toFixed(1),
      msg: `✅ 成片已生成：${outName}`,
    });

  } catch (e) {
    send('error', { message: e.message });
  }
  res.end();
});

// ── TikTok OAuth ──────────────────────────────────────────────────────────
app.get('/api/tiktok/auth-url', (req, res) => {
  const clientKey = cfg('TIKTOK_CLIENT_KEY');
  const redirectUri = cfg('TIKTOK_REDIRECT_URI') || 'https://localhost/callback';
  if (!clientKey) return res.status(401).json({ error: '请先在设置中填写 TIKTOK_CLIENT_KEY' });
  const scopes = 'user.info.basic,video.upload,video.publish';
  const state = Math.random().toString(36).slice(2);
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  res.json({ url, state });
});

// ── Start ─────────────────────────────────────────────────────────────────
function startServer(preferredPort = 8787, bindHost = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = app.listen(preferredPort, bindHost, () => { server_port = server.address().port; resolve(server_port); });
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        const s2 = app.listen(0, bindHost, () => resolve(s2.address().port));
        s2.on('error', reject);
      } else reject(e);
    });
  });
}

module.exports = { startServer };
