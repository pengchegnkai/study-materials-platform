/**
 * 本地自托管服务（Termux / Node 24）
 * - 同一套 API 与鉴权逻辑（与 functions/ 等价）
 * - SQLite（node:sqlite 内置）替代 D1
 * - 本地磁盘 data/files/ 替代 R2
 * - 静态托管 dist/ + SPA 回退
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto as crypto, createHmac, createHash, randomBytes } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, createWriteStream, unlinkSync, statSync, renameSync, copyFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DATA_DIR = path.join(ROOT, '..', 'data');
const FILE_DIR = path.join(DATA_DIR, 'files');
mkdirSync(FILE_DIR, { recursive: true });

// ---------- 配置（环境变量，参照十二节安全底线） ----------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const PORT = Number(process.env.PORT || 8787);

if (!SESSION_SECRET) {
  console.error('缺少 SESSION_SECRET 环境变量，拒绝启动');
  process.exit(1);
}

// ---------- 数据库（首次初始化 schema，之后跳过） ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='roles'").get();
if (!tables) {
  db.exec(readFileSync(path.join(ROOT, '..', 'schema.sql'), 'utf8'));
}
// refresh_tokens（错题本同款设计：只存 SHA-256 哈希，轮换 + 盗用检测）
db.exec(`CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  device_info TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
// 虚拟文件夹（文件 key 隐含目录之外，允许空文件夹存在）
db.exec(`CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  subject_id TEXT,
  path TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(subject_id, path)
)`);

// ---------- 环境变量管理员落库 ----------
// files.uploader_id 外键指向 users(id)；env 管理员（env-admin）必须存在于 users 表，
// 否则其上传/建科目等写操作会触发 FOREIGN KEY constraint failed。
// 密码哈希用随机值（管理员密码由 ADMIN_PASSWORD_HASH 环境变量控制，DB 中该哈希不可用于登录）。
if (ADMIN_USERNAME) {
  db.prepare(
    `INSERT INTO users (id, username, password_hash, status, created_at, created_by)
     VALUES ('env-admin', ?, 'pbkdf2$100000$disabled$disabled', 'active', ?, 'system')
     ON CONFLICT(id) DO NOTHING`
  ).run(ADMIN_USERNAME, Date.now());
}

// ---------- 密码哈希（PBKDF2-SHA256 + 恒定时间比较，与 Cloudflare 版一致） ----------
const ITERATIONS = 100000;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function pbkdf2(password, salt, iterations, len) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, len * 8);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, ITERATIONS, 32);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  let salt, expected;
  try {
    salt = unb64(parts[2]);
    expected = unb64(parts[3]);
  } catch {
    return false;
  }
  const bits = await pbkdf2(password, salt, iterations, expected.length);
  return constantTimeEqual(b64(bits), b64(expected));
}

// ---------- 会话令牌（HMAC-SHA256，8 小时） ----------
const SESSION_TTL = 8 * 60 * 60;
const COOKIE_NAME = 'admin_session';
const COOKIE_TTL_MS = SESSION_TTL * 1000;

async function hmacKey() {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function createSessionToken(sub, username, roles) {
  const payload = { sub, username, roles, exp: Math.floor(Date.now() / 1000) + SESSION_TTL };
  const body = b64(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64(sig)}`;
}

async function verifySessionToken(token) {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  try {
    const key = await hmacKey();
    if (!(await crypto.subtle.verify('HMAC', key, unb64(sig), new TextEncoder().encode(body)))) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64(body)));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL}; SameSite=Strict`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`;
}

// ---------- Token 认证（错题本同款设计：JWT access + 轮换 refresh） ----------
const ACCESS_TTL = 30 * 60; // 30 分钟
const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 天

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const unb64url = (s) => Buffer.from(s, 'base64url');

function signJWT(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJWT(token) {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const expect = createHmac('sha256', SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
    if (!constantTimeEqual(sig, expect)) return null;
    const payload = JSON.parse(unb64url(body).toString());
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

function issueRefresh(userId, deviceInfo) {
  const raw = randomBytes(48).toString('hex');
  const expires = Date.now() + REFRESH_TTL * 1000;
  db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, revoked, expires_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
    .run(crypto.randomUUID(), userId, sha256hex(raw), deviceInfo || '', expires, Date.now());
  return raw;
}

/// 校验并轮换 refresh token：原子吊销旧 token；已吊销 token 复用视为盗用 → 级联吊销全部
function rotateRefresh(refreshToken, username) {
  if (!refreshToken) return null;
  const r = db.prepare(
    'UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ? AND revoked = 0 AND expires_at > ? RETURNING id, user_id'
  ).get(sha256hex(refreshToken), Date.now());
  if (!r) {
    const probe = db.prepare('SELECT user_id, revoked, expires_at FROM refresh_tokens WHERE token_hash = ?')
      .get(sha256hex(refreshToken));
    if (probe && probe.revoked === 1 && probe.expires_at > Date.now()) {
      console.warn(`[token] 已吊销 refresh token 被重用，级联吊销 user=${probe.user_id} 全部 token`);
      db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(probe.user_id);
    }
    return null;
  }
  const u = db.prepare('SELECT id, username, status FROM users WHERE id = ?').get(r.user_id);
  if (!u || u.status !== 'active') return null;
  const roles = db.prepare('SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?')
    .all(r.user_id).map((x) => x.name);
  return {
    sub: u.id,
    username: u.username,
    roles,
    accessToken: signJWT({ sub: u.id, username: u.username, roles, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL }),
    refreshToken: issueRefresh(u.id, username),
  };
}

// ---------- 实时在线统计（滑动窗口：5 分钟内有活动的会话视为在线） ----------
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const onlineMap = new Map(); // sessionId -> lastSeenTs

function touchOnline(user) {
  if (user?.sub) onlineMap.set(user.sub, Date.now());
}

function countOnline() {
  const now = Date.now();
  for (const [id, ts] of onlineMap) {
    if (now - ts > ONLINE_WINDOW_MS) onlineMap.delete(id);
  }
  return onlineMap.size;
}

// ---------- 会话与守卫 ----------
const app = new Hono();

app.use('/api/*', async (c, next) => {
  // 错题本同款：优先 Bearer access token，回退 Cookie 会话
  const authz = c.req.header('Authorization') || '';
  let user = null;
  if (authz.startsWith('Bearer ')) {
    user = verifyJWT(authz.slice(7));
  }
  if (!user) {
    const token = parseCookies(c.req.header('Cookie') || '')[COOKIE_NAME];
    user = token ? await verifySessionToken(token) : null;
  }
  c.set('user', user);
  touchOnline(user);
  await next();
  // 登录诊断日志（临时）：记录全部 API 请求的认证方式与响应码
  const authKind = authz.startsWith('Bearer ') ? 'bearer' : (parseCookies(c.req.header('Cookie') || '')[COOKIE_NAME] ? 'cookie' : '无');
  console.log(`[diag] ${c.req.method} ${c.req.path} auth=${authKind} -> ${c.res.status} (proto=${c.req.header('x-forwarded-proto') || 'local'})`);
});

function getUser(c) {
  return c.get('user');
}

async function isActiveUser(user) {
  const row = db.prepare('SELECT status FROM users WHERE id = ?').get(user.sub);
  return row ? row.status === 'active' : true; // env 管理员不在表中，视为 active
}

async function requireLogin(c) {
  const user = getUser(c);
  if (!user) throw new HttpError(401, '未登录');
  return user;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

app.onError((err, c) => c.json({ error: err.message }, err.status || 500));

async function requireActive(c) {
  const user = await requireLogin(c);
  if (!(await isActiveUser(user))) throw new HttpError(403, '账号已被禁用');
  return user;
}

async function requireAdmin(c) {
  const user = await requireActive(c);
  if (!user.roles.includes('admin')) throw new HttpError(403, '无权限');
  return user;
}

async function getUserRoles(user) {
  if (user.roles.includes('admin')) return user.roles;
  return db.prepare('SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?')
    .all(user.sub).map((r) => r.name);
}

// ---------- 权限判定（access.ts 等价实现） ----------
async function canView(user, file) {
  if (!user) return false;
  if (!(await isActiveUser(user))) return false;
  if (user.roles.includes('admin')) return true;
  if (file.uploader_id === user.sub) return true;

  const userPerm = db.prepare(
    `SELECT 1 FROM file_permissions WHERE user_id = ? AND can_view = 1 AND (target IS NULL OR target = ? OR target = ?)`
  ).get(user.sub, file.key, file.subject_id ?? '');
  if (userPerm) return true;

  const roles = await getUserRoles(user);
  if (roles.length > 0) {
    const ph = roles.map(() => '?').join(',');
    const rolePerm = db.prepare(
      `SELECT 1 FROM file_permissions WHERE role_id IN (${ph}) AND can_view = 1 AND (target IS NULL OR target = ? OR target = ?)`
    ).get(...roles, file.key, file.subject_id ?? '');
    if (rolePerm) return true;
  }

  return roles.includes('student') && file.visibility === 'published';
}

function requireOwner(user, key) {
  const file = db.prepare('SELECT * FROM files WHERE key = ?').get(key);
  if (!file) return { error: '文件不存在', status: 404 };
  if (!user.roles.includes('admin') && file.uploader_id !== user.sub) return { error: '无权限', status: 403 };
  return { file };
}

function requireUploader(user, subjectId) {
  if (user.roles.includes('admin')) return null;
  if (!user.roles.includes('teacher')) return { error: '无权限', status: 403 };
  if (!db.prepare('SELECT 1 FROM user_subjects WHERE user_id = ? AND subject_id = ?').get(user.sub, subjectId))
    return { error: '未分配该科目', status: 403 };
  return null;
}

// ---------- R2 key 等价：本地路径服务端生成，禁止信任前端路径 ----------
function sanitizeFilename(name) {
  const base = name.split('/').pop().split('\\').pop();
  return base.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\.\.+/g, '.').replace(/\s+/g, ' ').trim() || 'file';
}

function buildObjectKey(role, subjectSlug, username, filename, folderPath) {
  const safe = sanitizeFilename(filename);
  const dir = (folderPath || '')
    .split('/')
    .map((s) => sanitizeFilename(s.trim()))
    .filter(Boolean)
    .join('/');
  if (role === 'admin') return `uploads/admin/${dir ? dir + '/' : ''}${Date.now()}-${safe}`;
  return `uploads/${sanitizeFilename(subjectSlug ?? 'misc')}/${encodeURIComponent(username)}/${dir ? dir + '/' : ''}${Date.now()}-${safe}`;
}

/// 从 key 提取虚拟目录：admin 是 uploads/admin/<dir...>/file，teacher 是 uploads/<slug>/<user>/<dir...>/file
function dirFromKey(key) {
  const parts = key.split('/');
  if (parts.length <= 3) return '';
  const start = parts[1] === 'admin' ? 2 : 3;
  return parts.slice(start, -1).join('/');
}

function filePathOf(key) {
  const full = path.resolve(FILE_DIR, key);
  if (!full.startsWith(FILE_DIR)) return null; // 防路径穿越
  return full;
}

function extType(key, contentType) {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['pptx', 'ppt'].includes(ext)) return 'pptx';
  if (['docx', 'doc'].includes(ext)) return 'docx';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (contentType?.startsWith('image/')) return 'image';
  return 'other';
}

const rid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

// ==================== API ====================

// POST /api/login：失败 401 + 延迟 500ms
app.post('/api/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const password = body.password || '';
  if (!username || !password) {
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  if (ADMIN_PASSWORD_HASH && username === ADMIN_USERNAME) {
    if (await verifyPassword(password, ADMIN_PASSWORD_HASH)) {
      const token = await createSessionToken('env-admin', username, ['admin']);
      c.header('Set-Cookie', sessionCookie(token));
      const accessToken = signJWT({ sub: 'env-admin', username, roles: ['admin'], exp: Math.floor(Date.now() / 1000) + ACCESS_TTL });
      const refreshToken = issueRefresh('env-admin', c.req.header('user-agent'));
      return c.json({ ok: true, roles: ['admin'], accessToken, refreshToken });
    }
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const row = db.prepare(
    `SELECT u.id, u.username, u.password_hash, u.status,
            COALESCE((SELECT GROUP_CONCAT(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles
     FROM users u WHERE u.username = ?`
  ).get(username);

  if (!row || row.status !== 'active' || !(await verifyPassword(password, row.password_hash))) {
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ error: '用户名或密码错误' }, 401);
  }
  const roles = row.roles ? row.roles.split(',') : [];
  const token = await createSessionToken(row.id, row.username, roles);
  c.header('Set-Cookie', sessionCookie(token));
  const accessToken = signJWT({ sub: row.id, username: row.username, roles, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL });
  const refreshToken = issueRefresh(row.id, c.req.header('user-agent'));
  return c.json({ ok: true, roles, accessToken, refreshToken });
});

// POST /api/refresh：轮换 refresh token（错题本同款：原子吊销 + 盗用检测）
app.post('/api/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = rotateRefresh(body.refreshToken, body.username);
  if (!result) return c.json({ error: 'refresh token 无效' }, 401);
  return c.json({
    ok: true,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    roles: result.roles,
  });
});

app.post('/api/logout', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body.refreshToken) {
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(sha256hex(body.refreshToken));
  }
  c.header('Set-Cookie', clearCookie());
  return c.json({ ok: true });
});

app.get('/api/session', async (c) => {
  const user = await requireLogin(c);
  if (user && !(await isActiveUser(user))) return c.json({ error: '账号已被禁用' }, 403);
  return c.json({ user: { id: user.sub, username: user.username, roles: user.roles } });
});

app.get('/api/subjects', async (c) => {
  if (!(await requireLogin(c))) return;
  const rows = db.prepare(
    `SELECT s.id, s.name, s.slug, s.sort_order,
            (SELECT COUNT(*) FROM files f WHERE f.subject_id = s.id AND f.visibility = 'published') AS published_count
     FROM subjects s ORDER BY s.sort_order, s.created_at`
  ).all();
  return c.json({ subjects: rows });
});

app.get('/api/manifest', async (c) => {
  const user = await requireLogin(c);
  if (!user) return;
  const rows = db.prepare(
    `SELECT f.*, s.name AS subject_name, s.slug AS subject_slug
     FROM files f LEFT JOIN subjects s ON s.id = f.subject_id ORDER BY f.uploaded_at DESC`
  ).all();
  const out = [];
  for (const row of rows) {
    if (!(await canView(user, row))) continue;
    out.push({
      key: row.key,
      title: row.title || row.key.split('/').pop(),
      type: extType(row.key, row.content_type),
      dir: dirFromKey(row.key),
      size: row.size,
      subject: row.subject_name,
      subjectSlug: row.subject_slug,
      uploader: row.uploader_username,
      visibility: row.visibility,
      uploadedAt: row.uploaded_at,
      canManage: user.roles.includes('admin') || row.uploader_id === user.sub,
    });
  }
  return c.json({ files: out });
});

// GET /api/file：独立执行 canView（不依赖 manifest 过滤）
app.get('/api/file', async (c) => {
  const user = await requireLogin(c);
  if (!user) return;
  const key = c.req.query('key');
  if (!key) return c.json({ error: '缺少 key 参数' }, 400);
  const row = db.prepare('SELECT * FROM files WHERE key = ?').get(key);
  if (!row) return c.json({ error: '文件不存在' }, 404);
  if (!(await canView(user, row))) return c.json({ error: '无权限' }, 403);

  const full = filePathOf(key);
  if (!full || !existsSync(full)) return c.json({ error: '文件不存在' }, 404);

  const stream = Readable.toWeb(createReadStream(full));
  return new Response(stream, {
    headers: {
      'Content-Type': row.content_type || 'application/octet-stream',
      'Content-Length': String(row.size ?? statSync(full).size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(key.split('/').pop())}`,
      'Cache-Control': 'private, no-store',
    },
  });
});

// POST /api/upload：R2 key 由服务端生成
app.post('/api/upload', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  if (!user.roles.includes('admin') && !user.roles.includes('teacher')) return c.json({ error: '无权限' }, 403);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: '请求格式错误' }, 400);
  const file = form.get('file');
  const subjectId = (form.get('subjectId') || '') + '';
  const visibility = (form.get('visibility') || 'private') + '';
  const folderPath = (form.get('path') || '') + '';

  if (!file || typeof file === 'string' || file.size === 0) return c.json({ error: '缺少文件' }, 400);
  if (!['private', 'published'].includes(visibility)) return c.json({ error: 'visibility 取值非法' }, 400);

  const isAdmin = user.roles.includes('admin');
  let subjectSlug = null, subjectName = null;

  if (isAdmin) {
    if (subjectId) {
      const s = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
      if (s) { subjectSlug = s.slug; subjectName = s.name; }
    }
  } else {
    if (!subjectId) return c.json({ error: '必须选择科目' }, 400);
    const denied = requireUploader(user, subjectId);
    if (denied) return c.json({ error: denied.error }, denied.status);
    const s = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
    if (!s) return c.json({ error: '科目不存在' }, 400);
    subjectSlug = s.slug; subjectName = s.name;
  }

  // 科目归属：显式 subjectId 优先；否则按 path 首段匹配科目名（保证「科目/...」目录都归属该科目）
  let finalSubjectId = subjectId || null;
  if (!finalSubjectId && folderPath) {
    const first = folderPath.split('/').filter(Boolean)[0];
    if (first) {
      const match = db.prepare('SELECT id FROM subjects WHERE name = ?').get(first);
      if (match) finalSubjectId = match.id;
    }
  }

  const key = buildObjectKey(isAdmin ? 'admin' : 'teacher', subjectSlug, user.username, file.name || 'file', folderPath);
  const full = filePathOf(key);
  if (!full) return c.json({ error: '非法路径' }, 400);
  mkdirSync(path.dirname(full), { recursive: true });

  // 保存文件（本地磁盘替代 R2）
  await pipeline(Readable.fromWeb(file.stream()), createWriteStream(full));

  db.prepare(
    `INSERT INTO files (key, title, subject_id, uploader_id, uploader_username, visibility, uploaded_at, size, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(key, file.name || 'file', finalSubjectId, user.sub, user.username, visibility, Date.now(), file.size, file.type || 'application/octet-stream');

  return c.json({ ok: true, key, subject: subjectName });
});

// PATCH /api/file：requireOwner，仅允许 title/visibility
app.patch('/api/file', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  const body = await c.req.json().catch(() => ({}));
  if (!body.key) return c.json({ error: '缺少 key' }, 400);
  if (body.visibility && !['private', 'published'].includes(body.visibility)) return c.json({ error: 'visibility 取值非法' }, 400);

  const res = requireOwner(user, body.key);
  if (res.error) return c.json({ error: res.error }, res.status);

  if (body.title !== undefined) db.prepare('UPDATE files SET title = ? WHERE key = ?').run(String(body.title).trim(), body.key);
  if (body.visibility !== undefined) db.prepare('UPDATE files SET visibility = ? WHERE key = ?').run(body.visibility, body.key);
  return c.json({ ok: true, visibility: body.visibility ?? res.file.visibility });
});

// DELETE /api/delete：requireOwner，删文件 + 记录
app.delete('/api/delete', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  const key = c.req.query('key');
  if (!key) return c.json({ error: '缺少 key 参数' }, 400);
  const res = requireOwner(user, key);
  if (res.error) return c.json({ error: res.error }, res.status);

  const full = filePathOf(key);
  if (full && existsSync(full)) unlinkSync(full);
  db.prepare('DELETE FROM files WHERE key = ?').run(key);
  return c.json({ ok: true });
});

// ==================== 管理员 API ====================

app.get('/api/admin/users', async (c) => {
  if (!(await requireAdmin(c))) return;
  const rows = db.prepare(
    `SELECT u.id, u.username, u.status, u.created_at,
            COALESCE((SELECT GROUP_CONCAT(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles,
            COALESCE((SELECT GROUP_CONCAT(s.name) FROM user_subjects us JOIN subjects s ON s.id = us.subject_id WHERE us.user_id = u.id), '') AS subjects
     FROM users u ORDER BY u.created_at DESC`
  ).all();
  return c.json({
    users: rows.map((r) => ({
      id: r.id, username: r.username, status: r.status, createdAt: r.created_at,
      roles: r.roles ? r.roles.split(',') : [], subjects: r.subjects ? r.subjects.split(',') : [],
    })),
  });
});

app.post('/api/admin/users', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return;
  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  if (!username) return c.json({ error: '用户名不能为空' }, 400);
  if (!body.roleIds?.length) return c.json({ error: '至少分配一个角色' }, 400);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return c.json({ error: '用户名已存在' }, 409);
  if ((body.password || '').length < 6) return c.json({ error: '密码至少 6 位' }, 400);

  const id = rid('user');
  const batch = [
    db.prepare('INSERT INTO users (id, username, password_hash, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, username, await hashPassword(body.password), 'active', Date.now(), admin.username),
    ...body.roleIds.map((r) => db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, r)),
    ...(body.subjectIds || []).map((s) => db.prepare('INSERT INTO user_subjects (user_id, subject_id) VALUES (?, ?)').run(id, s)),
  ];
  return c.json({ ok: true, user: { id, username, created: [{ username, password: body.password, roleIds: body.roleIds, subjectIds: body.subjectIds || [] }], failed: [] } });
});

// POST /api/admin/users/batch：批量创建，随机密码 ≥12 位，密码只返回一次
function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let out = '';
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

app.post('/api/admin/users/batch', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return;
  const body = await c.req.json().catch(() => ({}));
  const users = body.users || [];
  if (users.length === 0) return c.json({ error: '用户列表为空' }, 400);

  const existing = new Set(db.prepare('SELECT username FROM users').all().map((r) => r.username));
  const seen = new Set();
  const created = [], failed = [];

  for (const u of users) {
    const username = (u.username || '').trim();
    if (!username) { failed.push({ username: username || '(空)', reason: '用户名为空' }); continue; }
    if (seen.has(username)) { failed.push({ username, reason: '批内用户名重复' }); continue; }
    if (existing.has(username)) { failed.push({ username, reason: '用户名已存在' }); continue; }
    if (!u.roleIds?.length) { failed.push({ username, reason: '未分配角色' }); continue; }
    if (u.password && String(u.password).length < 6) { failed.push({ username, reason: '自定义密码至少 6 位' }); continue; }
    seen.add(username);
  }

  for (const u of users) {
    const username = (u.username || '').trim();
    if (!username || failed.some((f) => f.username === username)) continue;
    const password = (u.password && String(u.password).length >= 6) ? String(u.password) : randomPassword();
    const id = rid('user');
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO users (id, username, password_hash, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, username, 'PENDING', 'active', Date.now(), admin.username);
      for (const r of u.roleIds) db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, r);
      for (const s of u.subjectIds || []) db.prepare('INSERT INTO user_subjects (user_id, subject_id) VALUES (?, ?)').run(id, s);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      failed.push({ username, reason: '写入失败' });
      continue;
    }
    created.push({ username, password, roleIds: u.roleIds, subjectIds: u.subjectIds || [] });
    existing.add(username);
  }

  return c.json({ ok: true, created, failed });
});

// PATCH/DELETE /api/admin/user：禁自禁/降级/删除自己
app.patch('/api/admin/user', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return;
  const body = await c.req.json().catch(() => ({}));
  if (!body.id) return c.json({ error: '缺少用户 id' }, 400);
  const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(body.id);
  if (!target) return c.json({ error: '用户不存在' }, 404);

  const isSelf = target.id === admin.sub || target.username === admin.username;
  if (isSelf) {
    if (body.status && body.status !== 'active') return c.json({ error: '不能禁用自己' }, 400);
    if (body.roleIds && !body.roleIds.includes('role-admin')) return c.json({ error: '不能降级自己' }, 400);
  }

  if (body.status) {
    if (!['active', 'disabled'].includes(body.status)) return c.json({ error: 'status 取值非法' }, 400);
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(body.status, target.id);
  }
  if (body.password) {
    if (body.password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(body.password), target.id);
  }
  if (body.roleIds) {
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(target.id);
    for (const r of body.roleIds) db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(target.id, r);
  }
  if (body.subjectIds) {
    db.prepare('DELETE FROM user_subjects WHERE user_id = ?').run(target.id);
    for (const s of body.subjectIds) db.prepare('INSERT INTO user_subjects (user_id, subject_id) VALUES (?, ?)').run(target.id, s);
  }
  return c.json({ ok: true });
});

app.delete('/api/admin/user', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return;
  const id = c.req.query('id');
  if (!id) return c.json({ error: '缺少 id 参数' }, 400);
  if (id === admin.sub) return c.json({ error: '不能删除自己' }, 400);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) return c.json({ error: '用户不存在' }, 404);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return c.json({ ok: true });
});

// 后台看板统计
app.get('/api/admin/dashboard', async (c) => {
  if (!(await requireAdmin(c))) return;
  
  // 用户统计
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const activeUsers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE status = 'active'").get().c;
  const teacherCount = db.prepare("SELECT COUNT(*) AS c FROM user_roles WHERE role_id = 'role-teacher'").get().c;
  const studentCount = db.prepare("SELECT COUNT(*) AS c FROM user_roles WHERE role_id = 'role-student'").get().c;

  // 科目统计
  const totalSubjects = db.prepare('SELECT COUNT(*) AS c FROM subjects').get().c;
  const subjectsWithFiles = db.prepare('SELECT COUNT(DISTINCT subject_id) AS c FROM files WHERE subject_id IS NOT NULL').get().c;

  // 文件统计
  const totalFiles = db.prepare('SELECT COUNT(*) AS c FROM files').get().c;
  const publishedFiles = db.prepare("SELECT COUNT(*) AS c FROM files WHERE visibility = 'published'").get().c;
  const privateFiles = db.prepare("SELECT COUNT(*) AS c FROM files WHERE visibility = 'private'").get().c;

  // 存储大小
  const totalSizeRow = db.prepare('SELECT SUM(size) AS s FROM files').get();
  const totalSize = totalSizeRow?.s || 0;

  // 最近上传的文件
  const recentFiles = db.prepare(
    `SELECT f.key, f.title, f.subject_id, f.uploader_username, f.visibility, f.uploaded_at, f.size,
            s.name AS subject_name
     FROM files f LEFT JOIN subjects s ON s.id = f.subject_id
     ORDER BY f.uploaded_at DESC LIMIT 10`
  ).all();

  // 最近注册的用户
  const recentUsers = db.prepare(
    `SELECT u.id, u.username, u.status, u.created_at,
            COALESCE((SELECT GROUP_CONCAT(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles
     FROM users u ORDER BY u.created_at DESC LIMIT 10`
  ).all();

  // 按类型统计文件
  const typeStats = db.prepare(
    `SELECT 
       CASE 
         WHEN key LIKE '%.md' OR key LIKE '%.markdown' THEN 'markdown'
         WHEN key LIKE '%.pptx' OR key LIKE '%.ppt' THEN 'pptx'
         WHEN key LIKE '%.docx' OR key LIKE '%.doc' THEN 'docx'
         WHEN key LIKE '%.png' OR key LIKE '%.jpg' OR key LIKE '%.jpeg' OR key LIKE '%.gif' OR key LIKE '%.webp' OR key LIKE '%.svg' OR key LIKE '%.bmp' THEN 'image'
         ELSE 'other'
       END AS type,
       COUNT(*) AS count
     FROM files
     GROUP BY type`
  ).all();

  return c.json({
    online: countOnline(),
    users: {
      total: totalUsers,
      active: activeUsers,
      teachers: teacherCount,
      students: studentCount,
    },
    subjects: {
      total: totalSubjects,
      withFiles: subjectsWithFiles,
    },
    files: {
      total: totalFiles,
      published: publishedFiles,
      private: privateFiles,
      totalSize,
      byType: typeStats,
    },
    recentFiles: recentFiles.map(r => ({
      key: r.key,
      title: r.title || r.key.split('/').pop(),
      subject: r.subject_name,
      uploader: r.uploader_username,
      visibility: r.visibility,
      uploadedAt: r.uploaded_at,
      size: r.size,
    })),
    recentUsers: recentUsers.map(r => ({
      id: r.id,
      username: r.username,
      status: r.status,
      createdAt: r.created_at,
      roles: r.roles ? r.roles.split(',') : [],
    })),
  });
});

// 文件夹：列出（folders 表 + 文件 key 隐含目录合并）
app.get('/api/folders', async (c) => {
  const user = await requireLogin(c);
  if (!user) return;
  const subjectId = c.req.query('subjectId') || null;
  const set = new Set();
  let subjectName = null;
  if (subjectId) {
    const subj = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId);
    subjectName = subj?.name ?? null;
  }
  for (const r of db.prepare('SELECT path, subject_id FROM folders').all()) {
    if (subjectId) {
      // 归属该科目的 folder：显式 subject_id 匹配，或路径首段就是科目名
      const belongs = r.subject_id === subjectId ||
        (subjectName && (r.path === subjectName || r.path.startsWith(subjectName + '/')));
      if (!belongs) continue;
    }
    set.add(r.path);
  }
  // 从文件 key 提取隐含目录（按文件科目归属过滤）
  const rows = db.prepare('SELECT key, subject_id FROM files').all();
  for (const r of rows) {
    if (subjectId && r.subject_id !== subjectId) continue;
    const dir = dirFromKey(r.key);
    if (dir) set.add(dir);
  }
  return c.json({ folders: Array.from(set).sort() });
});

// 文件夹：新建（父目录必须已存在或为根）
app.post('/api/folders', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  if (!user.roles.includes('admin') && !user.roles.includes('teacher')) return c.json({ error: '无权限' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const path = (body.path || '')
    .split('/')
    .map((s) => sanitizeFilename(s.trim()))
    .filter(Boolean)
    .join('/');
  if (!path) return c.json({ error: '文件夹名不能为空' }, 400);
  // 科目归属：显式 subjectId 优先，否则按路径首段匹配科目名
  let subjectId = body.subjectId || null;
  if (!subjectId) {
    const first = path.split('/')[0];
    const match = db.prepare('SELECT id FROM subjects WHERE name = ?').get(first);
    if (match) subjectId = match.id;
  }
  // 父目录校验
  const parts = path.split('/');
  if (parts.length > 1) {
    const parent = parts.slice(0, -1).join('/');
    const existsAsFolder = db.prepare("SELECT 1 FROM folders WHERE IFNULL(subject_id, '') = IFNULL(?, '') AND path = ?").get(subjectId, parent);
    const existsAsDir = db.prepare('SELECT key FROM files WHERE key LIKE ? LIMIT 1').get(`${__dirPrefix(parent)}%`);
    if (!existsAsFolder && !existsAsDir) return c.json({ error: '父文件夹不存在' }, 400);
  }
  const dup = db.prepare("SELECT 1 FROM folders WHERE IFNULL(subject_id, '') = IFNULL(?, '') AND path = ?").get(subjectId, path);
  if (dup) return c.json({ error: '文件夹已存在' }, 409);
  db.prepare('INSERT INTO folders (id, subject_id, path, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(rid('fld'), subjectId, path, user.username, Date.now());
  return c.json({ ok: true, path });
});

// 文件夹：删除（删除 folder 记录及其子 folder 记录；里面的文件移到上级目录/根目录，不丢数据）
app.delete('/api/folders', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  if (!user.roles.includes('admin') && !user.roles.includes('teacher')) return c.json({ error: '无权限' }, 403);
  const rawPath = c.req.query('path');
  if (!rawPath) return c.json({ error: '缺少 path' }, 400);
  const folder = rawPath.split('/').map((s) => sanitizeFilename(s.trim())).filter(Boolean).join('/');
  if (!folder) return c.json({ error: '非法路径' }, 400);
  const isAdmin = user.roles.includes('admin');

  // 找到该文件夹内的文件（按 dirFromKey 归属过滤 + 权限）
  const rows = db.prepare('SELECT key FROM files').all().filter((r) => {
    const d = dirFromKey(r.key);
    if (d !== folder && !d.startsWith(folder + '/')) return false;
    if (isAdmin) return true;
    const parts = r.key.split('/');
    return parts[1] !== 'admin' && parts[2] === encodeURIComponent(user.username);
  });
  for (const r of rows) {
    const d = dirFromKey(r.key);
    // 目标目录 = 父目录（folder 的上级），根文件夹的文件移到根
    const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';
    const relInFolder = d === folder ? '' : d.slice(folder.length + 1);
    const newDir = [parent, relInFolder].filter(Boolean).join('/');
    const newKey = rekey(r.key, cleanDir(newDir));
    if (newKey === r.key) continue;
    const oldFull = filePathOf(r.key);
    const newFull = filePathOf(newKey);
    if (!oldFull || !newFull || !existsSync(oldFull)) continue;
    // 目标重名则加后缀，不覆盖
    let finalKey = newKey;
    let n = 1;
    const filename = r.key.split('/').pop() ?? '';
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extPart = dot > 0 ? filename.slice(dot) : '';
    while (db.prepare('SELECT 1 FROM files WHERE key = ?').get(finalKey)) {
      finalKey = rekey(r.key, [...cleanDir(newDir), `${stem} (${n})${extPart}`]);
      n++;
    }
    mkdirSync(path.dirname(newFull), { recursive: true });
    try { renameSync(oldFull, filePathOf(finalKey)); } catch { continue; }
    db.prepare('UPDATE files SET key = ? WHERE key = ?').run(finalKey, r.key);
  }
  // 删除 folder 及其子 folder 的 folders 记录
  db.prepare("DELETE FROM folders WHERE path = ? OR path LIKE ?").run(folder, `${folder}/%`);
  return c.json({ ok: true, moved: rows.length });
});

// 文件夹：移动（folder 连同内容放到 targetDir 下）
app.post('/api/folders/move', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  if (!user.roles.includes('admin') && !user.roles.includes('teacher')) return c.json({ error: '无权限' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const folder = (body.folder || '').split('/').map((x) => sanitizeFilename(x.trim())).filter(Boolean).join('/');
  const targetDir = cleanDir(body.targetDir).join('/');
  if (!folder) return c.json({ error: '缺少 folder' }, 400);
  if (targetDir === folder || targetDir.startsWith(folder + '/')) return c.json({ error: '不能移动到自己的子目录' }, 403);
  const isAdmin = user.roles.includes('admin');

  // 权限：至少有该文件夹内有文件的可管理权（或文件夹记录存在）
  const base = folder.split('/').pop();
  const newBase = targetDir ? `${targetDir}/${base}` : base;

  const rows = db.prepare('SELECT key FROM files').all().filter((r) => {
    const d = dirFromKey(r.key);
    if (d !== folder && !d.startsWith(folder + '/')) return false;
    if (isAdmin) return true;
    const parts = r.key.split('/');
    return parts[1] !== 'admin' && parts[2] === encodeURIComponent(user.username);
  });
  for (const r of rows) {
    const d = dirFromKey(r.key);
    const relInFolder = d === folder ? '' : d.slice(folder.length + 1);
    const newDir = [newBase, relInFolder].filter(Boolean).join('/');
    const newKey = rekey(r.key, cleanDir(newDir));
    if (newKey === r.key) continue;
    if (db.prepare('SELECT 1 FROM files WHERE key = ?').get(newKey)) continue;
    const oldFull = filePathOf(r.key);
    const newFull = filePathOf(newKey);
    if (!oldFull || !newFull || !existsSync(oldFull)) continue;
    mkdirSync(path.dirname(newFull), { recursive: true });
    try { renameSync(oldFull, newFull); } catch { continue; }
    db.prepare('UPDATE files SET key = ? WHERE key = ?').run(newKey, r.key);
  }
  // folders 记录改前缀
  const flds = db.prepare('SELECT id, path FROM folders').all();
  for (const f of flds) {
    if (f.path === folder || f.path.startsWith(folder + '/')) {
      const newPath = newBase + f.path.slice(folder.length);
      db.prepare('UPDATE folders SET path = ? WHERE id = ?').run(newPath, f.id);
    }
  }
  return c.json({ ok: true, folder: newBase });
});

// 把父目录转成 key 前缀（用于存在性探测）：uploads/*/dir/...
function __dirPrefix(parent) {
  return `uploads/%/${parent}/`;
}

