/**
 * POST /api/login
 * 校验环境变量管理员或 D1 用户；失败 401 + 延迟 500ms；成功设 Cookie 返回 { ok, roles }。
 */

import type { Env } from '../lib/auth';
import {
  buildSessionCookie,
  createSessionToken,
  json,
  jsonError,
  verifyPassword,
} from '../lib/auth';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const username = (body.username || '').trim();
  const password = body.password || '';
  if (!username || !password) {
    await new Promise((r) => setTimeout(r, 500));
    return jsonError('用户名或密码错误', 401);
  }

  // 1. 环境变量管理员
  if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD_HASH && username === env.ADMIN_USERNAME) {
    const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
    if (ok) {
      const token = await createSessionToken('env-admin', username, ['admin'], env.SESSION_SECRET!);
      return json({ ok: true, roles: ['admin'] }, 200, { 'Set-Cookie': buildSessionCookie(token) });
    }
    await new Promise((r) => setTimeout(r, 500));
    return jsonError('用户名或密码错误', 401);
  }

  // 2. D1 用户
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.password_hash, u.status,
            COALESCE((SELECT GROUP_CONCAT(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles
     FROM users u WHERE u.username = ?`
  )
    .bind(username)
    .first<{ id: string; username: string; password_hash: string; status: string; roles: string }>();

  if (!row || row.status !== 'active' || !(await verifyPassword(password, row.password_hash))) {
    await new Promise((r) => setTimeout(r, 500));
    return jsonError('用户名或密码错误', 401);
  }

  const roles = row.roles ? row.roles.split(',') : [];
  const token = await createSessionToken(row.id, row.username, roles, env.SESSION_SECRET!);
  return json({ ok: true, roles }, 200, { 'Set-Cookie': buildSessionCookie(token) });
};
