/// pages/splash_page.dart —— 启动：恢复配置与会话后分发路由
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/config.dart';
import '../providers/auth_provider.dart';

class SplashPage extends ConsumerWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    auth.whenData((s) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        if (!AppConfig.isConfigured) {
          context.go('/server-config');
        } else if (s.user == null) {
          context.go('/login');
        } else {
          context.go('/');
        }
      });
    });
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
