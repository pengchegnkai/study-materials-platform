/// pages/preview_page.dart —— 预览：Markdown 渲染；图片缩放；Excel 表格；Word/PPT 文本提取；其余分享
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:photo_view/photo_view.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:archive/archive.dart';
import 'package:spreadsheet_decoder/spreadsheet_decoder.dart';
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
        return _ExcelViewer(bytes: bytes);
      case 'docx':
        return _DocxViewer(bytes: bytes);
      case 'pptx':
        return _PptxViewer(bytes: bytes);
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


// ---------- Excel 表格预览 ----------
class _ExcelViewer extends StatefulWidget {
  final Uint8List bytes;
  const _ExcelViewer({required this.bytes});

  @override
  State<_ExcelViewer> createState() => _ExcelViewerState();
}

class _ExcelViewerState extends State<_ExcelViewer> {
  late final Future<List<({String name, List<List<String>> rows})>> _sheets;

  @override
  void initState() {
    super.initState();
    _sheets = Future(() {
      try {
        final decoder = SpreadsheetDecoder.decodeBytes(widget.bytes);
        final out = <({String name, List<List<String>> rows})>[];
        for (final name in decoder.tables.keys) {
          final rows = decoder.tables[name]!.rows;
          // 大表限制 300 行，避免卡顿
          final limited = rows.take(300).map((r) => r.map((c) => c?.toString() ?? '').toList()).toList();
          out.add((name: name, rows: limited));
        }
        return out;
      } catch (e) {
        throw Exception('表格解析失败：$e');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<({String name, List<List<String>> rows})>>(
      future: _sheets,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('${snap.error}'.replaceFirst('Exception: ', ''), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13))));
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final sheets = snap.data!;
        if (sheets.isEmpty) return const Center(child: Text('空表格', style: TextStyle(color: Color(0xFF6B7280))));
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final sheet in sheets) ...[
              Text(sheet.name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Card(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columnSpacing: 24,
                    columns: [
                      for (var c = 0; c < _colCount(sheet.rows); c++)
                        DataColumn(label: Text('列${c + 1}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
                    ],
                    rows: [
                      for (final row in sheet.rows)
                        DataRow(cells: [
                          for (final cell in row) DataCell(SizedBox(width: 110, child: Text(cell, style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis))),
                        ]),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
            Text('超过 300 行的部分已省略', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
          ],
        );
      },
    );
  }

  int _colCount(List<List<String>> rows) {
    var max = 0;
    for (final r in rows) {
      if (r.length > max) max = r.length;
    }
    return max;
  }
}

// ---------- Word (docx) 文本预览 ----------
class _DocxViewer extends StatefulWidget {
  final Uint8List bytes;
  const _DocxViewer({required this.bytes});

  @override
  State<_DocxViewer> createState() => _DocxViewerState();
}

class _DocxViewerState extends State<_DocxViewer> {
  late final Future<String> _text;

  @override
  void initState() {
    super.initState();
    _text = Future(() {
      try {
        final archive = ZipDecoder().decodeBytes(widget.bytes);
        final doc = archive.findFile('word/document.xml');
        if (doc == null) throw Exception('不是有效的 Word 文档');
        final xml = utf8.decode(doc.content, allowMalformed: true);
        // 按段落 <w:p> 切分，段内拼接 <w:t> 文本
        final buf = <String>[];
        final bodyStart = xml.indexOf('<w:body>');
        final src = bodyStart >= 0 ? xml.substring(bodyStart) : xml;
        for (final m in RegExp(r'<w:p[ >].*?</w:p>|<w:p[ >][^>]*/>', dotAll: true).allMatches(src)) {
          final seg = m.group(0)!;
          final text = RegExp(r'<w:t[^>]*>(.*?)</w:t>', dotAll: true).allMatches(seg).map((t) => t.group(1) ?? '').join();
          buf.add(_xmlUnescape(text));
        }
        if (buf.isEmpty) buf.add(_xmlUnescape(xml.replaceAll(RegExp(r'<[^>]+>'), '')));
        return buf.join('\n');
      } catch (e) {
        throw Exception('Word 解析失败：$e');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String>(
      future: _text,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('${snap.error}'.replaceFirst('Exception: ', ''), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13))));
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final lines = snap.data!.split('\n');
        return ListView.builder(
          padding: const EdgeInsets.all(20),
          itemCount: lines.length,
          itemBuilder: (_, i) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(lines[i], style: const TextStyle(fontSize: 14, height: 1.5)),
          ),
        );
      },
    );
  }
}

// ---------- PPT (pptx) 幻灯片文本预览 ----------
class _PptxViewer extends StatefulWidget {
  final Uint8List bytes;
  const _PptxViewer({required this.bytes});

  @override
  State<_PptxViewer> createState() => _PptxViewerState();
}

class _PptxViewerState extends State<_PptxViewer> {
  late final Future<List<({int no, String text})>> _slides;

  @override
  void initState() {
    super.initState();
    _slides = Future(() {
      try {
        final archive = ZipDecoder().decodeBytes(widget.bytes);
        final slides = archive.files
            .where((f) => RegExp(r'ppt/slides/slide\d+\.xml$').hasMatch(f.name))
            .toList()
          ..sort((a, b) {
            int n(String s) => int.parse(RegExp(r'slide(\d+)\.xml').firstMatch(s)!.group(1)!);
            return n(a.name).compareTo(n(b.name));
          });
        if (slides.isEmpty) throw Exception('不是有效的 PPT 文档');
        return slides.map((f) {
          final xml = utf8.decode(f.content as List<int>, allowMalformed: true);
          final text = RegExp(r'<a:t>(.*?)</a:t>', dotAll: true).allMatches(xml).map((m) => _xmlUnescape(m.group(1) ?? '')).where((t) => t.trim().isNotEmpty).join('\n');
          final no = int.parse(RegExp(r'slide(\d+)\.xml').firstMatch(f.name)!.group(1)!);
          return (no: no, text: text.isEmpty ? '（空白页）' : text);
        }).toList();
      } catch (e) {
        throw Exception('PPT 解析失败：$e');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<({int no, String text})>>(
      future: _slides,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('${snap.error}'.replaceFirst('Exception: ', ''), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13))));
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final slides = snap.data!;
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: slides.length,
          itemBuilder: (_, i) {
            final s = slides[i];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('第 ${s.no} 页', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.primary)),
                  const SizedBox(height: 8),
                  Text(s.text, style: const TextStyle(fontSize: 14, height: 1.5)),
                ]),
              ),
            );
          },
        );
      },
    );
  }
}

String _xmlUnescape(String s) {
  return s
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'")
      .replaceAll('&amp;', '&');
}
