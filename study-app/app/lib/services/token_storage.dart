/// services/token_storage.dart —— access/refresh token 本地存储（错题本同款设计）
/// access：内存同步缓存（拦截器每请求附带）；refresh：持久化，仅刷新时使用
import 'package:shared_preferences/shared_preferences.dart';

class TokenStorage {
  static String? _access;
  static String? _refresh;

  static String? get accessTokenSync => _access;
  static String? get refreshTokenSync => _refresh;

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _access = prefs.getString('auth_access');
    _refresh = prefs.getString('auth_refresh');
  }

  static Future<void> save({required String access, required String refresh}) async {
    _access = access;
    _refresh = refresh;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_access', access);
    await prefs.setString('auth_refresh', refresh);
  }

  static Future<void> clear() async {
    _access = null;
    _refresh = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_access');
    await prefs.remove('auth_refresh');
  }
}
