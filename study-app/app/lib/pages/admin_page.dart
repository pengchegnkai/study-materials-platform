/// pages/admin_page.dart —— 管理员后台（仪表盘、文件、用户、科目）
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../providers/admin_provider.dart';
import '../components/file_manager.dart';

class AdminPage extends ConsumerStatefulWidget {
  const AdminPage({super.key});

  @override
  ConsumerState<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends ConsumerState<AdminPage> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 6, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('管理后台'),
        actions: [
          IconButton(
            icon: const Icon(Icons.home_outlined),
            tooltip: '浏览资料',
            onPressed: () => context.go('/'),
          ),
          IconButton(
            icon: const Icon(Icons.logout_outlined),
            tooltip: '退出登录',
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: const [
            Tab(icon: Icon(Icons.dashboard_outlined), text: '仪表盘'),
            Tab(icon: Icon(Icons.folder_outlined), text: '文件管理'),
            Tab(icon: Icon(Icons.people_outlined), text: '用户管理'),
            Tab(icon: Icon(Icons.subject_outlined), text: '科目管理'),
            Tab(icon: Icon(Icons.show_chart_outlined), text: '24 小时曲线'),
            Tab(icon: Icon(Icons.receipt_long_outlined), text: '实时日志'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _DashboardTab(onOpenChart: () => _tabController.animateTo(4), onOpenLogs: () => _tabController.animateTo(5)),
          _FilesTab(),
          _UsersTab(),
          _SubjectsTab(),
          _ChartTab(),
          _LogsTab(),
        ],
      ),
    );
  }
}

// ---------- 仪表盘 ----------
class _DashboardTab extends ConsumerWidget {
  final VoidCallback onOpenChart;
  final VoidCallback onOpenLogs;
  const _DashboardTab({required this.onOpenChart, required this.onOpenLogs});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(adminDashboardProvider);
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(adminDashboardProvider),
      child: dashboard.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('加载失败: $e', style: TextStyle(color: theme.colorScheme.error)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: () => ref.invalidate(adminDashboardProvider), child: const Text('重试')),
          ]),
        ),
        data: (d) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            LayoutBuilder(builder: (context, c) {
              final cols = c.maxWidth >= 900 ? 4 : (c.maxWidth >= 600 ? 3 : 2);
              return GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: cols,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.6,
              children: [
                _StatCard('在线人数', '${d.onlineUsers}', Icons.people_outline, Colors.blue),
                _StatCard('总用户', '${d.totalUsers}', Icons.person_outline, Colors.green),
                _StatCard('总文件', '${d.totalFiles}', Icons.description_outlined, Colors.orange),
                _StatCard('存储占用', formatSize(d.totalSize), Icons.storage_outlined, Colors.purple),
              ],
              );
            }),
            const SizedBox(height: 20),
            // 二级菜单入口
            Row(
              children: [
                _SubMenuChip(
                  icon: Icons.show_chart_outlined,
                  label: '24 小时曲线',
                  color: const Color(0xFF4F46E5),
                  onTap: onOpenChart,
                ),
                const SizedBox(width: 8),
                _SubMenuChip(
                  icon: Icons.receipt_long_outlined,
                  label: '实时日志',
                  color: const Color(0xFF059669),
                  onTap: onOpenLogs,
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text('最近上传', style: theme.textTheme.titleLarge),
            const SizedBox(height: 12),
            _RecentFilesTable(files: d.recentFiles),
            const SizedBox(height: 24),
            Text('文件类型分布', style: theme.textTheme.titleLarge),
            const SizedBox(height: 12),
            _TypeChart(data: d.byType),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatCard(this.label, this.value, this.icon, this.color);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, size: 18, color: color),
            ),
            const Spacer(),
            Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(value, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _RecentFilesTable extends StatelessWidget {
  final List<AdminFile> files;
  const _RecentFilesTable({required this.files});

  @override
  Widget build(BuildContext context) {
    if (files.isEmpty) {
      return Card(child: SizedBox(height: 100, child: Center(child: Text('暂无文件', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)))));
    }
    return Card(
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columnSpacing: 16,
          columns: const [
            DataColumn(label: Text('文件名')),
            DataColumn(label: Text('上传者')),
            DataColumn(label: Text('大小')),
            DataColumn(label: Text('状态')),
          ],
          rows: files.map((f) => DataRow(cells: [
            DataCell(SizedBox(width: 160, child: Text(f.title, overflow: TextOverflow.ellipsis))),
            DataCell(Text(f.uploaderUsername)),
            DataCell(Text(formatSize(f.size))),
            DataCell(_VisibilityBadge(f.visibility)),
          ])).toList(),
        ),
      ),
    );
  }
}

