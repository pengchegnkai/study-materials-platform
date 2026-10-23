/**
 * GET/POST/PATCH/DELETE /api/admin/permissions
 * 可选细粒度权限（file_permissions 表）。
 * scope: 'file' | 'subject' | 'all'；target: 对应 key 或 subject_id（scope=all 时为空）。
 */

import type { Env } from '../../lib/auth';
import { json, jsonError, requireAdmin } from '../../lib/auth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);
  const rows = await env.DB.prepare(
    `SELECT p.id, p.user_id, p.role_id, p.scope, p.target, p.can_view, p.can_manage,
            u.username AS user_username, r.name AS role_name
     FROM file_permissions p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN roles r ON r.id = p.role_id
     ORDER BY p.id`
  ).all();
  return json({ permissions: rows.results });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);

  let body: {
    userId?: string | null;
    roleId?: string | null;
    scope?: string;
    target?: string | null;
    canView?: boolean;
    canManage?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const scope = body.scope || 'file';
  if (!['file', 'subject', 'all'].includes(scope)) return jsonError('scope 取值非法', 400);
  if (!body.userId && !body.roleId) return jsonError('必须指定用户或角色', 400);

  const id = `perm-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.prepare(
    `INSERT INTO file_permissions (id, user_id, role_id, scope, target, can_view, can_manage)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.userId || null, body.roleId || null, scope, body.target || null, body.canView === false ? 0 : 1, body.canManage ? 1 : 0)
    .run();
  return json({ ok: true, id });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);

  let body: { id?: string; canView?: boolean; canManage?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }
  if (!body.id) return jsonError('缺少 id', 400);

  if (body.canView !== undefined) {
    await env.DB.prepare('UPDATE file_permissions SET can_view = ? WHERE id = ?').bind(body.canView ? 1 : 0, body.id).run();
  }
  if (body.canManage !== undefined) {
    await env.DB.prepare('UPDATE file_permissions SET can_manage = ? WHERE id = ?').bind(body.canManage ? 1 : 0, body.id).run();
  }
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('缺少 id 参数', 400);

  await env.DB.prepare('DELETE FROM file_permissions WHERE id = ?').bind(id).run();
  return json({ ok: true });
};
