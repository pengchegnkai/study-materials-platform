/**
 * 权限判定（六节规范）
 *
 * 安全底线：
 * - 前端隐藏按钮不是安全边界；/api/file 与 /api/manifest 两处都必须独立校验 canView。
 * - R2 key 只能由服务端生成，禁止信任前端路径。
 */

import type { Env, SessionUser } from './auth';

export interface FileRow {
  key: string;
  title: string | null;
  subject_id: string | null;
  uploader_id: string;
  uploader_username: string;
  visibility: string;
  uploaded_at: number;
  size: number | null;
  content_type: string | null;
}

export interface AccessContext {
  env: Env;
  user: SessionUser | null;
}

/** 获取用户角色（环境变量管理员不在 users 表，以会话 payload 为准） */
export async function getUserRoles(env: Env, user: SessionUser): Promise<string[]> {
  if (user.roles.includes('admin')) return user.roles;
  const rows = await env.DB.prepare(
    `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`
  )
    .bind(user.sub)
    .all<{ name: string }>();
  return rows.results.map((r) => r.name);
}

export async function isActiveUser(env: Env, user: SessionUser): Promise<boolean> {
  const row = await env.DB.prepare('SELECT status FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ status: string }>();
  // 环境变量管理员不在 users 表中，视为 active
  return row ? row.status === 'active' : true;
}

/**
 * canView 判定：
 * - 无会话 / 非 active → false
 * - admin → true
 * - uploader_id === userId → true
 * - file_permissions 用户级或角色级匹配且 can_view=1 → true
 * - student 且 visibility='published' → true
 * - 否则 false
 */
export async function canView(ctx: AccessContext, file: FileRow): Promise<boolean> {
  const { env, user } = ctx;
  if (!user) return false;
  if (!(await isActiveUser(env, user))) return false;
  if (user.roles.includes('admin')) return true;
  if (file.uploader_id === user.sub) return true;

  // 用户级授权
  const userPerm = await env.DB.prepare(
    `SELECT 1 FROM file_permissions
     WHERE user_id = ? AND can_view = 1 AND (target IS NULL OR target = ? OR target = ?)`
  )
    .bind(user.sub, file.key, file.subject_id ?? '')
    .first();
  if (userPerm) return true;

  // 角色级授权
  const roles = await getUserRoles(env, user);
  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const rolePerm = await env.DB.prepare(
      `SELECT 1 FROM file_permissions
       WHERE role_id IN (${placeholders}) AND can_view = 1 AND (target IS NULL OR target = ? OR target = ?)`
    )
      .bind(...roles, file.key, file.subject_id ?? '')
      .first();
    if (rolePerm) return true;
  }

  // 学生 + 已发布
  if (roles.includes('student') && file.visibility === 'published') return true;

  return false;
}

/** requireOwner：admin 或 files.uploader_id === userId；不满足抛 Response */
export async function requireOwner(
  ctx: AccessContext,
  key: string
): Promise<FileRow> {
  const { env, user } = ctx;
  if (!user) throw new Response('未登录', { status: 401 });
  if (!(await isActiveUser(env, user))) throw new Response('账号已被禁用', { status: 403 });

  const file = await env.DB.prepare(
    'SELECT key, title, subject_id, uploader_id, uploader_username, visibility, uploaded_at, size, content_type FROM files WHERE key = ?'
  )
    .bind(key)
    .first<FileRow>();
  if (!file) throw new Response('文件不存在', { status: 404 });

  if (user.roles.includes('admin') || file.uploader_id === user.sub) return file;
  throw new Response('无权限', { status: 403 });
}

/** requireUploader：admin 或 teacher 且 user_subjects 包含 subjectId */
export async function requireUploader(
  ctx: AccessContext,
  subjectId: string
): Promise<void> {
  const { env, user } = ctx;
  if (!user) throw new Response('未登录', { status: 401 });
  if (!(await isActiveUser(env, user))) throw new Response('账号已被禁用', { status: 403 });
  if (user.roles.includes('admin')) return;
  if (!user.roles.includes('teacher')) throw new Response('无权限', { status: 403 });

  const rel = await env.DB.prepare(
    'SELECT 1 FROM user_subjects WHERE user_id = ? AND subject_id = ?'
  )
    .bind(user.sub, subjectId)
    .first();
  if (!rel) throw new Response('未分配该科目', { status: 403 });
}

/** 清洗文件名：去掉路径分隔、控制字符，避免 ../、\ 等 */
export function sanitizeFilename(name: string): string {
  const base = name.split('/').pop()!.split('\\').pop()!;
  return base
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/\s+/g, ' ')
    .trim() || 'file';
}

/** 服务端生成 R2 key（禁止信任前端路径） */
export function buildObjectKey(
  role: 'admin' | 'teacher',
  subjectSlug: string | null,
  username: string,
  filename: string
): string {
  const safe = sanitizeFilename(filename);
  if (role === 'admin') {
    return `uploads/admin/${Date.now()}-${safe}`;
  }
  const slug = sanitizeFilename(subjectSlug ?? 'misc');
  return `uploads/${slug}/${encodeURIComponent(username)}/${Date.now()}-${safe}`;
}
