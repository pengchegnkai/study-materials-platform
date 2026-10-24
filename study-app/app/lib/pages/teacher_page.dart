/// pages/teacher_page.dart —— 老师工作台：上传 + 资源管理器风格的文件管理
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/platform_service.dart';
import '../components/file_manager.dart';

class TeacherPage extends ConsumerStatefulWidget {
  const TeacherPage({super.key});

  @override
  ConsumerState<TeacherPage> createState() => _TeacherPageState();
}

class _TeacherPageState extends ConsumerState<TeacherPage> {
  final _svc = PlatformService();
  final _titleCtrl = TextEditingController();

  String _visibility = 'private';
  bool _uploading = false;
  bool _loadingFiles = true;
  List<FileItem> _myFiles = [];

  @override
  void initState() {
    super.initState();
    _loadFiles();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadFiles() async {
    setState(() => _loadingFiles = true);
    try {
      final all = await _svc.manifest();
      if (!mounted) return;
      setState(() {
        _myFiles = all.where((f) => f.canManage).toList();
        _loadingFiles = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingFiles = false);
    }
  }

  Future<void> _pickAndUpload() async {
    final subjects = await _svc.subjects();
    if (!mounted) return;

    String? subjectId;
    await showDialog(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('上传到哪个科目？'),
        children: subjects
            .map((s) => SimpleDialogOption(
                  onPressed: () {
                    subjectId = s.id;
                    Navigator.pop(ctx);
                  },
                  child: Text(s.name),
                ))
            .toList(),
      ),
    );
    if (subjectId == null || !mounted) return;

    final result = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (result == null || result.files.isEmpty || !mounted) return;

    setState(() => _uploading = true);
    var ok = 0, fail = 0;
    String? firstError;
    for (final pf in result.files) {
      final path = pf.path;
      if (path == null) continue;
      final r = await _svc.upload(
        file: File(path),
        filename: pf.name,
        subjectId: subjectId!,
        visibility: _visibility,
      );
      if (r.ok) {
        ok++;
      } else {
        fail++;
        firstError ??= r.error;
      }
    }
    if (!mounted) return;
    setState(() => _uploading = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(fail == 0 ? '已上传 $ok 个文件' : '成功 $ok 个，失败 $fail 个：$firstError'),
      backgroundColor: fail == 0 ? const Color(0xFF059669) : Colors.red,
    ));
    _loadFiles();
  }

  Future<void> _toggleVisibility(AdminFile f) async {
    final next = f.visibility == 'published' ? 'private' : 'published';
    try {
      await _svc.updateFile(key: f.key, visibility: next);
      _loadFiles();
    } catch (e) {
      _toast('操作失败：$e'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _rename(AdminFile f, String newTitle) async {
    try {
      await _svc.updateFile(key: f.key, title: newTitle);
      _loadFiles();
    } catch (e) {
      _toast('保存失败：$e'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _delete(AdminFile f) async {
    try {
      await _svc.deleteFile(f.key);
      _loadFiles();
    } catch (e) {
      _toast('删除失败：$e'.replaceFirst('Exception: ', ''));
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.red));
  }

  AdminFile _toAdminFile(FileItem f) => AdminFile(
        key: f.key,
        title: f.title,
        size: f.size ?? 0,
        visibility: f.visibility,
        uploadedAt: f.uploadedAt,
        uploaderUsername: f.uploader,
        contentType: f.type,
        subject: f.subject ?? '',
        subjectSlug: f.subjectSlug ?? '',
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('老师工作台'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '刷新',
            onPressed: _loadFiles,
          ),
        ],
      ),
      body: Column(
        children: [
          // 上传设置卡片
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('上传设置', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                          SizedBox(height: 4),
                          Text('上传后按可见性决定学生是否可查看',
                              style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                        ],
                      ),
                    ),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'private', label: Text('不开放')),
                        ButtonSegment(value: 'published', label: Text('开放')),
                      ],
                      selected: {_visibility},
                      onSelectionChanged: (s) => setState(() => _visibility = s.first),
                      style: const ButtonStyle(
                        visualDensity: VisualDensity.compact,
                        textStyle: WidgetStatePropertyAll(TextStyle(fontSize: 12)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    FilledButton.icon(
                      onPressed: _uploading ? null : _pickAndUpload,
                      icon: _uploading
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.upload_file_outlined, size: 18),
                      label: Text(_uploading ? '上传中…' : '上传'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // 资源管理器风格的文件列表
          Expanded(
            child: _loadingFiles
                ? const Center(child: CircularProgressIndicator())
                : FileManager(
                    files: _myFiles.map(_toAdminFile).toList(),
                    onDelete: _delete,
                    onToggleVisibility: _toggleVisibility,
                    onRename: _rename,
                    canManage: true,
                  ),
          ),
        ],
      ),
    );
  }
}
