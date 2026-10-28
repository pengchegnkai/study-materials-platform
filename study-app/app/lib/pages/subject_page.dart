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
  String _subjectId = '';
  List<String> _folders = [];
  String? _currentDir; // null = 显示全部文件；非空 = 指定目录

  @override
  void initState() {
    super.initState();
    _loadSubjectName();
  }

  Future<void> _loadSubjectName() async {
    var subjectId = '';
    try {
      final subs = await _svc.subjects();
      for (final s in subs) {
        if (s.slug == widget.slug) {
          if (mounted) setState(() => _subjectName = s.name);
          subjectId = s.id;
          break;
        }
      }
    } catch (_) {}
    // 文件夹目录独立加载（学生仅返回已开放文件所在目录），失败不影响文件列表
    if (subjectId.isNotEmpty) {
      try {
        final folders = await _svc.folders(subjectId: subjectId);
        if (mounted) setState(() => _folders = folders);
      } catch (_) {}
    }
  }

  /// 当前目录下的直接子文件夹
  List<String> _subFolders() {
    final out = <String>{};
    for (final p in _folders) {
      if (_currentDir == null) {
        if (p.isNotEmpty) out.add(p.contains('/') ? p.split('/').first : p);
      } else {
        final dir = _currentDir;
        if (dir != null && p.startsWith('$dir/')) {
          final rest = p.substring(dir.length + 1);
          if (rest.isNotEmpty) out.add(rest.contains('/') ? rest.split('/').first : rest);
        }
      }
    }
    return out.toList()..sort();
  }

  /// 面包屑段（科目 › 子目录…）
  List<String> _crumbSegs() =>
      (_currentDir ?? '').split('/').where((x) => x.isNotEmpty).toList();

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
          // 只显示当前目录内的文件（文件夹胶囊导航）
          final filtered = {
            for (final e in grouped.entries)
              e.key: e.value.where((f) => _currentDir == null || f.dir == _currentDir).toList(),
          }..removeWhere((_, list) => list.isEmpty);
          // subjectFilesProvider 已按上传者分组：Map<老师, List<FileItem>>
          final groups = filtered.entries.toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              // 面包屑：首页 › 科目名 › 子目录…
              Row(
                children: [
                  Flexible(
                    child: Row(
                      children: [
                        InkWell(
                          onTap: () => context.go('/'),
                          child: const Text('首页',
                              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                        ),
                        const Icon(Icons.chevron_right, size: 14, color: Color(0xFF9CA3AF)),
                        InkWell(
                          onTap: () => setState(() => _currentDir = null),
                          child: Text(_subjectName.isEmpty ? '…' : _subjectName,
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: _currentDir == null ? FontWeight.w600 : FontWeight.w400,
                                  color: _currentDir == null ? const Color(0xFF111827) : const Color(0xFF6B7280))),
                        ),
                        for (var i = 0; i < _crumbSegs().length; i++) ...[
                          const Icon(Icons.chevron_right, size: 14, color: Color(0xFF9CA3AF)),
                          Builder(builder: (ctx) {
                            final segs = _crumbSegs();
                            final path = segs.take(i + 1).join('/');
                            final last = i == segs.length - 1;
                            return InkWell(
                              onTap: () => setState(() => _currentDir = path),
                              child: Text(segs[i],
                                  style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: last ? FontWeight.w600 : FontWeight.w400,
                                      color: last ? const Color(0xFF111827) : const Color(0xFF6B7280))),
                            );
                          }),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              // 文件夹胶囊行（学生可进入子目录）
              if (_subFolders().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 10, bottom: 4),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final name in _subFolders())
                        InkWell(
                          onTap: () => setState(() =>
                              _currentDir = _currentDir == null ? name : '$_currentDir/$name'),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            height: 36,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.folder_outlined,
                                    size: 16, color: Color(0xFF4F46E5)),
                                const SizedBox(width: 6),
                                Text(name,
                                    style: const TextStyle(
                                        fontSize: 13, fontWeight: FontWeight.w500)),
                                const SizedBox(width: 6),
                                const Icon(Icons.chevron_right,
                                    size: 14, color: Color(0xFFC4C8D0)),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              if (groups.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 64),
                  child: Column(children: [
                    const Icon(Icons.folder_off_outlined, size: 56, color: Color(0xFFD1D5DB)),
                    const SizedBox(height: 12),
                    Text(_currentDir == null ? '暂无开放文件' : '此文件夹暂无文件',
                        style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280))),
                    const SizedBox(height: 4),
                    Text(
                        _currentDir == null
                            ? '老师还没有开放该科目的资料'
                            : '换一个文件夹看看，或点击上方科目名返回全部',
                        style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
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
