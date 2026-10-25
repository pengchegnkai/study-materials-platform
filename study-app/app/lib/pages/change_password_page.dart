/// pages/change_password_page.dart —— 修改自己的密码（错题本同款：验证旧密码，改后其他设备下线）
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../providers/auth_provider.dart';

class ChangePasswordPage extends ConsumerStatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  ConsumerState<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends ConsumerState<ChangePasswordPage> {
  final _oldCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _oldCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (_newCtrl.text.length < 6) {
      setState(() => _error = '新密码至少 6 位');
      return;
    }
    if (_newCtrl.text != _confirmCtrl.text) {
      setState(() => _error = '两次输入的新密码不一致');
      return;
    }
    setState(() => _loading = true);
    try {
      final resp = await ApiClient().dio.post('/change-password', data: {
        'oldPassword': _oldCtrl.text,
        'newPassword': _newCtrl.text,
      });
      if (!mounted) return;
      if (resp.statusCode == 200 && resp.data['ok'] == true) {
        setState(() {
          _done = true;
          _loading = false;
        });
      } else {
        setState(() {
          _error = (resp.data is Map ? resp.data['error'] : null) ?? '修改失败';
          _loading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e is Exception && e.toString().contains('401') ? '旧密码错误' : '$e'.replaceFirst('Exception: ', '');
      setState(() {
        _error = msg;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('修改密码')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _done
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.check_circle_outline, size: 48, color: Color(0xFF059669)),
                  const SizedBox(height: 16),
                  const Text('密码已修改，其他设备已下线', textAlign: TextAlign.center, style: TextStyle(fontSize: 14)),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () async {
                      await ref.read(authProvider.notifier).logout();
                      if (context.mounted) context.go('/login');
                    },
                    child: const Text('使用新密码重新登录'),
                  ),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _oldCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '旧密码'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _newCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '新密码（至少 6 位）'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _confirmCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '确认新密码'),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
                    ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('确认修改'),
                  ),
                  const SizedBox(height: 12),
                  const Text('修改成功后，其他已登录设备的会话将全部失效。', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                ],
              ),
      ),
    );
  }
}