// ---------- 文件/文件夹 移动与复制 ----------
// 清洗目标目录：每段 sanitizeFilename，返回段数组
function cleanDir(targetDir) {
  return (targetDir || '')
    .split('/')
    .map((seg) => seg.trim())
    .filter(Boolean) // 先剔空段，避免空串触发 sanitizeFilename 的 'file' 兜底
    .map((seg) => sanitizeFilename(seg))
    .filter(Boolean);
}

// 替换 key 的目录部分：admin 固定前缀 2 段（uploads/admin），teacher 3 段（uploads/<slug>/<user>）
function rekey(key, newDirParts) {
  const parts = key.split('/');
  const keep = parts[1] === 'admin' ? 2 : 3;
  return [...parts.slice(0, keep), ...newDirParts, parts[parts.length - 1]].join('/');
}

function userPrefixOf(key) {
  return key.split('/').slice(0, 3).join('/') + '/';
}

async function requireFileOwner(c, user, key) {
  const row = db.prepare('SELECT * FROM files WHERE key = ?').get(key);
  if (!row) return { error: '文件不存在', status: 404 };
  const isAdmin = user.roles.includes('admin');
  const owner = row.uploader_id === user.sub || userPrefixOf(key) === `uploads/${encodeURIComponent(user.username)}/`;
  if (!isAdmin && !owner) return { error: '无权限操作该文件', status: 403 };
  return { row };
}

