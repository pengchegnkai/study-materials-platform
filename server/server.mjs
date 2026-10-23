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
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, createWriteStream, unlinkSync, statSync } from 'node:fs';
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
  const token = parseCookies(c.req.header('Cookie') || '')[COOKIE_NAME];
  c.set('user', token ? await verifySessionToken(token) : null);
  touchOnline(c.get('user'));
  await next();
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

function buildObjectKey(role, subjectSlug, username, filename) {
  const safe = sanitizeFilename(filename);
  if (role === 'admin') return `uploads/admin/${Date.now()}-${safe}`;
  return `uploads/${sanitizeFilename(subjectSlug ?? 'misc')}/${encodeURIComponent(username)}/${Date.now()}-${safe}`;
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
      return c.json({ ok: true, roles: ['admin'] });
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
  return c.json({ ok: true, roles });
});

app.post('/api/logout', (c) => {
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

  const key = buildObjectKey(isAdmin ? 'admin' : 'teacher', subjectSlug, user.username, file.name || 'file');
  const full = filePathOf(key);
  if (!full) return c.json({ error: '非法路径' }, 400);
  mkdirSync(path.dirname(full), { recursive: true });

  // 保存文件（本地磁盘替代 R2）
  await pipeline(Readable.fromWeb(file.stream()), createWriteStream(full));

  db.prepare(
    `INSERT INTO files (key, title, subject_id, uploader_id, uploader_username, visibility, uploaded_at, size, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(key, file.name || 'file', subjectId || null, user.sub, user.username, visibility, Date.now(), file.size, file.type || 'application/octet-stream');

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
    seen.add(username);
  }

  for (const u of users) {
    const username = (u.username || '').trim();
    if (!username || failed.some((f) => f.username === username)) continue;
    const password = randomPassword();
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
