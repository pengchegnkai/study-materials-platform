/// providers/auth_provider.dart —— 会话状态（当前用户、登录/登出）
/// 不做启动时的初始化检测：登录状态只由用户主动登录建立，避免启动即发网络请求。
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/config.dart';
import '../models/models.dart';
import '../services/platform_service.dart';

class AuthState {
  final SessionUser? user;
  final bool loading;
  final bool configured;
  bool get isAdmin => user?.isAdmin == true;
  bool get isTeacher => user?.isTeacher == true;
  const AuthState({this.user, this.loading = false, this.configured = false});

  AuthState copyWith({SessionUser? user, bool? loading, bool? configured}) =>
      AuthState(user: user, loading: loading ?? this.loading, configured: configured ?? this.configured);
}

class AuthNotifier extends AsyncNotifier<AuthState> {
  final _svc = PlatformService();

  /// 启动时只读本地配置，不发起任何网络请求
  @override
  Future<AuthState> build() async {
    await AppConfig.load();
    return AuthState(user: null, configured: AppConfig.isConfigured, loading: false);
  }

  Future<String?> login(String username, String password) async {
    state = const AsyncData(AuthState(loading: true));
    try {
      final user = await _svc.login(username, password);
      state = AsyncData(AuthState(user: user, configured: true));
      return null;
    } catch (e) {
      state = AsyncData(AuthState(user: null, configured: AppConfig.isConfigured, loading: false));
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  Future<void> logout() async {
    await _svc.logout();
    state = AsyncData(AuthState(user: null, configured: AppConfig.isConfigured));
  }
}

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
