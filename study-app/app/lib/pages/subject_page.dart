/// pages/subject_page.dart —— 科目页：按老师分组的文件列表，点击进预览
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/models.dart';
import '../providers/files_provider.dart';
import '../utils/format.dart';

class SubjectPage extends ConsumerWidget {
  final String slug;
  const SubjectPage({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final grouped = ref.watch(subjectFilesProvider(slug));

    return Scaffold(
      appBar: AppBar(title: const Text('资料列表')),
      body: grouped.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('$e'.replaceFirst('Exception: ', ''),
                style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: () => ref.invalidate(subjectFilesProvider(slug)), child: const Text('重试')),
          ]),
        ),
        data: (groups) {
          if (groups.isEmpty) {
            return const Center(child: Text('暂无开放文件', style: TextStyle(color: Color(0xFF6B7280))));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(subjectFilesProvider(slug)),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final entry in groups.entries) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8, top: 8),
                    child: Text('${entry.key} · ${entry.value.length} 个文件',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                  ...entry.value.map((f) => Card(
                        child: ListTile(
                          leading: _TypeIcon(type: f.type),
                          title: Text(f.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                            '${formatSize(f.size)} · ${formatTime(f.uploadedAt)}',
                            style: const TextStyle(fontSize: 12),
                          ),
                          trailing: Badge(
                            backgroundColor: f.isPublished
                                ? const Color(0xFFECFDF5)
                                : const Color(0xFFF3F4F6),
                            textColor: f.isPublished
                                ? const Color(0xFF059669)
                                : const Color(0xFF6B7280),
                          ),
                          onTap: () => context.push(
                              '/preview?key=${Uri.encodeComponent(f.key)}&title=${Uri.encodeComponent(f.title)}&type=${f.type}'),
                        ),
                      )),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TypeIcon extends StatelessWidget {
  final String type;
  const _TypeIcon({required this.type});

  @override
  Widget build(BuildContext context) {
    const (IconData, Color, Color) data = switch (type) {
      'markdown' => (Icons.description_outlined, Color(0xFFEEF2FF), Color(0xFF4F46E5)),
      'pptx' => (Icons.slideshow_outlined, Color(0xFFFFF7ED), Color(0xFFC2410C)),
      'docx' => (Icons.article_outlined, Color(0xFFEFF6FF), Color(0xFF1D4ED8)),
      'image' => (Icons.image_outlined, Color(0xFFECFDF5), Color(0xFF059669)),
      _ => (Icons.insert_drive_file_outlined, Color(0xFFF3F4F6), Color(0xFF6B7280)),
    };
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(color: data.$2, borderRadius: BorderRadius.circular(8)),
      child: Icon(data.$1, size: 18, color: data.$3),
    );
  }
}

class Badge extends StatelessWidget {
  final Color backgroundColor;
  final Color textColor;
  const Badge({super.key, required this.backgroundColor, required this.textColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: backgroundColor, borderRadius: BorderRadius.circular(6)),
      child: Text('已开放', style: TextStyle(fontSize: 11, color: textColor)),
    );
  }
}
