/// pages/teacher_page.dart —— 老师工作台：科目选择 + 拖选文件上传 + 我的文件管理
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../providers/files_provider.dart';
import '../services/platform_service.dart';
import '../utils/format.dart';

class TeacherPage extends ConsumerStatefulWidget {
  const TeacherPage({super.key});

  @override
  ConsumerState<TeacherPage> createState() => _TeacherPageState();
}

class _TeacherPageState extends ConsumerState<TeacherPage> {
  final _svc = PlatformService();
  final _titleCtrl = TextEditingController();

  String _visibility = 'private';
  String _title = '';
  bool _uploading = false;
  bool _loadingFiles = true;
  List<FileItem> _myFiles = [];

  @override
  void initState() {
    super.initState();
    _loadFiles();
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

    // 选科目
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

    // 选文件
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
        subjectId: subjectId,
        visibility: _visibility,
      );
      if (r.ok) ok++; else { fail++; firstError ??= r.error; }
    }
    if (!mounted) return;
    setState(() => _uploading = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(fail == 0 ? '已上传 $ok 个文件' : '成功 $ok 个，失败 $fail 个：$firstError'),
      backgroundColor: fail == 0 ? const Color(0xFF059669) : Colors.red,
    ));
    _loadFiles();
  }

  Future<void> _toggleVisibility(FileItem f) async {
    final next = f.isPublished ? 'private' : 'published';
    try {
      await _svc.updateFile(key: f.key, visibility: next);
      _loadFiles();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('操作失败：$e'.replaceFirst('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
  }

  Future<void> _editTitle(FileItem f) async {
    _titleCtrl.text = f.title;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('编辑标题'),
        content: TextField(controller: _titleCtrl, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('保存')),
        ],
      ),
    );
    if (ok == true && mounted) {
      try {
        await _svc.updateFile(key: f.key, title: _titleCtrl.text.trim());
        _loadFiles();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('保存失败：$e'.replaceFirst('Exception: ', '')), backgroundColor: Colors.red));
        }
      }
    }
  }

  Future<void> _delete(FileItem f) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除文件'),
        content: Text('确定删除「${f.title}」？此操作不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      try {
        await _svc.deleteFile(f.key);
        _loadFiles();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('删除失败：$e'.replaceFirst('Exception: ', '')), backgroundColor: Colors.red));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value?.user;

    return Scaffold(
      appBar: AppBar(title: const Text('老师工作台')),
      body: RefreshIndicator(
        onRefresh: _loadFiles,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 上传设置卡片
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text('上传设置', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
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
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _visibility == 'published' ? '上传后学生即可查看' : '上传后仅自己可见',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _uploading ? null : _pickAndUpload,
                        icon: _uploading
                            ? const SizedBox(
                                width: 16, height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.upload_file_outlined, size: 18),
                        label: Text(_uploading ? '上传中…' : '选择文件上传'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('我的文件 · ${_myFiles.length}',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            if (_loadingFiles)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_myFiles.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: Text('还没有文件', style: TextStyle(color: Color(0xFF6B7280)))),
              )
            else
              ..._myFiles.map((f) => Card(
                    child: ListTile(
                      leading: Icon(
                        f.isPublished ? Icons.visibility : Icons.visibility_off,
                        color: f.isPublished ? const Color(0xFF059669) : const Color(0xFF9CA3AF),
                      ),
                      title: Text(f.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        '${f.subject ?? '—'} · ${formatSize(f.size)} · ${f.isPublished ? "已开放" : "未开放"}',
                        style: const TextStyle(fontSize: 12),
                      ),
                      trailing: PopupMenuButton<String>(
                        onSelected: (v) {
                          if (v == 'title') _editTitle(f);
                          if (v == 'visibility') _toggleVisibility(f);
                          if (v == 'delete') _delete(f);
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(value: 'title', child: Text('编辑标题')),
                          PopupMenuItem(
                              value: 'visibility',
                              child: Text(f.isPublished ? '取消开放' : '对学生开放')),
                          const PopupMenuItem(value: 'delete', child: Text('删除')),
                        ],
                      ),
                    ),
                  )),
            if (user?.isAdmin == true)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text('提示：用户与科目管理请使用网页端后台',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
              ),
          ],
        ),
      ),
    );
  }
}
