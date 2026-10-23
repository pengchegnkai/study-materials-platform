/// providers/files_provider.dart —— 文件清单与科目列表
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../services/platform_service.dart';

final subjectsProvider = FutureProvider.autoDispose<List<Subject>>((ref) async {
  return PlatformService().subjects();
});

final manifestProvider = FutureProvider.autoDispose<List<FileItem>>((ref) async {
  return PlatformService().manifest();
});

/// 某个科目 slug 下的文件（按老师分组）
final subjectFilesProvider = FutureProvider.autoDispose
    .family<Map<String, List<FileItem>>, String>((ref, slug) async {
  final all = await PlatformService().manifest();
  final files = all.where((f) => f.subjectSlug == slug).toList();
  final grouped = <String, List<FileItem>>{};
  for (final f in files) {
    grouped.putIfAbsent(f.uploader, () => []).add(f);
  }
  return grouped;
});
