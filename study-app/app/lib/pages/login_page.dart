/// pages/login_page.dart —— 登录（成功按角色跳转）
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../core/config.dart';
import '../providers/auth_provider.dart';
import '../core/api_client.dart';
import '../services/server_discovery_service.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _u = TextEditingController();
  bool _prefilled = false;
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
    // 管理员主界面为后台看板；老师进工作台；学生进浏览页
    // 三种角色都可从 AppBar 切换到浏览界面（首页）
    if (user?.isAdmin == true) {
      context.go('/admin');
    } else if (user?.isTeacher == true) {
      context.go('/teacher');
    } else {
      context.go('/');
    }
  }

  Future<void> _prefill() async {
    if (_prefilled) return;
    _prefilled = true;
    final cached = await ApiClient().cachedSession();
    if (mounted && _u.text.isEmpty && (cached.username ?? '').isNotEmpty) {
      _u.text = cached.username!;
    }
  }

  @override
  Widget build(BuildContext context) {
    _prefill();
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
                  // 品牌头部（对齐网页端：渐变徽标 + 应用名）
                  Center(
                    child: Column(
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                            ),
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF4F46E5).withOpacity(0.35),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: const Icon(Icons.school_outlined,
                              size: 26, color: Colors.white),
                        ),
                        const SizedBox(height: 12),
                        const Text('班级资料共享',
                            style: TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.3)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),
                  const Text('登录',
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  const Text('管理员 / 老师 / 学生账号',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  const SizedBox(height: 18),
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
