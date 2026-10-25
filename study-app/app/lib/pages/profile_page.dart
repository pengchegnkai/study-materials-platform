/// pages/profile_page.dart —— 个人中心：头像、昵称、修改密码
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
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
  late final TextEditingController _nickCtrl;
  final _oldPwd = TextEditingController();
  final _newPwd = TextEditingController();
  final _confirmPwd = TextEditingController();
  bool _pwdLoading = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).value?.user;
    _nickCtrl = TextEditingController(text: user?.nickname ?? '');
    _loadAvatar(user);
  }

  @override
  void dispose() {
    _nickCtrl.dispose();
    _oldPwd.dispose();
    _newPwd.dispose();
    _confirmPwd.dispose();
    super.dispose();
  }

  Future<void> _loadAvatar(SessionUser? user) async {
    final u = user ?? ref.read(authProvider).value?.user;
    if (u == null || u.avatar == null || u.avatar!.isEmpty) return;
    try {
      final resp = await _svc.avatarBytes(u.username);
      if (!mounted) return;
      setState(() => _avatarBytes = Uint8List.fromList(resp.data ?? []));
    } catch (_) {}
  }

  Future<void> _pickAvatar() async {
    final res = await FilePicker.platform.pickFiles(type: FileType.image);
    final path = res?.files.single.path;
    if (path == null) return;
    setState(() => _uploading = true);
    try {
      await _svc.uploadAvatar(File(path), res!.files.single.name);
      // 刷新会话里的头像字段
      await ref.read(authProvider.notifier).refreshSession();
      final user = ref.read(authProvider).value?.user;
      setState(() => _avatarBytes = null);
      await _loadAvatar(user);
      _toast('头像已更新');
    } catch (e) {
      _toast('上传失败：$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _saveNickname() async {
    try {
      await _svc.updateNickname(_nickCtrl.text.trim());
      await ref.read(authProvider.notifier).refreshSession();
      _toast('昵称已保存');
    } catch (e) {
      _toast('保存失败：$e'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _changePassword() async {
    if (_newPwd.text.length < 6) {
      _toast('新密码至少 6 位');
      return;
    }
    if (_newPwd.text != _confirmPwd.text) {
      _toast('两次输入的新密码不一致');
      return;
    }
    setState(() => _pwdLoading = true);
    try {
      await _svc.dio.post('/change-password', data: {
        'oldPassword': _oldPwd.text,
        'newPassword': _newPwd.text,
      });
      _oldPwd.clear();
      _newPwd.clear();
      _confirmPwd.clear();
      _toast('密码已修改，其他设备已下线');
    } on DioException catch (e) {
      final msg = e.response?.statusCode == 401 ? '旧密码错误' : (e.response?.data is Map ? '${e.response?.data['error']}' : '$e');
      _toast(msg.replaceFirst('Exception: ', ''));
    } catch (e) {
      _toast('$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _pwdLoading = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value?.user;
    final cs = Theme.of(context).colorScheme;
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
          // 头像卡
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
                            ? CircleAvatar(radius: 40, backgroundImage: MemoryImage(_avatarBytes!))
                            : Container(
                                width: 80,
                                height: 80,
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
                                  style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w600),
                                ),
                              ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: cs.primary,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                            child: _uploading
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.camera_alt, size: 14, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(user.displayName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text('${user.username} · $roles', style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B7280))),
                  const SizedBox(height: 4),
                  const Text('点击头像更换（PNG/JPG/WebP，≤2MB）', style: TextStyle(fontSize: 11.5, color: Color(0xFF9CA3AF))),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          // 昵称
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('昵称', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _nickCtrl,
                    decoration: InputDecoration(hintText: user.username, isDense: true),
                  ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(onPressed: _saveNickname, child: const Text('保存昵称')),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          // 修改密码
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Icon(Icons.lock_outline, size: 16, color: cs.primary),
                    const SizedBox(width: 6),
                    const Text('修改密码', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 12),
                  TextField(controller: _oldPwd, obscureText: true, decoration: const InputDecoration(labelText: '旧密码', isDense: true)),
                  const SizedBox(height: 10),
                  TextField(controller: _newPwd, obscureText: true, decoration: const InputDecoration(labelText: '新密码（至少 6 位）', isDense: true)),
                  const SizedBox(height: 10),
                  TextField(controller: _confirmPwd, obscureText: true, decoration: const InputDecoration(labelText: '确认新密码', isDense: true)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Expanded(child: Text('修改后其他设备会下线', style: TextStyle(fontSize: 11.5, color: Color(0xFF9CA3AF)), maxLines: 2)),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: _pwdLoading ? null : _changePassword,
                        child: _pwdLoading
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('确认修改'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
            icon: const Icon(Icons.logout_outlined, size: 18),
            label: const Text('退出登录'),
          ),
        ],
      ),
    );
  }
}
