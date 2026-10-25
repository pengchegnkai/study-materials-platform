/// providers/admin_provider.dart —— 管理员相关状态与 API（对齐 server.mjs 实际端点）
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../services/platform_service.dart';

final adminDashboardProvider = FutureProvider<AdminDashboard>((ref) async {
  final dio = ApiClient().dio;
  final resp = await dio.get('/admin/dashboard');
  return AdminDashboard.fromJson(resp.data as Map<String, dynamic>);
});

/// 管理端文件列表：复用 /manifest（管理员可见全部并可管理）
final adminFilesProvider = FutureProvider<List<AdminFile>>((ref) async {
  final all = await PlatformService().manifest();
  return all
      .map((f) => AdminFile(
            key: f.key,
            title: f.title,
            size: f.size ?? 0,
            visibility: f.visibility,
            uploadedAt: f.uploadedAt,
            uploaderUsername: f.uploader,
            contentType: f.type,
            subject: f.subject ?? '',
            subjectSlug: f.subjectSlug ?? '',
            dir: f.dir,
          ))
      .toList();
});

final adminUsersProvider = FutureProvider<List<AdminUser>>((ref) async {
  final dio = ApiClient().dio;
  final resp = await dio.get('/admin/users');
  return (resp.data['users'] as List)
      .map((e) => AdminUser.fromJson(e as Map<String, dynamic>))
      .toList();
});

final adminSubjectsProvider = FutureProvider<List<AdminSubject>>((ref) async {
  final dio = ApiClient().dio;
  final resp = await dio.get('/admin/subjects');
  return (resp.data['subjects'] as List)
      .map((e) => AdminSubject.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// 角色 id 列表（用于用户管理下拉）
final adminRolesProvider = FutureProvider<List<({String id, String name})>>((ref) async {
  return const [
    (id: 'role-admin', name: '管理员'),
    (id: 'role-teacher', name: '老师'),
    (id: 'role-student', name: '学生'),
  ];
});

/// 全部虚拟文件夹（文件管理导航用）
final adminFoldersProvider = FutureProvider<List<String>>((ref) async {
  return PlatformService().folders();
});

final adminProvider = Provider<AdminNotifier>((ref) => AdminNotifier(ref));

class AdminNotifier {
  final Ref ref;
  AdminNotifier(this.ref);

  Dio get _dio => ApiClient().dio;

  // ---------- 文件 ----------
  Future<void> deleteFile(String key) async {
    await PlatformService().deleteFile(key);
    ref.invalidate(adminFilesProvider);
    ref.invalidate(adminDashboardProvider);
  }

  Future<void> toggleFileVisibility(String key, String newVisibility) async {
    await PlatformService().updateFile(key: key, visibility: newVisibility);
    ref.invalidate(adminFilesProvider);
  }

  Future<void> renameFile(String key, String newTitle) async {
    await PlatformService().updateFile(key: key, title: newTitle);
    ref.invalidate(adminFilesProvider);
  }

  // ---------- 用户 ----------
  Future<void> deleteUser(String id) async {
    await _dio.delete('/admin/user', queryParameters: {'id': id});
    ref.invalidate(adminUsersProvider);
    ref.invalidate(adminDashboardProvider);
  }

  Future<void> updateUser(
    String id, {
    String? status,
    String? password,
    List<String>? roleIds,
    List<String>? subjectIds,
  }) async {
    await _dio.patch('/admin/user', data: {
      'id': id,
      if (status != null) 'status': status,
      if (password != null) 'password': password,
      if (roleIds != null) 'roleIds': roleIds,
      if (subjectIds != null) 'subjectIds': subjectIds,
    });
    ref.invalidate(adminUsersProvider);
  }

  // ---------- 文件夹 ----------
  Future<void> createFolder(String path) async {
    await PlatformService().createFolder(path: path);
    ref.invalidate(adminFoldersProvider);
  }

  // ---------- 科目 ----------
  Future<void> createSubject(String name, int sortOrder) async {
    await _dio.post('/admin/subjects', data: {'name': name, 'sortOrder': sortOrder});
    ref.invalidate(adminSubjectsProvider);
    ref.invalidate(adminDashboardProvider);
  }

  Future<void> updateSubject(String id, {String? name, int? sortOrder}) async {
    await _dio.patch('/admin/subjects', data: {
      'id': id,
      if (name != null) 'name': name,
      if (sortOrder != null) 'sortOrder': sortOrder,
    });
    ref.invalidate(adminSubjectsProvider);
  }

  Future<void> deleteSubject(String id) async {
    await _dio.delete('/admin/subjects', queryParameters: {'id': id});
    ref.invalidate(adminSubjectsProvider);
    ref.invalidate(adminDashboardProvider);
  }
}
