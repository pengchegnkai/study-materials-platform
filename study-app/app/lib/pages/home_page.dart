/// pages/home_page.dart —— 首页：Hero + 科目卡片网格（对齐网页端视觉）
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../components/user_avatar.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../providers/files_provider.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider).value;
    final subjects = ref.watch(subjectsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('班级资料共享'),
        actions: [
          if (auth?.isTeacher == true)
            IconButton(
              icon: const Icon(Icons.upload_file_outlined),
              tooltip: '老师工作台',
              onPressed: () => context.push('/teacher'),
            ),
          if (auth?.isAdmin == true)
            IconButton(
              icon: const Icon(Icons.admin_panel_settings_outlined),
              tooltip: '管理后台',
              onPressed: () => context.push('/admin'),
            ),
          IconButton(
            tooltip: '个人中心',
            onPressed: () => context.push('/profile'),
            icon: const UserAvatar(radius: 14),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: subjects.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorRetry(
            message: '$e'.replaceFirst('Exception: ', ''),
            onRetry: () => ref.invalidate(subjectsProvider)),
        data: (list) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(subjectsProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              const _Hero(),
              if (list.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(
                      child: Text('暂无科目', style: TextStyle(color: Color(0xFF6B7280)))),
                )
              else
                ...list.map((s) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _SubjectCard(s),
                    )),
            ],
          ),
        ),
      ),
    );
  }
}

/// Hero：与网页端一致的「班级共享 · 随时查阅」标签 + 大标题
class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.auto_awesome, size: 13, color: Color(0xFF4F46E5)),
                SizedBox(width: 5),
                Text('班级共享 · 随时查阅',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF4F46E5))),
              ],
            ),
          ),
          const SizedBox(height: 10),
          const Text('学习资料',
              style: TextStyle(
                  fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.4)),
          const SizedBox(height: 4),
          const Text('按科目浏览老师开放的资料，支持 Word / PPT / Excel / PDF 在线预览',
              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.5)),
        ],
      ),
    );
  }
}

/// 科目卡片配色轮换（与网页端 PALETTE 一致）
const List<List<Color>> _palette = [
  [Color(0xFF6366F1), Color(0xFF8B5CF6)],
  [Color(0xFF0EA5E9), Color(0xFF06B6D4)],
  [Color(0xFF10B981), Color(0xFF14B8A6)],
  [Color(0xFFF59E0B), Color(0xFFF97316)],
  [Color(0xFFF43F5E), Color(0xFFEC4899)],
  [Color(0xFF8B5CF6), Color(0xFFD946EF)],
];

List<Color> _paletteFor(String name) {
  var h = 0;
  for (final c in name.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return _palette[h % _palette.length];
}

class _SubjectCard extends StatelessWidget {
  final Subject subject;
  const _SubjectCard(this.subject);

  @override
  Widget build(BuildContext context) {
    final colors = _paletteFor(subject.name);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/subject/${subject.slug}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: colors,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: colors.first.withOpacity(0.28),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.folder_open, size: 21, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(subject.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15.5, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
                      decoration: BoxDecoration(
                        color: Color.alphaBlend(
                            colors.first.withOpacity(0.10), Colors.white),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: colors.first.withOpacity(0.22), width: 0.8),
                      ),
                      child: Text('${subject.publishedCount} 个已开放文件',
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w500,
                              color: colors.first)),
                    ),
                  ],
                ),
              ),
              Icon(Icons.north_east,
                  size: 18, color: Theme.of(context).colorScheme.outlineVariant),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorRetry extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorRetry({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('重试')),
        ],
      ),
    );
  }
}