class _TypeChart extends StatelessWidget {
  final Map<String, int> data;
  const _TypeChart({required this.data});

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return Card(child: SizedBox(height: 100, child: Center(child: Text('暂无数据', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)))));
    }
    final total = data.values.fold<int>(0, (a, b) => a + b);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: data.entries.map((e) {
            final pct = total > 0 ? e.value / total : 0.0;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  SizedBox(width: 90, child: Text(_typeLabel(e.key), style: const TextStyle(fontSize: 13))),
                  Expanded(child: LinearProgressIndicator(value: pct, minHeight: 8, borderRadius: BorderRadius.circular(4))),
                  const SizedBox(width: 12),
                  SizedBox(width: 52, child: Text('${e.value}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 12))),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  String _typeLabel(String t) {
    switch (t) {
      case 'markdown': return 'Markdown';
      case 'pptx': return 'PPT';
      case 'docx': return 'Word';
      case 'image': return '图片';
      default: return '其他';
    }
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
      decoration: BoxDecoration(color: (published ? Colors.green : Colors.orange).withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
      child: Text(published ? '已开放' : '未开放', style: TextStyle(fontSize: 11, color: published ? Colors.green : Colors.orange, fontWeight: FontWeight.w500)),
    );
  }
}

// ---------- 文件管理 ----------
class _FilesTab extends ConsumerWidget {
  const _FilesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final adminFiles = ref.watch(adminFilesProvider);
    final folders = ref.watch(adminFoldersProvider);
    final subjects = ref.watch(adminSubjectsProvider);

    return adminFiles.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('加载失败: $e', style: TextStyle(color: Theme.of(context).colorScheme.error))),
      data: (files) => folders.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('加载失败: $e', style: TextStyle(color: Theme.of(context).colorScheme.error))),
        data: (folderList) => FileManager(
          files: files,
          folders: folderList,
          onDelete: (f) => ref.read(adminProvider).deleteFile(f.key),
          onToggleVisibility: (f) => ref.read(adminProvider).toggleFileVisibility(f.key, f.visibility == 'published' ? 'private' : 'published'),
          onRename: (f, newTitle) => ref.read(adminProvider).renameFile(f.key, newTitle),
          onCreateFolder: (path) => ref.read(adminProvider).createFolder(path),
          onMoveCopy: (items, action, targetDir) async {
            final notifier = ref.read(adminProvider);
            for (final f in items) {
              if (action == 'move') {
                await notifier.moveFile(f.key, targetDir);
              } else {
                await notifier.copyFile(f.key, targetDir);
              }
            }
          },
          onDeleteFolder: (path) => ref.read(adminProvider).deleteFolder(path),
          onMoveFolder: (path, targetDir) => ref.read(adminProvider).moveFolder(path, targetDir),
          subjects: subjects.value
                  ?.map((x) => (id: x.id, name: x.name))
                  .toList() ??
              const [],
          canManage: true,
        ),
      ),
    );
  }
}

// ---------- 用户管理 ----------
class _UsersTab extends ConsumerWidget {
  const _UsersTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(adminUsersProvider);

    return users.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('加载失败: $e', style: TextStyle(color: Theme.of(context).colorScheme.error))),
      data: (list) => list.isEmpty
          ? const Center(child: Text('暂无用户'))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              itemBuilder: (_, i) => _UserTile(list[i]),
            ),
    );
  }
}

