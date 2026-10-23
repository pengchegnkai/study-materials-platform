/// providers/auth_provider.dart —— 会话状态（当前用户、登录/登出）
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/config.dart';
import '../models/models.dart';
import '../services/platform_service.dart';

class AuthState {
  final SessionUser? user;
  final bool loading;
  final bool configured;
  const AuthState({this.user, this.loading = false, this.configured = false});

  AuthState copyWith({SessionUser? user, bool? loading, bool? configured}) =>
      AuthState(user: user, loading: loading ?? this.loading, configured: configured ?? this.configured);
}

class AuthNotifier extends AsyncNotifier<AuthState> {
  final _svc = PlatformService();

  @override
  Future<AuthState> build() async {
    await AppConfig.load();
    final cached = await ApiClient().cachedSession();
    final user = await _svc.currentSession();
    return AuthState(
      user: user,
      configured: AppConfig.isConfigured,
      loading: false,
    );
  }

  Future<String?> login(String username, String password) async {
    state = const AsyncData(AuthState(loading: true));
    try {
      final user = await _svc.login(username, password);
      state = AsyncData(AuthState(user: user, configured: true));
      return null;
    } catch (e) {
      final cached = await ApiClient().cachedSession();
      state = AsyncData(AuthState(configured: AppConfig.isConfigured, loading: false, user: cached.username != null ? null : null));
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  Future<void> logout() async {
    await _svc.logout();
    state = AsyncData(AuthState(user: null, configured: AppConfig.isConfigured));
  }

  Future<void> reload() async {
    state = const AsyncData(AuthState(loading: true));
    await build();
  }
}

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
