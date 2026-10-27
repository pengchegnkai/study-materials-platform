/// pages/preview_page.dart —— 预览：Markdown 渲染；图片缩放；Excel 表格；Word/PPT 文本提取；其余分享
import 'dart:convert';
import 'package:fast_gbk/fast_gbk.dart';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:photo_view/photo_view.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart' as pdfx;
import 'package:webview_flutter/webview_flutter.dart';
import 'dart:io';
import '../models/models.dart';
import '../services/platform_service.dart';
import '../utils/format.dart';
class PreviewPage extends StatefulWidget {
  final String fileKey;
  final String title;
  final String type;
  const PreviewPage({super.key, required this.fileKey, required this.title, required this.type});

  @override
  State<PreviewPage> createState() => _PreviewPageState();
}

class _PreviewPageState extends State<PreviewPage> {
  final _svc = PlatformService();
  Uint8List? _bytes;
  String? _error;
  bool _loading = true;
  List<FileItem> _manifestFiles = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      // manifest 用于 Markdown 图片引用解析（同目录文件名 → key）
      final manifestResp = await _svc.manifest().catchError((_) => <FileItem>[]);
      if (mounted) setState(() => _manifestFiles = manifestResp);
      final resp = await _svc.fileBytes(widget.fileKey);
      if (!mounted) return;
      setState(() {
        _bytes = Uint8List.fromList(resp.data ?? []);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e'.replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  /// Markdown 图片引用解析（与网页端同规则）：
  /// ① 当前目录 + 相对路径完整 key ② key 以相对路径结尾（子目录引用）
  /// ③ 同目录同名 ④ 全局同名（兜底）；支持 URL 编码、./ 与 ../ 相对路径。
  String? _matchManifestImage(String raw) {
    String decode(String v) {
      try {
        return Uri.decodeComponent(v);
      } catch (_) {
        return v;
      }
    }

    String dirOf(String k) => k.contains('/') ? k.substring(0, k.lastIndexOf('/')) : '';
    String nameOf(String k) => k.split('/').last;

    // 规范化相对路径：解码后处理 ./ 与 ../
    final segs = <String>[];
    for (final part in decode(raw).replaceAll('\\', '/').split('/')) {
      if (part == '..') {
        if (segs.isNotEmpty) segs.removeLast();
      } else if (part != '.' && part.isNotEmpty) {
        segs.add(part);
      }
    }
    final relPath = segs.join('/');
    final baseName = segs.isEmpty ? '' : segs.last;
    if (baseName.isEmpty) return null;

    final keys = _manifestFiles.map((f) => f.key).toList();
    final curDir = widget.fileKey.contains('/')
        ? widget.fileKey.substring(0, widget.fileKey.lastIndexOf('/'))
        : '';

    // 上传时间戳前缀：服务器存储名为 `<毫秒时间戳>-<原文件名>`，
    // 因此 md 引用 `photo/1-1.jpg` 对应实际文件 `photo/1792935624810-1-1.jpg`
    bool sameFile(String kn, String name) =>
        kn == name || (name.isNotEmpty && kn.endsWith('-$name'));

    if (curDir.isNotEmpty) {
      for (final k in keys) {
        if (k == '$curDir/$relPath') return k;
      }
    }
    for (final k in keys) {
      if (k.endsWith('/$relPath')) return k;
    }
    // 优先同科目目录树内匹配（避免跨科目重名错配）
    if (curDir.isNotEmpty) {
      for (final k in keys) {
        if (k.startsWith('$curDir/') && sameFile(nameOf(k), baseName)) return k;
      }
    }
    for (final k in keys) {
      if (sameFile(nameOf(k), baseName) && dirOf(k) == curDir) return k;
    }
    for (final k in keys) {
      if (sameFile(nameOf(k), baseName)) return k;
    }
    return null;
  }

  /// Markdown 图片：外链 http(s) 网络加载，data: 内嵌解码，其余按 manifest 匹配拉字节。
  Widget _mdImage(Uri uri) {
    final src = uri.toString();
    if (src.startsWith('data:')) {
      try {
        final comma = src.indexOf(',');
        if (comma > 0) {
          final meta = src.substring(5, comma); // 如 image/png;base64
          final payload = src.substring(comma + 1);
          final Uint8List bytes = meta.contains('base64')
              ? base64Decode(payload)
              : Uint8List.fromList(latin1.encode(Uri.decodeFull(payload)));
          return ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(bytes, fit: BoxFit.contain),
          );
        }
      } catch (_) {}
      return _imgPlaceholder();
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return Image.network(src, errorBuilder: (_, __, ___) => _imgPlaceholder());
    }
    final hit = _matchManifestImage(src);
    if (hit == null) return _imgPlaceholder();
    return FutureBuilder<Response<List<int>>>(
      future: _svc.fileBytes(hit),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SizedBox(
              width: 120, height: 80, child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
        }
        if (snap.hasError || snap.data?.data == null) return _imgPlaceholder();
        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.memory(
            Uint8List.fromList(snap.data!.data!),
            fit: BoxFit.contain,
          ),
        );
      },
    );
  }

  Widget _imgPlaceholder() => Container(
        width: 120,
        height: 80,
        decoration: BoxDecoration(
          color: const Color(0xFFF3F4F6),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Icon(Icons.broken_image_outlined, color: Color(0xFF9CA3AF)),
      );

  /// 下载：保存到手机下载目录（无外部存储则存应用文档目录）
  Future<void> _download() async {
    final bytes = _bytes;
    if (bytes == null || bytes.isEmpty) {
      _toast('文件尚未加载完成');
      return;
    }
    try {
      final name = widget.fileKey.split('/').last;
      Directory? target;
      try {
        final ext = await getExternalStorageDirectory();
        if (ext != null) {
          target = Directory('${ext.path}/Download');
          await target.create(recursive: true);
        }
      } catch (_) {}
      target ??= await getApplicationDocumentsDirectory();
      final f = File('${target.path}/$name');
      await f.writeAsBytes(bytes, flush: true);
      _toast('已下载到 ${f.path}');
    } catch (e) {
      _toast('下载失败：$e'.replaceFirst('Exception: ', ''));
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _share() async {
    final dir = await getTemporaryDirectory();
    final name = widget.fileKey.split('/').last;
    final f = File('${dir.path}/$name');
    await f.writeAsBytes(_bytes ?? []);
    await Share.shareXFiles([XFile(f.path)], text: widget.title);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            // 类型标签（网页端同款彩色胶囊）
            Flexible(
              child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(width: 8),
            _typeBadge(),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.download_outlined),
            tooltip: '下载到本地',
            onPressed: _bytes == null ? null : _download,
          ),
          IconButton(icon: const Icon(Icons.ios_share), onPressed: _bytes == null ? null : _share),
        ],
      ),
      body: _buildBody(),
    );
  }

  /// 文件类型彩色胶囊（网页端 Badge 同款配色）
  Widget _typeBadge() {
    final ext = widget.fileKey.split('.').last.toLowerCase();
    final type = widget.type.toLowerCase();
    String label;
    Color bg, fg;
    if (type == 'pdf' || ext == 'pdf') {
      label = 'PDF'; bg = const Color(0xFFFEF2F2); fg = const Color(0xFFDC2626);
    } else if (type == 'docx' || ['doc', 'docx'].contains(ext)) {
      label = 'WORD'; bg = const Color(0xFFEFF6FF); fg = const Color(0xFF2563EB);
    } else if (type == 'pptx' || ['ppt', 'pptx'].contains(ext)) {
      label = 'PPT'; bg = const Color(0xFFFFF7ED); fg = const Color(0xFFEA580C);
    } else if (type == 'image' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].contains(ext)) {
      label = '图片'; bg = const Color(0xFFFAF5FF); fg = const Color(0xFF9333EA);
    } else if (type == 'markdown' || ['md', 'markdown'].contains(ext)) {
      label = 'MD'; bg = const Color(0xFFEEF2FF); fg = const Color(0xFF4F46E5);
    } else {
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: fg, letterSpacing: 0.3)),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
        ),
      );
    }
    final bytes = _bytes!;
    switch (widget.type) {
      case 'image':
        return PhotoView(imageProvider: MemoryImage(bytes), backgroundDecoration: const BoxDecoration(color: Color(0xFF111827)));
      case 'markdown':
        // UTF-8 优先；出现替换符（乱码）则按 GBK 回退解码（国内常见 GBK 编码 md/txt）
        var text = utf8.decode(bytes, allowMalformed: true);
        if (text.contains('\uFFFD')) {
          try {
            final gbk = const GbkCodec(allowMalformed: true).decode(bytes);
            if (!gbk.contains('\uFFFD')) text = gbk;
          } catch (_) {}
        }
        return Markdown(
          data: text,
          selectable: true,
          imageBuilder: (uri, title, alt) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: _mdImage(uri),
          ),
          padding: const EdgeInsets.all(20),
          styleSheet: MarkdownStyleSheet(
            h1: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, height: 1.3),
            h2: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, height: 1.3),
            h3: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.3),
            p: const TextStyle(fontSize: 14, height: 1.6),
            code: const TextStyle(fontSize: 12, backgroundColor: Color(0xFFF3F4F6)),
          ),
        );
      case 'pdf':
        return _PdfViewer(bytes: bytes);
      case 'excel':
      case 'docx':
      case 'pptx':
        return OfficePreviewPage(kind: widget.type, bytes: bytes, title: widget.title);
      default:
        // PPT/Word 等：提示通过分享/用其他应用打开
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.insert_drive_file_outlined, size: 40, color: Color(0xFF9CA3AF)),
              const SizedBox(height: 12),
              Text('该类型（${widget.type}）暂不支持应用内预览',
                  style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
              Text(formatSize(bytes.length),
                  style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _share,
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('用其他应用打开'),
              ),
            ],
          ),
        );
    }
  }
}

