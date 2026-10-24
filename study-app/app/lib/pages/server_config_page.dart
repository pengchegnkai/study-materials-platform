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
    try {
      await AppConfig.setBaseUrl(url);
      await AppConfig.setProxy(_proxyCtrl.text);
      ApiClient().applyProxy(_proxyCtrl.text);

      // 直接探测服务器连通性（带超时），不依赖 auth 状态是否刷新成功
      final reachable = await _probe();
      if (!mounted) return;
      setState(() => _testing = false);
      if (!reachable) {
        setState(() => _error = '无法连接该地址，请检查网络或地址是否正确');
        return;
      }
      await ref.read(authProvider.notifier).reload();
      if (!mounted) return;
      final s = ref.read(authProvider).value;
      context.go(s?.user != null ? '/' : '/login');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _testing = false;
        _error = '连接失败：${e.toString().replaceFirst('Exception: ', '')}';
      });
    }
  }

  /// 探测服务器是否可用：任何 HTTP 响应（含 401）都视为可达
  Future<bool> _probe() async {
    try {
      final resp = await ApiClient()
          .dio
          .get('/session')
          .timeout(const Duration(seconds: 8));
      return resp.statusCode != null && resp.statusCode! < 500;
    } catch (_) {
      return false;
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
