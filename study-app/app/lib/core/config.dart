/// core/config.dart —— 服务器地址全局配置（持久化到 SharedPreferences）
import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static const _key = 'server_base_url';
  /// 默认服务器（公网 API 域名）：首次安装直连，无需手动配置
  static const defaultBaseUrl = 'http://api.pck-server.ccwu.cc:8080';
  /// 历史默认值：已安装用户若仍是该地址，启动时自动迁移到新默认
  static const _legacyDefault = 'https://study.pck-server.ccwu.cc';
  static const _proxyKey = 'proxy_addr';
  static String _baseUrl = '';
  static String _proxy = '';
  static bool _loaded = false;

  static String get baseUrl => _baseUrl;
  static String get apiBase => '$_baseUrl/api';
  static bool get isConfigured => _baseUrl.isNotEmpty;

  /// HTTP 代理地址（如 127.0.0.1:7890），空 = 直连
  static String get proxy => _proxy;

  /// 启动时从本地缓存恢复
  static Future<void> load() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    if (saved == null || saved.isEmpty) {
      _baseUrl = defaultBaseUrl; // 首次安装：直接用默认公网 API 地址
    } else if (saved.replaceAll(RegExp(r'/+$'), '') == _legacyDefault) {
      _baseUrl = defaultBaseUrl; // 旧的 study 域名自动迁移到 api 域名
    } else {
      _baseUrl = saved;
    }
    _proxy = prefs.getString(_proxyKey) ?? '';
    _loaded = true;
    if (saved != _baseUrl) {
      await prefs.setString(_key, _baseUrl);
    }
  }

  static Future<void> setProxy(String addr) async {
    _proxy = addr.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_proxyKey, _proxy);
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

  /// 预设地址：局域网直连、公网 API 域名（HTTP 明文端口 8080）、主站公网域名
  static const suggestions = [
    'http://api.pck-server.ccwu.cc:8080',
    'http://192.168.3.228:8787',
  ];
}
