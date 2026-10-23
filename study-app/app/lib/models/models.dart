/// models —— 用户 / 科目 / 文件条目（与后端 /api 契约一致）
class SessionUser {
  final String id;
  final String username;
  final List<String> roles;
  bool get isAdmin => roles.contains('admin');
  bool get isTeacher => roles.contains('teacher') || isAdmin;

  SessionUser({required this.id, required this.username, required this.roles});

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: j['id'] as String,
        username: j['username'] as String,
        roles: (j['roles'] as List).cast<String>(),
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
  });

  factory FileItem.fromJson(Map<String, dynamic> j) => FileItem(
        key: j['key'] as String,
        title: (j['title'] ?? '') as String,
        type: (j['type'] ?? 'other') as String,
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
