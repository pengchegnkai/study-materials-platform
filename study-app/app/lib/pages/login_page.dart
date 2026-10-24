/// pages/login_page.dart —— 登录（成功按角色跳转）
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../core/config.dart';
import '../providers/auth_provider.dart';
import '../services/server_discovery_service.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _u = TextEditingController();
  final _p = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    var err = await ref.read(authProvider.notifier).login(_u.text.trim(), _p.text);

    // 复用错题本方法：网络层失败时自动发现局域网服务器并切换地址重试一次
    if (err != null && (err.contains('网络连接失败') || err.contains('无法连接服务器'))) {
      setState(() => _error = '正在自动查找局域网服务器…');
      final discovery = ServerDiscoveryService();
      String? found = await discovery.probeLocalhost();
      found ??= await discovery.discover();
      if (found != null && found != AppConfig.baseUrl) {
        await AppConfig.setBaseUrl(found);
        ApiClient().dio.options.baseUrl = AppConfig.apiBase;
        err = await ref.read(authProvider.notifier).login(_u.text.trim(), _p.text);
      }
    }

    if (!mounted) return;
    setState(() => _loading = false);
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    final user = ref.read(authProvider).value?.user;
    if (user?.isAdmin == true) {
      context.go('/teacher');
    } else if (user?.isTeacher == true) {
      context.go('/teacher');
    } else {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(''),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: '服务器配置',
            onPressed: () => context.push('/server-config'),
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('登录',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  const Text('管理员 / 老师 / 学生账号',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _u,
                    decoration: const InputDecoration(labelText: '用户名'),
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _p,
                    decoration: const InputDecoration(labelText: '密码'),
                    obscureText: true,
                    onSubmitted: (_) => _submit(),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_error!,
                          style: const TextStyle(color: Colors.red, fontSize: 12)),
                    ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('登录'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
