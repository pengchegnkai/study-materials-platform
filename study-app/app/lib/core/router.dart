/// core/router.dart —— go_router 路由：登录页为入口，服务器地址在登录页右上角设置
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../pages/login_page.dart';
import '../pages/home_page.dart';
import '../pages/subject_page.dart';
import '../pages/preview_page.dart';
import '../pages/teacher_page.dart';
import '../pages/server_config_page.dart';
import '../pages/admin_page.dart';
import '../pages/change_password_page.dart';
import '../pages/profile_page.dart';

final router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
    GoRoute(path: '/server-config', builder: (_, __) => const ServerConfigPage()),
    GoRoute(path: '/', builder: (_, __) => const HomePage()),
    GoRoute(path: '/subject/:slug', builder: (_, s) => SubjectPage(slug: s.pathParameters['slug']!)),
    GoRoute(
      path: '/preview',
      builder: (_, s) => PreviewPage(
        fileKey: s.uri.queryParameters['key'] ?? '',
        title: s.uri.queryParameters['title'] ?? '预览',
        type: s.uri.queryParameters['type'] ?? 'other',
      ),
    ),
    GoRoute(path: '/teacher', builder: (_, __) => const TeacherPage()),
    GoRoute(path: '/admin', builder: (_, __) => const AdminPage()),
    GoRoute(path: '/change-password', builder: (_, __) => const ChangePasswordPage()),
    GoRoute(path: '/profile', builder: (_, __) => const ProfilePage()),
  ],
);
