/**
 * GET  /api/admin/users ：用户列表（含角色、科目、状态）。
 * POST /api/admin/users ：创建单个用户。
 */

import type { Env } from '../../lib/auth';
import { hashPassword, json, jsonError, requireAdmin } from '../../lib/auth';

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // 所有写/敏感接口第一行：require 守卫
  await requireAdmin(request, env);

  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.status, u.created_at,
            COALESCE((SELECT GROUP_CONCAT(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles,
            COALESCE((SELECT GROUP_CONCAT(s.name) FROM user_subjects us JOIN subjects s ON s.id = us.subject_id WHERE us.user_id = u.id), '') AS subjects
     FROM users u ORDER BY u.created_at DESC`
  ).all();

  const users = rows.results.map((r: any) => ({
    id: r.id,
    username: r.username,
    status: r.status,
    createdAt: r.created_at,
    roles: r.roles ? r.roles.split(',') : [],
    subjects: r.subjects ? r.subjects.split(',') : [],
  }));

  return json({ users });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);

  let body: { username?: string; password?: string; roleIds?: string[]; subjectIds?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const username = (body.username || '').trim();
  if (!username) return jsonError('用户名不能为空', 400);
  if (!body.roleIds || body.roleIds.length === 0) return jsonError('至少分配一个角色', 400);

  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (exists) return jsonError('用户名已存在', 409);

  const password = body.password || '';
  if (password.length < 6) return jsonError('密码至少 6 位', 400);

  const id = randomId('user');
  const hash = await hashPassword(password);
  const batch: D1PreparedStatement[] = [
    env.DB.prepare('INSERT INTO users (id, username, password_hash, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(
      id, username, hash, 'active', Date.now(), admin.username
    ),
    ...body.roleIds.map((rid) =>
      env.DB.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').bind(id, rid)
    ),
    ...(body.subjectIds || []).map((sid) =>
      env.DB.prepare('INSERT INTO user_subjects (user_id, subject_id) VALUES (?, ?)').bind(id, sid)
    ),
  ];
  await env.DB.batch(batch);

  // 初始密码只返回一次，不写日志
  return json({ ok: true, user: { id, username, created: [ { username, password, roleIds: body.roleIds, subjectIds: body.subjectIds || [] } ], failed: [] } });
};
