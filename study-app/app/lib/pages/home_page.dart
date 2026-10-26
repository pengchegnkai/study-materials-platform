/// pages/home_page.dart —— 首页：渐变 Hero 横幅（光斑/统计条）+ 科目网格（对齐网页端桌面版）
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
              _HeroBanner(
                subjectCount: list.length,
                fileCount: list.fold<int>(0, (n, s) => n + s.publishedCount),
              ),
              if (list.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(
                      child: Text('暂无科目',
                          style: TextStyle(color: Color(0xFF6B7280)))),
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  padding: EdgeInsets.zero,
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 300,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    childAspectRatio: 2.9,
                  ),
                  itemCount: list.length,
                  itemBuilder: (_, i) => _SubjectCard(list[i]),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 渐变 Hero 横幅：与网页端桌面版一致（渐变底 + 光斑 + 白字 + 统计条）
class _HeroBanner extends StatelessWidget {
  final int subjectCount;
  final int fileCount;
  const _HeroBanner({required this.subjectCount, required this.fileCount});

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.of(context).size.width >= 700;
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF4F46E5), // indigo-600
            Color(0xFF6366F1), // indigo-500
            Color(0xFF7C3AED), // violet-600
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF4F46E5).withOpacity(0.35),
            blurRadius: 40,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Stack(
        children: [
          // 装饰光斑（对应网页 blur 光斑）
          Positioned(
            top: -60,
            right: -40,
            child: IgnorePointer(
              child: Container(
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [
                    Colors.white.withOpacity(0.10),
                    Colors.white.withOpacity(0.0),
                  ]),
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -70,
            left: -30,
            child: IgnorePointer(
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [
                    const Color(0xFFC4B5FD).withOpacity(0.20),
                    const Color(0xFFC4B5FD).withOpacity(0.0),
                  ]),
                ),
              ),
            ),
          ),
          // 内容
          Padding(
            padding: EdgeInsets.fromLTRB(wide ? 40 : 24, wide ? 44 : 32, wide ? 40 : 24, wide ? 44 : 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 玻璃徽章
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white.withOpacity(0.25)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.auto_awesome, size: 13, color: Colors.white),
                      SizedBox(width: 5),
                      Text('班级共享 · 随时查阅',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: Colors.white)),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text('学习资料平台',
                    style: TextStyle(
                        fontSize: wide ? 34 : 26,
                        leadingDistribution: TextLeadingDistribution.even,
                        height: 1.15,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.5,
                        color: Colors.white)),
                const SizedBox(height: 10),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Text(
                    '按科目浏览老师开放的学习资料，支持 Word / PPT / Excel / PDF / Markdown 在线预览',
                    style: TextStyle(
                        fontSize: wide ? 15 : 13.5,
                        height: 1.6,
                        color: Colors.white.withOpacity(0.85)),
                  ),
                ),
                const SizedBox(height: 22),
                // 统计条
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _statChip(Icons.menu_book_outlined, '$subjectCount', ' 个科目'),
                    _statChip(Icons.task_alt_outlined, '$fileCount', ' 份已开放资料'),
                    if (wide) _statChip(Icons.cloud_done_outlined, '', '全天候在线访问', plain: true),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _statChip(IconData icon, String bold, String label, {bool plain = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: Colors.white),
          const SizedBox(width: 6),
          Text.rich(
            TextSpan(
              children: [
                if (bold.isNotEmpty)
                  TextSpan(
                      text: bold,
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                TextSpan(
                    text: label,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.white)),
              ],
            ),
          ),
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

/// 科目卡片：渐变图标块 + 名称 + 胶囊计数 + 右上箭头（网页端同款）
class _SubjectCard extends StatelessWidget {
  final Subject subject;
  const _SubjectCard(this.subject);

  @override
  Widget build(BuildContext context) {
    final colors = _paletteFor(subject.name);
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/subject/${subject.slug}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: colors,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: colors.first.withOpacity(0.25),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.folder_open, size: 19, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(subject.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2.5),
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
                  size: 17,
                  color: Theme.of(context).colorScheme.outlineVariant),
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
