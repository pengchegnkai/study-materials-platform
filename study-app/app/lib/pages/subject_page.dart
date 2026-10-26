/// pages/subject_page.dart —— 科目资料列表：克隆网页端 /subject 页
/// （面包屑 首页›科目 + 按老师分组标题 + 文件卡网格：类型图标块/徽标/类型胶囊）
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/models.dart';
import '../providers/files_provider.dart';
import '../services/platform_service.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';

class SubjectPage extends ConsumerStatefulWidget {
  final String slug;
  const SubjectPage({super.key, required this.slug});

  @override
  ConsumerState<SubjectPage> createState() => _SubjectPageState();
}

class _SubjectPageState extends ConsumerState<SubjectPage> {
  final _svc = PlatformService();
  String _subjectName = '';

  @override
  void initState() {
    super.initState();
    _loadSubjectName();
  }

  Future<void> _loadSubjectName() async {
    try {
      final subs = await _svc.subjects();
      for (final s in subs) {
        if (s.slug == widget.slug) {
          if (mounted) setState(() => _subjectName = s.name);
          return;
        }
      }
    } catch (_) {}
  }

  String _previewType(FileItem f) {
    final type = f.type.toLowerCase();
    final ext = f.key.split('.').last.toLowerCase();
    if (type == 'markdown' || type.contains('markdown') || ['md', 'markdown'].contains(ext)) return 'markdown';
    if (type == 'image' || type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].contains(ext)) return 'image';
    if (type == 'pptx' || type.contains('presentation') || ['ppt', 'pptx'].contains(ext)) return 'pptx';
    if (type == 'docx' || type.contains('word') || ['doc', 'docx'].contains(ext)) return 'docx';
    if (type.contains('pdf') || ext == 'pdf') return 'pdf';
    return 'other';
  }

  void _openPreview(FileItem f) {
    context.push(
      '/preview?key=${Uri.encodeComponent(f.key)}'
      '&title=${Uri.encodeComponent(f.title)}'
      '&type=${Uri.encodeComponent(_previewType(f))}',
    );
  }

  Future<void> _download(FileItem f) async {
    try {
      final resp = await _svc.fileBytes(f.key);
      final data = resp.data;
      if (data == null || data.isEmpty) throw Exception('文件为空');
      Directory? target;
      try {
        final ext = await getExternalStorageDirectory();
        if (ext != null) {
          target = Directory('${ext.path}/Download');
          await target.create(recursive: true);
        }
      } catch (_) {}
      target ??= await getApplicationDocumentsDirectory();
      final file = File('${target.path}/${f.title}');
      await file.writeAsBytes(data, flush: true);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('已保存：${file.path}')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('下载失败：$e'.replaceFirst('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final grouped = ref.watch(subjectFilesProvider(widget.slug));

    return Scaffold(
      appBar: AppBar(
        title: Text(_subjectName.isEmpty ? '资料列表' : _subjectName),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '刷新',
            onPressed: () => ref.invalidate(subjectFilesProvider(widget.slug)),
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
              onPressed: () => ref.invalidate(subjectFilesProvider(widget.slug)),
              child: const Text('重试'),
            ),
          ]),
        ),
        data: (grouped) {
          // subjectFilesProvider 已按上传者分组：Map<老师, List<FileItem>>
          final groups = grouped.entries.toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              // 面包屑：首页 › 科目名
              Row(
                children: [
                  InkWell(
                    onTap: () => context.go('/'),
                    child: const Text('首页',
                        style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  ),
                  const Icon(Icons.chevron_right, size: 14, color: Color(0xFF9CA3AF)),
                  Text(_subjectName.isEmpty ? '…' : _subjectName,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF111827))),
                ],
              ),
              const SizedBox(height: 16),
              if (groups.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 64),
                  child: Column(children: [
                    Icon(Icons.folder_off_outlined, size: 56, color: Color(0xFFD1D5DB)),
                    SizedBox(height: 12),
                    Text('暂无开放文件',
                        style: TextStyle(fontSize: 14, color: Color(0xFF6B7280))),
                    SizedBox(height: 4),
                    Text('老师还没有开放该科目的资料',
                        style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                  ]),
                )
              else
                for (final g in groups) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 12),
                    child: Text.rich(TextSpan(children: [
                      TextSpan(
                          text: g.key,
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w600)),
                      TextSpan(
                          text: ' · ${g.value.length} 个文件',
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w400, color: Color(0xFF6B7280))),
                    ])),
                  ),
                  ...g.value.map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _FileCard(file: f, onTap: () => _openPreview(f), onDownload: () => _download(f)),
                      )),
                ],
            ],
          );
        },
      ),
    );
  }
}

/// 类型胶囊（网页端文件卡底部类型标签同款配色）
class _TypePill extends StatelessWidget {
  final FileItem file;
  const _TypePill(this.file);

