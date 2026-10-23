/** DELETE /api/delete?key= ：requireOwner；删 R2 + files 记录。 */

import type { Env } from '../lib/auth';
import { json, jsonError, requireActiveLogin } from '../lib/auth';
import { requireOwner } from '../lib/access';

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  // 所有写接口第一行：require 守卫
  const user = await requireActiveLogin(request, env);

  const key = new URL(request.url).searchParams.get('key');
  if (!key) return jsonError('缺少 key 参数', 400);

  try {
    await requireOwner({ env, user }, key);
  } catch (resp) {
    if (resp instanceof Response) return resp;
    throw resp;
  }

  await env.FILES.delete(key);
  await env.DB.prepare('DELETE FROM files WHERE key = ?').bind(key).run();

  return json({ ok: true });
};