class _UserTile extends ConsumerWidget {
  final AdminUser user;
  const _UserTile(this.user);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(child: Text(user.username.isNotEmpty ? user.username[0].toUpperCase() : "?")),
        title: Text(user.username),
        subtitle: Text('角色: ${user.roles.join(', ')} · 科目: ${user.subjects.isEmpty ? '—' : user.subjects.join(', ')}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _StatusBadge(user.status),
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'edit') _showEditDialog(context, ref);
                if (v == 'toggle') ref.read(adminProvider).updateUser(user.id, status: user.status == 'active' ? 'disabled' : 'active');
                if (v == 'delete') _confirmDelete(context, ref);
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Text('编辑角色/科目')),
                PopupMenuItem(value: 'toggle', child: Text(user.status == 'active' ? '禁用账号' : '启用账号')),
                const PopupMenuItem(value: 'delete', child: Text('删除用户', style: TextStyle(color: Colors.red))),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showEditDialog(BuildContext context, WidgetRef ref) async {
    final subjects = await ref.read(adminSubjectsProvider.future).catchError((_) => <AdminSubject>[]);
    if (!context.mounted) return;
    final selectedRoles = Set<String>.from(user.roles.map((r) => _roleNameToId(r)));
    final selectedSubjects = <String>{};

    await showDialog(context: context, builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text('编辑：${user.username}'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('角色', style: TextStyle(fontWeight: FontWeight.w600)),
            Wrap(spacing: 8, children: [
              for (final r in const [('role-admin', '管理员'), ('role-teacher', '老师'), ('role-student', '学生')])
                FilterChip(
                  label: Text(r.$2),
                  selected: selectedRoles.contains(r.$1),
                  onSelected: (v) => setState(() => v ? selectedRoles.add(r.$1) : selectedRoles.remove(r.$1)),
                ),
            ]),
            const SizedBox(height: 12),
            const Text('科目', style: TextStyle(fontWeight: FontWeight.w600)),
            Wrap(spacing: 8, children: [
              for (final s in subjects)
                FilterChip(
                  label: Text(s.name),
                  selected: selectedSubjects.contains(s.id),
                  onSelected: (v) => setState(() => v ? selectedSubjects.add(s.id) : selectedSubjects.remove(s.id)),
                ),
            ]),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () async {
            await ref.read(adminProvider).updateUser(user.id, roleIds: selectedRoles.toList(), subjectIds: selectedSubjects.toList());
            if (ctx.mounted) Navigator.pop(ctx);
          }, child: const Text('保存')),
        ],
      ),
    ));
  }

  String _roleNameToId(String name) {
    switch (name) {
      case 'admin': return 'role-admin';
      case 'teacher': return 'role-teacher';
      default: return 'role-student';
    }
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定删除用户「${user.username}」吗？此操作不可恢复。'),
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
    if (ok == true) await ref.read(adminProvider).deleteUser(user.id);
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge(this.status);

  @override
  Widget build(BuildContext context) {
    final active = status == 'active';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: (active ? Colors.green : Colors.red).withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
      child: Text(active ? '正常' : '禁用', style: TextStyle(fontSize: 11, color: active ? Colors.green : Colors.red, fontWeight: FontWeight.w500)),
    );
  }
}

// ---------- 科目管理 ----------
class _SubjectsTab extends ConsumerWidget {
  const _SubjectsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subjects = ref.watch(adminSubjectsProvider);

    return subjects.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('加载失败: $e', style: TextStyle(color: Theme.of(context).colorScheme.error))),
      data: (list) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Text('科目管理', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                const Spacer(),
                FilledButton.icon(
                  icon: const Icon(Icons.add),
                  label: const Text('新建科目'),
                  onPressed: () => _showCreateDialog(context, ref),
                ),
              ],
            ),
          ),
          Expanded(
            child: list.isEmpty
                ? Center(child: Text('暂无科目', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)))
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: list.length,
                    itemBuilder: (_, i) => _SubjectTile(list[i]),
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _showCreateDialog(BuildContext context, WidgetRef ref) async {
    final nameCtrl = TextEditingController();
    final sortCtrl = TextEditingController(text: '0');
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建科目'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, autofocus: true, decoration: const InputDecoration(labelText: '科目名称')),
          const SizedBox(height: 12),
          TextField(controller: sortCtrl, decoration: const InputDecoration(labelText: '排序'), keyboardType: TextInputType.number),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () async {
            final name = nameCtrl.text.trim();
            if (name.isEmpty) return;
            await ref.read(adminProvider).createSubject(name, int.tryParse(sortCtrl.text) ?? 0);
            if (ctx.mounted) Navigator.pop(ctx);
          }, child: const Text('创建')),
        ],
      ),
    );
  }
}

class _SubjectTile extends ConsumerWidget {
  final AdminSubject subject;
  const _SubjectTile(this.subject);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(child: Text(subject.name.isNotEmpty ? subject.name[0] : "?")),
        title: Text(subject.name, style: const TextStyle(fontWeight: FontWeight.w500)),
        subtitle: Text('Slug: ${subject.slug} · 排序: ${subject.sortOrder} · 文件: ${subject.fileCount}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(icon: const Icon(Icons.edit_outlined, size: 18), onPressed: () => _showEditDialog(context, ref)),
            IconButton(icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red), onPressed: () => _confirmDelete(context, ref)),
          ],
        ),
      ),
    );
  }

  Future<void> _showEditDialog(BuildContext context, WidgetRef ref) async {
    final nameCtrl = TextEditingController(text: subject.name);
    final sortCtrl = TextEditingController(text: subject.sortOrder.toString());
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('编辑科目：${subject.name}'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: '科目名称')),
          const SizedBox(height: 12),
          TextField(controller: sortCtrl, decoration: const InputDecoration(labelText: '排序'), keyboardType: TextInputType.number),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () async {
            await ref.read(adminProvider).updateSubject(subject.id, name: nameCtrl.text.trim(), sortOrder: int.tryParse(sortCtrl.text) ?? 0);
            if (ctx.mounted) Navigator.pop(ctx);
          }, child: const Text('保存')),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定删除科目「${subject.name}」吗？该科目下有文件时将无法删除。'),
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
    if (ok == true) {
      try {
        await ref.read(adminProvider).deleteSubject(subject.id);
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('删除失败：$e'.replaceFirst('Exception: ', '')), backgroundColor: Colors.red),
          );
        }
      }
    }
  }
}

