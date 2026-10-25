/// models —— 用户 / 科目 / 文件条目（与后端 /api 契约一致）
class SessionUser {
  final String id;
  final String username;
  final List<String> roles;
  final String? avatar;
  final String? nickname;
  bool get isAdmin => roles.contains('admin');
  bool get isTeacher => roles.contains('teacher') || isAdmin;
  String get displayName => (nickname == null || nickname!.isEmpty) ? username : nickname!;

  SessionUser({required this.id, required this.username, required this.roles, this.avatar, this.nickname});

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: j['id'] as String,
        username: j['username'] as String,
        roles: (j['roles'] as List).cast<String>(),
        avatar: j['avatar'] as String?,
        nickname: j['nickname'] as String?,
      );
}

class Subject {
  final String id;
  final String name;
  final String slug;
  final int publishedCount;

  Subject({required this.id, required this.name, required this.slug, required this.publishedCount});

  factory Subject.fromJson(Map<String, dynamic> j) => Subject(
        id: j['id'] as String,
        name: j['name'] as String,
        slug: j['slug'] as String,
        publishedCount: (j['published_count'] ?? 0) as int,
      );
}

class FileItem {
  final String key;
  final String title;
  final String type; // markdown / pptx / docx / image / other
  final int? size;
  final String? subject;
  final String? subjectSlug;
  final String uploader;
  final String visibility; // published / private
  final int uploadedAt;
  final bool canManage;
  final String dir; // 虚拟目录（manifest 返回）

  bool get isPublished => visibility == 'published';

  FileItem({
    required this.key,
    required this.title,
    required this.type,
    required this.size,
    required this.subject,
    required this.subjectSlug,
    required this.uploader,
    required this.visibility,
    required this.uploadedAt,
    required this.canManage,
    this.dir = '',
  });

  factory FileItem.fromJson(Map<String, dynamic> j) => FileItem(
        key: j['key'] as String,
        title: (j['title'] ?? '') as String,
        type: (j['type'] ?? 'other') as String,
        dir: (j['dir'] ?? '') as String,
        size: j['size'] as int?,
        subject: j['subject'] as String?,
        subjectSlug: j['subjectSlug'] as String?,
        uploader: (j['uploader'] ?? '') as String,
        visibility: (j['visibility'] ?? 'private') as String,
        uploadedAt: (j['uploadedAt'] ?? 0) as int,
        canManage: (j['canManage'] ?? false) as bool,
      );
}

class UploadResult {
  final bool ok;
  final String? key;
  final String? error;
  UploadResult({required this.ok, this.key, this.error});
}

/// 管理后台模型：仪表盘 / 文件 / 用户 / 科目（对齐 server.mjs 实际契约）
class AdminDashboard {
  final int onlineUsers;
  final int totalUsers;
  final int totalFiles;
  final int totalSize;
  final List<AdminFile> recentFiles;
  final Map<String, int> byType; // 文件类型分布

  AdminDashboard({
    required this.onlineUsers,
    required this.totalUsers,
    required this.totalFiles,
    required this.totalSize,
    required this.recentFiles,
    required this.byType,
  });

  factory AdminDashboard.fromJson(Map<String, dynamic> json) => AdminDashboard(
        onlineUsers: json['online'] as int? ?? 0,
        totalUsers: (json['users'] as Map?)?['total'] as int? ?? 0,
        totalFiles: (json['files'] as Map?)?['total'] as int? ?? 0,
        totalSize: (json['files'] as Map?)?['totalSize'] as int? ?? 0,
        recentFiles: (json['recentFiles'] as List? ?? [])
            .map((e) => AdminFile.fromJson(e as Map<String, dynamic>))
            .toList(),
        byType: _byType(json['files'] as Map?),
      );

  static Map<String, int> _byType(Map? files) {
    final list = (files?['byType'] as List? ?? []);
    final out = <String, int>{};
    for (final e in list) {
      final m = e as Map<String, dynamic>;
      out[m['type'] as String] = m['count'] as int;
    }
    return out;
  }
}

class AdminFile {
  final String key;
  final String title;
  final int size;
  final String visibility;
  final int uploadedAt;
  final String uploaderUsername;
  final String contentType;
  final String subject;
  final String subjectSlug;
  final String dir;

  AdminFile({
    required this.key,
    required this.title,
    required this.size,
    required this.visibility,
    required this.uploadedAt,
    required this.uploaderUsername,
    required this.contentType,
    required this.subject,
    required this.subjectSlug,
    this.dir = '',
  });

  factory AdminFile.fromJson(Map<String, dynamic> json) {
    final key = json['key'] as String;
    return AdminFile(
      key: key,
      title: json['title'] as String? ?? '',
      size: json['size'] as int? ?? 0,
      visibility: json['visibility'] as String? ?? 'private',
      uploadedAt: json['uploadedAt'] as int? ?? 0,
      uploaderUsername:
          (json['uploaderUsername'] ?? json['uploader'] ?? '') as String,
      contentType: json['contentType'] as String? ?? '',
      subject: json['subject'] as String? ?? '',
      subjectSlug: json['subjectSlug'] as String? ?? '',
      dir: json['dir'] as String? ?? '',
    );
  }
}

class AdminUser {
  final String id;
  final String username;
  final String status;
  final List<String> roles;
  final List<String> subjects; // 科目名列表
  final int createdAt;

  AdminUser({
    required this.id,
    required this.username,
    required this.status,
    required this.roles,
    required this.subjects,
    required this.createdAt,
  });

  int get subjectCount => subjects.length;

  factory AdminUser.fromJson(Map<String, dynamic> json) => AdminUser(
        id: json['id'] as String,
        username: json['username'] as String,
        status: json['status'] as String? ?? 'active',
        roles: (json['roles'] as List? ?? []).map((e) => e as String).toList(),
        subjects:
            (json['subjects'] as List? ?? []).map((e) => e as String).toList(),
        createdAt: json['createdAt'] as int? ?? 0,
      );
}

class AdminSubject {
  final String id;
  final String name;
  final String slug;
  final int sortOrder;
  final int fileCount;

  AdminSubject({
    required this.id,
    required this.name,
    required this.slug,
    required this.sortOrder,
    required this.fileCount,
  });

  factory AdminSubject.fromJson(Map<String, dynamic> json) => AdminSubject(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        sortOrder: json['sort_order'] as int? ?? 0,
        fileCount: json['file_count'] as int? ?? 0,
      );
}