// ---------- PDF 原生渲染 ----------
class _PdfViewer extends StatefulWidget {
  final Uint8List bytes;
  const _PdfViewer({required this.bytes});

  @override
  State<_PdfViewer> createState() => _PdfViewerState();
}

class _PdfViewerState extends State<_PdfViewer> {
  pdfx.PdfController? _controller;
  String? _error;

  @override
  void initState() {
    super.initState();
    try {
      _controller = pdfx.PdfController(document: pdfx.PdfDocument.openData(widget.bytes));
    } catch (e) {
      _error = 'PDF 打开失败：$e';
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13))));
    }
    final c = _controller;
    if (c == null) return const Center(child: CircularProgressIndicator());
    return Column(
      children: [
        Expanded(
          child: pdfx.PdfView(
            controller: c,
            onDocumentError: (e) => setState(() => _error = '$e'),
          ),
        ),
        SafeArea(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: pdfx.PdfPageNumber(
              controller: c,
              builder: (_, state, loading, pagesCount) => Text(
                '${state ?? 1} / $pagesCount',
                style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ---------- Office 完整渲染（WebView 加载网页端同款 JS 渲染库） ----------
class OfficePreviewPage extends StatefulWidget {
  final String kind; // docx / pptx / excel
  final Uint8List bytes;
  final String title;
  const OfficePreviewPage({super.key, required this.kind, required this.bytes, required this.title});

  @override
  State<OfficePreviewPage> createState() => _OfficePreviewPageState();
}

class _OfficePreviewPageState extends State<OfficePreviewPage> {
  late final PlatformWebViewControllerCreationParams _params;
  WebViewController? _controller;
  bool _pageLoaded = false;
  bool _injected = false;
  String? _jsError;

  @override
  void initState() {
    super.initState();
    _params = const PlatformWebViewControllerCreationParams();
    final controller = WebViewController.fromPlatformCreationParams(_params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) async {
          setState(() => _pageLoaded = true);
          try {
            final b64 = base64Encode(widget.bytes);
            await _controller?.runJavaScript(
              "renderFile(" + const JsonEncoder().convert(widget.kind) + ", " + const JsonEncoder().convert(b64) + ");",
            );
            if (mounted) setState(() => _injected = true);
          } catch (e) {
            if (mounted) setState(() => _jsError = '数据注入失败：$e');
          }
        },
      ));
    controller.loadFlutterAsset('assets/office/preview.html');
    _controller = controller;
  }

  @override
  Widget build(BuildContext context) {
    // 作为 PreviewPage 的 body 嵌入，不包 Scaffold/AppBar（避免双标题栏）
    return Stack(
      children: [
        WebViewWidget(controller: _controller!),
        if (!_pageLoaded || !_injected)
          Container(
            color: Colors.white,
            child: Center(
              child: _jsError != null
                  ? Padding(padding: const EdgeInsets.all(24), child: Text(_jsError!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13)))
                  : Column(mainAxisSize: MainAxisSize.min, children: const [
                      CircularProgressIndicator(),
                      SizedBox(height: 16),
                      Text('正在渲染文档…', style: TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
                    ]),
            ),
          ),
      ],
    );
  }
}
