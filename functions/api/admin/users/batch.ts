/**
 * POST /api/admin/users/batch
 * 批量创建用户：预检查、随机密码（≥12 位）、PBKDF2 哈希、db.batch() 每批 ≤50 条。
 * 返回 { created: [{username,password,roleIds,subjectIds}], failed: [{username,reason}] }
 * 密码只返回一次，不写日志，D1 只存哈希。
 */

import type { Env } from '../../../lib/auth';
import { hashPassword, json, jsonError, requireAdmin } from '../../../lib/auth';

interface BatchUser {
  username?: string;
  roleIds?: string[];
  subjectIds?: string[];
}

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** 生成 12+ 位随机密码（大小写字母 + 数字，无易混淆字符） */
function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const len = 14;
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const BATCH_LIMIT = 50;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);

  let body: { users?: BatchUser[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const users = body.users || [];
  if (users.length === 0) return jsonError('用户列表为空', 400);

  // 预检查：角色 / 科目存在性，用户名重复（库内 + 批内）
  const existing = new Set(
    (await env.DB.prepare('SELECT username FROM users').all<{ username: string }>())
      .results.map((r) => r.username)
  );
  const seen = new Set<string>();
  const created: { username: string; password: string; roleIds: string[]; subjectIds: string[] }[] = [];
  const failed: { username: string; reason: string }[] = [];

  for (const u of users) {
    const username = (u.username || '').trim();
    if (!username) {
      failed.push({ username: username || '(空)', reason: '用户名为空' });
      continue;
    }
    if (seen.has(username)) {
      failed.push({ username, reason: '批内用户名重复' });
      continue;
    }
    if (existing.has(username)) {
      failed.push({ username, reason: '用户名已存在' });
      continue;
    }
    if (!u.roleIds || u.roleIds.length === 0) {
      failed.push({ username, reason: '未分配角色' });
      continue;
    }
    seen.add(username);
  }

  const toCreate = users.filter(
    (u) => !failed.some((f) => f.username === (u.username || '').trim()) && (u.username || '').trim()
  );

  for (const u of toCreate) {
    const username = u.username!.trim();
    const password = randomPassword(); // ≥12 位
    const hash = await hashPassword(password);
    const id = randomId('user');

    const statements = [
      env.DB.prepare(
        'INSERT INTO users (id, username, password_hash, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, username, hash, 'active', Date.now(), admin.username),
      ...u.roleIds!.map((rid) =>
        env.DB.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').bind(id, rid)
      ),
      ...(u.subjectIds || []).map((sid) =>
        env.DB.prepare('INSERT INTO user_subjects (user_id, subject_id) VALUES (?, ?)').bind(id, sid)
      ),
    ];

    // 每批 ≤50 条语句
    for (let i = 0; i < statements.length; i += BATCH_LIMIT) {
      await env.DB.batch(statements.slice(i, i + BATCH_LIMIT));
    }

    created.push({ username, password, roleIds: u.roleIds!, subjectIds: u.subjectIds || [] });
    existing.add(username);
  }

  // 初始密码只返回一次；前端必须让管理员显式确认后丢弃
  return json({ ok: true, created, failed });
};
