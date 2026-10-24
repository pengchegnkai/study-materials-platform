/// components/file_manager.dart —— 资源管理器风格文件管理组件
/// 支持：列表/网格视图、多选、排序、右键菜单、重命名、删除、可见性切换
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';

typedef FileActionCallback = Future<void> Function(AdminFile);
typedef RenameCallback = Future<void> Function(AdminFile, String);

class FileManager extends ConsumerStatefulWidget {
  final List<AdminFile> files;
  final FileActionCallback onDelete;
  final FileActionCallback onToggleVisibility;
  final RenameCallback onRename;
  final bool canManage;

  const FileManager({
    super.key,
    required this.files,
    required this.onDelete,
    required this.onToggleVisibility,
    required this.onRename,
    this.canManage = true,
  });

  @override
  ConsumerState<FileManager> createState() => _FileManagerState();
}

class _FileManagerState extends ConsumerState<FileManager> {
  final Set<String> _selectedKeys = {};
  String _currentPath = '/';
  String _viewMode = 'list'; // 'list' | 'grid'
  String _sortBy = 'name'; // 'name' | 'size' | 'date'
  bool _sortAsc = true;
  OverlayEntry? _contextMenu;
  AdminFile? _contextFile;
  Offset? _menuPosition;

  List<AdminFile> get _sortedFiles {
    final list = List<AdminFile>.from(widget.files);
    list.sort((a, b) {
      int cmp;
      switch (_sortBy) {
        case 'size':
          cmp = a.size.compareTo(b.size);
          break;
        case 'date':
          cmp = a.uploadedAt.compareTo(b.uploadedAt);
          break;
        default:
          cmp = a.title.compareTo(b.title);
      }
      return _sortAsc ? cmp : -cmp;
    });
    return list;
  }

  void _toggleSelection(String key) {
    setState(() {
      if (_selectedKeys.contains(key)) {
        _selectedKeys.remove(key);
      } else {
        _selectedKeys.add(key);
      }
    });
  }

  void _selectAll() {
    setState(() {
      if (_selectedKeys.length == _sortedFiles.length) {
        _selectedKeys.clear();
      } else {
        _selectedKeys.addAll(_sortedFiles.map((f) => f.key));
      }
    });
  }

