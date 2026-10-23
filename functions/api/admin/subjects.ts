/**
 * GET/POST/PATCH/DELETE /api/admin/subjects
 * 安全底线：删除有文件引用的科目返回 409。
 */

import type { Env } from '../../lib/auth';
import { json, jsonError, requireAdmin } from '../../lib/auth';

function slugify(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, '-');
  return /[a-z0-9-]/.test(cleaned) ? cleaned : `sub-${Date.now().toString(36)}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name, s.slug, s.sort_order,
            (SELECT COUNT(*) FROM files f WHERE f.subject_id = s.id) AS file_count
     FROM subjects s ORDER BY s.sort_order, s.created_at`
  ).all();
  return json({ subjects: rows.results });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);

  let body: { name?: string; sortOrder?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const name = (body.name || '').trim();
  if (!name) return jsonError('科目名不能为空', 400);

  const exists = await env.DB.prepare('SELECT 1 FROM subjects WHERE name = ?').bind(name).first();
  if (exists) return jsonError('科目已存在', 409);

  const id = `sub-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.prepare('INSERT INTO subjects (id, name, slug, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').bind(
    id, name, slugify(name), body.sortOrder ?? 0, Date.now()
  ).run();
  return json({ ok: true, id });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);

  let body: { id?: string; name?: string; sortOrder?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }
  if (!body.id) return jsonError('缺少 id', 400);

  if (body.name !== undefined) {
    await env.DB.prepare('UPDATE subjects SET name = ? WHERE id = ?').bind(body.name.trim(), body.id).run();
  }
  if (body.sortOrder !== undefined) {
    await env.DB.prepare('UPDATE subjects SET sort_order = ? WHERE id = ?').bind(body.sortOrder, body.id).run();
  }
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('缺少 id 参数', 400);

  const ref = await env.DB.prepare('SELECT COUNT(*) AS c FROM files WHERE subject_id = ?')
    .bind(id)
    .first<{ c: number }>();
  if (ref && ref.c > 0) return jsonError('该科目下仍有文件，无法删除', 409);

  await env.DB.prepare('DELETE FROM subjects WHERE id = ?').bind(id).run();
  return json({ ok: true });
};
