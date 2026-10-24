/// pages/server_config_page.dart —— 服务器地址配置（预设局域网/公网两个地址）
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../core/config.dart';
import '../providers/auth_provider.dart';

class ServerConfigPage extends ConsumerStatefulWidget {
  const ServerConfigPage({super.key});

  @override
  ConsumerState<ServerConfigPage> createState() => _ServerConfigPageState();
}

class _ServerConfigPageState extends ConsumerState<ServerConfigPage> {
  final _ctrl = TextEditingController();
  final _proxyCtrl = TextEditingController();
  bool _testing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _ctrl.text = AppConfig.baseUrl;
    _proxyCtrl.text = AppConfig.proxy;
  }

  Future<void> _saveAndTest() async {
    final url = _ctrl.text.trim();
    if (url.isEmpty) {
      setState(() => _error = '请输入服务器地址');
      return;
    }
    setState(() {
      _testing = true;
      _error = null;
    });
    await AppConfig.setBaseUrl(url);
    await AppConfig.setProxy(_proxyCtrl.text);
    ApiClient().applyProxy(_proxyCtrl.text);
    final auth = ref.read(authProvider.notifier);
    await auth.reload();
    final s = ref.read(authProvider).value;
    final ok = s != null && s.user != null;
    if (!mounted) return;
    setState(() => _testing = false);
    if (ok) {
      context.go('/');
    } else {
      // 地址可用性以登录页为准；直接进入登录页
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('服务器配置')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('服务器地址', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
          const SizedBox(height: 8),
          TextField(
            controller: _ctrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(hintText: 'http://192.168.3.228:8787'),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: AppConfig.suggestions
                .map((u) => ActionChip(
                      label: Text(u.replaceFirst('http://', '').replaceFirst('https://', '')),
                      onPressed: () => _ctrl.text = u,
                    ))
                .toList(),
          ),
          const SizedBox(height: 12),
          const Text('HTTP 代理（可选，访问被墙域名时填写，如 Clash 默认 127.0.0.1:7890）',
              style: TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
          const SizedBox(height: 8),
          TextField(
            controller: _proxyCtrl,
            keyboardType: TextInputType.text,
            decoration: const InputDecoration(hintText: '留空 = 直连', isDense: true),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
            ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _testing ? null : _saveAndTest,
            child: Text(_testing ? '测试中…' : '保存并继续'),
          ),
          const SizedBox(height: 12),
          const Text(
            '局域网内建议使用 http://192.168.x.x:8787 直连；公网使用 https 域名地址。',
            style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
          ),
        ],
      ),
    );
  }
}
