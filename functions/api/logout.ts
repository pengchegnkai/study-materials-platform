/** POST /api/logout：清除会话 Cookie */

import type { Env } from '../lib/auth';
import { buildClearCookie, json } from '../lib/auth';

export const onRequestPost: PagesFunction<Env> = async () => {
  return json({ ok: true }, 200, { 'Set-Cookie': buildClearCookie() });
};
