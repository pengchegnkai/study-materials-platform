/// services/platform_service.dart —— 平台业务接口：认证 / 科目 / 文件 / 上传 / 管理
import 'dart:io';
import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../core/config.dart';
import '../models/models.dart';
import 'token_storage.dart';

class PlatformService {
  Dio get dio => _dio;
  final Dio _dio = ApiClient().dio;

  void _ensure() => ApiClient().ensureConfigured();

  String _err(DioException e) {
    final resp = e.response;
    if (resp != null) {
      final data = resp.data;
      if (data is Map && data['error'] != null) return data['error'] as String;
      return '请求失败 (${resp.statusCode})';
    }
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return '连接超时，请检查服务器地址与网络';
    }
    return '网络连接失败：无法连接服务器';
  }

  // ---------- 认证 ----------

  Future<SessionUser> login(String username, String password) async {
    _ensure();
    final resp = await _dio.post('/login', data: {'username': username, 'password': password});
    if (resp.statusCode != 200 || resp.data['ok'] != true) {
      throw Exception((resp.data is Map ? resp.data['error'] : null) ?? '登录失败');
    }
    final roles = (resp.data['roles'] as List).cast<String>();
    // 错题本同款：保存 access/refresh token（后续请求走 Bearer 头）
    final access = resp.data['accessToken'];
    final refresh = resp.data['refreshToken'];
    if (access is String && access.isNotEmpty && refresh is String && refresh.isNotEmpty) {
      await TokenStorage.save(access: access, refresh: refresh);
    }
    await ApiClient().saveSession(username: username, roles: roles);
    // 用会话换取完整用户信息
    final me = await _dio.get('/session');
    final user = SessionUser.fromJson((me.data['user'] as Map).cast<String, dynamic>());
    return user;
  }

  Future<void> logout() async {
    _ensure();
    try {
      await _dio.post('/logout', data: {'refreshToken': TokenStorage.refreshTokenSync});
    } catch (_) {}
    await TokenStorage.clear();
    await ApiClient().clearSession();
  }

  Future<SessionUser?> currentSession() async {
    if (!AppConfig.isConfigured) return null;
    _ensure();
    try {
      final resp = await _dio.get('/session');
      return SessionUser.fromJson((resp.data['user'] as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) return null;
      return null;
    }
  }

  // ---------- 科目 ----------

  Future<List<Subject>> subjects({bool mine = false}) async {
    _ensure();
    final resp = await _dio.get('/subjects', queryParameters: {if (mine) 'mine': '1'});
    return (resp.data['subjects'] as List).map((j) => Subject.fromJson(j)).toList();
  }

  // ---------- 个人资料 ----------

  /// 取头像字节（需登录，带 Bearer）
  Future<Response<List<int>>> avatarBytes(String username) async {
    _ensure();
    return _dio.get<List<int>>(
      '/avatar',
      queryParameters: {'u': username},
      options: Options(responseType: ResponseType.bytes),
    );
  }

  Future<String?> uploadAvatar(File file, String filename) async {
    _ensure();
    final form = FormData();
    form.files.add(MapEntry('file', await MultipartFile.fromFile(file.path, filename: filename)));
    final resp = await _dio.post('/me/avatar', data: form);
    return resp.data['avatar'] as String?;
  }

  Future<void> updateNickname(String nickname) async {
    _ensure();
    await _dio.patch('/me/profile', data: {'nickname': nickname});
  }

  // ---------- 文件夹 ----------

  Future<List<String>> folders({String? subjectId, bool mine = false}) async {
    _ensure();
    final resp = await _dio.get('/folders', queryParameters: {
      if (subjectId != null) 'subjectId': subjectId,
      if (mine) 'mine': '1',
    });
    return (resp.data['folders'] as List).cast<String>();
  }

  Future<void> createFolder({String? subjectId, required String path}) async {
    _ensure();
    await _dio.post('/folders', data: {if (subjectId != null) 'subjectId': subjectId, 'path': path});
  }

  /// 删除文件夹（其中文件自动移到上级目录，不丢数据）
  Future<void> deleteFolder(String path) async {
    _ensure();
    await _dio.delete('/folders', queryParameters: {'path': path});
  }

  /// 移动文件夹到目标目录
  Future<void> moveFolder(String path, String targetDir) async {
    _ensure();
    await _dio.post('/folders/move', data: {'folder': path, 'targetDir': targetDir});
  }

  // ---------- 移动/复制 ----------

  Future<void> moveFile(String key, String targetDir) async {
    _ensure();
    await _dio.post('/move', data: {'key': key, 'targetDir': targetDir});
  }

  Future<void> copyFile(String key, String targetDir) async {
    _ensure();
    await _dio.post('/copy', data: {'key': key, 'targetDir': targetDir});
  }

  // ---------- 文件 ----------

  Future<List<FileItem>> manifest() async {
    _ensure();
    final resp = await _dio.get('/manifest');
    return (resp.data['files'] as List).map((j) => FileItem.fromJson(j)).toList();
  }

  /// 取文件字节流（预览用，带 cookie）
  Future<Response<List<int>>> fileBytes(String key) {
    _ensure();
    return _dio.get<List<int>>('/file',
        queryParameters: {'key': key},
        options: Options(responseType: ResponseType.bytes));
  }

  Future<void> updateFile({required String key, String? title, String? visibility}) async {
    _ensure();
    await _dio.patch('/file', data: {'key': key, if (title != null) 'title': title, if (visibility != null) 'visibility': visibility});
  }

  Future<void> deleteFile(String key) async {
    _ensure();
    await _dio.delete('/delete', queryParameters: {'key': key});
  }

  // ---------- 上传 ----------

  Future<UploadResult> upload({
    required File file,
    required String filename,
    required String subjectId,
    required String visibility,
    String dir = '',
    void Function(int sent, int total)? onProgress,
  }) async {
    _ensure();
    try {
      final form = FormData();
      form.files.add(MapEntry('file', await MultipartFile.fromFile(file.path, filename: filename)));
      form.fields.addAll([
        MapEntry('subjectId', subjectId),
        MapEntry('visibility', visibility),
        MapEntry('path', dir),
      ]);
      final resp = await _dio.post(
        '/upload',
        data: form,
        onSendProgress: onProgress,
      );
      return UploadResult(ok: true, key: resp.data['key'] as String?);
    } on DioException catch (e) {
      return UploadResult(ok: false, error: _err(e));
    }
  }

  // ---------- 管理员 ----------

  Future<List<SessionUser>> adminUsers() async {
    _ensure();
    final resp = await _dio.get('/admin/users');
    return (resp.data['users'] as List).map((j) {
      final m = j as Map;
      return SessionUser(
        id: m['id'] as String,
        username: m['username'] as String,
        roles: (m['roles'] as List).cast<String>(),
      );
    }).toList();
  }

  Future<void> adminBatchCreate({
    required List<String> usernames,
    required String roleId,
    required List<String> subjectIds,
  }) async {
    _ensure();
    await _dio.post('/admin/users/batch', data: {
      'users': usernames
          .map((u) => {'username': u, 'roleIds': [roleId], 'subjectIds': subjectIds})
          .toList(),
    });
  }

  Future<void> adminCreateSubject(String name) async {
    _ensure();
    await _dio.post('/admin/subjects', data: {'name': name});
  }

  Future<void> adminDeleteSubject(String id) async {
    _ensure();
    await _dio.delete('/admin/subjects', queryParameters: {'id': id});
  }
}
