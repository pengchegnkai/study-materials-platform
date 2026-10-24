/// pages/subject_page.dart —— 科目页：资源管理器风格展示该科目的开放文件
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/models.dart';
import '../providers/files_provider.dart';
import '../components/file_manager.dart';

class SubjectPage extends ConsumerWidget {
  final String slug;
  const SubjectPage({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final grouped = ref.watch(subjectFilesProvider(slug));

    return Scaffold(
      appBar: AppBar(
        title: const Text('资料列表'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '刷新',
            onPressed: () => ref.invalidate(subjectFilesProvider(slug)),
          ),
        ],
      ),
      body: grouped.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('$e'.replaceFirst('Exception: ', ''),
                style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => ref.invalidate(subjectFilesProvider(slug)),
              child: const Text('重试'),
            ),
          ]),
        ),
        data: (groups) {
          final allFiles = groups.values.expand((e) => e).toList();
          if (allFiles.isEmpty) {
            return const Center(
              child: Text('暂无开放文件', style: TextStyle(color: Color(0xFF6B7280))),
            );
          }
          final adminFiles = allFiles.map(_toAdminFile).toList();
          return FileManager(
            files: adminFiles,
            onDelete: (_) async {}, // 学生无删除权限
            onToggleVisibility: (_) async {}, // 学生无切换权限
            onRename: (_, __) async {}, // 学生无重命名权限
            canManage: false,
          );
        },
      ),
    );
  }

  AdminFile _toAdminFile(FileItem f) {
    return AdminFile(
      key: f.key,
      title: f.title,
      size: f.size ?? 0,
      visibility: f.visibility,
      uploadedAt: f.uploadedAt,
      uploaderUsername: f.uploader,
      contentType: _contentTypeFromType(f.type),
      subject: f.subject ?? '',
      subjectSlug: f.subjectSlug ?? '',
    );
  }

  String _contentTypeFromType(String type) {
    switch (type) {
      case 'markdown':
        return 'text/markdown';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'image':
        return 'image/*';
      default:
        return 'application/octet-stream';
    }
  }
}
