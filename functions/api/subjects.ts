/** GET /api/subjects：登录可见，含 published 文件计数 */

import type { Env } from '../lib/auth';
import { getSession, json, jsonError } from '../lib/auth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(request, env);
  if (!user) return jsonError('未登录', 401);

  const rows = await env.DB.prepare(
    `SELECT s.id, s.name, s.slug, s.sort_order,
            (SELECT COUNT(*) FROM files f WHERE f.subject_id = s.id AND f.visibility = 'published') AS published_count
     FROM subjects s ORDER BY s.sort_order, s.created_at`
  ).all<{ id: string; name: string; slug: string; sort_order: number; published_count: number }>();

  return json({ subjects: rows.results });
};
