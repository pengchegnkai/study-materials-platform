/// core/api_client.dart —— Dio 封装：baseUrl 动态、会话 Cookie 自动携带与持久化
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._();
  factory ApiClient() => _instance;

  late final Dio dio;
  PersistCookieJar? _cookieJar;

  ApiClient._() {
    dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(minutes: 5), // 大文件上传/下载
      headers: {'Accept': 'application/json'},
      validateStatus: (s) => s != null && s < 500, // 401/403/404 交给业务层处理
    ));
    _initCookies();
  }

  /// 供 main() 显式等待 Cookie 持久化初始化（避免首请求未挂拦截器）
  Future<void> init() => _initCookies();

  Future<void> _initCookies() async {
    final dir = await getApplicationSupportDirectory();
    final jar = PersistCookieJar(
      storage: FileStorage('${dir.path}/cookies'),
      ignoreExpires: true, // 会话 Cookie(HttpOnly) 也持久化
    );
    _cookieJar = jar;
    dio.interceptors.add(CookieManager(jar));
  }

  /// 应用/清除 HTTP 代理（被墙域名需要经代理访问时配置，如 127.0.0.1:7890）
  void applyProxy(String addr) {
    final p = addr.trim();
    if (p.isEmpty) {
      dio.httpClientAdapter = IOHttpClientAdapter()
        ..createHttpClient = () => HttpClient();
    } else {
      final parts = p.replaceFirst('http://', '').split(':');
      final host = parts.first;
      final port = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 7890;
      dio.httpClientAdapter = IOHttpClientAdapter()
        ..createHttpClient = () {
          final client = HttpClient();
          client.findProxy = (uri) => 'PROXY $host:$port';
          return client;
        };
    }
  }

  /// 确保已配置服务器地址
  void ensureConfigured() {
    if (!AppConfig.isConfigured) {
      throw Exception('服务器地址未配置，请先在配置页设置');
    }
    dio.options.baseUrl = AppConfig.apiBase;
  }

  /// 登录成功后手动保存 Set-Cookie（dio_cookie_manager 自动处理响应头，此处冗余兜底）
  Future<void> clearSession() async {
    await _cookieJar?.deleteAll();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('session_username');
    await prefs.remove('session_roles');
  }

  Future<void> saveSession({required String username, required List<String> roles}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('session_username', username);
    await prefs.setStringList('session_roles', roles);
  }

  Future<({String? username, List<String> roles})> cachedSession() async {
    final prefs = await SharedPreferences.getInstance();
    return (
      username: prefs.getString('session_username'),
      roles: prefs.getStringList('session_roles') ?? [],
    );
  }
}
