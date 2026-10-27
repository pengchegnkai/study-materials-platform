/// pages/teacher_page.dart —— 老师工作台：上传 + 资源管理器风格的文件管理
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:permission_handler/permission_handler.dart';
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
  String _uploadSubject = ''; // 上传目标科目 id（网页端同款：上传前先选科目）
  String _filterSubject = ''; // 文件列表筛选：科目
  String _filterState = 'all'; // 文件列表筛选：开放状态
  String _currentDir = ''; // 当前目录（文件夹导航，与网页端一致）
  bool _uploading = false;
  bool _loadingFiles = true;
  ({int current, int total, int pct, String name})? _progress;
  List<FileItem> _myFiles = [];
  List<String> _folders = [];
  List<({String id, String name})> _subjects = [];

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
      final folders = await _svc.folders(mine: true).catchError((_) => <String>[]);
      final subjects = await _svc.subjects(mine: true).catchError((_) => <Subject>[]);
      if (!mounted) return;
      setState(() {
        _myFiles = all.where((f) => f.canManage).toList();
        _folders = folders;
        _subjects = subjects.map((x) => (id: x.id, name: x.name)).toList();
        _loadingFiles = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingFiles = false);
    }
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

  /// 多选文件上传（使用上传设置卡中已选科目）
  Future<void> _pickAndUpload([String dir = '']) async {
    if (_uploadSubject.isEmpty) {
      _toast('请先在上方选择上传科目');
      return;
    }
    final subjectId = _uploadSubject;

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

  /// 申请存储权限（Android 遍历目录必需）：11+ 全文件访问，否则回退旧存储权限
  Future<bool> _ensureStoragePermission() async {
    if (!Platform.isAndroid) return true;
    if (await Permission.manageExternalStorage.isGranted) return true;
    if (await Permission.storage.isGranted) return true;
    // 11+ 先申请「所有文件访问权限」（跳系统设置页），再回退普通存储权限
    final manage = await Permission.manageExternalStorage.request();
    if (manage.isGranted) return true;
    final storage = await Permission.storage.request();
    if (storage.isGranted) return true;
    // Android 13+ 媒体权限（部分机型只给媒体权限也能读到对应目录）
    final photos = await Permission.photos.request();
    return photos.isGranted;
  }

  /// 选择整个文件夹，递归上传（目录规则：科目名/相对路径，不含所选根文件夹名本身）
  Future<void> _pickFolderAndUpload() async {
    if (_uploadSubject.isEmpty) {
      _toast('请先在上方选择上传科目');
      return;
    }
    final subjectId = _uploadSubject;
    final subjectName = _subjects.where((x) => x.id == _uploadSubject).map((x) => x.name).first ?? '';

    final dirPath = await FilePicker.platform.getDirectoryPath();
    if (dirPath == null || !mounted) return;

    // 1) 权限：没有存储权限时遍历会得到空结果，这里显式申请并给出明确提示
    final granted = await _ensureStoragePermission();
    if (!granted) {
      _toast('没有存储权限，无法读取文件夹。请在系统设置中允许本应用访问所有文件后重试');
      return;
    }

    // 2) 遍历：逐个目录容错，遇到不可读目录跳过而不是整体失败
    final root = Directory(dirPath);
    final items = <({File file, String filename, String dir})>[];
    var hadReadError = false;
    final stack = <Directory>[root];
    var visited = 0;
    while (stack.isNotEmpty && visited < 20000) {
      final dir = stack.removeLast();
      List<FileSystemEntity> entries;
      try {
        entries = dir.listSync(followLinks: false);
      } catch (_) {
        hadReadError = true;
        continue;
      }
      for (final entity in entries) {
        visited++;
        if (entity is Directory) {
          final name = entity.path.split('/').last;
          if (name.startsWith('.')) continue; // 跳过隐藏目录
          stack.add(entity);
          continue;
        }
        if (entity is! File) continue;
        final name = entity.path.split('/').last;
        if (name.startsWith('.')) continue; // 跳过隐藏文件
        final rel = entity.path.substring(root.path.length + 1); // 相对所选目录
        final segs = rel.split('/')..removeLast(); // 去掉文件名 = 相对目录段
        // 根目录下的文件（segs 为空）也归入科目名目录
        final dirPath2 = [subjectName, ...segs].where((x) => x.isNotEmpty).join('/');
        items.add((file: entity, filename: name, dir: dirPath2));
      }
    }

    if (items.isEmpty) {
      _toast(hadReadError
          ? '无法读取该文件夹（权限不足或受系统保护），请在系统设置中开启「所有文件访问权限」后重试'
          : '所选文件夹内没有文件，请确认选中的是包含文件的目录');
      return;
    }
    if (!mounted) return;
    if (hadReadError) {
      _toast('部分子目录无权限已跳过，共找到 ${items.length} 个文件');
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
    // 筛选（转成 AdminFile 与网页端文件卡字段一致）
    // 当前目录下的子文件夹（网页端文件夹胶囊行同款）
    final subFolders = _subFolders();
    final visibleFiles = _myFiles.map(_toAdminFile).where((f) {
      if (f.dir != _currentDir) return false;
      if (_filterSubject.isNotEmpty && f.subject != _filterSubject) return false;
      if (_filterState == 'published' && f.visibility != 'published') return false;
      if (_filterState == 'private' && f.visibility != 'private') return false;
      return true;
    }).toList();

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
      body: _loadingFiles
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('老师工作台',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
                const SizedBox(height: 4),
                const Text('上传资料到你的科目，并控制是否对学生开放',
                    style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                const SizedBox(height: 16),

                // ---------- 上传设置卡（网页端同款） ----------
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: _webSelect(
                                label: '上传到科目',
                                value: _uploadSubject,
                                items: [
                                  const DropdownMenuItem(value: '', child: Text('选择科目…')),
                                  ..._subjects.map((x) => DropdownMenuItem(value: x.id, child: Text(x.name))),
                                ],
                                onChanged: (v) => setState(() => _uploadSubject = v ?? ''),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _webSelect(
                                label: '可见性',
                                value: _visibility,
                                items: const [
                                  DropdownMenuItem(value: 'private', child: Text('不开放（仅自己可见）')),
                                  DropdownMenuItem(value: 'published', child: Text('开放（学生可见）')),
                                ],
                                onChanged: (v) => setState(() => _visibility = v ?? 'private'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        // 上传区（网页 UploadZone 同款：大虚线区域 + 图标 + 按钮）
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF9FAFB),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFFD1D5DB), width: 1.2),
                          ),
                          child: Column(
                            children: [
                              const Icon(Icons.cloud_upload_outlined,
                                  size: 44, color: Color(0xFF9CA3AF)),
                              const SizedBox(height: 10),
                              const Text('点击下方按钮选择要上传的资料',
                                  style: TextStyle(fontSize: 13.5, color: Color(0xFF6B7280))),
                              const SizedBox(height: 4),
                              const Text('支持 Word / PPT / Excel / PDF / 图片 / Markdown',
                                  style: TextStyle(fontSize: 11.5, color: Color(0xFF9CA3AF))),
                              const SizedBox(height: 14),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  FilledButton.icon(
                                    onPressed: _uploading ? null : () => _pickAndUpload(_currentDir),
                                    icon: _uploading
                                        ? const SizedBox(
                                            width: 15, height: 15,
                                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                        : const Icon(Icons.upload_file_outlined, size: 17),
                                    label: Text(_uploading ? '上传中…' : '上传文件'),
                                  ),
                                  const SizedBox(width: 10),
                                  OutlinedButton.icon(
                                    onPressed: _uploading ? null : _pickFolderAndUpload,
                                    icon: const Icon(Icons.folder_open_outlined, size: 17),
                                    label: const Text('上传文件夹'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (_progress != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            '上传中 ${_progress!.current}/${_progress!.total} · ${_progress!.name}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                          ),
                          const SizedBox(height: 6),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: _progress!.pct / 100,
                              minHeight: 8,
                              backgroundColor: const Color(0xFFE5E7EB),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // ---------- 我的文件（网页端同款：筛选下拉 + 卡片列表） ----------
                const Text('我的文件',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _webSelect(
                        value: _filterSubject,
                        items: [
                          const DropdownMenuItem(value: '', child: Text('全部科目')),
                          ..._subjects.map((x) => DropdownMenuItem(value: x.name, child: Text(x.name))),
                        ],
                        onChanged: (v) => setState(() => _filterSubject = v ?? ''),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _webSelect(
                        value: _filterState,
                        items: const [
                          DropdownMenuItem(value: 'all', child: Text('全部状态')),
                          DropdownMenuItem(value: 'published', child: Text('已开放')),
                          DropdownMenuItem(value: 'private', child: Text('未开放')),
                        ],
                        onChanged: (v) => setState(() => _filterState = v ?? 'all'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // 面包屑 + 新建文件夹（网页端同款）
                Row(
                  children: [
                    Flexible(
                      child: Row(
                        children: [
                          InkWell(
                            onTap: () => setState(() => _currentDir = ''),
                            child: Text('全部文件',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: _currentDir.isEmpty ? FontWeight.w600 : FontWeight.w400,
                                    color: _currentDir.isEmpty ? const Color(0xFF111827) : const Color(0xFF6B7280))),
                          ),
                          for (var i = 0; i < _currentDir.split('/').where((x) => x.isNotEmpty).toList().length; i++) ...[
                            const Icon(Icons.chevron_right, size: 14, color: Color(0xFF9CA3AF)),
                            Builder(builder: (ctx) {
                              final segs = _currentDir.split('/').where((x) => x.isNotEmpty).toList();
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
                    IconButton(
                      icon: const Icon(Icons.create_new_folder_outlined, size: 20),
                      tooltip: '新建文件夹',
                      onPressed: _createFolderDialog,
                    ),
                  ],
                ),
                if (subFolders.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 4),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final name in subFolders)
                          GestureDetector(
                            onLongPress: () => _folderActions(_currentDir.isEmpty ? name : '$_currentDir/$name'),
                            child: InkWell(
                              onTap: () => setState(() => _currentDir = _currentDir.isEmpty ? name : '$_currentDir/$name'),
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
                                    const Icon(Icons.folder_outlined, size: 16, color: Color(0xFF4F46E5)),
                                    const SizedBox(width: 6),
                                    Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                                    const SizedBox(width: 6),
                                    const Icon(Icons.chevron_right, size: 14, color: Color(0xFFC4C8D0)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                if (visibleFiles.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 48),
                    child: Center(
                        child: Text('暂无文件，先上传一份吧',
                            style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)))),
                  )
                else
                  ...visibleFiles.map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _MyFileCard(
                          file: f,
                          onToggle: () => _toggleVisibility(f),
                          onEdit: () => _editTitleDialog(f),
                          onDelete: () => _delete(f),
                        ),
                      )),
              ],
            ),
    );
  }

  /// 网页 Select 同款下拉框（带标签 + 圆角边框）
  Widget _webSelect({
    String? label,
    required String value,
    required List<DropdownMenuItem<String>> items,
    required ValueChanged<String?> onChanged,
  }) {
    final field = DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      decoration: InputDecoration(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF4F46E5), width: 1.5)),
      ),
      items: items,
      onChanged: onChanged,
    );
    if (label == null) return field;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Color(0xFF374151))),
        const SizedBox(height: 6),
        field,
      ],
    );
  }

  /// 编辑文件标题
  Future<void> _editTitleDialog(AdminFile f) async {
    final ctrl = TextEditingController(text: f.title);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('重命名'),
        content: TextField(controller: ctrl, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('保存')),
        ],
      ),
    );
    if (ok != true) return;
    final t = ctrl.text.trim();
    if (t.isEmpty || t == f.title) return;
    await _rename(f, t);
  }

  /// 当前目录下的直接子文件夹
  List<String> _subFolders() {
    final out = <String>{};
    for (final p in _folders) {
      if (_currentDir.isEmpty) {
        if (p.isNotEmpty) out.add(p.contains('/') ? p.split('/').first : p);
      } else if (p.startsWith('$_currentDir/')) {
        final rest = p.substring(_currentDir.length + 1);
        if (rest.isNotEmpty) out.add(rest.contains('/') ? rest.split('/').first : rest);
      }
    }
    return out.toList()..sort();
  }

  /// 新建文件夹（建在当前目录下）
  Future<void> _createFolderDialog() async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建文件夹'),
        content: TextField(controller: ctrl, autofocus: true, decoration: const InputDecoration(hintText: '文件夹名称')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('创建')),
        ],
      ),
    );
    if (ok != true) return;
    final name = ctrl.text.trim();
    if (name.isEmpty) return;
    final path = _currentDir.isEmpty ? name : '$_currentDir/$name';
    try {
      await _svc.createFolder(path: path);
      _loadFiles();
    } catch (e) {
      _toast('创建失败：$e'.replaceFirst('Exception: ', ''));
    }
  }

  /// 文件夹长按菜单（网页端同款弹层）：删除（文件移到上级）
  Future<void> _folderActions(String path) async {
    final v = await showWebMenuSheet(
      context,
      '文件夹：${path.split('/').last}',
      const [
        WebMenuAction(Icons.folder_delete_outlined, '删除文件夹（文件移到上级）', 'delete', danger: true),
      ],
    );
    if (v != 'delete' || !mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除文件夹'),
        content: Text('确定删除「${path.split('/').last}」？其中所有文件将移到上级目录，不会丢失。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _svc.deleteFolder(path);
      _loadFiles();
    } catch (e) {
      _toast('删除失败：$e'.replaceFirst('Exception: ', ''));
    }
  }
}