// POST /api/move {key?|folder?, targetDir}
app.post('/api/move', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  if (!user.roles.includes('admin') && !user.roles.includes('teacher')) return c.json({ error: '无权限' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const targetDir = cleanDir(body.targetDir).join('/');

  if (body.key) {
    // 文件移动
    const chk = await requireFileOwner(c, user, body.key);
    if (chk.error) return c.json({ error: chk.error }, chk.status);
    const newKey = rekey(chk.row.key, cleanDir(targetDir));
    if (newKey === chk.row.key) return c.json({ ok: true, key: newKey });
    const dup = db.prepare('SELECT 1 FROM files WHERE key = ?').get(newKey);
    if (dup) return c.json({ error: '目标位置已存在同名文件' }, 409);
    const oldFull = filePathOf(chk.row.key);
    const newFull = filePathOf(newKey);
    if (!oldFull || !newFull) return c.json({ error: '非法路径' }, 400);
    if (!existsSync(oldFull)) return c.json({ error: '文件丢失' }, 404);
    mkdirSync(path.dirname(newFull), { recursive: true });
    renameSync(oldFull, newFull);
    db.prepare('UPDATE files SET key = ? WHERE key = ?').run(newKey, chk.row.key);
    return c.json({ ok: true, key: newKey });
  }

  if (body.folder) {
    // 文件夹移动：folder（连同内容）放到 targetDir 下；按 dirFromKey 归属过滤
    const folder = cleanDir(body.folder).join('/');
    if (!folder) return c.json({ error: '缺少 folder' }, 400);
    if (targetDir === folder || targetDir.startsWith(folder + '/')) {
      return c.json({ error: '不能移动到自己的子目录' }, 400);
    }
    const isAdmin = user.roles.includes('admin');
    const base = folder.split('/').pop();
    const newBase = targetDir ? `${targetDir}/${base}` : base;
    const rows = db.prepare('SELECT key FROM files').all().filter((r) => {
      const d = dirFromKey(r.key);
      if (d !== folder && !d.startsWith(folder + '/')) return false;
      if (isAdmin) return true;
      const parts = r.key.split('/');
      return parts[1] !== 'admin' && parts[2] === encodeURIComponent(user.username);
    });
    for (const r of rows) {
      const d = dirFromKey(r.key);
      const relInFolder = d === folder ? '' : d.slice(folder.length + 1);
      const newDir = [newBase, relInFolder].filter(Boolean).join('/');
      const newKey = rekey(r.key, cleanDir(newDir));
      if (newKey === r.key) continue;
      // 目标已存在同名文件则跳过（不覆盖）
      if (db.prepare('SELECT 1 FROM files WHERE key = ?').get(newKey)) continue;
      const oldFull = filePathOf(r.key);
      const newFull = filePathOf(newKey);
      if (!oldFull || !newFull || !existsSync(oldFull)) continue;
      mkdirSync(path.dirname(newFull), { recursive: true });
      try { renameSync(oldFull, newFull); } catch { continue; }
      db.prepare('UPDATE files SET key = ? WHERE key = ?').run(newKey, r.key);
    }
    // folders 表同步改前缀
    const flds = db.prepare('SELECT id, path FROM folders').all();
    for (const f of flds) {
      if (f.path === folder || f.path.startsWith(folder + '/')) {
        const newPath = newBase + f.path.slice(folder.length);
        db.prepare('UPDATE folders SET path = ? WHERE id = ?').run(newPath, f.id);
      }
    }
    return c.json({ ok: true, folder: newBase });
  }
  return c.json({ error: '缺少 key 或 folder' }, 400);
});

// POST /api/copy {key?|folder?, targetDir}
app.post('/api/copy', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  if (!user.roles.includes('admin') && !user.roles.includes('teacher')) return c.json({ error: '无权限' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const targetDir = cleanDir(body.targetDir).join('/');

  if (body.key) {
    const chk = await requireFileOwner(c, user, body.key);
    if (chk.error) return c.json({ error: chk.error }, chk.status);
    const filename = chk.row.key.split('/').pop();
    let newKey = rekey(chk.row.key, cleanDir(targetDir));
    let n = 1;
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extPart = dot > 0 ? filename.slice(dot) : '';
    while (db.prepare('SELECT 1 FROM files WHERE key = ?').get(newKey)) {
      newKey = rekey(chk.row.key, [...cleanDir(targetDir), `${stem} (${n})${extPart}`]);
      n++;
    }
    const oldFull = filePathOf(chk.row.key);
    const newFull = filePathOf(newKey);
    if (!oldFull || !newFull) return c.json({ error: '非法路径' }, 400);
    if (!existsSync(oldFull)) return c.json({ error: '文件丢失' }, 404);
    mkdirSync(path.dirname(newFull), { recursive: true });
    copyFileSync(oldFull, newFull);
    const stat = statSync(newFull);
    db.prepare(
      `INSERT INTO files (key, title, subject_id, uploader_id, uploader_username, visibility, uploaded_at, size, content_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newKey, chk.row.title, chk.row.subject_id, user.sub, user.username, chk.row.visibility, Date.now(), stat.size, chk.row.content_type);
    return c.json({ ok: true, key: newKey });
  }

  if (body.folder) {
    const folder = cleanDir(body.folder).join('/');
    if (!folder) return c.json({ error: '缺少 folder' }, 400);
    const isAdmin = user.roles.includes('admin');
    const base = folder.split('/').pop();
    const newBase = targetDir ? `${targetDir}/${base} (副本)` : `${base} (副本)`;
    const rows = db.prepare('SELECT * FROM files').all().filter((r) => {
      const d = dirFromKey(r.key);
      if (d !== folder && !d.startsWith(folder + '/')) return false;
      if (isAdmin) return true;
      const parts = r.key.split('/');
      return parts[1] !== 'admin' && parts[2] === encodeURIComponent(user.username);
    });
    let copied = 0;
    for (const r of rows) {
      const d = dirFromKey(r.key);
      const relInFolder = d === folder ? '' : d.slice(folder.length + 1);
      const relFile = r.key.split('/').pop();
      const newDir = [newBase, relInFolder].filter(Boolean).join('/');
      const newKey = rekey(r.key, cleanDir(newDir));
      if (db.prepare('SELECT 1 FROM files WHERE key = ?').get(newKey)) continue;
      const oldFull = filePathOf(r.key);
      const newFull = filePathOf(newKey);
      if (!oldFull || !newFull || !existsSync(oldFull)) continue;
      mkdirSync(path.dirname(newFull), { recursive: true });
      try {
        copyFileSync(oldFull, newFull);
        const stat = statSync(newFull);
        db.prepare(
          `INSERT INTO files (key, title, subject_id, uploader_id, uploader_username, visibility, uploaded_at, size, content_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(newKey, r.title ?? null, r.subject_id ?? null, user.sub, user.username, r.visibility ?? 'private', Date.now(), stat.size, r.content_type ?? null);
        copied++;
      } catch {}
    }
    // 复制子文件夹记录
    const flds = db.prepare('SELECT id, path, subject_id FROM folders').all();
    for (const f of flds) {
      if (f.path === folder || f.path.startsWith(folder + '/')) {
        const newPath = newBase + f.path.slice(folder.length);
        const dup = db.prepare("SELECT 1 FROM folders WHERE IFNULL(subject_id, '') = IFNULL(?, '') AND path = ?").get(f.subject_id ?? null, newPath);
        if (!dup) {
          db.prepare('INSERT INTO folders (id, subject_id, path, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(rid('fld'), f.subject_id ?? null, newPath, user.username, Date.now());
        }
      }
    }
    return c.json({ ok: true, folder: newBase, copied });
  }
  return c.json({ error: '缺少 key 或 folder' }, 400);
});

// 修改自己的密码（错题本同款：验证旧密码，改后吊销全部 refresh token）
app.post('/api/change-password', async (c) => {
  const user = await requireActive(c);
  if (!user) return;
  const body = await c.req.json().catch(() => ({}));
  const oldPassword = body.oldPassword || '';
  const newPassword = body.newPassword || '';
  if (newPassword.length < 6) return c.json({ error: '新密码至少 6 位' }, 400);
  const row = db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').get(user.sub);
  if (!row) return c.json({ error: '用户不存在' }, 404);
  if (!(await verifyPassword(oldPassword, row.password_hash))) return c.json({ error: '旧密码错误' }, 401);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(newPassword), row.id);
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(row.id);
  return c.json({ ok: true, message: '密码已修改，其他设备已下线' });
});

// 科目管理：删除有文件引用返回 409
app.get('/api/admin/subjects', async (c) => {
  if (!(await requireAdmin(c))) return;
  return c.json({
    subjects: db.prepare(
      `SELECT s.id, s.name, s.slug, s.sort_order, (SELECT COUNT(*) FROM files f WHERE f.subject_id = s.id) AS file_count
       FROM subjects s ORDER BY s.sort_order, s.created_at`
    ).all(),
  });
});

function slugify(name) {
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, '-');
  return /[a-z0-9-]/.test(cleaned) ? cleaned : `sub-${Date.now().toString(36)}`;
}

app.post('/api/admin/subjects', async (c) => {
  if (!(await requireAdmin(c))) return;
  const body = await c.req.json().catch(() => ({}));
  const name = (body.name || '').trim();
  if (!name) return c.json({ error: '科目名不能为空' }, 400);
  if (db.prepare('SELECT 1 FROM subjects WHERE name = ?').get(name)) return c.json({ error: '科目已存在' }, 409);
  const id = rid('sub');
  db.prepare('INSERT INTO subjects (id, name, slug, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, slugify(name), body.sortOrder ?? 0, Date.now());
  // 自动建同名科目文件夹（幂等，绑定 subject_id 便于按科目过滤）
  const exist = db.prepare('SELECT 1 FROM folders WHERE path = ?').get(name);
  if (!exist) {
    db.prepare('INSERT INTO folders (id, subject_id, path, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(rid('fld'), id, name, 'env-admin', Date.now());
  } else {
    db.prepare('UPDATE folders SET subject_id = ? WHERE path = ?').run(id, name);
  }
  return c.json({ ok: true, id });
});

app.patch('/api/admin/subjects', async (c) => {
  if (!(await requireAdmin(c))) return;
  const body = await c.req.json().catch(() => ({}));
  if (!body.id) return c.json({ error: '缺少 id' }, 400);
  if (body.name !== undefined) db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(String(body.name).trim(), body.id);
  if (body.sortOrder !== undefined) db.prepare('UPDATE subjects SET sort_order = ? WHERE id = ?').run(body.sortOrder, body.id);
  return c.json({ ok: true });
});

app.delete('/api/admin/subjects', async (c) => {
  if (!(await requireAdmin(c))) return;
  const id = c.req.query('id');
  if (!id) return c.json({ error: '缺少 id 参数' }, 400);
  const ref = db.prepare('SELECT COUNT(*) AS c FROM files WHERE subject_id = ?').get(id);
  if (ref.c > 0) return c.json({ error: '该科目下仍有文件，无法删除' }, 409);
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  return c.json({ ok: true });
});

// 细粒度权限
app.get('/api/admin/permissions', async (c) => {
  if (!(await requireAdmin(c))) return;
  return c.json({
    permissions: db.prepare(
      `SELECT p.*, u.username AS user_username, r.name AS role_name
       FROM file_permissions p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN roles r ON r.id = p.role_id ORDER BY p.id`
    ).all(),
  });
});

app.post('/api/admin/permissions', async (c) => {
  if (!(await requireAdmin(c))) return;
  const body = await c.req.json().catch(() => ({}));
  const scope = body.scope || 'file';
  if (!['file', 'subject', 'all'].includes(scope)) return c.json({ error: 'scope 取值非法' }, 400);
  if (!body.userId && !body.roleId) return c.json({ error: '必须指定用户或角色' }, 400);
  const id = rid('perm');
  db.prepare('INSERT INTO file_permissions (id, user_id, role_id, scope, target, can_view, can_manage) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, body.userId || null, body.roleId || null, scope, body.target || null, body.canView === false ? 0 : 1, body.canManage ? 1 : 0);
  return c.json({ ok: true, id });
});

app.patch('/api/admin/permissions', async (c) => {
  if (!(await requireAdmin(c))) return;
  const body = await c.req.json().catch(() => ({}));
  if (!body.id) return c.json({ error: '缺少 id' }, 400);
  if (body.canView !== undefined) db.prepare('UPDATE file_permissions SET can_view = ? WHERE id = ?').run(body.canView ? 1 : 0, body.id);
  if (body.canManage !== undefined) db.prepare('UPDATE file_permissions SET can_manage = ? WHERE id = ?').run(body.canManage ? 1 : 0, body.id);
  return c.json({ ok: true });
});

app.delete('/api/admin/permissions', async (c) => {
  if (!(await requireAdmin(c))) return;
  const id = c.req.query('id');
  if (!id) return c.json({ error: '缺少 id 参数' }, 400);
  db.prepare('DELETE FROM file_permissions WHERE id = ?').run(id);
  return c.json({ ok: true });
});

// ---------- 静态托管 + SPA 回退 ----------
app.use('/*', serveStatic({ root: path.join(ROOT, '..', 'dist') }));
app.get('/*', (c) => {
  const p = c.req.path;
  if (p.startsWith('/api/')) return c.json({ error: '接口不存在' }, 404);
  return c.html(readFileSync(path.join(ROOT, '..', 'dist', 'index.html'), 'utf8'));
});

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`学习资料平台已启动: http://localhost:${info.port}`);
});
