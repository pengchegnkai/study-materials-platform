/// services/server_discovery_service.dart —— 服务器自动发现（复用错题本框架的扫描方案）
/// App 连不上配置地址（如公网域名被网络阻断）时，自动扫描局域网网段找到服务器并切换。
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:network_info_plus/network_info_plus.dart';

class ServerDiscoveryService {
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 2),
    receiveTimeout: const Duration(seconds: 3),
    validateStatus: (s) => true,
  ));

  /// 扫描本机 Wi-Fi 所在网段的 :8787。识别特征：/api/subjects 返回 401 JSON（未登录的正常响应）。
  /// 返回可用的 baseUrl（http://ip:8787），找不到返回 null。
  Future<String?> discover() async {
    final prefix = await _guessPrefix();
    if (prefix == null) return null;

    final found = <String>[];
    final futures = <Future<void>>[];
    for (var i = 1; i <= 254; i++) {
      final ip = '$prefix.$i';
      futures.add(_probe('http://$ip:8787', found));
    }
    await Future.wait(futures);
    return found.isEmpty ? null : found.first;
  }

  Future<void> _probe(String base, List<String> found) async {
    try {
      final r = await _dio.get('$base/api/subjects');
      // 未登录时我们的服务器返回 401 + {"error":"未登录"}
      if (r.statusCode == 401 && r.data is Map && r.data['error'] == '未登录') {
        found.add(base);
      }
    } catch (_) {}
  }

  Future<String?> _guessPrefix() async {
    try {
      final ip = await NetworkInfo().getWifiIP();
      if (ip != null && ip.isNotEmpty) {
        final parts = ip.split('.');
        if (parts.length == 4) return '${parts[0]}.${parts[1]}.${parts[2]}';
      }
    } catch (_) {}
    return '192.168.3'; // 服务器已知网段兜底
  }

  /// 本机回环兜底：服务器与 App 同机时始终可用
  Future<String?> probeLocalhost() async {
    try {
      final r = await _dio.get('http://127.0.0.1:8787/api/subjects');
      if (r.statusCode == 401 && r.data is Map && r.data['error'] == '未登录') {
        return 'http://127.0.0.1:8787';
      }
    } on SocketException {
      return null;
    } catch (_) {}
    return null;
  }
}
