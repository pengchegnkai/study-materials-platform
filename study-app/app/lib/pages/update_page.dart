/// pages/update_page.dart —— 滚动更新：检查新版本、下载 APK 并调起覆盖安装
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../core/api_client.dart';
import '../utils/format.dart';

class UpdatePage extends ConsumerStatefulWidget {
  const UpdatePage({super.key});

  @override
  ConsumerState<UpdatePage> createState() => _UpdatePageState();
}

class _UpdatePageState extends ConsumerState<UpdatePage> {
  String _localVersion = '—';
  int _localBuild = 0;

  ({String version, int build, int size, String builtAt, String download, bool ready, bool syncing})? _latest;
  bool _checking = true;
  String? _error;

  bool _downloading = false;
  double _progress = 0;
  String? _savedPath;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final info = await PackageInfo.fromPlatform();
    if (mounted) {
      setState(() {
        _localVersion = info.version;
        _localBuild = int.tryParse(info.buildNumber) ?? 0;
      });
    }
    await _check();
  }

  Future<void> _check() async {
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      final resp = await ApiClient().dio.get('/app/latest', options: Options(receiveTimeout: const Duration(seconds: 25)));
      final d = resp.data as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _latest = (
          version: '${d['version'] ?? ''}',
          build: (d['build'] as num?)?.toInt() ?? 0,
          size: (d['size'] as num?)?.toInt() ?? 0,
          builtAt: '${d['builtAt'] ?? ''}',
          download: '${d['download'] ?? ''}',
          ready: d['ready'] == true,
          syncing: d['syncing'] == true,
        );
        _checking = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e'.replaceFirst('Exception: ', '');
        _checking = false;
      });
    }
  }

  /// 远端构建号 > 本地构建号 或 版本文本不同 → 有新版本
  bool get _hasUpdate {
    final l = _latest;
    if (l == null) return false;
    if (l.build > 0 && _localBuild > 0) return l.build > _localBuild;
    return l.version.isNotEmpty && l.version != _localVersion;
  }

  Future<void> _download() async {
    final l = _latest;
    if (l == null || l.download.isEmpty) return;
    // 安装包由服务器分发：未同步完成时提示稍后
    if (!l.ready) {
      _toast(l.syncing ? '新版本正在同步到服务器，请稍后再试' : '安装包暂未就绪，请稍后重新检查');
      return;
    }
    setState(() {
      _downloading = true;
      _progress = 0;
      _error = null;
      _savedPath = null;
    });
    try {
      Directory? target;
      try {
        final ext = await getExternalStorageDirectory();
        if (ext != null) {
          target = Directory('${ext.path}/Download');
          await target.create(recursive: true);
        }
      } catch (_) {}
      target ??= await getApplicationDocumentsDirectory();
      final path = '${target.path}/study-app-${l.version.isEmpty ? 'latest' : l.version}.apk';

      await ApiClient().dio.download(
        l.download,
        path,
        onReceiveProgress: (rec, total) {
          if (total > 0 && mounted) {
            setState(() => _progress = rec / total);
          }
        },
        options: Options(
          receiveTimeout: const Duration(minutes: 10),
          followRedirects: true,
        ),
        deleteOnError: true,
      );
      if (!mounted) return;
      setState(() {
        _downloading = false;
        _savedPath = path;
      });
      // 调起系统安装器（覆盖安装，签名一致时保留数据）
      final result = await OpenFilex.open(path);
      if (!mounted) return;
      if (result.type != ResultType.done) {
        _toast('已下载到 $path，请手动点击安装（需允许安装未知应用）');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _downloading = false;
        _error = '下载失败：${'$e'.replaceFirst('Exception: ', '')}';
      });
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final l = _latest;
    return Scaffold(
      appBar: AppBar(
        title: const Text('检查更新'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '重新检查',
            onPressed: _downloading ? null : _check,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                          ),
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: const Icon(Icons.school_outlined, color: Colors.white, size: 22),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text('班级资料共享',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _kv('当前版本', _localBuild > 0 ? '$_localVersion ($_localBuild)' : _localVersion),
                  if (_latest != null) ...[
                    const SizedBox(height: 6),
                    _kv('最新版本',
                        l!.build > 0 ? '${l.version} (${l.build})' : (l.version.isEmpty ? '未知' : l.version)),
                    if (l.size > 0) ...[
                      const SizedBox(height: 6),
                      _kv('安装包大小', formatSize(l.size)),
                    ],
                    if (l.builtAt.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      _kv('构建时间', l.builtAt.replaceFirst('T', ' ').replaceFirst('Z', '')),
                    ],
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_checking)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(_error!, textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B7280))),
                    const SizedBox(height: 10),
                    OutlinedButton(onPressed: _check, child: const Text('重试')),
                  ],
                ),
              ),
            )
          else if (!_hasUpdate)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Icon(Icons.verified_outlined, color: cs.primary, size: 22),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text('已是最新版本，无需更新',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
              ),
            )
          else
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('发现新版本',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    const Text('下载完成后会自动调起安装，覆盖安装不会丢失登录状态和已有数据。',
                        style: TextStyle(fontSize: 12.5, color: Color(0xFF6B7280), height: 1.5)),
                    const SizedBox(height: 14),
                    if (_downloading) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(value: _progress, minHeight: 8),
                      ),
                      const SizedBox(height: 8),
                      Text('下载中 ${(_progress * 100).toStringAsFixed(0)}%',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                    ] else if (!l!.ready)
                      Row(
                        children: [
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              l.syncing ? '新版本正在同步到服务器，稍候点击「重新检查」' : '安装包暂未就绪，请稍后重新检查',
                              style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B7280)),
                            ),
                          ),
                        ],
                      )
                    else
                      FilledButton.icon(
                        onPressed: _download,
                        icon: const Icon(Icons.system_update_alt, size: 18),
                        label: const Text('立即更新'),
                      ),
                    if (_savedPath != null) ...[
                      const SizedBox(height: 10),
                      Text('已保存：$_savedPath',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => OpenFilex.open(_savedPath!),
                        child: const Text('重新调起安装'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
          const Text(
            '提示：首次更新时系统可能要求「允许安装未知应用」，在弹窗中允许本应用即可；之后更新会自动完成。',
            style: TextStyle(fontSize: 11.5, color: Color(0xFF9CA3AF), height: 1.6),
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 76, child: Text(k, style: const TextStyle(fontSize: 12.5, color: Color(0xFF9CA3AF)))),
        Expanded(
          child: Text(v,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, height: 1.4)),
        ),
      ],
    );
  }
}