  void _showContextMenu(BuildContext context, AdminFile file, Offset position) {
    _removeContextMenu();
    _contextFile = file;
    _menuPosition = position;

    _contextMenu = OverlayEntry(
      builder: (context) => Positioned(
        left: position.dx,
        top: position.dy,
        child: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(8),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 180),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ContextMenuItem(
                  icon: Icons.edit_outlined,
                  label: '重命名',
                  onTap: () => _renameFile(file),
                ),
                _ContextMenuItem(
                  icon: file.visibility == 'published' ? Icons.visibility_off : Icons.visibility,
                  label: file.visibility == 'published' ? '取消开放' : '对学生开放',
                  onTap: () => _toggleVisibility(file),
                ),
                if (widget.canManage)
                  _ContextMenuItem(
                    icon: Icons.delete_outline,
                    label: '删除',
                    isDestructive: true,
                    onTap: () => _deleteFile(file),
                  ),
                _ContextMenuItem(
                  icon: Icons.info_outline,
                  label: '属性',
                  onTap: () => _showProperties(file),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    Overlay.of(context).insert(_contextMenu!);
  }

  void _removeContextMenu() {
    _contextMenu?.remove();
    _contextMenu = null;
    _contextFile = null;
    _menuPosition = null;
  }

  Future<void> _renameFile(AdminFile file) async {
    _removeContextMenu();
    final controller = TextEditingController(text: file.title);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('重命名'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: '新文件名'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('确定')),
        ],
      ),
    );
    if (confirmed == true && controller.text.trim().isNotEmpty && controller.text.trim() != file.title) {
      await widget.onRename(file, controller.text.trim());
    }
  }

  Future<void> _toggleVisibility(AdminFile file) async {
    _removeContextMenu();
    await widget.onToggleVisibility(file);
  }

  Future<void> _deleteFile(AdminFile file) async {
    _removeContextMenu();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定删除「${file.title}」吗？此操作不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('删除'), style: FilledButton.styleFrom(backgroundColor: Colors.red)),
        ],
      ),
    );
    if (confirmed == true) {
      await widget.onDelete(file);
    }
  }

  void _showProperties(AdminFile file) {
    _removeContextMenu();
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('文件属性'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        _PropertyRow('文件名', file.title),
        _PropertyRow('大小', _formatSize(file.size)),
        _PropertyRow('类型', file.contentType ?? '未知'),
        _PropertyRow('上传者', file.uploaderUsername),
        _PropertyRow('上传时间', _formatDateTime(file.uploadedAt)),
        _PropertyRow('可见性', file.visibility == 'published' ? '已开放 (学生可见)' : '未开放 (仅管理员/上传者可见)'),
        _PropertyRow('Key', file.key, monospace: true),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭'))],
    ));
  }

  @override
  void dispose() {
    _removeContextMenu();
    super.dispose();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        // 工具栏
        _buildToolbar(),
        // 面包屑/路径
        _buildBreadcrumb(),
        // 文件列表/网格
        Expanded(
          child: _buildFileList(),
        ),
        // 底部状态栏
        _buildStatusBar(),
      ],
    );
  }

  Widget _buildToolbar() {
    final selectedCount = _selectedKeys.length;
    final allSelected = _selectedKeys.length == _sortedFiles.length && _sortedFiles.isNotEmpty;

    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.5),
        border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: [
          // 视图模式切换
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'list', icon: Icon(Icons.view_list), label: Text('列表')),
              ButtonSegment(value: 'grid', icon: Icon(Icons.grid_view), label: Text('网格')),
            ],
            selected: {_viewMode},
            onSelectionChanged: (s) => setState(() => _viewMode = s.first),
            showSelectedIcon: false,
          ),
          const SizedBox(width: 12),
          // 排序
          PopupMenuButton<String>(
            initialValue: _sortBy,
            onSelected: (v) => setState(() {
              if (_sortBy == v) {
                _sortAsc = !_sortAsc;
              } else {
                _sortBy = v;
                _sortAsc = true;
              }
            }),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'name', child: Text('按名称')),
              PopupMenuItem(value: 'size', child: Text('按大小')),
              PopupMenuItem(value: 'date', child: Text('按时间')),
            ],
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.sort, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 4),
                Text(_sortByLabel(_sortBy), style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                Icon(_sortAsc ? Icons.arrow_upward : Icons.arrow_downward, size: 14),
              ],
            ),
          ),
          const Spacer(),
          if (selectedCount > 0) ...[
            Text('已选 $selectedCount 项', style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.primary)),
            const SizedBox(width: 12),
            if (widget.canManage)
              FilledButton.icon(
                icon: const Icon(Icons.delete_outline, size: 16),
                label: Text('删除 ($selectedCount)'),
                onPressed: () => _batchDelete(),
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
              ),
            const SizedBox(width: 8),
          ],
          // 全选
          Checkbox(
            value: allSelected,
            tristate: selectedCount > 0 && !allSelected,
            onChanged: (_) => _selectAll(),
          ),
        ],
      ),
    );
  }

  String _sortByLabel(String s) {
    switch (s) {
      case 'size': return '大小';
      case 'date': return '时间';
      default: return '名称';
    }
  }

  Widget _buildBreadcrumb() {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          Icon(Icons.folder_outlined, size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Text(_currentPath, style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }

  Widget _buildFileList() {
    if (_sortedFiles.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.folder_open_outlined, size: 64, color: Theme.of(context).colorScheme.onSurfaceVariant.withOpacity(0.3)),
          const SizedBox(height: 16),
          Text('暂无文件', style: TextStyle(fontSize: 16, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ]),
      );
    }

    if (_viewMode == 'grid') {
      return GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 280,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.2,
        ),
        itemCount: _sortedFiles.length,
        itemBuilder: (_, i) => _FileGridTile(_sortedFiles[i]),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _sortedFiles.length,
      separatorBuilder: (_, __) => Divider(height: 1, indent: 56, endIndent: 16, color: Theme.of(context).dividerColor),
      itemBuilder: (_, i) => _FileListTile(_sortedFiles[i]),
    );
  }

  Widget _buildStatusBar() {
    return Container(
      height: 32,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.5),
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: [
          Text('共 ${_sortedFiles.length} 个项目', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const Spacer(),
          Text('$_sortByLabel 排序', style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }

  Widget _FileListTile(AdminFile file) {
    final selected = _selectedKeys.contains(file.key);
    return InkWell(
      onTap: () => _toggleSelection(file.key),
      onLongPress: () => _showContextMenu(context, file, Offset.zero), // 实际位置需用 GestureDetector
      child: Container(
        height: 48,
        color: selected ? Theme.of(context).colorScheme.primaryContainer.withOpacity(0.3) : null,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            Checkbox(value: selected, onChanged: (_) => _toggleSelection(file.key)),
            const SizedBox(width: 8),
            _FileIcon(file),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(file.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14)),
                  Text('${file.uploaderUsername} · ${_formatSize(file.size)} · ${_formatTime(file.uploadedAt)}', style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
            _VisibilityBadge(file.visibility),
            const SizedBox(width: 8),
            PopupMenuButton<String>(
              onSelected: (v) {
                switch (v) {
                  case 'rename': _renameFile(file); break;
                  case 'toggle': _toggleVisibility(file); break;
                  case 'delete': _deleteFile(file); break;
                  case 'props': _showProperties(file); break;
                }
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'rename', child: Row(children: [Icon(Icons.edit_outlined, size: 18), SizedBox(width: 8), Text('重命名')])),
                PopupMenuItem(value: 'toggle', child: Row(children: [Icon(file.visibility == 'published' ? Icons.visibility_off : Icons.visibility, size: 18), SizedBox(width: 8), Text(file.visibility == 'published' ? '取消开放' : '开放')])),
                const PopupMenuItem(value: 'props', child: Row(children: [Icon(Icons.info_outlined, size: 18), SizedBox(width: 8), Text('属性')])),
                if (widget.canManage) const PopupMenuItem(value: 'delete', child: Row(children: [Icon(Icons.delete_outline, size: 18, color: Colors.red), SizedBox(width: 8), Text('删除', style: TextStyle(color: Colors.red))])),
              ],
              child: Icon(Icons.more_vert, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }

  Widget _FileGridTile(AdminFile file) {
    final selected = _selectedKeys.contains(file.key);
    return InkWell(
      onTap: () => _toggleSelection(file.key),
      onLongPress: () {}, // 网格模式右键菜单暂用 long press 触发
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: selected ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor, width: selected ? 2 : 1),
          borderRadius: BorderRadius.circular(12),
          color: selected ? Theme.of(context).colorScheme.primaryContainer.withOpacity(0.3) : Theme.of(context).colorScheme.surface,
        ),
        child: Stack(
          children: [
            Column(
              children: [
                Expanded(
                  child: Center(
                    child: _FileIcon(file, size: 48),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    children: [
                      Text(file.title, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 2),
                      Text('${_formatSize(file.size)} · ${_formatTime(file.uploadedAt)}', style: TextStyle(fontSize: 10, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
            Positioned(
              right: 4, top: 4,
              child: Checkbox(value: _selectedKeys.contains(file.key), onChanged: (_) => _toggleSelection(file.key), materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _batchDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('批量删除'),
        content: Text('确定删除选中的 ${_selectedKeys.length} 个文件吗？此操作不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('删除'), style: FilledButton.styleFrom(backgroundColor: Colors.red)),
        ],
      ),
    );
    if (confirmed == true) {
      for (final key in _selectedKeys) {
        final file = widget.files.firstWhere((f) => f.key == key);
        await widget.onDelete(file);
      }
      _selectedKeys.clear();
      setState(() {});
    }
  }
}

class _ContextMenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isDestructive;

  const _ContextMenuItem({required this.icon, required this.label, required this.onTap, this.isDestructive = false});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(icon, size: 18, color: isDestructive ? Colors.red : null),
            const SizedBox(width: 12),
            Text(label, style: TextStyle(fontSize: 13, color: isDestructive ? Colors.red : null)),
          ],
        ),
      ),
    );
  }
}

class _PropertyRow extends StatelessWidget {
  final String label;
  final String value;
  final bool monospace;

  const _PropertyRow(this.label, this.value, {this.monospace = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 80, child: Text(label, style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant))),
          Expanded(child: Text(value, style: TextStyle(fontSize: 13, fontFamily: monospace ? 'monospace' : null))),
        ],
      ),
    );
  }
}

class _FileIcon extends StatelessWidget {
  final AdminFile file;
  final double size;

  const _FileIcon(this.file, {this.size = 24});

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color color;
    // contentType 可能是 MIME，也可能是 App 内部类型（markdown/pptx/docx/image）
    final type = (file.contentType ?? '').toLowerCase();
    final ext = file.key.split('.').last.toLowerCase();
    if (type == 'image' || type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].contains(ext)) {
      icon = Icons.image_outlined; color = Colors.purple;
    } else if (type == 'pptx' || type.contains('presentation') || type.contains('powerpoint') || ['ppt', 'pptx'].contains(ext)) {
      icon = Icons.slideshow_outlined; color = Colors.orange;
    } else if (type == 'docx' || type.contains('word') || type.contains('document') || ['doc', 'docx'].contains(ext)) {
      icon = Icons.article_outlined; color = Colors.blue;
    } else if (type == 'markdown' || type.contains('markdown') || ['md', 'markdown'].contains(ext)) {
      icon = Icons.description_outlined; color = Colors.indigo;
    } else if (type.contains('pdf') || ext == 'pdf') {
      icon = Icons.picture_as_pdf_outlined; color = Colors.red;
    } else if (type.startsWith('video/')) {
      icon = Icons.videocam_outlined; color = Colors.teal;
    } else if (type.startsWith('audio/')) {
      icon = Icons.audiotrack_outlined; color = Colors.pink;
    } else {
      icon = Icons.insert_drive_file_outlined; color = Colors.grey;
    }
    return Icon(icon, size: size, color: color);
  }
}

class _VisibilityBadge extends StatelessWidget {
  final String visibility;
  const _VisibilityBadge(this.visibility);

  @override
  Widget build(BuildContext context) {
    final published = visibility == 'published';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: published ? Colors.green.withOpacity(0.15) : Colors.orange.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(published ? '已开放' : '未开放', style: TextStyle(fontSize: 11, color: published ? Colors.green : Colors.orange, fontWeight: FontWeight.w500)),
    );
  }
}

String _formatSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
}

String _formatTime(int ts) {
  final dt = DateTime.fromMillisecondsSinceEpoch(ts);
  return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
}

String _formatDateTime(int ts) {
  final dt = DateTime.fromMillisecondsSinceEpoch(ts);
  return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';
}