/**
 * GET /api/admin/dashboard
 * 返回后台看板统计数据（Cloudflare Pages Functions 版本，D1 语法）
 */

import type { Env } from '../../lib/auth';
import { json, requireAdmin } from '../../lib/auth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await requireAdmin(request, env);
  const db = env.DB;

  // 用户统计
  const totalUsers = (await db.prepare('SELECT COUNT(*) AS c FROM users').first<{ c: number }>())!.c;
  const activeUsers = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE status = 'active'").first<{ c: number }>())!.c;
  const teacherCount = (await db.prepare("SELECT COUNT(*) AS c FROM user_roles WHERE role_id = 'role-teacher'").first<{ c: number }>())!.c;
  const studentCount = (await db.prepare("SELECT COUNT(*) AS c FROM user_roles WHERE role_id = 'role-student'").first<{ c: number }>())!.c;

  // 科目统计
  const totalSubjects = (await db.prepare('SELECT COUNT(*) AS c FROM subjects').first<{ c: number }>())!.c;
  const subjectsWithFiles = (await db.prepare('SELECT COUNT(DISTINCT subject_id) AS c FROM files WHERE subject_id IS NOT NULL').first<{ c: number }>())!.c;

  // 文件统计
  const totalFiles = (await db.prepare('SELECT COUNT(*) AS c FROM files').first<{ c: number }>())!.c;
  const publishedFiles = (await db.prepare("SELECT COUNT(*) AS c FROM files WHERE visibility = 'published'").first<{ c: number }>())!.c;
  const privateFiles = (await db.prepare("SELECT COUNT(*) AS c FROM files WHERE visibility = 'private'").first<{ c: number }>())!.c;

  // 存储大小
  const totalSizeRow = await db.prepare('SELECT SUM(size) AS s FROM files').first<{ s: number | null }>();
  const totalSize = totalSizeRow?.s || 0;

  // 最近上传的文件
  const recentFiles = (
    await db.prepare(
      `SELECT f.key, f.title, f.subject_id, f.uploader_username, f.visibility, f.uploaded_at, f.size,
              s.name AS subject_name
       FROM files f LEFT JOIN subjects s ON s.id = f.subject_id
       ORDER BY f.uploaded_at DESC LIMIT 10`
    ).all()
  ).results;

  // 最近注册的用户
  const recentUsers = (
    await db.prepare(
      `SELECT u.id, u.username, u.status, u.created_at,
              COALESCE((SELECT GROUP_CONCAT(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles
       FROM users u ORDER BY u.created_at DESC LIMIT 10`
    ).all()
  ).results;

  // 按类型统计文件
  const typeStats = (
    await db.prepare(
      `SELECT
         CASE
           WHEN key LIKE '%.md' OR key LIKE '%.markdown' THEN 'markdown'
           WHEN key LIKE '%.pptx' OR key LIKE '%.ppt' THEN 'pptx'
           WHEN key LIKE '%.docx' OR key LIKE '%.doc' THEN 'docx'
           WHEN key LIKE '%.png' OR key LIKE '%.jpg' OR key LIKE '%.jpeg' OR key LIKE '%.gif' OR key LIKE '%.webp' OR key LIKE '%.svg' OR key LIKE '%.bmp' THEN 'image'
           ELSE 'other'
         END AS type,
         COUNT(*) AS count
       FROM files
       GROUP BY type`
    ).all<{ type: string; count: number }>()
  ).results;

  return json({
    users: {
      total: totalUsers,
      active: activeUsers,
      teachers: teacherCount,
      students: studentCount,
    },
    subjects: {
      total: totalSubjects,
      withFiles: subjectsWithFiles,
    },
    files: {
      total: totalFiles,
      published: publishedFiles,
      private: privateFiles,
      totalSize,
      byType: typeStats,
    },
    recentFiles: recentFiles.map((r: any) => ({
      key: r.key,
      title: r.title || r.key.split('/').pop(),
      subject: r.subject_name,
      uploader: r.uploader_username,
      visibility: r.visibility,
      uploadedAt: r.uploaded_at,
      size: r.size,
    })),
    recentUsers: recentUsers.map((r: any) => ({
      id: r.id,
      username: r.username,
      status: r.status,
      createdAt: r.created_at,
      roles: r.roles ? r.roles.split(',') : [],
    })),
  });
};