/// 我的文件卡：网页端 md:hidden 卡片同款（标题+徽标 / meta / 开关+编辑+删除）
class _MyFileCard extends StatelessWidget {
  final AdminFile file;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _MyFileCard({required this.file, required this.onToggle, required this.onEdit, required this.onDelete});

  String _fmtSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
    return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(1)} GB';
  }

  String _fmtTime(int ts) {
    final dt = DateTime.fromMillisecondsSinceEpoch(ts);
    String two(int v) => v.toString().padLeft(2, '0');
    return '${dt.year}-${two(dt.month)}-${two(dt.day)} ${two(dt.hour)}:${two(dt.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final published = file.visibility == 'published';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(file.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: published ? const Color(0xFFECFDF5) : const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: published ? const Color(0xFFA7F3D0) : const Color(0xFFE5E7EB),
                        width: 0.8),
                  ),
                  child: Text(published ? '已开放' : '未开放',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: published ? const Color(0xFF059669) : const Color(0xFF6B7280))),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text('${file.subject} · ${_fmtSize(file.size)} · ${_fmtTime(file.uploadedAt)}',
                style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
            const SizedBox(height: 10),
            Row(
              children: [
                SizedBox(
                  height: 28,
                  child: Switch(
                    value: published,
                    onChanged: (_) => onToggle(),
                    activeThumbColor: Colors.white,
                    activeColor: const Color(0xFF059669),
                  ),
                ),
                Text(published ? '学生可见' : '学生不可见',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                const Spacer(),
                TextButton(onPressed: onEdit, child: const Text('编辑')),
                TextButton(
                  onPressed: onDelete,
                  style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
                  child: const Text('删除'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
