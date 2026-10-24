/// core/api_client.dart —— Dio 封装（错题本同款 token 设计）：
/// Bearer access 自动附带、401 自动刷新并重试（并发安全）、代理可选
import 'dart:io';
import 'dart:async';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';
import '../services/token_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._();
  factory ApiClient() => _instance;
  static ApiClient get instance => _instance;

  late final Dio dio;
  Completer<bool>? _refreshing;

  ApiClient._() {
    dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(minutes: 5), // 大文件上传/下载
      headers: {'Accept': 'application/json'},
      validateStatus: (s) => s != null && s < 500, // 401/403/404 交给业务层处理
    ));
    dio.interceptors.add(AuthInterceptor(dio));
  }

  /// 供 main() 显式等待 token 缓存初始化
  Future<void> init() => TokenStorage.load();

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

  /// 会话用户信息（username/roles 缓存，与 token 无关）
  Future<void> clearSession() async {
    await TokenStorage.clear();
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

  /// 刷新 access token（Completer 防并发 401 触发多次刷新）
  Future<bool> tryRefresh() async {
    if (_refreshing != null) return _refreshing!.future;
    final completer = Completer<bool>();
    _refreshing = completer;
    try {
      final refresh = TokenStorage.refreshTokenSync;
      if (refresh == null || refresh.isEmpty) {
        completer.complete(false);
        return false;
      }
      final bare = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        validateStatus: (s) => s != null && s < 500,
      ));
      bare.options.baseUrl = dio.options.baseUrl;
      final r = await bare.post('/refresh', data: {'refreshToken': refresh});
      final d = r.data;
      if (r.statusCode == 200 && d is Map && d['ok'] == true && d['accessToken'] != null) {
        await TokenStorage.save(access: d['accessToken'], refresh: d['refreshToken']);
        completer.complete(true);
        return true;
      }
      await TokenStorage.clear();
      completer.complete(false);
      return false;
    } catch (_) {
      // 刷新请求自身断网/5xx：凭据未必失效 → 不清 token
      completer.complete(false);
      return false;
    } finally {
      _refreshing = null;
    }
  }
}

/// 鉴权拦截器（错题本同款）：
/// - onRequest 附 Bearer access
/// - 401 自动刷新并重试一次；/login /refresh 自身的 401 不刷新
class AuthInterceptor extends Interceptor {
  final Dio _dio;
  AuthInterceptor(this._dio);

  static const _noRefreshPaths = {'/login', '/refresh'};

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final access = TokenStorage.accessTokenSync;
    if (access != null && access.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $access';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final path = err.requestOptions.path;
    final noRefresh = _noRefreshPaths.any((p) => path.contains(p));
    if (err.response?.statusCode == 401 && !noRefresh && !err.requestOptions.extra.containsKey('authRetried')) {
      final refreshed = await ApiClient.instance.tryRefresh();
      if (refreshed) {
        err.requestOptions.extra['authRetried'] = true;
        final access = TokenStorage.accessTokenSync;
        if (access != null && access.isNotEmpty) {
          err.requestOptions.headers['Authorization'] = 'Bearer $access';
        }
        try {
          final retry = await _dio.fetch(err.requestOptions);
          return handler.resolve(retry);
        } on DioException catch (e) {
          return handler.next(e);
        }
      }
    }
    handler.next(err);
  }
}
