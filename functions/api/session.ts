/** GET /api/session：返回当前登录用户信息（未登录 401） */

import type { Env } from '../lib/auth';
import { getSession, json, jsonError } from '../lib/auth';
import { isActiveUser } from '../lib/access';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(request, env);
  if (!user) return jsonError('未登录', 401);
  if (!(await isActiveUser(env, user))) return jsonError('账号已被禁用', 403);
  return json({
    user: { id: user.sub, username: user.username, roles: user.roles },
  });
};
