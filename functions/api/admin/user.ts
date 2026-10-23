/**
 * PATCH  /api/admin/user ：修改用户（状态/密码/角色/科目，全量替换角色与科目）。
 * DELETE /api/admin/user ：删除用户。
 * 安全底线：禁止管理员禁用、降级或删除自己。
 */

import type { Env } from '../../lib/auth';
import { hashPassword, json, jsonError, requireAdmin } from '../../lib/auth';

interface AdminEnv extends Env {
  ADMIN_USERNAME?: string;
}

export const onRequestPatch: PagesFunction<AdminEnv> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);

  let body: {
    id?: string;
    status?: string;
    password?: string;
    roleIds?: string[];
    subjectIds?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  if (!body.id) return jsonError('缺少用户 id', 400);

  const target = await env.DB.prepare('SELECT id, username FROM users WHERE id = ?')
    .bind(body.id)
    .first<{ id: string; username: string }>();
  if (!target) return jsonError('用户不存在', 404);

  const isSelf = target.id === admin.sub || target.username === admin.username;

  // 禁止管理员禁用或降级自己
  if (isSelf) {
    if (body.status && body.status !== 'active') return jsonError('不能禁用自己', 400);
    if (body.roleIds && !body.roleIds.includes('role-admin')) return jsonError('不能降级自己', 400);
  }

  const statements: D1PreparedStatement[] = [];

  if (body.status) {
    if (!['active', 'disabled'].includes(body.status)) return jsonError('status 取值非法', 400);
    statements.push(env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(body.status, target.id));
  }

  if (body.password) {
    if (body.password.length < 6) return jsonError('密码至少 6 位', 400);
    const hash = await hashPassword(body.password);
    statements.push(env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, target.id));
  }

  // 全量替换角色
  if (body.roleIds) {
    statements.push(env.DB.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(target.id));
    for (const rid of body.roleIds) {
      statements.push(env.DB.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').bind(target.id, rid));
    }
  }

  // 全量替换科目
  if (body.subjectIds) {
    statements.push(env.DB.prepare('DELETE FROM user_subjects WHERE user_id = ?').bind(target.id));
    for (const sid of body.subjectIds) {
      statements.push(env.DB.prepare('INSERT INTO user_subjects (user_id, subject_id) VALUES (?, ?)').bind(target.id, sid));
    }
  }

  if (statements.length > 0) await env.DB.batch(statements);
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<AdminEnv> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('缺少 id 参数', 400);

  // 禁止删除自己
  if (id === admin.sub) return jsonError('不能删除自己', 400);

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!target) return jsonError('用户不存在', 404);

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ ok: true });
};
