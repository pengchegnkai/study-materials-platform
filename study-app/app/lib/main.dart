/// main.dart —— 入口：初始化配置/会话后进入 MaterialApp.router
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dynamic_color/dynamic_color.dart';
import 'core/api_client.dart';
import 'core/config.dart';
import 'core/router.dart';
import 'core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.load();
  await ApiClient().init(); // 提前初始化 Cookie 持久化
  ApiClient().applyProxy(AppConfig.proxy); // 恢复代理配置
  runApp(const ProviderScope(child: StudyApp()));
}

class StudyApp extends StatelessWidget {
  const StudyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return DynamicColorBuilder(
      builder: (lightDynamic, darkDynamic) => MaterialApp.router(
        title: '学习资料',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        routerConfig: router,
      ),
    );
  }
}
