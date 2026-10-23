/**
 * 鉴权与会话（Web Crypto API 实现）
 *
 * 安全底线（十二节）：
 * - PBKDF2-SHA256 100000 次 + 恒定时间比较
 * - 会话令牌 HMAC-SHA256 签名，8 小时过期
 * - Cookie 必须 HttpOnly; Secure; SameSite=Strict
 * - 所有写接口第一行必须调用对应 require 函数
 */

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
}

export interface SessionUser {
  sub: string;
  username: string;
  roles: string[];
  exp: number;
}

export interface SessionContext {
  env: Env;
  user: SessionUser | null;
}

const ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 小时
export const SESSION_COOKIE_NAME = 'admin_session';
const PBKDF2_PREFIX = 'pbkdf2$';

// ---------- 密码哈希 ----------

function base64Encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pbkdf2Derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
  lengthBytes: number
): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    keyMaterial,
    lengthBytes * 8
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2Derive(password, salt, ITERATIONS, 32);
  return `${PBKDF2_PREFIX}${ITERATIONS}$${base64Encode(salt)}$${base64Encode(bits)}`;
}

/** 恒定时间字符串比较 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64Decode(parts[2]);
    expected = base64Decode(parts[3]);
  } catch {
    return false;
  }
  const bits = await pbkdf2Derive(password, salt, iterations, expected.length);
  const actual = base64Encode(bits);
  return constantTimeEqual(actual, base64Encode(expected));
}

// ---------- 会话令牌 ----------

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(
  sub: string,
  username: string,
  roles: string[],
  secret: string
): Promise<string> {
  const payload: SessionUser = {
    sub,
    username,
    roles,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = base64Encode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${base64Encode(sig)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionUser | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let ok: boolean;
  try {
    const key = await hmacKey(secret);
    ok = await crypto.subtle.verify(
      'HMAC',
      key,
      base64Decode(sig) as BufferSource,
      new TextEncoder().encode(body)
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64Decode(body))) as SessionUser;
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!Array.isArray(payload.roles)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Cookie / 会话解析 ----------

export function buildSessionCookie(token: string): string {
  // 安全底线：HttpOnly; Secure; SameSite=Strict
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function buildClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

/** 从请求解析已登录用户（未登录返回 null，不抛错） */
export async function getSession(
  request: Request,
  env: Env
): Promise<SessionUser | null> {
  const secret = env.SESSION_SECRET;
  if (!secret) return null;
  const token = parseCookies(request)[SESSION_COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token, secret);
}

// ---------- 守卫（所有写接口第一行必须调用） ----------

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}

/** 未登录返回 401 */
export async function requireLogin(request: Request, env: Env): Promise<SessionUser> {
  const user = await getSession(request, env);
  if (!user) throw jsonError('未登录', 401);
  return user;
}

/** 非管理员返回 403 */
export async function requireAdmin(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireLogin(request, env);
  if (!user.roles.includes('admin')) throw jsonError('无权限', 403);
  return user;
}

/** 不具备任一指定角色返回 403 */
export async function requireRole(
  request: Request,
  env: Env,
  roles: string[]
): Promise<SessionUser> {
  const user = await requireLogin(request, env);
  const has = roles.some((r) => user.roles.includes(r));
  if (!has) throw jsonError('无权限', 403);
  return user;
}

/** 账号被禁用（status != active）返回 403 */
export async function requireActiveUser(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireLogin(request, env);
  // 会话签发后账号可能被禁用，写操作前实时查库确认
  const row = await env.DB.prepare('SELECT status FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ status: string }>();
  // 环境变量管理员不在 users 表中，视为 active
  if (row && row.status !== 'active') throw jsonError('账号已被禁用', 403);
  return user;
}

/** 组合守卫：登录 + active（绝大多数写接口使用） */
export async function requireActiveLogin(request: Request, env: Env): Promise<SessionUser> {
  return requireActiveUser(request, env);
}
