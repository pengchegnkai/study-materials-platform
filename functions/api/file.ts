/**
 * GET  /api/file?key= ：登录 + 独立执行 canView，从 R2 返回流并设 Content-Type。
 * PATCH /api/file     ：requireOwner；只允许改 title / visibility。
 *
 * 安全底线：/api/file 必须独立执行 canView，不能只依赖 manifest 过滤。
 */

import type { Env } from '../lib/auth';
import { getSession, json, jsonError, requireActiveLogin } from '../lib/auth';
import { canView, requireOwner, type FileRow } from '../lib/access';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(request, env);
  if (!user) return jsonError('未登录', 401);

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return jsonError('缺少 key 参数', 400);

  const row = await env.DB.prepare(
    'SELECT key, title, subject_id, uploader_id, uploader_username, visibility, uploaded_at, size, content_type FROM files WHERE key = ?'
  )
    .bind(key)
    .first<FileRow>();
  if (!row) return jsonError('文件不存在', 404);

  if (!(await canView({ env, user }, row))) return jsonError('无权限', 403);

  const object = await env.FILES.get(key);
  if (!object) return jsonError('文件不存在', 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || row.content_type || 'application/octet-stream');
  if (object.size != null) headers.set('Content-Length', String(object.size));
  const filename = key.split('/').pop() || 'file';
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  headers.set('Cache-Control', 'private, no-store');

  return new Response(object.body, { status: 200, headers });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  // 所有写接口第一行：require 守卫
  const user = await requireActiveLogin(request, env);

  let body: { key?: string; title?: string; visibility?: string };
  try {
    body = (await request.json()) as { key?: string; title?: string; visibility?: string };
  } catch {
    return jsonError('请求格式错误', 400);
  }
  if (!body.key) return jsonError('缺少 key', 400);
  if (body.visibility && !['private', 'published'].includes(body.visibility)) {
    return jsonError('visibility 取值非法', 400);
  }

  const ctx = { env, user };
  let file;
  try {
    file = await requireOwner(ctx, body.key);
  } catch (resp) {
    if (resp instanceof Response) return resp;
    throw resp;
  }

  if (body.title !== undefined) {
    await env.DB.prepare('UPDATE files SET title = ? WHERE key = ?').bind(body.title.trim(), body.key).run();
  }
  if (body.visibility !== undefined) {
    await env.DB.prepare('UPDATE files SET visibility = ? WHERE key = ?').bind(body.visibility, body.key).run();
  }

  return json({ ok: true, visibility: body.visibility ?? file.visibility });
};