  @override
  Widget build(BuildContext context) {
    final type = (file.type).toLowerCase();
    final ext = file.key.split('.').last.toLowerCase();
    String label;
    Color bg, fg;
    if (type == 'pdf' || ext == 'pdf') {
      label = 'PDF'; bg = const Color(0xFFFEF2F2); fg = const Color(0xFFDC2626);
    } else if (type == 'docx' || type.contains('word') || ['doc', 'docx'].contains(ext)) {
      label = 'WORD'; bg = const Color(0xFFEFF6FF); fg = const Color(0xFF2563EB);
    } else if (type == 'pptx' || type.contains('presentation') || ['ppt', 'pptx'].contains(ext)) {
      label = 'PPT'; bg = const Color(0xFFFFF7ED); fg = const Color(0xFFEA580C);
    } else if (type == 'image' || type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].contains(ext)) {
      label = '图片'; bg = const Color(0xFFFAF5FF); fg = const Color(0xFF9333EA);
    } else if (type == 'markdown' || type.contains('markdown') || ['md', 'markdown'].contains(ext)) {
      label = 'MD'; bg = const Color(0xFFEEF2FF); fg = const Color(0xFF4F46E5);
    } else if (type.contains('sheet') || ['xlsx', 'xls', 'csv'].contains(ext)) {
      label = 'EXCEL'; bg = const Color(0xFFECFDF5); fg = const Color(0xFF059669);
    } else {
      label = '文件'; bg = const Color(0xFFF3F4F6); fg = const Color(0xFF6B7280);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label,
          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: fg, letterSpacing: 0.3)),
    );
  }
}

/// 文件卡：网页端 FileCard 同款（类型图标块 + 标题/meta + 徽标 + 底部类型标签与下载）
class _FileCard extends StatelessWidget {
  final FileItem file;
  final VoidCallback onTap;
  final VoidCallback onDownload;
  const _FileCard({required this.file, required this.onTap, required this.onDownload});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _TypeIcon(file: file),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(file.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                        const SizedBox(height: 4),
                        Text(
                            '${file.uploader} · ${_fmtSize(file.size)} · ${_fmtTime(file.uploadedAt)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFA7F3D0), width: 0.8),
                    ),
                    child: const Text('已开放',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF059669))),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _TypePill(file),
                  const Spacer(),
                  InkWell(
                    onTap: onDownload,
                    borderRadius: BorderRadius.circular(20),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      child: Row(children: [
                        Icon(Icons.download_outlined, size: 14, color: Color(0xFF4F46E5)),
                        SizedBox(width: 4),
                        Text('下载',
                            style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w500,
                                color: Color(0xFF4F46E5))),
                      ]),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 类型图标块（网页端 TypeIcon 同款：不同类型专属彩色底）
class _TypeIcon extends StatelessWidget {
  final FileItem file;
  const _TypeIcon({required this.file});

  @override
  Widget build(BuildContext context) {
    final type = (file.type).toLowerCase();
    final ext = file.key.split('.').last.toLowerCase();
    IconData icon;
    Color bg, fg;
    if (type == 'image' || type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].contains(ext)) {
      icon = Icons.image_outlined; bg = const Color(0xFFF0FDFA); fg = const Color(0xFF0D9488);
    } else if (type == 'pptx' || type.contains('presentation') || ['ppt', 'pptx'].contains(ext)) {
      icon = Icons.slideshow_outlined; bg = const Color(0xFFFFF7ED); fg = const Color(0xFFEA580C);
    } else if (type == 'docx' || type.contains('word') || ['doc', 'docx'].contains(ext)) {
      icon = Icons.article_outlined; bg = const Color(0xFFEFF6FF); fg = const Color(0xFF2563EB);
    } else if (type == 'markdown' || type.contains('markdown') || ['md', 'markdown'].contains(ext)) {
      icon = Icons.description_outlined; bg = const Color(0xFFEEF2FF); fg = const Color(0xFF4F46E5);
    } else if (type.contains('pdf') || ext == 'pdf') {
      icon = Icons.picture_as_pdf_outlined; bg = const Color(0xFFFEF2F2); fg = const Color(0xFFDC2626);
    } else if (type.startsWith('video/')) {
      icon = Icons.videocam_outlined; bg = const Color(0xFFECFDF5); fg = const Color(0xFF059669);
    } else if (type.startsWith('audio/')) {
      icon = Icons.audiotrack_outlined; bg = const Color(0xFFFDF2F8); fg = const Color(0xFFDB2777);
    } else {
      icon = Icons.insert_drive_file_outlined; bg = const Color(0xFFF3F4F6); fg = const Color(0xFF6B7280);
    }
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
      child: Icon(icon, size: 18, color: fg),
    );
  }
}

String _fmtSize(int? bytes) {
  final b = bytes ?? 0;
  if (b < 1024) return '$b B';
  if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
  if (b < 1024 * 1024 * 1024) return '${(b / 1024 / 1024).toStringAsFixed(1)} MB';
  return '${(b / 1024 / 1024 / 1024).toStringAsFixed(1)} GB';
}

String _fmtTime(int ts) {
  final dt = DateTime.fromMillisecondsSinceEpoch(ts);
  String two(int v) => v.toString().padLeft(2, '0');
  return '${dt.year}-${two(dt.month)}-${two(dt.day)} ${two(dt.hour)}:${two(dt.minute)}';
}
