/// pages/teacher_page.dart —— 老师工作台：上传 + 资源管理器风格的文件管理
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
  ({int current, int total, int pct, String name})? _progress;
  List<FileItem> _myFiles = [];
  List<String> _folders = [];

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
      final folders = await _svc.folders().catchError((_) => <String>[]);
      if (!mounted) return;
      setState(() {
        _myFiles = all.where((f) => f.canManage).toList();
        _folders = folders;
        _loadingFiles = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingFiles = false);
    }
  }

  Future<List<Subject>?> _pickSubject() async {
    final subjects = await _svc.subjects();
    if (!mounted) return null;
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
    if (subjectId == null) return null;
    return subjects.where((s) => s.id == subjectId).toList();
  }

  /// 上传一批文件，dir 为服务器虚拟目录；带逐文件与单文件进度
  Future<void> _uploadFiles(
    List<({File file, String filename, String dir})> items,
    String subjectId,
  ) async {
    setState(() => _uploading = true);
    var ok = 0, fail = 0;
    String? firstError;
    for (var i = 0; i < items.length; i++) {
      final item = items[i];
      var filePct = 0;
      setState(() => _progress = (current: i + 1, total: items.length, pct: 0, name: item.filename));
      final r = await _svc.upload(
        file: item.file,
        filename: item.filename,
        subjectId: subjectId,
        visibility: _visibility,
        dir: item.dir,
        onProgress: (sent, total) {
          final pct = total > 0 ? (sent * 100 ~/ total) : 0;
          if (pct != filePct && mounted) {
            filePct = pct;
            setState(() => _progress = (current: i + 1, total: items.length, pct: pct, name: item.filename));
          }
        },
      );
      if (r.ok) {
        ok++;
      } else {
        fail++;
        firstError ??= r.error;
      }
    }
    if (!mounted) return;
    setState(() {
      _uploading = false;
      _progress = null;
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(fail == 0 ? '已上传 $ok 个文件' : '成功 $ok 个，失败 $fail 个：$firstError'),
      backgroundColor: fail == 0 ? const Color(0xFF059669) : Colors.red,
    ));
    _loadFiles();
  }

  /// 多选文件上传
  Future<void> _pickAndUpload([String dir = '']) async {
    final subjects = await _pickSubject();
    if (subjects == null || subjects.isEmpty || !mounted) return;
    final subjectId = subjects.first.id;

    final result = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (result == null || result.files.isEmpty || !mounted) return;

    final items = <({File file, String filename, String dir})>[];
    for (final pf in result.files) {
      final path = pf.path;
      if (path == null) continue;
      items.add((file: File(path), filename: pf.name, dir: dir));
    }
    if (items.isEmpty) return;
    await _uploadFiles(items, subjectId);
  }

  /// 选择整个文件夹，递归上传（保留目录结构，根文件夹名作为顶层目录）
  Future<void> _pickFolderAndUpload() async {
    final subjects = await _pickSubject();
    if (subjects == null || subjects.isEmpty || !mounted) return;
    final subjectId = subjects.first.id;

    final dirPath = await FilePicker.platform.getDirectoryPath();
    if (dirPath == null || !mounted) return;

    final root = Directory(dirPath);
    final rootName = dirPath.split('/').where((s) => s.isNotEmpty).last;
    final items = <({File file, String filename, String dir})>[];
    await for (final entity in root.list(recursive: true, followLinks: false)) {
      if (entity is! File) continue;
      if (entity.path.split('/').last.startsWith('.')) continue; // 跳过隐藏文件
      final rel = entity.path.substring(root.path.length + 1); // 相对所选目录
      items.add((file: entity, filename: entity.path.split('/').last, dir: '$rootName/${rel.split('/').take(rel.split('/').length - 1).join('/')}'));
    }
    if (items.isEmpty) {
      _toast('所选文件夹内没有文件');
      return;
    }
    await _uploadFiles(items, subjectId);
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
        dir: f.dir,
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('老师工作台'),
        actions: [
          IconButton(
            icon: const Icon(Icons.home_outlined),
            tooltip: '浏览资料',
            onPressed: () => context.go('/'),
          ),
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
                      label: Text(_uploading ? '上传中…' : '上传文件'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: _uploading ? null : _pickFolderAndUpload,
                      icon: const Icon(Icons.folder_open_outlined, size: 18),
                      label: const Text('上传文件夹'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_progress != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '上传中 ${_progress!.current}/${_progress!.total} · ${_progress!.name}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text('${_progress!.pct}%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: _progress!.pct / 100,
                          minHeight: 6,
                          backgroundColor: const Color(0xFFE5E7EB),
                        ),
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
                    folders: _folders,
                    onDelete: _delete,
                    onToggleVisibility: _toggleVisibility,
                    onRename: _rename,
                    onCreateFolder: (path) async {
                      try {
                        await _svc.createFolder(path: path);
                        _loadFiles();
                      } catch (e) {
                        _toast('创建失败：$e'.replaceFirst('Exception: ', ''));
                      }
                    },
                    onUpload: (dir) => _pickAndUpload(dir),
                    canManage: true,
                  ),
          ),
        ],
      ),
    );
  }
}
