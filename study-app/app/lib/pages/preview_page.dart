/// pages/preview_page.dart —— 预览：Markdown 渲染；图片缩放；Excel 表格；Word/PPT 文本提取；其余分享
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:photo_view/photo_view.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'dart:io';
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final resp = await _svc.fileBytes(widget.fileKey);
      setState(() {
        _bytes = Uint8List.fromList(resp.data ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = '$e'.replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
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
        title: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(icon: const Icon(Icons.ios_share), onPressed: _bytes == null ? null : _share),
        ],
      ),
      body: _buildBody(),
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
        final text = utf8.decode(bytes, allowMalformed: true);
        return Markdown(
          data: text,
          selectable: true,
          padding: const EdgeInsets.all(20),
          styleSheet: MarkdownStyleSheet(
            h1: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, height: 1.3),
            h2: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, height: 1.3),
            h3: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.3),
            p: const TextStyle(fontSize: 14, height: 1.6),
            code: const TextStyle(fontSize: 12, backgroundColor: Color(0xFFF3F4F6)),
          ),
        );
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
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: Stack(
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
      ),
    );
  }
}
