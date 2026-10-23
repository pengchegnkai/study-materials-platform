/// core/config.dart —— 服务器地址全局配置（持久化到 SharedPreferences）
import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static const _key = 'server_base_url';
  static String _baseUrl = '';
  static bool _loaded = false;

  static String get baseUrl => _baseUrl;
  static String get apiBase => '$_baseUrl/api';
  static bool get isConfigured => _baseUrl.isNotEmpty;

  /// 启动时从本地缓存恢复
  static Future<void> load() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString(_key) ?? '';
    _loaded = true;
  }

  static Future<void> setBaseUrl(String url) async {
    var u = url.trim();
    if (u.isNotEmpty && !u.endsWith('/')) u = '$u/';
    if (u.endsWith('/') && !u.endsWith('://') && u.length > 8) {
      u = u.substring(0, u.length - 1);
    }
    _baseUrl = u;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, u);
  }

  /// 预设地址：局域网直连与公网域名，供配置页快速选择
  static const suggestions = [
    'http://192.168.3.228:8787',
    'https://study.pck-server.ccwu.cc',
  ];
}
