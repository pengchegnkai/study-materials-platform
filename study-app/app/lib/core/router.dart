/// core/router.dart —— go_router 路由：splash/login/home/subject/preview/teacher
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../pages/splash_page.dart';
import '../pages/login_page.dart';
import '../pages/home_page.dart';
import '../pages/subject_page.dart';
import '../pages/preview_page.dart';
import '../pages/teacher_page.dart';
import '../pages/server_config_page.dart';

final router = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashPage()),
    GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
    GoRoute(path: '/server-config', builder: (_, __) => const ServerConfigPage()),
    GoRoute(path: '/', builder: (_, __) => const HomePage()),
    GoRoute(path: '/subject/:slug', builder: (_, s) => SubjectPage(slug: s.pathParameters['slug']!)),
    GoRoute(
      path: '/preview',
      builder: (_, s) => PreviewPage(
        key: s.queryParameters.containsKey('k') ? const ValueKey('') : null,
        fileKey: s.uri.queryParameters['key'] ?? '',
        title: s.uri.queryParameters['title'] ?? '预览',
        type: s.uri.queryParameters['type'] ?? 'other',
      ),
    ),
    GoRoute(path: '/teacher', builder: (_, __) => const TeacherPage()),
  ],
);
