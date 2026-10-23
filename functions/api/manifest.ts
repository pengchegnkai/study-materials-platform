/**
 * GET /api/manifest
 * 登录 + 按 canView 过滤，返回扁平数组。
 * 字段：key/title/type/size/subject/uploader/visibility/uploadedAt/canManage
 * 安全底线：与 /api/file 双处校验，前端过滤仅影响体验。
 */

import type { Env } from '../lib/auth';
import { getSession, json, jsonError } from '../lib/auth';
import { canView, type FileRow } from '../lib/access';

interface ManifestRow extends FileRow {
  subject_name: string | null;
  subject_slug: string | null;
}

function extType(key: string, contentType: string | null): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['pptx', 'ppt'].includes(ext)) return 'pptx';
  if (['docx', 'doc'].includes(ext)) return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (contentType?.startsWith('image/')) return 'image';
  return 'other';
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(request, env);
  if (!user) return jsonError('未登录', 401);

  const rows = await env.DB.prepare(
    `SELECT f.key, f.title, f.subject_id, f.uploader_id, f.uploader_username,
            f.visibility, f.uploaded_at, f.size, f.content_type,
            s.name AS subject_name, s.slug AS subject_slug
     FROM files f LEFT JOIN subjects s ON s.id = f.subject_id
     ORDER BY f.uploaded_at DESC`
  ).all<ManifestRow>();

  const ctx = { env, user };
  const out = [];
  for (const row of rows.results) {
    if (!(await canView(ctx, row))) continue;
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

  return json({ files: out });
};
