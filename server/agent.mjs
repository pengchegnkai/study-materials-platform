/**
 * server/agent.mjs —— 全自动题库采集 Agent（Termux 自托管版）
 *
 * Cloudflare 架构映射：
 * - Cron Trigger（每 6h）        → 进程内 setInterval
 * - Durable Object（单实例串行） → 进程内单例 + 串行 promise 锁
 * - Queue consumer               → crawl_tasks 表 + 内存串行 worker
 * - D1                           → SQLite（data/app.db）
 *
 * 安全底线：
 * - CRAWL_ALLOWED_DOMAINS 为空 → Agent 拒绝启动
 * - AGENT_ENABLED 默认 false，管理员显式开启才生效
 * - 不跟随站外链接 / 不绕过反爬（403/429 直接失败不重试）/ 不修改已有内容
 * - 全量决策日志，passages 默认 reviewed=0 + private，门禁全过才 publish
 */
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';

export function initAgent({ db, logActivity, requireAdmin, requireActive, rid, sha256hex }) {
  const CFG = {
    domains: () => (process.env.CRAWL_ALLOWED_DOMAINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    seedsEnv: () => (process.env.CRAWL_SEED_URLS || '').split(',').map((s) => s.trim()).filter(Boolean),
    userAgent: () => process.env.CRAWL_USER_AGENT || 'study-materials-agent/1.0 (+contact: admin@localhost)',
    minScore: () => Number(process.env.AGENT_MIN_QUALITY_SCORE || 85),
    dailyLimit: () => Number(process.env.AGENT_DAILY_PUBLISH_LIMIT || 15),
    enabledDefault: () => (process.env.AGENT_ENABLED === 'true'),
    aiBase: () => (process.env.AI_API_BASE || '').replace(/\/+$/, ''),
    aiKey: () => process.env.AI_API_KEY || '',
    aiModel: () => process.env.AI_MODEL || 'gpt-4o-mini',
    perRound: 10,      // 每轮最多详情页数
    taskTimeoutMs: 60_000,
    fetchTimeoutMs: 15_000,
    maxLinksPerPage: 50,
  };
  const isAllowed = (url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return CFG.domains().some((d) => host === d || host.endsWith('.' + d));
    } catch { return false; }
  };

  // ================= 数据模型 =================
  db.exec(`CREATE TABLE IF NOT EXISTS passages (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT NOT NULL,
    word_count INTEGER,
    questions TEXT NOT NULL,          -- JSON: [{question, options[], answer, explanation}]
    content_hash TEXT NOT NULL UNIQUE,
    source_type TEXT,                 -- gaokao | mock | textbook | practice | unknown
    source_detail TEXT,
    source_url TEXT,
    domain TEXT,
    quality_score INTEGER,
    reasons TEXT,                     -- JSON 数组（门禁/AI 原因）
    reviewed INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_by TEXT NOT NULL DEFAULT 'agent',
    run_id TEXT,
    published_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS crawl_tasks (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|failed|timeout
    error TEXT,
    passage_id TEXT,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS agent_state (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    frozen INTEGER NOT NULL DEFAULT 0,
    frozen_reason TEXT,
    frozen_at INTEGER,
    enabled INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    last_seed_url TEXT,
    daily_publish_count INTEGER NOT NULL DEFAULT 0,
    daily_date TEXT NOT NULL DEFAULT '',
    domain_fails TEXT NOT NULL DEFAULT '{}',   -- JSON: {domain: 连续403/429次数}
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    seed_url TEXT,
    discovered_count INTEGER DEFAULT 0,
    fetched_count INTEGER DEFAULT 0,
    extracted_count INTEGER DEFAULT 0,
    published_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running'
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS agent_decisions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    url TEXT NOT NULL,
    action TEXT NOT NULL,
    quality_score INTEGER,
    reasons TEXT,
    passage_id TEXT,
    created_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_decisions_run ON agent_decisions(run_id, created_at)');
  db.exec(`CREATE TABLE IF NOT EXISTS agent_seeds (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    last_crawled_at INTEGER,
    total_output INTEGER NOT NULL DEFAULT 0,
    zero_streak INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS question_reports (
    id TEXT PRIMARY KEY,
    passage_id TEXT NOT NULL,
    user_id TEXT,
    username TEXT,
    reason TEXT NOT NULL,             -- answer_wrong | other
    detail TEXT,
    created_at INTEGER NOT NULL
  )`);

  // env 种子首次导入
  const seedCount = db.prepare('SELECT COUNT(*) AS c FROM agent_seeds').get().c;
  if (seedCount === 0 && CFG.seedsEnv().length > 0) {
    for (const url of CFG.seedsEnv()) {
      if (!isAllowed(url)) continue;
      db.prepare('INSERT OR IGNORE INTO agent_seeds (id, url, created_at) VALUES (?, ?, ?)')
        .run(rid('seed'), url, Date.now());
    }
  }

  // ================= Agent 状态 =================
  const getState = () => {
    let row = db.prepare("SELECT * FROM agent_state WHERE id='singleton'").get();
    if (!row) {
      db.prepare(`INSERT INTO agent_state (id, enabled, updated_at) VALUES ('singleton', ?, ?)`)
        .run(CFG.enabledDefault() ? 1 : 0, Date.now());
      row = db.prepare("SELECT * FROM agent_state WHERE id='singleton'").get();
    }
    // 每日 0 点重置 daily_publish_count
    const today = new Date().toISOString().slice(0, 10);
    if (row.daily_date !== today) {
      db.prepare("UPDATE agent_state SET daily_publish_count=0, daily_date=?, updated_at=? WHERE id='singleton'").run(today, Date.now());
      row.daily_publish_count = 0; row.daily_date = today;
    }
    return row;
  };
  const updateState = (fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE agent_state SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id='singleton'`)
      .run(...keys.map((k) => fields[k]), Date.now());
  };
  const logDecision = (runId, url, action, extra = {}) => {
    db.prepare('INSERT INTO agent_decisions (id, run_id, url, action, quality_score, reasons, passage_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(rid('dec'), runId, url, action, extra.qualityScore ?? null, extra.reasons ? JSON.stringify(extra.reasons) : null, extra.passageId ?? null, Date.now());
  };

  // ================= AI（OpenAI 兼容） =================
  async function chatJSON(messages, maxTokens = 4096) {
    if (!CFG.aiBase() || !CFG.aiKey()) throw new Error('AI 未配置（AI_API_BASE / AI_API_KEY）');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const resp = await fetch(`${CFG.aiBase()}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.aiKey()}` },
        body: JSON.stringify({ model: CFG.aiModel(), messages, temperature: 0.2, max_tokens: maxTokens }),
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`AI 接口 ${resp.status}`);
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      return JSON.parse(m ? m[0] : text);
    } finally { clearTimeout(t); }
  }

  // ================= 工具集（受限，硬限制内实现） =================
  async function fetchPage(url) {
    if (!isAllowed(url)) throw new Error('域名不在白名单');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CFG.fetchTimeoutMs);
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': CFG.userAgent(), Accept: 'text/html,*/*' },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      // 不绕过反爬：403/429 直接失败，不重试、不换 UA
      if (resp.status === 403 || resp.status === 429) {
        const err = new Error(`HTTP ${resp.status}（反爬拒绝，不重试）`);
        err.blocked = true;
        throw err;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } finally { clearTimeout(t); }
  }

  function extractLinks(html, baseUrl) {
    const out = [];
    const seen = new Set();
    const re = /href=["']([^"'#?]+)["']/gi;
    let m;
    while ((m = re.exec(html)) && out.length < CFG.maxLinksPerPage) {
      try {
        const u = new URL(m[1], baseUrl);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        if (!isAllowed(u.href)) continue; // 不跟随站外链接
        const s = u.href.split('#')[0];
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
      } catch { /* 忽略非法链接 */ }
    }
    return out;
  }

  const isLikelyQuestionPage = (url) =>
    !/\/(login|register|tag|category|about|contact|search|user|member)\b/i.test(url)
    && /(question|question|exercise|practice|exam|test|paper|item|tiku|shiti|passage|reading|\d{3,})/i.test(url);

  // ================= 提取与评估 =================
  function htmlToText(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function extractQuestions(text, url) {
    const questions = await chatJSON([
      { role: 'system', content: '你是英语试题结构化助手。只输出 JSON，不要任何解释。' },
      { role: 'user', content: `从下面的英语阅读/完形材料中提取题目。输出 JSON 数组，每题形如：
{"question":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A","explanation":"解析（无则空字符串）"}
要求：answer 必须是选项字母或选项原文；无法确认答案则填 null。材料来源：${url}

材料正文：
${text.slice(0, 12000)}` },
    ]);
    if (!Array.isArray(questions)) throw new Error('AI 未返回题目数组');
    return questions
      .filter((q) => q && typeof q.question === 'string' && q.question.trim())
      .map((q) => ({
        question: q.question.trim(),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        answer: q.answer == null ? null : String(q.answer).trim(),
        explanation: q.explanation ? String(q.explanation).trim() : '',
      }));
  }

  async function evaluateQuality(passage) {
    const result = await chatJSON([
      { role: 'system', content: '你是英语试题质量审核员。只输出 JSON。' },
      { role: 'user', content: `评估下面试题材料的质量，输出 {"score":0-100,"reasons":["..."],"confidence":"high|medium|low"}。
维度：①答案合理性（正确答案是否与正文一致——最重点，无法判断答案对错时必须 confidence=low，不能猜）②题目完整性（选项齐全、题干清晰）③解析质量（解释而非复述答案）④来源可信度 ⑤排版质量（截断/混入导航文字）。

材料：
标题：${passage.title || ''}
正文（前 6000 字）：${(passage.content || '').slice(0, 6000)}
题目数：${passage.questions.length}
第一题：${JSON.stringify(passage.questions[0] ?? {}).slice(0, 1500)}` },
    ], 1024);
    return {
      score: Math.max(0, Math.min(100, Number(result.score) || 0)),
      reasons: Array.isArray(result.reasons) ? result.reasons.map(String).slice(0, 10) : [],
      confidence: ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'low',
    };
  }

  const countWords = (text) => (text.match(/[A-Za-z']+/g) || []).length;

  function detectSourceType(passage) {
    const hay = `${passage.title || ''} ${passage.source_detail || ''} ${(passage.content || '').slice(0, 500)}`.toLowerCase();
    if (/(高考|gaokao)/.test(hay)) return 'gaokao';
    if (/(模拟|模考|mock)/.test(hay)) return 'mock';
    if (/(教材|课本|textbook|必修|选修)/.test(hay)) return 'textbook';
    if (/(练习|practice|专项|同步)/.test(hay)) return 'practice';
    return 'unknown';
  }

  // ================= 质量门禁（全部通过才自动发布） =================
  function runGates(passage, aiEval, isDup) {
    const reasons = [];
    const qCount = passage.questions.length;
    const withAnswer = passage.questions.filter((q) => q.answer && String(q.answer).trim() && String(q.answer).trim() !== 'null');
    const withExpl = passage.questions.filter((q) => q.explanation && q.explanation.trim());
    const optsOk = passage.questions.every((q) => Array.isArray(q.options) && q.options.length >= 2);
    const answerInRange = passage.questions.every((q) => {
      if (!q.answer) return false;
      const a = String(q.answer).trim().toUpperCase();
      return q.options.some((o) => o.trim().toUpperCase().startsWith(a)) || q.options.includes(String(q.answer).trim());
    });
    const explRatio = qCount ? withExpl.length / qCount : 0;
    const wc = passage.word_count ?? countWords(passage.content);

    if (isDup) reasons.push('content_hash 与现有内容重复');
    if (aiEval.score < CFG.minScore()) reasons.push(`AI 质量分 ${aiEval.score} < ${CFG.minScore()}`);
    if (aiEval.confidence === 'low') reasons.push('AI 置信度 low（无法确认答案正确性）');
    if (withAnswer.length !== qCount) reasons.push(`存在空答案题 ${qCount - withAnswer.length} 道`);
    if (!answerInRange) reasons.push('存在答案不在选项范围内的题目');
    if (!optsOk) reasons.push('存在选项不完整的题目');
    if (explRatio < 0.8) reasons.push(`解析完整性 ${(explRatio * 100).toFixed(0)}% < 80%`);
    if (!passage.source_detail || !passage.source_detail.trim()) reasons.push('来源详情为空');
    if (!passage.source_type || passage.source_type === 'unknown') reasons.push('无法识别来源类型（gaokao/mock/textbook/practice）');
    // 题材词数门禁：完形 150–450、阅读 200–600（按题干关键词粗判题材）
    const isCloze = /cloze|完形/i.test(`${passage.title} ${passage.source_detail}`);
    const lo = isCloze ? 150 : 200, hi = isCloze ? 450 : 600;
    if (wc < lo || wc > hi) reasons.push(`正文词数 ${wc} 超出合规范围 ${lo}–${hi}`);
    if (qCount < 4 || qCount > 12) reasons.push(`题目数 ${qCount} 不在 4–12 范围`);
    return { pass: reasons.length === 0, reasons, qualityScore: aiEval.score };
  }

  // ================= 熔断机制 =================
  function bumpDomainFail(domain) {
    const st = getState();
    const fails = JSON.parse(st.domain_fails || '{}');
    fails[domain] = (fails[domain] || 0) + 1;
    updateState({ domain_fails: JSON.stringify(fails) });
    if (fails[domain] >= 3) freeze(`域名 ${domain} 连续 3 次返回 403/429`);
  }
  const resetDomainFail = (domain) => {
    const st = getState();
    const fails = JSON.parse(st.domain_fails || '{}');
    if (fails[domain]) { delete fails[domain]; updateState({ domain_fails: JSON.stringify(fails) }); }
  };

  function checkReportFreeze() {
    // 最近 5 条 answer_wrong 举报全部指向 Agent 发布的 passages → 冻结
    const rows = db.prepare(
      `SELECT r.id, p.created_by FROM question_reports r
       LEFT JOIN passages p ON p.id = r.passage_id
       WHERE r.reason='answer_wrong' ORDER BY r.created_at DESC LIMIT 5`
    ).all();
    if (rows.length >= 5 && rows.every((r) => r.created_by === 'agent')) {
      freeze('连续 5 篇被学生举报答案错误');
    }
  }

  function freeze(reason) {
    const st = getState();
    if (!st.frozen) {
      updateState({ frozen: 1, frozen_reason: reason, frozen_at: Date.now() });
      logActivity({ sub: '', username: 'agent' }, 'agent_frozen', `采集 Agent 已冻结：${reason}`);
      console.log(`[agent] 已冻结：${reason}`);
    }
  }

  // ================= 串行锁（单实例，替代 Durable Object） =================
  let chain = Promise.resolve();
  const serialized = (fn) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };

  // ================= 一轮决策循环 =================
  let running = false;
  async function runCycle(reason = 'cron') {
    return serialized(async () => {
      const st = getState();
      if (!st.enabled) {
        console.log('[agent] 未启用，本轮跳过');
        return { skipped: 'disabled' };
      }
      if (st.frozen) {
        console.log(`[agent] 已冻结（${st.frozen_reason}），本轮跳过`);
        logActivity({ sub: '', username: 'agent' }, 'agent_skip', `熔断冻结中，跳过本轮：${st.frozen_reason}`);
        return { skipped: 'frozen' };
      }
      if (CFG.domains().length === 0) {
        console.log('[agent] CRAWL_ALLOWED_DOMAINS 为空，拒绝运行');
        return { skipped: 'no_domains' };
      }
      if (st.daily_publish_count >= CFG.dailyLimit()) {
        freeze(`当日自动发布数已达上限 ${CFG.dailyLimit()}`);
        return { skipped: 'daily_limit' };
      }
      if (running) return { skipped: 'already_running' };
      running = true;

      const runId = rid('run');
      db.prepare('INSERT INTO agent_runs (id, started_at, seed_url) VALUES (?, ?, ?)').run(runId, Date.now(), '');
      console.log(`[agent] 开始本轮（${reason}）run=${runId}`);
      const stats = { discovered: 0, fetched: 0, extracted: 0, published: 0, rejected: 0, failed: 0 };
      let lastSeedUrl = st.last_seed_url;

      try {
        // 轮询选种子：last_crawled_at 最久优先
        const seeds = db.prepare('SELECT * FROM agent_seeds ORDER BY (last_crawled_at IS NULL) DESC, last_crawled_at ASC').all()
          .filter((s) => isAllowed(s.url));
        if (seeds.length === 0) throw new Error('无可用种子（白名单为空或种子不在白名单内）');
        const seed = seeds[0];

        // 3–4. 抓列表页，发现详情页
        let links = [];
        try {
          const html = await fetchPage(seed.url);
          const detailLinks = extractLinks(html, seed.url).filter(isLikelyQuestionPage);
          const known = new Set(
            db.prepare("SELECT url FROM crawl_tasks WHERE status IN ('done','failed') AND url IS NOT NULL")
              .all().map((r) => r.url)
              .concat(db.prepare('SELECT source_url FROM passages WHERE source_url IS NOT NULL').all().map((r) => r.source_url))
          );
          links = [...new Set(detailLinks)].filter((u) => !known.has(u)).slice(0, CFG.perRound);
          db.prepare('UPDATE agent_seeds SET last_crawled_at=? WHERE id=?').run(Date.now(), seed.id);
          lastSeedUrl = seed.url;
        } catch (e) {
          if (e.blocked) bumpDomainFail(new URL(seed.url).hostname);
          logDecision(runId, seed.url, 'failed', { reasons: [`列表页抓取失败：${e.message}`] });
          stats.failed++;
        }

        // 5. 逐个详情页：建任务 → 串行 worker 处理 → 门禁决策
        for (const url of links) {
          if (getState().frozen) break; // 熔断即停
          if (getState().daily_publish_count >= CFG.dailyLimit()) break;
          const taskId = rid('task');
          db.prepare('INSERT INTO crawl_tasks (id, run_id, url, status, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(taskId, runId, url, 'pending', Date.now());
          stats.discovered++;
          logDecision(runId, url, 'discovered');

          // 串行执行抓取+提取（每次处理一个页面）
          processTask(taskId, runId, url).catch(() => {});

          // 等待任务完成（轮询，60s 超时）
          const deadline = Date.now() + CFG.taskTimeoutMs;
          let task;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 800));
            task = db.prepare('SELECT * FROM crawl_tasks WHERE id=?').get(taskId);
            if (task && task.status !== 'pending' && task.status !== 'running') break;
          }
          if (!task || task.status === 'pending' || task.status === 'running') {
            db.prepare("UPDATE crawl_tasks SET status='timeout', finished_at=? WHERE id=?").run(Date.now(), taskId);
            logDecision(runId, url, 'failed', { reasons: ['处理超时（60s）'] });
            stats.failed++;
            continue;
          }

          if (task.status !== 'done' || !task.passage_id) {
            stats.failed++;
            continue; // processTask 内已记录 fetched/failed 决策
          }
          stats.fetched++;
          stats.extracted++;

          const passage = db.prepare('SELECT * FROM passages WHERE id=?').get(task.passage_id);
          if (!passage) continue;

          // 质量评估 + 门禁
          let aiEval = { score: 0, reasons: ['AI 未配置或评估失败'], confidence: 'low' };
          try { aiEval = await evaluateQuality(passage); } catch (e) { aiEval.reasons = [`AI 评估失败：${e.message}`]; }
          db.prepare('UPDATE passages SET quality_score=?, reasons=? WHERE id=?')
            .run(aiEval.score, JSON.stringify(aiEval.reasons), passage.id);

          const dup = false; // 去重已在 processTask 入库前完成（duplicate 决策）

          const gates = runGates(passage, aiEval, false);
          if (dup) {
            logDecision(runId, url, 'duplicate', { reasons: ['content_hash 重复'], passageId: passage.id });
            stats.rejected++;
          } else if (!gates.pass) {
            logDecision(runId, url, 'low_quality', { qualityScore: gates.qualityScore, reasons: gates.reasons, passageId: passage.id });
            db.prepare('UPDATE passages SET reasons=? WHERE id=?').run(JSON.stringify(gates.reasons), passage.id);
            stats.rejected++;
          } else {
            // 全部门禁通过 → 发布
            db.prepare("UPDATE passages SET reviewed=1, visibility='published', published_at=? WHERE id=?")
              .run(Date.now(), passage.id);
            const stNow = getState();
            updateState({ daily_publish_count: stNow.daily_publish_count + 1 });
            logDecision(runId, url, 'published', { qualityScore: gates.qualityScore, reasons: ['全部门禁通过'], passageId: passage.id });
            stats.published++;
            db.prepare('UPDATE agent_seeds SET total_output=total_output+1, zero_streak=0 WHERE id=?').run(seed.id);
          }
        }

        // 种子零产出计数
        if (stats.published === 0 && stats.extracted === 0) {
          db.prepare('UPDATE agent_seeds SET zero_streak=zero_streak+1 WHERE id=?').run(seed.id);
        }

        // 单轮失败率熔断
        const attempted = stats.fetched + stats.failed;
        if (attempted >= 3 && stats.failed / attempted > 0.6) {
          freeze(`单轮失败率 ${(stats.failed / attempted * 100).toFixed(0)}% > 60%`);
        }
      } catch (e) {
        db.prepare("UPDATE agent_runs SET status='aborted', finished_at=? WHERE id=?").run(Date.now(), runId);
        logDecision(runId, 'cycle', 'failed', { reasons: [`本轮异常：${e.message}`] });
        console.log(`[agent] 本轮异常：${e.message}`);
      } finally {
        running = false;
        const done = db.prepare("SELECT status FROM agent_runs WHERE id=?").get(runId);
        if (done && done.status !== 'aborted') {
          db.prepare(`UPDATE agent_runs SET finished_at=?, discovered_count=?, fetched_count=?, extracted_count=?, published_count=?, rejected_count=?, status='done' WHERE id=?`)
            .run(Date.now(), stats.discovered, stats.fetched, stats.extracted, stats.published, stats.rejected, runId);
        }
        updateState({ last_run_at: Date.now(), last_seed_url: lastSeedUrl || '' });
        logActivity({ sub: '', username: 'agent' }, 'agent_run', `本轮完成：发现 ${stats.discovered}，发布 ${stats.published}，拒绝 ${stats.rejected}，失败 ${stats.failed}`);
        console.log(`[agent] 本轮结束 run=${runId}`, stats);
      }
      return { runId, stats };
    });
  }

  // ================= 抓取 Worker（串行，一次一个页面） =================
  async function processTask(taskId, runId, url) {
    db.prepare("UPDATE crawl_tasks SET status='running' WHERE id=?").run(taskId);
    try {
      const html = await fetchDetailPage(url);
      const text = htmlToText(html);
      if (countWords(text) < 300) throw new Error('正文不足 300 词，疑似非题目页');
      const questions = await extractQuestions(text, url);
      if (!questions.length) throw new Error('未提取到题目');
      const title = (text.match(/<title>([^<]+)<\/title>/i)?.[1] || text.slice(0, 60)).trim();
      const hash = sha256hex(JSON.stringify(questions.map((q) => [q.question, q.options, q.answer])));
      if (db.prepare('SELECT 1 FROM passages WHERE content_hash=?').get(hash)) {
        // 去重：同一内容已存在，不重复入库
        db.prepare("UPDATE crawl_tasks SET status='done', finished_at=? WHERE id=?").run(Date.now(), taskId);
        logDecision(runId, url, 'duplicate', { reasons: ['content_hash 与现有内容重复'] });
        return;
      }
      const passage = {
        id: rid('pass'),
        title,
        content: text,
        word_count: countWords(text),
        questions,
        content_hash: hash,
        source_type: detectSourceType({ title, source_detail: '', content: text }),
        source_detail: `${new URL(url).hostname}（自动识别）`,
        source_url: url,
        domain: new URL(url).hostname,
        quality_score: null,
        reasons: '[]',
      };
      db.prepare(`INSERT INTO passages (id, title, content, word_count, questions, content_hash, source_type, source_detail, source_url, domain, quality_score, reasons, reviewed, visibility, created_by, run_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'private', 'agent', ?, ?)`)
        .run(passage.id, passage.title, passage.content, passage.word_count, JSON.stringify(passage.questions),
          passage.content_hash, passage.source_type, passage.source_detail, passage.source_url, passage.domain,
          passage.quality_score, passage.reasons, runId, Date.now());
      db.prepare("UPDATE crawl_tasks SET status='done', passage_id=?, finished_at=? WHERE id=?").run(passage.id, Date.now(), taskId);
      db.prepare("UPDATE crawl_tasks SET status='done', finished_at=? WHERE url=? AND status IN ('done','failed') AND id != ?").run(Date.now(), url, taskId);
      logDecision(runId, url, 'extracted', { passageId: passage.id });
    } catch (e) {
      if (e.blocked) {
        try { bumpDomainFail(new URL(url).hostname); } catch {}
      }
      db.prepare("UPDATE crawl_tasks SET status='failed', error=?, finished_at=? WHERE id=?").run(String(e.message || e), Date.now(), taskId);
      logDecision(runId, url, 'failed', { reasons: [String(e.message || e)] });
    }
  }

  async function fetchDetailPage(url) { return fetchPage(url); }

  // ================= 定时触发（每 6 小时） =================
  let cronTimer = null;
  function startCron() {
    if (cronTimer) return;
    // 启动 2 分钟后先检查一次（配置齐才会真正工作）
    setTimeout(() => runCycle('startup').catch(() => {}), 2 * 60_000);
    cronTimer = setInterval(() => runCycle('cron').catch(() => {}), 6 * 60 * 60_000);
  }
  startCron();

  // ================= 管理接口 =================
  const admin = new Hono();

  admin.use('*', async (c, next) => {
    const ok = await requireAdmin(c);
    if (!ok) return;
    await next();
  });

  const fmtState = () => {
    const st = getState();
    const today = db.prepare("SELECT COUNT(*) AS c FROM passages WHERE created_by='agent' AND visibility='published' AND published_at >= ?")
      .get(new Date().setHours(0, 0, 0, 0)).c;
    const lastRun = db.prepare('SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 1').get();
    const consecutiveFails = JSON.parse(st.domain_fails || '{}');
    return {
      enabled: !!st.enabled,
      frozen: !!st.frozen,
      frozenReason: st.frozen_reason,
      frozenAt: st.frozen_at,
      lastRunAt: st.last_run_at,
      lastSeedUrl: st.last_seed_url,
      todayPublished: st.daily_publish_count,
      dailyLimit: CFG.dailyLimit(),
      domains: CFG.domains(),
      seeds: db.prepare('SELECT * FROM agent_seeds ORDER BY created_at ASC').all(),
      lastRun,
      aiConfigured: !!(CFG.aiBase() && CFG.aiKey()),
      consecutiveFails,
    };
  };

  admin.get('/status', (c) => c.json(fmtState()));

  admin.post('/enable', (c) => {
    if (CFG.domains().length === 0) return c.json({ error: 'CRAWL_ALLOWED_DOMAINS 为空，无法启用（白名单是硬约束）' }, 400);
    const st = getState();
    if (st.frozen) return c.json({ error: `Agent 处于冻结状态，请先解冻：${st.frozen_reason}` }, 400);
    updateState({ enabled: 1 });
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_enable', '管理员启用采集 Agent');
    return c.json({ ok: true, state: fmtState() });
  });

  admin.post('/disable', (c) => {
    updateState({ enabled: 0 });
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_disable', '管理员停用采集 Agent');
    return c.json({ ok: true, state: fmtState() });
  });

  admin.post('/freeze', (c) => {
    freeze('管理员手动冻结');
    return c.json({ ok: true, state: fmtState() });
  });

  admin.post('/unfreeze', (c) => {
    const st = getState();
    if (!st.frozen) return c.json({ ok: true, state: fmtState() });
    updateState({ frozen: 0, frozen_reason: null, frozen_at: null, domain_fails: '{}' });
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_unfreeze', '管理员解冻采集 Agent');
    return c.json({ ok: true, state: fmtState() });
  });

  admin.get('/runs', (c) => {
    const limit = Math.min(Number(c.req.query('limit') || 50), 200);
    const offset = Number(c.req.query('offset') || 0);
    const rows = db.prepare('SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) AS c FROM agent_runs').get().c;
    return c.json({ runs: rows, total });
  });

  admin.get('/runs/:id/decisions', (c) => {
    const runId = c.req.param('id');
    const action = c.req.query('action');
    const rows = action
      ? db.prepare('SELECT * FROM agent_decisions WHERE run_id=? AND action=? ORDER BY created_at ASC').all(runId, action)
      : db.prepare('SELECT * FROM agent_decisions WHERE run_id=? ORDER BY created_at ASC').all(runId);
    return c.json({ decisions: rows });
  });

  // 一键回滚：下架该轮所有发布内容
  admin.post('/runs/:id/rollback', (c) => {
    const runId = c.req.param('id');
    const res = db.prepare("UPDATE passages SET visibility='private', reviewed=0, published_at=NULL WHERE run_id=? AND visibility='published'").run(runId);
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_rollback', `回滚 ${res.changes} 篇（run=${runId}）`);
    return c.json({ ok: true, affected: res.changes });
  });

  // 按域名下架
  admin.post('/rollback-domain', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const domain = String(body.domain || '').toLowerCase().trim();
    if (!domain) return c.json({ error: '缺少 domain' }, 400);
    const res = db.prepare("UPDATE passages SET visibility='private', reviewed=0, published_at=NULL WHERE domain=? AND visibility='published'").run(domain);
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_rollback', `按域名下架 ${res.changes} 篇（${domain}）`);
    return c.json({ ok: true, affected: res.changes });
  });

  // 种子管理
  admin.get('/seeds', (c) => c.json({ seeds: db.prepare('SELECT * FROM agent_seeds ORDER BY created_at ASC').all() }));
  admin.post('/seeds', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const url = String(body.url || '').trim();
    if (!isAllowed(url)) return c.json({ error: 'URL 不在白名单域名内' }, 400);
    const id = rid('seed');
    db.prepare('INSERT OR IGNORE INTO agent_seeds (id, url, created_at) VALUES (?, ?, ?)').run(id, url, Date.now());
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_seed_add', `新增种子 ${url}`);
    return c.json({ ok: true, id });
  });
  admin.delete('/seeds', (c) => {
    const id = c.req.query('id');
    if (!id) return c.json({ error: '缺少 id' }, 400);
    db.prepare('DELETE FROM agent_seeds WHERE id=?').run(id);
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_seed_del', `删除种子 ${id}`);
    return c.json({ ok: true });
  });

  // 待审核区：Agent 抓取但 reviewed=0 的 passages，按质量分排序
  admin.get('/pending', (c) => {
    const rows = db.prepare(
      `SELECT id, title, source_url, domain, source_type, quality_score, reasons, word_count, created_at, json_array_length(questions) AS question_count
       FROM passages WHERE created_by='agent' AND reviewed=0 ORDER BY quality_score DESC, created_at DESC LIMIT 200`
    ).all();
    return c.json({ pending: rows });
  });

  admin.post('/pending/:id/approve', async (c) => {
    const id = c.req.param('id');
    const p = db.prepare("SELECT * FROM passages WHERE id=? AND created_by='agent' AND reviewed=0").get(id);
    if (!p) return c.json({ error: '待审核内容不存在' }, 404);
    // 人工通过也要跑一遍安全门禁（来源/答案/去重），但不强制 AI 分数
    const questions = JSON.parse(p.questions);
    const answerOk = questions.length > 0 && questions.every((q) => q.answer && String(q.answer).trim() !== 'null');
    const sourceOk = !!p.source_detail;
    if (!answerOk || !sourceOk) return c.json({ error: !sourceOk ? '来源为空，不可通过' : '存在空答案题，不可通过' }, 400);
    db.prepare("UPDATE passages SET reviewed=1, visibility='published', published_at=? WHERE id=?").run(Date.now(), id);
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_approve', `人工通过 ${p.title}（${id}）`);
    return c.json({ ok: true });
  });

  admin.delete('/pending/:id', (c) => {
    const id = c.req.param('id');
    const res = db.prepare("DELETE FROM passages WHERE id=? AND created_by='agent' AND reviewed=0").run(id);
    logActivity(c.get('user') ?? { sub: '', username: 'admin' }, 'agent_delete_pending', `删除待审核内容 ${id}（${res.changes}）`);
    return c.json({ ok: true, affected: res.changes });
  });

  // 手动触发一轮（管理员测试用）
  admin.post('/run-now', (c) => {
    runCycle('manual').catch(() => {});
    return c.json({ ok: true, message: '已触发，稍后查看运行记录' });
  });

  return { admin, runCycle, fmtState, checkReportFreeze, freeze };
}
