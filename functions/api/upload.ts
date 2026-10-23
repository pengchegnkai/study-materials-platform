/**
 * POST /api/upload
 * admin/teacher；multipart/form-data 字段 file、subjectId、visibility。
 * 老师必须 subjectId ∈ user_subjects；R2 key 由服务端生成（禁止信任前端路径）。
 * 老师键: uploads/{subjectSlug}/{username}/{timestamp}-{safeFilename}
 * 管理员键: uploads/admin/{timestamp}-{safeFilename}
 */

import type { Env } from '../lib/auth';
import { json, jsonError, requireActiveLogin } from '../lib/auth';
import { buildObjectKey, requireUploader } from '../lib/access';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 所有写接口第一行：require 守卫
  const user = await requireActiveLogin(request, env);
  if (!user.roles.includes('admin') && !user.roles.includes('teacher')) {
    return jsonError('无权限', 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const fileEntry = form.get('file') as unknown;
  const file =
    fileEntry && typeof fileEntry === 'object' && 'stream' in fileEntry && 'size' in fileEntry
      ? (fileEntry as File & { stream(): ReadableStream })
      : null;
  const subjectId = (form.get('subjectId') as string | null) || '';
  const visibility = (form.get('visibility') as string | null) || 'private';

  if (!file || file.size === 0) return jsonError('缺少文件', 400);
  if (!['private', 'published'].includes(visibility)) return jsonError('visibility 取值非法', 400);

  const isAdmin = user.roles.includes('admin');
  let subjectSlug: string | null = null;
  let subjectName: string | null = null;

  if (isAdmin) {
    if (subjectId) {
      const s = await env.DB.prepare('SELECT id, name, slug FROM subjects WHERE id = ?')
        .bind(subjectId)
        .first<{ id: string; name: string; slug: string }>();
      if (s) {
        subjectSlug = s.slug;
        subjectName = s.name;
      }
    }
  } else {
    if (!subjectId) return jsonError('必须选择科目', 400);
    // 老师只能上传到被分配科目
    try {
      await requireUploader({ env, user }, subjectId);
    } catch (resp) {
      if (resp instanceof Response) return resp;
      throw resp;
    }
    const s = await env.DB.prepare('SELECT id, name, slug FROM subjects WHERE id = ?')
      .bind(subjectId)
      .first<{ id: string; name: string; slug: string }>();
    if (!s) return jsonError('科目不存在', 400);
    subjectSlug = s.slug;
    subjectName = s.name;
  }

  // 服务端生成 R2 key
  const filename = file.name || 'file';
  const key = buildObjectKey(isAdmin ? 'admin' : 'teacher', subjectSlug, user.username, filename);

  await env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  await env.DB.prepare(
    `INSERT INTO files (key, title, subject_id, uploader_id, uploader_username, visibility, uploaded_at, size, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      key,
      filename,
      subjectId || null,
      user.sub,
      user.username,
      visibility,
      Date.now(),
      file.size,
      file.type || 'application/octet-stream'
    )
    .run();

  return json({ ok: true, key, subject: subjectName });
};
