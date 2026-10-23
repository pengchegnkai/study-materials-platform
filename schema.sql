-- 学习资料平台 D1 schema
-- 执行: wrangler d1 execute YOUR_D1_DATABASE_NAME --file=./schema.sql

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE user_subjects (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, subject_id)
);

CREATE TABLE files (
  key TEXT PRIMARY KEY,
  title TEXT,
  subject_id TEXT REFERENCES subjects(id),
  uploader_id TEXT NOT NULL REFERENCES users(id),
  uploader_username TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  uploaded_at INTEGER NOT NULL,
  size INTEGER,
  content_type TEXT
);

CREATE TABLE file_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  target TEXT,
  can_view INTEGER NOT NULL DEFAULT 1,
  can_manage INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_subjects_user ON user_subjects(user_id);
CREATE INDEX idx_files_subject ON files(subject_id);
CREATE INDEX idx_files_uploader ON files(uploader_id);

INSERT INTO roles (id, name, description) VALUES
  ('role-admin', 'admin', '管理员'),
  ('role-teacher', 'teacher', '老师'),
  ('role-student', 'student', '学生');

INSERT INTO subjects (id, name, slug, sort_order, created_at) VALUES
  ('sub-math', '数学', 'math', 1, unixepoch() * 1000),
  ('sub-chinese', '语文', 'chinese', 2, unixepoch() * 1000),
  ('sub-english', '英语', 'english', 3, unixepoch() * 1000);