String formatSize(int? bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
}


// ---------- 二级菜单入口胶囊 ----------
class _SubMenuChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _SubMenuChip({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

// ---------- 24 小时曲线（二级页） ----------
class _ChartTab extends ConsumerStatefulWidget {
  const _ChartTab();

  @override
  ConsumerState<_ChartTab> createState() => _ChartTabState();
}

class _ChartTabState extends ConsumerState<_ChartTab> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted) ref.invalidate(adminChart24hProvider);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chart = ref.watch(adminChart24hProvider);
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(adminChart24hProvider),
      child: chart.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('加载失败: $e', style: TextStyle(color: theme.colorScheme.error))),
        data: (d) {
          final maxV = d.points.fold<int>(1, (m, p) => [m, p.uploads, p.logins].reduce((a, b) => a > b ? a : b));
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  const Icon(Icons.circle, size: 8, color: Color(0xFF10B981)),
                  const SizedBox(width: 6),
                  Text('实时在线 ${d.online}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Text('每分钟刷新', style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant)),
                ],
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      SizedBox(
                        height: 180,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            for (final p in d.points)
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 1),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      Container(
                                        height: (p.uploads / maxV) * 140 + (p.uploads > 0 ? 3 : 0),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF6366F1),
                                          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Container(
                                        height: (p.logins / maxV) * 30 + (p.logins > 0 ? 2 : 0),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF34D399),
                                          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(d.points.isEmpty ? '' : d.points.first.label, style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                          Text(d.points.isEmpty ? '' : d.points[d.points.length ~/ 2].label, style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                          Text(d.points.isEmpty ? '' : d.points.last.label, style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _legend(const Color(0xFF6366F1), '上传数'),
                  const SizedBox(width: 16),
                  _legend(const Color(0xFF34D399), '登录数'),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _legend(Color c, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 10, height: 10, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
      const SizedBox(width: 5),
      Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
    ]);
  }
}

// ---------- 实时日志（二级页） ----------
class _LogsTab extends ConsumerStatefulWidget {
  const _LogsTab();

  @override
  ConsumerState<_LogsTab> createState() => _LogsTabState();
}

class _LogsTabState extends ConsumerState<_LogsTab> {
  Timer? _timer;
  bool _paused = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted && !_paused) ref.invalidate(adminLogsProvider);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  static const _labels = <String, (String, Color, Color)>{
    'login': ('登录', Color(0xFFECFDF5), Color(0xFF059669)),
    'upload': ('上传', Color(0xFFEFF6FF), Color(0xFF2563EB)),
    'delete': ('删除', Color(0xFFFEF2F2), Color(0xFFDC2626)),
    'move': ('移动', Color(0xFFFFFBEB), Color(0xFFD97706)),
    'copy': ('复制', Color(0xFFF5F3FF), Color(0xFF7C3AED)),
    'password_change': ('改密', Color(0xFFF3F4F6), Color(0xFF4B5563)),
  };

  @override
  Widget build(BuildContext context) {
    final logs = ref.watch(adminLogsProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              Icon(Icons.circle, size: 8, color: _paused ? const Color(0xFF9CA3AF) : const Color(0xFF10B981)),
              const SizedBox(width: 6),
              Text(_paused ? '已暂停' : '实时刷新中', style: const TextStyle(fontSize: 12)),
              const Spacer(),
              TextButton(
                onPressed: () => setState(() => _paused = !_paused),
                child: Text(_paused ? '继续' : '暂停'),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 20),
                onPressed: () => ref.invalidate(adminLogsProvider),
              ),
            ],
          ),
        ),
        Expanded(
          child: logs.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('加载失败: $e')),
            data: (list) => list.isEmpty
                ? const Center(child: Text('暂无日志', style: TextStyle(color: Color(0xFF6B7280))))
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      final l = list[i];
                      final meta = _labels[l.action] ?? (l.action, const Color(0xFFF3F4F6), const Color(0xFF4B5563));
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surface,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Theme.of(context).dividerColor),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(color: meta.$2, borderRadius: BorderRadius.circular(20)),
                              child: Text(meta.$1,
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: meta.$3)),
                            ),
                            const SizedBox(width: 8),
                            Text(l.username, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(l.detail,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              () {
                                final dt = DateTime.fromMillisecondsSinceEpoch(l.createdAt);
                                String two(int v) => v.toString().padLeft(2, '0');
                                return '${two(dt.hour)}:${two(dt.minute)}';
                              }(),
                              style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }
}
