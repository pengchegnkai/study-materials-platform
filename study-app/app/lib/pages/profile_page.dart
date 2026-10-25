/// pages/profile_page.dart —— 个人中心：资料卡 + 二级菜单（改密/服务器/切换账号/退出）
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/platform_service.dart';

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  final _svc = PlatformService();
  Uint8List? _avatarBytes;
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    _loadAvatar();
  }

  Future<void> _loadAvatar() async {
    final u = ref.read(authProvider).value?.user;
    if (u == null || u.avatar == null || u.avatar!.isEmpty) return;
    try {
      final resp = await _svc.avatarBytes(u.username);
      if (mounted) setState(() => _avatarBytes = Uint8List.fromList(resp.data ?? []));
    } catch (_) {}
  }

  Future<void> _pickAvatar() async {
    final res = await FilePicker.platform.pickFiles(type: FileType.image);
    final path = res?.files.single.path;
    if (path == null) return;
    setState(() => _uploading = true);
    try {
      await _svc.uploadAvatar(File(path), res!.files.single.name);
      await ref.read(authProvider.notifier).refreshSession();
      setState(() => _avatarBytes = null);
      await _loadAvatar();
      _toast('头像已更新');
    } catch (e) {
      _toast('上传失败：$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _editNickname() async {
    final user = ref.read(authProvider).value?.user;
    final ctrl = TextEditingController(text: user?.nickname ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('修改昵称'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: InputDecoration(hintText: user?.username),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('保存')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _svc.updateNickname(ctrl.text.trim());
      await ref.read(authProvider.notifier).refreshSession();
      _toast('昵称已保存');
    } catch (e) {
      _toast('保存失败：$e'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _switchAccount() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('切换账号'),
        content: const Text('将退出当前账号并回到登录页，可输入其他账号登录。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('切换')),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(authProvider.notifier).logout();
    if (mounted) context.go('/login');
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value?.user;
    if (user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final roles = user.roles
        .map((r) => r == 'admin' ? '管理员' : r == 'teacher' ? '老师' : '学生')
        .join(' · ');

    return Scaffold(
      appBar: AppBar(title: const Text('个人中心')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 资料卡
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  GestureDetector(
                    onTap: _uploading ? null : _pickAvatar,
                    child: Stack(
                      children: [
                        _avatarBytes != null
                            ? CircleAvatar(radius: 36, backgroundImage: MemoryImage(_avatarBytes!))
                            : Container(
                                width: 72,
                                height: 72,
                                alignment: Alignment.center,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                                  ),
                                ),
                                child: Text(
                                  user.displayName.characters.take(2).toString().toUpperCase(),
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 24,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            padding: const EdgeInsets.all(5),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.primary,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                            child: _uploading
                                ? const SizedBox(
                                    width: 12,
                                    height: 12,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.camera_alt, size: 12, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(user.displayName,
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 4),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.edit_outlined, size: 15),
                        tooltip: '修改昵称',
                        onPressed: _editNickname,
                      ),
                    ],
                  ),
                  Text('${user.username} · $roles',
                      style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B7280))),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // 二级菜单
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                _menuTile(Icons.lock_outline, '修改密码', '定期更换更安全',
                    () => context.push('/change-password')),
                const Divider(height: 1, indent: 56),
                _menuTile(Icons.dns_outlined, '服务器设置', '当前地址可在设置中修改',
                    () => context.push('/server-config')),
                const Divider(height: 1, indent: 56),
                _menuTile(Icons.swap_horiz, '切换账号', '退出并登录其他账号', _switchAccount),
                const Divider(height: 1, indent: 56),
                _menuTile(Icons.system_update_alt, '检查更新', '滚动更新，无需重新安装', () => context.push('/update')),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            clipBehavior: Clip.antiAlias,
            child: _menuTile(Icons.logout_outlined, '退出登录', null, () async {
              await ref.read(authProvider.notifier).logout();
              if (mounted) context.go('/login');
            }, danger: true),
          ),
        ],
      ),
    );
  }

  Widget _menuTile(IconData icon, String title, String? subtitle, VoidCallback onTap,
      {bool danger = false}) {
    final cs = Theme.of(context).colorScheme;
    return ListTile(
      leading: Icon(icon, size: 20, color: danger ? Colors.red : cs.primary),
      title: Text(title,
          style: TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w500,
              color: danger ? Colors.red : null)),
      subtitle: subtitle == null
          ? null
          : Text(subtitle, style: const TextStyle(fontSize: 11.5, color: Color(0xFF9CA3AF))),
      trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFC4C8D0)),
      onTap: onTap,
    );
  }
}
